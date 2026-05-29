"""SMS profile storage — data/sms_profiles/u<id>/<profile_id>.json.

Share 1 API key chung (env), profile chỉ lưu (name + country_id + service_id + operator).
Pattern giống email_store/proxy_store.
"""
from __future__ import annotations
import json
import re
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional

from app.core.config import settings


def _now() -> str:
    return datetime.utcnow().isoformat() + "Z"


def _dir(user_id: int) -> Path:
    p = settings.data_path("sms_profiles") / f"u{int(user_id)}"
    p.mkdir(parents=True, exist_ok=True)
    return p


def _path(user_id: int, pid: str) -> Path:
    return _dir(user_id) / f"{pid}.json"


def _slug(name: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", str(name).lower()).strip("-")
    return s or "profile"


def _make_id(user_id: int, name: str) -> str:
    base = _slug(name)
    folder = _dir(user_id)
    pid = base
    i = 2
    while (folder / f"{pid}.json").exists():
        pid = f"{base}-{i}"
        i += 1
    return pid


def _meta(data: Dict, fallback_id: str) -> Dict:
    return {
        "id": data.get("id") or fallback_id,
        "name": data.get("name", ""),
        "country_id": str(data.get("country_id") or ""),
        "country_name": data.get("country_name", ""),
        "service_id": str(data.get("service_id") or ""),
        "service_name": data.get("service_name", ""),
        "operator": data.get("operator", "any"),
        "notes": data.get("notes", ""),
        "tags": data.get("tags") or [],
        "status": data.get("status", "active"),
        "last_tested_at": data.get("last_tested_at", ""),
        "last_test_result": data.get("last_test_result", ""),
        "last_test_error": data.get("last_test_error", ""),
        "last_test_phone": data.get("last_test_phone", ""),
        "created_at": data.get("created_at", ""),
        "updated_at": data.get("updated_at", ""),
    }


def list_profiles(user_id: int) -> List[Dict]:
    out: List[Dict] = []
    for p in sorted(_dir(user_id).glob("*.json")):
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
        except Exception:
            continue
        out.append(_meta(data, p.stem))
    return out


def get_profile(user_id: int, pid: str) -> Optional[Dict]:
    p = _path(user_id, pid)
    if not p.exists():
        return None
    return _meta(json.loads(p.read_text(encoding="utf-8")), pid)


def save_profile(user_id: int, data: Dict) -> Dict:
    pid = data.get("id") or _make_id(user_id, data.get("name") or "profile")
    data["id"] = pid
    p = _path(user_id, pid)
    now = _now()
    if not p.exists():
        data["created_at"] = now
    else:
        existing = json.loads(p.read_text(encoding="utf-8"))
        data["created_at"] = existing.get("created_at", now)
        # preserve test result nếu caller không gửi
        for k in ("last_tested_at", "last_test_result", "last_test_error", "last_test_phone"):
            if k not in data:
                data[k] = existing.get(k, "")
    data["updated_at"] = now
    meta = _meta(data, pid)
    p.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    return meta


def update_test_result(user_id: int, pid: str, *, ok: bool, error: str = "", phone: str = "") -> Optional[Dict]:
    cur = get_profile(user_id, pid)
    if not cur:
        return None
    cur["last_tested_at"] = _now()
    cur["last_test_result"] = "ok" if ok else "fail"
    cur["last_test_error"] = "" if ok else (error or "")[:300]
    cur["last_test_phone"] = phone or cur.get("last_test_phone", "")
    p = _path(user_id, pid)
    p.write_text(json.dumps(cur, ensure_ascii=False, indent=2), encoding="utf-8")
    return cur


def delete_profile(user_id: int, pid: str) -> bool:
    p = _path(user_id, pid)
    if not p.exists():
        return False
    p.unlink()
    return True
