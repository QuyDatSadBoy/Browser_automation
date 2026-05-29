from typing import AsyncIterator
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import event
from sqlalchemy.engine import Engine
from .config import settings


class Base(DeclarativeBase):
    pass


engine = create_async_engine(settings.database_url, echo=False, future=True)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


# SQLite mặc định KHÔNG enforce foreign keys → bật ON cho mọi connection
# để ON DELETE CASCADE hoạt động (xoá shortlist sẽ xoá items kèm theo).
@event.listens_for(engine.sync_engine, "connect")
def _enable_sqlite_fk(dbapi_conn, _):
    try:
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()
    except Exception:
        pass


async def get_session() -> AsyncIterator[AsyncSession]:
    async with SessionLocal() as session:
        yield session


async def init_db() -> None:
    # Ensure data dirs exist
    for sub in ("profiles", "instructions", "screenshots"):
        settings.data_path(sub).mkdir(parents=True, exist_ok=True)
    # Import models so metadata is registered
    from app import models  # noqa: F401

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Lightweight auto-migration (v1 không dùng Alembic). Thêm cột nếu thiếu.
        await _ensure_column(conn, "crawl_jobs", "params_json", "TEXT")
        await _ensure_column(conn, "crawl_jobs", "user_id", "INTEGER")
        await _ensure_column(conn, "affiliate_programs", "traffic_score", "REAL")
        await _ensure_column(conn, "affiliate_programs", "traffic_period_month", "VARCHAR(7)")
        await _ensure_column(conn, "affiliate_programs", "traffic_details_json", "TEXT")
        await _ensure_column(conn, "affiliate_programs", "traffic_scanned_at", "DATETIME")
        await _ensure_column(conn, "affiliate_programs", "sms_country_id", "VARCHAR(16)")
        await _ensure_column(conn, "affiliate_programs", "sms_service_id", "VARCHAR(16)")
        await _ensure_column(conn, "affiliate_programs", "sms_profile_id", "VARCHAR(64)")
        await _ensure_column(conn, "affiliate_programs", "directory_traffic", "VARCHAR(64)")
        await _ensure_column(conn, "affiliate_programs", "directory_popularity", "VARCHAR(64)")
        await _ensure_column(conn, "affiliate_programs", "directory_status", "VARCHAR(64)")
        await _ensure_column(conn, "affiliate_programs", "logo_url", "VARCHAR(500)")
        await _ensure_column(conn, "affiliate_programs", "short_description", "VARCHAR(500)")
        await _ensure_column(conn, "affiliate_programs", "directory_network", "VARCHAR(64)")
        await _ensure_column(conn, "affiliate_programs", "directory_approval", "VARCHAR(32)")
        await _ensure_column(conn, "affiliate_programs", "directory_approval_time", "VARCHAR(32)")
        await _ensure_column(conn, "affiliate_programs", "directory_attribution", "VARCHAR(32)")
        await _ensure_column(conn, "affiliate_programs", "directory_tracking", "VARCHAR(32)")
        await _ensure_column(conn, "affiliate_programs", "directory_last_verified_at", "VARCHAR(32)")
        await _ensure_column(conn, "affiliate_programs", "directory_program_age", "VARCHAR(32)")
        await _ensure_column(conn, "affiliate_programs", "payout_min", "REAL")
        await _ensure_column(conn, "affiliate_programs", "payout_currency", "VARCHAR(16)")
        await _ensure_column(conn, "affiliate_programs", "payout_frequency", "VARCHAR(32)")
        await _ensure_column(conn, "affiliate_programs", "payout_methods_json", "TEXT")
        await _ensure_column(conn, "affiliate_programs", "commission_duration", "VARCHAR(64)")
        await _ensure_column(conn, "affiliate_programs", "commission_conditions", "TEXT")
        await _ensure_column(conn, "affiliate_programs", "restrictions_json", "TEXT")
        await _ensure_column(conn, "affiliate_programs", "agents_json", "TEXT")
        await _ensure_column(conn, "affiliate_programs", "registrations_open", "INTEGER")
        await _ensure_column(conn, "signup_jobs", "sms_profile_id", "VARCHAR(64)")
        await _ensure_column(conn, "signup_jobs", "batch_id", "VARCHAR(36)")
        await _ensure_column(conn, "ads_search_history", "results_json", "TEXT")


async def _ensure_column(conn, table: str, column: str, ddl_type: str) -> None:
    from sqlalchemy import text
    res = await conn.execute(text(f"PRAGMA table_info({table})"))
    cols = {row[1] for row in res.fetchall()}
    if column not in cols:
        await conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {ddl_type}"))
