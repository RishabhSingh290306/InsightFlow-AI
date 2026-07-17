"use client";

import {
  Activity,
  AlertTriangle,
  ArrowRightCircle,
  BarChart3,
  Database,
  FileText,
  GitBranch,
  Layers,
  LayoutDashboard,
  Lightbulb,
  ListChecks,
  MessageSquare,
  Sparkles,
} from "lucide-react";

import type { CatalogEntry, ChartSpec, DashboardView } from "@/lib/types";
import { ChartRenderer } from "@/components/chart-renderer";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

function IconFor({ type }: { type: string }) {
  const map: Record<string, typeof Sparkles> = {
    kpi_cards: Database,
    data_quality: AlertTriangle,
    recommended_charts: BarChart3,
    ai_insights: Lightbulb,
    sql_widget: MessageSquare,
    version_timeline: GitBranch,
    project_kpis: LayoutDashboard,
    dataset_summaries: Layers,
    recent_reports: FileText,
    activity_feed: Activity,
    recommended_next: ListChecks,
  };
  const I = map[type] ?? Sparkles;
  return <I className="h-4 w-4" />;
}

function KpiCards({ data }: { data: Record<string, unknown> }) {
  const kpis = (data.kpis as { label: string; value: unknown; hint?: string }[]) ?? [];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {kpis.map((k) => (
        <div key={k.label} className="rounded-md border p-3">
          <div className="text-xs text-muted-foreground">{k.label}</div>
          <div className="text-xl font-semibold">{String(k.value)}</div>
          {k.hint && <div className="text-[10px] text-muted-foreground">{k.hint}</div>}
        </div>
      ))}
    </div>
  );
}

function DataQuality({ data }: { data: Record<string, unknown> }) {
  const issues = (data.issues as string[]) ?? [];
  return (
    <ul className="flex flex-col gap-1">
      {issues.map((i, idx) => (
        <li key={idx} className="flex items-start gap-2 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{i}</span>
        </li>
      ))}
    </ul>
  );
}

function RecommendedCharts({ data }: { data: Record<string, unknown> }) {
  const charts = (data.charts as ChartSpec[]) ?? [];
  if (charts.length === 0) return <p className="text-sm text-muted-foreground">No accepted charts yet.</p>;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {charts.map((c) => (
        <div key={c.id} className="rounded-md border p-3">
          <div className="mb-2 text-sm font-medium">{c.title}</div>
          <ChartRenderer spec={c} />
        </div>
      ))}
    </div>
  );
}

function AiInsights({ data }: { data: Record<string, unknown> }) {
  const obs = (data.observations as string[]) ?? [];
  return (
    <div className="flex flex-col gap-2 text-sm">
      {data.dataset_description ? <p>{String(data.dataset_description)}</p> : null}
      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
        {data.domain ? <span>Domain: {String(data.domain)}</span> : null}
        {data.use_case ? <span>· Use case: {String(data.use_case)}</span> : null}
      </div>
      {obs.length > 0 && (
        <ul className="flex flex-col gap-1">
          {obs.map((o, i) => (
            <li key={i}>• {o}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SqlWidgetView({ data }: { data: Record<string, unknown> }) {
  const queries = (data.queries as Record<string, unknown>[]) ?? [];
  if (queries.length === 0) return <p className="text-sm text-muted-foreground">No SQL analysis yet.</p>;
  return (
    <div className="flex flex-col gap-3">
      {queries.map((q) => (
        <div key={q.id as number} className="rounded-md border p-3">
          <div className="text-sm font-medium">{String(q.business_question)}</div>
          <pre className="mt-1 overflow-x-auto rounded bg-muted p-2 text-xs">{String(q.sql)}</pre>
          {q.suggested_visualization ? (
            <ChartRenderer spec={q.suggested_visualization as ChartSpec} />
          ) : null}
        </div>
      ))}
    </div>
  );
}

function ProjectKpis({ data }: { data: Record<string, unknown> }) {
  const kpis = (data.kpis as { label: string; value: unknown; hint?: string }[]) ?? [];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {kpis.map((k) => (
        <div key={k.label} className="rounded-md border p-3">
          <div className="text-xs text-muted-foreground">{k.label}</div>
          <div className="text-xl font-semibold">{String(k.value)}</div>
          {k.hint && <div className="text-[10px] text-muted-foreground">{k.hint}</div>}
        </div>
      ))}
    </div>
  );
}

function DatasetSummaries({ data }: { data: Record<string, unknown> }) {
  const datasets = (data.datasets as Record<string, unknown>[]) ?? [];
  if (datasets.length === 0) return <p className="text-sm text-muted-foreground">No datasets yet.</p>;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {datasets.map((d) => (
        <div key={d.id as number} className="rounded-md border p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="truncate text-sm font-medium" title={String(d.filename)}>
              {String(d.filename)}
            </div>
            <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {String(d.status)}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span>{String(d.row_count)} rows</span>
            <span>· {String(d.column_count)} cols</span>
            <span>· v{String(d.version)}</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1 text-[10px]">
            {d.has_profile ? (
              <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-emerald-700 dark:text-emerald-400">profiled</span>
            ) : (
              <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-amber-700 dark:text-amber-400">unprofiled</span>
            )}
            {Boolean(d.has_understanding) && (
              <span className="rounded bg-sky-500/15 px-1.5 py-0.5 text-sky-700 dark:text-sky-400">understood</span>
            )}
            {Boolean(d.has_eda) && (
              <span className="rounded bg-violet-500/15 px-1.5 py-0.5 text-violet-700 dark:text-violet-400">EDA</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function RecentReports({ data }: { data: Record<string, unknown> }) {
  const reports = (data.reports as Record<string, unknown>[]) ?? [];
  if (reports.length === 0) return <p className="text-sm text-muted-foreground">No reports yet.</p>;
  return (
    <ul className="flex flex-col gap-2">
      {reports.map((r) => (
        <li key={r.id as number} className="flex items-center gap-2 rounded-md border p-3 text-sm">
          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="truncate font-medium" title={String(r.title)}>
            {String(r.title)}
          </span>
          <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
            {String(r.scope)} · {String(r.section_count)} sections
          </span>
        </li>
      ))}
    </ul>
  );
}

function ActivityFeed({ data }: { data: Record<string, unknown> }) {
  const activities = (data.activities as Record<string, unknown>[]) ?? [];
  if (activities.length === 0) return <p className="text-sm text-muted-foreground">No activity yet.</p>;
  const badge: Record<string, string> = {
    upload: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
    sql: "bg-violet-500/15 text-violet-700 dark:text-violet-400",
    report: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  };
  return (
    <ul className="flex flex-col gap-2">
      {activities.map((a, i) => (
        <li key={i} className="flex items-center gap-2 text-sm">
          <span
            className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] uppercase ${
              badge[String(a.kind)] ?? "bg-muted text-muted-foreground"
            }`}
          >
            {String(a.kind)}
          </span>
          <span>{String(a.text)}</span>
        </li>
      ))}
    </ul>
  );
}

function VersionTimeline({ data }: { data: Record<string, unknown> }) {
  const versions = (data.versions as Record<string, unknown>[]) ?? [];
  if (versions.length === 0) return <p className="text-sm text-muted-foreground">No version history.</p>;
  return (
    <ol className="flex flex-col gap-2">
      {versions.map((v) => (
        <li key={v.version as number} className="flex items-center gap-2 text-sm">
          <GitBranch className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="font-mono text-xs">v{String(v.version)}</span>
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
            {String(v.origin)}
          </span>
          <span className="text-muted-foreground">
            {String(v.row_count)} rows · {String(v.status)}
          </span>
          {Boolean(v.is_current) && (
            <span className="ml-auto shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
              current
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}

function RecommendedNext({ data }: { data: Record<string, unknown> }) {
  const suggestions = (data.suggestions as Record<string, unknown>[]) ?? [];
  if (suggestions.length === 0)
    return <p className="text-sm text-muted-foreground">Nothing outstanding — this looks complete.</p>;
  return (
    <ul className="flex flex-col gap-1">
      {suggestions.map((s, i) => (
        <li key={i} className="flex items-start gap-2 text-sm">
          <ArrowRightCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <span>
            {String(s.text)}
            {s.kind != null && s.kind !== "" && (
              <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                {String(s.kind)}
              </span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

function WidgetBody({ entry }: { entry: CatalogEntry }) {
  switch (entry.widget.type) {
    case "kpi_cards":
      return <KpiCards data={entry.data} />;
    case "data_quality":
      return <DataQuality data={entry.data} />;
    case "recommended_charts":
      return <RecommendedCharts data={entry.data} />;
    case "ai_insights":
      return <AiInsights data={entry.data} />;
    case "sql_widget":
      return <SqlWidgetView data={entry.data} />;
    case "project_kpis":
      return <ProjectKpis data={entry.data} />;
    case "dataset_summaries":
      return <DatasetSummaries data={entry.data} />;
    case "recent_reports":
      return <RecentReports data={entry.data} />;
    case "activity_feed":
      return <ActivityFeed data={entry.data} />;
    case "version_timeline":
      return <VersionTimeline data={entry.data} />;
    case "recommended_next":
      return <RecommendedNext data={entry.data} />;
    default:
      return <p className="text-sm text-muted-foreground">Unknown widget: {entry.widget.type}</p>;
  }
}

export function DashboardRenderer({ view }: { view: DashboardView }) {
  return (
    <div className="flex flex-col gap-4">
      {!view.ai_available && (
        <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
          Rule-based dashboard (suggestions unavailable).
        </div>
      )}
      {view.spec.ai_summary?.executive && (
        <p className="text-sm text-muted-foreground">{view.spec.ai_summary.executive}</p>
      )}
      {view.widgets
        .filter((entry) => !entry.is_hidden)
        .map((entry) => (
          <Card key={entry.widget.type} className="card-hover">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <IconFor type={entry.widget.type} />
                {entry.widget.title}
              </CardTitle>
              <CardDescription>{entry.widget.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <WidgetBody entry={entry} />
            </CardContent>
          </Card>
        ))}
    </div>
  );
}
