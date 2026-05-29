"""
Email verification reader — IMAP polling.

Đọc inbox để lấy:
  1. Verification code (digits) trong subject/body
  2. Verification link (URL chứa 'verify' / 'confirm' / 'activate')

Config từ profile['imap'] hoặc env (IMAP_HOST/PORT/SSL/USER/PASS).
Gmail: bật App Password ở https://myaccount.google.com/apppasswords.
"""

from __future__ import annotations

import asyncio
import email
import imaplib
import logging
import re
from email.header import decode_header
from typing import Any

from app.core.config import settings

logger = logging.getLogger(__name__)


class EmailReaderError(Exception):
    pass


def _resolve_imap_config(profile: dict) -> dict:
    """Merge profile.imap với env defaults."""
    p = (profile or {}).get("imap") or {}
    return {
        "host": p.get("host") or settings.imap_host or "imap.gmail.com",
        "port": int(p.get("port") or settings.imap_port or 993),
        "ssl": bool(p.get("ssl") if p.get("ssl") is not None else settings.imap_ssl),
        "user": p.get("user") or profile.get("email") or settings.imap_user or "",
        "password": p.get("password") or settings.imap_password or "",
    }


def _decode_header_value(value: str) -> str:
    if not value:
        return ""
    parts = decode_header(value)
    out = []
    for text, enc in parts:
        if isinstance(text, bytes):
            try:
                out.append(text.decode(enc or "utf-8", errors="replace"))
            except Exception:
                out.append(text.decode("utf-8", errors="replace"))
        else:
            out.append(text)
    return "".join(out)


def _extract_text(msg) -> str:
    """Lấy body text+html từ email message."""
    parts = []
    if msg.is_multipart():
        for part in msg.walk():
            ctype = part.get_content_type()
            if ctype in ("text/plain", "text/html"):
                try:
                    payload = part.get_payload(decode=True) or b""
                    parts.append(payload.decode(part.get_content_charset() or "utf-8", errors="replace"))
                except Exception:
                    pass
    else:
        try:
            payload = msg.get_payload(decode=True) or b""
            parts.append(payload.decode(msg.get_content_charset() or "utf-8", errors="replace"))
        except Exception:
            pass
    return "\n".join(parts)


def _search_code(text: str, subject: str) -> str:
    """Tìm OTP code (4-8 digits) trong subject/body."""
    # Ưu tiên subject (thường ngắn gọn)
    for source in (subject, text):
        if not source:
            continue
        # Patterns thường gặp: "code: 123456", "your code is 123456", "verify 123456"
        m = re.search(
            r"(?:code|otp|verification|verify|confirm|pin)[^\d]{0,20}(\d{4,8})",
            source,
            re.IGNORECASE,
        )
        if m:
            return m.group(1)
    # Fallback: số 6-8 digits đứng riêng
    m = re.search(r"\b(\d{6,8})\b", text or "")
    if m:
        return m.group(1)
    m = re.search(r"\b(\d{4,5})\b", subject or "")
    if m:
        return m.group(1)
    return ""


def _search_verification_link(text: str, sender_domain: str = "") -> str:
    """Tìm link verify/confirm/activate trong body."""
    if not text:
        return ""
    # Tìm tất cả URL
    urls = re.findall(r"https?://[^\s\"'<>)]+", text)
    keywords = ("verify", "confirm", "activate", "validation", "validate", "/v/", "/email/")
    for url in urls:
        low = url.lower()
        if any(k in low for k in keywords):
            return url.rstrip(".,;:)")
    # Fallback: URL cùng domain với sender
    if sender_domain:
        for url in urls:
            if sender_domain.lower() in url.lower():
                return url.rstrip(".,;:)")
    return ""


def _fetch_verification_sync(
    *,
    host: str,
    port: int,
    ssl: bool,
    user: str,
    password: str,
    since_uid: int = 0,
    sender_contains: str = "",
    want_link: bool = False,
) -> dict:
    """
    Sync IMAP fetch (chạy trong executor). Return:
      {code: str, link: str, subject: str, from: str, max_uid: int}
    """
    if not user or not password:
        raise EmailReaderError("IMAP user/password chưa cấu hình (profile.imap hoặc env)")

    cls = imaplib.IMAP4_SSL if ssl else imaplib.IMAP4
    conn = cls(host, port)
    try:
        conn.login(user, password)
        conn.select("INBOX")

        # Lấy 20 email mới nhất
        typ, data = conn.search(None, "ALL")
        if typ != "OK":
            raise EmailReaderError(f"IMAP search failed: {typ}")
        ids = data[0].split()
        if not ids:
            return {"code": "", "link": "", "subject": "", "from": "", "max_uid": since_uid}

        latest = ids[-20:][::-1]  # newest first
        max_uid = since_uid
        for raw_id in latest:
            uid = int(raw_id)
            if uid > max_uid:
                max_uid = uid
            if uid <= since_uid:
                continue

            typ, msg_data = conn.fetch(raw_id, "(RFC822)")
            if typ != "OK" or not msg_data or not msg_data[0]:
                continue
            msg = email.message_from_bytes(msg_data[0][1])
            subject = _decode_header_value(msg.get("Subject", ""))
            sender = _decode_header_value(msg.get("From", ""))

            if sender_contains and sender_contains.lower() not in sender.lower() and sender_contains.lower() not in subject.lower():
                continue

            body = _extract_text(msg)

            if want_link:
                # Lấy domain sender để fallback
                m = re.search(r"@([\w\.-]+)", sender)
                domain = m.group(1) if m else ""
                link = _search_verification_link(body, domain)
                if link:
                    return {
                        "code": _search_code(body, subject),
                        "link": link,
                        "subject": subject,
                        "from": sender,
                        "max_uid": max_uid,
                    }
            else:
                code = _search_code(body, subject)
                if code:
                    return {
                        "code": code,
                        "link": _search_verification_link(body, ""),
                        "subject": subject,
                        "from": sender,
                        "max_uid": max_uid,
                    }

        return {"code": "", "link": "", "subject": "", "from": "", "max_uid": max_uid}
    finally:
        try:
            conn.logout()
        except Exception:
            pass


async def wait_for_verification(
    profile: dict,
    *,
    sender_contains: str = "",
    want_link: bool = False,
    timeout_sec: int = 180,
    poll_interval: float = 8.0,
) -> dict:
    """Async wrapper — poll IMAP cho đến khi thấy code/link."""
    cfg = _resolve_imap_config(profile)
    loop = asyncio.get_event_loop()
    deadline = loop.time() + timeout_sec
    last_uid = 0

    # Lần đầu: lấy max_uid hiện tại làm baseline (chỉ đọc email TỚI)
    try:
        baseline = await loop.run_in_executor(
            None,
            lambda: _fetch_verification_sync(
                host=cfg["host"], port=cfg["port"], ssl=cfg["ssl"],
                user=cfg["user"], password=cfg["password"],
                since_uid=10**12, sender_contains=sender_contains, want_link=want_link,
            ),
        )
        last_uid = baseline.get("max_uid") or 0
    except Exception as e:
        logger.warning(f"IMAP baseline failed: {e}")

    while loop.time() < deadline:
        try:
            res = await loop.run_in_executor(
                None,
                lambda: _fetch_verification_sync(
                    host=cfg["host"], port=cfg["port"], ssl=cfg["ssl"],
                    user=cfg["user"], password=cfg["password"],
                    since_uid=last_uid, sender_contains=sender_contains, want_link=want_link,
                ),
            )
            if res.get("code") or res.get("link"):
                return res
            last_uid = max(last_uid, res.get("max_uid") or 0)
        except Exception as e:
            logger.warning(f"IMAP poll error: {e}")
        await asyncio.sleep(poll_interval)

    raise EmailReaderError(f"Email verification timeout sau {timeout_sec}s (sender~'{sender_contains}')")
