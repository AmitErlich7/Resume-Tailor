from typing import List, Optional
from pydantic import BaseModel


class Project(BaseModel):
    id: str
    name: str
    repo_url: Optional[str] = None
    tech_stack: List[str] = []
    purpose: str
    your_role: str
    scale: str  # "personal" | "team" | "production"
    key_features: List[str] = []
    source: str  # "manual" | "github"
    readme_text: Optional[str] = None
