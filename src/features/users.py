import os
from typing import List, Optional
from dotenv import load_dotenv
from supabase import create_client, Client
from features import User

class SupabaseClient:
    def __init__(self):
        load_dotenv()
        self.supabase_url = os.getenv("SUPABASE_URL")
        self.supabase_key = os.getenv("SUPABASE_KEY")

        self.sb: Client = create_client(self.supabase_url, self.supabase_key)

    def upsert_user(self, u: User):
        skills = u.skills if isinstance(u.skills, list) else [s.strip() for s in u.skills.split(",") if s.strip()]
        langs  = u.programming_languages if isinstance(u.programming_languages, list) else [s.strip() for s in u.programming_languages.split(",") if s.strip()]
        payload = {
            "username": u.username,
            "name": u.name,
            "skills": skills,
            "programming_languages": langs,
            "willing_to_work_on": u.willing_to_work_on
        }
        self.sb.table("users").upsert(payload, on_conflict="username").execute()


    def fetch_user(self, username: str) -> Optional[User]:
        response = self.sb.table("users").select("*").eq("username", username).execute()
        data = response.data
        if data:
            user_data = data[0]
            return User(
                username=user_data["username"],
                name=user_data.get("name"),
                skills=user_data.get("skills", []),
                programming_languages=user_data.get("programming_languages", []),
                willing_to_work_on=user_data.get("willing_to_work_on")
            )
        return None