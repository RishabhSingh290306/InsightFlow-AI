"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BarChart3,
  Loader2,
  Play,
  Sparkles,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";

import { sqlApi } from "@/lib/api";
import { ChartRenderer } from "@/components/chart-renderer";
import type {
  ChartSpec,
  DatasetRead,
  SqlProposal,
  SqlQueryRecord,
  SqlResult,
  SqlVisualization,
} from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function ConfidenceBadge({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const cls = pct >= 80 ? "bg-primary/15 text-primary" : pct >= 50 ? "bg-secondary text-secondary-foreground" : "bg-destructive/15 text-destructive";
  return <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${cls}`}>{pct}% conf.</span>;
}

// Adapt a query result into a ChartSpec so the existing ChartRenderer can draw it.
function buildChartSpec(viz: SqlVisualization, result: SqlResult): ChartSpec | null {
  const cols = result.columns;
  const x = viz.x ?? cols[0];
  if (!x || !cols.includes(x)) return null;
  const data = result.rows
    .slice(0, 200)
    .map((r) => {
      if (viz.chart_type === "scatter" || viz.chart_type === "line") {
        const y = viz.y ?? cols.find((c) => c !== x);
        if (!y || !cols.includes(y)) return null;
        return { x: r[x], y: r[y] };
      }
      if (viz.chart_type === "pie") {
        const y = viz.y ?? cols.find((c) => c !== x);
        return { category: r[x], value: y ? Number(r[y]) || 1 : 1 };
      }
      const y = viz.y ?? cols.find((c) => c !== x);
      return { category: r[x], count: y ? Number(r[y]) || 1 : 1 };
    })
    .filter(Boolean) as Record<string, unknown>[];
  return {
    id: "sql-viz",
    chart_type: viz.chart_type,
    title: viz.rationale || "Suggested visualization",
    subtitle: null,
    business_question: "",
    explanation: "",
    recommended_reason: "",
    confidence: 1,
    axis_config: {},
    data,
    metadata: { columns: viz.y ? [x, viz.y] : [x] },
    accepted: false,
  };
}

export function SqlPanel({ dataset, onClose }: { dataset: DatasetRead; onClose: () => void }) {
  const [question, setQuestion] = useState("");
  const [proposal, setProposal] = useState<SqlProposal | null>(null);
  const [sqlText, setSqlText] = useState("");
  const [generating, setGenerating] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<SqlResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<SqlQueryRecord[]>([]);
  const [historyQ, setHistoryQ] = useState("");

  const loadHistory = useCallback(async () => {
    try {
      setHistory(await sqlApi.history({ projectId: dataset.project_id, datasetId: dataset.id }));
    } catch {
      /* non-fatal */
    }
  }, [dataset.project_id, dataset.id]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  async function onGenerate() {
    if (!question.trim()) return;
    setGenerating(true);
    setError(null);
    try {
      const p = await sqlApi.generate(dataset.id, question);
      setProposal(p);
      setSqlText(p.sql);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  }

  async function onRun() {
    if (!sqlText.trim()) return;
    setRunning(true);
    setError(null);
    try {
      const r = await sqlApi.run({
        dataset_id: dataset.id,
        sql: sqlText,
        edited: proposal ? sqlText !== proposal.sql : true,
        business_question: proposal?.business_question ?? question,
        explanation: proposal?.explanation ?? "",
        suggested_visualization: proposal?.suggested_visualization ?? null,
      });
      setResult(r);
      await loadHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Execution failed");
    } finally {
      setRunning(false);
    }
  }

  async function onDelete(id: number) {
    try {
      await sqlApi.remove(id);
      setHistory((h) => h.filter((r) => r.id !== id));
    } catch {
      /* non-fatal */
    }
  }

  const filteredHistory = history.filter(
    (h) =>
      !historyQ ||
      h.business_question.toLowerCase().includes(historyQ.toLowerCase()) ||
      h.sql.toLowerCase().includes(historyQ.toLowerCase()),
  );

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 py-10">
      <Card className="w-full max-w-3xl">
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
          <div className="flex flex-col gap-1">
            <CardTitle className="flex items-center gap-2 text-lg">
              <BarChart3 className="h-4 w-4" /> SQL · {dataset.original_filename}
            </CardTitle>
            <p className="text-sm text-muted-foreground">Ask a question; review, edit, and run SQL.</p>
          </div>
          <Button variant="ghost" size="icon" aria-label="Close" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {error && (
            <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              <TriangleAlert className="h-4 w-4 shrink-0" /> {error}
            </div>
          )}

          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="e.g. What is the average score by region?"
                className="flex-1 rounded-md border bg-background px-3 py-2 text-sm"
                onKeyDown={(e) => e.key === "Enter" && onGenerate()}
              />
              <Button onClick={onGenerate} disabled={generating || !question.trim()}>
                {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Generate
              </Button>
            </div>
          </div>

          {proposal && !proposal.ai_available && !sqlText && (
            <div className="flex items-center gap-2 rounded-md border border-dashed p-3 text-sm text-muted-foreground">
              <Sparkles className="h-4 w-4 shrink-0" />
              AI suggestions unavailable — write your own SQL below.
            </div>
          )}
          {proposal && proposal.explanation && (
            <p className="text-xs text-muted-foreground">
              <span className="font-medium">AI:</span> {proposal.explanation}{" "}
              <ConfidenceBadge value={proposal.confidence} />
            </p>
          )}

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">SQL (editable)</label>
            <textarea
              value={sqlText}
              onChange={(e) => setSqlText(e.target.value)}
              rows={5}
              spellCheck={false}
              className="w-full rounded-md border bg-muted/30 p-2 font-mono text-xs"
              placeholder="SELECT * FROM dataset LIMIT 10"
            />
            <Button onClick={onRun} disabled={running || !sqlText.trim()} className="self-start">
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              Execute
            </Button>
          </div>

          {result && (
            <div className="flex flex-col gap-3 rounded-md border p-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {result.row_count} rows · {result.duration_ms} ms
                  {result.truncated ? " · truncated" : ""}
                </span>
              </div>
              <div className="max-h-64 overflow-auto rounded border">
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted text-muted-foreground">
                    <tr>
                      {result.columns.map((c) => (
                        <th key={c} className="px-2 py-1 font-medium">
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.map((row, i) => (
                      <tr key={i} className="border-t">
                        {result.columns.map((c) => (
                          <td key={c} className="px-2 py-1">
                            {String(row[c] ?? "")}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {(() => {
                const viz = proposal?.suggested_visualization;
                if (!viz) return null;
                const spec = buildChartSpec(viz, result);
                if (!spec) return null;
                return (
                  <div className="rounded-md border bg-muted/30 p-2">
                    <ChartRenderer spec={spec} />
                  </div>
                );
              })()}

              {result.insights.length > 0 && (
                <div className="flex flex-col gap-1">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Insights {!result.insights_ai_available ? "(auto)" : ""}
                  </h4>
                  <ul className="flex flex-col gap-1">
                    {result.insights.map((ins, i) => (
                      <li key={i} className="text-sm">
                        • {ins}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">History</h3>
              <input
                value={historyQ}
                onChange={(e) => setHistoryQ(e.target.value)}
                placeholder="Search…"
                className="w-40 rounded-md border bg-background px-2 py-1 text-xs"
              />
            </div>
            <div className="flex flex-col gap-1">
              {filteredHistory.length === 0 && (
                <p className="text-xs text-muted-foreground">No queries yet.</p>
              )}
              {filteredHistory.map((rec) => (
                <div key={rec.id} className="flex items-start justify-between gap-2 rounded-md border p-2 text-xs">
                  <div className="flex flex-col gap-1">
                    <span className="font-medium">{rec.business_question || "(no question)"}</span>
                    <code className="block truncate font-mono text-[10px] text-muted-foreground">{rec.sql}</code>
                    <span className="text-muted-foreground">
                      {rec.row_count} rows · {rec.edited ? "edited" : "as-generated"}
                    </span>
                  </div>
                  <Button variant="ghost" size="icon" aria-label="Delete" onClick={() => onDelete(rec.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
