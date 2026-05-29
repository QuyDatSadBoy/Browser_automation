from pydantic import BaseModel, Field


class InstructionIn(BaseModel):
    name: str = Field(min_length=1, max_length=256)
    content: str = ""


class InstructionOut(BaseModel):
    name: str
    content: str
    updated_at: str = ""
    size: int = 0


class InstructionMeta(BaseModel):
    name: str
    size: int
    updated_at: str
