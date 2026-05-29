from typing import List
from fastapi import APIRouter, Depends, HTTPException
from app.deps import get_current_user
from app.models import User
from app.schemas.profile import ProfileIn, ProfileMeta, ProfileOut
from app.services.storage import profile_store

router = APIRouter(prefix="/api/profiles", tags=["profiles"])


@router.get("", response_model=List[ProfileMeta])
async def list_profiles(user: User = Depends(get_current_user)):
    return profile_store.list_profiles(user.id)


@router.post("", response_model=ProfileOut)
async def create_profile(body: ProfileIn, user: User = Depends(get_current_user)):
    if profile_store.get_profile(user.id, body.id):
        raise HTTPException(400, "Profile id đã tồn tại")
    return profile_store.save_profile(user.id, body.model_dump())


@router.get("/{pid}", response_model=ProfileOut)
async def get_profile(pid: str, user: User = Depends(get_current_user)):
    p = profile_store.get_profile(user.id, pid)
    if not p:
        raise HTTPException(404, "Không tìm thấy profile")
    return p


@router.put("/{pid}", response_model=ProfileOut)
async def update_profile(pid: str, body: ProfileIn, user: User = Depends(get_current_user)):
    if body.id != pid:
        raise HTTPException(400, "Id không khớp")
    if not profile_store.get_profile(user.id, pid):
        raise HTTPException(404, "Không tìm thấy profile")
    return profile_store.save_profile(user.id, body.model_dump())


@router.delete("/{pid}")
async def delete_profile(pid: str, user: User = Depends(get_current_user)):
    ok = profile_store.delete_profile(user.id, pid)
    if not ok:
        raise HTTPException(404, "Không tìm thấy profile")
    return {"ok": True}


@router.post("/{pid}/duplicate")
async def duplicate_profile(pid: str, user: User = Depends(get_current_user)):
    try:
        new_id = profile_store.duplicate_profile(user.id, pid)
    except FileNotFoundError:
        raise HTTPException(404, "Không tìm thấy profile")
    return {"id": new_id}
