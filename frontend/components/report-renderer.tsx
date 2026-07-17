"use client";

import type { ChartSpec, ReportSection, SectionBlock } from "@/lib/types";
import { ChartRenderer } from "@/components/chart-renderer";

function Block({ block }: { block: SectionBlock }) {
  switch (block.kind) {
    case "prose":
    case "custom_note":
      return <p className="whitespace-pre-wrap text-sm leading-relaxed">{block.text}</p>;
    case "chart": {
      const spec = block.payload as unknown as ChartSpec;
      return (
        <figure className="flex flex-col gap-1">
          <figcaption className="text-xs font-medium text-muted-foreground">
            {spec.title} — {spec.business_question}
          </figcaption>
          <div className="h-56">
            <ChartRenderer spec={spec} />
          </div>
        </figure>
      );
    }
    case "sql": {
      const p = block.payload as {
        business_question?: string;
        explanation?: string;
        sql?: string;
        insights?: string[];
      };
      return (
        <div className="flex flex-col gap-1 rounded-md border p-3">
          <p className="text-sm font-medium">Q: {p.business_question}</p>
          {p.explanation && <p className="text-xs text-muted-foreground">{p.explanation}</p>}
          <pre className="overflow-x-auto rounded bg-muted p-2 text-xs"><code>{p.sql}</code></pre>
          {p.insights?.length ? (
            <ul className="list-disc pl-4 text-xs">{p.insights.map((i, k) => <li key={k}>{i}</li>)}</ul>
          ) : null}
        </div>
      );
    }
    case "table": {
      const p = block.payload as { columns?: string[]; rows?: unknown[][] };
      return (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted text-muted-foreground">
              <tr>{(p.columns ?? []).map((c) => <th key={c} className="px-2 py-1">{c}</th>)}</tr>
            </thead>
            <tbody>
              {(p.rows ?? []).map((row, i) => (
                <tr key={i} className="border-t">
                  {(row as unknown[]).map((cell, j) => <td key={j} className="px-2 py-1">{String(cell)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    case "lineage": {
      const versions = (block.payload as { versions?: { version: number; origin: string; filename: string }[] }).versions ?? [];
      return (
        <ol className="flex flex-col gap-1 text-xs">
          {versions.map((v, i) => (
            <li key={i} className="rounded border px-2 py-1">
              v{v.version} · {v.origin} · {v.filename}
            </li>
          ))}
        </ol>
      );
    }
    default:
      return null;
  }
}

export function ReportRenderer({ sections }: { sections: ReportSection[] }) {
  return (
    <div className="report-container flex flex-col gap-6">
      {sections.map((sec) => (
        <section key={sec.id}>
          <h2 className="mb-2 text-lg font-semibold">{sec.title}</h2>
          <div className="flex flex-col gap-3">
            {sec.blocks.map((b, i) => <Block key={i} block={b} />)}
          </div>
        </section>
      ))}
    </div>
  );
}
