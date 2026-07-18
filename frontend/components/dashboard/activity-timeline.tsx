"use client";

import {
  Database,
  FileText,
  FolderKanban,
  LayoutDashboard,
  type LucideIcon,
} from "lucide-react";

export type ActivityType = "dataset" | "dashboard" | "report" | "project";

export interface ActivityItem {
  key: string;
  type: ActivityType;
  label: string;
  time: string;
}

const META: Record<
  ActivityType,
  { icon: LucideIcon; tint: string }
> = {
  dataset: { icon: Database, tint: "bg-primary/10 text-primary" },
  dashboard: { icon: LayoutDashboard, tint: "bg-lavender/15 text-lavender-foreground" },
  report: { icon: FileText, tint: "bg-success/15 text-success" },
  project: { icon: FolderKanban, tint: "bg-secondary/40 text-secondary-foreground" },
};

export function timeAgo(iso: string) {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.round(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function ActivityTimeline({ activities }: { activities: ActivityItem[] }) {
  return (
    <section>
      <div className="mb-4">
        <h2 className="text-lg font-semibold tracking-tight">Recent Activity</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          What&apos;s been happening in your workspace.
        </p>
      </div>

      {activities.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/50 px-6 py-10 text-center">
          <p className="text-sm font-medium text-muted-foreground">No activity yet.</p>
          <p className="mt-1 text-xs text-muted-foreground/80">
            Upload a dataset or run an analysis to get started.
          </p>
        </div>
      ) : (
        <ol className="relative space-y-1">
          {activities.map((item, i) => {
            const { icon: Icon, tint } = META[item.type];
            const last = i === activities.length - 1;
            return (
              <li
                key={item.key}
                className="relative flex gap-3 pb-4 animate-stagger"
                style={{ ["--delay" as string]: `${i * 60}ms` } as React.CSSProperties}
              >
                {/* Connector */}
                {!last && (
                  <span
                    aria-hidden
                    className="absolute left-[18px] top-9 h-[calc(100%-1rem)] w-px bg-border/70"
                  />
                )}
                <span
                  className={`relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${tint}`}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1 pt-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {item.label}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {timeAgo(item.time)}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
