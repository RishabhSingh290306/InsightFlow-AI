"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { dashboardsApi } from "@/lib/api";
import { getToken } from "@/lib/auth";
import type { DashboardDetailRead } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DashboardEditor } from "@/components/dashboard-editor";

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="no-print flex items-center gap-2">
        <Skeleton className="h-9 w-9" variant="circle" />
        <Skeleton className="h-5 w-48" />
      </div>
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-72 w-full" />
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const [dashboard, setDashboard] = useState<DashboardDetailRead | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setDashboard(await dashboardsApi.get(id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard");
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
  if (!dashboard) return <main className="container py-10"><DashboardSkeleton /></main>;

  return (
    <main className="flex min-h-screen flex-col gap-8 pb-12">
      <header className="no-print sticky top-0 z-40 border-b border-border/60 bg-background/70 backdrop-blur-md">
        <div className="container flex h-16 items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <Button variant="ghost" size="icon" asChild aria-label="Back to project">
              <Link href={`/projects/${dashboard.project_id}`}>
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div className="flex min-w-0 items-center gap-2 text-sm">
              <Link href="/projects" className="text-muted-foreground transition-colors duration-160ms hover:text-foreground">
                Projects
              </Link>
              <span className="text-muted-foreground/50">/</span>
              <span className="truncate font-medium text-foreground">{dashboard.title}</span>
            </div>
          </div>
        </div>
      </header>
      <div className="container">
        <DashboardEditor dashboard={dashboard} onDeleted={() => router.replace(`/projects/${dashboard.project_id}`)} />
      </div>
    </main>
  );
}
