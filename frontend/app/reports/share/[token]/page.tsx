"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { FileDown, FileText } from "lucide-react";
import { reportsApi } from "@/lib/api";
import type { ReportShareRead } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { ReportRenderer } from "@/components/report-renderer";

export default function ShareReportPage() {
  const params = useParams<{ token: string }>();
  const [report, setReport] = useState<ReportShareRead | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setReport(await reportsApi.share(params.token));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Report not found");
    }
  }, [params.token]);

  useEffect(() => { void load(); }, [load]);

  if (error) return <main className="container py-10"><p className="text-destructive">{error}</p></main>;
  if (!report) return <main className="container py-10"><p className="text-muted-foreground">Loading…</p></main>;

  return (
    <main className="container flex min-h-screen flex-col gap-6 py-10">
      <div className="no-print flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">{report.title}</h1>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => window.print()}><FileDown className="h-4 w-4" /> Download PDF</Button>
          <Button size="sm" variant="outline" onClick={() => window.print()}><FileText className="h-4 w-4" /> Download Markdown</Button>
        </div>
      </div>

      {!report.ai_available && (
        <p className="text-sm text-muted-foreground">AI narration unavailable — rule-based report.</p>
      )}

      {/* Read-only: no edit/delete/SQL/cleaning controls. */}
      <ReportRenderer sections={report.sections} />

      <footer className="mt-8 border-t pt-4 text-center text-sm text-muted-foreground">
        Generated with InsightFlow AI ·{" "}
        <Link href="/" className="font-medium underline">Analyze your own dataset →</Link>
      </footer>
    </main>
  );
}
