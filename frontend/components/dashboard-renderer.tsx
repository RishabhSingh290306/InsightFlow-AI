"use client";

import {
  AlertTriangle,
  BarChart3,
  Database,
  Lightbulb,
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
    default:
      return <p className="text-sm text-muted-foreground">Unknown widget: {entry.widget.type}</p>;
  }
}

export function DashboardRenderer({ view }: { view: DashboardView }) {
  return (
    <div className="flex flex-col gap-4">
      {!view.ai_available && (
        <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
          Rule-based dashboard (AI suggestions unavailable).
        </div>
      )}
      {view.spec.ai_summary?.executive && (
        <p className="text-sm text-muted-foreground">{view.spec.ai_summary.executive}</p>
      )}
      {view.widgets.map((entry) => (
        <Card key={entry.widget.type}>
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
