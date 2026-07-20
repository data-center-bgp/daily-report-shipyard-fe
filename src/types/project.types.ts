export interface Project {
  id: number;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
  project_name: string;
  vessel_id: number;
  readiness_form_id: number | null;
  user_id: number;
}

export interface ProjectWithDetails extends Project {
  vessel?: {
    id: number;
    name: string;
    type: string;
    company: string;
  };
  readiness_form?: {
    id: number;
    status: string;
  } | null;
  work_order_count?: number;
}
