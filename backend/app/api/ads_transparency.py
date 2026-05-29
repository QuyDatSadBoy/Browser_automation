"""Google Ads Transparency Center — search endpoint thin wrapper SerpAPI."""
from __future__ import annotations

import json
import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import delete, desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.logger import get_logger
from app.deps import get_current_user
from app.models.ads_search_history import AdsSearchHistory
from app.models.user import User
from app.services.serpapi import get_ad_details, search_ads_transparency

log = get_logger("ads_transparency")

router = APIRouter(prefix="/api/ads-transparency", tags=["ads-transparency"],
                   dependencies=[Depends(get_current_user)])


class SearchAdsRequest(BaseModel):
    text: str = ""
    advertiser_id: str = ""
    platform: str = ""           # SEARCH | YOUTUBE | PLAY | MAPS | SHOPPING
    creative_format: str = ""    # text | image | video
    start_date: str = ""         # YYYYMMDD
    end_date: str = ""           # YYYYMMDD
    region: str = ""             # e.g. "2704" cho VN
    political_ads: bool = False
    num: int = Field(40, ge=1, le=100)
    next_page_token: str = ""


class AdDetailsRequest(BaseModel):
    advertiser_id: str
    creative_id: str
    region: str = ""


def _handle_serpapi_error(exc: httpx.HTTPStatusError) -> None:
    code = exc.response.status_code
    try:
        detail = exc.response.json().get("error", exc.response.text)
    except Exception:
        detail = exc.response.text
    if code == 400:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"SerpAPI từ chối: {detail}")
    if code == 401:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "SerpAPI key không hợp lệ")
    raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"SerpAPI lỗi {code}: {detail}")


@router.post("/search")
async def search(
    req: SearchAdsRequest,
    user: User = Depends(get_current_user),
    s: AsyncSession = Depends(get_session),
):
    if not req.text and not req.advertiser_id and not req.next_page_token:
        raise HTTPException(400, "Cần `text` (domain/tên) hoặc `advertiser_id` để search")
    try:
        data = await search_ads_transparency(
            text=req.text,
            advertiser_id=req.advertiser_id,
            platform=req.platform,
            creative_format=req.creative_format,
            start_date=req.start_date,
            end_date=req.end_date,
            region=req.region,
            political_ads=req.political_ads,
            num=req.num,
            next_page_token=req.next_page_token,
        )
    except httpx.HTTPStatusError as exc:
        _handle_serpapi_error(exc)
    except RuntimeError as e:
        raise HTTPException(500, str(e))

    # Chỉ lưu history khi là trang đầu và có text/advertiser_id
    if not req.next_page_token and (req.text or req.advertiser_id):
        try:
            count = len(data.get("ad_creatives") or [])
            s.add(AdsSearchHistory(
                user_id=user.id,
                text=req.text,
                advertiser_id=req.advertiser_id,
                platform=req.platform,
                creative_format=req.creative_format,
                region=req.region,
                start_date=req.start_date,
                end_date=req.end_date,
                num=req.num,
                political_ads=req.political_ads,
                result_count=count,
                results_json=json.dumps(data, ensure_ascii=False),
            ))
            await s.commit()
        except Exception as e:
            log.warning("Lưu history thất bại: %s", e)
    return data


@router.post("/ad-details")
async def ad_details(req: AdDetailsRequest):
    try:
        data = await get_ad_details(req.advertiser_id, req.creative_id, req.region)
    except httpx.HTTPStatusError as exc:
        _handle_serpapi_error(exc)
    except RuntimeError as e:
        raise HTTPException(500, str(e))
    return data


# ---------- Search history ----------

@router.get("/history")
async def list_history(
    limit: int = 30,
    user: User = Depends(get_current_user),
    s: AsyncSession = Depends(get_session),
):
    limit = max(1, min(100, limit))
    rows = (await s.execute(
        select(AdsSearchHistory)
        .where(AdsSearchHistory.user_id == user.id)
        .order_by(desc(AdsSearchHistory.created_at))
        .limit(limit)
    )).scalars().all()
    return [
        {
            "id": r.id,
            "text": r.text,
            "advertiser_id": r.advertiser_id,
            "platform": r.platform,
            "creative_format": r.creative_format,
            "region": r.region,
            "start_date": r.start_date,
            "end_date": r.end_date,
            "num": r.num,
            "political_ads": r.political_ads,
            "result_count": r.result_count,
            "results_json": r.results_json,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]


@router.delete("/history/{history_id}")
async def delete_history(
    history_id: int,
    user: User = Depends(get_current_user),
    s: AsyncSession = Depends(get_session),
):
    row = (await s.execute(
        select(AdsSearchHistory).where(
            AdsSearchHistory.id == history_id,
            AdsSearchHistory.user_id == user.id,
        )
    )).scalar_one_or_none()
    if not row:
        raise HTTPException(404, "Không tìm thấy lịch sử")
    await s.delete(row)
    await s.commit()
    return {"ok": True}


@router.delete("/history")
async def clear_history(
    user: User = Depends(get_current_user),
    s: AsyncSession = Depends(get_session),
):
    await s.execute(delete(AdsSearchHistory).where(AdsSearchHistory.user_id == user.id))
    await s.commit()
    return {"ok": True}
