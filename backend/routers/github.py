"""
GitHub router

POST /github/fetch-profile — list user's public repos
POST /github/import        — fetch tech stack + README for a repo (no AI)
POST /github/confirm       — save the confirmed project card to the user's profile
"""

import logging
import uuid

import bleach
from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel

from middleware.rate_limiter import github_rate_limit
from models.project import Project
from services.db_service import add_project_to_profile
from services.github_service import fetch_repo_data, fetch_user_repos

logger = logging.getLogger(__name__)
router = APIRouter()

_VALID_SCALES = {"personal", "team", "production"}
_VALID_ROLES = {"solo_builder", "contributor", "maintainer", "team_lead"}


class ImportRequest(BaseModel):
    repo_url: str


class ConfirmRequest(BaseModel):
    project: dict


class FetchProfileRequest(BaseModel):
    username: str


@router.post("/fetch-profile")
async def fetch_github_profile(body: FetchProfileRequest):
    github_rate_limit()
    username = bleach.clean(body.username, tags=[], strip=True).strip()
    if not username:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Username is required.")
    repos = await fetch_user_repos(username)
    return {"repos": repos, "username": username}


@router.post("/import")
async def import_github_repo(body: ImportRequest):
    github_rate_limit()
    repo_url = bleach.clean(body.repo_url, tags=[], strip=True).strip()
    repo_data = await fetch_repo_data(repo_url)
    return {
        "name": repo_data["name"],
        "description": repo_data["description"],
        "tech_stack": repo_data["tech_stack"],
        "readme_text": repo_data["readme_text"],
        "repo_url": repo_data["repo_url"],
    }


@router.post("/confirm", status_code=status.HTTP_201_CREATED)
async def confirm_github_project(body: ConfirmRequest, request: Request):
    user_id = request.state.user_id
    card = body.project

    card.setdefault("id", str(uuid.uuid4()))
    card.setdefault("source", "github")
    card.setdefault("repo_url", card.get("repo_url", ""))
    card.setdefault("tech_stack", [])
    card.setdefault("key_features", [])

    scale = card.get("scale", "personal")
    if scale not in _VALID_SCALES:
        card["scale"] = "personal"

    your_role = card.get("your_role", "solo_builder")
    if your_role not in _VALID_ROLES:
        card["your_role"] = "solo_builder"

    try:
        project = Project(**card)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid project data: {exc}",
        )

    project_dict = project.model_dump()
    profile = await add_project_to_profile(user_id, project_dict)
    return {"profile": profile, "project": project_dict}
