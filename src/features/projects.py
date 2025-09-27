import os
from typing import List, Optional
from dotenv import load_dotenv
from supabase import create_client, Client
from features import Project

class SupabaseClient:
    def __init__(self):
        load_dotenv()
        self.supabase_url = os.getenv("SUPABASE_URL")
        self.supabase_key = os.getenv("SUPABASE_KEY")

        self.sb: Client = create_client(self.supabase_url, self.supabase_key)
    def upsert_project(self, p: Project):
        payload = {
            "name": p.name,
            "description": p.description,
            "required_skills": p.required_skills if isinstance(p.required_skills, list) else [s.strip() for s in p.required_skills.split(",") if s.strip()],
            "programming_languages": p.programming_languages if isinstance(p.programming_languages, list) else [s.strip() for s in p.programming_languages.split(",") if s.strip()],
            "status": p.status
        }
        self.sb.table("projects").upsert(payload, on_conflict="name").execute()

        
    def fetch_project(self, name: str) -> Optional[Project]:
        response = self.sb.table("projects").select("*").eq("name", name).execute()
        data = response.data
        if data:
            project_data = data[0]
            return Project(
                name=project_data["name"],
                description=project_data.get("description"),
                required_skills=project_data.get("required_skills", []),
                programming_languages=project_data.get("programming_languages", []),
                status=project_data.get("status")
            )
        return None