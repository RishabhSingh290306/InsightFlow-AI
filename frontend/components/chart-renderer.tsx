"use client";

import dynamic from "next/dynamic";
import type { ChartSpec } from "@/lib/types";
import { CHART_ACCENT } from "@/components/chart-renderer-inner";

// recharts is heavy and only needed for actual charts; load it on demand so the
// initial bundle (and pages that show no charts) stay lean.
const ChartRendererInner = dynamic(
  () => import("@/components/chart-renderer-inner").then((m) => m.ChartRendererInner),
  {
    ssr: false,
    loading: () => <div className="h-[220px] w-full animate-pulse rounded-lg bg-card-muted/40" />,
  },
);

type Box = { label: string; min: number; q1: number; median: number; q3: number; max: number };

function BoxPlot({ data }: { data: Record<string, unknown>[] }) {
  const rows = data as Box[];
  return (
    <div className="flex flex-col gap-2">
      {rows.map((r, i) => {
        const lo = r.min;
        const hi = r.max;
        const span = hi - lo || 1;
        const y = (v: number) => 40 - ((v - lo) / span) * 40;
        return (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span className="w-24 truncate text-muted-foreground">{r.label}</span>
            <svg viewBox="0 0 100 40" className="h-10 flex-1" preserveAspectRatio="none">
              <line x1={50} y1={y(r.min)} x2={50} y2={y(r.max)} stroke={CHART_ACCENT} />
              <line x1={0} y1={y(r.min)} x2={100} y2={y(r.min)} stroke={CHART_ACCENT} />
              <line x1={0} y1={y(r.max)} x2={100} y2={y(r.max)} stroke={CHART_ACCENT} />
              <rect
                x={0}
                y={y(r.q3)}
                width={100}
                height={Math.max(1, y(r.q1) - y(r.q3))}
                fill={CHART_ACCENT}
                fillOpacity={0.3}
                stroke={CHART_ACCENT}
              />
              <line x1={0} y1={y(r.median)} x2={100} y2={y(r.median)} stroke={CHART_ACCENT} strokeWidth={2} />
            </svg>
          </div>
        );
      })}
    </div>
  );
}

function Heatmap({ data, columns }: { data: Record<string, unknown>[]; columns: string[] }) {
  const cells = data as { x: string; y: string; value: number }[];
  const max = Math.max(1, ...cells.map((c) => Math.abs(Number(c.value))));
  return (
    <div className="flex flex-col gap-1 text-xs">
      {columns.map((y) => (
        <div key={y} className="flex items-center gap-1">
          <span className="w-20 truncate text-muted-foreground">{y}</span>
          {columns.map((x) => {
            const cell = cells.find((c) => c.x === x && c.y === y);
            const v = cell ? Number(cell.value) : 0;
            const op = 0.15 + 0.85 * (Math.abs(v) / max);
            return (
              <div
                key={x}
                title={`${x} ~ ${y}: ${v}`}
                className="h-5 w-5 rounded-sm"
                style={{ background: v >= 0 ? `rgba(34,197,94,${op})` : `rgba(239,68,68,${op})` }}
              />
            );
          })}
        </div>
      ))}
      <div className="flex items-center gap-1 pl-20">
        {columns.map((x) => (
          <span key={x} className="h-5 w-5 truncate text-center text-[9px] text-muted-foreground">
            {x}
          </span>
        ))}
      </div>
    </div>
  );
}

function normalizeType(spec: ChartSpec): string {
  return typeof spec.chart_type === "string"
    ? spec.chart_type.toLowerCase().replace(/\s*chart$/, "").trim()
    : String(spec.chart_type);
}

export function ChartRenderer({ spec }: { spec: ChartSpec }) {
  const chartType = normalizeType(spec);
  // Lightweight SVG charts don't need recharts — render directly.
  if (chartType === "box") return <BoxPlot data={spec.data} />;
  if (chartType === "heatmap") {
    return <Heatmap data={spec.data} columns={(spec.metadata.columns as string[]) ?? []} />;
  }
  return <ChartRendererInner spec={spec} />;
}
