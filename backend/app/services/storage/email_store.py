"""Email entity storage — mỗi user 1 thư mục data/emails/u<id>/<email_id>.json.

Tách riêng khỏi profile để có thể chọn nhiều email cho 1 lần auto-register.
"""
from __future__ import annotations
import json
import re
import uuid
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional

from app.core.config import settings


_SAFE_SLUG = re.compile(r"[^a-z0-9_-]+")


def _now() -> str:
    return datetime.utcnow().isoformat() + "Z"


def _dir(user_id: int) -> Path:
    p = settings.data_path("emails") / f"u{int(user_id)}"
    p.mkdir(parents=True, exist_ok=True)
    return p


def _slug_from_email(addr: str) -> str:
    base = addr.split("@", 1)[0].lower() if addr else "email"
    s = _SAFE_SLUG.sub("-", base).strip("-") or "email"
    return s[:48]


def _make_id(user_id: int, address: str) -> str:
    base = _slug_from_email(address)
    folder = _dir(user_id)
    eid = base
    i = 2
    while (folder / f"{eid}.json").exists():
        eid = f"{base}-{i}"
        i += 1
    return eid


def _path(user_id: int, eid: str) -> Path:
    return _dir(user_id) / f"{eid}.json"


def list_emails(user_id: int) -> List[Dict]:
    out: List[Dict] = []
    for p in sorted(_dir(user_id).glob("*.json")):
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
        except Exception:
            continue
        out.append({
            "id": data.get("id") or p.stem,
            "address": data.get("address", ""),
            "label": data.get("label", ""),
            "provider": data.get("provider", ""),
            "has_app_password": bool(data.get("app_password")),
            "has_totp": bool(data.get("totp_secret")),
            "recovery_email": data.get("recovery_email", ""),
            "phone": data.get("phone", ""),
            "status": data.get("status", "active"),
            "tags": data.get("tags") or [],
            "notes": data.get("notes", ""),
            "last_tested_at": data.get("last_tested_at", ""),
            "last_test_result": data.get("last_test_result", ""),
            "last_test_error": data.get("last_test_error", ""),
            "updated_at": data.get("updated_at", ""),
        })
    return out


def get_email(user_id: int, eid: str) -> Optional[Dict]:
    p = _path(user_id, eid)
    if not p.exists():
        return None
    return json.loads(p.read_text(encoding="utf-8"))


def save_email(user_id: int, data: Dict) -> Dict:
    eid = data.get("id") or _make_id(user_id, data.get("address", ""))
    data["id"] = eid
    p = _path(user_id, eid)
    now = _now()
    if not p.exists():
        data["created_at"] = now
    else:
        existing = json.loads(p.read_text(encoding="utf-8"))
        data["created_at"] = existing.get("created_at", now)
    data["updated_at"] = now
    # Auto-detect provider từ domain
    if not data.get("provider"):
        addr = (data.get("address") or "").lower()
        if "@" in addr:
            dom = addr.split("@", 1)[1]
            if "gmail" in dom or "googlemail" in dom:
                data["provider"] = "gmail"
            elif "outlook" in dom or "hotmail" in dom or "live." in dom:
                data["provider"] = "outlook"
            elif "yahoo" in dom:
                data["provider"] = "yahoo"
            else:
                data["provider"] = dom
    p.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    return data


def delete_email(user_id: int, eid: str) -> bool:
    p = _path(user_id, eid)
    if not p.exists():
        return False
    p.unlink()
    return True


def bulk_import(user_id: int, raw: str) -> Dict:
    """Parse nhiều dòng theo format tab/comma separated:
    address[\t|,]password[\t|,]recovery[\t|,]totp[\t|,]phone[\t|,]otp_link
    Bỏ qua dòng header (chứa từ MAIL/PASS) và dòng trống.
    """
    created: List[Dict] = []
    skipped: List[str] = []
    for line in (raw or "").splitlines():
        s = line.strip()
        if not s:
            continue
        low = s.lower()
        if "mail" in low and "pass" in low and "@" not in s:
            continue  # header
        # Tách bằng tab hoặc nhiều space hoặc comma
        parts = re.split(r"[\t,]+|\s{2,}", s)
        parts = [p.strip() for p in parts if p.strip()]
        if not parts:
            continue
        address = parts[0]
        if "@" not in address:
            skipped.append(f"{s} (không phải email)")
            continue
        pwd = parts[1] if len(parts) > 1 else ""
        recovery = parts[2] if len(parts) > 2 else ""
        totp = parts[3] if len(parts) > 3 else ""
        phone = parts[4] if len(parts) > 4 else ""
        otp_link = parts[5] if len(parts) > 5 else ""
        # Phân loại: nếu pwd dài 16 ký tự alnum + space → App Password
        pwd_clean = re.sub(r"\s+", "", pwd)
        is_app_pwd = bool(re.fullmatch(r"[a-z]{16}", pwd_clean.lower()))
        item = {
            "address": address,
            "password": pwd if not is_app_pwd else "",
            "app_password": pwd_clean if is_app_pwd else "",
            "recovery_email": recovery,
            "totp_secret": re.sub(r"\s+", "", totp),
            "phone": phone,
            "otp_link": otp_link,
            "status": "active",
            "tags": [],
            "notes": "",
        }
        created.append(save_email(user_id, item))
    return {"created": len(created), "items": created, "skipped": skipped}
