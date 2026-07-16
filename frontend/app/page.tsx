import { BarChart3, Database, Sparkles } from "lucide-react";

import { BackendStatus } from "@/components/backend-status";
import HeroActions from "@/components/hero-actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const FEATURES = [
  { icon: Database, title: "AI Dataset Understanding", desc: "Auto-detect column types, quality issues, and targets." },
  { icon: Sparkles, title: "Human-in-the-Loop Cleaning", desc: "Approve, reject, or tweak each AI cleaning proposal." },
  { icon: BarChart3, title: "EDA & Visualizations", desc: "Summaries, distributions, and chart recommendations." },
];

export default function HomePage() {
  return (
    <main className="container flex min-h-screen flex-col gap-10 py-16">
      <section className="flex flex-col items-start gap-4">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">InsightFlow AI</h1>
        <p className="max-w-2xl text-lg text-muted-foreground">
          An AI-powered Data Analyst Operating System. Upload a dataset and let AI handle
          understanding, cleaning, EDA, SQL, visualization, and reporting — while you stay in
          control.
        </p>
        <HeroActions />
        <BackendStatus />
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map(({ icon: Icon, title, desc }) => (
          <Card key={title}>
            <CardHeader>
              <Icon className="h-6 w-6 text-primary" />
              <CardTitle className="text-lg">{title}</CardTitle>
              <CardDescription>{desc}</CardDescription>
            </CardHeader>
            <CardContent />
          </Card>
        ))}
      </section>
    </main>
  );
}
