"use client";

import type { NotebookShareRead } from "@/lib/types";

export function NotebookShare({ notebook }: { notebook: NotebookShareRead }) {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold tracking-tight">{notebook.title}</h1>
      {!notebook.ai_available && (
        <p className="text-sm text-muted-foreground">AI unavailable for parts of this chat — rule-based fallback used.</p>
      )}
      {notebook.turns.map((t) => (
        <div key={t.id} className={t.role === "user" ? "text-right" : "text-left"}>
          <div className={`inline-block max-w-[90%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${t.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
            {t.content}
          </div>
        </div>
      ))}
    </div>
  );
}
