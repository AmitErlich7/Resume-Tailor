"""
Tailor router

POST   /tailor                    — run the full 3-call AI pipeline
GET    /tailor/versions           — list all tailored resumes
GET    /tailor/{id}               — get a specific tailored resume
POST   /tailor/{id}/ats-score     — score resume ATS compatibility (1-100)
PATCH  /tailor/{id}/approve       — approve a resume
DELETE /tailor/{id}               — soft delete (status -> archived)
"""

import logging
from datetime import datetime

from fastapi import APIRouter, HTTPException, Request, status

from middleware.input_guard import guard_jd, guard_short
from middleware.rate_limiter import tailor_rate_limit
from models.profile import ApproveRequest, TailorRequest
from services.ai_service import (
    analyze_jd,
    ats_score_resume,
    enforce_source_map_coverage,
    fact_check_and_gap,
    tailor_resume,
)
from services.db_service import (
    create_tailored_resume,
    get_profile,
    get_tailored_resume,
    list_tailored_resumes,
    save_ats_score,
    update_tailored_resume_status,
)

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("")
async def run_tailor_pipeline(body: TailorRequest, request: Request):
    tailor_rate_limit()
    user_id = request.state.user_id

    profile = await get_profile(user_id)
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Profile not found. Please complete your profile before tailoring.",
        )

    jd_text = guard_jd(body.jd_text)
    job_title = guard_short(body.job_title, "Job title")
    company = guard_short(body.company, "Company name")

    if not jd_text:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Job description cannot be empty.",
        )

    profile_clean = {
        k: v for k, v in profile.items()
        if k not in ("user_id", "updated_at")
    }

    logger.info("Step 1/3: Analyzing JD")
    jd_analysis = await analyze_jd(jd_text)

    logger.info("Step 2/3: Tailoring resume")
    tailored = await tailor_resume(profile_clean, jd_analysis)
    source_map = tailored.pop("source_map", [])

    uncovered = enforce_source_map_coverage(tailored, source_map)

    logger.info("Step 3/3: Fact-checking")
    fact_result = await fact_check_and_gap(profile_clean, tailored, jd_analysis)

    flagged_claims: list = fact_result.get("flagged_claims", [])
    for item in uncovered:
        if item not in flagged_claims:
            flagged_claims.append(item)

    gap_report = fact_result.get("gap_report", [])
    match_score = fact_result.get("match_score", 0)

    resume_doc = {
        "user_id": user_id,
        "job_title": job_title,
        "company": company,
        "jd_text": jd_text,
        "jd_analysis": jd_analysis,
        "tailored_profile": tailored,
        "source_map": source_map,
        "flagged_claims": flagged_claims,
        "gap_report": gap_report,
        "match_score": match_score,
        "status": "draft",
        "created_at": datetime.utcnow().isoformat(),
        "approved_at": None,
    }

    saved = await create_tailored_resume(resume_doc)
    logger.info("Tailored resume saved id=%s", saved.get("id"))
    return saved


@router.get("/versions")
async def get_versions(request: Request):
    return await list_tailored_resumes(request.state.user_id)


@router.get("/{resume_id}")
async def get_resume(resume_id: str, request: Request):
    resume = await get_tailored_resume(resume_id, request.state.user_id)
    if not resume:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resume not found")
    return resume


@router.post("/{resume_id}/ats-score")
async def score_ats(resume_id: str, request: Request):
    user_id = request.state.user_id
    resume = await get_tailored_resume(resume_id, user_id)
    if not resume:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resume not found")

    profile = await get_profile(user_id)
    if profile:
        resume["contact"] = profile.get("contact", {})
        resume["education"] = profile.get("education", [])

    logger.info("Running ATS score for resume %s", resume_id)
    ats_data = await ats_score_resume(resume)

    updated = await save_ats_score(resume_id, user_id, ats_data)
    return {"resume": updated, "ats_score": ats_data}


@router.patch("/{resume_id}/approve")
async def approve_resume(resume_id: str, body: ApproveRequest, request: Request):
    user_id = request.state.user_id
    resume = await get_tailored_resume(resume_id, user_id)
    if not resume:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resume not found")

    if resume["status"] == "archived":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot approve an archived resume.",
        )

    if not body.flagged_claims_reviewed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "You must review all flagged claims before approving. "
                "Set flagged_claims_reviewed=true to confirm."
            ),
        )

    return await update_tailored_resume_status(
        resume_id,
        user_id,
        "approved",
        extra={"approved_at": datetime.utcnow()},
    )


@router.delete("/{resume_id}")
async def delete_resume(resume_id: str, request: Request):
    user_id = request.state.user_id
    resume = await get_tailored_resume(resume_id, user_id)
    if not resume:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resume not found")
    return await update_tailored_resume_status(resume_id, user_id, "archived")
