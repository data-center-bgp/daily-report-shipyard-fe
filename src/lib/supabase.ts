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
  id?: number;
  customer_wo_number: string;
  customer_wo_date: string;
  shipyard_wo_number: string;
  shipyard_wo_date: string;
  vessel_id: number;
  wo_location: string;
  wo_description: string;
  quantity: number;
  planned_start_date: string;
  target_close_date: string;
  period_close_target: string;
  invoice_delivery_date: string;
  actual_start_date: string | null;
  actual_close_date: string | null;
  pic: string;
  created_at?: string;
  updated_at?: string;
  vessel?: Vessel;
  permits?: PermitToWork[];
}

export interface PermitToWork {
  id?: number;
  work_order_id: number;
  user_id: string;
  document_url: string | null;
  is_uploaded: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  work_order?: WorkOrder;
  user?: Profile;
}

export interface Profile {
  id: string;
  name: string;
  email: string;
  company: string;
  role: string;
  created_at?: string;
  updated_at?: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  company: string;
  role: string;
}
