"use client";

import { useState } from "react";
import { Copy, FileDown, FileText, Trash2, ArrowUp, ArrowDown, Plus, Loader2 } from "lucide-react";
import type { ReportRead, ReportSection, ReportUpdateRequest } from "@/lib/types";
import { reportsApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ReportRenderer } from "@/components/report-renderer";

function emptyCustomSection(): ReportSection {
  return {
    id: `custom-${Date.now()}`,
    type: "custom",
    title: "Custom Section",
    blocks: [{ kind: "custom_note", text: "", payload: {} }],
  };
}

export function ReportEditor({ report, onDeleted }: { report: ReportRead; onDeleted?: () => void }) {
  const [sections, setSections] = useState<ReportSection[]>(report.sections);
  const [title, setTitle] = useState(report.title);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  async function exportMarkdown() {
    setExporting(true);
    setMsg(null);
    try {
      await reportsApi.exportMarkdown(report.id);
    } catch {
      setMsg("Export failed.");
    } finally {
      setExporting(false);
    }
  }

  async function confirmRemove() {
    setDeleting(true);
    setMsg(null);
    try {
      await reportsApi.remove(report.id);
      onDeleted?.();
    } catch {
      setMsg("Delete failed.");
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  function updateSection(id: string, patch: Partial<ReportSection>) {
    setSections((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }
  function updateBlockText(secId: string, idx: number, text: string) {
    setSections((prev) =>
      prev.map((s) =>
        s.id === secId
          ? { ...s, blocks: s.blocks.map((b, i) => (i === idx ? { ...b, text } : b)) }
          : s
      )
    );
  }
  function removeSection(id: string) {
    setSections((prev) => prev.filter((s) => s.id !== id));
  }
  function move(secId: string, dir: -1 | 1) {
    setSections((prev) => {
      const i = prev.findIndex((s) => s.id === secId);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }
  function addCustom() {
    setSections((prev) => [...prev, emptyCustomSection()]);
  }

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const body: ReportUpdateRequest = { title, sections };
      const updated = await reportsApi.update(report.id, body);
      setSections(updated.sections);
      setTitle(updated.title);
      setMsg("Saved.");
    } catch {
      setMsg("Save failed.");
    } finally {
      setSaving(false);
    }
  }

  function copyShare() {
    const url = `${window.location.origin}/reports/share/${report.share_token}`;
    navigator.clipboard.writeText(url);
    setShareUrl(url);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="no-print flex flex-wrap items-center gap-2">
        <Input
          className="h-8 w-64 text-sm"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          aria-label="Report title"
        />
        <Button size="sm" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        <Button size="sm" variant="outline" onClick={() => window.print()}>
          <FileDown className="h-4 w-4" /> Download PDF
        </Button>
        <Button size="sm" variant="outline" onClick={exportMarkdown} disabled={exporting}>
          {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />} Download Markdown
        </Button>
        <Button size="sm" variant="outline" onClick={copyShare}>
          <Copy className="h-4 w-4" /> Copy Share Link
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(true)} disabled={deleting}>
          <Trash2 className="h-4 w-4" /> Delete
        </Button>
        <Button size="sm" variant="ghost" onClick={addCustom}><Plus className="h-4 w-4" /> Add Section</Button>
        {msg && <span className="text-xs text-muted-foreground">{msg}</span>}
        {shareUrl && <span className="text-xs text-muted-foreground">Link copied: {shareUrl}</span>}
      </div>

      <div className="no-print flex flex-col gap-4">
        {sections.map((sec, idx) => (
          <div key={sec.id} className="rounded-md border p-3">
            <div className="mb-2 flex items-center gap-2">
              <Input
                className="h-8 flex-1 text-sm font-medium"
                value={sec.title}
                onChange={(e) => updateSection(sec.id, { title: e.target.value })}
                aria-label="Section title"
              />
              <Button size="icon" variant="ghost" onClick={() => move(sec.id, -1)} disabled={idx === 0}><ArrowUp className="h-4 w-4" /></Button>
              <Button size="icon" variant="ghost" onClick={() => move(sec.id, 1)} disabled={idx === sections.length - 1}><ArrowDown className="h-4 w-4" /></Button>
              <Button size="icon" variant="ghost" onClick={() => removeSection(sec.id)}><Trash2 className="h-4 w-4" /></Button>
            </div>
            {sec.blocks.map((b, i) =>
              b.kind === "prose" || b.kind === "custom_note" ? (
                <textarea
                  key={i}
                  className="mb-2 w-full rounded border p-2 text-sm"
                  rows={3}
                  value={b.text ?? ""}
                  onChange={(e) => updateBlockText(sec.id, i, e.target.value)}
                />
              ) : (
                <p key={i} className="mb-2 text-xs text-muted-foreground">
                  {b.kind} block (read-only in editor)
                </p>
              )
            )}
          </div>
        ))}
      </div>

      <div className="rounded-md border p-4">
        <ReportRenderer sections={sections} />
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this report?"
        description="This permanently removes the report and its sections. This cannot be undone."
        confirmLabel={deleting ? "Deleting…" : "Delete report"}
        destructive
        onConfirm={confirmRemove}
        onCancel={() => !deleting && setConfirmDelete(false)}
      />
    </div>
  );
}
