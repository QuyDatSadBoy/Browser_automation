"""SMS profile CRUD — multi-config (country/service combos) chia sẻ chung 1 API key.

Pattern giống emails.py / proxies.py.
- Test: check IDs hợp lệ với provider + hiện giá ước tính (không tốn tiền).
"""
from __future__ import annotations
import logging
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.core.config import settings
from app.deps import get_current_user
from app.models import User
from app.services.signup.sms_otp import SmsOtpService
from app.services.storage import sms_profile_store

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/sms-profiles", tags=["sms-profiles"])


class SmsProfileIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)
    country_id: str = ""
    country_name: str = ""
    service_id: str = ""
    service_name: str = ""
    operator: str = "any"
    notes: str = ""
    tags: list[str] = []
    status: str = "active"


@router.get("")
async def list_profiles(user: User = Depends(get_current_user)):
    items = sms_profile_store.list_profiles(user.id)
    # Lazy backfill country_name / service_name nếu thiếu (SMSPool list đã cached)
    changed = False
    for p in items:
        if p.get("country_id") and not p.get("country_name"):
            try:
                name = await SmsOtpService._smspool_lookup_name("country", p["country_id"])
            except Exception:
                name = ""
            if name:
                p["country_name"] = name
                sms_profile_store.save_profile(user.id, p)
                changed = True
        if p.get("service_id") and not p.get("service_name"):
            try:
                name = await SmsOtpService._smspool_lookup_name("service", p["service_id"])
            except Exception:
                name = ""
            if name:
                p["service_name"] = name
                sms_profile_store.save_profile(user.id, p)
                changed = True
    if changed:
        items = sms_profile_store.list_profiles(user.id)
    return items


class StockCheckIn(BaseModel):
    country_id: str
    service_id: str


@router.post("/check")
async def check_stock(body: StockCheckIn, _=Depends(get_current_user)):
    """Pre-flight check stock cho combo country+service trước khi save profile.

    KHOÂNG tốn tiền — chỉ gọi `/sms/stock`.
    """
    svc = SmsOtpService()
    if not svc.enabled or svc.provider != "smspool":
        return {"ok": False, "stock": 0, "error": "Provider hiện tại không hỗ trợ pre-check"}
    if not body.country_id or not body.service_id:
        return {"ok": False, "stock": 0, "error": "Thiếu country/service"}
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.post(
                "https://api.smspool.net/sms/stock",
                data={"country": body.country_id, "service": body.service_id},
            )
        if r.status_code != 200:
            return {"ok": False, "stock": 0, "error": f"HTTP {r.status_code}"}
        data = r.json() if r.text else {}
        if isinstance(data, dict) and data.get("success"):
            stock = int(data.get("amount") or 0)
            country_name = await SmsOtpService._smspool_lookup_name("country", body.country_id)
            service_name = await SmsOtpService._smspool_lookup_name("service", body.service_id)
            return {
                "ok": stock > 0,
                "stock": stock,
                "country_name": country_name,
                "service_name": service_name,
                "error": "" if stock > 0 else "Hết số cho combo này",
            }
        err = str(data.get("message") or data.get("error") or "Không có dữ liệu") if isinstance(data, dict) else "Phản hồi không hợp lệ"
        return {"ok": False, "stock": 0, "error": err}
    except Exception as e:
        return {"ok": False, "stock": 0, "error": f"{e.__class__.__name__}: {e}"}


@router.get("/{pid}")
async def get_profile(pid: str, user: User = Depends(get_current_user)):
    p = sms_profile_store.get_profile(user.id, pid)
    if not p:
        raise HTTPException(404, "Không tìm thấy SMS profile")
    return p


@router.post("")
async def create_profile(body: SmsProfileIn, user: User = Depends(get_current_user)):
    """Tạo profile mới. Tự auto-fill country_name/service_name nếu trống."""
    data = body.model_dump()
    # Tự auto-fill tên từ ID
    if data.get("country_id") and not data.get("country_name"):
        data["country_name"] = await SmsOtpService._smspool_lookup_name("country", data["country_id"])
    if data.get("service_id") and not data.get("service_name"):
        data["service_name"] = await SmsOtpService._smspool_lookup_name("service", data["service_id"])
    return sms_profile_store.save_profile(user.id, data)


@router.put("/{pid}")
async def update_profile(pid: str, body: SmsProfileIn, user: User = Depends(get_current_user)):
    cur = sms_profile_store.get_profile(user.id, pid)
    if not cur:
        raise HTTPException(404, "Không tìm thấy SMS profile")
    data = body.model_dump()
    data["id"] = pid
    if data.get("country_id") and not data.get("country_name"):
        data["country_name"] = await SmsOtpService._smspool_lookup_name("country", data["country_id"])
    if data.get("service_id") and not data.get("service_name"):
        data["service_name"] = await SmsOtpService._smspool_lookup_name("service", data["service_id"])
    return sms_profile_store.save_profile(user.id, data)


@router.delete("/{pid}")
async def delete_profile(pid: str, user: User = Depends(get_current_user)):
    if not sms_profile_store.delete_profile(user.id, pid):
        raise HTTPException(404, "Không tìm thấy SMS profile")
    return {"ok": True}


@router.post("/{pid}/test")
async def test_profile(pid: str, user: User = Depends(get_current_user)):
    """Kiểm tra config profile hợp lệ + hiện giá ước tính (KHÔNG mua số → KHÔNG tốn tiền).

    Gọi `https://api.smspool.net/sms/stock?country=X&service=Y` để xác minh combo có
    available không + lấy giá. Cache name lookup để tận dụng list đã pull.
    """
    p = sms_profile_store.get_profile(user.id, pid)
    if not p:
        raise HTTPException(404, "Không tìm thấy SMS profile")
    svc = SmsOtpService()
    if not svc.enabled:
        sms_profile_store.update_test_result(user.id, pid, ok=False, error="Chưa cấu hình SMS_OTP_API_KEY trong .env")
        raise HTTPException(400, "Chưa cấu hình SMS_OTP_API_KEY trong .env")

    country_id = p.get("country_id") or ""
    service_id = p.get("service_id") or ""
    if not country_id or not service_id:
        sms_profile_store.update_test_result(user.id, pid, ok=False, error="Thiếu country_id hoặc service_id")
        return {"ok": False, "error": "Thiếu country_id hoặc service_id"}

    if svc.provider != "smspool":
        # Chỉ hỗ trợ test cho smspool, các provider khác chỉ check balance chung
        bal = await svc.check_balance()
        ok = bool(bal.get("ok"))
        sms_profile_store.update_test_result(user.id, pid, ok=ok, error=bal.get("error", ""))
        return {"ok": ok, "balance": bal.get("balance", ""), "currency": bal.get("currency", ""), "error": bal.get("error", "")}

    # SMSPool: dùng endpoint stock để biết available + price
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.post(
                "https://api.smspool.net/sms/stock",
                data={"country": country_id, "service": service_id},
            )
        if r.status_code != 200:
            err = f"HTTP {r.status_code}: {r.text[:120]}"
            sms_profile_store.update_test_result(user.id, pid, ok=False, error=err)
            return {"ok": False, "error": err}
        data = r.json() if r.text else {}
        # SMSPool /sms/stock trả {"success":1,"amount":N}
        if isinstance(data, dict) and data.get("success"):
            try:
                stock = int(data.get("amount") or 0)
            except (TypeError, ValueError):
                stock = 0
            ok = stock > 0
            err = "" if ok else "Hết số cho combo này — đổi country/service khác"
            sms_profile_store.update_test_result(user.id, pid, ok=ok, error=err)
            return {
                "ok": ok,
                "stock": stock,
                "error": err,
                "country_name": p.get("country_name"),
                "service_name": p.get("service_name"),
            }
        err = str(data.get("message") or data.get("error") or "Không có dữ liệu stock") if isinstance(data, dict) else "Phản hồi không hợp lệ"
        sms_profile_store.update_test_result(user.id, pid, ok=False, error=err)
        return {"ok": False, "error": err}
    except Exception as e:
        err = f"{e.__class__.__name__}: {e}"
        sms_profile_store.update_test_result(user.id, pid, ok=False, error=err)
        return {"ok": False, "error": err}
