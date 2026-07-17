# Manual e2e — requires a live Postgres (DATABASE_URL). Not collected by pytest.
import io

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)  # runs migrations on startup


def _auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def test_followups_and_parent():
    # 1. register + login + create project
    email = "followup_e2e@example.com"
    client.post("/api/v1/auth/register", json={"email": email, "password": "pw"})
    tok = client.post("/api/v1/auth/login", data={"username": email, "password": "pw"}).json()["access_token"]
    h = _auth_headers(tok)
    proj = client.post("/api/v1/projects", json={"name": "p", "description": "d"}, headers=h).json()
    pid = proj["id"]

    # 2. upload a tiny CSV
    csv_bytes = b"region,score\nnorth,10\nsouth,20\nwest,5\n"
    up = client.post(
        f"/api/v1/datasets/projects/{pid}",
        headers=h, files={"file": ("t.csv", io.BytesIO(csv_bytes), "text/csv")},
    ).json()
    did = up["id"]

    # 3. analyze (profile) then generate + run
    client.post(f"/api/v1/datasets/{did}/understand", headers=h).json()
    gen = client.post("/api/v1/sql/generate", json={"dataset_id": did, "question": "top region by score"}, headers=h).json()
    assert "sql" in gen
    run1 = client.post("/api/v1/sql/run", json={"dataset_id": did, "sql": gen["sql"], "business_question": "top region by score"}, headers=h).json()
    assert run1["persisted_id"] is not None
    # followup_questions present (may be empty on LLM fallback)
    assert isinstance(run1["followup_questions"], list)

    # 4. follow-up run linked to parent #1
    run2 = client.post("/api/v1/sql/run", json={"dataset_id": did, "sql": "SELECT * FROM dataset", "business_question": "details for south", "parent_query_id": run1["persisted_id"]}, headers=h).json()
    hist = client.get(f"/api/v1/sql/history?project_id={pid}", headers=h).json()
    by_id = {r["id"]: r for r in hist}
    assert by_id[run2["persisted_id"]]["parent_query_id"] == run1["persisted_id"]
    assert by_id[run1["persisted_id"]]["parent_query_id"] is None

    # 5. invalid parent (foreign id) -> 422
    bad = client.post("/api/v1/sql/run", json={"dataset_id": did, "sql": "SELECT 1", "parent_query_id": 999999}, headers=h)
    assert bad.status_code == 422

    print("OK: followups + parent linkage verified")


if __name__ == "__main__":
    test_followups_and_parent()
