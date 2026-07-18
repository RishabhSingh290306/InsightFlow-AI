import type { DatasetProfile, DatasetRead, DatasetUnderstanding, NotebookRead } from "@/lib/types";

export interface DatasetCardProps {
  dataset: DatasetRead;
  isOpen: boolean;
  isAnalyzing: boolean;
  showHistory: boolean;
  historyVersions: DatasetRead[];
  onAnalyze: (id: number) => void;
  onToggleExpanded: (id: number) => void;
  onShowHistory: (id: number) => void;
  onOpenClean: (id: number) => void;
  onOpenEda: (id: number) => void;
  onOpenSql: (id: number) => void;
  onGenerateReport: (id: number) => void;
  onGenerateDashboard: (id: number) => void;
  onOpenChat: (dataset: DatasetRead) => void;
  onRequestDelete: (target: { kind: "dataset"; id: number; name: string }) => void;
}

export interface NotebookCardProps {
  notebook: NotebookRead;
  isEditing: boolean;
  isBusy: boolean;
  editTitle: string;
  onEditTitleChange: (value: string) => void;
  onStartRename: (n: NotebookRead) => void;
  onRename: (id: number) => void;
  onCancelRename: () => void;
  onRequestDelete: (target: { kind: "notebook"; id: number; name: string }) => void;
}

export type ConfirmTarget =
  | { kind: "dataset"; id: number; name: string }
  | { kind: "notebook"; id: number; name: string }
  | null;

export type { DatasetProfile, DatasetUnderstanding };
