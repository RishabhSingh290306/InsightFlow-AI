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
import { Badge } from "@/components/ui/badge";

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
        <div
          key={k.label}
          className="rounded-xl border border-border bg-card-muted/60 p-4 transition-all duration-160ms hover:border-primary/30 hover:shadow-soft-sm"
        >
          <div className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">
            {k.label}
          </div>
          <div className="mt-1.5 text-2xl font-semibold tracking-tight">{String(k.value)}</div>
          {k.hint && <div className="mt-0.5 text-2xs text-muted-foreground">{k.hint}</div>}
        </div>
      ))}
    </div>
  );
}

function DataQuality({ data }: { data: Record<string, unknown> }) {
  const issues = (data.issues as string[]) ?? [];
  return (
    <ul className="flex flex-col gap-1.5">
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
        <div key={c.id} className="rounded-xl border border-border bg-card-muted/60 p-4">
          <div className="mb-3 text-sm font-medium">{c.title}</div>
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
        <div key={q.id as number} className="rounded-xl border border-border bg-card-muted/60 p-4">
          <div className="text-sm font-medium">{String(q.business_question)}</div>
          <pre className="mt-2 overflow-x-auto rounded-lg bg-muted/60 p-3 font-mono text-xs">
            {String(q.sql)}
          </pre>
          {q.suggested_visualization ? (
            <div className="mt-3">
              <ChartRenderer spec={q.suggested_visualization as ChartSpec} />
            </div>
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
        <div
          key={k.label}
          className="rounded-xl border border-border bg-card-muted/60 p-4 transition-all duration-160ms hover:border-primary/30 hover:shadow-soft-sm"
        >
          <div className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">
            {k.label}
          </div>
          <div className="mt-1.5 text-2xl font-semibold tracking-tight">{String(k.value)}</div>
          {k.hint && <div className="mt-0.5 text-2xs text-muted-foreground">{k.hint}</div>}
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
        <div key={d.id as number} className="rounded-xl border border-border bg-card-muted/60 p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="truncate text-sm font-medium" title={String(d.filename)}>
              {String(d.filename)}
            </div>
            <Badge variant="muted" className="capitalize">
              {String(d.status)}
            </Badge>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span>{String(d.row_count)} rows</span>
            <span>· {String(d.column_count)} cols</span>
            <span>· v{String(d.version)}</span>
          </div>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {d.has_profile ? (
              <Badge variant="success">profiled</Badge>
            ) : (
              <Badge variant="warning">unprofiled</Badge>
            )}
            {Boolean(d.has_understanding) && <Badge variant="lavender">understood</Badge>}
            {Boolean(d.has_eda) && <Badge variant="default">EDA</Badge>}
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
        <li
          key={r.id as number}
          className="flex items-center gap-3 rounded-xl border border-border bg-card-muted/60 p-3 text-sm transition-colors duration-160ms hover:border-primary/30"
        >
          <FileText className="h-4 w-4 shrink-0 text-primary" />
          <span className="truncate font-medium" title={String(r.title)}>
            {String(r.title)}
          </span>
          <span className="ml-auto shrink-0 text-2xs text-muted-foreground">
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
  const variant: Record<string, "secondary" | "lavender" | "success"> = {
    upload: "secondary",
    sql: "lavender",
    report: "success",
  };
  return (
    <ul className="flex flex-col gap-2">
      {activities.map((a, i) => (
        <li key={i} className="flex items-center gap-2 text-sm">
          <Badge variant={variant[String(a.kind)] ?? "muted"} className="uppercase">
            {String(a.kind)}
          </Badge>
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
          <Badge variant="muted" className="capitalize">
            {String(v.origin)}
          </Badge>
          <span className="text-muted-foreground">
            {String(v.row_count)} rows · {String(v.status)}
          </span>
          {Boolean(v.is_current) && <Badge variant="default">current</Badge>}
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
          <ArrowRightCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <span>
            {String(s.text)}
            {s.kind != null && s.kind !== "" && (
              <Badge variant="muted" className="ml-2">
                {String(s.kind)}
              </Badge>
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
    <div className="flex flex-col gap-5">
      {!view.ai_available && (
        <div className="rounded-xl border border-dashed border-border bg-card-muted/40 p-3 text-sm text-muted-foreground">
          Rule-based dashboard (suggestions unavailable).
        </div>
      )}
      {view.spec.ai_summary?.executive && (
        <p className="text-sm text-muted-foreground">{view.spec.ai_summary.executive}</p>
      )}
      {view.widgets
        .filter((entry) => !entry.is_hidden)
        .map((entry) => (
          <Card key={entry.widget.type} className="card-hover border bg-card shadow-soft-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <IconFor type={entry.widget.type} />
                </span>
                {entry.widget.title}
              </CardTitle>
              <CardDescription>{entry.widget.description}</CardDescription>
            </CardHeader>
            <CardContent>{<WidgetBody entry={entry} />}</CardContent>
          </Card>
        ))}
    </div>
  );
}
