"""
Browser-use Agent driver — chạy 1 attempt đăng ký:
  (program_signup_url, profile, instruction_text) → kết quả (success/fail + log).

KHÔNG có queue/celery — đơn giản async function, gọi từ signup_runner.
"""

from __future__ import annotations

import json
import logging
import time
from datetime import datetime
from pathlib import Path
from typing import Any

from app.core.config import settings
from app.services.browser.session import create_signup_browser_session
from app.services.captcha.capsolver import (
    CapSolver,
    click_turnstile_checkbox,
    detect_captcha_on_page,
    fetch_turnstile_sitekey_from_iframe,
    inject_cookies_and_reload,
    inject_recaptcha_token,
    inject_turnstile_token,
)

from .email_reader import wait_for_verification
from .instruction_parser import build_field_rules_block, parse_instruction_text
from .sms_otp import SmsOtpService

logger = logging.getLogger(__name__)


def _build_task_prompt(program: dict, profile: dict, instruction_block: str, extra: str, signup_email: str = "") -> str:
    """Soạn task prompt cho browser-use Agent."""
    name = profile.get("full_name") or ""
    ho = profile.get("ho") or ""
    ten = profile.get("ten") or ""
    if not name and (ho or ten):
        name = f"{ho} {ten}".strip()
    password = profile.get("password") or ""
    country = profile.get("country") or ""
    website = profile.get("website") or ""
    niche = ", ".join(profile.get("niche") or [])
    payment = profile.get("payment") or {}
    notes = profile.get("notes") or ""

    program_name = program.get("name") or ""
    signup_url = program.get("signup_url") or program.get("url") or ""

    parts = [
        f"Nhiệm vụ: ĐĂNG KÝ tài khoản affiliate trên trang `{program_name}` tại URL: {signup_url}",
        "",
        "### Email đăng ký (DUY NHẤT — bắt buộc dùng email này):",
        f"- Signup email: {signup_email}",
        "  ⇒ Đây là email DUY NHẤT được cấp phép điền vào field Email / Username.",
        "  ⇒ TUYỆT ĐỐI KHÔNG dùng email khác (không suy ra từ payment, không tự đặt).",
        "",
        "### Thông tin profile (dùng để điền các field khác, KHÔNG bao gồm email):",
        f"- Full name: {name}",
        f"- Họ (Last name): {ho}",
        f"- Tên (First name): {ten}",
        f"- Password: {password}",
        f"- Country: {country}",
        f"- Website / blog: {website}",
        f"- Niche / lĩnh vực: {niche}",
        f"- Payment info: {json.dumps(payment, ensure_ascii=False)}",
        f"- Ghi chú thêm: {notes}",
    ]
    if instruction_block:
        parts.append("")
        parts.append(instruction_block)
    if extra:
        parts.append("")
        parts.append("### Yêu cầu bổ sung từ user:")
        parts.append(extra)

    parts.extend([
        "",
        "### Quy trình mong muốn:",
        "1. Mở URL signup ở trên.",
        "2. Nếu thấy nút 'Sign up' / 'Register' / 'Join' / 'Become an affiliate' → click để vào form.",
        "3. Điền form theo dữ liệu profile, tuân thủ quy tắc field rules (nếu có).",
        "   - Field bắt buộc PHẢI điền. Field optional có thể bỏ trống nếu không có dữ liệu.",
        "   - Nếu thiếu dữ liệu thực, dùng giá trị hợp lý (ví dụ phone tạo số US ngẫu nhiên hợp lệ).",
        "4. Nếu gặp CAPTCHA → CHIẾN LƯỢC CAPSOLVER-FIRST (mạnh nhất, đã verify):",
        "   a. GỌI `solve_captcha_auto()` NGAY (KHÔNG cần arg). Tool tự detect → solve qua CapSolver → override UA → inject token. ĐỪNG click checkbox 'Verify you are human' bằng tay (Cloudflare detect bot → 'Verification failed' không reset được).",
        "   b. Nếu auto trả về 'Click submit ngay' → đợi 1 giây rồi click nút submit form. KHÔNG click vào widget captcha nữa.",
        "   c. Nếu auto fail (lý do trong message) → fallback tool riêng:",
        "   - Cloudflare Turnstile widget → `solve_cloudflare_turnstile(sitekey, action, cdata)`. action/cdata = data-action/data-cdata nếu có.",
        "   - Cloudflare full-page interstitial (cả trang là 'Verify you are human, just a moment...') → `solve_cloudflare_interstitial()`.",
        "   - reCAPTCHA v2 (div.g-recaptcha có checkbox) → `solve_recaptcha_v2(sitekey)`.",
        "   - reCAPTCHA v3 (invisible, badge góc phải dưới, gọi grecaptcha.execute) → `solve_recaptcha_v3(sitekey, action)`. Action lấy từ JS hoặc thử 'submit'/'signup'.",
        "   - hCaptcha (div.h-captcha / iframe hcaptcha.com) → `solve_hcaptcha(sitekey)`.",
        "   - FunCaptcha / Arkose (iframe arkoselabs.com, xoay ảnh) → `solve_funcaptcha(public_key)` (data-pkey).",
        "   - AWS WAF challenge (cả trang 'Verify you are human' từ AWS) → `solve_aws_waf_challenge()`.",
        "   d. CHỈ DÙNG `click_cloudflare_checkbox()` khi CapSolver lỗi credit / network — đây là last resort.",
        "   - Sau khi tool trả về 'OK' / 'injected' / 'solved', chờ 1-2 giây rồi click submit form (KHÔNG click vào widget).",
        "5. Nếu form yêu cầu SMS / phone OTP verification:",
        "   a. Gọi tool `request_sms_phone_number` (không cần arg) → nhận lại {phone, rental_id}.",
        "   b. Điền số phone đó vào field phone của form. Submit để site gửi SMS.",
        "   c. Gọi tool `read_sms_otp_code` (không cần arg) → nhận code (digits).",
        "   d. Điền code vào ô OTP, submit verify.",
        "6. Nếu form yêu cầu EMAIL verification (gửi link/code vào email):",
        "   a. Submit form trước (site sẽ gửi email).",
        "   b. Gọi tool `read_email_verification` với sender_contains='' (hoặc tên brand như 'webflow').",
        "   c. Nếu trả về 'code' → điền code vào ô verify trên trang.",
        "   d. Nếu trả về 'link' → gọi tool `navigate` với url=link đó để mở verification page.",
        "7. Submit form cuối. Khi thấy success/thank-you/dashboard → coi như success.",
        "8. Khi xong, gọi `done` với JSON: {\"status\": \"success\"|\"failed\"|\"captcha\"|\"pending_verify\", \"message\": \"...\", \"final_url\": \"...\"}.",
        "",
        "QUAN TRỌNG:",
        "- KHÔNG đăng ký nhiều account. Mỗi lần chỉ 1 lần submit.",
        "- Nếu trang yêu cầu login (đã có account) → báo failed 'ALREADY_REGISTERED'.",
        "- Nếu signup_url không hợp lệ / 404 → báo failed 'INVALID_URL'.",
        "- Nếu IP bị ban / 'Access Denied' / 'Too many requests' → báo failed 'IP_BLOCKED' (system sẽ retry với proxy/profile khác).",
        "- Nếu tool OTP/Email báo lỗi không thể vượt qua → báo failed với message lỗi cụ thể.",
    ])
    return "\n".join(parts)


def _parse_agent_result(history: Any) -> dict:
    """Trích status/message từ AgentHistoryList của browser-use."""
    out = {"status": "failed", "message": "", "final_url": "", "steps": 0}
    try:
        out["steps"] = len(getattr(history, "history", []) or [])
    except Exception:
        pass
    final_result = None
    try:
        final_result = history.final_result()  # browser-use API
    except Exception:
        pass
    if not final_result:
        try:
            for h in reversed(getattr(history, "history", []) or []):
                if getattr(h, "result", None):
                    for r in h.result:
                        if getattr(r, "is_done", False):
                            final_result = r.extracted_content or ""
                            break
                if final_result:
                    break
        except Exception:
            pass

    if final_result:
        text = final_result if isinstance(final_result, str) else str(final_result)
        out["message"] = text[:2000]
        try:
            data = json.loads(_extract_json(text))
            if isinstance(data, dict):
                out["status"] = (data.get("status") or "").lower() or out["status"]
                if data.get("message"):
                    out["message"] = data["message"][:2000]
                if data.get("final_url"):
                    out["final_url"] = data["final_url"]
        except Exception:
            # Không phải JSON → heuristic
            low = text.lower()
            if "success" in low or "successfully" in low or "đăng ký thành công" in low:
                out["status"] = "success"
            elif "captcha" in low:
                out["status"] = "captcha"
            elif "verify" in low or "verification" in low:
                out["status"] = "pending_verify"
    return out


def _extract_json(text: str) -> str:
    """Tìm JSON object đầu tiên trong text."""
    start = text.find("{")
    end = text.rfind("}")
    if start >= 0 and end > start:
        return text[start : end + 1]
    return text


async def _capture_screenshot(browser_session, job_id: int, program_id: int, profile_id: str) -> str | None:
    """Chụp screenshot trang hiện tại, save vào data/signup_screenshots/."""
    try:
        out_dir = settings.data_path("signup_screenshots")
        out_dir.mkdir(parents=True, exist_ok=True)
        ts = int(time.time())
        path = out_dir / f"job{job_id}_prog{program_id}_{profile_id}_{ts}.png"
        # browser-use BrowserSession có method screenshot
        png_bytes = await browser_session.take_screenshot(full_page=False)
        if isinstance(png_bytes, bytes):
            path.write_bytes(png_bytes)
        elif isinstance(png_bytes, str):
            # base64
            import base64
            path.write_bytes(base64.b64decode(png_bytes))
        else:
            return None
        return str(path.relative_to(settings.data_dir.resolve() if settings.data_dir.is_absolute() else Path.cwd()))
    except Exception as e:
        logger.warning(f"Screenshot failed: {e}")
        return None


def _extract_last_screenshot_from_history(history, job_id: int, program_id: int, profile_id: str) -> str | None:
    """Lấy screenshot cuối cùng từ agent history (đã được lưu sẵn trên đĩa bởi browser-use)."""
    try:
        import base64
        import shutil
        out_dir = settings.data_path("signup_screenshots")
        out_dir.mkdir(parents=True, exist_ok=True)
        ts = int(time.time())
        target = out_dir / f"job{job_id}_prog{program_id}_{profile_id}_{ts}.png"

        items = list(getattr(history, "history", []) or [])
        for h in reversed(items):
            state = getattr(h, "state", None)
            if not state:
                continue
            src_path = getattr(state, "screenshot_path", None)
            if src_path and Path(src_path).exists():
                shutil.copyfile(src_path, target)
                return target.name
            # fallback: base64 screenshot in memory
            b64 = getattr(state, "screenshot", None)
            if b64:
                target.write_bytes(base64.b64decode(b64))
                return target.name
        return None
    except Exception as e:
        logger.warning(f"Extract screenshot from history failed: {e}")
        return None


async def run_signup_attempt(
    *,
    job_id: int,
    program: dict,
    profile: dict,
    instruction_content: str = "",
    instruction_filename: str = "",
    extra_prompt: str = "",
    headless: bool = False,
) -> dict:
    """
    Chạy 1 lần đăng ký. Return dict:
      {status, message, steps, final_url, screenshot, duration_sec}
    status ∈ success|failed|captcha|pending_verify|error
    """
    # `browser_use` import ở trong hàm — thư viện nặng, tránh slow startup FastAPI.
    from browser_use import ActionResult, Agent, ChatGoogle, ChatOpenAI, Tools

    started = time.time()
    program_id = program.get("id")
    profile_id = profile.get("id") or "unknown"

    # 1. Chọn LLM (ưu tiên Gemini 3 Flash Preview) 
    if settings.gemini_api_key:
        llm = ChatGoogle(
            model=settings.signup_llm_model or "gemini-3-flash-preview",
            api_key=settings.gemini_api_key,
        )
    elif settings.openai_api_key:
        llm = ChatOpenAI(model="gpt-4o", api_key=settings.openai_api_key)
    else:
        return {
            "status": "error",
            "message": "Chưa cấu hình GEMINI_API_KEY hoặc OPENAI_API_KEY",
            "steps": 0,
            "duration_sec": 0,
        }

    # 2. Build prompt
    parsed = parse_instruction_text(instruction_content, instruction_filename)
    rules_block = build_field_rules_block(parsed) if parsed else ""
    # Email đến từ job selection (bơm bởi _enrich) — KHÔNG fallback sang bất kỳ nguồn nào khác
    _signup_email = (
        (profile.get("imap") or {}).get("user")
        or profile.get("email")
        or ""
    )
    task = _build_task_prompt(program, profile, rules_block, extra_prompt, signup_email=_signup_email)

    # 3. Browser session — đi qua factory tập trung (CloakBrowser binary + stealth args + proxy)
    proxy_override = (profile.get("proxy_url") or "").strip() or None
    browser_session = create_signup_browser_session(headless=headless, proxy_url=proxy_override)

    # 4. Tools — đăng ký custom action cho CapSolver
    tools = Tools()
    capsolver = CapSolver(proxy_url=proxy_override)

    if capsolver.enabled:
        @tools.action(
            description=(
                "AUTO-SOLVE bất kỳ CAPTCHA nào trên trang hiện tại — KHÔNG cần tham số. "
                "Tool tự scan DOM tìm Turnstile / reCAPTCHA v2/v3 / hCaptcha / FunCaptcha / "
                "GeeTest v4 / DataDome / Cloudflare interstitial / AWS WAF, lấy sitekey, gọi "
                "CapSolver giải, inject token/cookie và trigger callback. "
                "DÙNG TOOL NÀY TRƯỚC — chỉ fallback các tool solve_* riêng nếu auto thất bại."
            )
        )
        async def solve_captcha_auto(browser_session) -> ActionResult:
            try:
                page = await browser_session.get_current_page()
                page_url = await page.get_url()
                info = await detect_captcha_on_page(page)
                if not info:
                    return ActionResult(
                        extracted_content="No captcha detected on current page.",
                        include_in_memory=True,
                    )
                ctype = info.get("type") or ""
                logger.info(f"[job={job_id}] auto-detect captcha={ctype} info={info}")

                if ctype == "turnstile":
                    sk = info.get("sitekey") or ""
                    if not sk:
                        return ActionResult(extracted_content="Turnstile detected nhưng không tìm được sitekey.", include_in_memory=True)
                    logger.info(f"[job={job_id}] Turnstile → CapSolver-first strategy, sitekey={sk}")
                    # Step 1: reset widget nếu nó đang ở trạng thái 'Verification failed'.
                    try:
                        await page.evaluate(
                            "() => { try { if (window.turnstile && typeof window.turnstile.reset === 'function') window.turnstile.reset(); } catch(e) {} return true; }"
                        )
                    except Exception as e:
                        logger.warning(f"[job={job_id}] turnstile.reset() failed: {e}")
                    # Step 2: solve qua CapSolver → token + userAgent.
                    res = await capsolver.solve_turnstile(page_url, sk, info.get("action") or "", info.get("cdata") or "")
                    token = res["token"]
                    ua = (res.get("user_agent") or "").strip()
                    # Step 3: override UA qua CDP để token match server-side validation.
                    if ua:
                        try:
                            cdp_session = await browser_session.get_or_create_cdp_session(target_id=None)
                            await cdp_session.cdp_client.send.Network.setUserAgentOverride(
                                params={"userAgent": ua},
                                session_id=cdp_session.session_id,
                            )
                            logger.info(f"[job={job_id}] Turnstile UA override OK: {ua[:60]}...")
                        except Exception as ue:
                            logger.warning(f"[job={job_id}] Turnstile UA override failed: {ue}")
                    # Step 4: inject token + fire data-callback.
                    await inject_turnstile_token(page, token)
                    return ActionResult(
                        extracted_content=f"Turnstile solved via CapSolver (token len={len(token)}, UA pinned). Click submit ngay.",
                        include_in_memory=True,
                    )

                if ctype == "turnstile_iframe":
                    # Site nhúng Turnstile qua iframe bên thứ 3 (vd: goaffpro creatives,
                    # Webflow embed). Sitekey nằm trong HTML iframe → fetch để lấy.
                    iframe_src = info.get("iframe_src") or ""
                    logger.info(f"[job={job_id}] Turnstile-iframe wrapper detected: {iframe_src}")
                    sk = await fetch_turnstile_sitekey_from_iframe(iframe_src)
                    if not sk:
                        return ActionResult(
                            extracted_content=f"Turnstile iframe detected ({iframe_src}) nhưng không extract được sitekey.",
                            include_in_memory=True,
                        )
                    logger.info(f"[job={job_id}] iframe sitekey={sk} → CapSolver solve")
                    res = await capsolver.solve_turnstile(page_url, sk)
                    token = res["token"]
                    ua = (res.get("user_agent") or "").strip()
                    if ua:
                        try:
                            cdp_session = await browser_session.get_or_create_cdp_session(target_id=None)
                            await cdp_session.cdp_client.send.Network.setUserAgentOverride(
                                params={"userAgent": ua}, session_id=cdp_session.session_id,
                            )
                        except Exception as ue:
                            logger.warning(f"[job={job_id}] iframe UA override failed: {ue}")
                    # inject_turnstile_token đã bao gồm postMessage + global + invoke onTurnstileSuccess
                    await inject_turnstile_token(page, token)
                    return ActionResult(
                        extracted_content=f"Turnstile iframe solved (sitekey={sk}, token len={len(token)}). Click submit now — button should be enabled.",
                        include_in_memory=True,
                    )

                if ctype == "recaptcha_v2":
                    sk = info.get("sitekey") or ""
                    token = await capsolver.solve_recaptcha_v2(page_url, sk, invisible=bool(info.get("invisible")))
                    await inject_recaptcha_token(page, token)
                    return ActionResult(extracted_content=f"reCAPTCHA v2 auto-solved (token len={len(token)}); click submit.", include_in_memory=True)

                if ctype == "recaptcha_v2_enterprise":
                    sk = info.get("sitekey") or ""
                    token = await capsolver.solve_recaptcha_v2_enterprise(page_url, sk)
                    await inject_recaptcha_token(page, token)
                    return ActionResult(extracted_content=f"reCAPTCHA v2 Enterprise solved; click submit.", include_in_memory=True)

                if ctype == "recaptcha_v3":
                    sk = info.get("sitekey") or ""
                    token = await capsolver.solve_recaptcha_v3(page_url, sk, action="submit")
                    await inject_recaptcha_token(page, token)
                    return ActionResult(extracted_content=f"reCAPTCHA v3 auto-solved; click submit.", include_in_memory=True)

                if ctype == "recaptcha_v3_enterprise":
                    sk = info.get("sitekey") or ""
                    token = await capsolver.solve_recaptcha_v3_enterprise(page_url, sk, action="submit")
                    await inject_recaptcha_token(page, token)
                    return ActionResult(extracted_content=f"reCAPTCHA v3 Enterprise solved; click submit.", include_in_memory=True)

                if ctype == "hcaptcha":
                    sk = info.get("sitekey") or ""
                    token = await capsolver.solve_hcaptcha(page_url, sk)
                    await page.evaluate(
                        "(t) => document.querySelectorAll('textarea[name=\"h-captcha-response\"], textarea[name=\"g-recaptcha-response\"]').forEach(i => i.value = t)",
                        token,
                    )
                    return ActionResult(extracted_content=f"hCaptcha auto-solved; click submit.", include_in_memory=True)

                if ctype == "hcaptcha_enterprise":
                    sk = info.get("sitekey") or ""
                    token = await capsolver.solve_hcaptcha_enterprise(page_url, sk)
                    await page.evaluate(
                        "(t) => document.querySelectorAll('textarea[name=\"h-captcha-response\"], textarea[name=\"g-recaptcha-response\"]').forEach(i => i.value = t)",
                        token,
                    )
                    return ActionResult(extracted_content=f"hCaptcha Enterprise solved; click submit.", include_in_memory=True)

                if ctype == "mtcaptcha":
                    sk = info.get("sitekey") or ""
                    token = await capsolver.solve_mtcaptcha(page_url, sk)
                    await page.evaluate(
                        "(t) => { window.mtcaptchaConfig = window.mtcaptchaConfig || {}; document.querySelectorAll('input[name=\"mtcaptcha-verifiedtoken\"]').forEach(i => i.value = t); if (window.mtcaptcha && typeof window.mtcaptcha.getVerifiedToken === 'function') { /* stub */ } }",
                        token,
                    )
                    return ActionResult(extracted_content=f"MTCaptcha solved; click submit.", include_in_memory=True)

                if ctype == "funcaptcha":
                    pk = info.get("pkey") or ""
                    token = await capsolver.solve_funcaptcha(page_url, pk, surl="https://client-api.arkoselabs.com")
                    await page.evaluate(
                        "(t) => document.querySelectorAll('input[name=\"fc-token\"], input[name=\"verification-token\"]').forEach(i => i.value = t)",
                        token,
                    )
                    return ActionResult(extracted_content=f"FunCaptcha auto-solved; click submit.", include_in_memory=True)

                if ctype == "geetest_v4":
                    cid = info.get("captchaId") or ""
                    sol = await capsolver.solve_geetest(page_url, captcha_id=cid)
                    await page.evaluate("(s) => { window.__capsolver_geetest = s; }", sol)
                    return ActionResult(extracted_content=f"GeeTest v4 auto-solved (saved in window.__capsolver_geetest). Form submit may pick it up automatically.", include_in_memory=True)

                if ctype == "image_to_text":
                    image_src = info.get("image_src") or ""
                    # fetch ảnh qua page context → base64
                    b64 = await page.evaluate(
                        """async (src) => {
                            const r = await fetch(src, {credentials: 'include'});
                            const buf = await r.arrayBuffer();
                            const bytes = new Uint8Array(buf);
                            let bin = '';
                            for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
                            return btoa(bin);
                        }""",
                        image_src,
                    )
                    if isinstance(b64, str):
                        b64 = b64.strip().strip('"')
                    text = await capsolver.solve_image_to_text(b64)
                    return ActionResult(extracted_content=f"Image captcha OCR result: '{text}'. Type vào input captcha tương ứng.", include_in_memory=True)

                if ctype == "datadome":
                    captcha_url = info.get("captchaUrl") or ""
                    ua_raw = await page.evaluate("() => navigator.userAgent")
                    ua = ua_raw.strip('"') if isinstance(ua_raw, str) else ""
                    cookie = await capsolver.solve_datadome(captcha_url, ua)
                    # Cookie format: "datadome=...; Max-Age=...; Domain=; Path=/; ..."
                    name_value = cookie.split(";")[0]
                    name, _, value = name_value.partition("=")
                    host = page_url.split("/")[2] if "/" in page_url else ""
                    try:
                        await browser_session._cdp_set_cookies([{
                            "name": name.strip(),
                            "value": value.strip(),
                            "domain": "." + host,
                            "path": "/",
                            "secure": True,
                            "sameSite": "Lax",
                        }])
                    except Exception as ce:
                        logger.warning(f"[job={job_id}] DataDome CDP cookie set failed: {ce}")
                    await page.reload()
                    return ActionResult(extracted_content="DataDome cookie injected and page reloaded.", include_in_memory=True)

                if ctype == "cloudflare_interstitial":
                    res = await capsolver.solve_cloudflare_challenge(page_url)
                    await inject_cookies_and_reload(browser_session, page, res.get("cookies") or {}, page_url)
                    return ActionResult(extracted_content="Cloudflare interstitial bypassed; page reloaded.", include_in_memory=True)

                if ctype == "aws_waf":
                    res = await capsolver.solve_aws_waf(page_url)
                    await inject_cookies_and_reload(browser_session, page, res.get("cookies") or {}, page_url)
                    return ActionResult(extracted_content="AWS WAF bypassed; page reloaded.", include_in_memory=True)

                return ActionResult(extracted_content=f"Detected captcha type '{ctype}' but no solver path matched.", include_in_memory=True)
            except Exception as e:
                logger.exception(f"[job={job_id}] solve_captcha_auto failed")
                return ActionResult(
                    extracted_content=f"Auto-solve failed: {type(e).__name__}: {e}",
                    include_in_memory=True,
                )

        @tools.action(
            description=(
                "Solve Cloudflare Turnstile CAPTCHA. Call when you see a Cloudflare challenge "
                "iframe (challenges.cloudflare.com) or div.cf-turnstile on the page. "
                "Pass sitekey = value of data-sitekey attribute on the turnstile element. "
                "Optional action/cdata = value of data-action / data-cdata if present (some sites require)."
            )
        )
        async def solve_cloudflare_turnstile(sitekey: str, browser_session, action: str = "", cdata: str = "") -> ActionResult:
            try:
                page = await browser_session.get_current_page()
                page_url = await page.get_url()
                # Reset widget trước (phòng khi đang ở 'Verification failed').
                try:
                    await page.evaluate(
                        "() => { try { if (window.turnstile && typeof window.turnstile.reset === 'function') window.turnstile.reset(); } catch(e) {} return true; }"
                    )
                except Exception:
                    pass
                res = await capsolver.solve_turnstile(page_url, sitekey, action, cdata)
                token = res["token"]
                ua = (res.get("user_agent") or "").strip()
                if ua:
                    try:
                        cdp_session = await browser_session.get_or_create_cdp_session(target_id=None)
                        await cdp_session.cdp_client.send.Network.setUserAgentOverride(
                            params={"userAgent": ua},
                            session_id=cdp_session.session_id,
                        )
                    except Exception as ue:
                        logger.warning(f"[job={job_id}] Turnstile UA override failed: {ue}")
                await inject_turnstile_token(page, token)
                return ActionResult(
                    extracted_content=f"Turnstile solved via CapSolver (token len={len(token)}, UA pinned). Click submit now.",
                    include_in_memory=True,
                )
            except Exception as e:
                return ActionResult(
                    extracted_content=f"Turnstile solve failed: {type(e).__name__}: {e}",
                    include_in_memory=True,
                )

        @tools.action(
            description=(
                "Click trực tiếp vào checkbox 'Verify you are human' của Cloudflare Turnstile widget. "
                "Dùng khi widget visible (KHÔNG phải full-page interstitial). "
                "Browser CloakBrowser stealth fingerprint thường pass ngay sau click — nhanh và "
                "reliable hơn CapSolver (tránh UA/IP mismatch). KHÔNG cần tham số."
            )
        )
        async def click_cloudflare_checkbox(browser_session) -> ActionResult:
            try:
                page = await browser_session.get_current_page()
                ok = await click_turnstile_checkbox(page, timeout_ms=12000)
                if ok:
                    return ActionResult(extracted_content="Turnstile checkbox passed — click submit now.", include_in_memory=True)
                return ActionResult(
                    extracted_content="Turnstile checkbox clicked but no token detected. Try `solve_cloudflare_turnstile(sitekey)` or `solve_captcha_auto()` next.",
                    include_in_memory=True,
                )
            except Exception as e:
                return ActionResult(extracted_content=f"Click checkbox failed: {type(e).__name__}: {e}", include_in_memory=True)

        @tools.action(
            description=(
                "Solve reCAPTCHA v2 checkbox. Call when you see div.g-recaptcha or iframe from www.google.com/recaptcha. "
                "Pass sitekey = value of data-sitekey on .g-recaptcha element."
            )
        )
        async def solve_recaptcha_v2(sitekey: str, browser_session) -> ActionResult:
            try:
                page = await browser_session.get_current_page()
                page_url = await page.get_url()
                token = await capsolver.solve_recaptcha_v2(page_url, sitekey)
                await inject_recaptcha_token(page, token)
                return ActionResult(
                    extracted_content=f"reCAPTCHA v2 solved & injected (token len={len(token)}). Now click submit.",
                    include_in_memory=True,
                )
            except Exception as e:
                return ActionResult(
                    extracted_content=f"reCAPTCHA solve failed: {type(e).__name__}: {e}",
                    include_in_memory=True,
                )

        @tools.action(
            description=(
                "Solve hCaptcha. Call when you see div.h-captcha or iframe from hcaptcha.com. "
                "Pass sitekey = value of data-sitekey on .h-captcha element."
            )
        )
        async def solve_hcaptcha(sitekey: str, browser_session) -> ActionResult:
            try:
                page = await browser_session.get_current_page()
                page_url = await page.get_url()
                token = await capsolver.solve_hcaptcha(page_url, sitekey)
                # hCaptcha cũng dùng textarea[name=h-captcha-response]
                await page.evaluate(
                    """(tok) => {
                        document.querySelectorAll('[name=\"h-captcha-response\"], [name=\"g-recaptcha-response\"]').forEach(el => {
                            el.value = tok;
                            el.innerHTML = tok;
                            el.dispatchEvent(new Event('change', {bubbles: true}));
                        });
                    }""",
                    token,
                )
                return ActionResult(
                    extracted_content=f"hCaptcha solved & injected (token len={len(token)}). Now click submit.",
                    include_in_memory=True,
                )
            except Exception as e:
                return ActionResult(
                    extracted_content=f"hCaptcha solve failed: {type(e).__name__}: {e}",
                    include_in_memory=True,
                )

        @tools.action(
            description=(
                "Solve reCAPTCHA v3 (invisible, score-based). Call when page has grecaptcha.execute() "
                "or invisible reCAPTCHA badge. Pass sitekey (data-sitekey) and pageAction (the "
                "action name passed to grecaptcha.execute, e.g. 'submit', 'login', 'signup')."
            )
        )
        async def solve_recaptcha_v3(sitekey: str, action: str, browser_session) -> ActionResult:
            try:
                page = await browser_session.get_current_page()
                page_url = await page.get_url()
                token = await capsolver.solve_recaptcha_v3(page_url, sitekey, action=action or "submit", min_score=0.7)
                await inject_recaptcha_token(page, token)
                return ActionResult(
                    extracted_content=f"reCAPTCHA v3 solved & injected (action={action}, token len={len(token)}). Now click submit.",
                    include_in_memory=True,
                )
            except Exception as e:
                return ActionResult(
                    extracted_content=f"reCAPTCHA v3 solve failed: {type(e).__name__}: {e}",
                    include_in_memory=True,
                )

        @tools.action(
            description=(
                "Solve FunCaptcha / Arkose Labs challenge (rotate images, etc). Call when you see "
                "iframe from arkoselabs.com or 'funcaptcha'. Pass public_key (data-pkey attribute "
                "on the funcaptcha element, e.g. '3D6F2C0E-...'). Optional surl = funcaptcha API subdomain."
            )
        )
        async def solve_funcaptcha(public_key: str, surl: str, browser_session) -> ActionResult:
            try:
                page = await browser_session.get_current_page()
                page_url = await page.get_url()
                token = await capsolver.solve_funcaptcha(page_url, public_key, surl)
                # FunCaptcha token thường được điền vào input[name=fc-token] hoặc verification-token
                await page.evaluate(
                    """(tok) => {
                        document.querySelectorAll('input[name="fc-token"], input[name="verification-token"], #FunCaptcha-Token').forEach(i => {
                            i.value = tok;
                            i.dispatchEvent(new Event('change', {bubbles: true}));
                        });
                    }""",
                    token,
                )
                return ActionResult(
                    extracted_content=f"FunCaptcha solved & injected (token len={len(token)}). Now click submit.",
                    include_in_memory=True,
                )
            except Exception as e:
                return ActionResult(
                    extracted_content=f"FunCaptcha solve failed: {type(e).__name__}: {e}",
                    include_in_memory=True,
                )

        @tools.action(
            description=(
                "Bypass AWS WAF challenge page (used by many SaaS sites). Call when page shows "
                "'Verify you are human' from AWS WAF or stuck on aws-waf JS challenge. "
                "Solver gets aws-waf-token cookies and injects them; page will be reloaded."
            )
        )
        async def solve_aws_waf_challenge(browser_session) -> ActionResult:
            try:
                page = await browser_session.get_current_page()
                page_url = await page.get_url()
                cookies = await capsolver.solve_aws_waf(page_url)
                await inject_cookies_and_reload(page, cookies, page_url)
                return ActionResult(
                    extracted_content=f"AWS WAF cookies injected ({len(cookies)} keys), page reloaded. Continue with form.",
                    include_in_memory=True,
                )
            except Exception as e:
                return ActionResult(
                    extracted_content=f"AWS WAF solve failed: {type(e).__name__}: {e}",
                    include_in_memory=True,
                )

        @tools.action(
            description=(
                "Bypass Cloudflare full-page interstitial (5-second JS check / 'Verify you are human' from Cloudflare). "
                "This is DIFFERENT from the Turnstile widget — use this when the ENTIRE page is the Cloudflare challenge "
                "(not just a checkbox on the signup form). Solver gets cf_clearance cookies; page will be reloaded."
            )
        )
        async def solve_cloudflare_interstitial(browser_session) -> ActionResult:
            try:
                page = await browser_session.get_current_page()
                page_url = await page.get_url()
                res = await capsolver.solve_cloudflare_challenge(page_url)
                await inject_cookies_and_reload(page, res.get("cookies") or {}, page_url)
                return ActionResult(
                    extracted_content=f"Cloudflare cf_clearance injected, page reloaded. Now proceed to signup form.",
                    include_in_memory=True,
                )
            except Exception as e:
                return ActionResult(
                    extracted_content=f"Cloudflare challenge solve failed: {type(e).__name__}: {e}",
                    include_in_memory=True,
                )

        logger.info(f"[job={job_id}] CapSolver tools enabled (balance check skipped)")
    else:
        logger.warning(f"[job={job_id}] CapSolver disabled — no CAPSOLVER_API_KEY")

    # 4b. SMS OTP tools (5sim) — chỉ đăng ký khi có API key
    sms_service = SmsOtpService()
    sms_state: dict = {"rental_id": "", "phone": ""}
    if sms_service.enabled:
        @tools.action(
            description=(
                "Rent a temporary phone number from SMS provider (5sim) for OTP verification. "
                "Call this when the signup form requires phone number verification via SMS. "
                "Returns the phone number to enter into the form. After form submit, "
                "call `read_sms_otp_code` to fetch the SMS code."
            )
        )
        async def request_sms_phone_number() -> ActionResult:
            try:
                # Override per-program nếu có preset; rỗng = SmsOtpService dùng default env
                country_override = str(program.get("sms_country_id") or "")
                service_override = str(program.get("sms_service_id") or "")
                info = await sms_service.buy_number(
                    country=country_override,
                    product=service_override,
                )
                sms_state["rental_id"] = info["rental_id"]
                sms_state["phone"] = info["phone"]
                return ActionResult(
                    extracted_content=f"Phone rented: {info['phone']} (rental_id={info['rental_id']}). Enter this phone number into the form, then submit. After submit, call read_sms_otp_code.",
                    include_in_memory=True,
                )
            except Exception as e:
                return ActionResult(
                    extracted_content=f"SMS rent failed: {type(e).__name__}: {e}. Report failed with 'SMS_PROVIDER_ERROR'.",
                    include_in_memory=True,
                )

        @tools.action(
            description=(
                "Poll SMS provider for the OTP code sent to the rented phone number. "
                "Call AFTER you submitted the form with the rented phone. "
                "Returns the OTP code digits to enter into the verification field."
            )
        )
        async def read_sms_otp_code(timeout_sec: int = 0) -> ActionResult:
            if not sms_state.get("rental_id"):
                return ActionResult(
                    extracted_content="No active SMS rental. Call request_sms_phone_number first.",
                    include_in_memory=True,
                )
            timeout = timeout_sec if timeout_sec > 0 else settings.sms_otp_timeout_sec
            try:
                code = await sms_service.wait_for_code(sms_state["rental_id"], timeout_sec=timeout)
                # mark complete (free up number)
                await sms_service.finish(sms_state["rental_id"])
                return ActionResult(
                    extracted_content=f"SMS OTP code received: {code}. Enter this code into the verification field on the form.",
                    include_in_memory=True,
                )
            except Exception as e:
                await sms_service.cancel(sms_state["rental_id"])
                return ActionResult(
                    extracted_content=f"SMS OTP wait failed: {type(e).__name__}: {e}",
                    include_in_memory=True,
                )

        logger.info(f"[job={job_id}] SMS OTP tools enabled (provider={sms_service.provider})")
    else:
        logger.warning(f"[job={job_id}] SMS OTP disabled — no SMS_OTP_API_KEY")

    # 4c. Email verification tool (IMAP) — chỉ đăng ký khi có IMAP credentials
    imap_user_cfg = (profile.get("imap") or {}).get("user") or settings.imap_user
    imap_pass_cfg = (profile.get("imap") or {}).get("password") or settings.imap_password
    if imap_user_cfg and imap_pass_cfg:
        @tools.action(
            description=(
                "Wait for verification email and return its OTP code and/or verification link. "
                "Call AFTER submitting the signup form when the site says 'we sent you an email'. "
                "Optional sender_contains: filter emails by sender domain/name (e.g. 'webflow'). "
                "Optional want_link: set to true if site sends a click-link instead of code. "
                "Returns: code (digits) and/or link (URL to visit)."
            )
        )
        async def read_email_verification(sender_contains: str = "", want_link: bool = False, timeout_sec: int = 0) -> ActionResult:
            timeout = timeout_sec if timeout_sec > 0 else settings.imap_timeout_sec
            try:
                res = await wait_for_verification(
                    profile,
                    sender_contains=sender_contains,
                    want_link=want_link,
                    timeout_sec=timeout,
                )
                code = res.get("code") or ""
                link = res.get("link") or ""
                subject = res.get("subject") or ""
                msg_parts = [f"Email received from '{res.get('from','')}' subject='{subject}'."]
                if code:
                    msg_parts.append(f"OTP code: {code}")
                if link:
                    msg_parts.append(f"Verification link: {link}")
                if not code and not link:
                    msg_parts.append("No code/link found in email body.")
                return ActionResult(
                    extracted_content=" | ".join(msg_parts),
                    include_in_memory=True,
                )
            except Exception as e:
                return ActionResult(
                    extracted_content=f"Email verification failed: {type(e).__name__}: {e}",
                    include_in_memory=True,
                )

        logger.info(f"[job={job_id}] Email verification tool enabled (user={imap_user_cfg})")
    else:
        logger.warning(f"[job={job_id}] Email verification disabled — no IMAP credentials (profile.imap or env)")


    screenshot_path: str | None = None
    try:
        agent = Agent(
            task=task,
            llm=llm,
            browser_session=browser_session,
            tools=tools,
            use_vision=True,
            max_actions_per_step=3,
        )
        history = await agent.run(max_steps=settings.signup_max_steps)
        parsed_result = _parse_agent_result(history)
        screenshot_path = _extract_last_screenshot_from_history(history, job_id, program_id, str(profile_id))
        parsed_result["screenshot"] = screenshot_path
        parsed_result["duration_sec"] = round(time.time() - started, 2)
        return parsed_result
    except Exception as e:
        logger.exception(f"run_signup_attempt error: {e}")
        return {
            "status": "error",
            "message": f"{type(e).__name__}: {e}"[:500],
            "steps": 0,
            "screenshot": screenshot_path,
            "duration_sec": round(time.time() - started, 2),
        }
    finally:
        # Đóng triệt để trình duyệt — tránh rác process Chromium sau khi job xong.
        try:
            await browser_session.close()
        except Exception as e:
            logger.warning(f"[job={job_id}] browser_session.close() failed: {e}")
        try:
            await browser_session.kill()
        except Exception:
            pass
        logger.info(f"[job={job_id}] browser session closed")
