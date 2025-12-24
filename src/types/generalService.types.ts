export interface GeneralServiceType {
  id: number;
  service_name: string;
  service_code: string;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface GeneralService {
  id: number;
  bastp_id: number;
  service_type_id: number;
  total_days: number;
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
  total_days: number;
  remarks?: string;
}
