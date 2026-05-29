from typing import List
from fastapi import APIRouter, Depends, HTTPException
from app.deps import get_current_user
from app.models import User
from app.schemas.instruction import InstructionIn, InstructionMeta, InstructionOut
from app.services.storage import instruction_store

router = APIRouter(prefix="/api/instructions", tags=["instructions"])


@router.get("", response_model=List[InstructionMeta])
async def list_instructions(user: User = Depends(get_current_user)):
    return instruction_store.list_instructions(user.id)


@router.post("", response_model=InstructionOut)
async def create_instruction(body: InstructionIn, user: User = Depends(get_current_user)):
    if instruction_store.get_instruction(user.id, body.name):
        raise HTTPException(400, "File đã tồn tại")
    return instruction_store.save_instruction(user.id, body.name, body.content)


@router.get("/{name}", response_model=InstructionOut)
async def get_instruction(name: str, user: User = Depends(get_current_user)):
    item = instruction_store.get_instruction(user.id, name)
    if not item:
        raise HTTPException(404, "Không tìm thấy hướng dẫn")
    return item


@router.put("/{name}", response_model=InstructionOut)
async def update_instruction(name: str, body: InstructionIn, user: User = Depends(get_current_user)):
    if body.name != name:
        raise HTTPException(400, "Tên không khớp")
    return instruction_store.save_instruction(user.id, name, body.content)


@router.delete("/{name}")
async def delete_instruction(name: str, user: User = Depends(get_current_user)):
    ok = instruction_store.delete_instruction(user.id, name)
    if not ok:
        raise HTTPException(404, "Không tìm thấy hướng dẫn")
    return {"ok": True}
