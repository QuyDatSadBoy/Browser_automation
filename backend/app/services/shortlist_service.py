import json
import re
from datetime import datetime
from typing import List, Optional, Tuple, Dict, Any

from sqlalchemy import select, func, delete, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Shortlist, ShortlistItem, AffiliateProgram
from app.schemas.shortlist import Criteria, Weights, Thresholds


# ---------------- helpers ----------------

_COOKIE_RE = re.compile(r"(\d+)\s*(d|day|days|m|month|months|y|year|years|h|hour|hours)?", re.I)


def parse_cookie_days(text: Optional[str]) -> Optional[int]:
    """Parse '30d' / '90 days' / '6 months' / '1 year' -> số ngày. None nếu không parse được."""
    if not text:
        return None
    m = _COOKIE_RE.search(str(text))
    if not m:
        return None
    n = int(m.group(1))
    unit = (m.group(2) or "d").lower()
    if unit.startswith("d"):
        return n
    if unit.startswith("h"):
        return max(1, n // 24)
    if unit.startswith("m"):  # month
        return n * 30
    if unit.startswith("y"):
        return n * 365
    return n


def _normalize_weights(w: Weights) -> Tuple[float, float, float]:
    t, c, k = max(0.0, w.traffic), max(0.0, w.commission), max(0.0, w.cookie)
    s = t + c + k
    if s <= 0:
        return (1 / 3, 1 / 3, 1 / 3)
    return (t / s, c / s, k / s)


def _minmax(values: List[Optional[float]]) -> List[float]:
    """Min-max normalize, None -> 0."""
    nums = [v for v in values if v is not None]
    if not nums:
        return [0.0 for _ in values]
    lo, hi = min(nums), max(nums)
    if hi - lo < 1e-9:
        return [1.0 if v is not None else 0.0 for v in values]
    return [((v - lo) / (hi - lo)) if v is not None else 0.0 for v in values]


def _criteria_to_json(c: Criteria) -> str:
    return c.model_dump_json()


def _criteria_from_json(s: Optional[str]) -> Criteria:
    if not s:
        return Criteria()
    try:
        return Criteria(**json.loads(s))
    except Exception:
        return Criteria()


# ---------------- candidate query ----------------

async def _query_candidates(session: AsyncSession, criteria: Criteria) -> List[AffiliateProgram]:
    """Lọc programs theo thresholds + filters (chưa scoring)."""
    conds = []
    th = criteria.thresholds
    pol = (criteria.missing_traffic_policy or "zero").lower()

    if criteria.sources:
        conds.append(AffiliateProgram.source.in_(criteria.sources))
    if criteria.categories:
        conds.append(AffiliateProgram.category.in_(criteria.categories))
    if criteria.search:
        like = f"%{criteria.search.lower()}%"
        conds.append(func.lower(AffiliateProgram.name).like(like))
    if th.min_commission > 0:
        conds.append(AffiliateProgram.commission_value >= th.min_commission)

    # traffic threshold
    if th.min_traffic > 0:
        if pol == "ignore":
            conds.append(AffiliateProgram.traffic_score >= th.min_traffic)
        elif pol == "include":
            conds.append(
                or_(AffiliateProgram.traffic_score >= th.min_traffic, AffiliateProgram.traffic_score.is_(None))
            )
        else:  # "zero" -> NULL coi như 0, không pass
            conds.append(AffiliateProgram.traffic_score >= th.min_traffic)

    q = select(AffiliateProgram)
    if conds:
        q = q.where(and_(*conds))
    # Giới hạn an toàn để không scoring quá nhiều — top 2000 mới nhất.
    q = q.order_by(AffiliateProgram.id.desc()).limit(2000)
    rows = (await session.execute(q)).scalars().all()

    # post-filter cookie (cookie_duration là text, không index được)
    if th.min_cookie_days > 0:
        filtered = []
        for p in rows:
            d = parse_cookie_days(p.cookie_duration)
            if d is not None and d >= th.min_cookie_days:
                filtered.append(p)
        rows = filtered
    return list(rows)


def _score(programs: List[AffiliateProgram], criteria: Criteria) -> List[Dict[str, Any]]:
    """Tính score cho từng program. Trả về [{program, score, breakdown}]."""
    if not programs:
        return []
    w_t, w_c, w_k = _normalize_weights(criteria.weights)

    traffic_vals = [p.traffic_score for p in programs]
    comm_vals = [p.commission_value for p in programs]
    cookie_vals = [parse_cookie_days(p.cookie_duration) for p in programs]

    n_t = _minmax(traffic_vals)
    n_c = _minmax(comm_vals)
    n_k = _minmax(cookie_vals)

    out = []
    for i, p in enumerate(programs):
        score = w_t * n_t[i] + w_c * n_c[i] + w_k * n_k[i]
        out.append({
            "program": p,
            "score": round(score, 4),
            "breakdown": {
                "traffic": round(n_t[i], 4),
                "commission": round(n_c[i], 4),
                "cookie": round(n_k[i], 4),
            },
        })
    out.sort(key=lambda x: x["score"], reverse=True)
    return out


async def preview(session: AsyncSession, criteria: Criteria, limit: int = 100) -> List[Dict[str, Any]]:
    candidates = await _query_candidates(session, criteria)
    scored = _score(candidates, criteria)
    return scored[:limit]


# ---------------- CRUD ----------------

async def list_shortlists(session: AsyncSession, user_id: int) -> List[Tuple[Shortlist, int]]:
    sl_q = select(Shortlist).where(Shortlist.user_id == user_id).order_by(Shortlist.updated_at.desc())
    rows = (await session.execute(sl_q)).scalars().all()
    if not rows:
        return []
    counts_q = (
        select(ShortlistItem.shortlist_id, func.count(ShortlistItem.id))
        .where(ShortlistItem.shortlist_id.in_([r.id for r in rows]))
        .group_by(ShortlistItem.shortlist_id)
    )
    counts = {sid: c for sid, c in (await session.execute(counts_q)).all()}
    return [(r, int(counts.get(r.id, 0))) for r in rows]


async def get_shortlist(session: AsyncSession, user_id: int, sid: int) -> Optional[Shortlist]:
    q = select(Shortlist).where(Shortlist.id == sid, Shortlist.user_id == user_id)
    return (await session.execute(q)).scalar_one_or_none()


async def create_shortlist(session: AsyncSession, user_id: int, name: str, description: str, criteria: Criteria) -> Shortlist:
    sl = Shortlist(
        user_id=user_id,
        name=name.strip() or "Shortlist mới",
        description=description or "",
        criteria_json=_criteria_to_json(criteria),
    )
    session.add(sl)
    await session.commit()
    await session.refresh(sl)
    return sl


async def update_shortlist(session: AsyncSession, sl: Shortlist, name: str, description: str, criteria: Optional[Criteria]) -> Shortlist:
    if name:
        sl.name = name.strip()
    if description is not None and description != "":
        sl.description = description
    if criteria is not None:
        sl.criteria_json = _criteria_to_json(criteria)
    sl.updated_at = datetime.utcnow()
    await session.commit()
    await session.refresh(sl)
    return sl


async def delete_shortlist(session: AsyncSession, sl: Shortlist) -> None:
    await session.delete(sl)
    await session.commit()


# ---------------- items ----------------

async def list_items(session: AsyncSession, sid: int) -> List[Tuple[ShortlistItem, AffiliateProgram]]:
    q = (
        select(ShortlistItem, AffiliateProgram)
        .join(AffiliateProgram, AffiliateProgram.id == ShortlistItem.program_id)
        .where(ShortlistItem.shortlist_id == sid)
        .order_by(ShortlistItem.score.desc().nulls_last(), ShortlistItem.added_at.desc())
    )
    return [(it, pg) for it, pg in (await session.execute(q)).all()]


async def add_item(session: AsyncSession, sid: int, program_id: int, note: str, manually: bool, score: Optional[float]) -> Optional[ShortlistItem]:
    # check exist
    exist_q = select(ShortlistItem).where(
        ShortlistItem.shortlist_id == sid, ShortlistItem.program_id == program_id
    )
    existing = (await session.execute(exist_q)).scalar_one_or_none()
    if existing:
        if note:
            existing.note = note
        if score is not None:
            existing.score = score
        await session.commit()
        return existing

    # ensure program exists
    pg = (await session.execute(select(AffiliateProgram.id).where(AffiliateProgram.id == program_id))).scalar_one_or_none()
    if not pg:
        return None
    item = ShortlistItem(
        shortlist_id=sid,
        program_id=program_id,
        added_manually=manually,
        note=note or None,
        score=score,
    )
    session.add(item)
    await session.commit()
    await session.refresh(item)
    return item


async def remove_item(session: AsyncSession, sid: int, program_id: int) -> int:
    res = await session.execute(
        delete(ShortlistItem).where(
            ShortlistItem.shortlist_id == sid, ShortlistItem.program_id == program_id
        )
    )
    await session.commit()
    return res.rowcount or 0


async def auto_fill(session: AsyncSession, sl: Shortlist, limit: int, replace: bool) -> int:
    criteria = _criteria_from_json(sl.criteria_json)
    scored = await preview(session, criteria, limit=limit)

    if replace:
        # chỉ xoá items auto (giữ items manual)
        await session.execute(
            delete(ShortlistItem).where(
                ShortlistItem.shortlist_id == sl.id, ShortlistItem.added_manually == False  # noqa
            )
        )
        await session.commit()

    added = 0
    for row in scored:
        pg: AffiliateProgram = row["program"]
        item = await add_item(session, sl.id, pg.id, note="", manually=False, score=row["score"])
        if item:
            added += 1
    sl.updated_at = datetime.utcnow()
    await session.commit()
    return added
