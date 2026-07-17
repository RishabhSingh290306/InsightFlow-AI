"use client";

import { useRef, useState } from "react";
import { Send, Sparkles, X } from "lucide-react";
import { chatApi, sqlApi, dashboardsApi, reportsApi } from "@/lib/api";
import type { ChatArtifact, ChatTurn, DatasetRead, SqlProposal, SqlResult, SqlVisualization } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { ChartRenderer } from "@/components/chart-renderer";

interface Props {
  projectId: number;
  dataset?: DatasetRead | null;
  notebookId: number | null;
  onNotebookCreated: (id: number) => void;
  onClose: () => void;
}

export function ChatPanel({ projectId, dataset, notebookId, onNotebookCreated, onClose }: Props) {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

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
            setTurns((p) => p.map((t, i) => (i === p.length - 1 ? { ...t, _streaming: false } : t)));
          }
        },
      );
    } finally {
      setStreaming(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="flex h-[80vh] w-full max-w-2xl flex-col rounded-lg border bg-background shadow-xl" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between border-b px-4 py-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="h-4 w-4" /> Ask your data
            {dataset ? <span className="text-xs text-muted-foreground">· {dataset.original_filename}</span> : <span className="text-xs text-muted-foreground">· project</span>}
          </h2>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close"><X className="h-4 w-4" /></Button>
        </header>
        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
          {turns.length === 0 && <p className="text-sm text-muted-foreground">Ask a question about this {dataset ? "dataset" : "project"}.</p>}
          {turns.map((t) => (
            <div key={t.id} className={t.role === "user" ? "text-right" : "text-left"}>
              <div className={`inline-block max-w-[90%] rounded-lg px-3 py-2 text-sm ${t.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                {t.content || (t._streaming ? "…" : "")}
              </div>
              {t.actions?.map((a, i) => <ArtifactCard key={i} artifact={a} dataset={dataset} projectId={projectId} />)}
            </div>
          ))}
        </div>
        <form className="flex gap-2 border-t p-3" onSubmit={(e) => { e.preventDefault(); send(); }}>
          <input
            className="flex-1 rounded-md border px-3 py-2 text-sm"
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
  const [result, setResult] = useState<SqlResult | null>(null);
  const [running, setRunning] = useState(false);
  const [accepted, setAccepted] = useState<string[]>([]);

  if (artifact.type === "sql") {
    const proposal = artifact.proposal as unknown as SqlProposal | undefined;
    const viz = proposal?.suggested_visualization as SqlVisualization | null;
    return (
      <div className="mt-2 rounded-md border bg-background p-3 text-left text-sm">
        <p className="font-medium">SQL query {artifact.status === "proposed" ? "(proposed)" : ""}</p>
        <pre className="my-1 overflow-x-auto rounded bg-muted p-2 text-xs">{proposal?.sql || "(no query proposed)"}</pre>
        {proposal?.explanation && <p className="text-muted-foreground">{proposal.explanation}</p>}
        {!result && (
          <Button size="sm" className="mt-2" disabled={running || !proposal?.sql} onClick={async () => {
            if (!proposal?.sql || !dataset) return;
            setRunning(true);
            try {
              const r = await sqlApi.run({ dataset_id: dataset.id, sql: proposal.sql, business_question: proposal.business_question });
              setResult(r);
            } finally { setRunning(false); }
          }}>{running ? "Running…" : "Run query"}</Button>
        )}
        {result && (
          <div className="mt-2">
            <p className="text-xs text-muted-foreground">{result.row_count} rows · {result.duration_ms} ms</p>
            <div className="max-h-48 overflow-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted"><tr>{result.columns.map((c) => <th key={c} className="px-2 py-1">{c}</th>)}</tr></thead>
                <tbody>{result.rows.slice(0, 20).map((row, i) => (
                  <tr key={i} className="border-t">{result.columns.map((c) => <td key={c} className="px-2 py-1">{String(row[c] ?? "")}</td>)}</tr>
                ))}</tbody>
              </table>
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
      <div className="mt-2 rounded-md border bg-background p-3 text-left text-sm">
        <p className="font-medium">Recommended charts</p>
        {specs.map((s) => (
          <div key={s.id} className="my-2">
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
      <div className="mt-2 rounded-md border bg-background p-3 text-left text-sm">
        <p className="font-medium">Cleaning suggestions</p>
        <ul className="list-inside list-disc text-xs">{ops.map((o: Record<string, unknown>, i: number) => <li key={i}>{String(o.op)}: {String(o.explanation ?? "")}</li>)}</ul>
      </div>
    );
  }

  if (artifact.type === "dashboard" || artifact.type === "report") {
    const scope = ((artifact.proposal as Record<string, unknown> | null)?.scope as string | undefined) ?? (dataset ? "dataset" : "project");
    const gen = artifact.type === "dashboard" ? dashboardsApi.generate : reportsApi.generate;
    return (
      <div className="mt-2 rounded-md border bg-background p-3 text-left text-sm">
        <p className="font-medium">{artifact.type === "dashboard" ? "Dashboard" : "Report"} recommendation</p>
        <Button size="sm" className="mt-2" onClick={async () => {
          const r = await gen(scope === "dataset" ? { scope: "dataset", dataset_id: dataset!.id, project_id: projectId } : { scope: "project", project_id: projectId });
          window.location.href = artifact.type === "dashboard" ? `/dashboards/${r.id}` : `/reports/${r.id}`;
        }}>{artifact.type === "dashboard" ? "Open dashboard" : "Generate report"}</Button>
      </div>
    );
  }

  return <div className="mt-2 rounded-md border bg-background p-3 text-left text-sm text-muted-foreground">{artifact.type}</div>;
}
