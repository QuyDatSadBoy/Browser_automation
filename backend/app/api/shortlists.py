from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.deps import get_current_user
from app.models import User, AffiliateProgram
from app.schemas.program import ProgramOut
from app.schemas.shortlist import (
    ShortlistCreate, ShortlistUpdate, ShortlistOut, ShortlistItemOut,
    Criteria, PreviewOut, ScoredProgramOut, AddItemIn, AutoFillIn, TrafficUpdateIn,
)
from app.services import shortlist_service

router = APIRouter(prefix="/api/shortlists", tags=["shortlists"], dependencies=[Depends(get_current_user)])


def _to_out(sl, criteria: Criteria, count: int) -> ShortlistOut:
    return ShortlistOut(
        id=sl.id, name=sl.name, description=sl.description, criteria=criteria,
        item_count=count, created_at=sl.created_at, updated_at=sl.updated_at,
    )


@router.get("", response_model=List[ShortlistOut])
async def list_all(user: User = Depends(get_current_user), session: AsyncSession = Depends(get_session)):
    rows = await shortlist_service.list_shortlists(session, user.id)
    return [_to_out(sl, shortlist_service._criteria_from_json(sl.criteria_json), c) for sl, c in rows]


@router.post("", response_model=ShortlistOut, status_code=status.HTTP_201_CREATED)
async def create(body: ShortlistCreate, user: User = Depends(get_current_user), session: AsyncSession = Depends(get_session)):
    sl = await shortlist_service.create_shortlist(session, user.id, body.name, body.description, body.criteria)
    return _to_out(sl, body.criteria, 0)


@router.get("/{sid}", response_model=ShortlistOut)
async def get_one(sid: int, user: User = Depends(get_current_user), session: AsyncSession = Depends(get_session)):
    sl = await shortlist_service.get_shortlist(session, user.id, sid)
    if not sl:
        raise HTTPException(404, "Không tìm thấy shortlist")
    items = await shortlist_service.list_items(session, sid)
    crit = shortlist_service._criteria_from_json(sl.criteria_json)
    return _to_out(sl, crit, len(items))


@router.put("/{sid}", response_model=ShortlistOut)
async def update(sid: int, body: ShortlistUpdate, user: User = Depends(get_current_user), session: AsyncSession = Depends(get_session)):
    sl = await shortlist_service.get_shortlist(session, user.id, sid)
    if not sl:
        raise HTTPException(404, "Không tìm thấy shortlist")
    sl = await shortlist_service.update_shortlist(session, sl, body.name, body.description, body.criteria)
    items = await shortlist_service.list_items(session, sid)
    crit = shortlist_service._criteria_from_json(sl.criteria_json)
    return _to_out(sl, crit, len(items))


@router.delete("/{sid}", status_code=204)
async def delete(sid: int, user: User = Depends(get_current_user), session: AsyncSession = Depends(get_session)):
    sl = await shortlist_service.get_shortlist(session, user.id, sid)
    if not sl:
        raise HTTPException(404, "Không tìm thấy shortlist")
    await shortlist_service.delete_shortlist(session, sl)


# -------- items --------

@router.get("/{sid}/items", response_model=List[ShortlistItemOut])
async def get_items(sid: int, user: User = Depends(get_current_user), session: AsyncSession = Depends(get_session)):
    sl = await shortlist_service.get_shortlist(session, user.id, sid)
    if not sl:
        raise HTTPException(404, "Không tìm thấy shortlist")
    rows = await shortlist_service.list_items(session, sid)
    out: List[ShortlistItemOut] = []
    for it, pg in rows:
        out.append(ShortlistItemOut(
            id=it.id, program_id=it.program_id, added_manually=it.added_manually,
            score=it.score, note=it.note, added_at=it.added_at,
            program=ProgramOut.model_validate(pg),
        ))
    return out


@router.post("/{sid}/items", response_model=ShortlistItemOut, status_code=201)
async def add_item(sid: int, body: AddItemIn, user: User = Depends(get_current_user), session: AsyncSession = Depends(get_session)):
    sl = await shortlist_service.get_shortlist(session, user.id, sid)
    if not sl:
        raise HTTPException(404, "Không tìm thấy shortlist")
    it = await shortlist_service.add_item(session, sid, body.program_id, body.note, manually=True, score=None)
    if not it:
        raise HTTPException(400, "Program không tồn tại")
    # fetch program để trả về
    from sqlalchemy import select
    pg = (await session.execute(select(AffiliateProgram).where(AffiliateProgram.id == it.program_id))).scalar_one_or_none()
    return ShortlistItemOut(
        id=it.id, program_id=it.program_id, added_manually=it.added_manually,
        score=it.score, note=it.note, added_at=it.added_at,
        program=ProgramOut.model_validate(pg) if pg else None,
    )


@router.delete("/{sid}/items/{program_id}", status_code=204)
async def del_item(sid: int, program_id: int, user: User = Depends(get_current_user), session: AsyncSession = Depends(get_session)):
    sl = await shortlist_service.get_shortlist(session, user.id, sid)
    if not sl:
        raise HTTPException(404, "Không tìm thấy shortlist")
    await shortlist_service.remove_item(session, sid, program_id)


# -------- preview & auto-fill --------

@router.post("/preview", response_model=PreviewOut)
async def preview_criteria(criteria: Criteria, limit: int = 100, _: User = Depends(get_current_user), session: AsyncSession = Depends(get_session)):
    """Preview top programs khớp criteria — KHÔNG cần lưu shortlist."""
    scored = await shortlist_service.preview(session, criteria, limit=limit)
    items = [
        ScoredProgramOut(
            program=ProgramOut.model_validate(r["program"]),
            score=r["score"], breakdown=r["breakdown"],
        ) for r in scored
    ]
    return PreviewOut(items=items, total=len(items))


@router.post("/{sid}/preview", response_model=PreviewOut)
async def preview_shortlist(sid: int, limit: int = 100, user: User = Depends(get_current_user), session: AsyncSession = Depends(get_session)):
    sl = await shortlist_service.get_shortlist(session, user.id, sid)
    if not sl:
        raise HTTPException(404, "Không tìm thấy shortlist")
    crit = shortlist_service._criteria_from_json(sl.criteria_json)
    scored = await shortlist_service.preview(session, crit, limit=limit)
    items = [
        ScoredProgramOut(
            program=ProgramOut.model_validate(r["program"]),
            score=r["score"], breakdown=r["breakdown"],
        ) for r in scored
    ]
    return PreviewOut(items=items, total=len(items))


@router.post("/{sid}/auto-fill")
async def auto_fill(sid: int, body: AutoFillIn, user: User = Depends(get_current_user), session: AsyncSession = Depends(get_session)):
    sl = await shortlist_service.get_shortlist(session, user.id, sid)
    if not sl:
        raise HTTPException(404, "Không tìm thấy shortlist")
    added = await shortlist_service.auto_fill(session, sl, body.limit, body.replace)
    return {"added": added}


# -------- traffic edit (cho phép user nhập tay traffic_score) --------

@router.patch("/programs/{program_id}/traffic")
async def update_traffic(program_id: int, body: TrafficUpdateIn, _: User = Depends(get_current_user), session: AsyncSession = Depends(get_session)):
    from sqlalchemy import select
    pg = (await session.execute(select(AffiliateProgram).where(AffiliateProgram.id == program_id))).scalar_one_or_none()
    if not pg:
        raise HTTPException(404, "Program không tồn tại")
    pg.traffic_score = body.traffic_score
    await session.commit()
    return {"id": pg.id, "traffic_score": pg.traffic_score}
