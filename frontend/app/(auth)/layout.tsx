import Link from "next/link";
import { BarChart3, Database, MessageSquareText, Sparkles } from "lucide-react";

import { AuthVisual } from "@/components/auth/auth-visual";

const HIGHLIGHTS = [
  {
    icon: Database,
    label: "Upload anything",
    desc: "CSV & Excel become explorable workspaces instantly.",
  },
  {
    icon: MessageSquareText,
    label: "Ask in plain language",
    desc: "Get SQL, charts, and answers without writing a query.",
  },
  {
    icon: BarChart3,
    label: "Share the outcome",
    desc: "Turn analysis into dashboards and reports your team uses.",
  },
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative bg-canvas lg:grid lg:h-screen lg:grid-cols-2 lg:overflow-hidden">
      {/* Ambient background — layered radial gradients, mesh, blurred blobs,
          a glass light ray, and a faint film grain. Same palette as the
          landing page so the auth pages feel like a continuation of the product. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 gradient-mesh opacity-50 animate-mesh-drift blur-2xl" />
        <div className="absolute -left-[10%] -top-[12%] h-[34rem] w-[34rem] rounded-full bg-primary/20 blur-3xl animate-blob" />
        <div className="absolute -right-[8%] top-[10%] h-[30rem] w-[30rem] rounded-full bg-lavender/20 blur-3xl animate-blob [animation-delay:-8s]" />
        <div className="absolute bottom-[5%] left-[15%] h-[24rem] w-[24rem] rounded-full bg-secondary/25 blur-3xl animate-blob [animation-delay:-15s]" />
        {/* Glass light ray */}
        <div className="absolute -left-1/4 top-1/3 h-px w-[60%] -rotate-12 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
        {/* Subtle film grain */}
        <div className="auth-noise absolute inset-0" />
      </div>

      {/* Brand panel */}
      <aside className="relative hidden flex-col overflow-hidden border-r border-border/60 lg:flex lg:h-screen lg:p-8 xl:p-10">
        <div className="flex animate-fade-in items-center gap-2 text-sm font-semibold tracking-tight">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Sparkles className="h-4 w-4" />
          </span>
          InsightFlow
        </div>

        {/* Middle — badge + heading + illustration. flex-1 + min-h-0 lets the
            illustration shrink to fit the viewport; the extra bottom padding
            lifts the whole group so the illustration sits level with the form. */}
        <div className="flex min-h-0 flex-1 flex-col justify-center gap-6 py-6 lg:mt-2 lg:pb-10">
          <div className="flex animate-fade-in flex-col items-start gap-3 [animation-delay:80ms]">
            <span className="inline-flex items-center gap-2 rounded-full border bg-card/70 px-2.5 py-1 text-2xs font-medium text-muted-foreground shadow-soft-sm backdrop-blur">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              Your calm data workspace
            </span>
            <h2 className="max-w-md text-2xl font-bold leading-[1.12] tracking-tight lg:text-3xl xl:text-4xl">
              Your data, understood.
            </h2>
            <p className="max-w-md text-sm text-muted-foreground">
              A calm, focused workspace for profiling, exploring, cleaning, and
              delivering insights — with humans approving every step.
            </p>
          </div>

          <div className="animate-fade-in [animation-delay:320ms]">
            <AuthVisual />
          </div>
        </div>

        {/* Bottom — feature pills + copyright (pinned, never scrolls away). */}
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-3 gap-2.5">
            {HIGHLIGHTS.map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="rounded-2xl border border-border/70 bg-card/60 px-2.5 py-2.5 text-center shadow-soft-sm backdrop-blur-sm"
              >
                <span className="mx-auto mb-1.5 flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="h-4 w-4" />
                </span>
                <p className="text-2xs font-semibold leading-tight">{label}</p>
              </div>
            ))}
          </div>
          <p className="text-2xs text-muted-foreground">
            © {new Date().getFullYear()} InsightFlow. Built for people who work
            with data.
          </p>
        </div>
      </aside>

      {/* Form panel — faint ambient bleed-through for continuity. On small
          screens it scrolls if needed; on lg+ it is locked to one viewport. */}
      <div className="relative flex min-h-screen items-center justify-center bg-background/50 px-6 py-8 backdrop-blur-sm lg:min-h-0 lg:h-screen lg:overflow-hidden lg:py-10">
        {/* Depth layer — radial glow, faint grid, glass circles, floating dots.
            Kept subtle so it adds atmosphere without distracting from the form. */}
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute left-1/2 top-1/2 h-[26rem] w-[26rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/10 blur-3xl" />
          <div className="absolute -right-16 top-12 h-72 w-72 rounded-full border border-primary/10 bg-primary/[0.04] backdrop-blur-md" />
          <div className="absolute -left-10 bottom-16 h-56 w-56 rounded-full border border-lavender/10 bg-lavender/[0.05] backdrop-blur-md" />
          <div className="bg-grid absolute inset-0 opacity-[0.07]" />
          <div className="absolute right-24 top-24 h-1.5 w-1.5 rounded-full bg-primary/40" />
          <div className="absolute left-28 bottom-24 h-1 w-1 rounded-full bg-lavender/50" />
        </div>

        {/* Subtle floating status accents on the form side. Placed in the free
            top/bottom bands (never over the form fields) and shown from lg up.
            Smaller and slower than the illustration cards. */}
        <div aria-hidden className="pointer-events-none absolute inset-0 hidden lg:block">
          <div className="absolute left-8 top-8 animate-float [animation-delay:-2s] rounded-full border border-border/70 bg-card/80 px-3 py-1.5 text-2xs font-medium text-muted-foreground shadow-soft-md backdrop-blur-sm">
            <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-success" />
            Workspace secured
          </div>
          <div className="absolute right-8 top-10 animate-float [animation-delay:-5s] rounded-full border border-border/70 bg-card/80 px-3 py-1.5 text-2xs font-medium text-muted-foreground shadow-soft-md backdrop-blur-sm">
            <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-primary" />
            Encrypted
          </div>
          <div className="absolute left-8 bottom-10 animate-float [animation-delay:-8s] rounded-full border border-border/70 bg-card/80 px-3 py-1.5 text-2xs font-medium text-muted-foreground shadow-soft-md backdrop-blur-sm">
            <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-lavender" />
            Human review enabled
          </div>
        </div>

        <div className="relative z-10 flex w-full justify-center">{children}</div>
      </div>
    </main>
  );
}
