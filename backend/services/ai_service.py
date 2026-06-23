"""
AI service — all Zhipu AI (ChatGLM) API calls.

Three sequential calls for the tailoring pipeline:
  1. JD Analyzer
  2. Resume Tailor
  3. Fact Checker + Gap Report

Plus a standalone call for CV text parsing.
"""

import json
import logging
import os
from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException, status
from zhipuai import ZhipuAI

logger = logging.getLogger(__name__)

_MODEL = "glm-4-plus"
_DEFAULT_MAX_TOKENS = 2000


def _get_client() -> ZhipuAI:
    api_key = os.getenv("ZHIPUAI_API_KEY")
    if not api_key:
        raise RuntimeError("ZHIPUAI_API_KEY is not set")
    return ZhipuAI(api_key=api_key)


def _call_llm(system_prompt: str, user_content: str, max_tokens: int = _DEFAULT_MAX_TOKENS) -> str:
    client = _get_client()
    response = client.chat.completions.create(
        model=_MODEL,
        max_tokens=max_tokens,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content},
        ],
    )
    return response.choices[0].message.content


def _parse_json_response(raw: str, context: str = "") -> Tuple[Any, Optional[str]]:
    text = raw.strip()
    if text.startswith("```"):
        lines = text.splitlines()
        inner = [l for l in lines if not l.startswith("```")]
        text = "\n".join(inner).strip()

    try:
        return json.loads(text), None
    except json.JSONDecodeError as exc:
        return raw, f"JSON parse error ({context}): {exc}"


# ---------------------------------------------------------------------------
# 1. JD Analyzer
# ---------------------------------------------------------------------------

async def analyze_jd(jd_text: str) -> Dict:
    system_prompt = (
        "You are a recruitment expert. Analyze job descriptions and return structured JSON only, "
        "no preamble, no markdown."
    )
    user_content = (
        "Analyze this job description and return JSON with these exact fields: "
        "required_skills (array), preferred_skills (array), responsibilities (array, max 6), "
        "seniority (string: junior/mid/senior/lead), tech_stack (array), soft_skills (array).\n\n"
        f"Job description:\n{jd_text}"
    )

    raw = _call_llm(system_prompt, user_content)
    parsed, error = _parse_json_response(raw, "JD analysis")
    if error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"message": "JD analysis AI output could not be parsed", "raw": raw, "error": error},
        )

    defaults = {
        "required_skills": [],
        "preferred_skills": [],
        "responsibilities": [],
        "seniority": "mid",
        "tech_stack": [],
        "soft_skills": [],
    }
    for key, default in defaults.items():
        if key not in parsed or parsed[key] is None:
            parsed[key] = default

    return parsed


# ---------------------------------------------------------------------------
# 2. Resume Tailor
# ---------------------------------------------------------------------------

async def tailor_resume(profile: Dict, jd_analysis: Dict) -> Dict:
    profile_json = json.dumps(profile, indent=2, default=str)
    jd_json = json.dumps(jd_analysis, indent=2)

    system_prompt = (
        "You are a senior resume writer. You may ONLY use information explicitly provided in "
        "the user's profile. You may rephrase, reorder, and emphasize — but you may NEVER add "
        "technologies, roles, achievements, or responsibilities that are not present in the "
        "original profile. For every output bullet or sentence, you must include a source_ref "
        "pointing to the exact field in the profile it came from."
    )
    user_content = (
        "Tailor this resume profile to the job requirements.\n\n"
        f"Profile:\n{profile_json}\n\n"
        f"Job requirements:\n{jd_json}\n\n"
        "Return JSON only with these fields:\n"
        "- summary: string (3 sentences max, mirrors JD priorities)\n"
        "- skills: array of strings (only from profile.skills, ordered by JD relevance)\n"
        "- experiences: array (same structure as input, bullets reworded to mirror JD language)\n"
        "- projects: array (only include projects relevant to JD, ordered by relevance score, "
        "purpose reworded to mirror JD)\n"
        "- source_map: array of objects with fields: output_section (string), output_text (string), "
        "source_field (string, e.g. 'experiences[1].bullets[2]'), "
        "transformation (string: 'reworded' | 'reordered' | 'unchanged')\n\n"
        "CRITICAL RULES:\n"
        "1. You may ONLY use information explicitly present in the profile.\n"
        "2. If the JD requires a skill or technology not in the profile, do NOT include it "
        "in the output — add it to a gap_report instead.\n"
        "3. Every bullet or sentence in the output must have a source_map entry.\n"
        "4. Do not fabricate roles, technologies, achievements, or dates."
    )

    raw = _call_llm(system_prompt, user_content, max_tokens=4000)
    parsed, error = _parse_json_response(raw, "resume tailoring")
    if error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"message": "Resume tailoring AI output could not be parsed", "raw": raw, "error": error},
        )

    parsed.setdefault("summary", "")
    parsed.setdefault("skills", [])
    parsed.setdefault("experiences", [])
    parsed.setdefault("projects", [])
    parsed.setdefault("source_map", [])

    return parsed


# ---------------------------------------------------------------------------
# 3. Fact Checker + Gap Report
# ---------------------------------------------------------------------------

async def fact_check_and_gap(profile: Dict, tailored: Dict, jd_analysis: Dict) -> Dict:
    profile_json = json.dumps(profile, indent=2, default=str)
    tailored_json = json.dumps(tailored, indent=2, default=str)
    jd_json = json.dumps(jd_analysis, indent=2)

    system_prompt = "You are a strict fact-checker for resumes. Your job is to find fabrications and skill gaps."
    user_content = (
        f"Original profile:\n{profile_json}\n\n"
        f"Tailored resume:\n{tailored_json}\n\n"
        f"JD requirements:\n{jd_json}\n\n"
        "Compare the original profile with the tailored resume. Return JSON with:\n"
        "- flagged_claims: array of strings (any claim in tailored resume not traceable "
        "to original profile)\n"
        "- gap_report: array of objects with: keyword (string), found_in_profile (boolean), "
        "suggestion (string — a realistic suggestion for how the user could gain this skill, "
        "or how to address the gap)\n"
        "- match_score: integer 0-100 (how well the profile matches the JD)"
    )

    raw = _call_llm(system_prompt, user_content)
    parsed, error = _parse_json_response(raw, "fact check")
    if error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"message": "Fact-check AI output could not be parsed", "raw": raw, "error": error},
        )

    parsed.setdefault("flagged_claims", [])
    parsed.setdefault("gap_report", [])
    parsed.setdefault("match_score", 0)

    try:
        parsed["match_score"] = max(0, min(100, int(parsed["match_score"])))
    except (TypeError, ValueError):
        parsed["match_score"] = 0

    return parsed


# ---------------------------------------------------------------------------
# CV text parsing
# ---------------------------------------------------------------------------

async def parse_cv_text(text: str) -> Dict:
    system_prompt = (
        "You are a resume parser. Extract structured data from raw CV/resume text. "
        "Return JSON only, no preamble, no markdown."
    )
    user_content = (
        "Parse the following CV/resume text and return JSON with these exact fields:\n"
        "- contact: object with fields: name (string), email (string), phone (string), "
        "linkedin (string), github (string), location (string). Use empty string for missing fields.\n"
        "- summary: string (the professional summary or objective, empty string if not found)\n"
        "- skills: array of strings (individual skill names)\n"
        "- experiences: array of objects, each with: company (string), title (string), "
        "location (string), start_date (string, e.g. 'Jan 2022'), end_date (string, 'Present' if current), "
        "bullets (array of strings — each responsibility or achievement as a separate bullet)\n"
        "- education: array of objects, each with: school (string), degree (string), "
        "field (string), year (string)\n\n"
        "Extract ALL information you can find. If a section is not present, use an empty array or string.\n\n"
        f"CV text:\n{text}"
    )

    raw = _call_llm(system_prompt, user_content, max_tokens=4000)
    parsed, error = _parse_json_response(raw, "CV parsing")
    if error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"message": "CV parsing AI output could not be parsed", "raw": raw, "error": error},
        )

    parsed.setdefault("contact", {})
    parsed.setdefault("summary", "")
    parsed.setdefault("skills", [])
    parsed.setdefault("experiences", [])
    parsed.setdefault("education", [])

    contact_defaults = {"name": "", "email": "", "phone": "", "linkedin": "", "github": "", "location": ""}
    for key, default in contact_defaults.items():
        parsed["contact"].setdefault(key, default)

    return parsed


# ---------------------------------------------------------------------------
# ATS Scorer
# ---------------------------------------------------------------------------

def _resume_to_text(resume: Dict) -> str:
    profile = resume.get("tailored_profile", {})
    contact = resume.get("contact", {})
    education = resume.get("education", [])
    lines: List[str] = []

    name = contact.get("name", "")
    if name:
        lines.append(name)
    contact_parts = [contact.get(f, "") for f in ("location", "phone", "email", "linkedin", "github") if contact.get(f)]
    if contact_parts:
        lines.append(" | ".join(contact_parts))
    lines.append("")

    summary = profile.get("summary", "").strip()
    if summary:
        lines += ["SUMMARY", summary, ""]

    skills = profile.get("skills", [])
    if skills:
        lines += ["SKILLS", ", ".join(skills), ""]

    experiences = profile.get("experiences", [])
    if experiences:
        lines.append("EXPERIENCE")
        for exp in experiences:
            date = f"{exp.get('start_date', '')} - {exp.get('end_date', '')}"
            lines.append(f"{exp.get('title', '')} - {exp.get('company', '')} ({date})")
            for b in exp.get("bullets", []):
                if b:
                    lines.append(f"- {b}")
        lines.append("")

    if education:
        lines.append("EDUCATION")
        for edu in education:
            lines.append(
                f"{edu.get('degree', '')} in {edu.get('field', '')} - {edu.get('school', '')} ({edu.get('year', '')})"
            )
        lines.append("")

    projects = profile.get("projects", [])
    if projects:
        lines.append("PROJECTS")
        for proj in projects:
            tech = ", ".join(proj.get("tech_stack", []))
            lines.append(f"{proj.get('name', '')} | {tech}")
            if proj.get("purpose"):
                lines.append(proj["purpose"])
            for feat in proj.get("key_features", []):
                if feat:
                    lines.append(f"- {feat}")
        lines.append("")

    return "\n".join(lines)


async def ats_score_resume(resume: Dict) -> Dict:
    resume_text = _resume_to_text(resume)
    jd_analysis = resume.get("jd_analysis", {})
    jd_context = ""
    if jd_analysis:
        required = jd_analysis.get("required_skills", [])
        tech = jd_analysis.get("tech_stack", [])
        if required or tech:
            jd_context = (
                f"\n\nTarget job required skills: {', '.join(required)}\n"
                f"Target tech stack: {', '.join(tech)}"
            )

    system_prompt = (
        "You are an ATS (Applicant Tracking System) expert. "
        "Score resumes strictly for machine parseability and keyword matching. "
        "Return JSON only, no markdown, no preamble."
    )
    user_content = (
        f"Score this resume for ATS compatibility (1-100).{jd_context}\n\n"
        "Scoring breakdown (max points per category):\n"
        "- keywords: 25 — keyword density vs target JD, relevant skills present\n"
        "- formatting: 20 — standard headings, no special chars, machine-parseable\n"
        "- structure: 20 — all key sections present (contact, summary, skills, experience, education), logical order\n"
        "- content_quality: 20 — action verbs, quantified achievements, concise bullets\n"
        "- contact: 15 — name, email, phone, LinkedIn all present\n\n"
        "Return JSON with exactly these fields:\n"
        "{\n"
        '  "score": <integer 1-100>,\n'
        '  "breakdown": {"keywords": <0-25>, "formatting": <0-20>, "structure": <0-20>, "content_quality": <0-20>, "contact": <0-15>},\n'
        '  "strengths": [<up to 3 specific strengths as strings>],\n'
        '  "issues": [<up to 5 specific issues as strings>],\n'
        '  "recommendations": [<up to 4 actionable improvements as strings>]\n'
        "}\n\n"
        f"Resume:\n{resume_text}"
    )

    raw = _call_llm(system_prompt, user_content, max_tokens=1500)
    parsed, error = _parse_json_response(raw, "ATS score")
    if error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"message": "ATS scoring output could not be parsed", "raw": raw, "error": error},
        )

    try:
        parsed["score"] = max(1, min(100, int(parsed["score"])))
    except (TypeError, ValueError):
        parsed["score"] = 50

    parsed.setdefault("breakdown", {})
    parsed.setdefault("strengths", [])
    parsed.setdefault("issues", [])
    parsed.setdefault("recommendations", [])

    return parsed


# ---------------------------------------------------------------------------
# Safeguard: ensure every tailored bullet has a source_map entry
# ---------------------------------------------------------------------------

def enforce_source_map_coverage(tailored: Dict, source_map: List[Dict]) -> List[str]:
    mapped_texts = {entry.get("output_text", "").strip() for entry in source_map}
    uncovered = []

    for exp in tailored.get("experiences", []):
        for bullet in exp.get("bullets", []):
            if bullet.strip() and bullet.strip() not in mapped_texts:
                uncovered.append(bullet.strip())

    for proj in tailored.get("projects", []):
        purpose = (proj.get("purpose") or "").strip()
        if purpose and purpose not in mapped_texts:
            uncovered.append(purpose)

    summary = (tailored.get("summary") or "").strip()
    if summary and summary not in mapped_texts:
        has_summary_entry = any(
            e.get("output_section") == "summary" for e in source_map
        )
        if not has_summary_entry:
            uncovered.append(summary)

    return uncovered
