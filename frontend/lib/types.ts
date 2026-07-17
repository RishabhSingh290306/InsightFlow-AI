export interface UserRead {
  id: number;
  email: string;
  full_name: string;
  is_active: boolean;
  created_at: string;
}

export interface Token {
  access_token: string;
  token_type: string;
}

export interface ProjectRead {
  id: number;
  owner_id: number;
  name: string;
  description: string;
  is_active: boolean;
  created_at: string;
}

export interface ProjectCreate {
  name: string;
  description?: string;
}

export interface DatasetRead {
  id: number;
  project_id: number;
  owner_id: number;
  original_filename: string;
  file_format: string;
  file_size: number;
  row_count: number | null;
  column_count: number | null;
  status: string;
  version: number;
  parent_id: number | null;
  root_id: number | null;
  origin: string;
  recipe: Record<string, unknown> | null;
  profile: DatasetProfile | null;
  understanding: DatasetUnderstanding | null;
  created_at: string;
}

export interface DatasetProfile {
  file_name: string;
  file_size: number;
  row_count: number;
  column_count: number;
  column_names: string[];
  inferred_types: Record<string, string>;
  numeric_columns: string[];
  categorical_columns: string[];
  date_columns: string[];
  missing_values: Record<string, number>;
  duplicate_row_count: number;
  null_percentage: number;
  unique_values: Record<string, number>;
  basic_statistics: Record<string, ColumnStats>;
  potential_target_column: string | null;
  data_quality_issues: string[];
  preview: Record<string, unknown>[];
}

export interface ColumnStats {
  min?: number | null;
  max?: number | null;
  mean?: number | null;
  median?: number | null;
  std?: number | null;
}

export interface DatasetUnderstanding {
  dataset_description: string;
  business_domain_guess: string;
  likely_use_case: string;
  possible_target_column: string | null;
  important_features: string[];
  data_quality_summary: string;
  cleaning_recommendations: string[];
  suggested_visualizations: string[];
  suggested_business_questions: string[];
  initial_business_observations: string[];
  confidence_score: number;
  explanation: Record<string, string>;
  ai_available: boolean;
}

// --- Cleaning workflow (HITL) ---------------------------------------------

export interface CleaningOperation {
  op: string;
  params: Record<string, unknown>;
  explanation?: string;
  confidence: number;
  approved: boolean;
}

export interface OperationImpact {
  rows_affected: number;
  cols_affected: number;
  estimated_changes: number;
  warnings: string[];
  execution_time_ms?: number | null;
  confidence?: number | null;
  preview_before: Record<string, unknown>[];
  preview_after: Record<string, unknown>[];
  op_name?: string | null;
  // Execution metadata (M2): every operation gets a UUID + timing/status.
  operation_id?: string | null;
  duration_ms?: number | null;
  status?: string | null;
  timestamp?: string | null;
}

export interface ProposedOperation {
  operation: CleaningOperation;
  impact: OperationImpact;
}

export interface PlanSummary {
  overall_quality?: number | null;
  estimated_improvement: number;
  estimated_time_ms: number;
  operation_count: number;
  affected_rows: number;
}

export interface CleaningPlan {
  operations: ProposedOperation[];
  summary: PlanSummary;
  ai_available: boolean;
}

// --- EDA + Visualizations ------------------------------------------------

export type ChartType =
  | "bar"
  | "line"
  | "scatter"
  | "histogram"
  | "pie"
  | "box"
  | "heatmap";

export interface ChartSpec {
  id: string;
  chart_type: ChartType;
  title: string;
  subtitle?: string | null;
  business_question: string;
  explanation: string;
  recommended_reason: string;
  confidence: number;
  axis_config: Record<string, unknown>;
  data: Record<string, unknown>[];
  metadata: Record<string, unknown>;
  accepted: boolean;
}

export interface EdaResult {
  ai_available: boolean;
  charts: ChartSpec[];
}

export interface EdaAcceptRequest {
  accepted_ids: string[];
}

// --- SQL Generation (Question -> SQL) ------------------------------------

export interface SqlVisualization {
  chart_type: ChartType;
  rationale: string;
  x?: string | null;
  y?: string | null;
}

export interface SqlChainTurn {
  business_question: string;
  sql: string;
  result_summary: string;
}

export interface SqlGenerateRequest {
  dataset_id: number;
  question: string;
  chain?: SqlChainTurn[] | null;
}

export interface SqlProposal {
  business_question: string;
  sql: string;
  explanation: string;
  confidence: number;
  suggested_visualization: SqlVisualization | null;
  ai_available: boolean;
}

export interface SqlRunRequest {
  dataset_id: number;
  sql: string;
  edited?: boolean;
  business_question?: string | null;
  explanation?: string | null;
  suggested_visualization?: SqlVisualization | null;
  parent_query_id?: number | null;
}

export interface SqlResult {
  columns: string[];
  rows: Record<string, unknown>[];
  row_count: number;
  truncated: boolean;
  duration_ms: number;
  insights: string[];
  insights_ai_available: boolean;
  followup_questions: string[];
  followups_ai_available: boolean;
  persisted_id: number | null;
}

export interface SqlQueryRecord {
  id: number;
  project_id: number;
  dataset_id: number;
  owner_id: number;
  business_question: string;
  sql: string;
  edited: boolean;
  explanation: string;
  suggested_visualization: SqlVisualization | null;
  insights: string[];
  columns: string[];
  row_count: number | null;
  truncated: boolean | null;
  duration_ms: number | null;
  executed_at: string;
  parent_query_id: number | null;
}

// --- Insights + Reports ---------------------------------------------------

export type SectionType =
  | "cover"
  | "executive_summary"
  | "dataset_overview"
  | "data_quality"
  | "cleaning_summary"
  | "eda"
  | "sql_analysis"
  | "business_insights"
  | "recommendations"
  | "appendix"
  | "custom";

export interface SectionBlock {
  kind: "prose" | "chart" | "sql" | "table" | "lineage" | "custom_note";
  text?: string | null;
  ref_id?: string | null;
  payload: Record<string, unknown>;
}

export interface ReportSection {
  id: string;
  type: SectionType;
  title: string;
  blocks: SectionBlock[];
}

export interface ReportRead {
  id: number;
  project_id: number;
  owner_id: number;
  scope: string;
  dataset_id: number | null;
  title: string;
  sections: ReportSection[];
  share_token: string;
  ai_available: boolean;
  created_at: string;
  updated_at: string;
  generated_at: string;
}

export interface ReportShareRead {
  title: string;
  scope: string;
  sections: ReportSection[];
  ai_available: boolean;
  generated_at: string;
}

export interface ReportGenerateRequest {
  scope: "dataset" | "project";
  project_id?: number | null;
  dataset_id?: number | null;
  title?: string | null;
}

export interface ReportUpdateRequest {
  title?: string | null;
  sections: ReportSection[];
}
