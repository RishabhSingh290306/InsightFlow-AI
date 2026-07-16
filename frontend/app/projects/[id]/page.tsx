"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Database, LogOut, Trash2, Upload } from "lucide-react";

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

export default function ProjectWorkspacePage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const projectId = Number(params.id);

  const [project, setProject] = useState<ProjectRead | null>(null);
  const [datasets, setDatasets] = useState<DatasetRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
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
      if (document.getElementById("dataset-file") instanceof HTMLInputElement) {
        (document.getElementById("dataset-file") as HTMLInputElement).value = "";
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
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
            Upload datasets (CSV or Excel) to start analyzing.
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
            datasets.map((d) => (
              <Card key={d.id}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex flex-col gap-1">
                      <CardTitle className="text-lg">
                        {d.original_filename}
                        <span className="ml-2 rounded bg-secondary px-1.5 py-0.5 text-xs font-medium text-secondary-foreground">
                          v{d.version}
                        </span>
                      </CardTitle>
                      <CardDescription>
                        {d.file_format.toUpperCase()} · {formatSize(d.file_size)}
                        {d.row_count !== null && d.column_count !== null
                          ? ` · ${d.row_count} rows × ${d.column_count} cols`
                          : " · metadata pending"}
                      </CardDescription>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Delete dataset"
                      onClick={() => onDelete(d.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
              </Card>
            ))
          )}
        </div>
      </section>
    </main>
  );
}
