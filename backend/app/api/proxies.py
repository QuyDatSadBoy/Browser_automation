import time
from datetime import datetime
from typing import List

import httpx
from fastapi import APIRouter, Depends, HTTPException

from app.deps import get_current_user
from app.models import User
from app.schemas.proxy import (
    ProxyIn, ProxyMeta, ProxyOut, ProxyBulkIn, ProxyBulkOut, ProxyTestOut,
)
from app.services.storage import proxy_store

router = APIRouter(prefix="/api/proxies", tags=["proxies"])


@router.get("", response_model=List[ProxyMeta])
async def list_proxies(user: User = Depends(get_current_user)):
    return proxy_store.list_proxies(user.id)


@router.post("", response_model=ProxyOut)
async def create_proxy(body: ProxyIn, user: User = Depends(get_current_user)):
    data = body.model_dump()
    if data.get("id") and proxy_store.get_proxy(user.id, data["id"]):
        raise HTTPException(400, "Proxy id đã tồn tại")
    if not data.get("host") or not data.get("port"):
        raise HTTPException(400, "Thiếu host/port")
    return proxy_store.save_proxy(user.id, data)


@router.get("/{pid}", response_model=ProxyOut)
async def get_proxy(pid: str, user: User = Depends(get_current_user)):
    e = proxy_store.get_proxy(user.id, pid)
    if not e:
        raise HTTPException(404, "Không tìm thấy proxy")
    return e


@router.put("/{pid}", response_model=ProxyOut)
async def update_proxy(pid: str, body: ProxyIn, user: User = Depends(get_current_user)):
    if not proxy_store.get_proxy(user.id, pid):
        raise HTTPException(404, "Không tìm thấy proxy")
    data = body.model_dump()
    data["id"] = pid
    return proxy_store.save_proxy(user.id, data)


@router.delete("/{pid}")
async def delete_proxy(pid: str, user: User = Depends(get_current_user)):
    ok = proxy_store.delete_proxy(user.id, pid)
    if not ok:
        raise HTTPException(404, "Không tìm thấy proxy")
    return {"ok": True}


@router.post("/bulk-import", response_model=ProxyBulkOut)
async def bulk_import_proxies(body: ProxyBulkIn, user: User = Depends(get_current_user)):
    return proxy_store.bulk_import(user.id, body.raw, body.default_type or "http")


@router.post("/{pid}/test", response_model=ProxyTestOut)
async def test_proxy(pid: str, user: User = Depends(get_current_user)):
    p = proxy_store.get_proxy(user.id, pid)
    if not p:
        raise HTTPException(404, "Không tìm thấy proxy")
    url = p.get("url") or ""
    if not url:
        raise HTTPException(400, "Proxy chưa có url hợp lệ")
    started = time.time()
    try:
        async with httpx.AsyncClient(
            proxy=url, timeout=httpx.Timeout(15.0), follow_redirects=True
        ) as client:
            r = await client.get("https://api.ipify.org?format=json")
            r.raise_for_status()
            ip = r.json().get("ip", "")
        elapsed = int((time.time() - started) * 1000)
        # Lưu kết quả
        now = datetime.utcnow().isoformat() + "Z"
        p["last_tested_at"] = now
        p["last_test_result"] = "ok"
        p["last_test_ip"] = ip
        proxy_store.save_proxy(user.id, p)
        return ProxyTestOut(ok=True, ip=ip, elapsed_ms=elapsed)
    except Exception as e:
        p["last_tested_at"] = datetime.utcnow().isoformat() + "Z"
        p["last_test_result"] = f"fail: {e.__class__.__name__}"
        proxy_store.save_proxy(user.id, p)
        return ProxyTestOut(ok=False, error=str(e), elapsed_ms=int((time.time() - started) * 1000))
