"""
Profile router

GET    /profile            — fetch profile
POST   /profile            — create/replace profile (upsert)
PATCH  /profile/{section}  — update one section
"""

import logging
import uuid
from datetime import datetime
from typing import Any

import bleach
from fastapi import APIRouter, HTTPException, Request, status

from models.profile import (
    ContactPatch,
    EducationPatch,
    ExperiencesPatch,
    ProfileCreate,
    ProjectsPatch,
    SkillsPatch,
    SummaryPatch,
    VolunteeringPatch,
)
from services.db_service import (
    get_profile,
    patch_profile_section,
    upsert_profile,
)

logger = logging.getLogger(__name__)
router = APIRouter()

_ALLOWED_SECTIONS = {"contact", "summary", "skills", "experiences", "education", "projects", "volunteering"}


def _sanitize_str(value: str) -> str:
    return bleach.clean(value, tags=[], strip=True)


def _sanitize_dict(data: Any) -> Any:
    if isinstance(data, str):
        return _sanitize_str(data)
    if isinstance(data, list):
        return [_sanitize_dict(item) for item in data]
    if isinstance(data, dict):
        return {k: _sanitize_dict(v) for k, v in data.items()}
    return data


@router.get("")
async def get_user_profile(request: Request):
    profile = await get_profile(request.state.user_id)
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found")
    return profile


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_or_replace_profile(body: ProfileCreate, request: Request):
    data = body.model_dump(exclude_none=True)

    for exp in data.get("experiences", []):
        if not exp.get("id"):
            exp["id"] = str(uuid.uuid4())
    for edu in data.get("education", []):
        if not edu.get("id"):
            edu["id"] = str(uuid.uuid4())
    for proj in data.get("projects", []):
        if not proj.get("id"):
            proj["id"] = str(uuid.uuid4())

    data = _sanitize_dict(data)
    data["updated_at"] = datetime.utcnow().isoformat()
    return await upsert_profile(request.state.user_id, data)


@router.patch("/{section}")
async def patch_section(section: str, body: dict, request: Request):
    if section not in _ALLOWED_SECTIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown section '{section}'. Allowed: {sorted(_ALLOWED_SECTIONS)}",
        )

    section_models = {
        "contact": ContactPatch,
        "summary": SummaryPatch,
        "skills": SkillsPatch,
        "experiences": ExperiencesPatch,
        "education": EducationPatch,
        "projects": ProjectsPatch,
        "volunteering": VolunteeringPatch,
    }

    model_cls = section_models[section]
    try:
        validated = model_cls(**{section: body.get(section, body)})
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    section_data = getattr(validated, section)

    if hasattr(section_data, "model_dump"):
        section_data = section_data.model_dump()
    elif isinstance(section_data, list):
        items = []
        for item in section_data:
            if hasattr(item, "model_dump"):
                d = item.model_dump()
                if "id" in d and not d["id"]:
                    d["id"] = str(uuid.uuid4())
                items.append(d)
            else:
                items.append(item)
        section_data = items

    section_data = _sanitize_dict(section_data)
    return await patch_profile_section(request.state.user_id, section, section_data)
