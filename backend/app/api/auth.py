from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.db import get_session
from app.core.config import settings
from app.deps import get_current_user
from app.models import User
from app.schemas.auth import LoginIn, RegisterIn, UserOut
from app.services import user_service

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _set_cookie(resp: Response, token: str) -> None:
    resp.set_cookie(
        key=settings.session_cookie_name,
        value=token,
        max_age=int(timedelta(hours=settings.session_ttl_hours).total_seconds()),
        httponly=True,
        samesite="lax",
        secure=False,
        path="/",
    )


@router.post("/register", response_model=UserOut)
async def register(body: RegisterIn, response: Response, session: AsyncSession = Depends(get_session)):
    try:
        user = await user_service.register(body.email, body.password, session)
    except user_service.AuthError as e:
        raise HTTPException(status_code=400, detail=str(e))
    _, token = await user_service.login(body.email, body.password, session)
    _set_cookie(response, token)
    return user


@router.post("/login", response_model=UserOut)
async def login(body: LoginIn, response: Response, session: AsyncSession = Depends(get_session)):
    try:
        user, token = await user_service.login(body.email, body.password, session)
    except user_service.AuthError as e:
        raise HTTPException(status_code=401, detail=str(e))
    _set_cookie(response, token)
    return user


@router.post("/logout")
async def logout(request: Request, response: Response, session: AsyncSession = Depends(get_session)):
    token = request.cookies.get(settings.session_cookie_name, "")
    await user_service.logout(token, session)
    response.delete_cookie(settings.session_cookie_name, path="/")
    return {"ok": True}


@router.get("/me", response_model=UserOut)
async def me(user: User = Depends(get_current_user)):
    return user
