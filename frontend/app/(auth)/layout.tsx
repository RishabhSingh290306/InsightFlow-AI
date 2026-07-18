import Link from "next/link";
import { BarChart3, Database, MessageSquareText, Sparkles } from "lucide-react";

const HIGHLIGHTS = [
  {
    icon: Database,
    title: "Upload anything",
    desc: "CSV and Excel files become explorable workspaces instantly.",
  },
  {
    icon: MessageSquareText,
    title: "Ask in plain language",
    desc: "Get SQL, charts, and answers without writing a query.",
  },
  {
    icon: BarChart3,
    title: "Share the outcome",
    desc: "Turn analysis into dashboards and reports your team uses.",
  },
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      {/* Brand panel */}
      <aside className="relative hidden overflow-hidden bg-card lg:flex lg:flex-col lg:justify-between p-12 gradient-mesh">
        {/* Decorative floating cards */}
        <div
          aria-hidden
          className="absolute -right-16 top-24 h-64 w-64 rounded-3xl border border-border bg-background/60 shadow-soft-lg backdrop-blur"
        />
        <div
          aria-hidden
          className="absolute -left-10 bottom-32 h-48 w-48 rounded-3xl border border-border bg-primary/5 shadow-soft-md backdrop-blur"
        />

        <div className="relative flex items-center gap-2 text-sm font-semibold tracking-tight">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Sparkles className="h-4 w-4" />
          </span>
          InsightFlow
        </div>

        <div className="relative max-w-md">
          <h2 className="text-3xl font-bold leading-tight tracking-tight">
            Your data, understood.
          </h2>
          <p className="mt-3 text-muted-foreground">
            A calm, focused workspace for profiling, exploring, cleaning, and
            delivering insights — with humans approving every step.
          </p>

          <ul className="mt-8 space-y-4">
            {HIGHLIGHTS.map(({ icon: Icon, title, desc }) => (
              <li key={title} className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-semibold">{title}</p>
                  <p className="text-sm text-muted-foreground">{desc}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-2xs text-muted-foreground">
          © {new Date().getFullYear()} InsightFlow. Built for people who work with data.
        </p>
      </aside>

      {/* Form panel */}
      <div className="flex items-center justify-center bg-background px-6 py-10">
        {children}
      </div>
    </main>
  );
}
