from datetime import datetime
import json
from typing import List, Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models import CrawlJob


async def create_job(
    source: str,
    session: AsyncSession,
    user_id: Optional[int] = None,
    params: Optional[dict] = None,
) -> CrawlJob:
    job = CrawlJob(
        source=source,
        user_id=user_id,
        status="pending",
        params_json=json.dumps(params) if params else None,
    )
    session.add(job)
    await session.commit()
    await session.refresh(job)
    return job


async def update_job(
    job_id: int,
    session: AsyncSession,
    status: Optional[str] = None,
    total_found: Optional[int] = None,
    total_saved: Optional[int] = None,
    error: Optional[str] = None,
    started_at: Optional[datetime] = None,
    finished_at: Optional[datetime] = None,
) -> None:
    job = await session.get(CrawlJob, job_id)
    if not job:
        return
    if status is not None:
        job.status = status
    if total_found is not None:
        job.total_found = total_found
    if total_saved is not None:
        job.total_saved = total_saved
    if error is not None:
        job.error = error
    if started_at is not None:
        job.started_at = started_at
    if finished_at is not None:
        job.finished_at = finished_at
    await session.commit()


async def list_jobs(
    session: AsyncSession,
    user_id: Optional[int] = None,
    limit: int = 50,
) -> List[CrawlJob]:
    q = select(CrawlJob).order_by(CrawlJob.created_at.desc()).limit(limit)
    if user_id is not None:
        # Hiển thị job của user + job legacy (chưa gán user_id) để backward compat
        q = q.where((CrawlJob.user_id == user_id) | (CrawlJob.user_id.is_(None)))
    res = await session.execute(q)
    return list(res.scalars().all())


async def get_job(
    job_id: int,
    session: AsyncSession,
    user_id: Optional[int] = None,
) -> Optional[CrawlJob]:
    job = await session.get(CrawlJob, job_id)
    if not job:
        return None
    if user_id is not None and job.user_id is not None and job.user_id != user_id:
        return None
    return job
