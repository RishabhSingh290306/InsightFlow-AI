"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { dashboardsApi } from "@/lib/api";
import { getToken } from "@/lib/auth";
import type { DashboardDetailRead } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { DashboardEditor } from "@/components/dashboard-editor";

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
  if (!dashboard) return <main className="container py-10"><p className="text-muted-foreground">Loading…</p></main>;

  return (
    <main className="container flex min-h-screen flex-col gap-6 py-10">
      <header className="no-print mb-2 flex items-center justify-between">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/projects/${dashboard.project_id}`}>
            <ArrowLeft className="h-4 w-4" /> Project
          </Link>
        </Button>
      </header>
      <DashboardEditor dashboard={dashboard} onDeleted={() => router.replace(`/projects/${dashboard.project_id}`)} />
    </main>
  );
}
