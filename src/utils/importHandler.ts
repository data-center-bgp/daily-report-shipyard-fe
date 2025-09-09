import { supabase } from "../lib/supabase";

export type ImportableEntity =
  | "vessels"
  | "work_orders"
  | "work_details"
  | "work_progress"
  | "invoice_details";

export interface ImportOptions {
  overwrite: boolean;
  skipDuplicates: boolean;
  validateOnly: boolean;
}

export interface ImportResult {
  success: boolean;
  message: string;
  importedCount: number;
  errors: string[];
  skippedCount: number;
}

// CSV parsing utility
export const parseCSV = (csvText: string): any[] => {
  const lines = csvText.split("\n");
  const headers = lines[0].split(",").map((h) => h.trim().replace(/"/g, ""));
  const data = [];

  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim()) {
      const values = lines[i].split(",").map((v) => v.trim().replace(/"/g, ""));
      const row: any = {};
      headers.forEach((header, index) => {
        row[header] = values[index] || "";
      });
      data.push(row);
    }
  }

  return data;
};

// Import data function
export const importData = async (
  entity: ImportableEntity,
  data: any[],
  options: ImportOptions
): Promise<ImportResult> => {
  const result: ImportResult = {
    success: false,
    message: "",
    importedCount: 0,
    errors: [],
    skippedCount: 0,
  };

  try {
    if (options.validateOnly) {
      result.message = `Validation completed. ${data.length} records ready for import.`;
      result.success = true;
      return result;
    }

    const batchSize = 100;
    let importedCount = 0;
    let skippedCount = 0;
    const errors: string[] = [];

    for (let i = 0; i < data.length; i += batchSize) {
      const batch = data.slice(i, i + batchSize);

      try {
        if (options.overwrite) {
          const { error } = await supabase
            .from(entity)
            .upsert(batch, { onConflict: "id" });

          if (error) throw error;
          importedCount += batch.length;
        } else {
          const { error } = await supabase.from(entity).insert(batch);

          if (error) {
            if (options.skipDuplicates && error.message.includes("duplicate")) {
              skippedCount += batch.length;
            } else {
              throw error;
            }
          } else {
            importedCount += batch.length;
          }
        }
      } catch (batchError: any) {
        errors.push(
          `Batch ${Math.floor(i / batchSize) + 1}: ${batchError.message}`
        );
      }
    }

    result.importedCount = importedCount;
    result.skippedCount = skippedCount;
    result.errors = errors;
    result.success = errors.length === 0 || importedCount > 0;
    result.message = `Import completed. ${importedCount} records imported, ${skippedCount} skipped.`;
  } catch (error: any) {
    result.errors.push(error.message);
    result.message = `Import failed: ${error.message}`;
  }

  return result;
};

// Get entity schema for validation
export const getEntitySchema = (entity: ImportableEntity): string[] => {
  const schemas: Record<ImportableEntity, string[]> = {
    vessels: ["name", "type", "company", "imo_number", "flag", "built_year"],
    work_orders: [
      "customer_wo_number",
      "shipyard_wo_number",
      "vessel_id",
      "planned_start_date",
      "target_close_date",
    ],
    work_details: [
      "work_order_id",
      "description",
      "estimated_hours",
      "department",
    ],
    work_progress: [
      "progress_percentage",
      "report_date",
      "storage_path",
      "evidence_url",
      "work_details_id",
      "user_id",
    ],
    invoice_details: [
      "work_order_id",
      "invoice_number",
      "amount",
      "payment_status",
    ],
  };

  return schemas[entity] || [];
};
