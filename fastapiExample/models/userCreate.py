from pydantic import BaseModel
from typing import List, Optional

class UserCreate(BaseModel):
    username: str
    name: Optional[str] = None
    skills: List[str] = []
    programming_languages: List[str] = []
    willing_to_work_on: Optional[str] = None