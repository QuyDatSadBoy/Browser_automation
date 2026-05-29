"""Wrapper Playwright async dùng CloakBrowser stealth binary.

CloakBrowser là Chromium được patch ở level C++ (canvas, WebGL, audio, GPU,
UA, navigator.webdriver, CDP signals…) → pass Cloudflare/FingerprintJS/
BrowserScan. Drop-in Playwright async API.

LƯU Ý: chạy backend với `uvicorn --loop asyncio` để tránh uvloop subprocess
pipe hang (warning từ chính CloakBrowser).
"""
from __future__ import annotations
from typing import Any, Optional
from browser_use import BrowserSession  # type: ignore[import-not-found]
from app.core.config import settings
from app.core.logger import get_logger

log = get_logger("browser.session")


_BASE_STEALTH_ARGS = [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--disable-blink-features=AutomationControlled",
    "--disable-features=IsolateOrigins,site-per-process,AutomationControlled",
    "--disable-infobars",
    "--no-first-run",
    "--no-default-browser-check",
]


async def get_browser(headless: Optional[bool] = None):
    """Khởi tạo CloakBrowser. Trả về Playwright async Browser instance.

    Mỗi crawl gọi 1 lần → 1 process Chromium riêng → tự đóng khi xong.
    """
    try:
        from cloakbrowser import launch_async  # type: ignore
    except ImportError:
        log.warning("cloakbrowser chưa cài — chạy: pip install cloakbrowser")
        return None

    is_headless = settings.headless if headless is None else headless
    args = ["--no-sandbox", "--disable-dev-shm-usage"]
    log.info("Khởi tạo CloakBrowser headless=%s", is_headless)
    return await launch_async(headless=is_headless, args=args)


def build_signup_browser_session_kwargs(headless: bool, proxy_url: str | None = None) -> dict[str, Any]:
    """Build BrowserSession kwargs with CloakBrowser binary when available.

    `proxy_url` cho phép override proxy theo từng phiên (mỗi profile/email có proxy riêng).
    Khi None → fallback `settings.proxy_url` từ .env.
    """
    kwargs: dict[str, Any] = {
        "headless": headless,
        "disable_security": True,
        "user_agent": settings.signup_user_agent,
        "args": list(_BASE_STEALTH_ARGS),
        "keep_alive": False,  # bắt buộc đóng Chromium khi session.close() — tránh rác process
    }

    try:
        # Reuse CloakBrowser patched Chromium for browser-use.
        from cloakbrowser.browser import build_args, ensure_binary  # type: ignore

        kwargs["executable_path"] = ensure_binary()
        kwargs["args"] = build_args(True, list(_BASE_STEALTH_ARGS), headless=headless)
        log.info("Signup BrowserSession dùng CloakBrowser binary")
    except Exception as e:
        log.warning("Không lấy được CloakBrowser binary, fallback browser-use default: %s", e)

    effective_proxy = proxy_url or settings.proxy_url
    if effective_proxy:
        kwargs["proxy"] = {"server": effective_proxy, "bypass": settings.proxy_bypass}
        log.info("Signup BrowserSession dùng proxy: %s", effective_proxy.split("@")[-1])

    return kwargs


def create_signup_browser_session(headless: bool, proxy_url: str | None = None):
    """Factory for browser-use BrowserSession configured with CloakBrowser path/args."""
    return BrowserSession(**build_signup_browser_session_kwargs(headless, proxy_url=proxy_url))

