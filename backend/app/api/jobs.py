from typing import List
import json
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.db import get_session
from app.deps import get_current_user
from app.models import User
from app.schemas.job import JobOut
from app.services import job_service

router = APIRouter(prefix="/api/jobs", tags=["jobs"])


def _to_out(job) -> JobOut:
    return JobOut(
        id=job.id, source=job.source, status=job.status,
        total_found=job.total_found, total_saved=job.total_saved,
        error=job.error,
        params=json.loads(job.params_json) if job.params_json else None,
        started_at=job.started_at, finished_at=job.finished_at,
        created_at=job.created_at,
    )


@router.get("", response_model=List[JobOut])
async def list_jobs(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    jobs = await job_service.list_jobs(session, user_id=user.id)
    return [_to_out(j) for j in jobs]


@router.get("/{job_id}", response_model=JobOut)
async def get_job(
    job_id: int,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    job = await job_service.get_job(job_id, session, user_id=user.id)
    if not job:
        raise HTTPException(404, "Không tìm thấy job")
    return _to_out(job)
