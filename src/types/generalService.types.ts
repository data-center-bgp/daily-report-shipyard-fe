export type GeneralServiceUom = "day" | "ton";

export interface GeneralServiceType {
  id: number;
  service_name: string;
  service_code: string;
  display_order: number;
  // "day" services use a start/close date range and total_days; "ton"
  // services (Fresh Water Supply) use a single supply date and quantity.
  uom: GeneralServiceUom;
  created_at: string;
  updated_at: string;
}

export interface GeneralService {
  id: number;
  bastp_id: number;
  service_type_id: number;
  start_date?: string | null;
  close_date?: string | null;
  total_days: number;
  quantity?: number | null;
  unit_price: number;
  payment_price: number;
  remarks?: string | null;
  created_at: string;
  updated_at: string;

  // Relations
  service_type?: GeneralServiceType;
}

export interface GeneralServiceInput {
  service_type_id: number;
  start_date: string;
  close_date: string;
  total_days: number;
  quantity?: number | null;
  remarks: string;
}
