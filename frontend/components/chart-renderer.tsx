"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ChartSpec } from "@/lib/types";

const ACCENT = "hsl(var(--primary))";
const PALETTE = [
  "hsl(var(--primary))",
  "hsl(0 72% 51%)",
  "hsl(142 71% 45%)",
  "hsl(38 92% 50%)",
  "hsl(280 65% 60%)",
  "hsl(199 89% 48%)",
];

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
              <line x1={50} y1={y(r.min)} x2={50} y2={y(r.max)} stroke={ACCENT} />
              <line x1={0} y1={y(r.min)} x2={100} y2={y(r.min)} stroke={ACCENT} />
              <line x1={0} y1={y(r.max)} x2={100} y2={y(r.max)} stroke={ACCENT} />
              <rect
                x={0}
                y={y(r.q3)}
                width={100}
                height={Math.max(1, y(r.q1) - y(r.q3))}
                fill={ACCENT}
                fillOpacity={0.3}
                stroke={ACCENT}
              />
              <line x1={0} y1={y(r.median)} x2={100} y2={y(r.median)} stroke={ACCENT} strokeWidth={2} />
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

export function ChartRenderer({ spec }: { spec: ChartSpec }) {
  const color = ACCENT;
  switch (spec.chart_type) {
    case "histogram":
    case "bar":
      return (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={spec.data as Record<string, unknown>[]}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey={spec.chart_type === "histogram" ? "bin" : "category"} />
            <YAxis />
            <Tooltip />
            <Bar dataKey="count" fill={color} />
          </BarChart>
        </ResponsiveContainer>
      );
    case "line":
      return (
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={spec.data as Record<string, unknown>[]}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="x" />
            <YAxis />
            <Tooltip />
            <Line dataKey="y" stroke={color} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      );
    case "scatter":
      return (
        <ResponsiveContainer width="100%" height={220}>
          <ScatterChart>
            <CartesianGrid />
            <XAxis dataKey="x" type="number" />
            <YAxis dataKey="y" type="number" />
            <Tooltip />
            <Scatter data={spec.data as Record<string, unknown>[]} fill={color} />
          </ScatterChart>
        </ResponsiveContainer>
      );
    case "pie":
      return (
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie
              data={spec.data as Record<string, unknown>[]}
              dataKey="value"
              nameKey="category"
              outerRadius={80}
              label
            >
              {(spec.data as Record<string, unknown>[]).map((_, i) => (
                <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
              ))}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      );
    case "box":
      return <BoxPlot data={spec.data} />;
    case "heatmap":
      return (
        <Heatmap
          data={spec.data}
          columns={(spec.metadata.columns as string[]) ?? []}
        />
      );
    default:
      return <p className="text-sm text-muted-foreground">Unsupported chart type: {spec.chart_type}</p>;
  }
}
