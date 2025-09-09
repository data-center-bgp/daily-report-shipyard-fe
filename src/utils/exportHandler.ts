import { supabase } from "../lib/supabase";

export interface ExportOptions {
  format: "csv";
  filters?: {
    vesselIds?: number[];
  };
}

export interface ExportData {
  data: any[];
  filename: string;
  totalRecords: number;
}

// CSV generation utility
export const generateCSV = (data: any[]): string => {
  if (!data.length) return "";

  const headers = Object.keys(data[0]);
  const csvContent = [
    headers.join(","),
    ...data.map((row) =>
      headers
        .map((header) => {
          const value = row[header];
          // Handle null/undefined values and escape commas and quotes
          if (value === null || value === undefined) return "";
          const stringValue = String(value);
          if (
            stringValue.includes(",") ||
            stringValue.includes('"') ||
            stringValue.includes("\n")
          ) {
            return `"${stringValue.replace(/"/g, '""')}"`;
          }
          return stringValue;
        })
        .join(",")
    ),
  ].join("\n");

  return csvContent;
};

// Download file utility
export const downloadFile = (
  content: string,
  filename: string,
  mimeType: string
) => {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

// Export comprehensive vessel data with all related tables joined
export const exportVesselData = async (
  options: ExportOptions
): Promise<ExportData> => {
  const vesselFilter = options.filters?.vesselIds || [];
  let vesselName = "all_vessels";

  // Generate filename based on vessel selection
  if (vesselFilter.length > 0) {
    if (vesselFilter.length === 1) {
      const { data: vesselData } = await supabase
        .from("vessel")
        .select("name")
        .eq("id", vesselFilter[0])
        .single();

      vesselName =
        vesselData?.name?.replace(/[^a-zA-Z0-9]/g, "_") ||
        `vessel_${vesselFilter[0]}`;
    } else {
      vesselName = `${vesselFilter.length}_vessels`;
    }
  }

  // Build the comprehensive query with correct vessel columns
  let query = supabase
    .from("vessel")
    .select(
      `
      id,
      name,
      type,
      company,
      work_order (
        id,
        created_at,
        updated_at,
        customer_wo_number,
        customer_wo_date,
        shipyard_wo_number,
        shipyard_wo_date,
        wo_document_delivery_date,
        user_id,
        vessel_id,
        work_details (
          id,
          created_at,
          updated_at,
          description,
          location,
          pic,
          planned_start_date,
          target_close_date,
          period_close_target,
          actual_start_date,
          actual_close_date,
          work_permit_url,
          storage_path,
          user_id,
          work_order_id,
          work_progress (
            id,
            progress_percentage,
            report_date,
            storage_path,
            evidence_url,
            work_details_id,
            user_id,
            created_at
          ),
          work_verification (
            id,
            verification_date,
            work_verification,
            user_id,
            work_details_id
          )
        ),
        invoice_details (
          id,
          created_at,
          updated_at,
          wo_document_collection_date,
          invoice_number,
          faktur_number,
          due_date,
          delivery_date,
          collection_date,
          receiver_name,
          payment_price,
          payment_status,
          payment_date,
          remarks,
          work_order_id,
          user_id
        )
      )
    `
    )
    .is("deleted_at", null);

  // Apply vessel filter if specified
  if (vesselFilter.length > 0) {
    query = query.in("id", vesselFilter);
  }

  const { data: vessels, error } = await query;

  if (error) {
    console.error("Supabase query error:", error);
    throw error;
  }

  if (!vessels || vessels.length === 0) {
    return {
      data: [],
      filename: `vessel_data_${vesselName}_${
        new Date().toISOString().split("T")[0]
      }.csv`,
      totalRecords: 0,
    };
  }

  // Flatten the nested data structure into a single table format
  const flattenedData: any[] = [];

  vessels.forEach((vessel: any) => {
    const baseVesselInfo = {
      vessel_id: vessel.id,
      vessel_name: vessel.name,
      vessel_type: vessel.type,
      vessel_company: vessel.company,
    };

    // If vessel has work orders
    if (vessel.work_order && vessel.work_order.length > 0) {
      vessel.work_order.forEach((workOrder: any) => {
        const baseWorkOrderInfo = {
          ...baseVesselInfo,
          work_order_id: workOrder.id,
          wo_created_at: workOrder.created_at,
          wo_updated_at: workOrder.updated_at,
          customer_wo_number: workOrder.customer_wo_number,
          customer_wo_date: workOrder.customer_wo_date,
          shipyard_wo_number: workOrder.shipyard_wo_number,
          shipyard_wo_date: workOrder.shipyard_wo_date,
          wo_document_delivery_date: workOrder.wo_document_delivery_date,
          wo_user_id: workOrder.user_id,
          wo_vessel_id: workOrder.vessel_id,
        };

        // Add invoice information if exists
        let invoiceInfo = {};
        if (workOrder.invoice_details && workOrder.invoice_details.length > 0) {
          const invoice = workOrder.invoice_details[0]; // Take first invoice
          invoiceInfo = {
            invoice_id: invoice.id,
            invoice_created_at: invoice.created_at,
            invoice_updated_at: invoice.updated_at,
            wo_document_collection_date: invoice.wo_document_collection_date,
            invoice_number: invoice.invoice_number,
            faktur_number: invoice.faktur_number,
            invoice_due_date: invoice.due_date,
            delivery_date: invoice.delivery_date,
            collection_date: invoice.collection_date,
            receiver_name: invoice.receiver_name,
            payment_price: invoice.payment_price,
            payment_status: invoice.payment_status,
            payment_date: invoice.payment_date,
            invoice_remarks: invoice.remarks,
            invoice_work_order_id: invoice.work_order_id,
            invoice_user_id: invoice.user_id,
          };
        }

        // If work order has work details
        if (workOrder.work_details && workOrder.work_details.length > 0) {
          workOrder.work_details.forEach((workDetail: any) => {
            const baseWorkDetailInfo = {
              ...baseWorkOrderInfo,
              ...invoiceInfo,
              work_detail_id: workDetail.id,
              wd_created_at: workDetail.created_at,
              wd_updated_at: workDetail.updated_at,
              work_description: workDetail.description,
              work_location: workDetail.location,
              work_pic: workDetail.pic,
              wd_planned_start_date: workDetail.planned_start_date,
              wd_target_close_date: workDetail.target_close_date,
              period_close_target: workDetail.period_close_target,
              wd_actual_start_date: workDetail.actual_start_date,
              wd_actual_close_date: workDetail.actual_close_date,
              work_permit_url: workDetail.work_permit_url,
              wd_storage_path: workDetail.storage_path,
              wd_user_id: workDetail.user_id,
              wd_work_order_id: workDetail.work_order_id,
            };

            // Add verification info if exists
            let verificationInfo = {};
            if (
              workDetail.work_verification &&
              workDetail.work_verification.length > 0
            ) {
              const verification = workDetail.work_verification[0];
              verificationInfo = {
                verification_id: verification.id,
                verification_date: verification.verification_date,
                work_verification: verification.work_verification,
                verification_user_id: verification.user_id,
                verification_work_details_id: verification.work_details_id,
              };
            }

            // If work detail has progress records
            if (
              workDetail.work_progress &&
              workDetail.work_progress.length > 0
            ) {
              workDetail.work_progress.forEach((progress: any) => {
                flattenedData.push({
                  ...baseWorkDetailInfo,
                  ...verificationInfo,
                  progress_id: progress.id,
                  progress_percentage: progress.progress_percentage,
                  report_date: progress.report_date,
                  progress_storage_path: progress.storage_path,
                  evidence_url: progress.evidence_url,
                  progress_work_details_id: progress.work_details_id,
                  progress_user_id: progress.user_id,
                  progress_created_at: progress.created_at,
                });
              });
            } else {
              // Work detail without progress
              flattenedData.push({
                ...baseWorkDetailInfo,
                ...verificationInfo,
                progress_id: null,
                progress_percentage: 0,
                report_date: null,
                progress_storage_path: null,
                evidence_url: null,
                progress_work_details_id: null,
                progress_user_id: null,
                progress_created_at: null,
              });
            }
          });
        } else {
          // Work order without work details
          flattenedData.push({
            ...baseWorkOrderInfo,
            ...invoiceInfo,
            work_detail_id: null,
            wd_created_at: null,
            wd_updated_at: null,
            work_description: null,
            work_location: null,
            work_pic: null,
            wd_planned_start_date: null,
            wd_target_close_date: null,
            period_close_target: null,
            wd_actual_start_date: null,
            wd_actual_close_date: null,
            work_permit_url: null,
            wd_storage_path: null,
            wd_user_id: null,
            wd_work_order_id: null,
            verification_id: null,
            verification_date: null,
            work_verification: null,
            verification_user_id: null,
            verification_work_details_id: null,
            progress_id: null,
            progress_percentage: 0,
            report_date: null,
            progress_storage_path: null,
            evidence_url: null,
            progress_work_details_id: null,
            progress_user_id: null,
            progress_created_at: null,
          });
        }
      });
    } else {
      // Vessel without work orders
      flattenedData.push({
        ...baseVesselInfo,
        work_order_id: null,
        wo_created_at: null,
        wo_updated_at: null,
        customer_wo_number: null,
        customer_wo_date: null,
        shipyard_wo_number: null,
        shipyard_wo_date: null,
        wo_document_delivery_date: null,
        wo_user_id: null,
        wo_vessel_id: null,
        invoice_id: null,
        invoice_created_at: null,
        invoice_updated_at: null,
        wo_document_collection_date: null,
        invoice_number: null,
        faktur_number: null,
        invoice_due_date: null,
        delivery_date: null,
        collection_date: null,
        receiver_name: null,
        payment_price: null,
        payment_status: null,
        payment_date: null,
        invoice_remarks: null,
        invoice_work_order_id: null,
        invoice_user_id: null,
        work_detail_id: null,
        wd_created_at: null,
        wd_updated_at: null,
        work_description: null,
        work_location: null,
        work_pic: null,
        wd_planned_start_date: null,
        wd_target_close_date: null,
        period_close_target: null,
        wd_actual_start_date: null,
        wd_actual_close_date: null,
        work_permit_url: null,
        wd_storage_path: null,
        wd_user_id: null,
        wd_work_order_id: null,
        verification_id: null,
        verification_date: null,
        work_verification: null,
        verification_user_id: null,
        verification_work_details_id: null,
        progress_id: null,
        progress_percentage: 0,
        report_date: null,
        progress_storage_path: null,
        evidence_url: null,
        progress_work_details_id: null,
        progress_user_id: null,
        progress_created_at: null,
      });
    }
  });

  const timestamp = new Date().toISOString().split("T")[0];
  const filename = `vessel_data_${vesselName}_${timestamp}.csv`;

  return {
    data: flattenedData,
    filename,
    totalRecords: flattenedData.length,
  };
};
