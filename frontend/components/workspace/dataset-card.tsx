"use client";

import { memo } from "react";
import {
  BarChart3,
  ChevronDown,
  Database,
  FileText,
  History,
  LayoutDashboard,
  MessageSquare,
  Sparkles,
  Table as TableIcon,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ActionMenu, MenuItem } from "@/components/action-menu";
import { DatasetStatusBadge } from "@/components/workspace/views";
import type { DatasetCardProps } from "@/components/workspace/types";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function DatasetCardImpl({
  dataset: d,
  isOpen,
  isAnalyzing,
  showHistory,
  historyVersions,
  onAnalyze,
  onToggleExpanded,
  onShowHistory,
  onOpenClean,
  onOpenEda,
  onOpenSql,
  onGenerateReport,
  onGenerateDashboard,
  onOpenChat,
  onRequestDelete,
}: DatasetCardProps) {
  return (
    <Card className="card-hover group relative border bg-card shadow-soft-sm">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-primary/5 blur-2xl"
      />
      <CardHeader className="flex flex-col gap-2 space-y-0 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <Database className="h-4 w-4 shrink-0 text-primary" />
              <span className="truncate font-semibold tracking-tight">
                {d.original_filename}
              </span>
              <Badge variant="muted" className="shrink-0">
                v{d.version}
              </Badge>
              <DatasetStatusBadge status={d.status} />
            </div>
            <p className="truncate text-xs text-muted-foreground">
              {d.file_format.toUpperCase()} · {formatSize(d.file_size)}
              {d.row_count !== null && d.column_count !== null
                ? ` · ${d.row_count} rows × ${d.column_count} cols`
                : " · metadata pending"}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
            <Button size="sm" onClick={() => onAnalyze(d.id)} disabled={isAnalyzing}>
              <Sparkles className="h-4 w-4" />
              <span className="hidden sm:inline">
                {isAnalyzing ? "Analyzing…" : d.understanding ? "Re-analyze" : "Analyze"}
              </span>
            </Button>
            {(d.profile || d.understanding) && (
              <Button size="sm" variant="ghost" onClick={() => onToggleExpanded(d.id)}>
                <ChevronDown
                  className={`h-4 w-4 transition-transform duration-220ms ${isOpen ? "rotate-180" : ""}`}
                />
                {isOpen ? "Hide analysis" : "View analysis"}
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => onShowHistory(d.id)}>
              <History className="h-4 w-4" />
              History
            </Button>
            {d.profile && (
              <ActionMenu label="Actions">
                {(close) => (
                  <>
                    <MenuItem
                      icon={<Sparkles className="h-4 w-4" />}
                      onSelect={() => {
                        close();
                        onOpenClean(d.id);
                      }}
                    >
                      Clean
                    </MenuItem>
                    <MenuItem
                      icon={<BarChart3 className="h-4 w-4" />}
                      onSelect={() => {
                        close();
                        onOpenEda(d.id);
                      }}
                    >
                      EDA
                    </MenuItem>
                    <MenuItem
                      icon={<TableIcon className="h-4 w-4" />}
                      onSelect={() => {
                        close();
                        onOpenSql(d.id);
                      }}
                    >
                      SQL
                    </MenuItem>
                    <MenuItem
                      icon={<FileText className="h-4 w-4" />}
                      onSelect={() => {
                        close();
                        onGenerateReport(d.id);
                      }}
                    >
                      Report
                    </MenuItem>
                    <MenuItem
                      icon={<LayoutDashboard className="h-4 w-4" />}
                      onSelect={() => {
                        close();
                        onGenerateDashboard(d.id);
                      }}
                    >
                      Dashboard
                    </MenuItem>
                    <MenuItem
                      icon={<MessageSquare className="h-4 w-4" />}
                      onSelect={() => {
                        close();
                        onOpenChat(d);
                      }}
                    >
                      Chat
                    </MenuItem>
                  </>
                )}
              </ActionMenu>
            )}
            <Button
              variant="ghost"
              size="icon"
              aria-label="Delete dataset"
              className="text-muted-foreground hover:text-destructive"
              onClick={() => onRequestDelete({ kind: "dataset", id: d.id, name: d.original_filename })}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      {isOpen && (d.profile || d.understanding) && (
        <CardContent className="flex flex-col gap-4 border-t border-border pt-4">
          {d.profile && <ProfileView profile={d.profile} />}
          {d.understanding && <UnderstandingView understanding={d.understanding} />}
        </CardContent>
      )}
      {showHistory && (
        <CardContent className="flex flex-col gap-2 border-t border-border pt-4">
          <h3 className="text-sm font-semibold">Version history</h3>
          <ol className="flex flex-col gap-1">
            {historyVersions.map((v) => (
              <li
                key={v.id}
                className={`flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 text-sm ${
                  v.id === d.id ? "border-primary bg-primary/5" : "border-border"
                }`}
              >
                <Badge variant="muted">v{v.version}</Badge>
                <span className="font-medium">
                  {v.origin === "upload" ? "Original" : "Cleaned"}
                </span>
                <span className="text-muted-foreground">{v.original_filename}</span>
                <DatasetStatusBadge status={v.status} />
                {v.id === d.id && (
                  <span className="text-xs text-muted-foreground">· viewing</span>
                )}
              </li>
            ))}
          </ol>
        </CardContent>
      )}
    </Card>
  );
}

// Memoized so unrelated parent state changes (e.g. editing a notebook title,
// generating a report) don't re-render every dataset card.
export const DatasetCard = memo(DatasetCardImpl);
