"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Database,
  FolderKanban,
  LayoutGrid,
  LineChart,
  LogOut,
  Plus,
  Sparkles,
} from "lucide-react";

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
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal, ModalBody, ModalFooter, ModalHeader } from "@/components/ui/modal";
import { StatusIndicator } from "@/components/ui/status-indicator";

const ACCENTS = [
  "bg-primary/10 text-primary",
  "bg-lavender/15 text-lavender-foreground",
  "bg-secondary/40 text-secondary-foreground",
  "bg-warning/10 text-warning",
  "bg-success/10 text-success",
];

const ICONS = [Database, FolderKanban, LayoutGrid, LineChart];

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Creation modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
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

  return (
    <main className="bg-canvas min-h-screen">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/70 backdrop-blur-md">
        <div className="container flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold tracking-tight">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Sparkles className="h-4 w-4" />
            </span>
            InsightFlow
          </Link>
          <Button variant="ghost" size="sm" onClick={logout}>
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
        </div>
      </header>

      <div className="container flex flex-col gap-8 py-10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Projects</h1>
            <p className="mt-1 text-muted-foreground">
              Your data analysis workspaces.
            </p>
          </div>
          <Button onClick={() => setModalOpen(true)}>
            <Plus className="h-4 w-4" />
            New project
          </Button>
        </div>

        {error && !loading && (
          <div className="flex flex-col gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="outline" size="sm" onClick={() => void load()}>
              Retry
            </Button>
          </div>
        )}

        {loading ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="border bg-card shadow-soft-sm">
                <CardHeader>
                  <Skeleton variant="circle" className="h-12 w-12" />
                  <Skeleton variant="title" className="mt-3 w-40" />
                  <Skeleton variant="text" className="w-56" />
                </CardHeader>
                <CardContent className="flex items-center justify-between">
                  <Skeleton variant="text" className="w-24" />
                  <Skeleton variant="button" className="w-32" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : projects.length === 0 ? (
          <Card className="border border-dashed border-border bg-card/50">
            <EmptyState
              icon={<Database className="h-7 w-7" />}
              iconTone="primary"
              title="No projects yet"
              description="Create a workspace to start uploading datasets and exploring your data."
              action={
                <Button onClick={() => setModalOpen(true)}>
                  <Plus className="h-4 w-4" />
                  New project
                </Button>
              }
            />
          </Card>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((p, i) => {
              const Accent = ACCENTS[i % ACCENTS.length];
              const Icon = ICONS[i % ICONS.length];
              return (
                <Card
                  key={p.id}
                  className="card-hover group relative overflow-hidden border bg-card shadow-soft-sm"
                >
                  <div
                    aria-hidden
                    className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-primary/5 blur-2xl transition-opacity duration-220ms group-hover:opacity-100"
                  />
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <span
                        className={`flex h-12 w-12 items-center justify-center rounded-2xl ${Accent}`}
                      >
                        <Icon className="h-5 w-5" />
                      </span>
                      <Badge variant={p.is_active ? "success" : "muted"} dot>
                        {p.is_active ? "Active" : "Archived"}
                      </Badge>
                    </div>
                    <CardTitle className="mt-4 truncate text-lg">{p.name}</CardTitle>
                    <CardDescription className="line-clamp-2">
                      {p.description || "No description"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex items-center justify-between">
                    <StatusIndicator status="neutral" size="sm">
                      Created {formatDate(p.created_at)}
                    </StatusIndicator>
                    <Button asChild size="sm" variant="ghost">
                      <Link href={`/projects/${p.id}`}>Open →</Link>
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

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
    </main>
  );
}
