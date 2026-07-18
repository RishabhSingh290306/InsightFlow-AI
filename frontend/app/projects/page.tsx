"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

import { authApi, datasetsApi, dashboardsApi, projectsApi, reportsApi } from "@/lib/api";
import { clearToken, getToken } from "@/lib/auth";
import type { ProjectRead } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal, ModalBody, ModalFooter, ModalHeader } from "@/components/ui/modal";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ActivityTimeline,
  type ActivityItem,
  type ActivityType,
} from "@/components/dashboard/activity-timeline";
import { AITipCard } from "@/components/dashboard/ai-tip-card";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { HeroSection } from "@/components/dashboard/hero-section";
import { RecentProjects } from "@/components/dashboard/recent-projects";
import { StatsCards, type DashboardStats } from "@/components/dashboard/stats-cards";

function byNewestTime(a: ActivityItem, b: ActivityItem) {
  return new Date(b.time).getTime() - new Date(a.time).getTime();
}

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [userName, setUserName] = useState("there");
  const [stats, setStats] = useState<DashboardStats>({
    projects: 0,
    datasets: 0,
    analyses: 0,
    reports: 0,
  });
  const [datasetCounts, setDatasetCounts] = useState<Record<number, number>>({});
  const [activities, setActivities] = useState<ActivityItem[]>([]);

  // Creation modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);

  // Delete confirmation + the project the user last worked in
  const [deleteTarget, setDeleteTarget] = useState<ProjectRead | null>(null);
  const [lastProject, setLastProject] = useState<{ id: number; name: string } | null>(
    null
  );

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    void load();
  }, [router]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [projectsRes, userRes] = await Promise.allSettled([
        projectsApi.list(),
        authApi.me(),
      ]);
      if (projectsRes.status !== "fulfilled") throw projectsRes.reason;
      const loaded = projectsRes.value;
      setProjects(loaded);
      if (userRes.status === "fulfilled" && userRes.value.full_name) {
        setUserName(userRes.value.full_name);
      }

      // Best-effort enrichment: pull real counts + build an activity feed from
      // each project's datasets / dashboards / reports. Any failure is isolated
      // so one broken endpoint never blanks the whole dashboard.
      const settled = await Promise.all(
        loaded.map((p) =>
          Promise.allSettled([
            datasetsApi.list(p.id),
            dashboardsApi.list(p.id),
            reportsApi.list(p.id),
          ])
        )
      );

      let datasets = 0;
      let analyses = 0;
      let reports = 0;
      const counts: Record<number, number> = {};
      const feed: ActivityItem[] = [];
      const lastActive: Record<number, number> = {};

      loaded.forEach((p, i) => {
        const [ds, db, rp] = settled[i];
        const dsVal = ds.status === "fulfilled" ? ds.value : [];
        const dbVal = db.status === "fulfilled" ? db.value : [];
        const rpVal = rp.status === "fulfilled" ? rp.value : [];

        counts[p.id] = dsVal.length;
        datasets += dsVal.length;
        analyses += dbVal.length;
        reports += rpVal.length;

        for (const d of dsVal) {
          feed.push({
            key: `ds-${d.id}`,
            type: "dataset" as ActivityType,
            label: `Dataset "${d.original_filename}" uploaded`,
            time: d.created_at,
          });
        }
        for (const d of dbVal) {
          feed.push({
            key: `db-${d.id}`,
            type: "dashboard" as ActivityType,
            label: `Dashboard "${d.title}" generated`,
            time: d.created_at,
          });
        }
        for (const r of rpVal) {
          feed.push({
            key: `rp-${r.id}`,
            type: "report" as ActivityType,
            label: `Report "${r.title}" exported`,
            time: r.created_at,
          });
        }
        feed.push({
          key: `pj-${p.id}`,
          type: "project" as ActivityType,
          label: `Project "${p.name}" created`,
          time: p.created_at,
        });

        // Latest activity (creation or any upload/dashboard/report) for this
        // project — used to pick the project the user last worked in.
        const times = [
          p.created_at,
          ...dsVal.map((d) => d.created_at),
          ...dbVal.map((d) => d.created_at),
          ...rpVal.map((r) => r.created_at),
        ];
        lastActive[p.id] = Math.max(...times.map((t) => new Date(t).getTime()));
      });

      // The "last project" the user worked in = the one with the most recent
      // activity, not merely the newest created.
      let lastId: number | null = null;
      let lastTime = -1;
      for (const [id, t] of Object.entries(lastActive)) {
        if (t > lastTime) {
          lastTime = t;
          lastId = Number(id);
        }
      }
      const lp = lastId != null ? loaded.find((p) => p.id === lastId) : undefined;
      setLastProject(lp ? { id: lp.id, name: lp.name } : null);

      setStats({ projects: loaded.length, datasets, analyses, reports });
      setDatasetCounts(counts);
      setActivities(feed.sort(byNewestTime).slice(0, 8));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load projects");
    } finally {
      setLoading(false);
    }
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setError(null);
    setCreating(true);
    try {
      await projectsApi.create({ name: name.trim(), description: description.trim() });
      setName("");
      setDescription("");
      setModalOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create project");
    } finally {
      setCreating(false);
    }
  }

  function logout() {
    clearToken();
    router.replace("/login");
  }

  function requestDelete(p: ProjectRead) {
    setDeleteTarget(p);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setError(null);
    try {
      await projectsApi.remove(deleteTarget.id);
      setDeleteTarget(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete project");
      setDeleteTarget(null);
    }
  }

  return (
    <main className="relative min-h-screen">
      {/* Premium ambient background — very light green-to-white gradient, a faint
          structural grid, and a soft green glow. Kept subtle on purpose. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 bg-gradient-to-b from-[#F7FBF8] via-white to-white"
      />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 bg-grid opacity-[0.04]"
      />
      <div
        aria-hidden
        className="pointer-events-none fixed -left-24 -top-24 -z-10 h-96 w-96 rounded-full bg-primary/10 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none fixed -right-24 top-1/3 -z-10 h-96 w-96 rounded-full bg-lavender/10 blur-3xl"
      />

      <DashboardHeader
        userName={userName}
        onSignOut={logout}
        notifications={activities}
      />

      <div className="container mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 sm:py-10">
        {error && !loading && (
          <div className="flex flex-col gap-3 rounded-2xl border border-destructive/40 bg-destructive/10 p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="outline" size="sm" onClick={() => void load()}>
              Retry
            </Button>
          </div>
        )}

        {loading ? (
          <DashboardSkeleton />
        ) : (
          <>
            <HeroSection
              userName={userName}
              onNewProject={() => setModalOpen(true)}
              lastProject={lastProject}
            />

            <StatsCards stats={stats} />

            <div className="grid gap-6 xl:grid-cols-3">
              <div className="space-y-6 xl:col-span-2">
                <RecentProjects
                  projects={projects}
                  datasetCounts={datasetCounts}
                  onCreate={() => setModalOpen(true)}
                  onOpen={(id) => router.push(`/projects/${id}`)}
                  onRequestDelete={requestDelete}
                />
                <ActivityTimeline activities={activities} />
              </div>
              <div className="space-y-6">
                <AITipCard />
              </div>
            </div>
          </>
        )}
      </div>

      <footer className="border-t border-border/60 py-6">
        <div className="container mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 text-xs text-muted-foreground sm:flex-row sm:px-6">
          <p>
            © {new Date().getFullYear()} InsightFlow. Built for people who work
            with data.
          </p>
          <div className="flex items-center gap-5">
            <span className="cursor-pointer transition-colors hover:text-foreground">
              Privacy
            </span>
            <span className="cursor-pointer transition-colors hover:text-foreground">
              Terms
            </span>
            <span className="cursor-pointer transition-colors hover:text-foreground">
              Docs
            </span>
          </div>
        </div>
      </footer>

      {/* Creation modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)}>
        <ModalHeader
          title="New project"
          description="Create a workspace to upload datasets."
          onClose={() => setModalOpen(false)}
        />
        <form onSubmit={onCreate}>
          <ModalBody className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Q3 Sales Analysis"
                required
                autoFocus
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional"
              />
            </div>
            {error && creating && <p className="text-sm text-destructive">{error}</p>}
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" type="button" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={creating} disabled={!name.trim()}>
              Create project
            </Button>
          </ModalFooter>
        </form>
      </Modal>

      <ConfirmDialog
        open={deleteTarget !== null}
        destructive
        title="Delete project"
        description={
          deleteTarget
            ? `Are you sure you want to delete "${deleteTarget.name}"? This action cannot be undone.`
            : undefined
        }
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </main>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-3">
          <Skeleton variant="title" className="h-9 w-72" />
          <Skeleton variant="text" className="w-80" />
          <Skeleton variant="text" className="w-56" />
        </div>
        <div className="flex gap-3">
          <Skeleton variant="button" className="h-12 w-36 rounded-2xl" />
          <Skeleton variant="button" className="h-12 w-48 rounded-2xl" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} variant="card" className="h-28 rounded-2xl" />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} variant="card" className="h-32 rounded-2xl" />
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="grid gap-4 sm:grid-cols-2 xl:col-span-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} variant="card" className="h-56 rounded-2xl" />
          ))}
        </div>
        <Skeleton variant="card" className="h-56 rounded-2xl" />
      </div>
    </div>
  );
}
