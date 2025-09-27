from users import SupabaseClient
from features import User

if __name__ == "__main__":
    print("Starting test…")
    sb = SupabaseClient()

    u = User(
        username="testuser",
        name="test user",
        skills=["sql", "js", "python"],
        programming_languages=["python"],
        willing_to_work_on="anything"
    )

    sb.upsert_user(u)
    print("Upserted.")

    got = sb.fetch_user("testuser")
    print("Fetched:", got)
