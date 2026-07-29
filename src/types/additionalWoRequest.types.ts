export type AdditionalWoRequestStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface AdditionalWoRequest {
  id: number;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
  project_id: number;
  vessel_id: number;
  requested_by: number;
  reason: string;
  status: AdditionalWoRequestStatus;
  decided_by: number | null;
  decided_at: string | null;
  decision_notes: string | null;
  work_order_id: number | null;
  is_chairman_directive: boolean;
}

export interface AdditionalWoRequestWithDetails extends AdditionalWoRequest {
  project?: { id: number; project_name: string };
  vessel?: { id: number; name: string; type: string; company: string };
  requester?: { id: number; name: string; email: string };
  decider?: { id: number; name: string; email: string } | null;
}
