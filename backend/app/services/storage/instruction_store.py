from __future__ import annotations
import re
import shutil
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional
from app.core.config import settings

# Cho phép Unicode (tiếng Việt) + space; chặn path traversal qua resolve() check
_FORBIDDEN = re.compile(r"[\\/\x00]")


def _dir(user_id: int) -> Path:
    """Thư mục lưu instruction riêng cho từng user: data/instructions/u<id>/."""
    p = settings.data_path("instructions") / f"u{int(user_id)}"
    p.mkdir(parents=True, exist_ok=True)
    return p


def _validate(name: str) -> None:
    if not name or _FORBIDDEN.search(name) or ".." in name:
        raise ValueError("Tên file không hợp lệ")


def _path(user_id: int, name: str) -> Path:
    _validate(name)
    base = _dir(user_id).resolve()
    p = (base / name).resolve()
    if base not in p.parents and p != base:
        raise ValueError("Tên file không hợp lệ")
    return p


def _meta(p: Path) -> Dict:
    st = p.stat()
    return {
        "name": p.name,
        "size": st.st_size,
        "updated_at": datetime.utcfromtimestamp(st.st_mtime).isoformat() + "Z",
    }


def list_instructions(user_id: int) -> List[Dict]:
    return [_meta(p) for p in sorted(_dir(user_id).glob("*")) if p.is_file()]


def get_instruction(user_id: int, name: str) -> Optional[Dict]:
    p = _path(user_id, name)
    if not p.exists():
        return None
    meta = _meta(p)
    return {**meta, "content": p.read_text(encoding="utf-8")}


def save_instruction(user_id: int, name: str, content: str) -> Dict:
    p = _path(user_id, name)
    p.write_text(content, encoding="utf-8")
    return get_instruction(user_id, name)  # type: ignore[return-value]


def delete_instruction(user_id: int, name: str) -> bool:
    p = _path(user_id, name)
    if not p.exists():
        return False
    p.unlink()
    return True


def migrate_legacy_to_user(admin_user_id: int) -> int:
    """Migrate legacy file data/instructions/* (chưa scope user) → data/instructions/u<admin>/."""
    root = settings.data_path("instructions")
    if not root.exists():
        return 0
    target = _dir(admin_user_id)
    moved = 0
    for f in root.iterdir():
        if not f.is_file():
            continue
        dest = target / f.name
        if dest.exists():
            continue
        shutil.move(str(f), str(dest))
        moved += 1
    return moved
