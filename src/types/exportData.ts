export interface ExportOptions {
  format: "csv"; // Only CSV format now
  filters?: {
    vesselIds?: number[];
    status?: string[];
    companies?: string[];
  };
}

export type ExportableEntity =
  | "vessels"
  | "work_orders"
  | "work_details"
  | "work_progress"
  | "invoices"
  | "permits";

export interface ExportData {
  entity: ExportableEntity;
  data: any[];
  filename: string;
  totalRecords: number;
}
