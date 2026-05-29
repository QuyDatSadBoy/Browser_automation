import asyncio
import csv
import io
import logging
import json as _json
from datetime import datetime as _dt
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.db import get_session
from app.deps import get_current_user
from app.schemas.program import ProgramListOut, ProgramOut
from app.services import program_service, traffic_runner
from app.services.traffic import scan_traffic
from app.models.traffic_scan_job import TrafficScanJob
from app.models import AffiliateProgram
from sqlalchemy import select

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/programs", tags=["programs"], dependencies=[Depends(get_current_user)])


class BulkDeleteIn(BaseModel):
    ids: List[int]


class BulkScanTrafficIn(BaseModel):
    ids: List[int]
    skip_existing: bool = True
    months: int = 3          # 1..12 — số tháng dữ liệu cần lấy (mặc định 3 tháng)
    concurrency: int = 2     # 1..4 — chạy song song


class SmsPresetIn(BaseModel):
    sms_country_id: str = ""   # rỗng = dùng default từ .env
    sms_service_id: str = ""
    sms_profile_id: str = ""   # ưu tiên hơn nếu set → resolve country/service từ profile


@router.get("", response_model=ProgramListOut)
async def list_programs(
    source: Optional[str] = None,
    category: Optional[str] = None,
    search: Optional[str] = None,
    min_commission: Optional[float] = None,
    max_commission: Optional[float] = None,
    min_traffic: Optional[float] = None,
    min_cookie_days: Optional[int] = Query(None, ge=0),
    has_traffic: Optional[bool] = None,
    has_signup: Optional[bool] = None,
    sources: Optional[List[str]] = Query(None),
    categories: Optional[List[str]] = Query(None),
    directory_status: Optional[str] = Query(None, description="active|inactive"),
    networks: Optional[List[str]] = Query(None, description="openaffiliate: in-house|cj|impact|awin|partnerstack…"),
    approval: Optional[str] = Query(None, description="auto|manual"),
    registrations_open: Optional[bool] = Query(None, description="goaffpro: chỉ store còn mở đăng ký"),
    payout_currency: Optional[str] = Query(None),
    payout_frequency: Optional[str] = Query(None, description="monthly|weekly|net30…"),
    sort_by: str = "crawled_at",
    order: str = "desc",
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    session: AsyncSession = Depends(get_session),
):
    items, total = await program_service.list_programs(
        session, source=source, category=category, search=search,
        min_commission=min_commission, max_commission=max_commission,
        min_traffic=min_traffic, min_cookie_days=min_cookie_days,
        has_traffic=has_traffic, has_signup=has_signup,
        sources=sources, categories=categories,
        directory_status=directory_status,
        networks=networks, approval=approval, registrations_open=registrations_open,
        payout_currency=payout_currency, payout_frequency=payout_frequency,
        page=page, page_size=page_size,
        sort_by=sort_by, order=order,
    )
    return ProgramListOut(
        items=[ProgramOut.model_validate(i) for i in items],
        total=total, page=page, page_size=page_size,
    )


@router.get("/categories", response_model=List[str])
async def list_categories(source: Optional[str] = None, session: AsyncSession = Depends(get_session)):
    return await program_service.list_categories(session, source=source)


@router.get("/facets")
async def list_facets(
    source: Optional[str] = None,
    session: AsyncSession = Depends(get_session),
):
    """Trả về danh sách distinct value cho các filter đặc thù theo source.

    Dùng cho FE render dropdown động (network/currency/frequency/status…).
    """
    from sqlalchemy import select as _select
    q_base = _select
    cond = (AffiliateProgram.source == source) if source else None

    async def _distinct(col):
        q = _select(col).where(col.isnot(None)).distinct()
        if cond is not None:
            q = q.where(cond)
        rows = (await session.execute(q)).scalars().all()
        return sorted({(r or "").strip() for r in rows if r and str(r).strip()})

    networks = await _distinct(AffiliateProgram.directory_network)
    currencies = await _distinct(AffiliateProgram.payout_currency)
    frequencies = await _distinct(AffiliateProgram.payout_frequency)
    statuses = await _distinct(AffiliateProgram.directory_status)
    approvals = await _distinct(AffiliateProgram.directory_approval)
    return {
        "networks": networks,
        "currencies": currencies,
        "frequencies": frequencies,
        "statuses": statuses,
        "approvals": approvals,
    }


@router.get("/ids", response_model=List[int])
async def list_program_ids(
    source: Optional[str] = None,
    category: Optional[str] = None,
    search: Optional[str] = None,
    min_commission: Optional[float] = None,
    max_commission: Optional[float] = None,
    min_traffic: Optional[float] = None,
    min_cookie_days: Optional[int] = Query(None, ge=0),
    has_traffic: Optional[bool] = None,
    has_signup: Optional[bool] = None,
    sources: Optional[List[str]] = Query(None),
    categories: Optional[List[str]] = Query(None),
    directory_status: Optional[str] = Query(None),
    networks: Optional[List[str]] = Query(None),
    approval: Optional[str] = Query(None),
    registrations_open: Optional[bool] = Query(None),
    payout_currency: Optional[str] = Query(None),
    payout_frequency: Optional[str] = Query(None),
    sort_by: str = "crawled_at",
    order: str = "desc",
    session: AsyncSession = Depends(get_session),
):
    """Trả về id của toàn bộ program khớp filter — dùng cho 'Chọn tất cả' FE."""
    return await program_service.list_program_ids(
        session, source=source, category=category, search=search,
        min_commission=min_commission, max_commission=max_commission,
        min_traffic=min_traffic, min_cookie_days=min_cookie_days,
        has_traffic=has_traffic, has_signup=has_signup,
        sources=sources, categories=categories,
        directory_status=directory_status,
        networks=networks, approval=approval, registrations_open=registrations_open,
        payout_currency=payout_currency, payout_frequency=payout_frequency,
        sort_by=sort_by, order=order,
    )


@router.get("/export.csv")
async def export_csv(
    source: Optional[str] = None,
    category: Optional[str] = None,
    search: Optional[str] = None,
    min_commission: Optional[float] = None,
    max_commission: Optional[float] = None,
    min_traffic: Optional[float] = None,
    min_cookie_days: Optional[int] = Query(None, ge=0),
    has_traffic: Optional[bool] = None,
    has_signup: Optional[bool] = None,
    ids: Optional[str] = Query(None, description="Comma-separated id list"),
    session: AsyncSession = Depends(get_session),
):
    id_list = None
    if ids:
        try:
            id_list = [int(x) for x in ids.split(",") if x.strip()]
        except ValueError:
            raise HTTPException(400, "ids phải là danh sách số")
    rows = await program_service.all_programs(
        session, source=source, category=category, search=search,
        min_commission=min_commission, max_commission=max_commission,
        min_traffic=min_traffic, min_cookie_days=min_cookie_days,
        has_traffic=has_traffic, has_signup=has_signup,
        ids=id_list,
    )
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([
        "id", "source", "external_id", "name", "category",
        "commission", "commission_value", "commission_type",
        "payout", "cookie_duration", "traffic_score", "url", "signup_url",
        "description", "source_url", "crawled_at",
    ])
    for p in rows:
        writer.writerow([
            p.id, p.source, p.external_id, p.name, p.category or "",
            p.commission or "", p.commission_value or "", p.commission_type or "",
            p.payout or "", p.cookie_duration or "", p.traffic_score or "",
            p.url or "", p.signup_url or "",
            (p.description or "").replace("\n", " "), p.source_url or "",
            p.crawled_at.isoformat() if p.crawled_at else "",
        ])
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="programs.csv"'},
    )


@router.post("/import.csv")
async def import_csv(
    file: UploadFile = File(...),
    session: AsyncSession = Depends(get_session),
):
    """Import program từ CSV. Format phải đồng nhất với /export.csv.

    - Cột bắt buộc: `source`, `external_id`, `name`.
    - Upsert theo (source, external_id) — đã tồn tại sẽ update.
    - Cột `id`, `crawled_at`, `updated_at` bị bỏ qua (server tự set).
    - Cột thiếu → để trống/NULL (backward compatible).
    """
    if not file.filename.lower().endswith(".csv"):
        raise HTTPException(400, "File phải có đuôi .csv")
    raw = await file.read()
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = raw.decode("latin-1", errors="replace")

    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        raise HTTPException(400, "CSV rỗng hoặc không có header")

    rows: List[dict] = []
    errors: List[dict] = []
    for idx, raw_row in enumerate(reader, start=2):  # row 1 = header
        row = {(k or "").strip(): (v or "").strip() for k, v in raw_row.items() if k}
        source = row.get("source")
        external_id = row.get("external_id")
        name = row.get("name")
        if not source or not external_id or not name:
            errors.append({"row": idx, "error": "thiếu source/external_id/name"})
            continue

        def _f(key: str) -> Optional[float]:
            v = row.get(key)
            if not v:
                return None
            try:
                return float(v)
            except ValueError:
                return None

        def _s(key: str) -> Optional[str]:
            v = row.get(key)
            return v if v else None

        rows.append({
            "source": source,
            "external_id": external_id,
            "name": name,
            "category": _s("category"),
            "commission": _s("commission"),
            "commission_value": _f("commission_value"),
            "commission_type": _s("commission_type"),
            "payout": _s("payout"),
            "cookie_duration": _s("cookie_duration"),
            "traffic_score": _f("traffic_score"),
            "url": _s("url"),
            "signup_url": _s("signup_url"),
            "description": _s("description"),
            "source_url": _s("source_url"),
        })

    saved = await program_service.upsert_programs(rows, session) if rows else 0
    return {"saved": saved, "skipped": len(errors), "errors": errors[:50]}


@router.post("/bulk-delete")
async def bulk_delete(body: BulkDeleteIn, session: AsyncSession = Depends(get_session)):
    n = await program_service.bulk_delete(body.ids, session)
    return {"deleted": n}


@router.patch("/{program_id}/sms-preset", response_model=ProgramOut)
async def update_sms_preset(
    program_id: int,
    body: SmsPresetIn,
    session: AsyncSession = Depends(get_session),
):
    """Lưu cấu hình SMS OTP riêng cho program này (rỗng = dùng default từ .env)."""
    p = await program_service.get_program(program_id, session)
    if not p:
        raise HTTPException(404, "Không tìm thấy program")
    p.sms_country_id = body.sms_country_id or None
    p.sms_service_id = body.sms_service_id or None
    p.sms_profile_id = body.sms_profile_id or None
    await session.commit()
    await session.refresh(p)
    return p


@router.get("/{program_id}", response_model=ProgramOut)
async def get_program(program_id: int, session: AsyncSession = Depends(get_session)):
    p = await program_service.get_program(program_id, session)
    if not p:
        raise HTTPException(404, "Không tìm thấy program")
    return p


@router.delete("/{program_id}")
async def delete_program(program_id: int, session: AsyncSession = Depends(get_session)):
    ok = await program_service.delete_program(program_id, session)
    if not ok:
        raise HTTPException(404, "Không tìm thấy program")
    return {"ok": True}


@router.post("/{program_id}/scan-traffic")
async def scan_program_traffic(program_id: int, session: AsyncSession = Depends(get_session)):
    """Quét traffic từ SimilarWeb cho program → update traffic_score."""
    p = await program_service.get_program(program_id, session)
    if not p:
        raise HTTPException(404, "Không tìm thấy program")
    url = p.url or p.signup_url or p.source_url
    if not url:
        raise HTTPException(400, "Program không có URL để quét")
    try:
        result = await scan_traffic(url)
    except RuntimeError as e:
        raise HTTPException(500, f"Quét traffic thất bại: {e}")
    import json as _json
    from datetime import datetime as _dt
    visits = int(result.get("monthly_visits") or 0)
    p.traffic_score = float(visits)
    p.traffic_period_month = result.get("period_month")
    details = result.get("traffic_details")
    p.traffic_details_json = _json.dumps(details, ensure_ascii=False) if details else None
    p.traffic_scanned_at = _dt.utcnow()
    await session.commit()
    await session.refresh(p)
    return {
        "program_id": program_id,
        "url": url,
        "domain": result.get("domain"),
        "monthly_visits": visits,
        "period_month": result.get("period_month"),
        "found": result.get("found", False),
        "traffic_score": p.traffic_score,
        "has_details": bool(details),
    }


_BULK_SCAN_LIMIT = 100
_BULK_SCAN_CONCURRENCY = 2


@router.post("/bulk-scan-traffic")
async def bulk_scan_traffic(payload: BulkScanTrafficIn, session: AsyncSession = Depends(get_session)):
    """Quét traffic SimilarWeb cho nhiều program cùng lúc."""
    if not payload.ids:
        raise HTTPException(400, "ids rỗng")
    if len(payload.ids) > _BULK_SCAN_LIMIT:
        raise HTTPException(400, f"Tối đa {_BULK_SCAN_LIMIT} program / lần quét")
    months = max(1, min(12, int(payload.months or 3)))
    concurrency = max(1, min(4, int(payload.concurrency or _BULK_SCAN_CONCURRENCY)))

    # Lấy các program theo thứ tự ids (giữ nguyên dải input)
    programs = []
    for pid in payload.ids:
        p = await program_service.get_program(pid, session)
        if p:
            programs.append(p)

    sem = asyncio.Semaphore(concurrency)
    items: list[dict] = []
    counts = {"scanned": 0, "found": 0, "skipped": 0, "failed": 0}

    async def _one(p):
        # Skip nếu đã có traffic và user chọn skip
        if payload.skip_existing and p.traffic_score and p.traffic_score > 0:
            counts["skipped"] += 1
            items.append({"program_id": p.id, "name": p.name, "status": "skipped", "traffic_score": p.traffic_score})
            return
        url = p.url or p.signup_url or p.source_url
        if not url:
            counts["failed"] += 1
            items.append({"program_id": p.id, "name": p.name, "status": "failed", "error": "không có URL"})
            return
        async with sem:
            try:
                result = await scan_traffic(url, months=months)
            except Exception as e:  # noqa: BLE001 - gộp lỗi SW về 1 chỗ
                logger.warning("bulk-scan-traffic failed id=%s url=%s: %s", p.id, url, e)
                counts["failed"] += 1
                items.append({"program_id": p.id, "name": p.name, "status": "failed", "error": str(e)[:200]})
                return
        visits = int(result.get("monthly_visits") or 0)
        p.traffic_score = float(visits)
        p.traffic_period_month = result.get("period_month")
        details = result.get("traffic_details")
        p.traffic_details_json = _json.dumps(details, ensure_ascii=False) if details else None
        p.traffic_scanned_at = _dt.utcnow()
        counts["scanned"] += 1
        if result.get("found"):
            counts["found"] += 1
        items.append({
            "program_id": p.id,
            "name": p.name,
            "status": "ok" if result.get("found") else "empty",
            "monthly_visits": visits,
            "period_month": result.get("period_month"),
        })

    await asyncio.gather(*[_one(p) for p in programs])
    await session.commit()
    return {
        "total": len(payload.ids),
        "matched": len(programs),
        **counts,
        "items": items,
    }


# --- Background traffic-scan job (phương án chuẩn, FE poll progress) ---

def _traffic_job_out(j: TrafficScanJob) -> dict:
    return {
        "id": j.id,
        "status": j.status,
        "total": j.total,
        "scanned": j.scanned,
        "found": j.found,
        "skipped": j.skipped,
        "failed": j.failed,
        "months": j.months,
        "concurrency": j.concurrency,
        "skip_existing": j.skip_existing,
        "program_ids": _json.loads(j.program_ids_json or "[]"),
        "results": _json.loads(j.results_json or "[]"),
        "error": j.error,
        "started_at": j.started_at.isoformat() + "Z" if j.started_at else None,
        "finished_at": j.finished_at.isoformat() + "Z" if j.finished_at else None,
        "created_at": j.created_at.isoformat() + "Z" if j.created_at else None,
    }


@router.post("/bulk-scan-traffic-job")
async def create_traffic_scan_job(
    payload: BulkScanTrafficIn,
    user = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Tạo background job quét traffic. FE poll GET /traffic-jobs/{id}."""
    if not payload.ids:
        raise HTTPException(400, "Chưa chọn program nào")
    if len(payload.ids) > _BULK_SCAN_LIMIT:
        raise HTTPException(400, f"Tối đa {_BULK_SCAN_LIMIT} programs/lần")
    job_id = await traffic_runner.enqueue(
        user_id=getattr(user, "id", None),
        program_ids=payload.ids,
        skip_existing=payload.skip_existing,
        months=payload.months,
        concurrency=payload.concurrency,
    )
    row = (
        await session.execute(select(TrafficScanJob).where(TrafficScanJob.id == job_id))
    ).scalar_one()
    return _traffic_job_out(row)


@router.get("/traffic-jobs/{job_id}")
async def get_traffic_scan_job(
    job_id: int,
    user = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    row = (
        await session.execute(select(TrafficScanJob).where(TrafficScanJob.id == job_id))
    ).scalar_one_or_none()
    if not row:
        raise HTTPException(404, "Job không tồn tại")
    if row.user_id is not None and row.user_id != getattr(user, "id", None):
        raise HTTPException(404, "Job không tồn tại")
    return _traffic_job_out(row)
