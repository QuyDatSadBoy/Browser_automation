from datetime import datetime
from pydantic import BaseModel, Field


class RegisterIn(BaseModel):
    email: str = Field(min_length=1, max_length=255)
    password: str = Field(min_length=1, max_length=128)


class LoginIn(BaseModel):
    email: str
    password: str


class UserOut(BaseModel):
    id: int
    email: str
    created_at: datetime
