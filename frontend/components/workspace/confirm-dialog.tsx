"use client";

import { ConfirmDialog } from "@/components/confirm-dialog";
import type { ConfirmTarget } from "@/components/workspace/types";

interface Props {
  target: ConfirmTarget;
  onConfirm: () => void;
  onCancel: () => void;
}

export function WorkspaceConfirmDialog({ target, onConfirm, onCancel }: Props) {
  return (
    <ConfirmDialog
      open={target !== null}
      title={target?.kind === "notebook" ? "Delete notebook?" : "Delete dataset?"}
      description={
        target
          ? `This permanently deletes "${target.name}" and all of its versions. This cannot be undone.`
          : undefined
      }
      confirmLabel="Delete"
      destructive
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
