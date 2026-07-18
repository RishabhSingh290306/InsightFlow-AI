"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  FileText,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Sparkles,
  Upload,
} from "lucide-react";

import { dashboardsApi, datasetsApi, notebooksApi, projectsApi, reportsApi } from "@/lib/api";
import { clearToken, getToken } from "@/lib/auth";
import { recordProjectOpened } from "@/lib/recent";
import type { DatasetRead, NotebookRead, ProjectRead } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { GeneratingOverlay, useCycle } from "@/components/stage-progress";
import { CleaningPanel } from "@/components/cleaning-panel";
import { EdaPanel } from "@/components/eda-panel";
import { SqlPanel } from "@/components/sql-panel";
import { ChatPanel } from "@/components/chat-panel";
import { DatasetCard } from "@/components/workspace/dataset-card";
import { NotebookCard } from "@/components/workspace/notebook-card";
import { ProfileView, UnderstandingView } from "@/components/workspace/views";
import { WorkspaceConfirmDialog } from "@/components/workspace/confirm-dialog";
import type { ConfirmTarget } from "@/components/workspace/types";

const ACCEPTED = ".csv,.xlsx,.xls";

const DatasetSkeleton = () => (
  <Card className="border bg-card shadow-soft-sm">
    <CardHeader>
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Skeleton variant="title" className="w-48" />
          <Skeleton variant="text" className="w-64" />
        </div>
        <Skeleton className="h-8 w-8 rounded-lg" />
      </div>
      <div className="flex gap-2 pt-2">
        <Skeleton variant="button" className="w-28" />
        <Skeleton variant="button" className="w-32" />
        <Skeleton variant="button" className="w-24" />
      </div>
    </CardHeader>
  </Card>
);

export default function ProjectWorkspacePage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const projectId = Number(params.id);

  const [project, setProject] = useState<ProjectRead | null>(null);
  const [datasets, setDatasets] = useState<DatasetRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState<Set<number>>(new Set());
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [history, setHistory] = useState<Set<number>>(new Set());
  const [historyData, setHistoryData] = useState<Record<number, DatasetRead[]>>({});
  const [cleaningId, setCleaningId] = useState<number | null>(null);
  const [edaId, setEdaId] = useState<number | null>(null);
  const [sqlId, setSqlId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [chatId, setChatId] = useState<number | null>(null);
  const [chatDataset, setChatDataset] = useState<DatasetRead | null>(null);
  const [projectChat, setProjectChat] = useState(false);
  const [notebooks, setNotebooks] = useState<NotebookRead[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<ConfirmTarget>(null);

  // Event-driven progress for long-running generation (see Task: perceived perf).
  const [genKind, setGenKind] = useState<"report" | "dashboard">("dashboard");
  const [genStages, setGenStages] = useState<string[]>([]);
  const genActive = useCycle(genStages.length || 1, 850, generating);

  const loadNotebooks = useCallback(async () => {
    try {
      const nbs = await notebooksApi.list(projectId);
      setNotebooks(nbs ?? []);
    } catch {
      // Notebooks list is secondary; ignore failures here (chat still works).
    }
  }, [projectId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [proj, ds] = await Promise.all([
        projectsApi.get(projectId),
        datasetsApi.list(projectId),
      ]);
      setProject(proj);
      setDatasets(ds);
      recordProjectOpened(projectId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load workspace");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    if (Number.isFinite(projectId)) {
      void load();
      void loadNotebooks();
    }
  }, [router, projectId, load, loadNotebooks]);

  const onUpload = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!file) return;
      setError(null);
      setUploading(true);
      try {
        await datasetsApi.upload(projectId, file);
        setFile(null);
        const input = document.getElementById("dataset-file") as HTMLInputElement | null;
        if (input) input.value = "";
        await load();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setUploading(false);
      }
    },
    [file, projectId, load],
  );

  const onAnalyze = useCallback(
    async (id: number) => {
      setError(null);
      setAnalyzing((prev) => new Set(prev).add(id));
      try {
        await datasetsApi.analyze(id);
        await load();
        setExpanded((prev) => new Set(prev).add(id));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Analysis failed");
      } finally {
        setAnalyzing((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [load],
  );

  const onDeleteDataset = useCallback(
    async (id: number) => {
      setError(null);
      try {
        await datasetsApi.remove(id);
        await load();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Delete failed");
      }
    },
    [load],
  );

  const onShowHistory = useCallback(
    async (id: number) => {
      if (history.has(id)) {
        toggleHistory(id);
        return;
      }
      setError(null);
      try {
        const chain = await datasetsApi.lineage(id);
        setHistoryData((prev) => ({ ...prev, [id]: chain }));
        toggleHistory(id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load version history");
      }
    },
    [history],
  );

  const toggleHistory = useCallback((id: number) => {
    setHistory((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleExpanded = useCallback((id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const logout = useCallback(() => {
    clearToken();
    router.replace("/login");
  }, [router]);

  const generateReportOrDashboard = useCallback(
    async (kind: "report" | "dashboard", scope: "dataset" | "project", datasetId?: number) => {
      setGenKind(kind);
      setGenStages(
        kind === "report"
          ? [
              "Gathering dataset context",
              "Drafting the narrative",
              "Adding charts & tables",
              "Finalizing report",
            ]
          : [
              "Understanding the workspace",
              "Identifying KPIs",
              "Building visualizations",
              "Finalizing dashboard",
            ],
      );
      setError(null);
      setGenerating(true);
      try {
        if (kind === "report") {
          const rep = await reportsApi.generate(
            scope === "dataset"
              ? { scope: "dataset", dataset_id: datasetId, project_id: projectId }
              : { scope: "project", project_id: projectId },
          );
          router.push(`/reports/${rep.id}`);
        } else {
          const dash = await dashboardsApi.generate(
            scope === "dataset"
              ? { scope: "dataset", dataset_id: datasetId, project_id: projectId }
              : { scope: "project", project_id: projectId },
          );
          router.push(`/dashboards/${dash.id}`);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Generation failed");
      } finally {
        setGenerating(false);
      }
    },
    [projectId, router],
  );

  const onAppliedClean = useCallback((newDataset: DatasetRead) => {
    // Add the new version to the workspace; its lineage is visible via History.
    setDatasets((prev) => [...prev, newDataset]);
    setCleaningId(null);
  }, []);

  const startRename = useCallback((n: NotebookRead) => {
    setEditingId(n.id);
    setEditTitle(n.title);
  }, []);

  const onRename = useCallback(
    async (id: number) => {
      const title = editTitle.trim();
      if (!title) return;
      setBusyId(id);
      try {
        const updated = await notebooksApi.update(id, { title });
        setNotebooks((prev) => prev.map((n) => (n.id === id ? { ...n, title: updated.title } : n)));
        setEditingId(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Rename failed");
      } finally {
        setBusyId(null);
      }
    },
    [editTitle],
  );

  const onDeleteNotebook = useCallback(
    async (id: number) => {
      setBusyId(id);
      try {
        await notebooksApi.remove(id);
        setNotebooks((prev) => prev.filter((n) => n.id !== id));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Delete failed");
      } finally {
        setBusyId(null);
      }
    },
    [],
  );

  const openProjectChat = useCallback(() => {
    setChatDataset(null);
    setChatId(null);
    setProjectChat(true);
  }, []);

  const openDatasetChat = useCallback((d: DatasetRead) => {
    setChatDataset(d);
    setProjectChat(false);
  }, []);

  const closeChat = useCallback(() => {
    setChatId(null);
    setChatDataset(null);
    setProjectChat(false);
  }, []);

  const confirmDelete = useCallback(() => {
    const target = confirmTarget;
    setConfirmTarget(null);
    if (!target) return;
    if (target.kind === "dataset") void onDeleteDataset(target.id);
    else void onDeleteNotebook(target.id);
  }, [confirmTarget, onDeleteDataset, onDeleteNotebook]);

  const chatOpen = chatId !== null || chatDataset !== null || projectChat;
  const analyzedCount = datasets.filter((d) => d.profile || d.understanding).length;

  return (
    <main className="bg-canvas flex min-h-screen flex-col">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/70 backdrop-blur-md">
        <div className="container flex h-16 items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2 text-sm">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/projects" className="gap-1.5">
                <ArrowLeft className="h-4 w-4" />
                Projects
              </Link>
            </Button>
            <span className="text-border">/</span>
            <span className="truncate font-semibold tracking-tight">
              {project ? project.name : `Project #${params.id}`}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => generateReportOrDashboard("report", "project")}
              disabled={generating}
            >
              <FileText className="h-4 w-4" />
              <span className="hidden sm:inline">{generating ? "Generating…" : "Report"}</span>
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => generateReportOrDashboard("dashboard", "project")}
              disabled={generating}
            >
              <LayoutDashboard className="h-4 w-4" />
              <span className="hidden sm:inline">{generating ? "Generating…" : "Dashboard"}</span>
            </Button>
            <Button size="sm" variant="outline" onClick={openProjectChat}>
              <MessageSquare className="h-4 w-4" />
              <span className="hidden sm:inline">Chat</span>
            </Button>
            <Button variant="ghost" size="icon" onClick={logout} aria-label="Sign out">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <div className="container flex flex-col gap-8 py-8">
        {/* Intro */}
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-bold tracking-tight">
            {project ? project.name : `Project #${params.id}`}
          </h1>
          <p className="text-muted-foreground">
            {datasets.length} dataset{datasets.length === 1 ? "" : "s"} ·{" "}
            {analyzedCount} analyzed · upload, profile, and explore your data.
          </p>
        </div>

        {error && !loading && (
          <div className="flex flex-col gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="outline" size="sm" onClick={() => void load()}>
              Retry
            </Button>
          </div>
        )}

        <section className="grid gap-6 lg:grid-cols-[340px_1fr]">
          {/* Upload + quick actions */}
          <div className="flex flex-col gap-6">
            <Card className="border bg-card shadow-soft-sm">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Upload className="h-4 w-4" />
                  </span>
                  <div>
                    <CardTitle className="text-base">Upload dataset</CardTitle>
                    <CardDescription>CSV or Excel</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <form onSubmit={onUpload} className="flex flex-col gap-3">
                  <label
                    htmlFor="dataset-file"
                    className="group flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border bg-muted/30 px-4 py-8 text-center transition-colors duration-160ms hover:border-primary/40 hover:bg-primary/5"
                  >
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary transition-transform duration-220ms group-hover:scale-105">
                      <Upload className="h-5 w-5" />
                    </span>
                    <span className="text-sm font-medium">Drop a file or click to browse</span>
                    <span className="text-2xs text-muted-foreground">.csv, .xlsx, .xls</span>
                  </label>
                  <input
                    id="dataset-file"
                    type="file"
                    accept={ACCEPTED}
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                    className="sr-only"
                  />
                  {file && (
                    <p className="truncate text-center text-2xs text-muted-foreground">
                      Selected: {file.name}
                    </p>
                  )}
                  <Button type="submit" disabled={uploading || !file} className="w-full">
                    <Upload className="h-4 w-4" />
                    {uploading ? "Uploading…" : "Upload"}
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card className="border bg-card shadow-soft-sm">
              <CardHeader>
                <CardTitle className="text-sm">Workspace</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-1.5">
                <Button variant="ghost" className="justify-start" onClick={openProjectChat}>
                  <MessageSquare className="h-4 w-4" />
                  Ask the assistant
                </Button>
                <Button
                  variant="ghost"
                  className="justify-start"
                  onClick={() => generateReportOrDashboard("dashboard", "project")}
                  disabled={generating}
                >
                  <LayoutDashboard className="h-4 w-4" />
                  Generate dashboard
                </Button>
                <Button
                  variant="ghost"
                  className="justify-start"
                  onClick={() => generateReportOrDashboard("report", "project")}
                  disabled={generating}
                >
                  <FileText className="h-4 w-4" />
                  Generate report
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Datasets */}
          <div className="flex flex-col gap-4">
            {loading ? (
              <>
                <DatasetSkeleton />
                <DatasetSkeleton />
              </>
            ) : datasets.length === 0 ? (
              <Card className="border border-dashed border-border bg-card/50">
                <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
                  <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <Upload className="h-7 w-7" />
                  </span>
                  <div>
                    <p className="font-semibold">No datasets yet</p>
                    <p className="text-sm text-muted-foreground">
                      Upload a CSV or Excel file to get started.
                    </p>
                  </div>
                </CardContent>
              </Card>
            ) : (
              datasets.map((d) => (
                <DatasetCard
                  key={d.id}
                  dataset={d}
                  isOpen={expanded.has(d.id)}
                  isAnalyzing={analyzing.has(d.id)}
                  showHistory={history.has(d.id)}
                  historyVersions={historyData[d.id] ?? []}
                  onAnalyze={onAnalyze}
                  onToggleExpanded={toggleExpanded}
                  onShowHistory={onShowHistory}
                  onOpenClean={(id) => setCleaningId(id)}
                  onOpenEda={(id) => setEdaId(id)}
                  onOpenSql={(id) => setSqlId(id)}
                  onGenerateReport={(id) => void generateReportOrDashboard("report", "dataset", id)}
                  onGenerateDashboard={(id) =>
                    void generateReportOrDashboard("dashboard", "dataset", id)
                  }
                  onOpenChat={openDatasetChat}
                  onRequestDelete={(target) => setConfirmTarget(target)}
                />
              ))
            )}
          </div>
        </section>

        {/* Notebooks */}
        <section className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <h2 className="text-lg font-semibold">Notebooks</h2>
          </div>
          {notebooks.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No notebooks yet — use the <span className="font-medium">Chat</span> button above or
              on a dataset to start one.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {notebooks.map((n) => (
                <NotebookCard
                  key={n.id}
                  notebook={n}
                  isEditing={editingId === n.id}
                  isBusy={busyId === n.id}
                  editTitle={editTitle}
                  onEditTitleChange={setEditTitle}
                  onStartRename={startRename}
                  onRename={onRename}
                  onCancelRename={() => setEditingId(null)}
                  onRequestDelete={(target) => setConfirmTarget(target)}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      {cleaningId !== null && (
        <CleaningPanel
          dataset={datasets.find((d) => d.id === cleaningId)!}
          onApplied={onAppliedClean}
          onClose={() => setCleaningId(null)}
        />
      )}

      {edaId !== null && (
        <EdaPanel dataset={datasets.find((d) => d.id === edaId)!} onClose={() => setEdaId(null)} />
      )}

      {sqlId !== null && (
        <SqlPanel dataset={datasets.find((d) => d.id === sqlId)!} onClose={() => setSqlId(null)} />
      )}

      {chatOpen && (
        <ChatPanel
          projectId={projectId}
          dataset={chatDataset}
          notebookId={chatId}
          onNotebookCreated={(id) => {
            setChatId(id);
            void loadNotebooks();
          }}
          onClose={closeChat}
        />
      )}

      {generating && genStages.length > 0 && (
        <GeneratingOverlay
          title={genKind === "report" ? "Generating report" : "Generating dashboard"}
          description="This runs in the background — you'll be taken there when it's ready."
          stages={genStages}
          activeIndex={genActive}
        />
      )}

      <WorkspaceConfirmDialog
        target={confirmTarget}
        onConfirm={confirmDelete}
        onCancel={() => setConfirmTarget(null)}
      />
    </main>
  );
}
