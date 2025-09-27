from dataclasses import dataclass
from typing import List, Optional

@dataclass
class User:
    username: str
    name: Optional[str] = None
    skills: List[str] = None
    programming_languages: List[str] = None
    willing_to_work_on: Optional[str] = None