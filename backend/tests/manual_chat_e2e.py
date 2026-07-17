# Manual e2e — requires a live Postgres (DATABASE_URL). Not run in unit CI.
import io

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def test_chat_message_streams_and_persists():
    email = "chat_e2e@example.com"
    client.post("/api/v1/auth/register", json={"email": email, "password": "pw"})
    tok = client.post("/api/v1/auth/login", data={"username": email, "password": "pw"}).json()["access_token"]
    h = _auth(tok)
    pid = client.post("/api/v1/projects", json={"name": "p", "description": "d"}, headers=h).json()["id"]

    csv = b"region,score\nnorth,10\nsouth,20\nwest,5\n"
    did = client.post(
        f"/api/v1/datasets/projects/{pid}",
        headers=h, files={"file": ("t.csv", io.BytesIO(csv), "text/csv")},
    ).json()["id"]
    client.post(f"/api/v1/datasets/{did}/understand", headers=h)  # profile

    # Stream a chat message on the dataset.
    r = client.post(
        "/api/v1/chat/message",
        headers=h,
        json={"project_id": pid, "dataset_id": did, "content": "What is the top region by score?"},
    )
    assert r.status_code == 200
    body = r.text
    assert "event: token" in body
    assert "event: artifact" in body
    assert "event: done" in body
    assert '"type": "sql"' in body or '"type":"sql"' in body

    # A notebook row was created with the persisted turns.
    nbs = client.get(f"/api/v1/chat/notebooks?project_id={pid}", headers=h).json()
    assert len(nbs) == 1
    nb_id = nbs[0]["id"]
    detail = client.get(f"/api/v1/chat/notebooks/{nb_id}", headers=h).json()
    assert len(detail["turns"]) == 2  # user + assistant
    assert detail["turns"][1]["actions"][0]["type"] == "sql"

    # Owner-guard: another user gets 403 (not 404).
    client.post("/api/v1/auth/register", json={"email": "other@example.com", "password": "pw"})
    tok2 = client.post("/api/v1/auth/login", data={"username": "other@example.com", "password": "pw"}).json()["access_token"]
    assert client.get(f"/api/v1/chat/notebooks/{nb_id}", headers=_auth(tok2)).status_code == 403

    # Public share returns safe fields only.
    token = detail["share_token"]
    shared = client.get(f"/api/v1/chat/notebooks/share/{token}").json()
    assert shared["title"] == detail["title"]
    assert "owner_id" not in shared
    assert client.get("/api/v1/chat/notebooks/share/bogus").status_code == 404
