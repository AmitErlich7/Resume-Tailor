"""
Supabase JWT auth middleware.
Extracts user_id from the Authorization: Bearer token.
Supports both HS256 (service tokens) and ES256 (user tokens via JWKS).
"""

import os
import logging

import jwt
from jwt import PyJWKClient
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

logger = logging.getLogger(__name__)

_PUBLIC_PATHS = {"/health", "/docs", "/openapi.json", "/redoc"}

_jwks_client = None


def _get_jwks_client():
    global _jwks_client
    if _jwks_client is None:
        url = os.getenv("SUPABASE_URL")
        if url:
            jwks_url = f"{url}/auth/v1/.well-known/jwks.json"
            _jwks_client = PyJWKClient(jwks_url)
    return _jwks_client


class AuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.method == "OPTIONS":
            return await call_next(request)

        if request.url.path in _PUBLIC_PATHS:
            return await call_next(request)

        auth_header = request.headers.get("authorization", "")
        if not auth_header.startswith("Bearer "):
            return JSONResponse(
                status_code=401,
                content={"detail": "Missing or invalid Authorization header"},
            )

        token = auth_header[7:]

        try:
            # Try JWKS (ES256 user tokens) first
            jwks_client = _get_jwks_client()
            if jwks_client:
                try:
                    signing_key = jwks_client.get_signing_key_from_jwt(token)
                    payload = jwt.decode(
                        token,
                        signing_key.key,
                        algorithms=["ES256"],
                        options={"verify_aud": False},
                    )
                except (jwt.exceptions.PyJWKClientError, jwt.exceptions.DecodeError):
                    # Fall back to HS256 with JWT secret
                    secret = os.getenv("SUPABASE_JWT_SECRET")
                    if not secret:
                        return JSONResponse(
                            status_code=500,
                            content={"detail": "Server auth configuration error"},
                        )
                    payload = jwt.decode(
                        token,
                        secret,
                        algorithms=["HS256"],
                        options={"verify_aud": False},
                    )
            else:
                secret = os.getenv("SUPABASE_JWT_SECRET")
                if not secret:
                    return JSONResponse(
                        status_code=500,
                        content={"detail": "Server auth configuration error"},
                    )
                payload = jwt.decode(
                    token,
                    secret,
                    algorithms=["HS256"],
                    options={"verify_aud": False},
                )
        except jwt.ExpiredSignatureError:
            return JSONResponse(
                status_code=401,
                content={"detail": "Token has expired"},
            )
        except jwt.InvalidTokenError as exc:
            logger.error("JWT validation failed: %s", exc)
            return JSONResponse(
                status_code=401,
                content={"detail": f"Invalid token: {exc}"},
            )

        user_id = payload.get("sub")
        if not user_id:
            return JSONResponse(
                status_code=401,
                content={"detail": "Token missing user ID"},
            )

        request.state.user_id = user_id
        return await call_next(request)
