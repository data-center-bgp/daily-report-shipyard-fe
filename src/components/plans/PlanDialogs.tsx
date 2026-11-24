import { useEffect, useId, useRef, useState } from "react";
import { Loader2, X } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { ActivityLogService } from "../../services/activityLogService";
import SearchableSelect from "../common/SearchableSelect";
import { PLAN_UOM_OPTIONS } from "../../constants/planUnits";
import type {
  PlanRow,
  PlanWorkDetail,
  PlanWorkOrder,
  ReviewDecision,
  ReviewerRole,
} from "../../types/dockingPlan.types";
import {
  fieldClass,
  primaryButton,
  secondaryButton,
} from "./planStatus";

export interface LookupOption {
  id: number;
  label: string;
}

const UOM_OPTIONS = PLAN_UOM_OPTIONS;
const labelClass = "mb-1 block text-sm font-medium text-slate-700";

// A native modal <dialog>: the page behind goes inert, focus moves in and
// returns to the trigger, and Escape closes it. A click on the backdrop closes
// it too.
export function Modal({
  title,
  onClose,
  wide = false,
  children,
}: {
  title: string;
  onClose: () => void;
  wide?: boolean;
  children: React.ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialogRef.current) onClose();
      }}
      className={`m-auto max-h-[90dvh] w-[calc(100%-2rem)] ${wide ? "max-w-3xl" : "max-w-xl"} overflow-hidden rounded-lg border border-slate-200 bg-white p-0 text-slate-900 shadow-xl backdrop:bg-slate-950/50`}
    >
      <div className="flex max-h-[90dvh] flex-col">
        <div className="flex items-center justify-between border-b border-slate-200 py-2 pl-4 pr-2">
          <h2 id={titleId} className="text-lg font-semibold">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-11 w-11 items-center justify-center rounded-md text-slate-700 hover:bg-slate-100"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}

function DialogFooter({
  saving,
  submitLabel,
  onClose,
}: {
  saving: boolean;
  submitLabel: string;
  onClose: () => void;
}) {
  return (
    <div className="flex justify-end gap-2 border-t border-slate-200 p-3">
      <button type="button" onClick={onClose} className={secondaryButton}>
        Cancel
      </button>
      <button type="submit" disabled={saving} className={primaryButton}>
        {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        {saving ? "Saving" : submitLabel}
      </button>
    </div>
  );
}

// ── Work order ──────────────────────────────────────────────────────────────

export function PlanWorkOrderDialog({
  plan,
  existing,
  nextSortOrder,
  onClose,
  onSaved,
}: {
  plan: PlanRow;
  existing: PlanWorkOrder | null;
  nextSortOrder: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const ids = { loc: useId(), cust: useId(), notes: useId() };
  const [form, setForm] = useState({
    work_location: existing?.work_location || "",
    customer_wo_number: existing?.customer_wo_number || "",
    notes: existing?.notes || "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const values = {
      work_location: form.work_location.trim() || null,
      customer_wo_number: form.customer_wo_number.trim() || null,
      notes: form.notes.trim() || null,
    };
    try {
      setSaving(true);
      if (existing) {
        const { error: updateError } = await supabase
          .from("docking_plan_work_orders")
          .update({ ...values, updated_at: new Date().toISOString() })
          .eq("id", existing.id)
          .select("id")
          .single();
        if (updateError) throw updateError;
        await ActivityLogService.logActivity({
          action: "update",
          tableName: "docking_plan_work_orders",
          recordId: existing.id,
          oldData: existing,
          newData: values,
          description: `Edited a work order in plan ${plan.plan_name}`,
        });
      } else {
        const { data, error: insertError } = await supabase
          .from("docking_plan_work_orders")
          .insert({ ...values, plan_id: plan.id, sort_order: nextSortOrder })
          .select("id")
          .single();
        if (insertError) throw insertError;
        await ActivityLogService.logActivity({
          action: "create",
          tableName: "docking_plan_work_orders",
          recordId: data.id,
          newData: values,
          description: `Added a work order to plan ${plan.plan_name}`,
        });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The work order could not be saved.");
      setSaving(false);
    }
  };

  return (
    <Modal title={existing ? "Edit work order" : "Add work order"} onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <p className="text-sm text-slate-600">
            The work type follows the plan ({plan.docking_type || "not set"}).
            The shipyard assigns the WO number when it converts the plan.
          </p>
          {error && (
            <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900">
              {error}
            </p>
          )}
          <div>
            <label htmlFor={ids.loc} className={labelClass}>
              Work location
            </label>
            <input
              id={ids.loc}
              type="text"
              value={form.work_location}
              onChange={(e) => setForm((p) => ({ ...p, work_location: e.target.value }))}
              className={fieldClass}
              placeholder="e.g. Dry dock, Pier 2"
            />
          </div>
          <div>
            <label htmlFor={ids.cust} className={labelClass}>
              Customer WO number
            </label>
            <input
              id={ids.cust}
              type="text"
              value={form.customer_wo_number}
              onChange={(e) => setForm((p) => ({ ...p, customer_wo_number: e.target.value }))}
              className={fieldClass}
            />
          </div>
          <div>
            <label htmlFor={ids.notes} className={labelClass}>
              Notes
            </label>
            <textarea
              id={ids.notes}
              rows={3}
              value={form.notes}
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
              className={`${fieldClass} sm:min-h-0`}
            />
          </div>
        </div>
        <DialogFooter
          saving={saving}
          submitLabel={existing ? "Save changes" : "Add work order"}
          onClose={onClose}
        />
      </form>
    </Modal>
  );
}

// ── Work detail ─────────────────────────────────────────────────────────────

export function PlanWorkDetailDialog({
  plan,
  workOrderId,
  existing,
  nextSortOrder,
  scopes,
  locations,
  onClose,
  onSaved,
}: {
  plan: PlanRow;
  workOrderId: number;
  existing: PlanWorkDetail | null;
  nextSortOrder: number;
  scopes: LookupOption[];
  locations: LookupOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const ids = {
    desc: useId(),
    scope: useId(),
    loc: useId(),
    qty: useId(),
    uom: useId(),
    start: useId(),
    close: useId(),
    notes: useId(),
  };
  const [form, setForm] = useState({
    description: existing?.description || "",
    work_scope_id: existing?.work_scope_id || 0,
    location_id: existing?.location_id || 0,
    quantity: existing?.quantity != null ? String(existing.quantity) : "",
    uom: existing?.uom || "",
    planned_start_date: existing?.planned_start_date || "",
    target_close_date: existing?.target_close_date || "",
    notes: existing?.notes || "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!form.description.trim()) return setError("Describe the work.");
    if (!form.location_id) return setError("Choose the location.");
    if (!form.work_scope_id) return setError("Choose the work scope.");
    const quantity = Number(form.quantity);
    if (form.quantity === "" || Number.isNaN(quantity) || quantity < 0) {
      return setError("Enter the quantity (0 or more).");
    }
    if (!form.uom) return setError("Choose the UOM.");
    if (
      form.planned_start_date &&
      form.target_close_date &&
      form.target_close_date < form.planned_start_date
    ) {
      return setError("The target close date cannot be before the planned start date.");
    }

    const values = {
      description: form.description.trim(),
      work_scope_id: form.work_scope_id,
      location_id: form.location_id,
      quantity,
      uom: form.uom,
      planned_start_date: form.planned_start_date || null,
      target_close_date: form.target_close_date || null,
      notes: form.notes.trim() || null,
    };

    try {
      setSaving(true);
      if (existing) {
        const { error: updateError } = await supabase
          .from("docking_plan_work_details")
          .update({ ...values, updated_at: new Date().toISOString() })
          .eq("id", existing.id)
          .select("id")
          .single();
        if (updateError) throw updateError;
        await ActivityLogService.logActivity({
          action: "update",
          tableName: "docking_plan_work_details",
          recordId: existing.id,
          oldData: existing,
          newData: values,
          description: `Edited a work detail in plan ${plan.plan_name}`,
        });
      } else {
        const { data, error: insertError } = await supabase
          .from("docking_plan_work_details")
          .insert({ ...values, plan_work_order_id: workOrderId, sort_order: nextSortOrder })
          .select("id")
          .single();
        if (insertError) throw insertError;
        await ActivityLogService.logActivity({
          action: "create",
          tableName: "docking_plan_work_details",
          recordId: data.id,
          newData: values,
          description: `Added a work detail to plan ${plan.plan_name}`,
        });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The work detail could not be saved.");
      setSaving(false);
    }
  };

  return (
    <Modal title={existing ? "Edit work detail" : "Add work detail"} onClose={onClose}>
      <form onSubmit={handleSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {error && (
            <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900">
              {error}
            </p>
          )}
          <div>
            <label htmlFor={ids.desc} className={labelClass}>
              Description <span aria-hidden="true">*</span>
            </label>
            <textarea
              id={ids.desc}
              rows={3}
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              className={`${fieldClass} sm:min-h-0`}
              placeholder="Describe the work"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor={ids.loc} className={labelClass}>
                Location <span aria-hidden="true">*</span>
              </label>
              <SearchableSelect
                id={ids.loc}
                value={form.location_id}
                onChange={(id) => setForm((p) => ({ ...p, location_id: id }))}
                options={locations}
                placeholder="Search location..."
              />
            </div>
            <div>
              <label htmlFor={ids.scope} className={labelClass}>
                Work scope <span aria-hidden="true">*</span>
              </label>
              <SearchableSelect
                id={ids.scope}
                value={form.work_scope_id}
                onChange={(id) => setForm((p) => ({ ...p, work_scope_id: id }))}
                options={scopes}
                placeholder="Search work scope..."
              />
            </div>
            <div>
              <label htmlFor={ids.qty} className={labelClass}>
                Quantity <span aria-hidden="true">*</span>
              </label>
              <input
                id={ids.qty}
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={form.quantity}
                onChange={(e) => setForm((p) => ({ ...p, quantity: e.target.value }))}
                className={fieldClass}
              />
            </div>
            <div>
              <label htmlFor={ids.uom} className={labelClass}>
                UOM <span aria-hidden="true">*</span>
              </label>
              <select
                id={ids.uom}
                value={form.uom}
                onChange={(e) => setForm((p) => ({ ...p, uom: e.target.value }))}
                className={fieldClass}
              >
                <option value="">Select UOM</option>
                {UOM_OPTIONS.map((uom) => (
                  <option key={uom} value={uom}>
                    {uom}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor={ids.start} className={labelClass}>
                Planned start
              </label>
              <input
                id={ids.start}
                type="date"
                value={form.planned_start_date}
                onChange={(e) => setForm((p) => ({ ...p, planned_start_date: e.target.value }))}
                className={fieldClass}
              />
            </div>
            <div>
              <label htmlFor={ids.close} className={labelClass}>
                Target close
              </label>
              <input
                id={ids.close}
                type="date"
                value={form.target_close_date}
                onChange={(e) => setForm((p) => ({ ...p, target_close_date: e.target.value }))}
                className={fieldClass}
              />
            </div>
          </div>
          <div>
            <label htmlFor={ids.notes} className={labelClass}>
              Notes
            </label>
            <textarea
              id={ids.notes}
              rows={2}
              value={form.notes}
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
              className={`${fieldClass} sm:min-h-0`}
            />
          </div>
          <p className="text-sm text-slate-600">
            PPIC adds the price, PIC and permit numbers after the plan is
            converted.
          </p>
        </div>
        <DialogFooter
          saving={saving}
          submitLabel={existing ? "Save changes" : "Add work detail"}
          onClose={onClose}
        />
      </form>
    </Modal>
  );
}

// ── Review ──────────────────────────────────────────────────────────────────

export function PlanReviewDialog({
  plan,
  roleOptions,
  lineNoteCount,
  onClose,
  onSubmit,
}: {
  plan: PlanRow;
  roleOptions: ReviewerRole[];
  lineNoteCount: number;
  onClose: () => void;
  onSubmit: (params: {
    reviewerRole: ReviewerRole;
    decision: ReviewDecision;
    generalNote: string;
  }) => Promise<void>;
}) {
  const ids = { note: useId() };
  const [role, setRole] = useState<ReviewerRole>(roleOptions[0]);
  const [decision, setDecision] = useState<ReviewDecision>("APPROVED");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (decision === "RETURNED" && !note.trim() && lineNoteCount === 0) {
      return setError("Add a note, or a note on a line, saying what needs to change.");
    }
    try {
      setSaving(true);
      await onSubmit({ reviewerRole: role, decision, generalNote: note });
    } catch (err) {
      setError(err instanceof Error ? err.message : "The review could not be saved.");
      setSaving(false);
    }
  };

  return (
    <Modal title={`Review ${plan.plan_name}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {error && (
            <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900">
              {error}
            </p>
          )}

          {roleOptions.length === 1 && (
            <p className="text-sm text-slate-700">
              You are signing off as <span className="font-semibold">{roleOptions[0]}</span>.
            </p>
          )}

          {roleOptions.length > 1 && (
            <fieldset>
              <legend className={labelClass}>Sign off as</legend>
              <div className="flex gap-2">
                {roleOptions.map((option) => (
                  <label
                    key={option}
                    className="flex min-h-11 flex-1 cursor-pointer items-center gap-2 rounded-md border border-slate-300 px-3 text-sm has-[:checked]:border-blue-950 has-[:checked]:bg-blue-50"
                  >
                    <input
                      type="radio"
                      name="reviewer-role"
                      checked={role === option}
                      onChange={() => setRole(option)}
                    />
                    {option}
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          <fieldset>
            <legend className={labelClass}>Decision</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {(
                [
                  { value: "APPROVED", label: "Approve the plan" },
                  { value: "RETURNED", label: "Send back for changes" },
                ] as const
              ).map((option) => (
                <label
                  key={option.value}
                  className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-slate-300 px-3 text-sm has-[:checked]:border-blue-950 has-[:checked]:bg-blue-50"
                >
                  <input
                    type="radio"
                    name="decision"
                    checked={decision === option.value}
                    onChange={() => setDecision(option.value)}
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </fieldset>

          <div>
            <label htmlFor={ids.note} className={labelClass}>
              {decision === "RETURNED" ? "What needs to change" : "Comment (optional)"}
            </label>
            <textarea
              id={ids.note}
              rows={4}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className={`${fieldClass} sm:min-h-0`}
            />
            <p className="mt-1 text-sm text-slate-600">
              {lineNoteCount > 0
                ? `${lineNoteCount} note${lineNoteCount === 1 ? "" : "s"} on individual lines will be sent too.`
                : "You can also leave a note on a single work order or work detail before sending."}
            </p>
          </div>
        </div>
        <DialogFooter
          saving={saving}
          submitLabel={decision === "APPROVED" ? "Approve" : "Send back"}
          onClose={onClose}
        />
      </form>
    </Modal>
  );
}

// ── Reopen ──────────────────────────────────────────────────────────────────

export function PlanReopenDialog({
  plan,
  onClose,
  onSubmit,
}: {
  plan: PlanRow;
  onClose: () => void;
  onSubmit: (reason: string) => Promise<void>;
}) {
  const noteId = useId();
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) return setError("Give a reason for reopening the plan.");
    try {
      setSaving(true);
      setError(null);
      await onSubmit(reason.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : "The plan could not be reopened.");
      setSaving(false);
    }
  };

  return (
    <Modal title="Reopen approved plan" onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <p className="text-sm text-slate-700">
            {plan.plan_name} goes back to draft so Shipping can change it. Both
            sign-offs are voided and it must be submitted and approved again.
          </p>
          {error && (
            <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900">
              {error}
            </p>
          )}
          <div>
            <label htmlFor={noteId} className={labelClass}>
              Reason <span aria-hidden="true">*</span>
            </label>
            <textarea
              id={noteId}
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className={`${fieldClass} sm:min-h-0`}
            />
          </div>
        </div>
        <DialogFooter saving={saving} submitLabel="Reopen plan" onClose={onClose} />
      </form>
    </Modal>
  );
}
