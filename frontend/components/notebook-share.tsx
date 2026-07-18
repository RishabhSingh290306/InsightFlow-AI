"use client";

import type { NotebookShareRead } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Markdown } from "@/components/markdown";

export function NotebookShare({ notebook }: { notebook: NotebookShareRead }) {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold tracking-tight">{notebook.title}</h1>
      {!notebook.ai_available && (
        <Badge variant="warning" size="sm">Assistant limited — some responses used a rule-based fallback</Badge>
      )}
      {notebook.turns.map((t) => (
        <div key={t.id} className={t.role === "user" ? "flex flex-col items-end" : "flex flex-col items-start"}>
          <div
            className={`inline-block max-w-[90%] whitespace-pre-wrap px-3.5 py-2.5 text-sm leading-relaxed ${
              t.role === "user"
                ? "rounded-2xl rounded-br-md bg-primary text-primary-foreground"
                : "rounded-2xl rounded-bl-md border border-border bg-card"
            }`}
          >
            {t.role === "user" ? t.content : <Markdown content={t.content} />}
          </div>
        </div>
      ))}
    </div>
  );
}
