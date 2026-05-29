"""
SimilarWeb cookie helper — port đơn giản từ api-adecos/.../similarweb_utils.py.

Đơn giản hoá:
- Cache cookie vào file (data/similarweb_cookie.txt) thay vì Redis.
- Không distributed lock (chỉ 1 process).
- Selenium login Pro account → extract cookie string → save file.
"""

from __future__ import annotations

import json
import logging
import random
import time
import urllib.request
from pathlib import Path
from urllib.parse import urljoin

from app.core.config import settings

logger = logging.getLogger(__name__)

SIMILARWEB_LOGIN_URL = "https://secure.similarweb.com/account/login"
SIMILARWEB_PRO_URL = "https://pro.similarweb.com/"

USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36"
)

COOKIE_FIELDS = [
    ".SGTOKEN.SIMILARWEB.COM",
    "_sw_pin",
    "locale",
    "_dd_s",
    "_sw_pin_ps",
    "aws-waf-token",
    "RESET_PRO_CACHE",
    "sgID",
]


def _cookie_file() -> Path:
    return settings.data_path("similarweb_cookie.txt")


def load_cached_cookie() -> str | None:
    p = _cookie_file()
    if not p.exists():
        return None
    try:
        v = p.read_text(encoding="utf-8").strip()
        return v or None
    except Exception:
        return None


def save_cookie(cookie_string: str) -> None:
    p = _cookie_file()
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(cookie_string, encoding="utf-8")


def invalidate_cookie() -> None:
    try:
        _cookie_file().unlink(missing_ok=True)
    except Exception:
        pass


# ---------------------------------------------------------------------------
# Selenium (blocking)
# ---------------------------------------------------------------------------


def _human_delay(min_sec: float = 0.5, max_sec: float = 2.0) -> None:
    time.sleep(random.uniform(min_sec, max_sec))


def _wait_for_hub(hub_url: str, timeout: float = 30) -> None:
    deadline = time.time() + timeout
    status_url = urljoin(hub_url.rstrip("/") + "/", "status")
    req = urllib.request.Request(
        status_url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"}
    )
    last_err: Exception | None = None
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(req, timeout=5.0) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                if data.get("value", {}).get("ready", False):
                    return
        except Exception as e:
            last_err = e
        time.sleep(0.5)
    raise RuntimeError(f"Selenium Hub not ready: {hub_url} ({last_err})")


def _create_driver(headless: bool = False, timeout: int = 120):
    from selenium import webdriver
    from selenium.webdriver.chrome.options import Options as ChromeOptions

    hub_url = settings.selenium_hub_url
    if not hub_url:
        raise RuntimeError("SELENIUM_HUB_URL chưa cấu hình trong .env")

    _wait_for_hub(hub_url)

    opts = ChromeOptions()
    if headless:
        opts.add_argument("--headless=new")
    opts.add_argument("--no-sandbox")
    opts.add_argument("--disable-dev-shm-usage")
    opts.add_argument(f"--user-agent={USER_AGENT}")
    opts.add_argument("--user-data-dir=/home/seluser/selenium")
    opts.add_argument("--profile-directory=Default")

    driver = webdriver.Remote(command_executor=hub_url, options=opts)
    driver.set_page_load_timeout(timeout)
    try:
        driver.maximize_window()
    except Exception:
        pass
    return driver


def _get_page_title(driver) -> str | None:
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support import expected_conditions as EC
    from selenium.webdriver.support.ui import WebDriverWait

    try:
        el = WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, "h2.sc-jhrdCu.duMJhk"))
        )
        return el.text.strip()
    except Exception:
        return None


def _login(driver, email: str, password: str) -> None:
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support import expected_conditions as EC
    from selenium.webdriver.support.ui import WebDriverWait

    driver.get(SIMILARWEB_LOGIN_URL)
    WebDriverWait(driver, 15).until(
        lambda d: d.execute_script("return document.readyState") == "complete"
    )
    _human_delay(1, 2)
    WebDriverWait(driver, 15).until(
        EC.presence_of_element_located((By.CSS_SELECTOR, "#input-email"))
    ).send_keys(email)
    _human_delay(1, 2)
    WebDriverWait(driver, 15).until(
        EC.presence_of_element_located((By.CSS_SELECTOR, "#input-password"))
    ).send_keys(password)
    _human_delay(1, 2)
    WebDriverWait(driver, 15).until(
        EC.element_to_be_clickable(
            (By.CSS_SELECTOR, '[data-automation-name="submit-button"]')
        )
    ).click()
    time.sleep(10)


def _wait_for_manual(driver, blocked_title: str, reason: str, timeout_minutes: int = 10) -> None:
    logger.warning(
        f"[SW] {reason} — mở noVNC để xử lý: {settings.novnc_url}"
    )
    max_attempts = timeout_minutes * 12
    for i in range(max_attempts):
        time.sleep(5)
        title = _get_page_title(driver)
        if title != blocked_title:
            return
        if i % 12 == 0:
            logger.info(f"[SW] đợi {reason}… ({i // 12}/{timeout_minutes} phút)")
    raise RuntimeError(f"Timeout {timeout_minutes} phút khi đợi {reason}")


def _ensure_session(driver, email: str, password: str) -> None:
    from selenium.webdriver.support.ui import WebDriverWait

    driver.get(SIMILARWEB_PRO_URL)
    WebDriverWait(driver, 15).until(
        lambda d: d.execute_script("return document.readyState") == "complete"
    )
    _human_delay(1, 2)
    title = _get_page_title(driver)
    if title == "Log In to Similarweb Platform":
        _login(driver, email, password)
        _human_delay(2, 3)
        title = _get_page_title(driver)
        if title == "New Device Detected":
            _wait_for_manual(driver, title, "device verification")
        elif title == "Set up your new password":
            _wait_for_manual(driver, title, "password reset")
        elif title == "Log In to Similarweb Platform":
            _wait_for_manual(driver, title, "manual login")


def _extract_cookie_string(driver) -> str:
    cookies = driver.get_cookies()
    cookie_dict = {c["name"]: c.get("value", "") for c in cookies}
    parts = [f"{n}={cookie_dict[n]}" for n in COOKIE_FIELDS if n in cookie_dict]
    return ";".join(parts)


def refresh_cookie_blocking(headless: bool = False) -> str:
    """Selenium login + extract cookie. BLOCKING — gọi qua asyncio.to_thread()."""
    email = settings.similarweb_email
    password = settings.similarweb_password
    if not email or not password:
        raise RuntimeError("SIMILARWEB_EMAIL / SIMILARWEB_PASSWORD chưa cấu hình")

    driver = _create_driver(headless=headless)
    try:
        _ensure_session(driver, email, password)
        cookie = _extract_cookie_string(driver)
        if not cookie:
            raise RuntimeError("Không extract được cookie từ Selenium session")
        save_cookie(cookie)
        return cookie
    finally:
        try:
            driver.quit()
        except Exception:
            pass


def build_headers(cookie: str) -> dict:
    return {
        "accept": "application/json",
        "accept-language": "vi,en-US;q=0.9,en;q=0.8",
        "content-type": "application/json; charset=utf-8",
        "referer": "https://pro.similarweb.com/",
        "sec-ch-ua": '"Chromium";v="142", "Microsoft Edge";v="142", "Not_A Brand";v="99"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Linux"',
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin",
        "user-agent": USER_AGENT,
        "x-requested-with": "XMLHttpRequest",
        "x-sw-page": "https://pro.similarweb.com",
        "cookie": cookie,
    }
