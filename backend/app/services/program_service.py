from datetime import datetime
import re
from typing import List, Optional, Tuple
from sqlalchemy import select, func, delete, and_, asc, desc
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.ext.asyncio import AsyncSession
from app.models import AffiliateProgram

_SORTABLE = {
    "name": AffiliateProgram.name,
    "source": AffiliateProgram.source,
    "category": AffiliateProgram.category,
    "commission_value": AffiliateProgram.commission_value,
    "traffic_score": AffiliateProgram.traffic_score,
    "crawled_at": AffiliateProgram.crawled_at,
    "updated_at": AffiliateProgram.updated_at,
}

_COOKIE_RE = re.compile(
    r"(\d+)\s*(ngày|ngay|tuần|tuan|tháng|thang|năm|nam|d|day|days|w|week|weeks|m|month|months|y|year|years|h|hour|hours)?",
    re.I,
)


def _parse_cookie_days(text: Optional[str]) -> Optional[int]:
    if not text:
        return None
    m = _COOKIE_RE.search(str(text))
    if not m:
        return None
    n = int(m.group(1))
    unit = (m.group(2) or "d").lower()
    if unit.startswith(("ngày", "ngay", "d")):
        return n
    if unit.startswith(("tuần", "tuan", "w")):
        return n * 7
    if unit.startswith("h"):
        return max(1, n // 24)
    if unit.startswith(("tháng", "thang", "m")):
        return n * 30
    if unit.startswith(("năm", "nam", "y")):
        return n * 365
    return n


async def upsert_programs(rows: List[dict], session: AsyncSession) -> int:
    if not rows:
        return 0
    saved = 0
    for row in rows:
        row = dict(row)
        row.setdefault("crawled_at", datetime.utcnow())
        row["updated_at"] = datetime.utcnow()
        stmt = sqlite_insert(AffiliateProgram).values(**row)
        update_cols = {k: stmt.excluded[k] for k in row.keys() if k not in {"source", "external_id", "crawled_at"}}
        stmt = stmt.on_conflict_do_update(index_elements=["source", "external_id"], set_=update_cols)
        await session.execute(stmt)
        saved += 1
    await session.commit()
    return saved


def _build_where(
    source, category, search, min_commission, min_traffic=None,
    sources=None, categories=None,
    max_commission=None, has_traffic=None, has_signup=None,
    directory_status=None,
    networks=None, approval=None, registrations_open=None,
    payout_currency=None, payout_frequency=None,
):
    conds = []
    if source:
        conds.append(AffiliateProgram.source == source)
    if sources:
        conds.append(AffiliateProgram.source.in_(sources))
    if category:
        conds.append(AffiliateProgram.category == category)
    if categories:
        conds.append(AffiliateProgram.category.in_(categories))
    if search:
        like = f"%{search.lower()}%"
        conds.append(func.lower(AffiliateProgram.name).like(like))
    if min_commission is not None:
        conds.append(AffiliateProgram.commission_value >= min_commission)
    if max_commission is not None:
        conds.append(AffiliateProgram.commission_value <= max_commission)
    if min_traffic is not None:
        conds.append(AffiliateProgram.traffic_score >= min_traffic)
    if has_traffic is True:
        conds.append(AffiliateProgram.traffic_score.isnot(None))
        conds.append(AffiliateProgram.traffic_score > 0)
    elif has_traffic is False:
        conds.append((AffiliateProgram.traffic_score.is_(None)) | (AffiliateProgram.traffic_score == 0))
    if has_signup is True:
        conds.append(AffiliateProgram.signup_url.isnot(None))
        conds.append(AffiliateProgram.signup_url != "")
    elif has_signup is False:
        conds.append((AffiliateProgram.signup_url.is_(None)) | (AffiliateProgram.signup_url == ""))
    # directory_status: "active" → verified / active / auto-approve (KHÔNG match "unverified" lẫn)
    if directory_status == "active":
        ds = func.lower(AffiliateProgram.directory_status)
        active_vals = ["active", "active & verified", "verified", "auto-approve"]
        conds.append(ds.in_(active_vals) | ds.like("auto%") | ds.like("%active &%"))
    elif directory_status == "inactive":
        ds = func.lower(AffiliateProgram.directory_status)
        inactive_vals = ["inactive", "moved", "closed", "unverified", "manual approve", "manual"]
        conds.append(ds.in_(inactive_vals) | ds.like("manual%"))
    # Filter đặc thù — openaffiliate
    if networks:
        conds.append(func.lower(AffiliateProgram.directory_network).in_([n.lower() for n in networks]))
    if approval:
        conds.append(func.lower(AffiliateProgram.directory_approval) == approval.lower())
    # Filter đặc thù — goaffpro
    if registrations_open is True:
        conds.append(AffiliateProgram.registrations_open == 1)
    elif registrations_open is False:
        conds.append(AffiliateProgram.registrations_open == 0)
    if payout_currency:
        conds.append(func.upper(AffiliateProgram.payout_currency) == payout_currency.upper())
    if payout_frequency:
        conds.append(func.lower(AffiliateProgram.payout_frequency) == payout_frequency.lower())
    return and_(*conds) if conds else None


async def list_programs(
    session: AsyncSession,
    source: Optional[str] = None,
    category: Optional[str] = None,
    search: Optional[str] = None,
    min_commission: Optional[float] = None,
    min_traffic: Optional[float] = None,
    min_cookie_days: Optional[int] = None,
    sources: Optional[List[str]] = None,
    categories: Optional[List[str]] = None,
    max_commission: Optional[float] = None,
    has_traffic: Optional[bool] = None,
    has_signup: Optional[bool] = None,
    directory_status: Optional[str] = None,
    networks: Optional[List[str]] = None,
    approval: Optional[str] = None,
    registrations_open: Optional[bool] = None,
    payout_currency: Optional[str] = None,
    payout_frequency: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
    sort_by: str = "crawled_at",
    order: str = "desc",
) -> Tuple[List[AffiliateProgram], int]:
    where = _build_where(
        source, category, search, min_commission, min_traffic,
        sources, categories,
        max_commission=max_commission, has_traffic=has_traffic, has_signup=has_signup,
        directory_status=directory_status,
        networks=networks, approval=approval, registrations_open=registrations_open,
        payout_currency=payout_currency, payout_frequency=payout_frequency,
    )
    col = _SORTABLE.get(sort_by, AffiliateProgram.crawled_at)
    direction = asc if order == "asc" else desc

    # cookie_duration là text nên phải post-filter trong Python để đảm bảo parse đúng.
    if min_cookie_days and min_cookie_days > 0:
        q = select(AffiliateProgram).order_by(direction(col), AffiliateProgram.id.desc())
        if where is not None:
            q = q.where(where)
        all_items = list((await session.execute(q)).scalars().all())
        filtered = [
            p for p in all_items
            if (_parse_cookie_days(p.cookie_duration) or 0) >= min_cookie_days
        ]
        total = len(filtered)
        start = (page - 1) * page_size
        end = start + page_size
        return filtered[start:end], total

    count_q = select(func.count()).select_from(AffiliateProgram)
    if where is not None:
        count_q = count_q.where(where)
    total = (await session.execute(count_q)).scalar_one()

    q = select(AffiliateProgram).order_by(direction(col), AffiliateProgram.id.desc())
    if where is not None:
        q = q.where(where)
    q = q.offset((page - 1) * page_size).limit(page_size)
    items = (await session.execute(q)).scalars().all()
    return list(items), int(total)


async def all_programs(
    session: AsyncSession,
    source: Optional[str] = None,
    category: Optional[str] = None,
    search: Optional[str] = None,
    min_commission: Optional[float] = None,
    min_traffic: Optional[float] = None,
    min_cookie_days: Optional[int] = None,
    ids: Optional[List[int]] = None,
    max_commission: Optional[float] = None,
    has_traffic: Optional[bool] = None,
    has_signup: Optional[bool] = None,
    directory_status: Optional[str] = None,
    networks: Optional[List[str]] = None,
    approval: Optional[str] = None,
    registrations_open: Optional[bool] = None,
    payout_currency: Optional[str] = None,
    payout_frequency: Optional[str] = None,
) -> List[AffiliateProgram]:
    where = _build_where(
        source, category, search, min_commission, min_traffic,
        max_commission=max_commission, has_traffic=has_traffic, has_signup=has_signup,
        directory_status=directory_status,
        networks=networks, approval=approval, registrations_open=registrations_open,
        payout_currency=payout_currency, payout_frequency=payout_frequency,
    )
    q = select(AffiliateProgram).order_by(AffiliateProgram.crawled_at.desc())
    if where is not None:
        q = q.where(where)
    if ids:
        q = q.where(AffiliateProgram.id.in_(ids))
    rows = list((await session.execute(q)).scalars().all())
    if min_cookie_days and min_cookie_days > 0:
        rows = [p for p in rows if (_parse_cookie_days(p.cookie_duration) or 0) >= min_cookie_days]
    return rows


async def list_program_ids(
    session: AsyncSession,
    source: Optional[str] = None,
    category: Optional[str] = None,
    search: Optional[str] = None,
    min_commission: Optional[float] = None,
    max_commission: Optional[float] = None,
    min_traffic: Optional[float] = None,
    min_cookie_days: Optional[int] = None,
    has_traffic: Optional[bool] = None,
    has_signup: Optional[bool] = None,
    sources: Optional[List[str]] = None,
    categories: Optional[List[str]] = None,
    directory_status: Optional[str] = None,
    networks: Optional[List[str]] = None,
    approval: Optional[str] = None,
    registrations_open: Optional[bool] = None,
    payout_currency: Optional[str] = None,
    payout_frequency: Optional[str] = None,
    sort_by: str = "crawled_at",
    order: str = "desc",
) -> List[int]:
    """Trả về toàn bộ id khớp filter — dùng cho 'Chọn tất cả' phía FE.

    Không phân trang. Nếu có ``min_cookie_days`` phải post-filter trong Python
    do ``cookie_duration`` lưu dạng text.
    """
    where = _build_where(
        source, category, search, min_commission, min_traffic,
        sources, categories,
        max_commission=max_commission, has_traffic=has_traffic, has_signup=has_signup,
        directory_status=directory_status,
        networks=networks, approval=approval, registrations_open=registrations_open,
        payout_currency=payout_currency, payout_frequency=payout_frequency,
    )
    col = _SORTABLE.get(sort_by, AffiliateProgram.crawled_at)
    direction = asc if order == "asc" else desc

    if min_cookie_days and min_cookie_days > 0:
        q = select(AffiliateProgram.id, AffiliateProgram.cookie_duration).order_by(
            direction(col), AffiliateProgram.id.desc()
        )
        if where is not None:
            q = q.where(where)
        rows = (await session.execute(q)).all()
        return [
            int(rid) for rid, cookie in rows
            if (_parse_cookie_days(cookie) or 0) >= min_cookie_days
        ]

    q = select(AffiliateProgram.id).order_by(direction(col), AffiliateProgram.id.desc())
    if where is not None:
        q = q.where(where)
    return [int(r) for r in (await session.execute(q)).scalars().all()]


async def list_categories(session: AsyncSession, source: Optional[str] = None) -> List[str]:
    q = select(AffiliateProgram.category).where(AffiliateProgram.category.isnot(None)).distinct()
    if source:
        q = q.where(AffiliateProgram.source == source)
    rows = (await session.execute(q)).scalars().all()
    return sorted([r for r in rows if r])


async def get_program(program_id: int, session: AsyncSession) -> Optional[AffiliateProgram]:
    return await session.get(AffiliateProgram, program_id)


async def delete_program(program_id: int, session: AsyncSession) -> bool:
    res = await session.execute(delete(AffiliateProgram).where(AffiliateProgram.id == program_id))
    await session.commit()
    return res.rowcount > 0


async def bulk_delete(ids: List[int], session: AsyncSession) -> int:
    if not ids:
        return 0
    res = await session.execute(delete(AffiliateProgram).where(AffiliateProgram.id.in_(ids)))
    await session.commit()
    return int(res.rowcount or 0)
