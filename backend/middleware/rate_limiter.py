"""
Simple in-memory rate limiter.
Keyed on a generic identifier (IP or user). Resets on server restart.
"""

from collections import defaultdict
from datetime import datetime, timedelta

from fastapi import HTTPException, status

_tailor_requests: dict = defaultdict(list)
_github_requests: dict = defaultdict(list)

_TAILOR_LIMIT = 10
_TAILOR_WINDOW = timedelta(hours=1)

_GITHUB_LIMIT = 20
_GITHUB_WINDOW = timedelta(hours=1)

_RATE_KEY = "global"


def _check(store: dict, uid: str, limit: int, window: timedelta, label: str) -> None:
    now = datetime.utcnow()
    store[uid] = [t for t in store[uid] if now - t < window]
    if len(store[uid]) >= limit:
        minutes = int(window.total_seconds() // 60)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Rate limit exceeded: {limit} {label} per {minutes} minutes. Try again later.",
        )
    store[uid].append(now)


def tailor_rate_limit() -> None:
    _check(_tailor_requests, _RATE_KEY, _TAILOR_LIMIT, _TAILOR_WINDOW, "tailoring requests")


def github_rate_limit() -> None:
    _check(_github_requests, _RATE_KEY, _GITHUB_LIMIT, _GITHUB_WINDOW, "GitHub imports")
