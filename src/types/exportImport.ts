export interface ImportResult {
  success: boolean;
  message: string;
  importedCount: number;
  errors: string[];
  skippedCount: number;
}

export interface ExportOptions {
  format: "csv"; // Only CSV format now
  filters?: {
    vesselIds?: number[];
    status?: string[];
    companies?: string[];
  };
}

export interface ImportOptions {
  overwrite: boolean;
  skipDuplicates: boolean;
  validateOnly: boolean;
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
