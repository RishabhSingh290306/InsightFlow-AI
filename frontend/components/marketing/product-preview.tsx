import {
  BarChart3,
  Database,
  MessageSquareText,
  Sparkles,
  Table2,
  TrendingUp,
} from "lucide-react";

import { AnimatedSparkline } from "@/components/marketing/animated-sparkline";
import { CountUp } from "@/components/marketing/count-up";
import { Parallax } from "@/components/marketing/parallax";
import { Tilt } from "@/components/marketing/tilt";

/**
 * Product preview shown beneath the hero — a calm, elegant mock of the
 * InsightFlow workspace. Pure CSS/SVG so it renders server-side with no JS.
 * Subtle, GPU-only motion (drifting floats, a one-time bar rise, a shimmer
 * sweep, a pulsing live dot, a draw-in sparkline, parallax, and a gentle tilt)
 * gives it life without distraction.
 */
export function ProductPreview() {
  const bars = [42, 64, 38, 78, 54, 88, 62, 96, 72];
  const spark = [12, 18, 14, 26, 22, 34, 30, 44, 38, 52, 48, 64];

  const KPIS = [
    { label: "Rows analyzed", value: 1.2, decimals: 1, suffix: "M", delta: "+12%" },
    { label: "Queries run", value: 348, delta: "+8%" },
    { label: "Reports shared", value: 27, delta: "+4%" },
  ];

  return (
    <div className="relative mx-auto w-full max-w-5xl">
      {/* Ambient glow behind the preview — slow, calm drift */}
      <div
        aria-hidden
        className="absolute -inset-x-10 -top-10 bottom-0 -z-10 animate-mesh-drift rounded-[2.5rem] gradient-mesh opacity-70 blur-2xl"
      />

      {/* Decorative floating cards — hidden on small screens to protect space */}
      <Parallax
        className="absolute -right-4 -top-6 z-20 hidden sm:block"
        strength={14}
      >
        <div className="float-card rounded-2xl border border-border/70 bg-card/90 px-3.5 py-2.5 shadow-soft-lg backdrop-blur-sm animate-float [animation-delay:-2s]">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Sparkles className="h-4 w-4" />
            </span>
            <div className="leading-tight">
              <p className="text-xs font-semibold">Insight found</p>
              <p className="text-2xs text-muted-foreground">Revenue up 18% QoQ</p>
            </div>
          </div>
        </div>
      </Parallax>

      <Parallax
        className="absolute -left-5 bottom-10 z-20 hidden lg:block"
        strength={-18}
      >
        <div className="float-card rounded-2xl border border-border/70 bg-card/90 px-3.5 py-2.5 shadow-soft-lg backdrop-blur-sm animate-float-slow">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-lavender/15 text-lavender-foreground">
              <Table2 className="h-4 w-4" />
            </span>
            <div className="leading-tight">
              <p className="text-xs font-semibold">SQL ready</p>
              <p className="text-2xs text-muted-foreground">Reviewed by you</p>
            </div>
          </div>
        </div>
      </Parallax>

      <Parallax
        className="absolute -right-10 bottom-6 z-20 hidden xl:block"
        strength={10}
      >
        <div className="float-card rounded-2xl border border-border/70 bg-card/90 px-3.5 py-2.5 shadow-soft-lg backdrop-blur-sm animate-float-soft [animation-delay:-5s]">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-success/15 text-success">
              <TrendingUp className="h-4 w-4" />
            </span>
            <div className="leading-tight">
              <p className="text-xs font-semibold">Anomaly caught</p>
              <p className="text-2xs text-muted-foreground">2 outliers flagged</p>
            </div>
          </div>
        </div>
      </Parallax>

      <Tilt className="rounded-3xl">
        <div className="glow-accent overflow-hidden rounded-3xl border border-border bg-card shadow-soft-xl">
          {/* Window chrome */}
          <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-5 py-3.5">
            <span className="h-3 w-3 rounded-full bg-destructive/40" />
            <span className="h-3 w-3 rounded-full bg-warning/40" />
            <span className="h-3 w-3 rounded-full bg-success/40" />
            <div className="ml-3 flex h-6 flex-1 items-center rounded-md bg-background px-3 text-2xs text-muted-foreground">
              insightflow.ai/workspace/q3-sales
            </div>
          </div>

          <div className="grid grid-cols-[200px_1fr] max-sm:grid-cols-1">
            {/* Sidebar */}
            <aside className="hidden flex-col gap-1 border-r border-border bg-muted/20 p-4 sm:flex">
              <div className="mb-3 flex items-center gap-2 px-2 text-sm font-semibold">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <Sparkles className="h-4 w-4" />
                </span>
                InsightFlow
              </div>
              {[
                { icon: Database, label: "Datasets", active: true },
                { icon: Table2, label: "SQL Workspace" },
                { icon: BarChart3, label: "Dashboards" },
                { icon: MessageSquareText, label: "Assistant" },
                { icon: TrendingUp, label: "Reports" },
              ].map(({ icon: Icon, label, active }) => (
                <div
                  key={label}
                  className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm ${
                    active
                      ? "bg-primary/10 font-medium text-primary"
                      : "text-muted-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </div>
              ))}
            </aside>

            {/* Content */}
            <div className="flex flex-col gap-5 p-5">
              {/* KPI tiles */}
              <div className="grid grid-cols-3 gap-3">
                {KPIS.map((kpi) => (
                  <div
                    key={kpi.label}
                    className="rounded-xl border border-border bg-background p-3.5 transition-shadow duration-220 hover:shadow-soft-md"
                  >
                    <p className="text-2xs uppercase tracking-wider text-muted-foreground">
                      {kpi.label}
                    </p>
                    <p className="mt-1 text-xl font-semibold tracking-tight">
                      <CountUp
                        value={kpi.value}
                        decimals={kpi.decimals ?? 0}
                        suffix={kpi.suffix ?? ""}
                      />
                    </p>
                    <p className="text-2xs font-medium text-success">
                      {kpi.delta} this week
                    </p>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-[1.4fr_1fr] gap-3 max-sm:grid-cols-1">
                {/* Bar chart mock */}
                <div className="relative overflow-hidden rounded-xl border border-border bg-background p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-sm font-medium">Revenue by region</p>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2 py-0.5 text-2xs font-medium text-primary">
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/60" />
                        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
                      </span>
                      Live
                    </span>
                  </div>
                  <div className="flex h-32 items-end gap-1.5">
                    {bars.map((h, i) => (
                      <div
                        key={i}
                        className="flex-1 origin-bottom rounded-t-md bg-gradient-to-t from-primary/70 to-primary animate-bars-rise"
                        style={{
                          height: `${h}%`,
                          transformOrigin: "bottom",
                          animationDelay: `${i * 60}ms`,
                        }}
                      />
                    ))}
                  </div>
                  {/* Soft shimmer sweep */}
                  <div
                    aria-hidden
                    className="shimmer pointer-events-none absolute inset-0 rounded-xl opacity-60"
                  />
                </div>

                {/* Sparkline mock */}
                <div className="rounded-xl border border-border bg-background p-4">
                  <p className="mb-3 text-sm font-medium">Growth trend</p>
                  <AnimatedSparkline points={spark} />
                </div>
              </div>

              {/* Dataset row mock */}
              <div className="rounded-xl border border-border bg-background p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                  <Database className="h-4 w-4 text-primary" />
                  Recent datasets
                </div>
                <div className="space-y-2">
                  {[
                    { name: "Q3_sales.csv", rows: "48,210", status: "Ready" },
                    { name: "users_export.xlsx", rows: "12,904", status: "Cleaning" },
                    { name: "campaigns.csv", rows: "8,331", status: "Ready" },
                  ].map((d) => (
                    <div
                      key={d.name}
                      className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2 text-sm"
                    >
                      <span className="font-medium">{d.name}</span>
                      <span className="text-2xs text-muted-foreground">
                        {d.rows} rows
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-2xs font-medium ${
                          d.status === "Ready"
                            ? "bg-success/10 text-success"
                            : "bg-warning/10 text-warning"
                        }`}
                      >
                        {d.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </Tilt>
    </div>
  );
}
