"""SerpAPI Google Ads Transparency Center client.

Đơn giản: 1 file, dùng httpx.AsyncClient. Xoay key khi gặp 429.
Tham khảo docs/SERPAPI.md.
"""
from __future__ import annotations

import asyncio
from typing import Any, Optional

import httpx

from app.core.config import settings
from app.core.logger import get_logger

log = get_logger("serpapi")

_BASE_URL = "https://serpapi.com/search.json"
_TIMEOUT = 30.0

# Async-safe rotation state
_lock = asyncio.Lock()
_idx = 0


def _keys() -> list[str]:
    return settings.serpapi_keys_list


async def _current_key() -> str:
    keys = _keys()
    if not keys:
        raise RuntimeError("SERPAPI_KEYS chưa cấu hình trong .env")
    async with _lock:
        return keys[_idx % len(keys)]


async def _rotate_key() -> None:
    global _idx
    async with _lock:
        _idx += 1


async def _call(params: dict[str, Any]) -> dict[str, Any]:
    """Gọi SerpAPI có retry rotate key khi 429. Raise HTTPStatusError cho lỗi khác."""
    keys = _keys()
    if not keys:
        raise RuntimeError("SERPAPI_KEYS chưa cấu hình trong .env")
    last_exc: Optional[httpx.HTTPStatusError] = None
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        for _ in range(len(keys)):
            key = await _current_key()
            full = {**params, "api_key": key}
            r = await client.get(_BASE_URL, params=full)
            if r.status_code == 429:
                log.warning("SerpAPI 429 trên key index=%s — rotate", _idx)
                await _rotate_key()
                continue
            try:
                r.raise_for_status()
            except httpx.HTTPStatusError as e:
                last_exc = e
                raise
            return r.json()
    if last_exc:
        raise last_exc
    raise RuntimeError("Tất cả SerpAPI key đều bị 429")


async def search_ads_transparency(
    text: str = "",
    advertiser_id: str = "",
    platform: str = "",
    creative_format: str = "",
    start_date: str = "",
    end_date: str = "",
    region: str = "",
    political_ads: bool = False,
    num: int = 40,
    next_page_token: str = "",
) -> dict[str, Any]:
    """Search Google Ads Transparency Center.

    Tham số phải khớp engine `google_ads_transparency_center`. Xem docs/SERPAPI.md §7.
    """
    params: dict[str, Any] = {
        "engine": "google_ads_transparency_center",
    }
    if text:
        params["text"] = text
    if advertiser_id:
        params["advertiser_id"] = advertiser_id
    if platform:
        params["platform"] = platform
    if creative_format:
        params["creative_format"] = creative_format.lower()
    if start_date:
        params["start_date"] = start_date
    if end_date:
        params["end_date"] = end_date
    if region:
        params["region"] = region
    if political_ads:
        params["political_ads"] = "true"
    if num:
        params["num"] = int(num)
    if next_page_token:
        params["next_page_token"] = next_page_token
    return await _call(params)


async def get_ad_details(advertiser_id: str, creative_id: str, region: str = "") -> dict[str, Any]:
    params: dict[str, Any] = {
        "engine": "google_ads_transparency_center_ad_details",
        "advertiser_id": advertiser_id,
        "creative_id": creative_id,
    }
    if region:
        params["region"] = region
    return await _call(params)
