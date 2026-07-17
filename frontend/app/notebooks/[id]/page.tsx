"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Trash2 } from "lucide-react";
import { notebooksApi } from "@/lib/api";
import { getToken } from "@/lib/auth";
import type { NotebookDetailRead } from "@/lib/types";
import { Button } from "@/components/ui/button";

export default function NotebookPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const [nb, setNb] = useState<NotebookDetailRead | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try { const n = await notebooksApi.get(id); setNb(n); setTitle(n.title); }
    catch (err) { setError(err instanceof Error ? err.message : "Failed to load notebook"); }
  }, [id]);

  useEffect(() => {
    if (!getToken()) { router.replace("/login"); return; }
    if (Number.isFinite(id)) void load();
  }, [router, id, load]);

  async function onRename() {
    const next = title.trim();
    if (!next || next === nb?.title) return;
    setSaving(true);
    try {
      const updated = await notebooksApi.update(id, { title: next });
      setNb((prev) => (prev ? { ...prev, title: updated.title } : prev));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rename failed");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!confirm("Delete this notebook? This cannot be undone.")) return;
    setDeleting(true);
    try {
      await notebooksApi.remove(id);
      router.replace(`/projects/${nb?.project_id ?? ""}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
      setDeleting(false);
    }
  }

  if (error) return <main className="container py-10"><p className="text-destructive">{error}</p></main>;
  if (!nb) return <main className="container py-10"><p className="text-muted-foreground">Loading…</p></main>;

  return (
    <main className="container flex min-h-screen flex-col gap-6 py-10">
      <header className="flex items-center justify-between">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/projects/${nb.project_id}`}><ArrowLeft className="h-4 w-4" /> Project</Link>
        </Button>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(`${location.origin}/notebooks/share/${nb.share_token}`)}>
            Copy share link
          </Button>
          <Button size="sm" variant="destructive" onClick={onDelete} disabled={deleting}>
            <Trash2 className="h-4 w-4" /> {deleting ? "Deleting…" : "Delete"}
          </Button>
        </div>
      </header>
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="rounded-md border px-3 py-2 text-2xl font-bold tracking-tight"
          aria-label="Notebook title"
        />
        <Button size="sm" onClick={onRename} disabled={saving || !title.trim() || title.trim() === nb.title}>
          {saving ? "Saving…" : "Rename"}
        </Button>
      </div>
      {!nb.ai_available && <p className="text-sm text-muted-foreground">AI unavailable for parts of this chat — rule-based fallback used.</p>}
      <div className="flex flex-col gap-4">
        {nb.turns.map((t) => (
          <div key={t.id} className={t.role === "user" ? "text-right" : "text-left"}>
            <div className={`inline-block max-w-[90%] rounded-lg px-3 py-2 text-sm ${t.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
              {t.content}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
