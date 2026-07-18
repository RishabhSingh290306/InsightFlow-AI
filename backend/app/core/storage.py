"""File storage abstraction.

DESIGN NOTE — storage swap point
---------------------------------
The project defers the choice between local disk and a managed store (e.g.
Supabase Storage / S3). To keep that decision reversible, every file write goes
through a `StorageAdapter`. Today the only implementation is
`LocalStorageAdapter` (writes under `settings.DATA_DIR`). When we adopt a managed
store, we add another adapter and switch the one place that constructs it
(`get_storage`) — no route or model code changes.

This mirrors `app/core/database.py`, which is the *database* swap point. Together
they keep the backend provider-agnostic.
"""
from __future__ import annotations

import abc
import uuid
from pathlib import Path

from app.core.config import settings


class StorageAdapter(abc.ABC):
    """Contract for persisting uploaded dataset files."""

    @abc.abstractmethod
    def save(self, project_id: int, original_filename: str, content: bytes) -> tuple[str, str]:
        """Persist `content` and return ``(storage_path, filename)``.

        `storage_path` is the adapter-relative location used later to retrieve or
        delete the file; `filename` is the on-disk/object name (e.g. ``<uuid>.csv``).
        """

    @abc.abstractmethod
    def delete(self, storage_path: str) -> None:
        """Remove the file at `storage_path`, ignoring missing files."""

    @abc.abstractmethod
    def read(self, storage_path: str) -> bytes:
        """Return the raw bytes of the file at `storage_path`."""


class LocalStorageAdapter(StorageAdapter):
    """Stores files on the local filesystem under ``settings.DATA_DIR``.

    Files are nested by ``project_id`` and named with a UUID to avoid collisions
    and to keep the original filename out of the path.
    """

    def __init__(self, root: Path) -> None:
        self.root = Path(root)

    def save(self, project_id: int, original_filename: str, content: bytes) -> tuple[str, str]:
        ext = Path(original_filename).suffix.lower() or ""
        filename = f"{uuid.uuid4().hex}{ext}"
        storage_path = f"{project_id}/{filename}"
        target = self.root / storage_path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(content)
        return storage_path, filename

    def delete(self, storage_path: str) -> None:
        path = self.root / storage_path
        path.unlink(missing_ok=True)

    def read(self, storage_path: str) -> bytes:
        return (self.root / storage_path).read_bytes()


class SupabaseStorageAdapter(StorageAdapter):
    """Stores files in a Supabase Storage bucket (the documented swap point).

    The Supabase client is imported lazily so the local backend keeps working
    without the `supabase` package installed (STORAGE_BACKEND=local). Use the
    **service-role** key (not the anon key) so server-side uploads bypass RLS.
    """

    def __init__(self, url: str, key: str, bucket: str) -> None:
        from supabase import create_client

        self._client = create_client(url, key)
        self.bucket = bucket

    def _from(self):
        return self._client.storage.from_(self.bucket)

    def save(self, project_id: int, original_filename: str, content: bytes) -> tuple[str, str]:
        ext = Path(original_filename).suffix.lower() or ""
        filename = f"{uuid.uuid4().hex}{ext}"
        storage_path = f"{project_id}/{filename}"
        self._from().upload(
            storage_path,
            content,
            file_options={
                "content-type": "application/octet-stream",
                "upsert": "true",
            },
        )
        return storage_path, filename

    def delete(self, storage_path: str) -> None:
        # remove() tolerates missing objects (returns []), so no try/except needed.
        self._from().remove([storage_path])

    def read(self, storage_path: str) -> bytes:
        return self._from().download(storage_path)


_storage: StorageAdapter | None = None


def get_storage() -> StorageAdapter:
    """Return the process-wide storage adapter.

    Selected by STORAGE_BACKEND ("local" -> LocalStorageAdapter, the default;
    "supabase" -> SupabaseStorageAdapter). This is the single construction point
    — no route or model code needs to know which backend is in use.
    """
    global _storage
    if _storage is None:
        if settings.STORAGE_BACKEND == "supabase":
            _storage = SupabaseStorageAdapter(
                url=settings.SUPABASE_URL,
                key=settings.SUPABASE_KEY,
                bucket=settings.SUPABASE_BUCKET,
            )
        else:
            _storage = LocalStorageAdapter(Path(settings.DATA_DIR))
    return _storage
