"""Signup job runner — asyncio.Queue pool worker chạy song song."""

from __future__ import annotations

import asyncio
import json
import traceback
from datetime import datetime
from typing import List, Optional

from sqlalchemy import select

from app.core.config import settings
from app.core.db import SessionLocal
from app.core.logger import get_logger
from app.models.affiliate_program import AffiliateProgram
from app.models.signup_job import SignupJob
from app.services.signup.agent_runner import run_signup_attempt
from app.services.storage import instruction_store, profile_store, email_store, proxy_store, sms_profile_store

log = get_logger("signup_runner")

_queue: "asyncio.Queue[int]" = asyncio.Queue()
_worker_tasks: List[asyncio.Task] = []


async def _load_job(session, job_id: int) -> SignupJob | None:
    res = await session.execute(select(SignupJob).where(SignupJob.id == job_id))
    return res.scalar_one_or_none()


def _program_dict(p: AffiliateProgram) -> dict:
    return {
        "id": p.id,
        "source": p.source,
        "name": p.name,
        "url": p.url,
        "signup_url": p.signup_url,
        "category": p.category,
        "description": p.description,
        "sms_country_id": p.sms_country_id or "",
        "sms_service_id": p.sms_service_id or "",
        "sms_profile_id": p.sms_profile_id or "",
    }


def _resolve_sms_profile(prog: dict, user_id: int, run_profile_id: str = "") -> dict:
    """Resolve sms_profile_id → country/service.

    Priority: run-level override > program-level profile_id > program raw country/service.
    """
    pid = (run_profile_id or prog.get("sms_profile_id") or "").strip()
    if pid and user_id:
        prof = sms_profile_store.get_profile(user_id, pid)
        if prof:
            # Override nếu profile có set, giữ nguyên nếu rỗng (để fallback env)
            if prof.get("country_id"):
                prog["sms_country_id"] = prof["country_id"]
            if prof.get("service_id"):
                prog["sms_service_id"] = prof["service_id"]
            prog["sms_profile_id"] = pid
            prog["sms_profile_name"] = prof.get("name", "")
    return prog


async def _update_job(session, job_id: int, **fields) -> None:
    job = await _load_job(session, job_id)
    if not job:
        return
    for k, v in fields.items():
        setattr(job, k, v)
    await session.commit()


async def _run_job(job_id: int) -> None:
    # Đọc job + load programs + profiles + instruction
    async with SessionLocal() as session:
        job = await _load_job(session, job_id)
        if not job:
            return
        program_ids: list[int] = json.loads(job.program_ids_json or "[]")
        profile_ids: list[str] = json.loads(job.profile_ids_json or "[]")
        email_ids: list[str] = json.loads(job.email_ids_json or "[]")
        proxy_ids: list[str] = json.loads(job.proxy_ids_json or "[]")
        instruction_names: list[str] = json.loads(job.instruction_names_json or "[]")
        instruction_name = job.instruction_name or ""
        if not instruction_names and instruction_name:
            instruction_names = [instruction_name]
        extra_prompt = job.extra_prompt or ""
        headless = bool(job.headless)
        owner_user_id = int(job.user_id) if job.user_id else 0
        run_sms_profile_id = job.sms_profile_id or ""

        rows = (
            await session.execute(
                select(AffiliateProgram).where(AffiliateProgram.id.in_(program_ids))
            )
        ).scalars().all()
        programs = {p.id: _program_dict(p) for p in rows}

        await _update_job(
            session,
            job_id,
            status="running",
            started_at=datetime.utcnow(),
            total=len(program_ids),
        )

    # Load profile data (file-based, sync) + instruction content
    profiles: list[dict] = []
    for pid in profile_ids:
        try:
            p = profile_store.get_profile(owner_user_id, pid) if owner_user_id else None
            if p:
                profiles.append(p)
        except Exception as e:
            log.warning(f"profile {pid} load failed: {e}")
    if not profiles:
        async with SessionLocal() as session:
            await _update_job(
                session,
                job_id,
                status="failed",
                error="Không load được profile nào",
                finished_at=datetime.utcnow(),
            )
        return

    instruction_content = ""
    if instruction_names and owner_user_id:
        # Ghép nhiều instruction theo thứ tự, ngăn cách header
        chunks: list[str] = []
        for nm in instruction_names:
            try:
                doc = instruction_store.get_instruction(owner_user_id, nm)
                if doc and doc.get("content"):
                    chunks.append(f"# === {nm} ===\n{doc['content']}")
            except Exception as e:
                log.warning(f"instruction {nm} load failed: {e}")
        instruction_content = "\n\n".join(chunks)
    elif instruction_name and owner_user_id:
        try:
            doc = instruction_store.get_instruction(owner_user_id, instruction_name)
            if doc:
                instruction_content = doc.get("content", "")
        except Exception as e:
            log.warning(f"instruction {instruction_name} load failed: {e}")

    # Load emails — tuyệt đối chỉ lấy đúng những gì user chọn, KHÔNG fallback sang email khác
    emails: list[dict] = []
    for eid in email_ids:
        try:
            e = email_store.get_email(owner_user_id, eid) if owner_user_id else None
            if e:
                emails.append(e)
        except Exception as ex:
            log.warning(f"email {eid} load failed: {ex}")

    # Load proxies — ưu tiên user chọn, sau đó bổ sung phần còn lại trong DB của user làm fallback pool.
    # (Proxy và SMSPool được phép tự do rotate — không bị ràng buộc như email/profile/instruction)
    proxies: list[dict] = []
    _selected_proxy_ids: set[str] = set(proxy_ids)
    for pid in proxy_ids:
        try:
            p = proxy_store.get_proxy(owner_user_id, pid) if owner_user_id else None
            if p:
                proxies.append(p)
        except Exception as ex:
            log.warning(f"proxy {pid} load failed: {ex}")
    # Bổ sung proxies còn lại từ DB của user (trừ đã chọn + disabled)
    if owner_user_id:
        try:
            for pm in proxy_store.list_proxies(owner_user_id):
                if pm.get("id") not in _selected_proxy_ids and pm.get("status") != "disabled":
                    full = proxy_store.get_proxy(owner_user_id, pm["id"])
                    if full:
                        proxies.append(full)
        except Exception as ex:
            log.warning(f"proxy DB fallback load failed: {ex}")

    def _enrich(prof: dict, idx: int) -> dict:
        """Bơm email IMAP + proxy_url vào bản sao profile theo round-robin."""
        out = dict(prof)
        if emails:
            em = emails[idx % len(emails)]
            out["email"] = em.get("address", out.get("email", ""))
            if em.get("app_password"):
                out["imap"] = {"user": em.get("address", ""), "password": em["app_password"]}
            # Đặt cũng vào emails list để form dùng (backward-compat)
            out["_picked_email"] = em
        if proxies:
            px = proxies[idx % len(proxies)]
            out["proxy_url"] = px.get("url", "")
            out["_picked_proxy"] = px
        return out

    # Loop programs — mỗi program được gán đúng 1 profile/email do user chỉ định.
    # Nếu user chọn nhiều profile/email → phân theo round-robin theo thứ tự program,
    # KHÔNG dùng profile khác làm fallback khi fail (tuân thủ lựa chọn của user).
    # Proxy và SMS pool được phép tự chọn linh hoạt (xem _enrich + _resolve_sms_profile).
    results: list[dict] = []
    succeeded = 0
    failed = 0
    for prog_idx, pid in enumerate(program_ids):
        prog = programs.get(pid)
        if prog:
            prog = _resolve_sms_profile(prog, owner_user_id, run_sms_profile_id)
        if not prog or not (prog.get("signup_url") or prog.get("url")):
            results.append({
                "program_id": pid,
                "profile_id": None,
                "status": "failed",
                "message": "Program không có signup_url",
                "started_at": datetime.utcnow().isoformat() + "Z",
                "finished_at": datetime.utcnow().isoformat() + "Z",
            })
            failed += 1
            await _persist_progress(job_id, results, succeeded, failed)
            continue

        # Gán đúng 1 profile theo thứ tự program (round-robin nếu profiles < programs)
        prof = profiles[prog_idx % len(profiles)]
        enriched = _enrich(prof, prog_idx)  # email/proxy round-robin theo prog_idx
        attempt_started = datetime.utcnow()
        log.info(
            f"[signup job#{job_id}] program={pid} profile={prof.get('id')} "
            f"email={enriched.get('email','-')} proxy={'yes' if enriched.get('proxy_url') else 'no'} → start"
        )
        try:
            r = await run_signup_attempt(
                job_id=job_id,
                program=prog,
                profile=enriched,
                instruction_content=instruction_content,
                instruction_filename=instruction_names[0] if instruction_names else instruction_name,
                extra_prompt=extra_prompt,
                headless=headless,
            )
        except Exception as e:
            log.exception("attempt crash")
            r = {
                "status": "error",
                "message": f"{type(e).__name__}: {e}"[:500],
                "steps": 0,
                "duration_sec": 0,
            }
        entry = {
            "program_id": pid,
            "profile_id": prof.get("id"),
            "status": r.get("status"),
            "message": r.get("message"),
            "steps": r.get("steps"),
            "final_url": r.get("final_url"),
            "screenshot": r.get("screenshot"),
            "duration_sec": r.get("duration_sec"),
            "started_at": attempt_started.isoformat() + "Z",
            "finished_at": datetime.utcnow().isoformat() + "Z",
        }
        results.append(entry)
        status = (r.get("status") or "").lower()
        if status in ("success", "pending_verify"):
            succeeded += 1
        else:
            failed += 1
        await _persist_progress(job_id, results, succeeded, failed)


    # Final status
    final_status = "success" if failed == 0 else ("partial" if succeeded > 0 else "failed")
    async with SessionLocal() as session:
        await _update_job(
            session,
            job_id,
            status=final_status,
            succeeded=succeeded,
            failed=failed,
            results_json=json.dumps(results, ensure_ascii=False),
            finished_at=datetime.utcnow(),
        )
    log.info(f"[signup job#{job_id}] DONE — ok={succeeded} fail={failed}")


async def _persist_progress(job_id: int, results: list[dict], succeeded: int, failed: int) -> None:
    async with SessionLocal() as session:
        await _update_job(
            session,
            job_id,
            succeeded=succeeded,
            failed=failed,
            results_json=json.dumps(results, ensure_ascii=False),
        )


async def _worker_loop() -> None:
    log.info("Signup worker started")
    while True:
        try:
            job_id = await _queue.get()
        except asyncio.CancelledError:
            break
        try:
            await _run_job(job_id)
        except Exception:
            log.exception("Unhandled in signup worker")
            try:
                async with SessionLocal() as session:
                    await _update_job(
                        session,
                        job_id,
                        status="failed",
                        error=traceback.format_exc()[-800:],
                        finished_at=datetime.utcnow(),
                    )
            except Exception:
                pass
        finally:
            _queue.task_done()


async def enqueue(
    *,
    user_id: int | None,
    program_ids: list[int],
    profile_ids: list[str],
    email_ids: list[str] | None = None,
    proxy_ids: list[str] | None = None,
    instruction_names: list[str] | None = None,
    instruction_name: str = "",
    extra_prompt: str = "",
    headless: bool = False,
    sms_profile_id: str = "",
    batch_id: str = "",
) -> int:
    async with SessionLocal() as session:
        job = SignupJob(
            user_id=user_id,
            program_ids_json=json.dumps(program_ids),
            profile_ids_json=json.dumps(profile_ids),
            email_ids_json=json.dumps(email_ids or []),
            proxy_ids_json=json.dumps(proxy_ids or []),
            instruction_names_json=json.dumps(instruction_names or []),
            instruction_name=instruction_name or None,
            extra_prompt=extra_prompt or None,
            headless=headless,
            sms_profile_id=sms_profile_id or None,
            batch_id=batch_id or None,
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
    global _worker_tasks
    n = max(1, int(getattr(settings, "signup_worker_concurrency", 1) or 1))
    # Loại bỏ task đã done
    _worker_tasks = [t for t in _worker_tasks if not t.done()]
    need = n - len(_worker_tasks)
    for i in range(need):
        _worker_tasks.append(asyncio.create_task(_worker_loop()))
    if need > 0:
        log.info(f"Signup worker pool: {len(_worker_tasks)} worker(s) running")


async def stop() -> None:
    global _worker_tasks
    for t in _worker_tasks:
        if not t.done():
            t.cancel()
    for t in _worker_tasks:
        try:
            await t
        except asyncio.CancelledError:
            pass
    _worker_tasks = []
