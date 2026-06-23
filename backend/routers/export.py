"""
Export router

POST /export/{id}/docx  — generate and return an ATS-compliant DOCX
POST /export/{id}/pdf   — generate and return a PDF
"""

import logging

from fastapi import APIRouter, HTTPException, Request, status
from fastapi.responses import Response

from services.db_service import (
    get_profile,
    get_tailored_resume,
    update_tailored_resume_status,
)
from services.export_service import generate_docx, generate_pdf

logger = logging.getLogger(__name__)
router = APIRouter()


async def _load_approved_resume(resume_id: str, user_id: str) -> dict:
    resume = await get_tailored_resume(resume_id, user_id)
    if not resume:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resume not found")

    if resume.get("status") not in ("approved", "exported"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Resume must be approved before exporting. "
                f"Current status: {resume.get('status')}"
            ),
        )

    profile = await get_profile(user_id)
    if profile:
        resume["contact"] = profile.get("contact", {})
        resume["education"] = profile.get("education", [])

    return resume


@router.post("/{resume_id}/docx")
async def export_docx(resume_id: str, request: Request):
    user_id = request.state.user_id
    resume = await _load_approved_resume(resume_id, user_id)

    try:
        file_bytes = generate_docx(resume)
    except Exception:
        logger.exception("DOCX generation failed for resume %s", resume_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate DOCX file",
        )

    company = resume.get("company", "resume").replace(" ", "_").lower()
    role = resume.get("job_title", "role").replace(" ", "_").lower()
    filename = f"{role}_{company}_resume.docx"

    await update_tailored_resume_status(resume_id, user_id, "exported")

    return Response(
        content=file_bytes,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/{resume_id}/pdf")
async def export_pdf(resume_id: str, request: Request):
    user_id = request.state.user_id
    resume = await _load_approved_resume(resume_id, user_id)

    try:
        file_bytes = generate_pdf(resume)
    except Exception:
        logger.exception("PDF generation failed for resume %s", resume_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate PDF file",
        )

    company = resume.get("company", "resume").replace(" ", "_").lower()
    role = resume.get("job_title", "role").replace(" ", "_").lower()
    filename = f"{role}_{company}_resume.pdf"

    await update_tailored_resume_status(resume_id, user_id, "exported")

    return Response(
        content=file_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
