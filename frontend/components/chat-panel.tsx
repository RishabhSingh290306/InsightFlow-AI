"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Send, Sparkles, X, Loader2 } from "lucide-react";
import { chatApi, sqlApi, dashboardsApi, reportsApi } from "@/lib/api";
import type { ChatArtifact, ChatTurn, DatasetRead, SqlProposal, SqlResult, SqlVisualization } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChartRenderer } from "@/components/chart-renderer";
import { Markdown } from "@/components/markdown";

interface Props {
  projectId: number;
  dataset?: DatasetRead | null;
  notebookId: number | null;
  onNotebookCreated: (id: number) => void;
  onClose: () => void;
}

export function ChatPanel({ projectId, dataset, notebookId, onNotebookCreated, onClose }: Props) {
  const router = useRouter();
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [genBusy, setGenBusy] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    // Cancel any in-flight stream if the panel unmounts (close/navigate).
    return () => abortRef.current?.abort();
  }, []);

  function pushAssistantToken(text: string) {
    setTurns((prev) => {
      const next = [...prev];
      const last = next[next.length - 1];
      if (last && last.role === "assistant" && last._streaming) {
        next[next.length - 1] = { ...last, content: last.content + text };
      } else {
        next.push({ id: crypto.randomUUID(), role: "assistant", content: text, actions: [], _streaming: true } as ChatTurn);
      }
      return next;
    });
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }

  function attachArtifact(artifact: ChatArtifact) {
    setTurns((prev) => {
      const next = [...prev];
      const i = next.map(t => t.role).lastIndexOf("assistant");
      if (i >= 0) {
        const t = next[i] as ChatTurn & { _streaming?: boolean };
        next[i] = { ...t, _streaming: false, actions: [...(t.actions || []), artifact] };
      }
      return next;
    });
  }

  async function send() {
    const content = input.trim();
    if (!content || streaming) return;
    setInput("");
    setStreaming(true);
    setTurns((p) => [...p, { id: crypto.randomUUID(), role: "user", content, actions: [] }]);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await chatApi.message(
        { notebook_id: notebookId, project_id: projectId, dataset_id: dataset?.id ?? null, content },
        (e) => {
          if (e.event === "token") pushAssistantToken(String(e.data.text ?? ""));
          else if (e.event === "artifact") attachArtifact(e.data.artifact as ChatArtifact);
          else if (e.event === "done") {
            if (e.data.notebook_id && !notebookId) onNotebookCreated(Number(e.data.notebook_id));
            setTurns((p) => p.map((t, i) => (i === p.length - 1 ? { ...t, _streaming: false } : t)));
          } else if (e.event === "error") {
            const message = String(e.data.message ?? "Something went wrong while generating a response.");
            setTurns((p) => {
              const next = p.map((t, i) => (i === p.length - 1 ? { ...t, _streaming: false } : t));
              next.push({
                id: crypto.randomUUID(),
                role: "assistant",
                content: `⚠️ ${message}`,
                actions: [],
                _streaming: false,
              } as ChatTurn);
              return next;
            });
          }
        },
        controller.signal,
      );
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }

  return (
    <div
      className="overlay-enter fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="chat-panel-title"
        className="dialog-enter flex h-[82vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-soft-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-3 border-b border-border bg-card-muted/30 px-4 py-3">
          <h2 id="chat-panel-title" className="flex items-center gap-2 text-sm font-semibold">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Sparkles className="h-4 w-4" />
            </span>
            Assistant
            {dataset ? <span className="text-xs font-normal text-muted-foreground">· {dataset.original_filename}</span> : <span className="text-xs font-normal text-muted-foreground">· project</span>}
          </h2>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close"><X className="h-4 w-4" /></Button>
        </header>
        <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4">
          {turns.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Sparkles className="h-6 w-6" />
              </div>
              <p className="mt-4 text-sm font-medium text-foreground">Ask your data</p>
              <p className="mt-1 max-w-xs text-sm text-muted-foreground">
                Ask a question about this {dataset ? "dataset" : "project"}. I&apos;ll analyze it and suggest next steps.
              </p>
            </div>
          )}
          {turns.map((t) => (
            <div key={t.id} className={t.role === "user" ? "flex flex-col items-end" : "flex flex-col items-start"}>
              <div
                className={`animate-slide-up inline-block max-w-[90%] px-3.5 py-2.5 text-sm leading-relaxed ${
                  t.role === "user"
                    ? "rounded-2xl rounded-br-md bg-primary text-primary-foreground"
                    : "rounded-2xl rounded-bl-md border border-border bg-card"
                }`}
              >
                {t.role === "user" ? (
                  t.content
                ) : t._streaming && !t.content ? (
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
                    Thinking…
                  </span>
                ) : (
                  <>
                    <Markdown content={t.content} />
                    {t._streaming && (
                      <span
                        className="caret-blink ml-0.5 inline-block align-middle text-primary"
                        aria-hidden
                      >
                        ▍
                      </span>
                    )}
                  </>
                )}
              </div>
              {t.actions?.map((a, i) => (
                <ArtifactCard key={i} artifact={a} dataset={dataset} projectId={projectId} />
              ))}
            </div>
          ))}
        </div>
        <form className="flex gap-2 border-t border-border bg-card-muted/30 p-3" onSubmit={(e) => { e.preventDefault(); send(); }}>
          <Input
            ref={inputRef}
            placeholder="e.g. Why did revenue drop in Q3?"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={streaming}
          />
          <Button type="submit" disabled={streaming || !input.trim()}><Send className="h-4 w-4" /> Send</Button>
        </form>
      </div>
    </div>
  );
}

function ArtifactCard({ artifact, dataset, projectId }: { artifact: ChatArtifact; dataset?: DatasetRead | null; projectId: number }) {
  const router = useRouter();
  const [result, setResult] = useState<SqlResult | null>(null);
  const [running, setRunning] = useState(false);
  const [accepted, setAccepted] = useState<string[]>([]);
  const [genBusy, setGenBusy] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  if (artifact.type === "sql") {
    const dsId = artifact.dataset_id ?? dataset?.id ?? null;
    const proposal = artifact.proposal as unknown as SqlProposal | undefined;
    const viz = proposal?.suggested_visualization as SqlVisualization | null;
    return (
      <div className="mt-2 w-full max-w-[90%] rounded-xl border border-border bg-card-muted/40 p-3 text-left text-sm">
        <p className="flex items-center gap-2 font-medium">
          SQL query
          {artifact.status === "proposed" && <Badge variant="muted" size="sm">proposed</Badge>}
        </p>
        <pre className="my-2 overflow-x-auto rounded-lg border border-border bg-card-muted/60 p-2.5 font-mono text-xs">{proposal?.sql || "(no query proposed)"}</pre>
        {proposal?.explanation && <p className="text-muted-foreground">{proposal.explanation}</p>}
        {!result && (
          <Button size="sm" className="mt-2" disabled={running || !proposal?.sql || dsId == null} onClick={async () => {
            if (!proposal?.sql || dsId == null) return;
            setRunning(true);
            try {
              const r = await sqlApi.run({ dataset_id: dsId, sql: proposal.sql, business_question: proposal.business_question });
              setResult(r);
            } finally { setRunning(false); }
          }}>{running ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{running ? "Running…" : "Run query"}</Button>
        )}
        {result && (
          <div className="mt-2">
            <p className="text-xs text-muted-foreground">{result.row_count} rows · {result.duration_ms} ms</p>
            <div className="mt-2 max-h-48 overflow-auto rounded-lg border border-border">
              <Table className="text-xs">
                <TableHeader className="bg-card-muted/80"><TableRow>{result.columns.map((c) => <TableHead key={c} className="px-2 py-1">{c}</TableHead>)}</TableRow></TableHeader>
                <TableBody>{result.rows.slice(0, 20).map((row, i) => (
                  <TableRow key={i} className="border-t">{result.columns.map((c) => <TableCell key={c} className="px-2 py-1">{String(row[c] ?? "")}</TableCell>)}</TableRow>
                ))}</TableBody>
              </Table>
            </div>
            {viz && result.rows.length > 0 && (
              <ChartRenderer spec={{
                id: "sql-viz", chart_type: viz.chart_type, title: proposal?.business_question || "Result",
                business_question: "", explanation: viz.rationale, recommended_reason: "", confidence: 0,
                axis_config: { x_label: viz.x ?? "", y_label: viz.y ?? "" },
                data: result.rows.slice(0, 200).map((r) => ({ x: r[viz.x ?? ""], y: r[viz.y ?? ""], category: r[viz.x ?? ""] })),
                metadata: {}, accepted: true,
              }} />
            )}
            {result.insights?.map((ins, i) => <p key={i} className="mt-1 text-xs">• {ins}</p>)}
          </div>
        )}
      </div>
    );
  }

  if (artifact.type === "chart") {
    const specs = (artifact.specs ?? []) as unknown as import("@/lib/types").ChartSpec[];
    return (
      <div className="mt-2 w-full max-w-[90%] rounded-xl border border-border bg-card-muted/40 p-3 text-left text-sm">
        <p className="font-medium">Recommended charts</p>
        {specs.map((s) => (
          <div key={s.id} className="my-3">
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={accepted.includes(s.id)} onChange={(e) => setAccepted((p) => e.target.checked ? [...p, s.id] : p.filter((x) => x !== s.id))} />
              {s.title}
            </label>
            <ChartRenderer spec={s} />
          </div>
        ))}
        <p className="text-xs text-muted-foreground">{accepted.length} selected</p>
      </div>
    );
  }

  if (artifact.type === "cleaning") {
    const ops = ((artifact.proposal as Record<string, unknown> | null)?.operations as Record<string, unknown>[] | undefined) ?? [];
    return (
      <div className="mt-2 w-full max-w-[90%] rounded-xl border border-border bg-card-muted/40 p-3 text-left text-sm">
        <p className="font-medium">Cleaning suggestions</p>
        <ul className="list-inside list-disc text-xs">{ops.map((o: Record<string, unknown>, i: number) => <li key={i}>{String(o.op)}: {String(o.explanation ?? "")}</li>)}</ul>
      </div>
    );
  }

  if (artifact.type === "dashboard" || artifact.type === "report") {
    const scope = ((artifact.proposal as Record<string, unknown> | null)?.scope as string | undefined) ?? (dataset ? "dataset" : "project");
    const gen = artifact.type === "dashboard" ? dashboardsApi.generate : reportsApi.generate;
    const isDashboard = artifact.type === "dashboard";
    async function generate() {
      setGenBusy(true);
      setGenError(null);
      try {
        const r = await gen(
          scope === "dataset"
            ? { scope: "dataset", dataset_id: dataset!.id, project_id: projectId }
            : { scope: "project", project_id: projectId },
        );
        router.push(isDashboard ? `/dashboards/${r.id}` : `/reports/${r.id}`);
      } catch {
        setGenError("Generation failed.");
        setGenBusy(false);
      }
    }
    return (
      <div className="mt-2 w-full max-w-[90%] rounded-xl border border-border bg-card-muted/40 p-3 text-left text-sm">
        <p className="font-medium">{isDashboard ? "Dashboard" : "Report"} recommendation</p>
        <Button size="sm" className="mt-2" onClick={generate} disabled={genBusy}>
          {genBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {isDashboard ? "Open dashboard" : "Generate report"}
        </Button>
        {genError && <p className="mt-2 text-xs text-destructive">{genError}</p>}
      </div>
    );
  }

  return <div className="mt-2 w-full max-w-[90%] rounded-xl border border-border bg-card-muted/40 p-3 text-left text-sm text-muted-foreground">{artifact.type}</div>;
}
