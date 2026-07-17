# Manual e2e — requires a live Postgres (DATABASE_URL). Not run in unit CI.
import io

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)  # runs migrations on startup


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def test_dashboard_preview_e2e():
    email = "dashboard_e2e@example.com"
    client.post("/api/v1/auth/register", json={"email": email, "password": "pw"})
    tok = client.post("/api/v1/auth/login", data={"username": email, "password": "pw"}).json()["access_token"]
    h = _auth(tok)
    pid = client.post("/api/v1/projects", json={"name": "p", "description": "d"}, headers=h).json()["id"]

    csv = b"region,score\nnorth,10\nsouth,20\nwest,5\n"
    did = client.post(
        f"/api/v1/datasets/projects/{pid}",
        headers=h, files={"file": ("t.csv", io.BytesIO(csv), "text/csv")},
    ).json()["id"]

    # 409 before analysis
    r = client.post("/api/v1/dashboards/preview", json={"scope": "dataset", "dataset_id": did}, headers=h)
    assert r.status_code == 409

    # analyze (profile) + eda + a sql run so widgets have data
    client.post(f"/api/v1/datasets/{did}/understand", headers=h)
    client.post(f"/api/v1/datasets/{did}/eda", headers=h)
    gen = client.post("/api/v1/sql/generate", json={"dataset_id": did, "question": "top region by score"}, headers=h).json()
    client.post("/api/v1/sql/run", json={"dataset_id": did, "sql": gen["sql"], "business_question": "top region"}, headers=h)

    # dataset preview returns resolved widgets
    view = client.post("/api/v1/dashboards/preview", json={"scope": "dataset", "dataset_id": did}, headers=h).json()
    types = [w["widget"]["type"] for w in view["widgets"]]
    assert "kpi_cards" in types
    assert "data_quality" in types
    assert "recommended_charts" in types
    assert "ai_insights" in types
    assert "sql_widget" in types
    assert "version_timeline" in types
    assert "recommended_next" in types
    assert view["scope"] == "dataset"


def test_dashboard_project_preview_e2e():
    email = "dashboard_proj_e2e@example.com"
    client.post("/api/v1/auth/register", json={"email": email, "password": "pw"})
    tok = client.post("/api/v1/auth/login", data={"username": email, "password": "pw"}).json()["access_token"]
    h = _auth(tok)
    pid = client.post("/api/v1/projects", json={"name": "proj", "description": "d"}, headers=h).json()["id"]

    csv = b"region,score\nnorth,10\nsouth,20\nwest,5\n"
    did = client.post(
        f"/api/v1/datasets/projects/{pid}",
        headers=h, files={"file": ("t.csv", io.BytesIO(csv), "text/csv")},
    ).json()["id"]
    client.post(f"/api/v1/datasets/{did}/understand", headers=h)

    # project scope returns project-level widgets (no 422 in M2)
    view = client.post("/api/v1/dashboards/preview", json={"scope": "project", "project_id": pid}, headers=h)
    assert view.status_code == 200
    body = view.json()
    assert body["scope"] == "project"
    types = [w["widget"]["type"] for w in body["widgets"]]
    assert "project_kpis" in types
    assert "dataset_summaries" in types
    assert "activity_feed" in types
    assert "recommended_next" in types
    # dataset-only widgets must not leak into a project dashboard
    assert "kpi_cards" not in types
    assert "sql_widget" not in types
