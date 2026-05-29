"""CapSolver client — solve CAPTCHA (reCAPTCHA v2/v3, Cloudflare Turnstile, hCaptcha).

API docs: https://docs.capsolver.com

Cách dùng:
    from app.services.captcha.capsolver import CapSolver
    cs = CapSolver(proxy_url="http://user:pass@host:port")  # gắn proxy → solver giải qua cùng IP
    token = await cs.solve_recaptcha_v2(url, sitekey)
    # → inject token vào page.evaluate(...) để bypass
"""
from __future__ import annotations
import asyncio
import re
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

import httpx

from app.core.config import settings
from app.core.logger import get_logger

log = get_logger("captcha.capsolver")

BASE_URL = "https://api.capsolver.com"

# Error codes có thể retry an toàn (transient).
# Nguồn: https://docs.capsolver.com/en/guide/api-error/
_RETRYABLE_ERRORS = frozenset({
    "ERROR_SERVICE_UNAVALIABLE",
    "ERROR_RATE_LIMIT",
    "ERROR_CAPTCHA_UNSOLVABLE",  # No deduction — có thể retry
    "ERROR_KEY_TEMP_BLOCKED",  # 5 phút unlock
    "ERROR_BAD_REQUEST",  # đôi khi do server load
})

# Task type có proxy-variant: khi gắn proxy sẽ swap "TaskProxyLess" → "Task" và merge proxy fields.
# Turnstile chỉ dùng ProxyLess theo khuyến nghị Capsolver (server-side handled).
_PROXY_AWARE_TYPES = {
    "ReCaptchaV2TaskProxyLess",
    "ReCaptchaV3TaskProxyLess",
    "ReCaptchaV2EnterpriseTaskProxyLess",
    "ReCaptchaV3EnterpriseTaskProxyLess",
    "HCaptchaTaskProxyLess",
    "HCaptchaEnterpriseTaskProxyLess",
    "FunCaptchaTaskProxyLess",
    "AntiAwsWafTaskProxyLess",
    "MtCaptchaTaskProxyLess",
}

# CapSolver chỉ chấp nhận danh sách UA cố định cho DataDome.
_DATADOME_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36",
)


def _proxy_url_to_capsolver_format(url: str) -> str:
    """`http://user:pass@host:port` → `host:port:user:pass` (format CapSolver yêu cầu cho DataDome)."""
    fields = _parse_proxy_url(url) or {}
    host = fields.get("proxyAddress")
    port = fields.get("proxyPort")
    if not host or not port:
        return ""
    base = f"{host}:{port}"
    login = fields.get("proxyLogin")
    password = fields.get("proxyPassword")
    if login and password:
        return f"{base}:{login}:{password}"
    return base


def _parse_proxy_url(url: str) -> Optional[Dict[str, Any]]:
    """Parse `scheme://user:pass@host:port` → dict các field Capsolver yêu cầu.

    Trả None nếu URL trống / không hợp lệ.
    """
    url = (url or "").strip()
    if not url:
        return None
    try:
        u = urlparse(url if "://" in url else f"http://{url}")
        scheme = (u.scheme or "http").lower()
        if scheme not in ("http", "https", "socks5", "socks5h"):
            scheme = "http"
        if not u.hostname or not u.port:
            return None
        fields: Dict[str, Any] = {
            "proxyType": "socks5" if scheme.startswith("socks5") else scheme,
            "proxyAddress": u.hostname,
            "proxyPort": int(u.port),
        }
        if u.username:
            fields["proxyLogin"] = u.username
        if u.password:
            fields["proxyPassword"] = u.password
        return fields
    except Exception as e:
        log.warning("parse_proxy_url failed for %r: %s", url, e)
        return None


class CapSolverError(RuntimeError):
    pass


class CapSolver:
    """Async wrapper cho CapSolver REST API.

    Flow:
        1. POST /createTask → taskId
        2. Poll POST /getTaskResult → status: processing/ready
        3. Trả về token (gRecaptchaResponse / token)
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        poll_interval: float = 3.0,
        max_wait: float = 120.0,
        proxy_url: Optional[str] = None,
        app_id: Optional[str] = None,
        max_retries: int = 0,
        retry_backoff: float = 2.0,
        callback_url: Optional[str] = None,
    ):
        self.api_key = api_key or settings.capsolver_api_key
        self.poll_interval = poll_interval
        self.max_wait = max_wait
        self.proxy_url = (proxy_url or "").strip() or None
        self._proxy_fields = _parse_proxy_url(self.proxy_url) if self.proxy_url else None
        # `appId` — dev revenue share (nếu chuyển token cho user khác qua SDK).
        self.app_id = (app_id or getattr(settings, "capsolver_app_id", "") or "").strip() or None
        # Auto-retry trên transient errors (`_RETRYABLE_ERRORS`). Default 0 = không retry.
        self.max_retries = max(0, int(max_retries))
        self.retry_backoff = max(0.0, float(retry_backoff))
        # `callbackUrl` — CapSolver POST solution về endpoint này khi task xong
        # (webhook mode, không cần poll). Server của bạn nhận `{taskId, solution, ...}`.
        self.callback_url = (callback_url or "").strip() or None
        if not self.api_key:
            log.warning("CAPSOLVER_API_KEY chưa set — captcha solving disabled")
        if self.proxy_url and not self._proxy_fields:
            log.warning("CapSolver proxy_url không parse được, fallback proxyless: %r", self.proxy_url)
        elif self._proxy_fields:
            log.info(
                "CapSolver bound proxy %s://%s:%s",
                self._proxy_fields["proxyType"],
                self._proxy_fields["proxyAddress"],
                self._proxy_fields["proxyPort"],
            )

    @property
    def enabled(self) -> bool:
        return bool(self.api_key)

    def _apply_proxy(self, task: Dict[str, Any]) -> Dict[str, Any]:
        """Nếu có proxy + task type hỗ trợ proxy variant → swap + merge fields."""
        if not self._proxy_fields:
            return task
        ttype = task.get("type", "")
        if ttype in _PROXY_AWARE_TYPES:
            task = {**task, "type": ttype.replace("TaskProxyLess", "Task"), **self._proxy_fields}
        elif ttype == "AntiCloudflareTask":
            task = {**task, **self._proxy_fields}
        return task

    async def _create_task(self, task: Dict[str, Any]) -> str:
        if not self.api_key:
            raise CapSolverError("CAPSOLVER_API_KEY missing")
        task = self._apply_proxy(task)
        payload: Dict[str, Any] = {"clientKey": self.api_key, "task": task}
        if self.app_id:
            payload["appId"] = self.app_id
        if self.callback_url:
            payload["callbackUrl"] = self.callback_url
        async with httpx.AsyncClient(timeout=30.0) as client:
            r = await client.post(f"{BASE_URL}/createTask", json=payload)
            try:
                data = r.json()
            except Exception:
                r.raise_for_status()
                raise CapSolverError(f"createTask non-JSON response: {r.text[:300]}")
        if data.get("errorId"):
            raise CapSolverError(
                f"createTask {data.get('errorCode') or ''}: {data.get('errorDescription')}"
            )
        task_id = data.get("taskId")
        if not task_id:
            raise CapSolverError(f"createTask no taskId: {data}")
        log.info("CapSolver task created: %s (%s, proxied=%s)", task_id, task.get("type"), bool(self._proxy_fields))
        return task_id

    async def _wait_result(self, task_id: str) -> Dict[str, Any]:
        elapsed = 0.0
        async with httpx.AsyncClient(timeout=30.0) as client:
            while elapsed < self.max_wait:
                await asyncio.sleep(self.poll_interval)
                elapsed += self.poll_interval
                r = await client.post(
                    f"{BASE_URL}/getTaskResult",
                    json={"clientKey": self.api_key, "taskId": task_id},
                )
                try:
                    data = r.json()
                except Exception:
                    r.raise_for_status()
                    raise CapSolverError(f"getTaskResult non-JSON response: {r.text[:300]}")
                if data.get("errorId"):
                    raise CapSolverError(
                        f"getTaskResult {data.get('errorCode') or ''}: {data.get('errorDescription')}"
                    )
                status = data.get("status")
                if status == "ready":
                    log.info("CapSolver task %s done in %.1fs", task_id, elapsed)
                    return data.get("solution") or {}
        raise CapSolverError(f"Timeout {self.max_wait}s chờ task {task_id}")

    async def solve(self, task: Dict[str, Any]) -> Dict[str, Any]:
        """Generic solver — truyền raw task dict, trả về solution dict.

        Nếu `max_retries > 0`, tự động retry khi gặp lỗi transient
        (`_RETRYABLE_ERRORS`) với exponential backoff.
        """
        attempt = 0
        while True:
            try:
                task_id = await self._create_task(task)
                return await self._wait_result(task_id)
            except CapSolverError as e:
                msg = str(e)
                retryable = any(code in msg for code in _RETRYABLE_ERRORS)
                if not retryable or attempt >= self.max_retries:
                    raise
                wait = self.retry_backoff * (2 ** attempt)
                log.warning("CapSolver retry %d/%d after %.1fs: %s", attempt + 1, self.max_retries, wait, msg)
                await asyncio.sleep(wait)
                attempt += 1

    async def _get_token(self, task: Dict[str, Any]) -> Dict[str, Any]:
        """Endpoint `getToken` — trả solution NGAY trong 1 round-trip.

        Chỉ hỗ trợ reCAPTCHA v2/v3 (+ Enterprise / + Proxyless). Dùng khi muốn
        bỏ qua pattern poll `createTask` → `getTaskResult` để giảm latency.
        """
        if not self.api_key:
            raise CapSolverError("CAPSOLVER_API_KEY missing")
        payload: Dict[str, Any] = {"clientKey": self.api_key, "task": task}
        if self.app_id:
            payload["appId"] = self.app_id
        if self.callback_url:
            payload["callbackUrl"] = self.callback_url
        async with httpx.AsyncClient(timeout=120.0) as client:
            r = await client.post(f"{BASE_URL}/getToken", json=payload)
            try:
                data = r.json()
            except Exception:
                r.raise_for_status()
                raise CapSolverError(f"getToken non-JSON: {r.text[:300]}")
        if data.get("errorId"):
            raise CapSolverError(
                f"getToken {data.get('errorCode') or ''}: {data.get('errorDescription')}"
            )
        return data.get("solution") or {}

    async def solve_recaptcha_v2(
        self,
        url: str,
        sitekey: str,
        invisible: bool = False,
        cookies: Optional[list] = None,
        use_get_token: bool = False,
        page_action: str = "",
        recaptcha_data_s_value: str = "",
        is_session: bool = False,
        enterprise_payload: Optional[Dict[str, Any]] = None,
        api_domain: str = "",
    ) -> str:
        """Solve reCAPTCHA v2 → trả `g-recaptcha-response` token.

        - `cookies`: list `[{"name":..,"value":..}]` — warm session, dùng cho site lock theo session.
        - `use_get_token=True`: dùng endpoint `getToken` (sync, 1 round-trip) thay vì poll.
        - `page_action`: `sa` value trong payload của `/anchor` endpoint (nếu có).
        - `recaptcha_data_s_value`: `s` value trong payload của `/anchor` (v2 normal).
        - `is_session=True`: bật session mode, solution sẽ kèm `recaptcha-ca-t` cookie.
        - `enterprise_payload`/`api_domain`: có thể vẫn dùng cho v2 non-Enterprise theo docs 2026-04.
        """
        task: Dict[str, Any] = {
            "type": "ReCaptchaV2TaskProxyLess",
            "websiteURL": url,
            "websiteKey": sitekey,
            "isInvisible": invisible,
        }
        if cookies:
            task["cookies"] = cookies
        if page_action:
            task["pageAction"] = page_action
        if recaptcha_data_s_value:
            task["recaptchaDataSValue"] = recaptcha_data_s_value
        if is_session:
            task["isSession"] = True
        if enterprise_payload:
            task["enterprisePayload"] = enterprise_payload
        if api_domain:
            task["apiDomain"] = api_domain
        sol = await (self._get_token(task) if use_get_token else self.solve(task))
        token = sol.get("gRecaptchaResponse") or ""
        if not token:
            raise CapSolverError(f"reCAPTCHA v2 no token: {sol}")
        return token

    async def solve_recaptcha_v3(
        self,
        url: str,
        sitekey: str,
        action: str = "verify",
        min_score: float = 0.7,
        cookies: Optional[list] = None,
        use_get_token: bool = False,
        is_session: bool = False,
        api_domain: str = "",
    ) -> str:
        task: Dict[str, Any] = {
            "type": "ReCaptchaV3TaskProxyLess",
            "websiteURL": url,
            "websiteKey": sitekey,
            "pageAction": action,
            "minScore": min_score,
        }
        if cookies:
            task["cookies"] = cookies
        if is_session:
            task["isSession"] = True
        if api_domain:
            task["apiDomain"] = api_domain
        sol = await (self._get_token(task) if use_get_token else self.solve(task))
        token = sol.get("gRecaptchaResponse") or ""
        if not token:
            raise CapSolverError(f"reCAPTCHA v3 no token: {sol}")
        return token

    async def solve_recaptcha_v2_enterprise(
        self,
        url: str,
        sitekey: str,
        enterprise_payload: Optional[Dict[str, Any]] = None,
        api_domain: str = "",
        cookies: Optional[list] = None,
        use_get_token: bool = False,
    ) -> str:
        """reCAPTCHA v2 Enterprise (Google Cloud) — yêu cầu enterprise payload + có thể có apiDomain."""
        task: Dict[str, Any] = {
            "type": "ReCaptchaV2EnterpriseTaskProxyLess",
            "websiteURL": url,
            "websiteKey": sitekey,
        }
        if enterprise_payload:
            task["enterprisePayload"] = enterprise_payload
        if api_domain:
            task["apiDomain"] = api_domain
        if cookies:
            task["cookies"] = cookies
        sol = await (self._get_token(task) if use_get_token else self.solve(task))
        token = sol.get("gRecaptchaResponse") or ""
        if not token:
            raise CapSolverError(f"reCAPTCHA v2 Enterprise no token: {sol}")
        return token

    async def solve_recaptcha_v3_enterprise(
        self,
        url: str,
        sitekey: str,
        action: str = "verify",
        min_score: float = 0.7,
        enterprise_payload: Optional[Dict[str, Any]] = None,
        api_domain: str = "",
        cookies: Optional[list] = None,
        use_get_token: bool = False,
    ) -> str:
        """reCAPTCHA v3 Enterprise — phổ biến trên Google Cloud Identity."""
        task: Dict[str, Any] = {
            "type": "ReCaptchaV3EnterpriseTaskProxyLess",
            "websiteURL": url,
            "websiteKey": sitekey,
            "pageAction": action,
            "minScore": min_score,
        }
        if enterprise_payload:
            task["enterprisePayload"] = enterprise_payload
        if api_domain:
            task["apiDomain"] = api_domain
        if cookies:
            task["cookies"] = cookies
        sol = await (self._get_token(task) if use_get_token else self.solve(task))
        token = sol.get("gRecaptchaResponse") or ""
        if not token:
            raise CapSolverError(f"reCAPTCHA v3 Enterprise no token: {sol}")
        return token

    async def solve_hcaptcha_enterprise(
        self,
        url: str,
        sitekey: str,
        enterprise_payload: Optional[Dict[str, Any]] = None,
        is_invisible: bool = False,
    ) -> str:
        """hCaptcha Enterprise (rqdata + customData)."""
        task: Dict[str, Any] = {
            "type": "HCaptchaEnterpriseTaskProxyLess",
            "websiteURL": url,
            "websiteKey": sitekey,
            "isInvisible": is_invisible,
        }
        if enterprise_payload:
            task["enterprisePayload"] = enterprise_payload
        sol = await self.solve(task)
        token = sol.get("gRecaptchaResponse") or ""
        if not token:
            raise CapSolverError(f"hCaptcha Enterprise no token: {sol}")
        return token

    async def solve_mtcaptcha(self, url: str, sitekey: str) -> str:
        """MTCaptcha (mtcap.com) → trả token (verifiedToken)."""
        sol = await self.solve({
            "type": "MtCaptchaTaskProxyLess",
            "websiteURL": url,
            "websiteKey": sitekey,
        })
        token = sol.get("token") or sol.get("verifiedToken") or ""
        if not token:
            raise CapSolverError(f"MtCaptcha no token: {sol}")
        return token

    async def _sync_recognition(self, task: Dict[str, Any]) -> Dict[str, Any]:
        """Helper cho Recognition tasks: solution trả NGAY ở createTask response.

        Áp dụng cho: ImageToTextTask, ReCaptchaV2Classification,
        AwsWafClassification, VisionEngine. Khác với token tasks (Turnstile,
        reCAPTCHA, hCaptcha…) cần poll getTaskResult.
        """
        if not self.api_key:
            raise CapSolverError("CAPSOLVER_API_KEY missing")
        payload: Dict[str, Any] = {"clientKey": self.api_key, "task": task}
        if self.app_id:
            payload["appId"] = self.app_id
        async with httpx.AsyncClient(timeout=30.0) as client:
            r = await client.post(f"{BASE_URL}/createTask", json=payload)
            try:
                data = r.json()
            except Exception:
                r.raise_for_status()
                raise CapSolverError(
                    f"{task.get('type')} non-JSON: {r.text[:300]}"
                )
        if data.get("errorId"):
            raise CapSolverError(
                f"{task.get('type')} {data.get('errorCode') or ''}: {data.get('errorDescription')}"
            )
        return data.get("solution") or {}

    async def solve_image_to_text(
        self,
        image_base64: str,
        module: str = "common",
        website_url: str = "",
    ) -> str:
        """OCR captcha ảnh (image-to-text) → trả chuỗi text.

        - `image_base64`: chuỗi base64 KHÔNG có prefix `data:image/...`.
        - `module`: `common` (default), `number`, `module_001`..`module_032`.
        - `website_url`: optional, tăng accuracy.
        """
        task: Dict[str, Any] = {
            "type": "ImageToTextTask",
            "body": image_base64,
            "module": module,
        }
        if website_url:
            task["websiteURL"] = website_url
        sol = await self._sync_recognition(task)
        text = sol.get("text") or ""
        if not text:
            raise CapSolverError(f"ImageToText no text: {sol}")
        log.info("CapSolver ImageToText done: '%s' (module=%s)", text, module)
        return text

    async def solve_image_to_text_batch(
        self,
        images_base64: List[str],
        website_url: str = "",
    ) -> List[str]:
        """OCR batch — chỉ dùng được với module `number` (tối đa 9 ảnh / lần).

        Trả về `answers[]` theo đúng thứ tự input. Tiết kiệm round-trip so với
        gọi `solve_image_to_text` từng ảnh.
        """
        if not images_base64:
            raise CapSolverError("images_base64 empty")
        if len(images_base64) > 9:
            raise CapSolverError("number module hỗ trợ tối đa 9 ảnh / batch")
        task: Dict[str, Any] = {
            "type": "ImageToTextTask",
            "module": "number",
            "images": images_base64,
        }
        if website_url:
            task["websiteURL"] = website_url
        sol = await self._sync_recognition(task)
        answers = sol.get("answers") or []
        if not answers:
            raise CapSolverError(f"ImageToText batch no answers: {sol}")
        log.info("CapSolver ImageToText batch done: %d answers", len(answers))
        return answers

    async def solve_recaptcha_v2_classification(
        self,
        image_base64: str,
        question: str,
        website_url: str = "",
        website_key: str = "",
    ) -> Dict[str, Any]:
        """reCAPTCHA v2 image challenge ("select all images with…") → recognition.

        - `image_base64`: ảnh 3x3 hoặc 4x4 đã ghép sẵn (PNG/JPG base64, không prefix).
        - `question`: label code chuẩn Google. Ví dụ: `/m/0k4j` (cars),
          `/m/015qff` (traffic lights), `/m/014xcs` (crosswalks),
          `/m/0199g` (bicycles), `/m/015qbp` (parking meters), `/m/015kr` (bridges),
          `/m/019jd` (boats), `/m/0pg52` (taxis), `/m/01bjv` (bus).
        - Trả dict gồm:
            - `type`: `multi` hoặc `single`
            - `objects`: list index (multi) — các ô khớp với câu hỏi
            - `hasObject`: bool (single)
            - `size`: `3` (3x3) hoặc `4` (4x4)
        """
        task: Dict[str, Any] = {
            "type": "ReCaptchaV2Classification",
            "image": image_base64,
            "question": question,
        }
        if website_url:
            task["websiteURL"] = website_url
        if website_key:
            task["websiteKey"] = website_key
        sol = await self._sync_recognition(task)
        if not sol or ("objects" not in sol and "hasObject" not in sol):
            raise CapSolverError(f"ReCaptchaV2Classification no solution: {sol}")
        return sol

    async def solve_aws_waf_classification(
        self,
        images_base64: list,
        question: str,
        website_url: str = "",
    ) -> Dict[str, Any]:
        """AWS WAF image challenge → recognition.

        - `images_base64`: list base64 string. `aws:grid:*` cần 9 ảnh,
          `aws:toycarcity:*` cần 1 ảnh.
        - `question`: ví dụ `aws:toycarcity:carcity` (chấm điểm xe đỗ),
          `aws:grid:bag`, `aws:grid:chair`, `aws:grid:umbrella`, v.v.
        - Trả dict: `box` (tọa độ điểm chấm), `objects` (index grid khớp),
          `distance` (cho `bifurcatedzoo`).
        """
        task: Dict[str, Any] = {
            "type": "AwsWafClassification",
            "images": images_base64,
            "question": question,
        }
        if website_url:
            task["websiteURL"] = website_url
        sol = await self._sync_recognition(task)
        if not sol:
            raise CapSolverError(f"AwsWafClassification no solution: {sol}")
        return sol

    async def solve_vision_engine(
        self,
        module: str,
        image_base64: str,
        image_background_base64: str,
        question: str = "",
        website_url: str = "",
    ) -> Dict[str, Any]:
        """Vision Engine — generic slider/rotate/shein/ocr_gif solver.

        - `module`: `slider_1` (slide puzzle), `rotate_1`, `rotate_2`
          (rotation captcha), `shein` (Shein anti-bot), `ocr_gif` (OCR animated).
        - `image`: ảnh foreground/piece base64.
        - `image_background`: ảnh background base64.
        - `question`: chỉ cần cho `shein` module.
        - Trả dict: `distance` (slider distance px), `angle` (rotate độ),
          hoặc `text` (ocr_gif).
        """
        task: Dict[str, Any] = {
            "type": "VisionEngine",
            "module": module,
            "image": image_base64,
            "imageBackground": image_background_base64,
        }
        if question:
            task["question"] = question
        if website_url:
            task["websiteURL"] = website_url
        sol = await self._sync_recognition(task)
        if not sol:
            raise CapSolverError(f"VisionEngine no solution: {sol}")
        return sol

    async def solve_turnstile(
        self,
        url: str,
        sitekey: str,
        action: str = "",
        cdata: str = "",
    ) -> Dict[str, str]:
        """Cloudflare Turnstile → trả {token, user_agent}.

        `action` và `cdata` lấy từ thuộc tính `data-action` / `data-cdata` trên
        element `.cf-turnstile`. Một số site (Cloudflare WAF Custom Rules) yêu
        cầu phải truyền đúng action/cdata thì token mới được Cloudflare chấp nhận.
        """
        task: Dict[str, Any] = {
            "type": "AntiTurnstileTaskProxyLess",
            "websiteURL": url,
            "websiteKey": sitekey,
        }
        metadata: Dict[str, str] = {}
        if action:
            metadata["action"] = action
        if cdata:
            metadata["cdata"] = cdata
        if metadata:
            task["metadata"] = metadata
        sol = await self.solve(task)
        token = sol.get("token") or ""
        if not token:
            raise CapSolverError(f"Turnstile no token: {sol}")
        return {"token": token, "user_agent": sol.get("userAgent") or ""}

    async def solve_hcaptcha(self, url: str, sitekey: str) -> str:
        """hCaptcha standard.

        ⚠️ DEPRECATED trên CapSolver dạng public API (docs 2026-04 bỏ khu vực
        hCaptcha khỏi sidebar; account thường trả `ERROR_INVALID_TASK_DATA`).
        Giữ lại để backward-compat; nếu cần unlock hãy contact CapSolver support.
        """
        sol = await self.solve({
            "type": "HCaptchaTaskProxyLess",
            "websiteURL": url,
            "websiteKey": sitekey,
        })
        token = sol.get("gRecaptchaResponse") or ""
        if not token:
            raise CapSolverError(f"hCaptcha no token: {sol}")
        return token

    async def solve_funcaptcha(self, url: str, public_key: str, surl: str = "") -> str:
        """FunCaptcha / Arkose Labs → trả token.

        ⚠️ DEPRECATED trên CapSolver public API (docs 2026-04 bỏ khỏi sidebar).
        Giữ lại cho backward-compat.
        """
        task: Dict[str, Any] = {
            "type": "FunCaptchaTaskProxyLess",
            "websiteURL": url,
            "websitePublicKey": public_key,
        }
        if surl:
            task["funcaptchaApiJSSubdomain"] = surl
        sol = await self.solve(task)
        token = sol.get("token") or ""
        if not token:
            raise CapSolverError(f"FunCaptcha no token: {sol}")
        return token

    async def solve_aws_waf(
        self,
        url: str,
        aws_key: str = "",
        aws_iv: str = "",
        aws_context: str = "",
        aws_challenge_js: str = "",
        aws_api_js: str = "",
        aws_problem_url: str = "",
        aws_api_key: str = "",
        aws_existing_token: str = "",
    ) -> dict:
        """AWS WAF challenge → trả cookies dict (`aws-waf-token`) để inject vào page.

        Tham số optional theo 5 tình huống CapSolver docs:
        - **Situation 1**: chỉ `websiteURL` (page CAPTCHA trả 405).
        - **Situation 2**: + `aws_key`/`aws_iv`/`aws_context`/`aws_challenge_js` khi server không auto-trigger.
        - **Situation 3-1**: `aws_challenge_js` only nếu page không có key/iv/context.
        - **Situation 3-2**: `aws_api_js` thay cho challenge.js (assembled từ jsapi.js).
        - **Situation 4**: `aws_problem_url` cho grid captcha (containing `problem` + `num_solutions_required`).
        - **Situation 5**: `aws_api_key` + `aws_api_js` + `aws_existing_token` cho secondary verification.
        """
        task: Dict[str, Any] = {
            "type": "AntiAwsWafTaskProxyLess",
            "websiteURL": url,
        }
        if aws_key:
            task["awsKey"] = aws_key
        if aws_iv:
            task["awsIv"] = aws_iv
        if aws_context:
            task["awsContext"] = aws_context
        if aws_challenge_js:
            task["awsChallengeJS"] = aws_challenge_js
        if aws_api_js:
            task["awsApiJs"] = aws_api_js
        if aws_problem_url:
            task["awsProblemUrl"] = aws_problem_url
        if aws_api_key:
            task["awsApiKey"] = aws_api_key
        if aws_existing_token:
            task["awsExistingToken"] = aws_existing_token
        sol = await self.solve(task)
        cookies = sol.get("cookies") or sol.get("cookie") or {}
        if not cookies:
            raise CapSolverError(f"AWS WAF no cookies: {sol}")
        return cookies

    async def solve_cloudflare_challenge(
        self,
        url: str,
        user_agent: str = "",
        html: str = "",
    ) -> dict:
        """Cloudflare full-page interstitial (5-sec JS challenge) → `{cookies, token, userAgent}`.

        - `user_agent`: giữ đồng nhất với UA bạn dùng để gọi target site (Chrome only).
        - `html`: HTML response “Just a moment…” (status 403) — cần cho một số site;
          dynamically scrape bằng sticky proxy mỗi lần.
        ⚠️ Proxy là bắt buộc (Static / Sticky, KHÔNG Rotating) — giữ proxy_url trên CapSolver instance.
        """
        task: Dict[str, Any] = {
            "type": "AntiCloudflareTask",
            "websiteURL": url,
        }
        if user_agent:
            task["userAgent"] = user_agent
        if html:
            task["html"] = html
        sol = await self.solve(task)
        if not sol.get("cookies"):
            raise CapSolverError(f"Cloudflare challenge no cookies: {sol}")
        return {
            "cookies": sol.get("cookies") or {},
            "token": sol.get("token") or "",
            "user_agent": sol.get("userAgent") or "",
        }

    async def solve_geetest(
        self,
        url: str,
        gt: str = "",
        challenge: str = "",
        captcha_id: str = "",
        api_subdomain: str = "",
    ) -> Dict[str, Any]:
        """GeeTest v3 (gt + challenge) hoặc v4 (captcha_id) → trả solution dict.

        - v3: cần `gt` + `challenge`, return {challenge, validate, seccode}.
        - v4: cần `captcha_id`, return {captcha_id, captcha_output, gen_time, lot_number, pass_token, risk_type}.
        """
        task: Dict[str, Any] = {
            "type": "GeeTestTaskProxyLess",
            "websiteURL": url,
        }
        if captcha_id:
            task["captchaId"] = captcha_id
        else:
            task["gt"] = gt
            task["challenge"] = challenge
        if api_subdomain:
            task["geetestApiServerSubdomain"] = api_subdomain
        sol = await self.solve(task)
        if not sol:
            raise CapSolverError("GeeTest no solution")
        return sol

    async def solve_datadome(
        self,
        captcha_url: str,
        user_agent: str,
        proxy: str = "",
    ) -> str:
        """DataDome slider / interstitial → trả cookie string `datadome=...`.

        - `captcha_url` lấy từ iframe src trên trang (thường
          `geo.captcha-delivery.com/captcha/?...&t=fe`). Nếu `t=bv` nghĩa là IP bị
          ban thẳng — phải đổi proxy trước khi solve.
        - `user_agent` phải khớp với UA của browser; CapSolver chỉ chấp nhận một
          số UA cố định (xem `_DATADOME_UA`).
        - `proxy` bắt buộc (format `host:port:user:pass` hoặc `host:port`).
        """
        if not proxy and not self.proxy_url:
            raise CapSolverError("DataDome bắt buộc phải có proxy")
        # Convert PROXY_URL của ta về format CapSolver yêu cầu nếu user không truyền proxy thẳng
        proxy_str = proxy or _proxy_url_to_capsolver_format(self.proxy_url or "")
        task: Dict[str, Any] = {
            "type": "DatadomeSliderTask",
            "websiteURL": captcha_url,
            "captchaUrl": captcha_url,
            "userAgent": user_agent or _DATADOME_UA[0],
            "proxy": proxy_str,
        }
        sol = await self.solve(task)
        cookie = sol.get("cookie") or ""
        if not cookie:
            raise CapSolverError(f"DataDome no cookie: {sol}")
        return cookie

    async def balance(self) -> float:
        """Lấy số dư tài khoản (USD)."""
        if not self.api_key:
            raise CapSolverError("CAPSOLVER_API_KEY missing")
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.post(f"{BASE_URL}/getBalance", json={"clientKey": self.api_key})
            r.raise_for_status()
            data = r.json()
        if data.get("errorId"):
            raise CapSolverError(f"getBalance: {data.get('errorDescription')}")
        return float(data.get("balance") or 0.0)

    async def balance_info(self) -> Dict[str, Any]:
        """Full account info — trả `{balance: float, packages: [...]}`.

        `packages[]` chứa monthly/weekly subscription đã mua:
        `{packageId, type, title, numberOfCalls, status, token, expireTime}`.
        Dùng để setup alert hết gói, hiển thị dashboard, etc.
        """
        if not self.api_key:
            raise CapSolverError("CAPSOLVER_API_KEY missing")
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.post(f"{BASE_URL}/getBalance", json={"clientKey": self.api_key})
            r.raise_for_status()
            data = r.json()
        if data.get("errorId"):
            raise CapSolverError(f"getBalance: {data.get('errorDescription')}")
        return {
            "balance": float(data.get("balance") or 0.0),
            "packages": data.get("packages") or [],
        }


async def inject_recaptcha_token(page, token: str) -> None:
    """Helper: tiêm token vào textarea g-recaptcha-response để form submit accept.

    Dùng cho reCAPTCHA v2/v3.
    """
    await page.evaluate(
        """(t) => {
            let el = document.getElementById('g-recaptcha-response');
            if (!el) {
                el = document.createElement('textarea');
                el.id = 'g-recaptcha-response';
                el.name = 'g-recaptcha-response';
                el.style.display = 'none';
                document.body.appendChild(el);
            }
            el.value = t;
            el.innerHTML = t;
        }""",
        token,
    )


async def click_turnstile_checkbox(page, timeout_ms: int = 12000) -> bool:
    """Click trực tiếp vào checkbox 'Verify you are human' trong iframe Cloudflare Turnstile.

    Dùng browser-use mouse API (CDP-based) — click tại toạ độ bên trong
    iframe Cloudflare (cross-origin, không access được qua frame_locator).
    Khi browser fingerprint sạch (CloakBrowser), Cloudflare cho qua ngay.

    Trả True nếu detect được token đã set vào `cf-turnstile-response` input trong
    timeout, False nếu vẫn empty (sẽ fallback CapSolver).
    """
    try:
        import json as _json
        # 1. Lấy bounding rect của iframe Turnstile.
        rect_str = await page.evaluate(
            """() => {
                const ifr = document.querySelector('iframe[src*="challenges.cloudflare.com"]');
                if (!ifr) return null;
                const r = ifr.getBoundingClientRect();
                return {x: r.left, y: r.top, w: r.width, h: r.height};
            }"""
        )
        rect = None
        if rect_str:
            try:
                rect = _json.loads(rect_str) if isinstance(rect_str, str) else rect_str
            except Exception:
                rect = None
        if not rect or not rect.get("w"):
            log.info("Turnstile iframe not found on page")
            return False

        # 2. Click tại vị trí checkbox: khoảng 30px từ trái, giữa chiều cao.
        cx = int(rect["x"]) + 30
        cy = int(rect["y"] + rect["h"] / 2)
        mouse = await page.mouse
        await mouse.click(cx, cy)
        log.info("Turnstile checkbox clicked at (%d,%d)", cx, cy)

        # 3. Poll input cf-turnstile-response.value mỗi 500ms tới timeout.
        elapsed = 0
        while elapsed < timeout_ms:
            val_str = await page.evaluate(
                """() => {
                    const inp = document.querySelector('input[name="cf-turnstile-response"], textarea[name="cf-turnstile-response"], input[name$="turnstile-response"]');
                    return inp ? inp.value : '';
                }"""
            )
            val = val_str if isinstance(val_str, str) else ""
            # browser-use evaluate JSON-stringify kết quả → string có thể bọc trong "..."
            if val.startswith('"') and val.endswith('"'):
                val = val[1:-1]
            if val and len(val) > 20:
                log.info("Turnstile checkbox PASS — token detected len=%d", len(val))
                return True
            await asyncio.sleep(0.5)
            elapsed += 500
        log.info("Turnstile checkbox click timeout sau %dms — token empty", timeout_ms)
        return False
    except Exception as e:
        log.warning("click_turnstile_checkbox error: %s", e)
        return False


async def inject_turnstile_token(page, token: str) -> None:
    """Tiêm token Cloudflare Turnstile — DÙNG MỌI STRATEGY để widget tin là đã pass.

    Đã verify pass trên Orbit Rings (goaffpro 3rd-party iframe wrapper):
      1. Set value vào MỌI input/textarea `cf-turnstile-response`, `g-recaptcha-response`,
         và `*-turnstile-response` (React setter để dispatch input/change).
      2. `window.postMessage({type:'turnstile-success', token}, '*')` — case site dùng
         iframe wrapper bên thứ 3 (creatives.goaffpro.com kiểu) post lên parent.
      3. `window.__turnstileToken = token` — global flag cho app đọc.
      4. Gọi `data-callback` của mọi widget Turnstile trên page.
      5. Gọi `window.onTurnstileSuccess(token)` nếu app define hàm này.
      6. Stub `window.turnstile.getResponse() = () => token` cho app polling.
    """
    await page.evaluate(
        """(t) => {
            // (1) Inputs/textareas
            const setReact = (el, v) => {
                const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement : HTMLInputElement;
                const setter = Object.getOwnPropertyDescriptor(proto.prototype, 'value').set;
                setter.call(el, v);
                el.dispatchEvent(new Event('input', {bubbles: true}));
                el.dispatchEvent(new Event('change', {bubbles: true}));
            };
            const sels = 'input[name="cf-turnstile-response"], textarea[name="cf-turnstile-response"], input[name$="turnstile-response"], textarea[name$="turnstile-response"], textarea[name="g-recaptcha-response"], textarea#g-recaptcha-response';
            const inputs = document.querySelectorAll(sels);
            inputs.forEach(el => setReact(el, t));
            if (inputs.length === 0) {
                const form = document.querySelector('form');
                if (form) {
                    const inp = document.createElement('input');
                    inp.type = 'hidden';
                    inp.name = 'cf-turnstile-response';
                    inp.value = t;
                    form.appendChild(inp);
                }
            }

            // (2) postMessage to self (parent listeners hear {type:'turnstile-success'})
            try { window.postMessage({type: 'turnstile-success', token: t}, '*'); } catch(e){}

            // (3) Global flag
            try { window.__turnstileToken = t; } catch(e){}

            // (4) data-callback per widget
            document.querySelectorAll('[data-sitekey][data-callback], .cf-turnstile[data-callback]').forEach(el => {
                const cb = el.getAttribute('data-callback');
                if (cb && typeof window[cb] === 'function') {
                    try { window[cb](t); } catch(e){}
                }
            });

            // (5) Common global success handlers
            ['onTurnstileSuccess', 'turnstileCallback', 'onCaptchaSuccess'].forEach(name => {
                if (typeof window[name] === 'function') {
                    try { window[name](t); } catch(e){}
                }
            });

            // (6) Stub turnstile API for apps polling getResponse
            try {
                window.turnstile = window.turnstile || {};
                window.turnstile.getResponse = () => t;
                window.turnstile.execute = () => t;
            } catch(e){}
        }""",
        token,
    )


async def fetch_turnstile_sitekey_from_iframe(iframe_url: str) -> Optional[str]:
    """Fetch HTML của iframe wrapper bên thứ 3 → trích `data-sitekey`.

    Dùng khi site nhúng Turnstile qua iframe ngoài (vd: goaffpro creatives) — sitekey
    không có trên DOM parent. Pattern: `data-sitekey="0x..."`.
    """
    try:
        async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
            r = await client.get(iframe_url, headers={"User-Agent": "Mozilla/5.0"})
        if r.status_code >= 400:
            log.warning("fetch iframe %s → %s", iframe_url, r.status_code)
            return None
        m = re.search(r'data-sitekey\s*=\s*["\']([0-9a-zA-Z_-]{10,})["\']', r.text)
        if m:
            return m.group(1)
        # fallback: bare sitekey: '...'
        m2 = re.search(r'sitekey\s*[:=]\s*["\']([0-9a-zA-Z_-]{10,})["\']', r.text)
        return m2.group(1) if m2 else None
    except Exception as e:
        log.warning("fetch_turnstile_sitekey_from_iframe(%s) failed: %s", iframe_url, e)
        return None


async def detect_captcha_on_page(page) -> Optional[Dict[str, Any]]:
    """Quét DOM tìm captcha widget. Trả về `{type, ...params}` hoặc None.

    Detect:
      * `turnstile`   → sitekey, action, cdata
      * `recaptcha_v2`→ sitekey, invisible
      * `recaptcha_v3`→ sitekey (lấy từ script src ?render=...)
      * `hcaptcha`    → sitekey
      * `funcaptcha`  → pkey (data-pkey)
      * `cloudflare_interstitial` → cả trang là "Just a moment..."
      * `aws_waf`     → cả trang là AWS WAF challenge
      * `geetest_v4`  → captchaId
      * `datadome`    → captchaUrl (iframe src)
    """
    import json as _json
    try:
        raw = await page.evaluate(
            """() => {
                const bodyText = (document.body && document.body.innerText || '').toLowerCase();
                if (
                    (document.title.toLowerCase().includes('just a moment') ||
                     bodyText.includes('verify you are human') ||
                     bodyText.includes('checking your browser')) &&
                    !document.querySelector('input, button[type=submit]')
                ) {
                    if (bodyText.includes('aws') || bodyText.includes('waf')) {
                        return {type: 'aws_waf'};
                    }
                    return {type: 'cloudflare_interstitial'};
                }

                const tsRoot = document.querySelector('.cf-turnstile[data-sitekey]') ||
                               document.querySelector('[data-sitekey][data-callback]') ||
                               document.querySelector('div[id^="cf-chl-widget"]');
                if (tsRoot) {
                    let root = tsRoot;
                    if (!root.dataset.sitekey) {
                        root = root.closest('[data-sitekey]') || root;
                    }
                    return {
                        type: 'turnstile',
                        sitekey: root.dataset.sitekey || '',
                        action: root.dataset.action || '',
                        cdata: root.dataset.cdata || '',
                    };
                }
                if (document.querySelector('iframe[src*="challenges.cloudflare.com"]')) {
                    const ifr = document.querySelector('iframe[src*="challenges.cloudflare.com"]');
                    const m = ifr.src.match(/[?&]k=([^&]+)/) || ifr.src.match(/\\/([0-9]x[A-Za-z0-9_-]+)\\//);
                    return {type: 'turnstile', sitekey: m ? m[1] : '', action: '', cdata: ''};
                }
                // 3rd-party iframe wrapper (e.g. goaffpro creatives/<id>/<hash>-turnstile-iframe.html)
                const wrapIfr = [...document.querySelectorAll('iframe[src]')].find(f =>
                    /turnstile[-_]iframe|turnstile\\.html|cf[-_]turnstile/i.test(f.src||'')
                );
                if (wrapIfr) {
                    return {type: 'turnstile_iframe', iframe_src: wrapIfr.src};
                }

                const g2 = document.querySelector('.g-recaptcha[data-sitekey]') ||
                           document.querySelector('[data-sitekey]:not(.cf-turnstile):not(.h-captcha)');
                if (g2 && g2.dataset.sitekey && g2.dataset.sitekey.startsWith('6')) {
                    // Enterprise detection: window.grecaptcha.enterprise or class hint
                    const isEnt = !!(window.grecaptcha && window.grecaptcha.enterprise)
                        || g2.classList.contains('grecaptcha-enterprise')
                        || g2.dataset.enterprise === 'true';
                    return {
                        type: isEnt ? 'recaptcha_v2_enterprise' : 'recaptcha_v2',
                        sitekey: g2.dataset.sitekey,
                        invisible: (g2.dataset.size === 'invisible'),
                    };
                }

                if (document.querySelector('.grecaptcha-badge')) {
                    const scripts = [...document.scripts].map(s => s.src).join(' ');
                    const m = scripts.match(/[?&]render=([a-zA-Z0-9_-]+)/);
                    if (m) {
                        const isEnt = /enterprise\\.js/.test(scripts) || !!(window.grecaptcha && window.grecaptcha.enterprise);
                        return {type: isEnt ? 'recaptcha_v3_enterprise' : 'recaptcha_v3', sitekey: m[1]};
                    }
                }

                const hc = document.querySelector('.h-captcha[data-sitekey]') ||
                           document.querySelector('iframe[src*="hcaptcha.com"]');
                if (hc) {
                    let key = '';
                    if (hc.dataset && hc.dataset.sitekey) key = hc.dataset.sitekey;
                    else {
                        const root = document.querySelector('.h-captcha[data-sitekey]');
                        if (root) key = root.dataset.sitekey;
                    }
                    const isEnt = !!(window.hcaptcha && window.hcaptcha.enterprise)
                        || /rqdata/.test(document.documentElement.outerHTML.slice(0, 50000));
                    return {type: isEnt ? 'hcaptcha_enterprise' : 'hcaptcha', sitekey: key};
                }

                // MTCaptcha (mtcap.com — Mailchimp, etc.)
                const mt = document.querySelector('.mtcaptcha-fallback, [data-sitekey^="MTPublic"], div.mtcaptcha') ||
                           document.querySelector('iframe[src*="mtcaptcha.com"], iframe[src*="service.mtcaptcha"]');
                if (mt) {
                    let key = (mt.dataset && mt.dataset.sitekey) || '';
                    if (!key) {
                        const m = (document.documentElement.outerHTML.match(/MTPublic-[A-Za-z0-9]+/) || [])[0];
                        if (m) key = m;
                    }
                    if (key) return {type: 'mtcaptcha', sitekey: key};
                }

                const fc = document.querySelector('[data-pkey]') ||
                           document.querySelector('iframe[src*="arkoselabs.com"], iframe[src*="funcaptcha.com"]');
                if (fc) {
                    let pkey = '';
                    if (fc.dataset && fc.dataset.pkey) pkey = fc.dataset.pkey;
                    return {type: 'funcaptcha', pkey: pkey};
                }

                const gt = document.querySelector('[data-captcha-id]');
                if (gt) {
                    return {type: 'geetest_v4', captchaId: gt.dataset.captchaId};
                }

                const dd = document.querySelector('iframe[src*="captcha-delivery.com"]');
                if (dd) {
                    return {type: 'datadome', captchaUrl: dd.src};
                }

                // Legacy image captcha (text-in-image OCR fallback)
                const img = document.querySelector(
                    'img[src*="captcha" i], img[id*="captcha" i], img[class*="captcha" i], img[alt*="captcha" i]'
                );
                if (img && img.src && img.complete && img.naturalWidth > 0) {
                    return {type: 'image_to_text', image_src: img.src, image_id: img.id || ''};
                }

                return null;
            }"""
        )
        if not raw:
            return None
        # browser-use evaluate JSON-stringifies objects → parse
        if isinstance(raw, str):
            raw = raw.strip()
            if not raw or raw in ("null", "undefined", '""'):
                return None
            try:
                return _json.loads(raw)
            except Exception:
                return None
        return raw if isinstance(raw, dict) else None
    except Exception as e:
        log.warning("detect_captcha_on_page eval failed: %s", e)
        return None


async def inject_cookies_and_reload(browser_session, page, cookies: dict, page_url: str = "") -> None:
    """Inject cookies dict qua CDP rồi reload page.

    Dùng cho AWS WAF / Cloudflare challenge bypass. browser-use không expose
    Playwright context.add_cookies, phải đi qua CDP `Storage.setCookies`.
    """
    try:
        url = page_url or await page.get_url()
        host = urlparse(url).hostname or ""
        cookie_list = []
        for name, value in (cookies or {}).items():
            cookie_list.append({
                "name": name,
                "value": str(value),
                "domain": host,
                "path": "/",
                "secure": True,
                "sameSite": "Lax",
            })
        if cookie_list:
            try:
                await browser_session._cdp_set_cookies(cookie_list)
            except Exception as e:
                log.warning("CDP set_cookies failed: %s — fallback document.cookie", e)
                # Fallback: set via document.cookie (chỉ work cho non-HttpOnly).
                for c in cookie_list:
                    js = f"() => {{ document.cookie = {repr(c['name']+'='+c['value']+'; path=/')}; }}"
                    await page.evaluate(js)
        await page.reload()
    except Exception as e:
        log.warning(f"inject_cookies_and_reload failed: {e}")
        raise
