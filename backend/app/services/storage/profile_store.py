from __future__ import annotations
import json
import re
import shutil
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional
from app.core.config import settings

_SLUG = re.compile(r"^[a-z0-9_-]+$")


def _now() -> str:
    return datetime.utcnow().isoformat() + "Z"


def _dir(user_id: int) -> Path:
    """Thư mục lưu profile riêng cho từng user: data/profiles/u<id>/."""
    p = settings.data_path("profiles") / f"u{int(user_id)}"
    p.mkdir(parents=True, exist_ok=True)
    return p


def _validate_id(pid: str) -> None:
    if not _SLUG.match(pid):
        raise ValueError("Profile id chỉ chứa a-z, 0-9, dấu _ và -")


def _path(user_id: int, pid: str) -> Path:
    _validate_id(pid)
    return _dir(user_id) / f"{pid}.json"


def list_profiles(user_id: int) -> List[Dict]:
    out: List[Dict] = []
    for p in sorted(_dir(user_id).glob("*.json")):
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
        except Exception:
            continue
        out.append({
            "id": data.get("id") or p.stem,
            "full_name": data.get("full_name", ""),
            "niche": data.get("niche", []),
            "country": data.get("country", ""),
            "notes": data.get("notes", ""),
            "updated_at": data.get("updated_at", ""),
            "tags": data.get("tags") or [],
        })
    return out


def get_profile(user_id: int, pid: str) -> Optional[Dict]:
    p = _path(user_id, pid)
    if not p.exists():
        return None
    return json.loads(p.read_text(encoding="utf-8"))


def save_profile(user_id: int, profile: Dict) -> Dict:
    pid = profile["id"]
    p = _path(user_id, pid)
    now = _now()
    if not p.exists():
        profile["created_at"] = now
    else:
        existing = json.loads(p.read_text(encoding="utf-8"))
        profile["created_at"] = existing.get("created_at", now)
    profile["updated_at"] = now
    # Auto-compute full_name từ ho + ten
    ho = (profile.get("ho") or "").strip()
    ten = (profile.get("ten") or "").strip()
    if ho or ten:
        profile["full_name"] = f"{ho} {ten}".strip()
    p.write_text(json.dumps(profile, ensure_ascii=False, indent=2), encoding="utf-8")
    return profile


def delete_profile(user_id: int, pid: str) -> bool:
    p = _path(user_id, pid)
    if not p.exists():
        return False
    p.unlink()
    return True


def duplicate_profile(user_id: int, pid: str) -> str:
    src = get_profile(user_id, pid)
    if not src:
        raise FileNotFoundError(pid)
    base = pid
    i = 2
    new_id = f"{base}_copy"
    while (_dir(user_id) / f"{new_id}.json").exists():
        new_id = f"{base}_copy{i}"
        i += 1
    src["id"] = new_id
    save_profile(user_id, src)
    return new_id


def migrate_legacy_to_user(admin_user_id: int) -> int:
    """Migrate legacy file data/profiles/*.json (chưa scope user) → data/profiles/u<admin>/."""
    root = settings.data_path("profiles")
    if not root.exists():
        return 0
    target = _dir(admin_user_id)
    moved = 0
    for f in root.glob("*.json"):
        if not f.is_file():
            continue
        dest = target / f.name
        if dest.exists():
            continue
        shutil.move(str(f), str(dest))
        moved += 1
    return moved
