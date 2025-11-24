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

export interface ExportData<T = Record<string, unknown>> {
  entity: ExportableEntity;
  data: T[];
  filename: string;
  totalRecords: number;
}
