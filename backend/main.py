import logging
import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from middleware.auth import AuthMiddleware
from routers import cv_upload, export, github, profile, tailor
from services.db_service import init_db

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(
    title="Resume Tailor API",
    version="1.0.0",
    lifespan=lifespan,
)

# ---------------------------------------------------------------------------
# Middleware — added in reverse execution order:
# Auth is added first so CORS wraps it (CORS runs outermost)
# ---------------------------------------------------------------------------
app.add_middleware(AuthMiddleware)

_frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5173")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        _frontend_url,
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------
app.include_router(profile.router, prefix="/profile", tags=["profile"])
app.include_router(github.router, prefix="/github", tags=["github"])
app.include_router(tailor.router, prefix="/tailor", tags=["tailor"])
app.include_router(export.router, prefix="/export", tags=["export"])
app.include_router(cv_upload.router, prefix="/cv", tags=["cv"])


@app.get("/health", tags=["health"])
async def health_check():
    return {"status": "ok"}
