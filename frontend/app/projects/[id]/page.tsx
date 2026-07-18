"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  ChevronDown,
  Database,
  FileText,
  History,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Pencil,
  Sparkles,
  Table as TableIcon,
  Trash2,
  Upload,
} from "lucide-react";

import { dashboardsApi, datasetsApi, notebooksApi, projectsApi, reportsApi } from "@/lib/api";
import { clearToken, getToken } from "@/lib/auth";
import type { DatasetRead, DatasetProfile, DatasetUnderstanding, NotebookRead, ProjectRead } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { GeneratingOverlay, useCycle } from "@/components/stage-progress";
import { CleaningPanel } from "@/components/cleaning-panel";
import { EdaPanel } from "@/components/eda-panel";
import { SqlPanel } from "@/components/sql-panel";
import { ChatPanel } from "@/components/chat-panel";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ActionMenu, MenuItem } from "@/components/action-menu";

const ACCEPTED = ".csv,.xlsx,.xls";

const STATUS_VARIANT: Record<string, "secondary" | "muted" | "default" | "lavender"> = {
  uploaded: "secondary",
  profiled: "muted",
  understood: "default",
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function DatasetStatusBadge({ status }: { status: string }) {
  const variant = STATUS_VARIANT[status] ?? "muted";
  return (
    <Badge variant={variant} className="capitalize">
      {status}
    </Badge>
  );
}

type ConfirmTarget =
  | { kind: "dataset"; id: number; name: string }
  | { kind: "notebook"; id: number; name: string }
  | null;

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

  async function onUpload(e: React.FormEvent) {
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
  }

  async function onAnalyze(id: number) {
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
  }

  async function onDeleteDataset(id: number) {
    setError(null);
    try {
      await datasetsApi.remove(id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  async function onShowHistory(id: number) {
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
  }

  function toggleHistory(id: number) {
    setHistory((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleExpanded(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function logout() {
    clearToken();
    router.replace("/login");
  }

  async function generateReportOrDashboard(
    kind: "report" | "dashboard",
    scope: "dataset" | "project",
    datasetId?: number,
  ) {
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
  }

  function onAppliedClean(newDataset: DatasetRead) {
    // Add the new version to the workspace; its lineage is visible via History.
    setDatasets((prev) => [...prev, newDataset]);
    setCleaningId(null);
  }

  function startRename(n: NotebookRead) {
    setEditingId(n.id);
    setEditTitle(n.title);
  }

  async function onRename(id: number) {
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
  }

  async function onDeleteNotebook(id: number) {
    setBusyId(id);
    try {
      await notebooksApi.remove(id);
      setNotebooks((prev) => prev.filter((n) => n.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusyId(null);
    }
  }

  function openProjectChat() {
    setChatDataset(null);
    setChatId(null);
    setProjectChat(true);
  }

  function openDatasetChat(d: DatasetRead) {
    setChatDataset(d);
    setProjectChat(false);
  }

  function closeChat() {
    setChatId(null);
    setChatDataset(null);
    setProjectChat(false);
  }

  function confirmDelete() {
    const target = confirmTarget;
    setConfirmTarget(null);
    if (!target) return;
    if (target.kind === "dataset") void onDeleteDataset(target.id);
    else void onDeleteNotebook(target.id);
  }

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
                    <Database className="h-7 w-7" />
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
              datasets.map((d) => {
                const isOpen = expanded.has(d.id);
                const isAnalyzing = analyzing.has(d.id);
                return (
                  <Card
                    key={d.id}
                    className="card-hover group relative border bg-card shadow-soft-sm"
                  >
                    <div
                      aria-hidden
                      className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-primary/5 blur-2xl"
                    />
                    <CardHeader className="flex flex-col gap-2 space-y-0 p-4 sm:p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 flex-col gap-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Database className="h-4 w-4 shrink-0 text-primary" />
                            <span className="truncate font-semibold tracking-tight">
                              {d.original_filename}
                            </span>
                            <Badge variant="muted" className="shrink-0">
                              v{d.version}
                            </Badge>
                            <DatasetStatusBadge status={d.status} />
                          </div>
                          <p className="truncate text-xs text-muted-foreground">
                            {d.file_format.toUpperCase()} · {formatSize(d.file_size)}
                            {d.row_count !== null && d.column_count !== null
                              ? ` · ${d.row_count} rows × ${d.column_count} cols`
                              : " · metadata pending"}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                          <Button size="sm" onClick={() => onAnalyze(d.id)} disabled={isAnalyzing}>
                            <Sparkles className="h-4 w-4" />
                            <span className="hidden sm:inline">
                              {isAnalyzing ? "Analyzing…" : d.understanding ? "Re-analyze" : "Analyze"}
                            </span>
                          </Button>
                          {(d.profile || d.understanding) && (
                            <Button size="sm" variant="ghost" onClick={() => toggleExpanded(d.id)}>
                              <ChevronDown
                                className={`h-4 w-4 transition-transform duration-220ms ${isOpen ? "rotate-180" : ""}`}
                              />
                              {isOpen ? "Hide analysis" : "View analysis"}
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => onShowHistory(d.id)}>
                            <History className="h-4 w-4" />
                            History
                          </Button>
                          {d.profile && (
                            <ActionMenu label="Actions">
                              {(close) => (
                                <>
                                  <MenuItem
                                    icon={<Sparkles className="h-4 w-4" />}
                                    onSelect={() => {
                                      close();
                                      setCleaningId(d.id);
                                    }}
                                  >
                                    Clean
                                  </MenuItem>
                                  <MenuItem
                                    icon={<BarChart3 className="h-4 w-4" />}
                                    onSelect={() => {
                                      close();
                                      setEdaId(d.id);
                                    }}
                                  >
                                    EDA
                                  </MenuItem>
                                  <MenuItem
                                    icon={<TableIcon className="h-4 w-4" />}
                                    onSelect={() => {
                                      close();
                                      setSqlId(d.id);
                                    }}
                                  >
                                    SQL
                                  </MenuItem>
                                  <MenuItem
                                    icon={<FileText className="h-4 w-4" />}
                                    onSelect={() => {
                                      close();
                                      void generateReportOrDashboard("report", "dataset", d.id);
                                    }}
                                  >
                                    Report
                                  </MenuItem>
                                  <MenuItem
                                    icon={<LayoutDashboard className="h-4 w-4" />}
                                    onSelect={() => {
                                      close();
                                      void generateReportOrDashboard("dashboard", "dataset", d.id);
                                    }}
                                  >
                                    Dashboard
                                  </MenuItem>
                                  <MenuItem
                                    icon={<MessageSquare className="h-4 w-4" />}
                                    onSelect={() => {
                                      close();
                                      openDatasetChat(d);
                                    }}
                                  >
                                    Chat
                                  </MenuItem>
                                </>
                              )}
                            </ActionMenu>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Delete dataset"
                            className="text-muted-foreground hover:text-destructive"
                            onClick={() =>
                              setConfirmTarget({ kind: "dataset", id: d.id, name: d.original_filename })
                            }
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    {isOpen && (d.profile || d.understanding) && (
                      <CardContent className="flex flex-col gap-4 border-t border-border pt-4">
                        {d.profile && <ProfileView profile={d.profile} />}
                        {d.understanding && <UnderstandingView understanding={d.understanding} />}
                      </CardContent>
                    )}
                    {history.has(d.id) && (
                      <CardContent className="flex flex-col gap-2 border-t border-border pt-4">
                        <h3 className="text-sm font-semibold">Version history</h3>
                        <ol className="flex flex-col gap-1">
                          {(historyData[d.id] ?? []).map((v) => (
                            <li
                              key={v.id}
                              className={`flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 text-sm ${
                                v.id === d.id ? "border-primary bg-primary/5" : "border-border"
                              }`}
                            >
                              <Badge variant="muted">v{v.version}</Badge>
                              <span className="font-medium">
                                {v.origin === "upload" ? "Original" : "Cleaned"}
                              </span>
                              <span className="text-muted-foreground">{v.original_filename}</span>
                              <DatasetStatusBadge status={v.status} />
                              {v.id === d.id && (
                                <span className="text-xs text-muted-foreground">· viewing</span>
                              )}
                            </li>
                          ))}
                        </ol>
                      </CardContent>
                    )}
                  </Card>
                );
              })
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
              {notebooks.map((n) => {
                const isEditing = editingId === n.id;
                const isBusy = busyId === n.id;
                return (
                  <Card key={n.id} className="card-hover border bg-card shadow-soft-sm">
                    <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        {isEditing ? (
                          <input
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            className="w-full min-w-[200px] rounded-lg border border-input px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            aria-label="Rename notebook"
                          />
                        ) : (
                          <Link
                            href={`/notebooks/${n.id}`}
                            className="truncate font-medium hover:underline"
                          >
                            {n.title}
                          </Link>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {n.scope}
                          {n.dataset_id !== null && n.dataset_id !== undefined
                            ? ` · dataset #${n.dataset_id}`
                            : ""}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        {isEditing ? (
                          <>
                            <Button
                              size="sm"
                              onClick={() => onRename(n.id)}
                              disabled={isBusy || !editTitle.trim()}
                            >
                              Save
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setEditingId(null)}
                              disabled={isBusy}
                            >
                              Cancel
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => startRename(n)}
                              aria-label="Rename notebook"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                setConfirmTarget({ kind: "notebook", id: n.id, name: n.title })
                              }
                              disabled={isBusy}
                              aria-label="Delete notebook"
                              className="text-muted-foreground hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
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

      <ConfirmDialog
        open={confirmTarget !== null}
        title={confirmTarget?.kind === "notebook" ? "Delete notebook?" : "Delete dataset?"}
        description={
          confirmTarget
            ? `This permanently deletes "${confirmTarget.name}" and all of its versions. This cannot be undone.`
            : undefined
        }
        confirmLabel="Delete"
        destructive
        onConfirm={confirmDelete}
        onCancel={() => setConfirmTarget(null)}
      />
    </main>
  );
}

function DatasetSkeleton() {
  return (
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
}

function ProfileView({ profile }: { profile: DatasetProfile }) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold">Profile</h3>
      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
        <span>{profile.row_count} rows</span>
        <span>·</span>
        <span>{profile.column_count} columns</span>
        <span>·</span>
        <span>{profile.null_percentage}% null</span>
        <span>·</span>
        <span>{profile.duplicate_row_count} duplicates</span>
        {profile.potential_target_column && (
          <>
            <span>·</span>
            <span>target: {profile.potential_target_column}</span>
          </>
        )}
      </div>

      {profile.data_quality_issues.length > 0 && (
        <ul className="flex flex-col gap-1">
          {profile.data_quality_issues.map((issue, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{issue}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-left text-xs">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              {profile.column_names.map((c) => (
                <th key={c} className="px-3 py-2 font-medium">
                  {c}
                  <span className="ml-1 text-[10px] text-muted-foreground">
                    {profile.inferred_types[c] ?? ""}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {profile.preview.map((row, i) => (
              <tr key={i} className="border-t border-border">
                {profile.column_names.map((c) => (
                  <td key={c} className="px-3 py-2">
                    {row[c] === null || row[c] === undefined ? (
                      <span className="text-muted-foreground">∅</span>
                    ) : (
                      String(row[c])
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">Showing first {profile.preview.length} rows.</p>
    </div>
  );
}

function UnderstandingView({ understanding }: { understanding: DatasetUnderstanding }) {
  if (!understanding.ai_available) {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-dashed border-border p-3 text-sm text-muted-foreground">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <span>{understanding.data_quality_summary}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold">Insights</h3>
      <p className="text-sm">{understanding.dataset_description}</p>
      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
        <span>Domain: {understanding.business_domain_guess}</span>
        <span>·</span>
        <span>Use case: {understanding.likely_use_case}</span>
        {understanding.possible_target_column && (
          <>
            <span>·</span>
            <span>Target: {understanding.possible_target_column}</span>
          </>
        )}
        <span>·</span>
        <span>Confidence: {(understanding.confidence_score * 100).toFixed(0)}%</span>
      </div>

      <Section title="Data quality" items={[understanding.data_quality_summary]} />
      <Section title="Cleaning recommendations" items={understanding.cleaning_recommendations} />
      <Section title="Suggested visualizations" items={understanding.suggested_visualizations} />
      <Section
        title="Suggested business questions"
        items={understanding.suggested_business_questions}
      />
      {understanding.initial_business_observations.length > 0 && (
        <Section
          title="Initial observations"
          items={understanding.initial_business_observations}
        />
      )}
    </div>
  );
}

function Section({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h4>
      <ul className="flex flex-col gap-1">
        {items.map((item, i) => (
          <li key={i} className="text-sm">
            • {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
