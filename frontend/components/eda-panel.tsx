"use client";

import { useCallback, useEffect, useState } from "react";
import { BarChart3, Check, Loader2, Sparkles, TriangleAlert, X, XCircle } from "lucide-react";

import { edaApi } from "@/lib/api";
import type { ChartSpec, DatasetRead, EdaResult } from "@/lib/types";
import { StageProgress, useCycle } from "@/components/stage-progress";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartRenderer } from "@/components/chart-renderer";

function ConfidenceBadge({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const cls =
    pct >= 80
      ? "bg-primary/15 text-primary"
      : pct >= 50
        ? "bg-secondary text-secondary-foreground"
        : "bg-destructive/15 text-destructive";
  return <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${cls}`}>{pct}% conf.</span>;
}

const EDA_STAGES = ["Profiling dataset", "Detecting patterns", "Recommending charts"];

export function EdaPanel({ dataset, onClose }: { dataset: DatasetRead; onClose: () => void }) {
  const [result, setResult] = useState<EdaResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const edaStage = useCycle(EDA_STAGES.length, 800, loading);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let r: EdaResult;
      try {
        r = await edaApi.get(dataset.id);
      } catch {
        r = await edaApi.generate(dataset.id);
      }
      setResult(r);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate EDA");
    } finally {
      setLoading(false);
    }
  }, [dataset.id]);

  useEffect(() => {
    void load();
  }, [load]);

  function setAccepted(chart: ChartSpec, value: boolean) {
    if (!result) return;
    setResult({
      ...result,
      charts: result.charts.map((c) => (c.id === chart.id ? { ...c, accepted: value } : c)),
    });
  }

  async function onSave() {
    if (!result) return;
    setSaving(true);
    setError(null);
    try {
      const ids = result.charts.filter((c) => c.accepted).map((c) => c.id);
      setResult(await edaApi.accept(dataset.id, ids));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save selections");
    } finally {
      setSaving(false);
    }
  }

  const acceptedCount = result ? result.charts.filter((c) => c.accepted).length : 0;

  return (
    <div
      className="overlay-enter fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 py-10"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <Card role="dialog" aria-modal="true" aria-label={`EDA · ${dataset.original_filename}`} tabIndex={-1} className="dialog-enter flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden">
        <CardHeader className="flex shrink-0 flex-row items-center justify-between gap-4 space-y-0">
          <div className="flex flex-col gap-1">
            <CardTitle className="flex items-center gap-2 text-lg">
              <BarChart3 className="h-4 w-4" /> EDA · {dataset.original_filename}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Review recommended charts; accept the ones worth keeping.
            </p>
          </div>
          <Button variant="ghost" size="icon" aria-label="Close" onClick={onClose} disabled={saving}>
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col gap-4 overflow-y-auto">
          {loading ? (
            <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-4">
              <span className="text-sm font-medium">Analyzing your dataset</span>
              <StageProgress stages={EDA_STAGES} activeIndex={edaStage} />
            </div>
          ) : error ? (
            <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              <TriangleAlert className="h-4 w-4 shrink-0" /> {error}
            </div>
          ) : (
            result && (
              <>
                {!result.ai_available && (
                  <div className="flex items-center gap-2 rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                    <Sparkles className="h-4 w-4 shrink-0" />
                    Suggestions unavailable — showing auto-generated charts from the profile.
                  </div>
                )}
                <div className="flex flex-col gap-3">
                  {result.charts.map((c) => (
                    <div
                      key={c.id}
                      className={`flex flex-col gap-2 rounded-lg border p-3 ${c.accepted ? "border-primary bg-primary/5" : ""}`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold">{c.title}</span>
                          <ConfidenceBadge value={c.confidence} />
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant={c.accepted ? "default" : "outline"}
                            onClick={() => setAccepted(c, true)}
                          >
                            <Check className="h-4 w-4" /> Accept
                          </Button>
                          <Button
                            size="sm"
                            variant={!c.accepted ? "destructive" : "outline"}
                            onClick={() => setAccepted(c, false)}
                          >
                            <XCircle className="h-4 w-4" /> Reject
                          </Button>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        <span className="font-medium">Q:</span> {c.business_question}
                      </p>
                      <div className="rounded-md border bg-muted/30 p-2">
                        <ChartRenderer spec={c} />
                      </div>
                      <p className="text-xs text-muted-foreground">{c.explanation}</p>
                      <p className="text-[11px] text-muted-foreground">
                        Why recommended: {c.recommended_reason}
                      </p>
                    </div>
                  ))}
                </div>
                {error && (
                  <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                    <TriangleAlert className="h-4 w-4 shrink-0" /> {error}
                  </div>
                )}
                <div className="flex items-center justify-end gap-2 pt-1">
                  <span className="text-xs text-muted-foreground">{acceptedCount} accepted</span>
                  <Button variant="ghost" onClick={onClose} disabled={saving}>
                    Close
                  </Button>
                  <Button onClick={onSave} disabled={saving}>
                    {saving ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" /> Saving…
                      </>
                    ) : (
                      "Save selections"
                    )}
                  </Button>
                </div>
              </>
            )
          )}
        </CardContent>
      </Card>
    </div>
  );
}
