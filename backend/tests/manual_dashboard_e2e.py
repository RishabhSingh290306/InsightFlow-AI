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


def test_dashboard_crud_e2e():
    """Full CRUD lifecycle for a persisted dashboard (M3)."""
    email = "dashboard_crud_e2e@example.com"
    client.post("/api/v1/auth/register", json={"email": email, "password": "pw"})
    tok = client.post("/api/v1/auth/login", data={"username": email, "password": "pw"}).json()["access_token"]
    h = _auth(tok)
    pid = client.post("/api/v1/projects", json={"name": "crud", "description": "d"}, headers=h).json()["id"]

    csv = b"region,score\nnorth,10\nsouth,20\nwest,5\n"
    did = client.post(
        f"/api/v1/datasets/projects/{pid}",
        headers=h, files={"file": ("t.csv", io.BytesIO(csv), "text/csv")},
    ).json()["id"]

    # 409 before analysis (cannot persist an unprofiled dashboard)
    r = client.post("/api/v1/dashboards/generate", json={"scope": "dataset", "dataset_id": did, "project_id": pid}, headers=h)
    assert r.status_code == 409

    client.post(f"/api/v1/datasets/{did}/understand", headers=h)
    client.post(f"/api/v1/datasets/{did}/eda", headers=h)

    # GENERATE
    gen = client.post("/api/v1/dashboards/generate", json={"scope": "dataset", "dataset_id": did, "project_id": pid}, headers=h)
    assert gen.status_code == 200
    dash = gen.json()
    assert dash["scope"] == "dataset"
    assert dash["dataset_id"] == did
    assert dash["spec"]["widget_order"]
    did_id = dash["id"]

    # LIST
    listing = client.get(f"/api/v1/dashboards/list?project_id={pid}", headers=h)
    assert listing.status_code == 200
    assert any(d["id"] == did_id for d in listing.json())

    # GET (owner) returns the resolved view
    gotten = client.get(f"/api/v1/dashboards/{did_id}", headers=h)
    assert gotten.status_code == 200
    body = gotten.json()
    assert body["id"] == did_id
    assert "widgets" in body["view"]
    assert body["view"]["scope"] == "dataset"

    # PATCH — hide a widget + add a note
    all_types = [w["widget"]["type"] for w in body["view"]["widgets"]]
    hidden_one = all_types[0]
    patched = client.patch(
        f"/api/v1/dashboards/{did_id}",
        json={"hidden_widgets": [hidden_one], "user_notes": {hidden_one: "check this"}},
        headers=h,
    )
    assert patched.status_code == 200
    pj = patched.json()
    assert hidden_one in pj["spec"]["hidden_widgets"]
    assert pj["spec"]["user_notes"].get(hidden_one) == "check this"

    # REGENERATE — preserves hidden + notes, recomputes order/summary
    reg = client.post(f"/api/v1/dashboards/{did_id}/regenerate", headers=h)
    assert reg.status_code == 200
    rj = reg.json()
    assert hidden_one in rj["spec"]["hidden_widgets"]
    assert rj["spec"]["user_notes"].get(hidden_one) == "check this"
    # widget order should still contain every visible widget type
    assert set(rj["spec"]["widget_order"]) >= {t for t in all_types if t != hidden_one}

    # DELETE
    d = client.delete(f"/api/v1/dashboards/{did_id}", headers=h)
    assert d.status_code == 204
    gone = client.get(f"/api/v1/dashboards/{did_id}", headers=h)
    assert gone.status_code == 404


def test_dashboard_owner_guard_e2e():
    """Dashboards are owner-guarded: another user gets 404/403."""
    email_a = "dash_owner_a@example.com"
    email_b = "dash_owner_b@example.com"
    for e in (email_a, email_b):
        client.post("/api/v1/auth/register", json={"email": e, "password": "pw"})
    tok_a = client.post("/api/v1/auth/login", data={"username": email_a, "password": "pw"}).json()["access_token"]
    tok_b = client.post("/api/v1/auth/login", data={"username": email_b, "password": "pw"}).json()["access_token"]
    ha, hb = _auth(tok_a), _auth(tok_b)
    pid = client.post("/api/v1/projects", json={"name": "owner", "description": "d"}, headers=ha).json()["id"]

    csv = b"region,score\nnorth,10\nsouth,20\nwest,5\n"
    did = client.post(
        f"/api/v1/datasets/projects/{pid}",
        headers=ha, files={"file": ("t.csv", io.BytesIO(csv), "text/csv")},
    ).json()["id"]
    client.post(f"/api/v1/datasets/{did}/understand", headers=ha)

    dash_id = client.post(
        "/api/v1/dashboards/generate",
        json={"scope": "dataset", "dataset_id": did, "project_id": pid},
        headers=ha,
    ).json()["id"]

    # Owner B gets 403 (exists, but not theirs) on GET/PATCH/DELETE of owner A's dashboard.
    assert client.get(f"/api/v1/dashboards/{dash_id}", headers=hb).status_code == 403
    assert client.patch(f"/api/v1/dashboards/{dash_id}", json={"title": "x"}, headers=hb).status_code == 403
    assert client.delete(f"/api/v1/dashboards/{dash_id}", headers=hb).status_code == 403
