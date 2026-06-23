"""
Supabase database service.
All data lives in Supabase PostgreSQL with RLS enforced.
"""

import json
import logging
import os
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from supabase import create_client, Client

logger = logging.getLogger(__name__)

_client: Optional[Client] = None


def _get_client() -> Client:
    global _client
    if _client is None:
        url = os.getenv("SUPABASE_URL")
        key = os.getenv("SUPABASE_SERVICE_KEY")
        if not url or not key:
            raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set")
        _client = create_client(url, key)
    return _client


async def init_db() -> None:
    _get_client()
    logger.info("Supabase client initialized")


# ---------------------------------------------------------------------------
# Profile CRUD
# ---------------------------------------------------------------------------

async def get_profile(user_id: str) -> Optional[Dict]:
    client = _get_client()
    result = client.table("profiles").select("*").eq("user_id", user_id).execute()
    if not result.data:
        return None
    row = result.data[0]
    data = row["data"] if isinstance(row["data"], dict) else json.loads(row["data"])
    data["user_id"] = row["user_id"]
    data["updated_at"] = row["updated_at"]
    return data


async def upsert_profile(user_id: str, profile_data: Dict) -> Dict:
    data = {k: v for k, v in profile_data.items() if k not in ("user_id", "updated_at")}
    now = datetime.utcnow().isoformat()
    client = _get_client()
    client.table("profiles").upsert({
        "user_id": user_id,
        "data": data,
        "updated_at": now,
    }).execute()
    return await get_profile(user_id)


async def patch_profile_section(user_id: str, section: str, section_data: Any) -> Dict:
    existing = await get_profile(user_id) or {}
    existing.pop("user_id", None)
    existing.pop("updated_at", None)
    existing[section] = section_data
    return await upsert_profile(user_id, existing)


async def add_project_to_profile(user_id: str, project: Dict) -> Dict:
    existing = await get_profile(user_id) or {}
    existing.pop("user_id", None)
    existing.pop("updated_at", None)
    projects = existing.get("projects", [])
    projects.append(project)
    existing["projects"] = projects
    return await upsert_profile(user_id, existing)


# ---------------------------------------------------------------------------
# Tailored resume CRUD
# ---------------------------------------------------------------------------

def _row_to_resume(row: Dict) -> Dict:
    def _ensure_dict(val):
        if isinstance(val, str):
            return json.loads(val)
        return val or {}

    def _ensure_list(val):
        if isinstance(val, str):
            return json.loads(val)
        return val or []

    return {
        "id": row["id"],
        "user_id": row["user_id"],
        "job_title": row["job_title"],
        "company": row["company"],
        "jd_text": row["jd_text"],
        "jd_analysis": _ensure_dict(row.get("jd_analysis")),
        "tailored_profile": _ensure_dict(row.get("tailored_profile")),
        "source_map": _ensure_list(row.get("source_map")),
        "flagged_claims": _ensure_list(row.get("flagged_claims")),
        "gap_report": _ensure_list(row.get("gap_report")),
        "match_score": row.get("match_score") or 0,
        "status": row["status"],
        "created_at": row["created_at"],
        "approved_at": row.get("approved_at"),
        "ats_score": _ensure_dict(row.get("ats_score_data")) if row.get("ats_score_data") else None,
    }


async def create_tailored_resume(resume_data: Dict) -> Dict:
    rid = str(uuid.uuid4())
    now = datetime.utcnow().isoformat()
    client = _get_client()
    client.table("tailored_resumes").insert({
        "id": rid,
        "user_id": resume_data.get("user_id"),
        "job_title": resume_data.get("job_title"),
        "company": resume_data.get("company"),
        "jd_text": resume_data.get("jd_text"),
        "jd_analysis": resume_data.get("jd_analysis", {}),
        "tailored_profile": resume_data.get("tailored_profile", {}),
        "source_map": resume_data.get("source_map", []),
        "flagged_claims": resume_data.get("flagged_claims", []),
        "gap_report": resume_data.get("gap_report", []),
        "match_score": resume_data.get("match_score", 0),
        "status": resume_data.get("status", "draft"),
        "created_at": now,
    }).execute()
    return await get_tailored_resume(rid, resume_data.get("user_id"))


async def get_tailored_resume(resume_id: str, user_id: str) -> Optional[Dict]:
    client = _get_client()
    result = (
        client.table("tailored_resumes")
        .select("*")
        .eq("id", resume_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not result.data:
        return None
    return _row_to_resume(result.data[0])


async def list_tailored_resumes(user_id: str) -> List[Dict]:
    client = _get_client()
    result = (
        client.table("tailored_resumes")
        .select("*")
        .eq("user_id", user_id)
        .neq("status", "archived")
        .order("created_at", desc=True)
        .execute()
    )
    return [_row_to_resume(r) for r in result.data]


async def save_ats_score(resume_id: str, user_id: str, ats_data: Dict) -> Optional[Dict]:
    client = _get_client()
    client.table("tailored_resumes").update({
        "ats_score_data": ats_data,
    }).eq("id", resume_id).eq("user_id", user_id).execute()
    return await get_tailored_resume(resume_id, user_id)


async def update_tailored_resume_status(
    resume_id: str, user_id: str, status: str, extra: Optional[Dict] = None
) -> Optional[Dict]:
    updates: Dict[str, Any] = {"status": status}
    if extra and "approved_at" in extra:
        val = extra["approved_at"]
        if isinstance(val, datetime):
            val = val.isoformat()
        updates["approved_at"] = val

    client = _get_client()
    client.table("tailored_resumes").update(updates).eq("id", resume_id).eq("user_id", user_id).execute()
    return await get_tailored_resume(resume_id, user_id)
