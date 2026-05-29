from datetime import datetime, timedelta
from typing import Optional, Tuple
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from app.models import User, Session as DbSession
from app.core.security import hash_password, verify_password, generate_token
from app.core.config import settings


class AuthError(Exception):
    pass


async def register(email: str, password: str, session: AsyncSession) -> User:
    email = email.lower().strip()
    existing = await session.scalar(select(User).where(User.email == email))
    if existing:
        raise AuthError("Email đã tồn tại")
    user = User(email=email, password_hash=hash_password(password))
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


async def login(email: str, password: str, session: AsyncSession) -> Tuple[User, str]:
    email = email.lower().strip()
    user = await session.scalar(select(User).where(User.email == email))
    if not user or not verify_password(password, user.password_hash):
        raise AuthError("Email hoặc mật khẩu không đúng")
    token = generate_token()
    expires = datetime.utcnow() + timedelta(hours=settings.session_ttl_hours)
    session.add(DbSession(token=token, user_id=user.id, expires_at=expires))
    await session.commit()
    return user, token


async def get_user_by_token(token: str, session: AsyncSession) -> Optional[User]:
    if not token:
        return None
    row = await session.scalar(select(DbSession).where(DbSession.token == token))
    if not row:
        return None
    if row.expires_at < datetime.utcnow():
        return None
    return await session.get(User, row.user_id)


async def logout(token: str, session: AsyncSession) -> None:
    if not token:
        return
    await session.execute(delete(DbSession).where(DbSession.token == token))
    await session.commit()


async def seed_default_admin(session: AsyncSession, email: str = "admin", password: str = "1") -> None:
    """Đảm bảo chỉ tồn tại đúng 1 user mặc định (admin/1). Xoá user khác (sessions cascade theo).

    KHÔNG xoá sessions của admin → user không bị đá ra mỗi lần BE reload.
    """
    email = email.lower().strip()
    # Xoá user khác — sessions của họ tự rớt theo FK CASCADE.
    # KHÔNG `delete(DbSession)` trực tiếp vì sẽ xoá luôn session đăng nhập hiện tại của admin.
    await session.execute(delete(User).where(User.email != email))
    existing = await session.scalar(select(User).where(User.email == email))
    target_hash = hash_password(password)
    if existing is None:
        session.add(User(email=email, password_hash=target_hash))
    elif not verify_password(password, existing.password_hash):
        existing.password_hash = target_hash
    await session.commit()
