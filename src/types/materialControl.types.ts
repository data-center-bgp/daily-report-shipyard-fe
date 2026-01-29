// Master material list interface
export interface MaterialList {
  id: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  material: string;
  specification: string | null;
  category: string | null;
}

// Material control interface (actual usage)
export interface MaterialControl {
  id: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  material_id: number;
  size: string | null;
  amount: number;
  uom: string;
  work_details_id: number;
  bastp_id: number;
}

// Material control with related data
export interface MaterialControlWithDetails extends MaterialControl {
  material_list?: MaterialList;
  work_details?: {
    id: number;
    description: string;
    quantity: number;
    uom: string;
    work_order?: {
      shipyard_wo_number: string;
      customer_wo_number: string | null;
      vessel?: {
        name: string;
        type: string;
      };
    };
  };
}

// Form data for creating/editing material control
export interface MaterialControlFormData {
  material_id: number;
  size: string;
  amount: number;
  uom: string;
}
