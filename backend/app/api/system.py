"""System status endpoint — báo các config nào đã set, subsystem nào enable.

Dùng để FE hiển thị banner '⚠️ Thiếu config: ...' cho user biết cần điền key gì.
"""

import asyncio
import time

import httpx
from fastapi import APIRouter, Depends

from app.core.config import settings
from app.deps import get_current_user
from app.models import User
from app.services.captcha.capsolver import CapSolver
from app.services.signup.sms_otp import SmsOtpService
from app.services.storage import email_store, proxy_store

router = APIRouter(prefix="/api/system", tags=["system"])


def _mask(v: str) -> str:
    if not v:
        return ""
    if len(v) <= 8:
        return "***"
    return v[:4] + "***" + v[-4:]


@router.get("/status")
async def system_status(user: User = Depends(get_current_user)):
    """Trả về tình trạng config + subsystem.

    `enabled` = có thể chạy hay không.
    `note` = hướng dẫn fix nếu disabled.
    """
    # LLM
    llm_provider = ""
    if settings.gemini_api_key:
        llm_provider = "gemini"
    elif settings.openai_api_key:
        llm_provider = "openai"

    # IMAP & Proxy: ưu tiên Library (file-based) → fallback .env
    library_emails = email_store.list_emails(user.id) if user else []
    library_proxies = proxy_store.list_proxies(user.id) if user else []
    library_email_count = len(library_emails)
    library_proxy_count = len(library_proxies)
    # Chỉ tính là "verified" khi đã test kết nối thật thành công
    library_email_ok = sum(1 for e in library_emails if e.get("last_test_result") == "ok")
    library_proxy_ok = sum(1 for p in library_proxies if p.get("last_test_result") == "ok")

    imap_env_ok = bool(settings.imap_user and settings.imap_password)
    proxy_env_ok = bool(settings.proxy_url)
    # Khi user đã thêm vào Library nhưng chưa cái nào test ok → coi như chưa sẵn sàng
    # (kể cả env có set, vì agent sẽ ưu tiên Library). Tránh hiển thị xanh giả.
    imap_ok = (library_email_ok > 0) if library_email_count > 0 else imap_env_ok
    proxy_ok = (library_proxy_ok > 0) if library_proxy_count > 0 else proxy_env_ok

    subsystems = [
        {
            "key": "llm",
            "label": "LLM (Browser Agent)",
            "enabled": bool(llm_provider),
            "value": f"{llm_provider}:{settings.signup_llm_model}" if llm_provider else "",
            "required": True,
            "note": "" if llm_provider else "Thiếu GEMINI_API_KEY hoặc OPENAI_API_KEY → backend/.env",
        },
        {
            "key": "capsolver",
            "label": "CapSolver (CAPTCHA)",
            "enabled": bool(settings.capsolver_api_key),
            "value": _mask(settings.capsolver_api_key),
            "required": False,
            "note": "" if settings.capsolver_api_key
                else "Thiếu CAPSOLVER_API_KEY → site có Turnstile/reCAPTCHA/hCaptcha/FunCaptcha/WAF sẽ FAIL. Lấy key: https://capsolver.com",
        },
        {
            "key": "sms_otp",
            "label": f"SMS OTP ({settings.sms_otp_provider})",
            "enabled": bool(settings.sms_otp_api_key),
            "value": _mask(settings.sms_otp_api_key),
            "required": False,
            "note": "" if settings.sms_otp_api_key
                else (
                    "Thiếu SMS_OTP_API_KEY → site yêu cầu phone OTP sẽ FAIL. "
                    + (
                        "Lấy key: https://www.smspool.net/my/settings" if settings.sms_otp_provider == "smspool"
                        else "Lấy key: https://5sim.net/profile" if settings.sms_otp_provider == "5sim"
                        else "Lấy key từ provider hiện hành."
                    )
                ),
        },
        {
            "key": "imap_email",
            "label": "IMAP Email Verification",
            "enabled": imap_ok,
            "value": (
                f"Library: {library_email_ok}/{library_email_count} email đã test ok"
                if library_email_count > 0
                else (settings.imap_user if imap_env_ok else "")
            ),
            "required": False,
            "note": "" if imap_ok
                else (
                    f"Có {library_email_count} email trong Thư viện nhưng chưa cái nào test IMAP thành công. Bấm nút 'Test' tại /library?tab=email để kiểm tra app password."
                    if library_email_count > 0
                    else "Chưa có email nào trong Thư viện và IMAP_USER/IMAP_PASSWORD (env) cũng trống → site yêu cầu email verify sẽ FAIL. Thêm email tại /library?tab=email hoặc Gmail App Password: https://myaccount.google.com/apppasswords"
                ),
        },
        {
            "key": "proxy",
            "label": "Proxy (residential rotating)",
            "enabled": proxy_ok,
            "value": (
                f"Library: {library_proxy_ok}/{library_proxy_count} proxy đã test ok"
                if library_proxy_count > 0
                else (settings.proxy_url.split("@")[-1] if settings.proxy_url else "")
            ),
            "required": False,
            "note": "" if proxy_ok
                else (
                    f"Có {library_proxy_count} proxy trong Thư viện nhưng chưa cái nào test thành công. Bấm nút 'Test' tại /library?tab=proxy."
                    if library_proxy_count > 0
                    else "Khuyến nghị thêm proxy tại /library?tab=proxy hoặc set PROXY_URL trong .env để tránh ban IP khi đăng ký nhiều site."
                ),
        },
    ]

    missing_required = [s for s in subsystems if s["required"] and not s["enabled"]]
    missing_optional = [s for s in subsystems if not s["required"] and not s["enabled"]]

    return {
        "app": settings.app_name,
        "ready": len(missing_required) == 0,
        "fully_configured": len(missing_required) == 0 and len(missing_optional) == 0,
        "subsystems": subsystems,
        "missing_required": [s["key"] for s in missing_required],
        "missing_optional": [s["key"] for s in missing_optional],
        "signup_max_steps": settings.signup_max_steps,
    }


# ---------------------- Real connectivity tests ---------------------- #


async def _test_llm() -> dict:
    """Light check: verify key exists. Real ping tốn token, không nên auto."""
    started = time.time()
    if settings.gemini_api_key:
        # Verify key format + ping models.list (free, không tốn token)
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                r = await client.get(
                    "https://generativelanguage.googleapis.com/v1beta/models",
                    params={"key": settings.gemini_api_key},
                )
            if r.status_code == 200:
                return {"ok": True, "provider": "gemini", "model": settings.signup_llm_model, "elapsed_ms": int((time.time() - started) * 1000)}
            return {"ok": False, "provider": "gemini", "error": f"HTTP {r.status_code}: {r.text[:120]}", "elapsed_ms": int((time.time() - started) * 1000)}
        except Exception as e:
            return {"ok": False, "provider": "gemini", "error": f"{e.__class__.__name__}: {e}", "elapsed_ms": int((time.time() - started) * 1000)}
    if settings.openai_api_key:
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                r = await client.get(
                    "https://api.openai.com/v1/models",
                    headers={"Authorization": f"Bearer {settings.openai_api_key}"},
                )
            if r.status_code == 200:
                return {"ok": True, "provider": "openai", "model": "gpt-4o", "elapsed_ms": int((time.time() - started) * 1000)}
            return {"ok": False, "provider": "openai", "error": f"HTTP {r.status_code}: {r.text[:120]}", "elapsed_ms": int((time.time() - started) * 1000)}
        except Exception as e:
            return {"ok": False, "provider": "openai", "error": f"{e.__class__.__name__}: {e}", "elapsed_ms": int((time.time() - started) * 1000)}
    return {"ok": False, "error": "Chưa có GEMINI_API_KEY hoặc OPENAI_API_KEY trong .env"}


async def _test_capsolver() -> dict:
    started = time.time()
    if not settings.capsolver_api_key:
        return {"ok": False, "error": "Chưa có CAPSOLVER_API_KEY trong .env"}
    try:
        bal = await CapSolver(settings.capsolver_api_key).balance()
        return {"ok": True, "balance": f"{bal:.3f}", "currency": "USD", "elapsed_ms": int((time.time() - started) * 1000)}
    except Exception as e:
        return {"ok": False, "error": f"{e.__class__.__name__}: {e}", "elapsed_ms": int((time.time() - started) * 1000)}


async def _test_sms() -> dict:
    started = time.time()
    svc = SmsOtpService()
    if not svc.enabled:
        return {"ok": False, "error": "Chưa có SMS_OTP_API_KEY trong .env"}
    r = await svc.check_balance()
    r["elapsed_ms"] = int((time.time() - started) * 1000)
    r["provider"] = svc.provider
    return r


async def _test_imap_library(user_id: int) -> dict:
    """Pick email mới nhất trong Library + thử IMAP login (1 cái thôi)."""
    from app.api.emails import _imap_login_test
    started = time.time()
    emails = email_store.list_emails(user_id)
    if not emails:
        return {"ok": False, "error": "Thư viện chưa có email nào. Thêm tại /library?tab=email"}
    # Ưu tiên email đã test ok trước
    target = next((e for e in emails if e.get("last_test_result") == "ok"), None) or emails[0]
    provider = (target.get("provider") or "").lower()
    host_map = {
        "gmail": "imap.gmail.com",
        "outlook": "outlook.office365.com",
        "hotmail": "outlook.office365.com",
        "yahoo": "imap.mail.yahoo.com",
    }
    host = target.get("imap_host") or host_map.get(provider) or "imap.gmail.com"
    port = int(target.get("imap_port") or 993)
    try:
        n = await asyncio.to_thread(
            _imap_login_test, host, port, True,
            target.get("address") or "", target.get("password") or "", 12,
        )
        return {"ok": True, "email": target.get("address"), "inbox_count": n,
                "elapsed_ms": int((time.time() - started) * 1000)}
    except Exception as e:
        return {"ok": False, "email": target.get("address"),
                "error": f"{e.__class__.__name__}: {e}",
                "elapsed_ms": int((time.time() - started) * 1000)}


async def _test_proxy_library(user_id: int) -> dict:
    started = time.time()
    proxies = proxy_store.list_proxies(user_id)
    if not proxies:
        return {"ok": False, "error": "Thư viện chưa có proxy nào. Thêm tại /library?tab=proxy"}
    target = next((p for p in proxies if p.get("last_test_result") == "ok"), None) or proxies[0]
    url = target.get("url") or ""
    if not url:
        return {"ok": False, "error": "Proxy đầu tiên không có URL hợp lệ"}
    try:
        async with httpx.AsyncClient(proxy=url, timeout=12, follow_redirects=True) as client:
            r = await client.get("https://api.ipify.org?format=json")
            r.raise_for_status()
            ip = r.json().get("ip", "")
        return {"ok": True, "ip": ip, "proxy_name": target.get("name") or target.get("id"),
                "elapsed_ms": int((time.time() - started) * 1000)}
    except Exception as e:
        return {"ok": False, "proxy_name": target.get("name") or target.get("id"),
                "error": f"{e.__class__.__name__}: {e}",
                "elapsed_ms": int((time.time() - started) * 1000)}


_TEST_DISPATCH = {
    "llm": lambda uid: _test_llm(),
    "capsolver": lambda uid: _test_capsolver(),
    "sms": lambda uid: _test_sms(),
    "imap": lambda uid: _test_imap_library(uid),
    "proxy": lambda uid: _test_proxy_library(uid),
}


@router.post("/test-one")
async def test_one(key: str, user: User = Depends(get_current_user)):
    """Test 1 subsystem theo `key` ∈ {llm, capsolver, sms, imap, proxy}."""
    fn = _TEST_DISPATCH.get(key)
    if not fn:
        return {"ok": False, "error": f"Unknown key: {key}"}
    t0 = time.time()
    r = await fn(user.id)
    if "elapsed_ms" not in r:
        r["elapsed_ms"] = int((time.time() - t0) * 1000)
    return {"key": key, "result": r}


@router.post("/test-all")
async def test_all(user: User = Depends(get_current_user)):
    """Chạy song song mọi test kết nối thật → trả về detail từng subsystem.

    Trả {results: {llm, capsolver, sms, imap, proxy}, started_at, total_ms}
    """
    t0 = time.time()
    llm, cap, sms, imap, proxy = await asyncio.gather(
        _test_llm(),
        _test_capsolver(),
        _test_sms(),
        _test_imap_library(user.id),
        _test_proxy_library(user.id),
        return_exceptions=False,
    )
    return {
        "results": {
            "llm": llm,
            "capsolver": cap,
            "sms": sms,
            "imap": imap,
            "proxy": proxy,
        },
        "total_ms": int((time.time() - t0) * 1000),
    }
