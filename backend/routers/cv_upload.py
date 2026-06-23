"""
CV upload router

POST /cv/upload — upload a PDF, extract text, parse into structured profile data
"""

import logging

import pdfplumber
from fastapi import APIRouter, HTTPException, UploadFile, File, status

from services.ai_service import parse_cv_text

logger = logging.getLogger(__name__)
router = APIRouter()

_MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB


@router.post("/upload")
async def upload_cv(file: UploadFile = File(...)):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only PDF files are supported.",
        )

    contents = await file.read()
    if len(contents) > _MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="File too large. Maximum size is 10 MB.",
        )

    import io
    try:
        text_parts = []
        with pdfplumber.open(io.BytesIO(contents)) as pdf:
            for page in pdf.pages:
                page_text = page.extract_text()
                if page_text:
                    text_parts.append(page_text)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Could not read PDF: {exc}",
        )

    full_text = "\n\n".join(text_parts).strip()
    if not full_text:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No readable text found in PDF. The file may be scanned or image-based.",
        )

    parsed = await parse_cv_text(full_text)
    return {"extracted": parsed, "raw_text_length": len(full_text)}
