"use client";

import { Database, FileText, FolderKanban, Sparkles, type LucideIcon } from "lucide-react";

import { CountUp } from "@/components/marketing/count-up";

export interface DashboardStats {
  projects: number;
  datasets: number;
  analyses: number;
  reports: number;
}

const STAT_DEFS: {
  key: keyof DashboardStats;
  label: string;
  icon: LucideIcon;
  tint: string;
}[] = [
  { key: "projects", label: "Projects", icon: FolderKanban, tint: "bg-primary/10 text-primary" },
  { key: "datasets", label: "Datasets", icon: Database, tint: "bg-lavender/15 text-lavender-foreground" },
  { key: "analyses", label: "Analyses", icon: Sparkles, tint: "bg-secondary/40 text-secondary-foreground" },
  { key: "reports", label: "Reports Generated", icon: FileText, tint: "bg-success/15 text-success" },
];

export function StatsCards({ stats }: { stats: DashboardStats }) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {STAT_DEFS.map((def, i) => {
        const Icon = def.icon;
        return (
          <div
            key={def.key}
            className="card-hover group relative overflow-hidden rounded-2xl border border-border/70 bg-card p-5 shadow-soft-sm animate-stagger"
            style={{ ["--delay" as string]: `${i * 70}ms` } as React.CSSProperties}
          >
            <div
              aria-hidden
              className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-primary/5 blur-2xl transition-opacity duration-220 group-hover:opacity-100"
            />
            <span
              className={`flex h-10 w-10 items-center justify-center rounded-xl ${def.tint}`}
            >
              <Icon className="h-5 w-5" />
            </span>
            <p className="mt-4 text-3xl font-bold tracking-tight tabular-nums">
              <CountUp value={stats[def.key]} />
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{def.label}</p>
          </div>
        );
      })}
    </div>
  );
}
