import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing Supabase environment variables");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  db: {
    schema: "daily_report_shipyard",
  },
});

export interface Vessel {
  id: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  name: string;
  type: string;
  company: string;
}

export interface Kapro {
  id: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  kapro_name: string;
}

export interface WorkOrder {
  id: number;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
  vessel_id: number;
  shipyard_wo_number: string;
  shipyard_wo_date: string;
  customer_wo_number?: string;
  customer_wo_date?: string;
  user_id: number;
  is_additional_wo?: boolean;
  kapro_id?: number;
  work_location?: string;
  work_type?: string;
}

export interface WorkDetails {
  id: number;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
  work_order_id: number;
  description: string;
  location_id: number;
  planned_start_date: string;
  target_close_date: string;
  period_close_target: string;
  actual_start_date?: string;
  actual_close_date?: string;
  pic: string;
  work_permit_url?: string;
  storage_path?: string;
  user_id: number;
  work_scope_id: number;
  work_type: string;
  quantity: number;
  uom: string;
  is_additional_wo_details: boolean;
  spk_number?: string;
  spkk_number?: string;
  notes?: string;
  work_location: string;
}

export interface WorkProgress {
  progress_percentage: number;
  id: number;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
  work_details_id: number;
  progress: number;
  report_date: string;
  photo_evidence?: string;
  storage_path?: string;
  user_id: number;
  notes?: string;
}

export interface WorkDetailsWithProgress extends WorkDetails {
  work_progress: WorkProgress[];
  current_progress?: number;
  latest_progress_date?: string;
}

export interface WorkOrderWithDetails extends WorkOrder {
  work_details: WorkDetailsWithProgress[];
  vessel?: {
    id: number;
    name: string;
    type: string;
    company: string;
  };
  overall_progress?: number;
  has_progress_data?: boolean;
}

export interface Profile {
  id: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  name: string;
  email: string;
  company: string;
  role: string;
  auth_user_id: string;
}

export interface User {
  id: string;
  email: string;
  created_at: string;
}
