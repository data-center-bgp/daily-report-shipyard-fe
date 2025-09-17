// ============ PROJECT LEVEL PROGRESS (Work Order Level) ============
export interface ProjectProgress {
  id: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  progress: number; // Overall project progress (0-100)
  report_date: string;
  work_order_id: number;
  user_id: number;
}

export interface ProjectProgressWithDetails extends ProjectProgress {
  work_order: {
    id: number;
    customer_wo_number: string;
    shipyard_wo_number: string;
    wo_location: string;
    wo_description: string;
    vessel: {
      name: string;
      type: string;
      company: string;
    };
  };
  user: {
    id: number;
    name: string;
    email: string;
  };
}

// ============ WORK DETAILS PROGRESS (Granular Level) ============
export interface WorkProgress {
  id: number;
  progress_percentage: number;
  report_date: string;
  evidence_url?: string;
  storage_path?: string;
  work_details_id: number;
  user_id: number;
  created_at: string;
  updated_at?: string;
  deleted_at?: string | null;
}

export interface WorkProgressWithDetails extends WorkProgress {
  work_details: {
    id: number;
    description: string;
    location?: string;
    work_order: {
      id: number;
      shipyard_wo_number: string;
      vessel: {
        id: number;
        name: string;
        type: string;
      };
    };
  };
  profiles?: {
    id: number;
    name: string;
    email: string;
  };
}

// ============ SHARED INTERFACES ============
export interface Vessel {
  id: number;
  name: string;
  type: string;
  company: string;
}

export interface WorkOrder {
  id: number;
  customer_wo_number: string;
  shipyard_wo_number: string;
  shipyard_wo_date: string;
  wo_location: string;
  wo_description: string;
  vessel_id: number;
  vessel?: Vessel;
}

export interface WorkDetails {
  id: number;
  description: string;
  location: string;
  pic: string;
  planned_start_date: string;
  target_close_date: string;
  period_close_target: string;
  work_order_id: number;
  work_order?: WorkOrder;
}

// ============ AGGREGATION & SUMMARY TYPES ============
export interface WorkOrderProgressSummary {
  work_order_id: number;
  work_order: WorkOrder;
  project_progress: number; // From project_progress table
  calculated_progress: number; // Calculated from work_details progress
  work_details_progress: {
    work_details_id: number;
    description: string;
    current_progress: number;
    last_update: string;
    is_completed: boolean;
  }[];
  discrepancy: number; // Difference between project and calculated progress
}

// ============ FORM & FILTER TYPES ============
export interface ProjectProgressFormData {
  progress: number;
  report_date: string;
  work_order_id: number;
  notes?: string;
}

export interface WorkProgressFormData {
  work_details_id: number;
  progress_percentage: number;
  report_date: string;
  evidence_file?: File;
  notes?: string;
}

export interface ProgressFilter {
  // Common filters
  vessel_id?: number;
  work_order_id?: number;
  work_details_id?: number;
  date_from?: string;
  date_to?: string;

  // Project level filters
  project_progress_min?: number;
  project_progress_max?: number;

  // Work details level filters
  details_progress_min?: number;
  details_progress_max?: number;
}

// ============ STATISTICS & ANALYTICS ============
export interface ProgressStats {
  // Project level stats
  total_projects: number;
  active_projects: number;
  completed_projects: number;
  average_project_progress: number;
  projects_behind_schedule: number;
  projects_on_track: number;

  // Work details level stats
  total_work_details: number;
  completed_work_details: number;
  work_details_with_evidence: number;
  average_details_progress: number;
}
