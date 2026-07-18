"use client";

import { BarChart3, Database, Plus, Trash2 } from "lucide-react";

import type { ProjectRead } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { timeAgo } from "@/components/dashboard/activity-timeline";

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
  lastOpened = {},
  onCreate,
  onOpen,
  onRequestDelete,
}: {
  projects: ProjectRead[];
  datasetCounts: Record<number, number>;
  lastOpened?: Record<number, number>;
  onCreate: () => void;
  onOpen: (id: number) => void;
  onRequestDelete: (project: ProjectRead) => void;
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
              <div
                key={p.id}
                role="button"
                tabIndex={0}
                onClick={() => onOpen(p.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onOpen(p.id);
                  }
                }}
                aria-label={`Open ${p.name}`}
                className="card-hover group relative block w-full overflow-hidden rounded-2xl border border-border/70 bg-card p-5 text-left shadow-soft-sm animate-stagger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                style={{ ["--delay" as string]: `${i * 60}ms` } as React.CSSProperties}
              >
                {/* Gradient wash + hairline for a styled, non-flat surface */}
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/[0.05] to-transparent"
                />
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/25 to-transparent"
                />
                <div
                  aria-hidden
                  className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-primary/5 blur-2xl transition-opacity duration-220 group-hover:opacity-100"
                />

                {/* Delete */}
                <button
                  type="button"
                  aria-label={`Delete ${p.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onRequestDelete(p);
                  }}
                  className="absolute right-3 top-3 z-20 flex h-8 w-8 items-center justify-center rounded-lg text-destructive/70 transition-colors duration-160 hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Trash2 className="h-4 w-4" />
                </button>

                <div className="relative">
                  <div className="flex items-start gap-3">
                    <span
                      className={`flex h-11 w-11 items-center justify-center rounded-2xl ${Accent}`}
                    >
                      <Icon className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 pr-9">
                        <h3 className="truncate text-base font-semibold tracking-tight">
                          {p.name}
                        </h3>
                        <Badge variant={p.is_active ? "success" : "muted"} dot size="sm">
                          {p.is_active ? "Active" : "Archived"}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  <p className="mt-3 line-clamp-2 min-h-[2.25rem] text-sm text-muted-foreground">
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
                      <dd className="mt-0.5 font-semibold text-foreground">
                        {lastOpened[p.id]
                          ? timeAgo(new Date(lastOpened[p.id]).toISOString())
                          : "Not yet"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Created</dt>
                      <dd className="mt-0.5 font-semibold tabular-nums text-foreground">
                        {formatDate(p.created_at)}
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
