from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select
from app.core.config import settings
from app.core.db import init_db, SessionLocal
from app.core.logger import get_logger
from app.models import User
from app.services import job_runner, signup_runner, traffic_runner, user_service
from app.services.storage import profile_store, instruction_store
from app.api import auth, sources, crawl, jobs, programs, profiles, instructions, shortlists, signup, system, ads_transparency, emails, proxies, sms, sms_profiles

log = get_logger("main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("Starting %s", settings.app_name)
    await init_db()
    async with SessionLocal() as s:
        await user_service.seed_default_admin(s)
        admin = (await s.execute(select(User).where(User.email == "admin"))).scalar_one_or_none()
    log.info("Default admin user ensured (admin/1)")
    # Migrate legacy file (data/profiles/*.json + data/instructions/*) sang subfolder user
    if admin is not None:
        try:
            moved_p = profile_store.migrate_legacy_to_user(admin.id)
            moved_i = instruction_store.migrate_legacy_to_user(admin.id)
            if moved_p or moved_i:
                log.info("Migrated legacy files → user folder: profiles=%s instructions=%s", moved_p, moved_i)
        except Exception:
            log.exception("Legacy storage migration failed")
    job_runner.start()
    signup_runner.start()
    traffic_runner.start()
    log.info("Job runners started (crawl + signup + traffic)")
    yield
    log.info("Shutting down...")
    await job_runner.stop()
    await signup_runner.stop()
    await traffic_runner.stop()


app = FastAPI(title=settings.app_name, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok", "app": settings.app_name}


for r in (auth.router, sources.router, crawl.router, jobs.router,
          programs.router, profiles.router, instructions.router, shortlists.router, signup.router, system.router,
          ads_transparency.router, emails.router, proxies.router, sms.router, sms_profiles.router):
    app.include_router(r)
