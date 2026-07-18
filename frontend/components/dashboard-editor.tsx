"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Eye, EyeOff, RefreshCw, Save, Trash2 } from "lucide-react";
import type { CatalogEntry, DashboardDetailRead, DashboardPatchRequest, DashboardView } from "@/lib/types";
import { dashboardsApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DashboardRenderer } from "@/components/dashboard-renderer";

/**
 * HITL dashboard editor (M3).
 *
 * The stored `dashboard.spec` is config-only (widget order, hidden widgets,
 * notes). The editor keeps the human's choices in local state and previews a
 * live `DashboardView` rebuilt from `view.widgets` (which the backend returns
 * with hidden widgets included + flagged `is_hidden`) — so toggling a hidden
 * widget back on never loses its computed data.
 *
 * Save pushes the human's choices; Regenerate re-runs the AI curation
 * (preserving hidden widgets + notes server-side) and refreshes the view.
 */
export function DashboardEditor({
  dashboard,
  onDeleted,
}: {
  dashboard: DashboardDetailRead;
  onDeleted?: () => void;
}) {
  const baseView = dashboard.view;
  const allEntries = baseView.widgets; // includes hidden (flagged is_hidden)
  const byType = useMemo(() => {
    const m: Record<string, CatalogEntry> = {};
    for (const e of allEntries) m[e.widget.type] = e;
    return m;
  }, [allEntries]);

  const [title, setTitle] = useState(dashboard.title);
  const [order, setOrder] = useState<string[]>(
    dashboard.spec.widget_order.length
      ? dashboard.spec.widget_order
      : allEntries.map((e) => e.widget.type),
  );
  const [hidden, setHidden] = useState<string[]>(dashboard.spec.hidden_widgets);
  const [notes, setNotes] = useState<Record<string, string>>(dashboard.spec.user_notes ?? {});
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // Display order: the human's order, restricted to widgets that exist, with
  // any new widgets appended (handles additions since the dashboard was saved).
  const displayOrder = useMemo(() => {
    const existing = allEntries.map((e) => e.widget.type);
    const ordered = order.filter((t) => existing.includes(t));
    for (const t of existing) if (!ordered.includes(t)) ordered.push(t);
    return ordered;
  }, [order, allEntries]);

  // Live preview view: honoring local order + hidden set.
  const previewView: DashboardView = useMemo(() => {
    const entries = displayOrder
      .filter((t) => !hidden.includes(t))
      .map((t) => byType[t])
      .filter(Boolean);
    return { ...baseView, widgets: entries };
  }, [displayOrder, hidden, byType, baseView]);

  function toggleHidden(type: string) {
    setHidden((prev) => (prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]));
  }
  function move(type: string, dir: -1 | 1) {
    setOrder((prev) => {
      const i = prev.indexOf(type);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }
  function setNote(type: string, text: string) {
    setNotes((prev) => ({ ...prev, [type]: text }));
  }

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const body: DashboardPatchRequest = {
        title,
        widget_order: order,
        hidden_widgets: hidden,
        user_notes: notes,
      };
      await dashboardsApi.update(dashboard.id, body);
      setMsg("Saved.");
    } catch {
      setMsg("Save failed.");
    } finally {
      setSaving(false);
    }
  }

  async function regenerate() {
    setRegenerating(true);
    setMsg(null);
    try {
      // Re-runs AI curation (preserves hidden + notes server-side), then
      // re-fetches the fresh view so the editor reflects the new order/summary.
      await dashboardsApi.regenerate(dashboard.id);
      const refreshed = await dashboardsApi.get(dashboard.id);
      const entries = refreshed.view.widgets;
      const existing = entries.map((e) => e.widget.type);
      const ordered = refreshed.spec.widget_order.length
        ? refreshed.spec.widget_order.filter((t) => existing.includes(t))
        : existing;
      for (const t of existing) if (!ordered.includes(t)) ordered.push(t);
      setOrder(ordered);
      setHidden(refreshed.spec.hidden_widgets);
      setNotes(refreshed.spec.user_notes ?? {});
      setTitle(refreshed.title);
      setMsg("Regenerated.");
    } catch {
      setMsg("Regenerate failed.");
    } finally {
      setRegenerating(false);
    }
  }

  async function confirmRemove() {
    setDeleting(true);
    setMsg(null);
    try {
      await dashboardsApi.remove(dashboard.id);
      onDeleted?.();
    } catch {
      setMsg("Delete failed.");
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="no-print flex flex-wrap items-center gap-2">
        <Input
          className="h-8 w-64 text-sm"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          aria-label="Dashboard title"
        />
        <Button size="sm" onClick={save} disabled={saving}>
          <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save"}
        </Button>
        <Button size="sm" variant="outline" onClick={regenerate} disabled={regenerating}>
          <RefreshCw className="h-4 w-4" /> {regenerating ? "Regenerating…" : "Regenerate"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(true)} disabled={deleting}>
          <Trash2 className="h-4 w-4" /> Delete
        </Button>
        {msg && <span className="text-xs text-muted-foreground">{msg}</span>}
      </div>

      <div className="no-print flex flex-col gap-2">
        <div className="text-sm font-medium text-muted-foreground">Widgets</div>
        {displayOrder.map((type, idx) => {
          const isHidden = hidden.includes(type);
          return (
            <div
              key={type}
              className={`flex items-center gap-2 rounded-xl border border-border bg-card p-3 transition-colors duration-160ms hover:border-primary/30 ${
                isHidden ? "opacity-60" : ""
              }`}
            >
              <span className="flex flex-1 items-center gap-2 truncate text-sm font-medium">
                <span className="truncate">{byType[type]?.widget.title ?? type}</span>
                {isHidden && (
                  <Badge variant="muted" size="sm">
                    hidden
                  </Badge>
                )}
              </span>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => move(type, -1)}
                disabled={idx === 0}
                aria-label="Move up"
              >
                <ArrowUp className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => move(type, 1)}
                disabled={idx === displayOrder.length - 1}
                aria-label="Move down"
              >
                <ArrowDown className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" onClick={() => toggleHidden(type)} aria-label="Toggle visibility">
                {isHidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          );
        })}
        <div className="mt-2 flex flex-col gap-2">
          <div className="text-sm font-medium text-muted-foreground">Notes (per widget)</div>
          {displayOrder.map((type) => (
            <div key={type} className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">{byType[type]?.widget.title ?? type}</label>
              <textarea
                className="w-full rounded-xl border border-input bg-background p-3 text-sm shadow-inner-soft transition-colors duration-160ms placeholder:text-muted-foreground focus-visible:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                rows={2}
                value={notes[type] ?? ""}
                placeholder="Add a note for this widget…"
                onChange={(e) => setNote(type, e.target.value)}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card-muted/40 p-6">
        <DashboardRenderer view={previewView} />
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this dashboard?"
        description="This permanently removes the dashboard and its configuration. This cannot be undone."
        confirmLabel={deleting ? "Deleting…" : "Delete dashboard"}
        destructive
        onConfirm={confirmRemove}
        onCancel={() => !deleting && setConfirmDelete(false)}
      />
    </div>
  );
}
