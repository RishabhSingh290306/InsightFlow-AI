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

export const CHART_ACCENT = "hsl(var(--primary))";
export const CHART_PALETTE = [
  "hsl(var(--primary))",
  "hsl(0 72% 51%)",
  "hsl(142 71% 45%)",
  "hsl(38 92% 50%)",
  "hsl(280 65% 60%)",
  "hsl(199 89% 48%)",
];

// recharts-backed chart types. Kept separate and lazy-loaded (next/dynamic) so
// the heavy recharts bundle is only fetched when a chart is actually rendered.
export function ChartRendererInner({ spec }: { spec: ChartSpec }) {
  const color = CHART_ACCENT;
  const chartType =
    typeof spec.chart_type === "string"
      ? spec.chart_type.toLowerCase().replace(/\s*chart$/, "").trim()
      : spec.chart_type;
  switch (chartType) {
    case "histogram":
    case "bar":
      return (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={spec.data as Record<string, unknown>[]}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey={chartType === "histogram" ? "bin" : "category"} />
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
                <Cell key={i} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />
              ))}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      );
    default:
      return <p className="text-sm text-muted-foreground">Unsupported chart type: {spec.chart_type}</p>;
  }
}
