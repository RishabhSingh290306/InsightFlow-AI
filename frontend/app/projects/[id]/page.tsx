"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  ChevronDown,
  Database,
  LogOut,
  Sparkles,
  Table as TableIcon,
  Trash2,
  Upload,
} from "lucide-react";

import { datasetsApi, projectsApi } from "@/lib/api";
import { clearToken, getToken } from "@/lib/auth";
import type { DatasetRead, ProjectRead } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const ACCEPTED = ".csv,.xlsx,.xls";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const STATUS_STYLES: Record<string, string> = {
  uploaded: "bg-secondary text-secondary-foreground",
  profiled: "bg-accent text-accent-foreground",
  understood: "bg-primary text-primary-foreground",
};

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_STYLES[status] ?? "bg-secondary text-secondary-foreground";
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${cls}`}>{status}</span>
  );
}

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
  const [error, setError] = useState<string | null>(null);

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
    if (Number.isFinite(projectId)) void load();
  }, [router, projectId, load]);

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

  async function onDelete(id: number) {
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

  return (
    <main className="container flex min-h-screen flex-col gap-8 py-10">
      <header className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/projects">
              <ArrowLeft className="h-4 w-4" />
              Projects
            </Link>
          </Button>
          <Button variant="outline" size="sm" onClick={logout}>
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {project ? project.name : `Project #${params.id}`}
          </h1>
          <p className="text-sm text-muted-foreground">
            Upload datasets (CSV or Excel) and let AI profile them.
          </p>
        </div>
      </header>

      <section className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Upload dataset</CardTitle>
            <CardDescription>CSV or Excel (.xlsx / .xls).</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onUpload} className="flex flex-col gap-4">
              <input
                id="dataset-file"
                type="file"
                accept={ACCEPTED}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="block w-full text-sm text-muted-foreground file:mr-4 file:rounded-md file:border-0 file:bg-secondary file:px-4 file:py-2 file:text-sm file:font-medium file:text-secondary-foreground hover:file:bg-secondary/80"
              />
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" disabled={uploading || !file}>
                <Upload className="h-4 w-4" />
                {uploading ? "Uploading…" : "Upload"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading datasets…</p>
          ) : datasets.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
                <Database className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">No datasets yet. Upload one.</p>
              </CardContent>
            </Card>
          ) : (
            datasets.map((d) => {
              const isOpen = expanded.has(d.id);
              const isAnalyzing = analyzing.has(d.id);
              return (
                <Card key={d.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex flex-col gap-1">
                        <CardTitle className="flex flex-wrap items-center gap-2 text-lg">
                          {d.original_filename}
                          <span className="rounded bg-secondary px-1.5 py-0.5 text-xs font-medium text-secondary-foreground">
                            v{d.version}
                          </span>
                          <StatusBadge status={d.status} />
                        </CardTitle>
                        <CardDescription>
                          {d.file_format.toUpperCase()} · {formatSize(d.file_size)}
                          {d.row_count !== null && d.column_count !== null
                            ? ` · ${d.row_count} rows × ${d.column_count} cols`
                            : " · metadata pending"}
                        </CardDescription>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Delete dataset"
                          onClick={() => onDelete(d.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onAnalyze(d.id)}
                        disabled={isAnalyzing}
                      >
                        <Sparkles className="h-4 w-4" />
                        {isAnalyzing ? "Analyzing…" : d.understanding ? "Re-analyze" : "Analyze"}
                      </Button>
                      {(d.profile || d.understanding) && (
                        <Button size="sm" variant="ghost" onClick={() => toggleExpanded(d.id)}>
                          <ChevronDown
                            className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
                          />
                          {isOpen ? "Hide" : "View analysis"}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onShowHistory(d.id)}
                      >
                        History
                      </Button>
                    </div>
                  </CardHeader>
                  {isOpen && (d.profile || d.understanding) && (
                    <CardContent className="flex flex-col gap-4 border-t pt-4">
                      {d.profile && <ProfileView profile={d.profile} />}
                      {d.understanding && <UnderstandingView understanding={d.understanding} />}
                    </CardContent>
                  )}
                  {history.has(d.id) && (
                    <CardContent className="flex flex-col gap-2 border-t pt-4">
                      <h3 className="text-sm font-semibold">Version history</h3>
                      <ol className="flex flex-col gap-1">
                        {(historyData[d.id] ?? []).map((v) => (
                          <li
                            key={v.id}
                            className={`flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm ${
                              v.id === d.id ? "border-primary bg-primary/5" : ""
                            }`}
                          >
                            <span className="rounded bg-secondary px-1.5 py-0.5 text-xs font-medium text-secondary-foreground">
                              v{v.version}
                            </span>
                            <span className="font-medium">
                              {v.origin === "upload" ? "Original" : "Cleaned"}
                            </span>
                            <span className="text-muted-foreground">{v.original_filename}</span>
                            <StatusBadge status={v.status} />
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
    </main>
  );
}

function ProfileView({ profile }: { profile: import("@/lib/types").DatasetProfile }) {
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

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-left text-xs">
          <thead className="bg-muted text-muted-foreground">
            <tr>
              {profile.column_names.map((c) => (
                <th key={c} className="px-2 py-1 font-medium">
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
              <tr key={i} className="border-t">
                {profile.column_names.map((c) => (
                  <td key={c} className="px-2 py-1">
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
      <p className="text-xs text-muted-foreground">
        Showing first {profile.preview.length} rows.
      </p>
    </div>
  );
}

function UnderstandingView({
  understanding,
}: {
  understanding: import("@/lib/types").DatasetUnderstanding;
}) {
  if (!understanding.ai_available) {
    return (
      <div className="flex items-start gap-2 rounded-md border border-dashed p-3 text-sm text-muted-foreground">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{understanding.data_quality_summary}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold">AI Insights</h3>
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
