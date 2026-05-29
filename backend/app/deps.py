from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.db import get_session
from app.core.config import settings
from app.models import User
from app.services import user_service


async def get_current_user(
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> User:
    token = request.cookies.get(settings.session_cookie_name, "")
    user = await user_service.get_user_by_token(token, session)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Chưa đăng nhập")
    return user
