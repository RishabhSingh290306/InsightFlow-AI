"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { reportsApi } from "@/lib/api";
import { getToken } from "@/lib/auth";
import type { ReportRead } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ReportEditor } from "@/components/report-editor";

function ReportSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="no-print flex flex-wrap items-center gap-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-8 w-16" />
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-8 w-36" />
      </div>
      <Skeleton className="h-64 w-full" />
      <Skeleton className="h-72 w-full" />
    </div>
  );
}

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
  if (!report) return <main className="container py-10"><ReportSkeleton /></main>;

  return (
    <main className="container flex min-h-screen flex-col gap-6 py-10">
      <header className="no-print flex items-center justify-between">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/projects/${report.project_id}`}><ArrowLeft className="h-4 w-4" /> Project</Link>
        </Button>
      </header>
      <ReportEditor report={report} onDeleted={() => router.replace(`/projects/${report.project_id}`)} />
    </main>
  );
}
