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

// Export types for use in components
export interface Vessel {
  id: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  name: string;
  type: string;
  company: string;
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
  wo_document_delivery_date?: string;
  user_id: number;
}

export interface WorkDetails {
  id: number;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
  work_order_id: number;
  description: string;
  location: string;
  planned_start_date: string;
  target_close_date: string;
  period_close_target: string;
  actual_start_date?: string;
  actual_close_date?: string;
  pic: string;
  work_permit_url?: string;
  storage_path?: string;
  user_id: number;
}

export interface WorkProgress {
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
}

// Extended interfaces for UI
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

// Fixed Profile interface to match your actual database schema
export interface Profile {
  id: number; // int in your DB
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  name: string; // text
  email: string; // text
  company: string; // text
  role: string; // text
  auth_user_id: string; // uuid
}

// User interface for auth.users table
export interface User {
  id: string; // uuid
  email: string;
  created_at: string;
}
