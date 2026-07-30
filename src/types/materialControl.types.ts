// Calculation formula used to derive a material_control row's total_amount.
// See src/utils/materialCalculations.ts for the actual formulas.
export type CalcMode = "AREA" | "DIMENSIONAL" | "CIRCULAR" | "COUNT";

// Material density lookup table
export interface MaterialDensity {
  id: number;
  name: string;
  density: number;
  unit: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

// Master material list interface
export interface MaterialList {
  id: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  material: string;
  specification: string | null;
  category: string | null;
  material_density_id: number | null;
  material_density?: MaterialDensity | null;
  calc_mode: CalcMode;
}

// Material control interface (actual usage)
export interface MaterialControl {
  id: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  material_id: number;
  material_density_id: number | null;
  calc_mode: CalcMode;
  length: number | null;
  width: number | null;
  thickness: number | null;
  area: number | null;
  layers: number | null;
  diameter: number | null;
  density: number | null;
  amount: number;
  total_amount: number | null;
  uom: string;
  work_details_id: number;
  bastp_id: number;
}

// Material control with related data
export interface MaterialControlWithDetails extends MaterialControl {
  material_list?: MaterialList;
  material_density?: MaterialDensity | null;
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
  material_density_id: number;
  calc_mode: CalcMode;
  length: number;
  width: number;
  thickness: number;
  area: number;
  layers: number;
  diameter: number;
  density: number;
  amount: number;
  total_amount: number;
  uom: string;
}
