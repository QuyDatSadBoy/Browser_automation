"""Proxy entity storage — data/proxies/u<id>/<proxy_id>.json."""
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
    p = settings.data_path("proxies") / f"u{int(user_id)}"
    p.mkdir(parents=True, exist_ok=True)
    return p


def _path(user_id: int, pid: str) -> Path:
    return _dir(user_id) / f"{pid}.json"


def _slug(host: str, port: int | str) -> str:
    h = re.sub(r"[^a-z0-9]+", "-", str(host).lower()).strip("-") or "proxy"
    return f"{h}-{port}"


def _make_id(user_id: int, host: str, port) -> str:
    base = _slug(host, port)
    folder = _dir(user_id)
    pid = base
    i = 2
    while (folder / f"{pid}.json").exists():
        pid = f"{base}-{i}"
        i += 1
    return pid


def _build_url(data: Dict) -> str:
    typ = (data.get("type") or "http").lower()
    user = data.get("username") or ""
    pwd = data.get("password") or ""
    host = data.get("host") or ""
    port = data.get("port") or ""
    auth = f"{user}:{pwd}@" if user or pwd else ""
    return f"{typ}://{auth}{host}:{port}"


def list_proxies(user_id: int) -> List[Dict]:
    out: List[Dict] = []
    for p in sorted(_dir(user_id).glob("*.json")):
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
        except Exception:
            continue
        out.append({
            "id": data.get("id") or p.stem,
            "label": data.get("label", ""),
            "host": data.get("host", ""),
            "port": data.get("port", 0),
            "type": data.get("type", "http"),
            "country": data.get("country", ""),
            "provider": data.get("provider", ""),
            "username": data.get("username", ""),
            "has_password": bool(data.get("password")),
            "url": data.get("url") or _build_url(data),
            "status": data.get("status", "active"),
            "last_tested_at": data.get("last_tested_at", ""),
            "last_test_result": data.get("last_test_result", ""),
            "last_test_ip": data.get("last_test_ip", ""),
            "tags": data.get("tags") or [],
            "notes": data.get("notes", ""),
            "updated_at": data.get("updated_at", ""),
        })
    return out


def get_proxy(user_id: int, pid: str) -> Optional[Dict]:
    p = _path(user_id, pid)
    if not p.exists():
        return None
    return json.loads(p.read_text(encoding="utf-8"))


def save_proxy(user_id: int, data: Dict) -> Dict:
    pid = data.get("id") or _make_id(user_id, data.get("host", ""), data.get("port", ""))
    data["id"] = pid
    data.setdefault("type", "http")
    data["url"] = _build_url(data)
    p = _path(user_id, pid)
    now = _now()
    if not p.exists():
        data["created_at"] = now
    else:
        existing = json.loads(p.read_text(encoding="utf-8"))
        data["created_at"] = existing.get("created_at", now)
    data["updated_at"] = now
    p.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    return data


def delete_proxy(user_id: int, pid: str) -> bool:
    p = _path(user_id, pid)
    if not p.exists():
        return False
    p.unlink()
    return True


_PARSE_LINE = re.compile(r"^\s*([^\s:]+):(\d+):([^:]+):([^\s\t]+)(?:[\s\t]+(\w{2}))?\s*$")


def bulk_import(user_id: int, raw: str, default_type: str = "http") -> Dict:
    """Parse nhiều dòng format: ip:port:user:pass[\\t][country]"""
    created: List[Dict] = []
    skipped: List[str] = []
    for line in (raw or "").splitlines():
        s = line.strip()
        if not s:
            continue
        m = _PARSE_LINE.match(s)
        if not m:
            # Thử parse URL
            mu = re.match(r"(\w+)://(?:([^:]+):([^@]+)@)?([^:/]+):(\d+)", s)
            if mu:
                typ, user, pwd, host, port = mu.groups()
                item = {
                    "host": host, "port": int(port), "type": typ,
                    "username": user or "", "password": pwd or "",
                    "country": "", "status": "active", "tags": [],
                }
                created.append(save_proxy(user_id, item))
                continue
            skipped.append(s)
            continue
        host, port, user, pwd, country = m.groups()
        item = {
            "host": host, "port": int(port), "type": default_type,
            "username": user, "password": pwd,
            "country": (country or "").upper(),
            "status": "active",
            "tags": [],
            "label": "",
            "notes": "",
        }
        created.append(save_proxy(user_id, item))
    return {"created": len(created), "items": created, "skipped": skipped}
