"""
Vercel serverless function adapter.
Wraps the FastAPI app for Vercel's Python runtime.
"""

import sys
from pathlib import Path

# Add backend directory to Python path so imports work
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from mangum import Mangum
from main import app

handler = Mangum(app, lifespan="auto")
