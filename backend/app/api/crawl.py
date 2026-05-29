from fastapi import APIRouter, Depends, HTTPException
from app.deps import get_current_user
from app.models import User
from app.schemas.job import JobCreateIn, JobCreateOut
from app.services import job_runner
from app.services.crawlers.registry import SOURCES

router = APIRouter(prefix="/api/crawl", tags=["crawl"])


@router.post("/{source}", response_model=JobCreateOut)
async def start_crawl(
    source: str,
    body: JobCreateIn | None = None,
    user: User = Depends(get_current_user),
):
    if source not in SOURCES:
        raise HTTPException(404, "Source không tồn tại")
    params = body.params if body and body.params else None
    job_id = await job_runner.enqueue(source, params=params, user_id=user.id)
    return JobCreateOut(job_id=job_id, source=source, status="pending")
