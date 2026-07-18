import { BarChart3, Database, MessageSquareText, Sparkles, Table2, TrendingUp } from "lucide-react";

/**
 * Product preview shown beneath the hero — a calm, static-but-elegant mock of
 * the InsightFlow workspace. Pure CSS/SVG so it renders server-side with no JS.
 */
export function ProductPreview() {
  const bars = [42, 64, 38, 78, 54, 88, 62, 96, 72];
  const spark = [12, 18, 14, 26, 22, 34, 30, 44, 38, 52, 48, 64];

  return (
    <div className="relative mx-auto w-full max-w-5xl">
      {/* Ambient glow behind the preview */}
      <div
        aria-hidden
        className="absolute -inset-x-10 -top-10 bottom-0 -z-10 rounded-[2.5rem] gradient-mesh opacity-70 blur-2xl"
      />

      <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-soft-xl">
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
              {[
                { label: "Rows analyzed", value: "1.2M", delta: "+12%" },
                { label: "Queries run", value: "348", delta: "+8%" },
                { label: "Reports shared", value: "27", delta: "+4%" },
              ].map((kpi) => (
                <div
                  key={kpi.label}
                  className="rounded-xl border border-border bg-background p-3.5"
                >
                  <p className="text-2xs uppercase tracking-wider text-muted-foreground">
                    {kpi.label}
                  </p>
                  <p className="mt-1 text-xl font-semibold tracking-tight">{kpi.value}</p>
                  <p className="text-2xs font-medium text-success">{kpi.delta} this week</p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-[1.4fr_1fr] gap-3 max-sm:grid-cols-1">
              {/* Bar chart mock */}
              <div className="rounded-xl border border-border bg-background p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-medium">Revenue by region</p>
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-2xs font-medium text-primary">
                    Live
                  </span>
                </div>
                <div className="flex h-32 items-end gap-1.5">
                  {bars.map((h, i) => (
                    <div
                      key={i}
                      className="flex-1 rounded-t-md bg-primary/70 transition-all duration-450 ease-out-expo"
                      style={{ height: `${h}%` }}
                    />
                  ))}
                </div>
              </div>

              {/* Sparkline mock */}
              <div className="rounded-xl border border-border bg-background p-4">
                <p className="mb-3 text-sm font-medium">Growth trend</p>
                <svg viewBox="0 0 120 60" className="h-28 w-full" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="spark" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--lavender))" stopOpacity="0.35" />
                      <stop offset="100%" stopColor="hsl(var(--lavender))" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <polyline
                    points={spark.map((v, i) => `${(i / (spark.length - 1)) * 120},${60 - v}`).join(" ")}
                    fill="none"
                    stroke="hsl(var(--lavender))"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <polygon
                    points={`0,60 ${spark.map((v, i) => `${(i / (spark.length - 1)) * 120},${60 - v}`).join(" ")} 120,60`}
                    fill="url(#spark)"
                  />
                </svg>
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
                    <span className="text-2xs text-muted-foreground">{d.rows} rows</span>
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
    </div>
  );
}
