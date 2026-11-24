import { useEffect, useId, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Loader2, Save } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../hooks/useAuth";
import { ActivityLogService } from "../../services/activityLogService";
import { WORK_TYPE_OPTIONS } from "../../constants/workTypes";
import SearchableSelect from "../common/SearchableSelect";
import LoadingState from "../common/LoadingState";
import { loadPlan } from "../../utils/dockingPlans";
import { fieldClass, primaryButton, secondaryButton } from "./planStatus";

interface VesselOption {
  id: number;
  name: string;
  type: string | null;
  company: string | null;
}

// Month and year of the docking, e.g. "Feb 2027", for the suggested name.
const monthYear = (date: string) =>
  new Date(`${date}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  });

export default function PlanForm() {
  const { planId } = useParams();
  const editingId = planId ? Number(planId) : null;
  const navigate = useNavigate();
  const { profile } = useAuth();
  const ids = { vessel: useId(), type: useId(), date: useId(), name: useId(), notes: useId() };

  const [vessels, setVessels] = useState<VesselOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    vessel_id: 0,
    docking_type: "",
    target_docking_date: "",
    plan_name: "",
    notes: "",
  });
  // Once the author types a name, vessel/type/date changes stop rewriting it.
  const [nameEdited, setNameEdited] = useState(false);

  const canAuthor = profile?.role === "SHIPPING" || profile?.role === "MASTER";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error: vesselError } = await supabase
          .from("vessel")
          .select("id, name, type, company")
          .is("deleted_at", null)
          .order("name");
        if (vesselError) throw vesselError;
        if (cancelled) return;
        setVessels((data as VesselOption[]) || []);

        if (editingId) {
          const { plan } = await loadPlan(editingId);
          if (cancelled) return;
          if (plan.status !== "DRAFT" && plan.status !== "NEEDS_CLARIFICATION") {
            navigate(`/plans/${plan.id}`, { replace: true });
            return;
          }
          setForm({
            vessel_id: plan.vessel_id,
            docking_type: plan.docking_type || "",
            target_docking_date: plan.target_docking_date,
            plan_name: plan.plan_name,
            notes: plan.notes || "",
          });
          setNameEdited(true);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load the form");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [editingId, navigate]);

  const vesselOptions = useMemo(
    () =>
      vessels.map((v) => ({
        id: v.id,
        label: v.company ? `${v.name} (${v.company})` : v.name,
      })),
    [vessels],
  );

  const suggestedName = useMemo(() => {
    const vessel = vessels.find((v) => v.id === form.vessel_id);
    if (!vessel || !form.docking_type || !form.target_docking_date) return "";
    return `${vessel.name} - ${form.docking_type} - ${monthYear(form.target_docking_date)}`;
  }, [vessels, form.vessel_id, form.docking_type, form.target_docking_date]);

  useEffect(() => {
    if (!nameEdited && suggestedName) {
      setForm((prev) => ({ ...prev, plan_name: suggestedName }));
    }
  }, [suggestedName, nameEdited]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!form.vessel_id) return setError("Choose the vessel.");
    if (!form.docking_type) return setError("Choose the docking type.");
    if (!form.target_docking_date) return setError("Set the target docking date.");
    if (!form.plan_name.trim()) return setError("Give the plan a name.");
    if (!profile) return setError("Your profile has not loaded yet. Try again.");

    const values = {
      plan_name: form.plan_name.trim(),
      vessel_id: form.vessel_id,
      docking_type: form.docking_type,
      target_docking_date: form.target_docking_date,
      notes: form.notes.trim() || null,
    };

    try {
      setSaving(true);
      if (editingId) {
        const { error: updateError } = await supabase
          .from("docking_plans")
          .update({ ...values, updated_at: new Date().toISOString() })
          .eq("id", editingId)
          .select("id")
          .single();
        if (updateError) throw updateError;
        await ActivityLogService.logActivity({
          action: "update",
          tableName: "docking_plans",
          recordId: editingId,
          newData: values,
          description: `Edited plan ${values.plan_name}`,
        });
        navigate(`/plans/${editingId}`, { state: { message: "Plan details saved." } });
      } else {
        const { data, error: insertError } = await supabase
          .from("docking_plans")
          .insert({ ...values, user_id: profile.id })
          .select("id")
          .single();
        if (insertError) throw insertError;
        await ActivityLogService.logActivity({
          action: "create",
          tableName: "docking_plans",
          recordId: data.id,
          newData: values,
          description: `Created plan ${values.plan_name}`,
        });
        navigate(`/plans/${data.id}`, {
          state: { message: "Plan created. Add its work orders and work details next." },
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "The plan could not be saved.");
      setSaving(false);
    }
  };

  if (loading) return <LoadingState />;

  if (!canAuthor) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-8">
        <p role="alert" className="rounded-lg border border-slate-300 bg-white p-4 text-sm text-slate-800">
          Only the Shipping team can create or edit plans.{" "}
          <Link to="/plans" className="font-medium text-blue-800 underline">
            Back to plans
          </Link>
        </p>
      </div>
    );
  }

  const labelClass = "mb-1 block text-sm font-medium text-slate-700";

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 px-4 py-5 sm:px-6 lg:py-8">
      <div>
        <Link
          to={editingId ? `/plans/${editingId}` : "/plans"}
          className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-blue-800 hover:underline"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {editingId ? "Back to plan" : "Back to plans"}
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">
          {editingId ? "Edit plan details" : "New docking plan"}
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Start with the vessel and when it is due to dock. You add work orders
          and work details on the next page.
        </p>
      </div>

      <form onSubmit={handleSubmit} noValidate className="space-y-5 rounded-lg border border-slate-200 bg-white p-4 sm:p-6">
        {error && (
          <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900">
            {error}
          </p>
        )}

        <div>
          <label htmlFor={ids.vessel} className={labelClass}>
            Vessel <span aria-hidden="true">*</span>
          </label>
          <SearchableSelect
            id={ids.vessel}
            value={form.vessel_id}
            onChange={(id) => setForm((prev) => ({ ...prev, vessel_id: id }))}
            options={vesselOptions}
            placeholder="Search vessel or company..."
          />
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor={ids.type} className={labelClass}>
              Docking type <span aria-hidden="true">*</span>
            </label>
            <select
              id={ids.type}
              value={form.docking_type}
              onChange={(e) => setForm((prev) => ({ ...prev, docking_type: e.target.value }))}
              className={fieldClass}
            >
              <option value="">Select type</option>
              {WORK_TYPE_OPTIONS.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={ids.date} className={labelClass}>
              Target docking date <span aria-hidden="true">*</span>
            </label>
            <input
              id={ids.date}
              type="date"
              value={form.target_docking_date}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, target_docking_date: e.target.value }))
              }
              className={fieldClass}
            />
          </div>
        </div>

        <div>
          <label htmlFor={ids.name} className={labelClass}>
            Plan name <span aria-hidden="true">*</span>
          </label>
          <input
            id={ids.name}
            type="text"
            value={form.plan_name}
            onChange={(e) => {
              setNameEdited(true);
              setForm((prev) => ({ ...prev, plan_name: e.target.value }));
            }}
            className={fieldClass}
          />
          <p className="mt-1 text-sm text-slate-600">
            Suggested from the vessel, type and month. The shipyard names the
            real project when it converts the plan.
          </p>
        </div>

        <div>
          <label htmlFor={ids.notes} className={labelClass}>
            Notes for the shipyard
          </label>
          <textarea
            id={ids.notes}
            rows={3}
            value={form.notes}
            onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
            className={`${fieldClass} sm:min-h-0`}
          />
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Link to={editingId ? `/plans/${editingId}` : "/plans"} className={secondaryButton}>
            Cancel
          </Link>
          <button type="submit" disabled={saving} className={primaryButton}>
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Save className="h-4 w-4" aria-hidden="true" />
            )}
            {saving ? "Saving" : editingId ? "Save changes" : "Create plan"}
          </button>
        </div>
      </form>
    </div>
  );
}
