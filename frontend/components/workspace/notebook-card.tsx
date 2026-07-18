"use client";

import { memo } from "react";
import Link from "next/link";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { NotebookCardProps } from "@/components/workspace/types";

function NotebookCardImpl({
  notebook: n,
  isEditing,
  isBusy,
  editTitle,
  onEditTitleChange,
  onStartRename,
  onRename,
  onCancelRename,
  onRequestDelete,
}: NotebookCardProps) {
  return (
    <Card key={n.id} className="card-hover border bg-card shadow-soft-sm">
      <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {isEditing ? (
            <input
              value={editTitle}
              onChange={(e) => onEditTitleChange(e.target.value)}
              className="w-full min-w-[200px] rounded-lg border border-input px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Rename notebook"
            />
          ) : (
            <Link
              href={`/notebooks/${n.id}`}
              className="truncate font-medium hover:underline"
            >
              {n.title}
            </Link>
          )}
          <span className="text-xs text-muted-foreground">
            {n.scope}
            {n.dataset_id !== null && n.dataset_id !== undefined
              ? ` · dataset #${n.dataset_id}`
              : ""}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {isEditing ? (
            <>
              <Button
                size="sm"
                onClick={() => onRename(n.id)}
                disabled={isBusy || !editTitle.trim()}
              >
                Save
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={onCancelRename}
                disabled={isBusy}
              >
                Cancel
              </Button>
            </>
          ) : (
            <>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onStartRename(n)}
                aria-label="Rename notebook"
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onRequestDelete({ kind: "notebook", id: n.id, name: n.title })}
                disabled={isBusy}
                aria-label="Delete notebook"
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// Memoized so editing one notebook doesn't re-render the others.
export const NotebookCard = memo(NotebookCardImpl);
