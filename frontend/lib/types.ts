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
