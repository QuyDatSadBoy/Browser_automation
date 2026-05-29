from fastapi import APIRouter, Depends
from app.deps import get_current_user
from app.services.crawlers.registry import SOURCE_META

router = APIRouter(prefix="/api/sources", tags=["sources"])


@router.get("", dependencies=[Depends(get_current_user)])
async def list_sources():
    return SOURCE_META
