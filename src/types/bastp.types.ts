import type { GeneralService } from "./generalService.types";
import type { MaterialControl } from "./materialControl.types";

export type BASTPStatus =
  | "DRAFT"
  | "VERIFIED"
  | "READY_FOR_INVOICE"
  | "INVOICED";

export interface BASTP {
  id: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  number: string;
  date: string;
  bastp_upload_date?: string | null;
  document_url?: string | null;
  storage_path?: string | null;
  form_penawaran_storage_path?: string | null;
  form_penawaran_uploaded_at?: string | null;
  status: BASTPStatus;
  verification_status?: string | null;
  verification_date?: string | null;
  verification_notes?: string | null;
  is_invoiced: boolean;
  invoiced_date?: string | null;
  ready_for_invoice_date?: string | null;
  total_work_details: number;
  vessel_id: number;
  user_id: number;
  general_services?: GeneralService[];
}

export type MaterialsStatus = "DRAFT" | "SUBMITTED";

export interface BASTPWorkDetails {
  id: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  bastp_id: number;
  work_details_id: number;
  materials_status: MaterialsStatus;
  materials_submitted_at: string | null;
  materials_submitted_by: number | null;
}

export interface BASTPWithDetails extends BASTP {
  bastp_work_details?: Array<
    BASTPWorkDetails & {
      work_details?: {
        id: number;
        description: string;
        quantity: number;
        uom: string;
        ppic_price?: number | null;
        cancelled_at?: string | null;
        planned_start_date?: string;
        target_close_date?: string;
        pic?: string;
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
          shipyard_wo_number: string;
          customer_wo_number: string;
        };
        material_control?: MaterialControl[];
        work_verification?: Array<{
          status: "APPROVED" | "REJECTED";
          created_at: string;
          deleted_at: string | null;
        }>;
      };
    }
  >;
  vessel?: {
    id: number;
    name: string;
    type: string;
    company: string;
  };
  profiles?: {
    id: number;
    name: string;
    email: string;
  };
}
