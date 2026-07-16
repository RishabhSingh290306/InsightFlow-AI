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
  created_at: string;
}
