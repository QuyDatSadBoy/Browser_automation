"""In-process job runner: asyncio.Queue + worker task."""
from __future__ import annotations
import asyncio
import json
import traceback
from datetime import datetime
from typing import Optional
from app.core.db import SessionLocal
from app.core.logger import get_logger
from app.services import job_service, program_service
from app.services.crawlers.registry import get_crawler

log = get_logger("job_runner")

_queue: "asyncio.Queue[int]" = asyncio.Queue()
_worker_task: Optional[asyncio.Task] = None


async def _run_job(job_id: int) -> None:
    async with SessionLocal() as session:
        job = await job_service.get_job(job_id, session)
        if not job:
            return
        source = job.source
        params = json.loads(job.params_json) if job.params_json else {}
        await job_service.update_job(job_id, session, status="running", started_at=datetime.utcnow())

    try:
        crawler = get_crawler(source, **params)
        rows = await crawler.crawl()
        async with SessionLocal() as session:
            saved = await program_service.upsert_programs(rows, session)
            await job_service.update_job(
                job_id, session,
                status="success",
                total_found=len(rows),
                total_saved=saved,
                finished_at=datetime.utcnow(),
            )
        log.info("Job #%s [%s] OK — found=%s saved=%s", job_id, source, len(rows), saved)
    except Exception as e:
        log.exception("Job #%s failed", job_id)
        async with SessionLocal() as session:
            await job_service.update_job(
                job_id, session,
                status="failed",
                error=f"{e}\n{traceback.format_exc()[-800:]}",
                finished_at=datetime.utcnow(),
            )


async def _worker_loop() -> None:
    log.info("Job worker started")
    while True:
        try:
            job_id = await _queue.get()
        except asyncio.CancelledError:
            break
        try:
            await _run_job(job_id)
        except Exception:
            log.exception("Unhandled in worker")
        finally:
            _queue.task_done()


async def enqueue(source: str, params: Optional[dict] = None, user_id: Optional[int] = None) -> int:
    async with SessionLocal() as session:
        job = await job_service.create_job(source, session, user_id=user_id, params=params)
        job_id = job.id
    await _queue.put(job_id)
    return job_id


def start() -> None:
    global _worker_task
    if _worker_task is None or _worker_task.done():
        _worker_task = asyncio.create_task(_worker_loop())


async def stop() -> None:
    global _worker_task
    if _worker_task and not _worker_task.done():
        _worker_task.cancel()
        try:
            await _worker_task
        except asyncio.CancelledError:
            pass
        _worker_task = None
