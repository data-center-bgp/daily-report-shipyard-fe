export interface InvoiceWorkDetail {
  id: number;
  invoice_details_id: number;
  work_details_id: number;
  unit_price: number;
  payment_price: number;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
  work_details?: {
    id: number;
    created_at: string;
    updated_at: string;
    deleted_at?: string | null;
    work_order_id: number;
    description: string;
    location_id?: number;
    location?: {
      id: number;
      location: string;
    };
    planned_start_date: string;
    target_close_date: string;
    period_close_target?: string;
    actual_start_date?: string | null;
    actual_close_date?: string | null;
    pic: string;
    work_permit_url?: string | null;
    storage_path?: string | null;
    user_id: number;
    work_scope_id?: number;
    work_scope?: {
      id: number;
      work_scope: string;
    };
    quantity: number;
    uom: string;
    is_additional_wo_details?: boolean;
    spk_number?: string | null;
    spkk_number?: string | null;
    ptw_number?: string | null;
    notes?: string | null;
    work_order?: {
      id: number;
      created_at: string;
      updated_at: string;
      deleted_at?: string | null;
      vessel_id: number;
      shipyard_wo_number: string;
      shipyard_wo_date: string;
      customer_wo_number?: string | null;
      customer_wo_date?: string | null;
      user_id: number;
      is_additional_wo?: boolean;
      kapro_id?: number | null;
      work_location?: string | null;
      work_type?: string | null;
      vessel?: {
        id: number;
        name: string;
        type: string;
        company: string;
      };
      kapro?: {
        id: number;
        kapro_name: string;
      };
    };
  };
}

export interface Invoice {
  id: number;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;

  // References
  bastp_id: number;
  work_order_id?: number | null; // Nullable, derived from BASTP
  user_id: number;

  // Invoice details - matching your DB schema
  bastp_collection_date?: string | null;
  company?: string | null;
  invoice_number?: string | null;
  faktur_number?: string | null;
  due_date?: string | null;
  delivery_date?: string | null;
  collection_date?: string | null;
  receiver_name?: string | null;

  // Payment status
  payment_status: boolean;
  payment_date?: string | null;
  remarks?: string | null;

  // Relations
  bastp?: {
    id: number;
    created_at: string;
    updated_at: string;
    deleted_at?: string | null;
    number: string;
    date: string;
    delivery_date?: string | null;
    bastp_upload_date?: string | null;
    document_url?: string | null;
    storage_path?: string | null;
    status: string;
    verification_status?: string | null;
    verification_date?: string | null;
    verification_notes?: string | null;
    is_invoiced: boolean;
    invoiced_date?: string | null;
    total_work_details: number;
    vessel_id: number;
    user_id: number;
    vessel?: {
      id: number;
      name: string;
      type: string;
      company: string;
      created_at?: string;
      updated_at?: string;
      deleted_at?: string | null;
    };
    bastp_work_details?: Array<{
      id: number;
      created_at: string;
      updated_at: string;
      deleted_at?: string | null;
      bastp_id: number;
      work_details_id: number;
      work_details?: {
        id: number;
        description: string;
        quantity: number;
        uom: string;
        planned_start_date?: string;
        target_close_date?: string;
        actual_start_date?: string | null;
        actual_close_date?: string | null;
        pic?: string;
        location?: {
          id: number;
          location: string;
        };
        work_scope?: {
          id: number;
          work_scope: string;
        };
        work_order?: {
          id: number;
          shipyard_wo_number: string;
          customer_wo_number?: string | null;
          work_type?: string | null;
          work_location?: string | null;
          is_additional_wo?: boolean;
        };
      };
    }>;
  };

  work_order?: {
    id: number;
    created_at: string;
    updated_at: string;
    deleted_at?: string | null;
    vessel_id: number;
    shipyard_wo_number: string;
    shipyard_wo_date: string;
    customer_wo_number?: string | null;
    customer_wo_date?: string | null;
    user_id: number;
    is_additional_wo?: boolean;
    kapro_id?: number | null;
    work_location?: string | null;
    work_type?: string | null;
    vessel?: {
      id: number;
      name: string;
      type: string;
      company: string;
      created_at?: string;
      updated_at?: string;
      deleted_at?: string | null;
    };
    kapro?: {
      id: number;
      kapro_name: string;
      created_at?: string;
      updated_at?: string;
      deleted_at?: string | null;
    };
    profiles?: {
      id: number;
      name: string;
      email: string;
      company: string;
      role: string;
    };
  };

  profiles?: {
    id: number;
    created_at: string;
    updated_at: string;
    deleted_at?: string | null;
    name: string;
    email: string;
    company: string;
    role: string;
    auth_user_id: string;
  };

  invoice_work_details?: InvoiceWorkDetail[];

  // Computed fields
  total_amount?: number; // Sum of all payment_price from invoice_work_details
}

export interface WorkDetailsWithInvoiceStatus {
  id: number;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
  work_order_id: number;
  description: string;
  location_id?: number;
  location?: {
    id: number;
    location: string;
  };
  planned_start_date: string;
  target_close_date: string;
  period_close_target?: string;
  actual_start_date?: string | null;
  actual_close_date?: string | null;
  pic: string;
  work_permit_url?: string | null;
  storage_path?: string | null;
  user_id: number;
  work_scope_id?: number;
  work_scope?: {
    id: number;
    work_scope: string;
  };
  quantity: number;
  uom: string;
  is_additional_wo_details?: boolean;
  spk_number?: string | null;
  spkk_number?: string | null;
  ptw_number?: string | null;
  notes?: string | null;
  is_invoiced: boolean;
  invoice_details_id?: number | null;
  payment_price?: number; // From invoice_work_details junction table
  work_order?: {
    id: number;
    created_at: string;
    updated_at: string;
    deleted_at?: string | null;
    vessel_id: number;
    shipyard_wo_number: string;
    shipyard_wo_date: string;
    customer_wo_number?: string | null;
    customer_wo_date?: string | null;
    user_id: number;
    is_additional_wo?: boolean;
    kapro_id?: number | null;
    work_location?: string | null;
    work_type?: string | null;
    vessel?: {
      id: number;
      name: string;
      type: string;
      company: string;
    };
  };
}

// Helper type for creating new invoices
export interface CreateInvoiceInput {
  bastp_id: number;
  bastp_collection_date?: string;
  company?: string;
  invoice_number?: string;
  faktur_number?: string;
  due_date?: string;
  delivery_date?: string;
  collection_date?: string;
  receiver_name?: string;
  payment_status: boolean;
  payment_date?: string;
  remarks?: string;
  user_id: number;
  work_details: Array<{
    work_details_id: number;
    payment_price: number;
  }>;
}

// Helper type for updating invoices
export interface UpdateInvoiceInput {
  bastp_collection_date?: string;
  company?: string;
  invoice_number?: string;
  faktur_number?: string;
  due_date?: string;
  delivery_date?: string;
  collection_date?: string;
  receiver_name?: string;
  payment_status?: boolean;
  payment_date?: string;
  remarks?: string;
}

// Type for invoice list display
export interface InvoiceListItem extends Invoice {
  vessel_name?: string;
  shipyard_wo_number?: string;
  bastp_number?: string;
  work_details_count?: number;
}
