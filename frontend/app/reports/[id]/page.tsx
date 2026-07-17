"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { reportsApi } from "@/lib/api";
import { getToken } from "@/lib/auth";
import type { ReportRead } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { ReportEditor } from "@/components/report-editor";

export default function ReportPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const [report, setReport] = useState<ReportRead | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setReport(await reportsApi.get(id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load report");
    }
  }, [id]);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    if (Number.isFinite(id)) void load();
  }, [router, id, load]);

  if (error) return <main className="container py-10"><p className="text-destructive">{error}</p></main>;
  if (!report) return <main className="container py-10"><p className="text-muted-foreground">Loading…</p></main>;

  return (
    <main className="container flex min-h-screen flex-col gap-6 py-10">
      <header className="no-print flex items-center justify-between">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/projects"><ArrowLeft className="h-4 w-4" /> Projects</Link>
        </Button>
      </header>
      <ReportEditor report={report} onDeleted={() => router.replace("/projects")} />
    </main>
  );
}
