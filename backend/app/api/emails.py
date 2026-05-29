import asyncio
import imaplib
import time
from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException

from app.core.config import settings
from app.deps import get_current_user
from app.models import User
from app.schemas.email import EmailIn, EmailMeta, EmailOut, EmailBulkIn, EmailBulkOut, EmailTestOut
from app.services.storage import email_store

router = APIRouter(prefix="/api/emails", tags=["emails"])


@router.get("", response_model=List[EmailMeta])
async def list_emails(user: User = Depends(get_current_user)):
    return email_store.list_emails(user.id)


@router.post("", response_model=EmailOut)
async def create_email(body: EmailIn, user: User = Depends(get_current_user)):
    data = body.model_dump()
    if data.get("id") and email_store.get_email(user.id, data["id"]):
        raise HTTPException(400, "Email id đã tồn tại")
    if not data.get("address"):
        raise HTTPException(400, "Thiếu address")
    return email_store.save_email(user.id, data)


@router.get("/{eid}", response_model=EmailOut)
async def get_email(eid: str, user: User = Depends(get_current_user)):
    e = email_store.get_email(user.id, eid)
    if not e:
        raise HTTPException(404, "Không tìm thấy email")
    return e


@router.put("/{eid}", response_model=EmailOut)
async def update_email(eid: str, body: EmailIn, user: User = Depends(get_current_user)):
    if not email_store.get_email(user.id, eid):
        raise HTTPException(404, "Không tìm thấy email")
    data = body.model_dump()
    data["id"] = eid
    return email_store.save_email(user.id, data)


@router.delete("/{eid}")
async def delete_email(eid: str, user: User = Depends(get_current_user)):
    ok = email_store.delete_email(user.id, eid)
    if not ok:
        raise HTTPException(404, "Không tìm thấy email")
    return {"ok": True}


@router.post("/bulk-import", response_model=EmailBulkOut)
async def bulk_import_emails(body: EmailBulkIn, user: User = Depends(get_current_user)):
    return email_store.bulk_import(user.id, body.raw)


def _imap_login_test(host: str, port: int, ssl: bool, user: str, password: str, timeout: int) -> int:
    """Sync IMAP test: connect → login → SELECT INBOX → trả về số message. Raise nếu fail."""
    cls = imaplib.IMAP4_SSL if ssl else imaplib.IMAP4
    conn = cls(host, port, timeout=timeout)
    try:
        conn.login(user, password)
        typ, data = conn.select("INBOX", readonly=True)
        if typ != "OK":
            raise RuntimeError(f"SELECT INBOX failed: {typ}")
        try:
            count = int((data[0] or b"0").decode())
        except Exception:
            count = 0
        return count
    finally:
        try:
            conn.logout()
        except Exception:
            pass


@router.post("/{eid}/test", response_model=EmailTestOut)
async def test_email(eid: str, user: User = Depends(get_current_user)):
    """Test kết nối IMAP thật: connect + login + SELECT INBOX. Lưu kết quả vào item."""
    e = email_store.get_email(user.id, eid)
    if not e:
        raise HTTPException(404, "Không tìm thấy email")
    address = (e.get("address") or "").strip()
    app_pwd = (e.get("app_password") or "").strip()
    password = (e.get("password") or "").strip()
    use_pwd = app_pwd or password
    if not address or not use_pwd:
        raise HTTPException(400, "Email thiếu address hoặc password/app_password")

    # IMAP server: ưu tiên provider mapping, fallback env IMAP_HOST
    provider = (e.get("provider") or "").lower()
    host = settings.imap_host
    if provider == "gmail":
        host = "imap.gmail.com"
    elif provider in ("outlook", "hotmail", "live"):
        host = "outlook.office365.com"
    elif provider == "yahoo":
        host = "imap.mail.yahoo.com"
    port = settings.imap_port
    ssl = settings.imap_ssl
    timeout = max(5, min(settings.imap_timeout_sec, 30))

    started = time.time()
    try:
        count = await asyncio.to_thread(
            _imap_login_test, host, port, ssl, address, use_pwd, timeout
        )
        elapsed = int((time.time() - started) * 1000)
        e["last_tested_at"] = datetime.utcnow().isoformat() + "Z"
        e["last_test_result"] = "ok"
        e["last_test_error"] = ""
        email_store.save_email(user.id, e)
        return EmailTestOut(ok=True, elapsed_ms=elapsed, inbox_count=count)
    except imaplib.IMAP4.error as ex:
        msg = str(ex).strip() or "IMAP login failed"
        # Gmail trả "[AUTHENTICATIONFAILED] Invalid credentials"
        e["last_tested_at"] = datetime.utcnow().isoformat() + "Z"
        e["last_test_result"] = "fail"
        e["last_test_error"] = msg[:200]
        email_store.save_email(user.id, e)
        return EmailTestOut(ok=False, error=msg, elapsed_ms=int((time.time() - started) * 1000))
    except Exception as ex:
        msg = f"{ex.__class__.__name__}: {ex}"
        e["last_tested_at"] = datetime.utcnow().isoformat() + "Z"
        e["last_test_result"] = "fail"
        e["last_test_error"] = msg[:200]
        email_store.save_email(user.id, e)
        return EmailTestOut(ok=False, error=msg, elapsed_ms=int((time.time() - started) * 1000))
