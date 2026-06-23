"""
GitHub service — parse a repo URL and extract project metadata via PyGithub.

Security note: GitHub tokens are never persisted. They live only for the
duration of the request and are never logged.
"""

import json
import logging
import os
import re
from typing import List, Optional, Tuple

from fastapi import HTTPException, status
from github import Github, GithubException, RateLimitExceededException, UnknownObjectException

logger = logging.getLogger(__name__)

_MANIFEST_FILES = [
    "package.json",
    "requirements.txt",
    "Cargo.toml",
    "go.mod",
    "pom.xml",
]

_README_NAMES = ["README.md", "readme.md", "Readme.md", "README.MD", "README"]

_MAX_README_CHARS = 8000
_MAX_MANIFEST_CHARS = 3000


def parse_repo_url(repo_url: str) -> Tuple[str, str]:
    url = repo_url.strip().rstrip("/")
    url = re.sub(r"^https?://", "", url)
    url = re.sub(r"^github\.com/", "", url)
    url = re.sub(r"\.git$", "", url)
    parts = url.split("/")
    if len(parts) < 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot parse GitHub repo URL: '{repo_url}'",
        )
    return parts[0], parts[1]


def _get_github_client(token: Optional[str] = None) -> Github:
    if token:
        return Github(token)
    env_token = os.getenv("GITHUB_CLIENT_SECRET")
    if env_token:
        return Github(env_token)
    return Github()


def _extract_tech_stack(manifest_name: Optional[str], manifest_content: str) -> List[str]:
    """Parse manifest file content into a flat list of technology/package names."""
    if not manifest_name or not manifest_content:
        return []

    techs = []

    if manifest_name == "package.json":
        try:
            pkg = json.loads(manifest_content)
            deps = list(pkg.get("dependencies", {}).keys())
            dev_deps = list(pkg.get("devDependencies", {}).keys())
            techs = deps + dev_deps
        except json.JSONDecodeError:
            pass

    elif manifest_name == "requirements.txt":
        for line in manifest_content.splitlines():
            line = line.strip()
            if not line or line.startswith("#") or line.startswith("-"):
                continue
            name = re.split(r"[=<>!~\[]", line)[0].strip()
            if name:
                techs.append(name)

    elif manifest_name == "Cargo.toml":
        in_deps = False
        for line in manifest_content.splitlines():
            stripped = line.strip()
            if stripped.startswith("[") and "dependencies" in stripped.lower():
                in_deps = True
                continue
            if stripped.startswith("[") and "dependencies" not in stripped.lower():
                in_deps = False
                continue
            if in_deps and "=" in stripped:
                name = stripped.split("=")[0].strip()
                if name:
                    techs.append(name)

    elif manifest_name == "go.mod":
        for line in manifest_content.splitlines():
            line = line.strip()
            if line.startswith("require") or line.startswith(")") or line == "(":
                continue
            parts = line.split()
            if parts and "/" in parts[0]:
                techs.append(parts[0].split("/")[-1])

    elif manifest_name == "pom.xml":
        for match in re.finditer(r"<artifactId>([^<]+)</artifactId>", manifest_content):
            techs.append(match.group(1))

    return techs


async def fetch_repo_data(repo_url: str, github_token: Optional[str] = None) -> dict:
    """
    Fetch repository data: tech stack (from manifest) and raw README text.
    No AI analysis — returns data directly for user review.
    """
    owner, repo_name = parse_repo_url(repo_url)
    gh = _get_github_client(github_token)

    try:
        repo = gh.get_repo(f"{owner}/{repo_name}")
    except RateLimitExceededException:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="GitHub API rate limit exceeded. Please try again later.",
            headers={"Retry-After": "60"},
        )
    except UnknownObjectException:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"GitHub repository '{owner}/{repo_name}' not found or is private.",
        )
    except GithubException as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"GitHub API error: {exc.data.get('message', str(exc))}",
        )

    data: dict = {
        "repo_url": repo_url,
        "name": repo.name,
        "description": repo.description or "",
        "readme_text": "",
        "tech_stack": [],
    }

    # README
    for readme_name in _README_NAMES:
        try:
            readme_file = repo.get_contents(readme_name)
            content = readme_file.decoded_content.decode("utf-8", errors="replace")
            data["readme_text"] = content[:_MAX_README_CHARS]
            break
        except (UnknownObjectException, GithubException):
            continue

    # Manifest / dependency file → tech stack
    for manifest in _MANIFEST_FILES:
        try:
            mf = repo.get_contents(manifest)
            content = mf.decoded_content.decode("utf-8", errors="replace")
            data["tech_stack"] = _extract_tech_stack(manifest, content[:_MAX_MANIFEST_CHARS])
            break
        except (UnknownObjectException, GithubException):
            continue

    return data


def parse_profile_url(github_input: str) -> str:
    url = github_input.strip().rstrip("/")
    url = re.sub(r"^https?://", "", url)
    url = re.sub(r"^github\.com/", "", url)
    parts = [p for p in url.split("/") if p]
    return parts[0] if parts else github_input.strip()


async def fetch_user_repos(github_input: str, github_token: Optional[str] = None) -> list:
    """Fetch up to 50 public repos for a GitHub user, sorted by most recently updated."""
    username = parse_profile_url(github_input)
    gh = _get_github_client(github_token)

    try:
        user = gh.get_user(username)
    except UnknownObjectException:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"GitHub user '{username}' not found.",
        )
    except RateLimitExceededException:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="GitHub API rate limit exceeded. Please try again later.",
            headers={"Retry-After": "60"},
        )
    except GithubException as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"GitHub API error: {exc.data.get('message', str(exc))}",
        )

    repos = []
    try:
        for repo in user.get_repos(type="public", sort="updated"):
            repos.append({
                "name": repo.name,
                "full_name": repo.full_name,
                "description": repo.description or "",
                "url": repo.html_url,
                "language": repo.language or "",
                "stars": repo.stargazers_count,
                "updated_at": repo.updated_at.isoformat() if repo.updated_at else "",
                "is_fork": repo.fork,
            })
            if len(repos) >= 50:
                break
    except GithubException as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"GitHub API error: {exc.data.get('message', str(exc))}",
        )

    return repos
