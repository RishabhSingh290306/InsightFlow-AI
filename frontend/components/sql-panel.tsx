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
  SqlChainTurn,
  SqlProposal,
  SqlQueryRecord,
  SqlResult,
  SqlVisualization,
} from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function ConfidenceBadge({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const cls =
    pct >= 80
      ? "bg-primary/15 text-primary"
      : pct >= 50
        ? "bg-secondary text-secondary-foreground"
        : "bg-destructive/15 text-destructive";
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${cls}`}>{pct}% conf.</span>
  );
}

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
    chart_type: viz.chart_type as ChartSpec["chart_type"],
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

interface Turn {
  id: number;
  question: string;
  proposal: SqlProposal | null;
  sqlText: string;
  generating: boolean;
  running: boolean;
  result: SqlResult | null;
  error: string | null;
  parentQueryId: number | null; // persisted id of the turn this followed up
  persistedId: number | null;
}

let TURN_SEQ = 0;

export function SqlPanel({ dataset, onClose }: { dataset: DatasetRead; onClose: () => void }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState("");
  const [generating, setGenerating] = useState(false);
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

  // Build chain context from all prior turns that have a result.
  function buildChain(): SqlChainTurn[] {
    return turns
      .filter((t) => t.result)
      .map((t) => ({
        business_question: t.question,
        sql: t.sqlText,
        result_summary: `row_count=${t.result!.row_count}`,
      }));
  }

  async function generateNext(q: string, parentPersistedId: number | null) {
    if (!q.trim()) return;
    const turnId = ++TURN_SEQ;
    const newTurn: Turn = {
      id: turnId,
      question: q,
      proposal: null,
      sqlText: "",
      generating: true,
      running: false,
      result: null,
      error: null,
      parentQueryId: parentPersistedId,
      persistedId: null,
    };
    setTurns((prev) => [...prev, newTurn]);
    setError(null);
    try {
      const chain = buildChain();
      const p = await sqlApi.generate({
        dataset_id: dataset.id,
        question: q,
        chain: chain.length ? chain : null,
      });
      setTurns((prev) =>
        prev.map((t) =>
          t.id === turnId ? { ...t, proposal: p, sqlText: p.sql, generating: false } : t,
        ),
      );
    } catch (err) {
      setTurns((prev) =>
        prev.map((t) =>
          t.id === turnId
            ? { ...t, generating: false, error: err instanceof Error ? err.message : "Generation failed" }
            : t,
        ),
      );
    }
  }

  async function executeTurn(turnId: number) {
    setTurns((prev) =>
      prev.map((t) => (t.id === turnId ? { ...t, running: true, error: null } : t)),
    );
    const turn = turns.find((t) => t.id === turnId);
    if (!turn) return;
    try {
      const r = await sqlApi.run({
        dataset_id: dataset.id,
        sql: turn.sqlText,
        edited: turn.proposal ? turn.sqlText !== turn.proposal.sql : true,
        business_question: turn.question,
        explanation: turn.proposal?.explanation ?? "",
        suggested_visualization: turn.proposal?.suggested_visualization ?? null,
        parent_query_id: turn.parentQueryId,
      });
      setTurns((prev) =>
        prev.map((t) =>
          t.id === turnId ? { ...t, running: false, result: r, persistedId: r.persisted_id } : t,
        ),
      );
      await loadHistory();
    } catch (err) {
      setTurns((prev) =>
        prev.map((t) =>
          t.id === turnId
            ? { ...t, running: false, error: err instanceof Error ? err.message : "Execution failed" }
            : t,
        ),
      );
    }
  }

  // Clicking a follow-up chip proactively generates the next turn (does NOT execute it).
  async function onFollowup(turnId: number, q: string) {
    const parent = turns.find((t) => t.id === turnId);
    await generateNext(q, parent?.persistedId ?? null);
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
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 py-10"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <Card role="dialog" aria-modal="true" aria-label={`SQL · ${dataset.original_filename}`} tabIndex={-1} className="w-full max-w-3xl">
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
          <div className="flex flex-col gap-1">
            <CardTitle className="flex items-center gap-2 text-lg">
              <BarChart3 className="h-4 w-4" /> SQL · {dataset.original_filename}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Ask a question; review, edit, and run SQL. Follow-ups continue the investigation.
            </p>
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

          {/* Ask box (starts a new investigation turn) */}
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="e.g. What is the average score by region?"
                className="flex-1 rounded-md border bg-background px-3 py-2 text-sm"
                onKeyDown={(e) => e.key === "Enter" && !generating && (void generateNext(question, null))}
              />
              <Button onClick={() => generateNext(question, null)} disabled={generating || !question.trim()}>
                {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Generate
              </Button>
            </div>
          </div>

          {/* Thread of turns */}
          <div className="flex flex-col gap-4">
            {turns.map((t) => (
              <div key={t.id} className="flex flex-col gap-2 rounded-md border p-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Sparkles className="h-4 w-4 text-primary" />
                  {t.question}
                  {t.parentQueryId !== null && (
                    <span className="rounded bg-secondary px-1.5 py-0.5 text-xs text-secondary-foreground">
                      follow-up
                    </span>
                  )}
                </div>

                {t.generating && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" /> Generating SQL…
                  </div>
                )}
                {t.error && !t.generating && (
                  <div className="flex items-center gap-2 text-xs text-destructive">
                    <TriangleAlert className="h-3 w-3" /> {t.error}
                  </div>
                )}

                {t.proposal && !t.generating && (
                  <>
                    {t.proposal.explanation && (
                      <p className="text-xs text-muted-foreground">
                        <span className="font-medium">AI:</span> {t.proposal.explanation}{" "}
                        <ConfidenceBadge value={t.proposal.confidence} />
                      </p>
                    )}
                    <textarea
                      value={t.sqlText}
                      onChange={(e) =>
                        setTurns((prev) =>
                          prev.map((p) => (p.id === t.id ? { ...p, sqlText: e.target.value } : p)),
                        )
                      }
                      rows={5}
                      spellCheck={false}
                      className="w-full rounded-md border bg-muted/30 p-2 font-mono text-xs"
                      placeholder="SELECT * FROM dataset LIMIT 10"
                    />
                    <Button
                      onClick={() => executeTurn(t.id)}
                      disabled={t.running || !t.sqlText.trim()}
                      className="self-start"
                    >
                      {t.running ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Play className="h-4 w-4" />
                      )}
                      Execute
                    </Button>
                  </>
                )}

                {t.result && (
                  <div className="flex flex-col gap-3 rounded-md border p-3">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        {t.result.row_count} rows · {t.result.duration_ms} ms
                        {t.result.truncated ? " · truncated" : ""}
                      </span>
                    </div>
                    <div className="max-h-64 overflow-auto rounded border">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-muted text-muted-foreground">
                          <tr>
                            {t.result.columns.map((c) => (
                              <th key={c} className="px-2 py-1 font-medium">
                                {c}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {t.result.rows.map((row, i) => (
                            <tr key={i} className="border-t">
                              {t.result!.columns.map((c) => (
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
                      const viz = t.proposal?.suggested_visualization;
                      if (!viz) return null;
                      const spec = buildChartSpec(viz, t.result!);
                      if (!spec) return null;
                      return (
                        <div className="rounded-md border bg-muted/30 p-2">
                          <ChartRenderer spec={spec} />
                        </div>
                      );
                    })()}

                    {t.result.insights.length > 0 && (
                      <div className="flex flex-col gap-1">
                        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Insights {!t.result.insights_ai_available ? "(auto)" : ""}
                        </h4>
                        <ul className="flex flex-col gap-1">
                          {t.result.insights.map((ins, i) => (
                            <li key={i} className="text-sm">
                              • {ins}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Follow-up chips — click to continue the investigation (proactive generate, no auto-run) */}
                    {t.result.followup_questions.length > 0 && (
                      <div className="flex flex-col gap-1">
                        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Suggested follow-ups
                        </h4>
                        <div className="flex flex-wrap gap-2">
                          {t.result.followup_questions.map((q, i) => (
                            <button
                              key={i}
                              onClick={() => onFollowup(t.id, q)}
                              className="rounded-full border px-3 py-1 text-xs hover:bg-secondary"
                            >
                              {q}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* History (threaded via parent_query_id) */}
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
                <div
                  key={rec.id}
                  className={`flex items-start justify-between gap-2 rounded-md border p-2 text-xs ${
                    rec.parent_query_id !== null ? "ml-4 border-dashed" : ""
                  }`}
                >
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
