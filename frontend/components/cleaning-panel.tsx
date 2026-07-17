"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Loader2, Sparkles, TriangleAlert, X, XCircle } from "lucide-react";

import { cleaningApi } from "@/lib/api";
import type { CleaningOperation, DatasetRead, PlanSummary, ProposedOperation } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const OP_LABELS: Record<string, string> = {
  handle_missing_values: "Handle missing values",
  remove_duplicates: "Remove duplicates",
  convert_types: "Convert types",
  rename_columns: "Rename columns",
  drop_columns: "Drop columns",
};

const MISSING_STRATEGIES = ["drop_rows", "drop_columns", "mean", "median", "mode", "constant"];
const DUP_KEEP = ["first", "last"];
const TYPE_TARGETS = ["numeric", "datetime", "string", "category"];

function OpLabel({ op }: { op: string }) {
  return <span>{OP_LABELS[op] ?? op}</span>;
}

function ConfidenceBadge({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const cls =
    pct >= 80 ? "bg-primary/15 text-primary" : pct >= 50 ? "bg-secondary text-secondary-foreground" : "bg-destructive/15 text-destructive";
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${cls}`}>{pct}% conf.</span>
  );
}

/** Small before/after preview table from a sample of records. */
function PreviewTable({ rows }: { rows: Record<string, unknown>[] }) {
  if (!rows || rows.length === 0) {
    return <p className="text-xs text-muted-foreground">No sample rows.</p>;
  }
  const cols = Object.keys(rows[0]);
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-left text-xs">
        <thead className="bg-muted text-muted-foreground">
          <tr>
            {cols.map((c) => (
              <th key={c} className="px-2 py-1 font-medium">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t">
              {cols.map((c) => (
                <td key={c} className="px-2 py-1">
                  {row[c] === null || row[c] === undefined ? (
                    <span className="text-muted-foreground">∅</span>
                  ) : (
                    String(row[c])
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Per-op editable params form, bound to the operation's param bag. */
function ParamsEditor({
  op,
  params,
  columns,
  onChange,
}: {
  op: string;
  params: Record<string, unknown>;
  columns: string[];
  onChange: (next: Record<string, unknown>) => void;
}) {
  const set = (key: string, value: unknown) => onChange({ ...params, [key]: value });

  function toggleColumn(col: string) {
    const cur = Array.isArray(params.columns) ? (params.columns as string[]) : [];
    const next = cur.includes(col) ? cur.filter((c) => c !== col) : [...cur, col];
    set("columns", next);
  }

  if (op === "handle_missing_values") {
    return (
      <div className="flex flex-col gap-2">
        <label className="text-xs font-medium text-muted-foreground">Strategy</label>
        <select
          className="rounded-md border bg-background px-2 py-1 text-sm"
          value={String(params.strategy ?? "median")}
          onChange={(e) => set("strategy", e.target.value)}
        >
          {MISSING_STRATEGIES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        {params.strategy === "constant" && (
          <input
            className="rounded-md border bg-background px-2 py-1 text-sm"
            placeholder="fill_value"
            value={String(params.fill_value ?? "")}
            onChange={(e) => set("fill_value", e.target.value)}
          />
        )}
        <ColumnCheckboxes columns={columns} selected={params.columns} onToggle={toggleColumn} />
      </div>
    );
  }

  if (op === "remove_duplicates") {
    return (
      <div className="flex flex-col gap-2">
        <label className="text-xs font-medium text-muted-foreground">Keep</label>
        <select
          className="rounded-md border bg-background px-2 py-1 text-sm"
          value={String(params.keep ?? "first")}
          onChange={(e) => set("keep", e.target.value)}
        >
          {DUP_KEEP.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          Empty subset = entire row must match.
        </p>
        <ColumnCheckboxes
          columns={columns}
          selected={params.subset}
          onToggle={(col) => {
            const cur = Array.isArray(params.subset) ? (params.subset as string[]) : [];
            const next = cur.includes(col) ? cur.filter((c) => c !== col) : [...cur, col];
            set("subset", next);
          }}
        />
      </div>
    );
  }

  if (op === "convert_types") {
    return (
      <div className="flex flex-col gap-2">
        <label className="text-xs font-medium text-muted-foreground">Column</label>
        <select
          className="rounded-md border bg-background px-2 py-1 text-sm"
          value={String(params.column ?? "")}
          onChange={(e) => set("column", e.target.value)}
        >
          <option value="">— select —</option>
          {columns.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <label className="text-xs font-medium text-muted-foreground">To type</label>
        <select
          className="rounded-md border bg-background px-2 py-1 text-sm"
          value={String(params.to_type ?? "numeric")}
          onChange={(e) => set("to_type", e.target.value)}
        >
          {TYPE_TARGETS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <label className="text-xs font-medium text-muted-foreground">Errors</label>
        <select
          className="rounded-md border bg-background px-2 py-1 text-sm"
          value={String(params.errors ?? "coerce")}
          onChange={(e) => set("errors", e.target.value)}
        >
          <option value="coerce">coerce</option>
          <option value="raise">raise</option>
        </select>
      </div>
    );
  }

  if (op === "rename_columns") {
    const mapping = (params.mapping as Record<string, string>) ?? {};
    return (
      <div className="flex flex-col gap-2">
        {columns.map((c) => (
          <div key={c} className="flex items-center gap-2 text-sm">
            <span className="w-1/2 truncate text-muted-foreground">{c}</span>
            <span>→</span>
            <input
              className="w-1/2 rounded-md border bg-background px-2 py-1 text-sm"
              placeholder="new name"
              value={mapping[c] ?? ""}
              onChange={(e) =>
                set("mapping", { ...mapping, [c]: e.target.value })
              }
            />
          </div>
        ))}
      </div>
    );
  }

  if (op === "drop_columns") {
    return (
      <ColumnCheckboxes
        columns={columns}
        selected={params.columns}
        onToggle={toggleColumn}
      />
    );
  }

  return (
    <p className="text-xs text-muted-foreground">No editable params for this operation.</p>
  );
}

function ColumnCheckboxes({
  columns,
  selected,
  onToggle,
}: {
  columns: string[];
  selected: unknown;
  onToggle: (col: string) => void;
}) {
  const cur = Array.isArray(selected) ? (selected as string[]) : [];
  if (columns.length === 0) {
    return <p className="text-xs text-muted-foreground">No columns available.</p>;
  }
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-muted-foreground">Columns</label>
      {columns.map((c) => (
        <label key={c} className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={cur.includes(c)}
            onChange={() => onToggle(c)}
          />
          {c}
        </label>
      ))}
    </div>
  );
}

export function CleaningPanel({
  dataset,
  onApplied,
  onClose,
}: {
  dataset: DatasetRead;
  onApplied: (newDataset: DatasetRead) => void;
  onClose: () => void;
}) {
  const columnNames = useMemo(
    () => (dataset.profile ? dataset.profile.column_names : []),
    [dataset.profile],
  );

  const [plan, setPlan] = useState<{
    operations: ProposedOperation[];
    summary: PlanSummary | null;
    ai_available: boolean;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Local working copy of operations (params editable, approval toggleable).
  const [ops, setOps] = useState<ProposedOperation[]>([]);

  const loadPlan = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const p = await cleaningApi.plan(dataset.id);
      setPlan({ operations: p.operations, summary: p.summary, ai_available: p.ai_available });
      setOps(p.operations);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load cleaning plan");
    } finally {
      setLoading(false);
    }
  }, [dataset.id]);

  useEffect(() => {
    void loadPlan();
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [loadPlan]);

  // Debounced live preview after any param/approval edit.
  const schedulePreview = useCallback(
    (next: ProposedOperation[]) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(async () => {
        setPreviewing(true);
        try {
          const p = await cleaningApi.preview(
            dataset.id,
            next.map((o) => o.operation),
          );
          // Merge refreshed impacts back by index (operations are echoed as-is).
          setOps((prev) =>
            prev.map((o, i) =>
              p.operations[i]
                ? { operation: p.operations[i].operation, impact: p.operations[i].impact }
                : o,
            ),
          );
          if (p.summary) setPlan((prev) => (prev ? { ...prev, summary: p.summary } : prev));
        } catch {
          /* keep last good impact; do not clobber edits */
        } finally {
          setPreviewing(false);
        }
      }, 500);
    },
    [dataset.id],
  );

  function updateOp(index: number, patch: Partial<CleaningOperation>) {
    setOps((prev) => {
      const next = prev.map((o, i) =>
        i === index ? { ...o, operation: { ...o.operation, ...patch } } : o,
      );
      schedulePreview(next);
      return next;
    });
  }

  async function onApply() {
    setApplying(true);
    setError(null);
    try {
      const newDataset = await cleaningApi.apply(
        dataset.id,
        ops.map((o) => o.operation),
      );
      onApplied(newDataset);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cleaning failed");
    } finally {
      setApplying(false);
    }
  }

  const summary = plan?.summary ?? null;

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
      <Card role="dialog" aria-modal="true" aria-label={`Cleaning plan · ${dataset.original_filename}`} tabIndex={-1} className="w-full max-w-3xl">
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
          <div className="flex flex-col gap-1">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Sparkles className="h-4 w-4" />
              Cleaning plan · {dataset.original_filename}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Review each proposed operation, then apply to create a new version.
            </p>
          </div>
          <Button variant="ghost" size="icon" aria-label="Close" onClick={onClose} disabled={applying}>
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>

        <CardContent className="flex flex-col gap-4">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Generating plan…
            </div>
          ) : error ? (
            <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              <TriangleAlert className="h-4 w-4 shrink-0" />
              {error}
            </div>
          ) : (
            <>
              {plan && !plan.ai_available && (
                <div className="flex items-center gap-2 rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                  <Sparkles className="h-4 w-4 shrink-0" />
                  AI suggestions unavailable — showing a rule-based plan derived from the profile.
                </div>
              )}

              {summary && (
                <div className="flex flex-wrap gap-3 rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                  <span>{summary.operation_count} operations</span>
                  <span>·</span>
                  <span>{summary.affected_rows} rows affected</span>
                  <span>·</span>
                  <span>~{summary.estimated_time_ms.toFixed(1)} ms</span>
                  <span>·</span>
                  <span>{summary.estimated_improvement}% est. improvement</span>
                  {summary.overall_quality !== null && summary.overall_quality !== undefined && (
                    <>
                      <span>·</span>
                      <span>quality {summary.overall_quality}</span>
                    </>
                  )}
                </div>
              )}

              <div className="flex flex-col gap-3">
                {ops.map((o, i) => {
                  const imp = o.impact;
                  const approved = o.operation.approved;
                  return (
                    <div
                      key={i}
                      className={`flex flex-col gap-3 rounded-lg border p-3 ${
                        approved ? "" : "bg-muted/30 opacity-80"
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold">
                            <OpLabel op={o.operation.op} />
                          </span>
                          {o.operation.explanation && (
                            <span className="text-xs text-muted-foreground">
                              {o.operation.explanation}
                            </span>
                          )}
                          <ConfidenceBadge value={o.operation.confidence} />
                        </div>
                        <Button
                          size="sm"
                          variant={approved ? "default" : "outline"}
                          onClick={() => updateOp(i, { approved: !approved })}
                        >
                          {approved ? (
                            <>
                              <Check className="h-4 w-4" /> Approved
                            </>
                          ) : (
                            <>
                              <XCircle className="h-4 w-4" /> Rejected
                            </>
                          )}
                        </Button>
                      </div>

                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="flex flex-col gap-1">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Parameters
                          </p>
                          <ParamsEditor
                            op={o.operation.op}
                            params={o.operation.params}
                            columns={columnNames}
                            onChange={(next) => updateOp(i, { params: next })}
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Expected impact
                          </p>
                          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                            <span>{imp.rows_affected} rows</span>
                            <span>·</span>
                            <span>{imp.cols_affected} cols</span>
                            <span>·</span>
                            <span>{imp.estimated_changes} changes</span>
                          </div>
                          {imp.warnings.length > 0 && (
                            <ul className="flex flex-col gap-1">
                              {imp.warnings.map((w, wi) => (
                                <li key={wi} className="text-xs text-destructive">
                                  ⚠ {w}
                                </li>
                              ))}
                            </ul>
                          )}
                          <div className="flex flex-col gap-2 pt-1">
                            <span className="text-[11px] font-medium text-muted-foreground">Before</span>
                            <PreviewTable rows={imp.preview_before} />
                            <span className="text-[11px] font-medium text-muted-foreground">After</span>
                            <PreviewTable rows={imp.preview_after} />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {error && (
                <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                  <TriangleAlert className="h-4 w-4 shrink-0" />
                  {error}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-1">
                {previewing && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" /> previewing…
                  </span>
                )}
                <Button variant="ghost" onClick={onClose} disabled={applying}>
                  Cancel
                </Button>
                <Button onClick={onApply} disabled={applying}>
                  {applying ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Applying…
                    </>
                  ) : (
                    "Apply cleaning"
                  )}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
