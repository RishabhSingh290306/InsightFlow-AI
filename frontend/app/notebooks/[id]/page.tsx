"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Trash2 } from "lucide-react";
import { notebooksApi } from "@/lib/api";
import { getToken } from "@/lib/auth";
import type { NotebookDetailRead } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Markdown } from "@/components/markdown";
import { ConfirmDialog } from "@/components/confirm-dialog";

export default function NotebookPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const [nb, setNb] = useState<NotebookDetailRead | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

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
    setRenameError(null);
    try {
      const updated = await notebooksApi.update(id, { title: next });
      setNb((prev) => (prev ? { ...prev, title: updated.title } : prev));
    } catch (err) {
      setRenameError(err instanceof Error ? err.message : "Rename failed");
    } finally {
      setSaving(false);
    }
  }

  async function confirmRemove() {
    setDeleting(true);
    try {
      await notebooksApi.remove(id);
      router.replace(`/projects/${nb?.project_id ?? ""}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  if (error) return <main className="container py-10"><p className="text-destructive">{error}</p></main>;
  if (!nb) return (
    <main className="container py-10">
      <div className="flex flex-col gap-6">
        <Skeleton className="h-9 w-9" variant="circle" />
        <Skeleton className="h-10 w-80" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    </main>
  );

  return (
    <main className="flex min-h-screen flex-col gap-8 pb-12">
      <header className="no-print sticky top-0 z-40 border-b border-border/60 bg-background/70 backdrop-blur-md">
        <div className="container flex h-16 items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <Button variant="ghost" size="icon" asChild aria-label="Back to project">
              <Link href={`/projects/${nb.project_id}`}>
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div className="flex min-w-0 items-center gap-2 text-sm">
              <Link href="/projects" className="text-muted-foreground transition-colors duration-160ms hover:text-foreground">
                Projects
              </Link>
              <span className="text-muted-foreground/50">/</span>
              <span className="truncate font-medium text-foreground">Notebook</span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(`${location.origin}/notebooks/share/${nb.share_token}`)}>
              Copy share link
            </Button>
            <Button size="sm" variant="destructive" onClick={() => setConfirmDelete(true)} disabled={deleting}>
              <Trash2 className="h-4 w-4" /> {deleting ? "Deleting…" : "Delete"}
            </Button>
          </div>
        </div>
      </header>
      <div className="container flex flex-col gap-6">
        <div className="flex flex-wrap items-center gap-3">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="h-auto w-auto max-w-md py-1 text-2xl font-bold tracking-tight"
            aria-label="Notebook title"
          />
          <Button size="sm" onClick={onRename} disabled={saving || !title.trim() || title.trim() === nb.title}>
            {saving ? "Saving…" : "Rename"}
          </Button>
          {renameError && <span className="text-xs text-destructive">{renameError}</span>}
        </div>
        {!nb.ai_available && (
          <Badge variant="warning" size="sm">Assistant limited — some responses used a rule-based fallback</Badge>
        )}
        <div className="flex flex-col gap-4">
          {nb.turns.map((t) => (
            <div key={t.id} className={t.role === "user" ? "flex flex-col items-end" : "flex flex-col items-start"}>
              <div className={`inline-block max-w-[90%] px-3.5 py-2.5 text-sm leading-relaxed ${
                t.role === "user"
                  ? "rounded-2xl rounded-br-md bg-primary text-primary-foreground"
                  : "rounded-2xl rounded-bl-md border border-border bg-card"
              }`}>
                {t.role === "user" ? t.content : <Markdown content={t.content} />}
              </div>
            </div>
          ))}
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this notebook?"
        description="This permanently removes the conversation and its artifacts. This cannot be undone."
        confirmLabel={deleting ? "Deleting…" : "Delete notebook"}
        destructive
        onConfirm={confirmRemove}
        onCancel={() => !deleting && setConfirmDelete(false)}
      />
    </main>
  );
}
