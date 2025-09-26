export interface InvoiceWorkDetail {
  id: number;
  invoice_details_id: number;
  work_details_id: number;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
  work_details?: {
    id: number;
    description: string;
    location: string;
    pic: string;
  };
}

export interface WorkDetailsWithInvoiceStatus {
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
  is_invoiced: boolean;
  invoice_details_id?: number | null;
}
