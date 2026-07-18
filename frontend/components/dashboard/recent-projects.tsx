"use client";

import { BarChart3, Database, Plus } from "lucide-react";

import type { ProjectRead } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

const ACCENTS = [
  "bg-primary/10 text-primary",
  "bg-lavender/15 text-lavender-foreground",
  "bg-secondary/40 text-secondary-foreground",
];

const ICONS = [Database, BarChart3, Database];

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

export function RecentProjects({
  projects,
  datasetCounts,
  onCreate,
  onOpen,
}: {
  projects: ProjectRead[];
  datasetCounts: Record<number, number>;
  onCreate: () => void;
  onOpen: (id: number) => void;
}) {
  return (
    <section>
      <div className="mb-4">
        <h2 className="text-lg font-semibold tracking-tight">Recent Projects</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Pick up where you left off.
        </p>
      </div>

      {projects.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/50">
          <EmptyState
            variant="card"
            icon={<BarChart3 className="h-7 w-7" />}
            iconTone="primary"
            iconSize="lg"
            title="Your analytics workspace is ready."
            description="Create your first project to upload datasets, analyze data with AI, build dashboards, and generate executive reports."
            action={
              <Button size="lg" className="sheen" onClick={onCreate}>
                <Plus className="h-4 w-4" />
                Create Project
              </Button>
            }
          />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {projects.map((p, i) => {
            const Accent = ACCENTS[i % ACCENTS.length];
            const Icon = ICONS[i % ICONS.length];
            const count = datasetCounts[p.id] ?? 0;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onOpen(p.id)}
                aria-label={`Open ${p.name}`}
                className="card-hover group relative block w-full overflow-hidden rounded-2xl border border-border/70 bg-card p-5 text-left shadow-soft-sm animate-stagger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                style={{ ["--delay" as string]: `${i * 60}ms` } as React.CSSProperties}
              >
                <div
                  aria-hidden
                  className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-primary/5 blur-2xl transition-opacity duration-220 group-hover:opacity-100"
                />
                <div className="flex items-start justify-between gap-3">
                  <span
                    className={`flex h-11 w-11 items-center justify-center rounded-2xl ${Accent}`}
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <Badge variant={p.is_active ? "success" : "muted"} dot size="sm">
                    {p.is_active ? "Active" : "Archived"}
                  </Badge>
                </div>

                <h3 className="mt-4 truncate text-base font-semibold tracking-tight">
                  {p.name}
                </h3>
                <p className="mt-1 line-clamp-2 min-h-[2.25rem] text-sm text-muted-foreground">
                  {p.description || "No description"}
                </p>

                <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-border/60 pt-4 text-xs">
                  <div>
                    <dt className="text-muted-foreground">Datasets</dt>
                    <dd className="mt-0.5 font-semibold tabular-nums text-foreground">
                      {count}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Last opened</dt>
                    <dd className="mt-0.5 font-semibold text-foreground">Not yet</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Created</dt>
                    <dd className="mt-0.5 font-semibold tabular-nums text-foreground">
                      {formatDate(p.created_at)}
                    </dd>
                  </div>
                </dl>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
