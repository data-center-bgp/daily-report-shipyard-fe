import type { GeneralService } from "./generalService.types";

export interface InvoiceWorkDetails {
  id: number;
  invoice_details_id: number;
  work_details_id: number;
  unit_price: number;
  payment_price: number;
  work_details?: {
    id: number;
    description: string;
    quantity: number;
    uom: string;
    pic?: string | null;
    planned_start_date?: string | null;
    target_close_date?: string | null;
    actual_start_date?: string | null;
    actual_close_date?: string | null;
    location?: {
      id: number;
      location: string;
    };
    work_scope?: {
      id: number;
      work_scope: string;
    };
    work_order?: {
      id: number;
      shipyard_wo_number?: string | null;
      customer_wo_number?: string | null;
    };
  };
}

export interface Invoice {
  id: number;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
  bastp_id: number;
  user_id: number;
  bastp_collection_date?: string | null;
  company?: string | null;
  invoice_number?: string | null;
  faktur_number?: string | null;
  due_date?: string | null;
  delivery_date?: string | null;
  collection_date?: string | null;
  receiver_name?: string | null;
  payment_status: boolean;
  payment_date?: string | null;
  remarks?: string | null;
  total_price_before?: number;
  ppn?: number;
  pph_23?: number;
  total_price_after?: number;
  bastp?: {
    id: number;
    number: string;
    date: string;
    delivery_date?: string | null;
    status: string;
    storage_path?: string | null;
    bastp_upload_date?: string | null;
    vessel?: {
      id: number;
      name: string;
      type: string;
      company: string;
    };
    general_services?: GeneralService[];
  };
  profiles?: {
    id: number;
    name: string;
    email: string;
  };
  invoice_work_details?: InvoiceWorkDetails[];
}

export interface InvoiceFormData {
  bastp_id: number;
  bastp_collection_date?: string;
  company?: string;
  invoice_number?: string;
  faktur_number?: string;
  due_date?: string;
  delivery_date?: string;
  collection_date?: string;
  receiver_name?: string;
  payment_status: boolean;
  payment_date?: string;
  remarks?: string;
}
