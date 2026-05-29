"""API auto-signup."""

from __future__ import annotations

import json
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.db import get_session
from app.deps import get_current_user
from app.models import User
from app.models.signup_job import SignupJob
from app.services import signup_runner

router = APIRouter(prefix="/api/signup", tags=["signup"])


class SignupJobIn(BaseModel):
    program_ids: List[int]
    profile_ids: List[str]
    email_ids: List[str] = []
    proxy_ids: List[str] = []
    instruction_names: List[str] = []
    instruction_name: Optional[str] = ""  # legacy single
    extra_prompt: Optional[str] = ""
    headless: bool = False
    sms_profile_id: Optional[str] = ""  # áp preset SMS cho cả job (override per-program)
    batch_id: Optional[str] = ""  # gom nhiều job vào 1 batch


class SignupJobOut(BaseModel):
    id: int
    user_id: Optional[int]
    program_ids: List[int]
    profile_ids: List[str]
    email_ids: List[str] = []
    proxy_ids: List[str] = []
    instruction_names: List[str] = []
    instruction_name: Optional[str]
    extra_prompt: Optional[str]
    headless: bool
    status: str
    total: int
    succeeded: int
    failed: int
    results: list
    error: Optional[str]
    started_at: Optional[str]
    finished_at: Optional[str]
    created_at: Optional[str]
    sms_profile_id: Optional[str] = None
    batch_id: Optional[str] = None


def _to_out(j: SignupJob) -> SignupJobOut:
    return SignupJobOut(
        id=j.id,
        user_id=j.user_id,
        program_ids=json.loads(j.program_ids_json or "[]"),
        profile_ids=json.loads(j.profile_ids_json or "[]"),
        email_ids=json.loads(j.email_ids_json or "[]"),
        proxy_ids=json.loads(j.proxy_ids_json or "[]"),
        instruction_names=json.loads(j.instruction_names_json or "[]"),
        instruction_name=j.instruction_name,
        extra_prompt=j.extra_prompt,
        headless=j.headless,
        status=j.status,
        total=j.total,
        succeeded=j.succeeded,
        failed=j.failed,
        results=json.loads(j.results_json or "[]"),
        error=j.error,
        started_at=j.started_at.isoformat() + "Z" if j.started_at else None,
        finished_at=j.finished_at.isoformat() + "Z" if j.finished_at else None,
        created_at=j.created_at.isoformat() + "Z" if j.created_at else None,
        sms_profile_id=j.sms_profile_id,
        batch_id=j.batch_id,
    )


@router.post("/jobs", response_model=SignupJobOut)
async def create_signup_job(
    payload: SignupJobIn,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    if not payload.program_ids:
        raise HTTPException(400, "Cần chọn ít nhất 1 program")
    if not payload.profile_ids:
        raise HTTPException(400, "Cần chọn ít nhất 1 profile")
    job_id = await signup_runner.enqueue(
        user_id=user.id,
        program_ids=payload.program_ids,
        profile_ids=payload.profile_ids,
        email_ids=payload.email_ids,
        proxy_ids=payload.proxy_ids,
        instruction_names=payload.instruction_names,
        instruction_name=payload.instruction_name or "",
        extra_prompt=payload.extra_prompt or "",
        headless=payload.headless,
        sms_profile_id=payload.sms_profile_id or "",
        batch_id=payload.batch_id or "",
    )
    row = (
        await session.execute(select(SignupJob).where(SignupJob.id == job_id))
    ).scalar_one()
    return _to_out(row)


@router.get("/jobs", response_model=List[SignupJobOut])
async def list_signup_jobs(
    limit: int = 50,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    rows = (
        await session.execute(
            select(SignupJob)
            .where(SignupJob.user_id == user.id)
            .order_by(SignupJob.id.desc())
            .limit(limit)
        )
    ).scalars().all()
    return [_to_out(r) for r in rows]


@router.get("/jobs/{job_id}", response_model=SignupJobOut)
async def get_signup_job(
    job_id: int,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    row = (
        await session.execute(select(SignupJob).where(SignupJob.id == job_id))
    ).scalar_one_or_none()
    if not row:
        raise HTTPException(404, "Job không tồn tại")
    if row.user_id and row.user_id != user.id:
        raise HTTPException(403, "Không có quyền xem job này")
    return _to_out(row)


@router.get("/screenshots/{filename:path}")
async def get_signup_screenshot(
    filename: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Serve PNG screenshot từ data/signup_screenshots/."""
    if ".." in filename or filename.startswith("/"):
        raise HTTPException(400, "Invalid filename")
    # Filename có thể bao gồm prefix "signup_screenshots/" do backend lưu relative path
    name = filename.split("/")[-1]
    if not name.endswith(".png"):
        raise HTTPException(400, "Chỉ phục vụ file .png")
    path = settings.data_path("signup_screenshots") / name
    if not path.exists():
        raise HTTPException(404, "Screenshot không tồn tại")
    # Verify ownership: parse job_id từ filename (format: job{id}_prog...) → check user
    import re as _re
    m = _re.match(r"job(\d+)_", name)
    if m:
        job_id = int(m.group(1))
        row = (await session.execute(
            select(SignupJob).where(SignupJob.id == job_id)
        )).scalar_one_or_none()
        if row and row.user_id and row.user_id != user.id:
            raise HTTPException(403, "Không có quyền xem screenshot này")
    return FileResponse(path, media_type="image/png")
