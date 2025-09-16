export interface ProjectProgress {
  id: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  progress: number; // Percentage (0-100)
  report_date: string;
  work_order_id: number;
  user_id: number;
}

export interface ProgressWithDetails extends ProjectProgress {
  work_order?: {
    id: number;
    customer_wo_number: string;
    shipyard_wo_number: string;
    wo_location: string;
    wo_description: string;
    vessel?: {
      name: string;
      type: string;
      company: string;
    };
  };
  user?: {
    id: number;
    name: string;
    email: string;
  };
}

export interface ProgressSummary {
  work_order_id: number;
  current_progress: number;
  latest_report_date: string;
  total_reports: number;
  work_order?: {
    id: number;
    customer_wo_number: string;
    shipyard_wo_number: string;
    wo_location: string;
    wo_description: string;
    vessel?: {
      name: string;
      type: string;
      company: string;
    };
  };
  progress_history: {
    date: string;
    progress: number;
    reporter: string;
  }[];
}

export interface ProgressFormData {
  progress: number;
  report_date: string;
  work_order_id: number;
  notes?: string;
}

export interface ProgressChartData {
  date: string;
  progress: number;
  reporter: string;
  formatted_date: string;
}

export interface ProgressFilter {
  work_order_id?: number;
  date_from?: string;
  date_to?: string;
  min_progress?: number;
  max_progress?: number;
}

export interface ProgressStats {
  total_projects: number;
  active_projects: number;
  completed_projects: number;
  average_progress: number;
  projects_behind_schedule: number;
  projects_on_track: number;
}
