"""Traffic scan job runner — asyncio.Queue worker quét SimilarWeb cho nhiều program.

Pattern giống signup_runner: 1 worker, queue id, mỗi job chạy semaphore song song.
Cập nhật progress vào DB sau mỗi program hoàn tất để FE poll được.
"""

from __future__ import annotations

import asyncio
import json
import traceback
from datetime import datetime
from typing import Optional

from sqlalchemy import select

from app.core.db import SessionLocal
from app.core.logger import get_logger
from app.models.affiliate_program import AffiliateProgram
from app.models.traffic_scan_job import TrafficScanJob
from app.services.traffic import scan_traffic

log = get_logger("traffic_runner")

_queue: "asyncio.Queue[int]" = asyncio.Queue()
_worker_task: Optional[asyncio.Task] = None


async def _load_job(session, job_id: int) -> TrafficScanJob | None:
    res = await session.execute(select(TrafficScanJob).where(TrafficScanJob.id == job_id))
    return res.scalar_one_or_none()


async def _run_job(job_id: int) -> None:
    # Đọc job + load programs
    async with SessionLocal() as session:
        job = await _load_job(session, job_id)
        if not job:
            return
        program_ids: list[int] = json.loads(job.program_ids_json or "[]")
        skip_existing = bool(job.skip_existing)
        months = max(1, min(12, int(job.months or 12)))
        concurrency = max(1, min(4, int(job.concurrency or 2)))

        rows = (
            await session.execute(
                select(AffiliateProgram).where(AffiliateProgram.id.in_(program_ids))
            )
        ).scalars().all()
        by_id = {p.id: p for p in rows}
        # Giữ thứ tự ids gốc
        programs = [by_id[pid] for pid in program_ids if pid in by_id]

        job.status = "running"
        job.started_at = datetime.utcnow()
        job.total = len(program_ids)
        await session.commit()

    sem = asyncio.Semaphore(concurrency)
    results: list[dict] = []
    counts = {"scanned": 0, "found": 0, "skipped": 0, "failed": 0}
    lock = asyncio.Lock()  # bảo vệ counts/results khi append

    async def _persist_progress():
        """Snapshot counts + results vào DB để FE poll thấy."""
        async with SessionLocal() as s:
            j = await _load_job(s, job_id)
            if not j:
                return
            j.scanned = counts["scanned"]
            j.found = counts["found"]
            j.skipped = counts["skipped"]
            j.failed = counts["failed"]
            j.results_json = json.dumps(results, ensure_ascii=False)
            await s.commit()

    async def _one(p: AffiliateProgram):
        # Skip nếu đã có traffic
        if skip_existing and p.traffic_score and p.traffic_score > 0:
            async with lock:
                counts["skipped"] += 1
                results.append({
                    "program_id": p.id, "name": p.name,
                    "status": "skipped", "monthly_visits": int(p.traffic_score or 0),
                })
            return
        url = p.url or p.signup_url or p.source_url
        if not url:
            async with lock:
                counts["failed"] += 1
                results.append({
                    "program_id": p.id, "name": p.name,
                    "status": "failed", "error": "không có URL",
                })
            return
        async with sem:
            try:
                result = await scan_traffic(url, months=months)
            except Exception as e:  # noqa: BLE001
                log.warning("traffic-scan failed id=%s url=%s: %s", p.id, url, e)
                async with lock:
                    counts["failed"] += 1
                    results.append({
                        "program_id": p.id, "name": p.name,
                        "status": "failed", "error": str(e)[:200],
                    })
                return
        # Update program record trong session ngắn
        visits = int(result.get("monthly_visits") or 0)
        details = result.get("traffic_details")
        async with SessionLocal() as s:
            prog = await s.get(AffiliateProgram, p.id)
            if prog:
                prog.traffic_score = float(visits)
                prog.traffic_period_month = result.get("period_month")
                prog.traffic_details_json = (
                    json.dumps(details, ensure_ascii=False) if details else None
                )
                prog.traffic_scanned_at = datetime.utcnow()
                await s.commit()
        async with lock:
            counts["scanned"] += 1
            if result.get("found"):
                counts["found"] += 1
            results.append({
                "program_id": p.id, "name": p.name,
                "status": "ok" if result.get("found") else "empty",
                "monthly_visits": visits,
                "period_month": result.get("period_month"),
            })
        # Persist progress sau mỗi item (FE thấy real-time)
        await _persist_progress()

    try:
        await asyncio.gather(*[_one(p) for p in programs])
        async with SessionLocal() as session:
            j = await _load_job(session, job_id)
            if j:
                j.status = "success"
                j.scanned = counts["scanned"]
                j.found = counts["found"]
                j.skipped = counts["skipped"]
                j.failed = counts["failed"]
                j.results_json = json.dumps(results, ensure_ascii=False)
                j.finished_at = datetime.utcnow()
                await session.commit()
    except Exception as e:
        log.exception("Traffic job %s failed", job_id)
        async with SessionLocal() as session:
            j = await _load_job(session, job_id)
            if j:
                j.status = "failed"
                j.error = f"{e}\n{traceback.format_exc()[-800:]}"
                j.finished_at = datetime.utcnow()
                await session.commit()


async def _worker_loop() -> None:
    log.info("Traffic worker started")
    while True:
        try:
            job_id = await _queue.get()
        except asyncio.CancelledError:
            break
        try:
            await _run_job(job_id)
        except Exception:
            log.exception("Unhandled in traffic worker")
        finally:
            _queue.task_done()


async def enqueue(
    *,
    user_id: Optional[int],
    program_ids: list[int],
    skip_existing: bool = True,
    months: int = 3,
    concurrency: int = 2,
) -> int:
    async with SessionLocal() as session:
        job = TrafficScanJob(
            user_id=user_id,
            program_ids_json=json.dumps(program_ids),
            skip_existing=skip_existing,
            months=max(1, min(12, int(months or 12))),
            concurrency=max(1, min(4, int(concurrency or 2))),
            status="pending",
            total=len(program_ids),
        )
        session.add(job)
        await session.commit()
        await session.refresh(job)
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
