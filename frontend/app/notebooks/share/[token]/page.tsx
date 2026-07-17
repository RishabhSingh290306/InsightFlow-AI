"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { notebooksApi } from "@/lib/api";
import type { NotebookShareRead } from "@/lib/types";
import { NotebookShare } from "@/components/notebook-share";

export default function ShareNotebookPage() {
  const params = useParams<{ token: string }>();
  const [nb, setNb] = useState<NotebookShareRead | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try { setNb(await notebooksApi.share(params.token)); }
    catch (err) { setError(err instanceof Error ? err.message : "Notebook not found"); }
  }, [params.token]);

  useEffect(() => { void load(); }, [load]);

  if (error) return <main className="container py-10"><p className="text-destructive">{error}</p></main>;
  if (!nb) return <main className="container py-10"><p className="text-muted-foreground">Loading…</p></main>;

  return (
    <main className="container flex min-h-screen flex-col gap-6 py-10">
      <NotebookShare notebook={nb} />
      <footer className="mt-8 border-t pt-4 text-center text-sm text-muted-foreground">
        Generated with InsightFlow AI ·{" "}
        <Link href="/" className="font-medium underline">Analyze your own dataset →</Link>
      </footer>
    </main>
  );
}
