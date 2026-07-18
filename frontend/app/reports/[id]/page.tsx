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
        <Skeleton className="h-9 w-9" variant="circle" />
        <Skeleton className="h-5 w-48" />
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
    <main className="flex min-h-screen flex-col gap-8 pb-12">
      <header className="no-print sticky top-0 z-40 border-b border-border/60 bg-background/70 backdrop-blur-md">
        <div className="container flex h-16 items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <Button variant="ghost" size="icon" asChild aria-label="Back to project">
              <Link href={`/projects/${report.project_id}`}>
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div className="flex min-w-0 items-center gap-2 text-sm">
              <Link href="/projects" className="text-muted-foreground transition-colors duration-160ms hover:text-foreground">
                Projects
              </Link>
              <span className="text-muted-foreground/50">/</span>
              <span className="truncate font-medium text-foreground">{report.title}</span>
            </div>
          </div>
        </div>
      </header>
      <div className="container">
        <ReportEditor report={report} onDeleted={() => router.replace(`/projects/${report.project_id}`)} />
      </div>
    </main>
  );
}
