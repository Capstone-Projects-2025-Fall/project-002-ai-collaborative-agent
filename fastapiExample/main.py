from fastapi import FastAPI, HTTPException
from supabase import create_client, Client
import os
from dotenv import load_dotenv
from pathlib import Path
from typing import List, Optional
from pydantic import BaseModel

from models.userCreate import UserCreate

# --- 1) Load .env from parent folder of this file (project root)
ENV_PATH = (Path(__file__).resolve().parents[1] / ".env")
# If you prefer to run from root, you can also do: load_dotenv()  # but this is robust
load_dotenv(dotenv_path=ENV_PATH)

# --- 2) Read and validate env vars with explicit errors
def require_env(name: str) -> str:
    val = os.getenv(name)
    if not val:
        raise RuntimeError(
            f"Missing required environment variable: {name}. "
            f"Looked for .env at: {ENV_PATH}"
        )
    return val

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)

app = FastAPI(
    title="Collaborative Agent API",
    description="Gateway service for handling requests",
    version="1.0.0"
)

class UserCreate(BaseModel):
    username: str
    name: Optional[str] = None
    skills: List[str] = []
    programming_languages: List[str] = []
    willing_to_work_on: Optional[str] = None

# Simple root endpoint:  uvicorn main:app --reload
@app.get("/")
async def read_root():
    return {"Hello": "World"}

@app.get("/users")
def list_users():
    resp = supabase.table("users").select("*").order("created_at", desc=True).limit(50).execute()
    return resp.data

@app.get("/projects/{project_id}")
def get_project(project_id: str):  # <-- string, not int
    resp = supabase.table("users").select("*").eq("id", project_id).execute()
    if resp.data:
        return resp.data[0]
    return {"error": "Not found"}

from fastapi import HTTPException
from supabase import create_client, Client
import os
from dotenv import load_dotenv
from pathlib import Path
import traceback

# load .env from project root (one level up)
load_dotenv(dotenv_path=Path(__file__).resolve().parents[1] / ".env")

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY")
if not SUPABASE_URL or not SUPABASE_ANON_KEY:
    raise RuntimeError("Missing SUPABASE_URL or SUPABASE_ANON_KEY")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)

@app.post("/users")
def create_user(user: UserCreate):
    payload = {
        "username": user.username,
        "name": user.name,
        "skills": user.skills,
        "programming_languages": user.programming_languages,
        "willing_to_work_on": user.willing_to_work_on,
    }
    try:
        # v2 SDK: don't chain .select(); use returning="representation"
        resp = supabase.table("users").insert(payload, returning="representation").execute()
        if not resp.data:
            # fallback: read it back if your PostgREST config doesn't return rows
            row = supabase.table("users").select("*").eq("username", user.username).single().execute()
            return row.data
        return resp.data[0]
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Insert failed: {e}")