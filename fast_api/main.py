from http.client import HTTPException
from fastapi import FastAPI
import supabase
from supabase import create_client, Client
import os
from dotenv import load_dotenv
from pathlib import Path

from fast_api.models import userCreate

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

# Simple root endpoint:  uvicorn main:app --reload
@app.get("/")
async def read_root():
    return {"Hello": "World"}

@app.get("/users")
def get_users():
    response = supabase.table("users").select("*").execute()
    return response.data

@app.get("/projects/{project_id}")
def get_project(project_id: str):  # <-- string, not int
    resp = supabase.table("users").select("*").eq("id", project_id).execute()
    if resp.data:
        return resp.data[0]
    return {"error": "Not found"}

app.post("/users")
def create_users(users: userCreate):
    try:
        payload = {
            "username": users.username,
            "name": users.name,
            "skills": users.skills,
            "programming_languages": users.programming_languages,
            "willing_to_work_on": users.willing_to_work_on
        }
        resp = supabase.table("users").insert(payload).select("*").single().execute()
        if not resp.data:
            raise HTTPException(status_code=500, detail="Failed to create user")
        return resp.data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))