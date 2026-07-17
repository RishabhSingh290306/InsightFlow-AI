"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Database, LogOut, Plus } from "lucide-react";

import { projectsApi } from "@/lib/api";
import { clearToken, getToken } from "@/lib/auth";
import type { ProjectRead } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

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
      setProjects(await projectsApi.list());
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

  return (
    <main className="container flex min-h-screen flex-col gap-8 py-10">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Projects</h1>
          <p className="text-sm text-muted-foreground">Your data analysis workspaces.</p>
        </div>
        <Button variant="outline" size="sm" onClick={logout}>
          <LogOut className="h-4 w-4" />
          Sign out
        </Button>
      </header>

      {error && !loading && (
        <div className="flex flex-col gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-destructive">{error}</p>
          <Button variant="outline" size="sm" onClick={() => void load()}>
            Retry
          </Button>
        </div>
      )}

      <section className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">New project</CardTitle>
            <CardDescription>Create a workspace to upload datasets.</CardDescription>
          </CardHeader>
          <form onSubmit={onCreate}>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Q3 Sales Analysis"
                  required
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
              {error && loading && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" disabled={creating || !name.trim()}>
                <Plus className="h-4 w-4" />
                {creating ? "Creating…" : "Create project"}
              </Button>
            </CardContent>
          </form>
        </Card>

        <div className="flex flex-col gap-4">
          {loading ? (
            <>
              <ProjectCardSkeleton />
              <ProjectCardSkeleton />
            </>
          ) : projects.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
                <Database className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  No projects yet. Create your first one.
                </p>
              </CardContent>
            </Card>
          ) : (
            projects.map((p) => (
              <Card key={p.id} className="card-hover animate-slide-up">
                <CardHeader>
                  <CardTitle className="text-lg">{p.name}</CardTitle>
                  {p.description && (
                    <CardDescription>{p.description}</CardDescription>
                  )}
                </CardHeader>
                <CardContent>
                  <Link
                    href={`/projects/${p.id}`}
                    className="text-sm font-medium text-primary hover:underline"
                  >
                    Open workspace →
                  </Link>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </section>
    </main>
  );
}

function ProjectCardSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-56" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-4 w-32" />
      </CardContent>
    </Card>
  );
}
