import { useEffect, useId, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Loader2, Rocket } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../hooks/useAuth";
import { PageSkeleton } from "../common/Skeleton";
import { suggestProjectName } from "../../utils/projectNaming";
import { suggestWorkOrderNumber } from "../../utils/workOrderNumbering";
import {
  convertPlan,
  formatPlanDate,
  loadPlan,
} from "../../utils/dockingPlans";
import type { PlanBundle } from "../../types/dockingPlan.types";
import { fieldClass, primaryButton, secondaryButton } from "./planStatus";

interface Kapro {
  id: number;
  kapro_name: string;
}

interface WoDraft {
  planWorkOrderId: number;
  woDate: string;
  woNumber: string;
  numberEdited: boolean;
  customerWoDate: string;
  kaproId: number;
}

const today = () => new Date().toISOString().slice(0, 10);

// Gives each work order in the batch its own number. The helper numbers from
// what is already in the database, so work orders in this batch that fall in
// the same year are pushed one past the previous one.
async function numberBatch(dates: string[]): Promise<string[]> {
  const lastByYear = new Map<string, number>();
  const result: string[] = [];
  for (const date of dates) {
    const suggested = await suggestWorkOrderNumber(date);
    const match = suggested.match(/^(\d+)(\/.*\/(\d{4}))$/);
    if (!match) {
      result.push(suggested);
      continue;
    }
    const [, seqText, rest, year] = match;
    const previous = lastByYear.get(year);
    const seq = previous !== undefined ? Math.max(Number(seqText), previous + 1) : Number(seqText);
    lastByYear.set(year, seq);
    result.push(`${String(seq).padStart(seqText.length, "0")}${rest}`);
  }
  return result;
}

export default function ConvertPlan() {
  const { planId } = useParams();
  const id = Number(planId);
  const navigate = useNavigate();
  const { profile } = useAuth();
  const nameId = useId();

  const [bundle, setBundle] = useState<PlanBundle | null>(null);
  const [kapros, setKapros] = useState<Kapro[]>([]);
  const [projectName, setProjectName] = useState("");
  const [drafts, setDrafts] = useState<WoDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const allowed = profile?.role === "PPIC" || profile?.role === "MASTER";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [loaded, kaproRes] = await Promise.all([
          loadPlan(id),
          supabase.from("kapro").select("id, kapro_name").is("deleted_at", null).order("kapro_name"),
        ]);
        if (kaproRes.error) throw kaproRes.error;
        if (cancelled) return;

        const date = today();
        const numbers = await numberBatch(loaded.workOrders.map(() => date));
        const name = loaded.plan.vessel
          ? await suggestProjectName(
              loaded.plan.vessel.id,
              loaded.plan.vessel.name,
              loaded.plan.vessel.company || "",
              loaded.plan.docking_type || "",
            )
          : loaded.plan.plan_name;
        if (cancelled) return;

        setBundle(loaded);
        setKapros((kaproRes.data as Kapro[]) || []);
        setProjectName(name);
        setDrafts(
          loaded.workOrders.map((wo, i) => ({
            planWorkOrderId: wo.id,
            woDate: date,
            woNumber: numbers[i],
            numberEdited: false,
            customerWoDate: "",
            kaproId: 0,
          })),
        );
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load the plan");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Changing a WO date re-numbers the ones the user has not typed over.
  const dateKey = drafts.map((d) => d.woDate).join("|");
  useEffect(() => {
    if (drafts.length === 0) return;
    let cancelled = false;
    numberBatch(drafts.map((d) => d.woDate)).then((numbers) => {
      if (cancelled) return;
      setDrafts((prev) =>
        prev.map((d, i) => (d.numberEdited ? d : { ...d, woNumber: numbers[i] ?? d.woNumber })),
      );
    });
    return () => {
      cancelled = true;
    };
    // Only the dates matter here; reading `drafts` for its length is safe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateKey]);

  const update = (index: number, patch: Partial<WoDraft>) =>
    setDrafts((prev) => prev.map((d, i) => (i === index ? { ...d, ...patch } : d)));

  const duplicateNumbers = useMemo(() => {
    const seen = new Set<string>();
    const dupes = new Set<string>();
    drafts.forEach((d) => {
      const key = d.woNumber.trim();
      if (seen.has(key)) dupes.add(key);
      seen.add(key);
    });
    return dupes;
  }, [drafts]);

  const handleConvert = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bundle) return;
    setSubmitError(null);

    if (!projectName.trim()) return setSubmitError("Give the project a name.");
    for (const [i, d] of drafts.entries()) {
      if (!d.woNumber.trim()) return setSubmitError(`Work order ${i + 1} needs a WO number.`);
      if (!d.woDate) return setSubmitError(`Work order ${i + 1} needs a WO date.`);
      if (!d.kaproId) return setSubmitError(`Choose a kapro for work order ${i + 1}.`);
    }
    if (duplicateNumbers.size > 0) {
      return setSubmitError("Two work orders have the same WO number.");
    }

    try {
      setSaving(true);
      const projectId = await convertPlan(
        bundle.plan,
        projectName.trim(),
        drafts.map((d) => ({
          plan_work_order_id: d.planWorkOrderId,
          shipyard_wo_number: d.woNumber.trim(),
          shipyard_wo_date: d.woDate,
          customer_wo_date: d.customerWoDate || null,
          kapro_id: d.kaproId,
        })),
      );
      navigate(`/projects/${projectId}`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "The plan could not be converted.");
      setSaving(false);
    }
  };

  const pageShell = "mx-auto w-full max-w-5xl px-4 py-5 sm:px-6 lg:py-8";

  if (loading) {
    return (
      <div className={pageShell}>
        <PageSkeleton label="Loading plan..." padding="none" rows={4} columns={3} />
      </div>
    );
  }

  if (error || !bundle) {
    return (
      <div className={pageShell}>
        <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-900">
          {error || "This plan was not found."}{" "}
          <Link to="/plans" className="font-medium underline">
            Back to plans
          </Link>
        </p>
      </div>
    );
  }

  const { plan, workOrders } = bundle;

  if (!allowed || plan.status !== "APPROVED") {
    return (
      <div className={pageShell}>
        <p role="alert" className="rounded-lg border border-slate-300 bg-white p-4 text-sm text-slate-800">
          {!allowed
            ? "Only PPIC can convert a plan."
            : "Only an approved plan can be converted."}{" "}
          <Link to={`/plans/${plan.id}`} className="font-medium text-blue-800 underline">
            Back to the plan
          </Link>
        </p>
      </div>
    );
  }

  const labelClass = "mb-1 block text-sm font-medium text-slate-700";

  return (
    <div className={`${pageShell} space-y-6`}>
      <div>
        <Link
          to={`/plans/${plan.id}`}
          className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-blue-800 hover:underline"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to the plan
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">Convert to project</h1>
        <p className="mt-1 text-sm text-slate-600">
          {plan.plan_name}, docking {formatPlanDate(plan.target_docking_date)}. This creates the
          real project, work orders and work details from the approved plan. It cannot be undone
          from here.
        </p>
      </div>

      <form onSubmit={handleConvert} noValidate className="space-y-6">
        {submitError && (
          <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900">
            {submitError}
          </p>
        )}

        <section aria-labelledby="project-title" className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
          <h2 id="project-title" className="text-base font-semibold text-slate-900">
            Project
          </h2>
          <div>
            <label htmlFor={nameId} className={labelClass}>
              Project name <span aria-hidden="true">*</span>
            </label>
            <input
              id={nameId}
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              className={fieldClass}
            />
            <p className="mt-1 text-sm text-slate-600">
              Follows the usual company, vessel, docking type, year and number pattern.
            </p>
          </div>
        </section>

        <section aria-labelledby="wo-title" className="space-y-3">
          <h2 id="wo-title" className="text-base font-semibold text-slate-900">
            Work orders
          </h2>
          {workOrders.map((wo, index) => {
            const draft = drafts[index];
            if (!draft) return null;
            const fid = `wo-${wo.id}`;
            return (
              <fieldset key={wo.id} className="rounded-lg border border-slate-200 bg-white p-4">
                <legend className="px-1 text-sm font-semibold text-slate-900">
                  Work order {index + 1}
                  <span className="font-normal text-slate-600">
                    {" "}
                    ({wo.work_details.length} work detail{wo.work_details.length === 1 ? "" : "s"}
                    {wo.work_location ? `, ${wo.work_location}` : ""})
                  </span>
                </legend>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor={`${fid}-date`} className={labelClass}>
                      Shipyard WO date <span aria-hidden="true">*</span>
                    </label>
                    <input
                      id={`${fid}-date`}
                      type="date"
                      value={draft.woDate}
                      onChange={(e) => update(index, { woDate: e.target.value })}
                      className={fieldClass}
                    />
                  </div>
                  <div>
                    <label htmlFor={`${fid}-number`} className={labelClass}>
                      Shipyard WO number <span aria-hidden="true">*</span>
                    </label>
                    <input
                      id={`${fid}-number`}
                      type="text"
                      value={draft.woNumber}
                      onChange={(e) => update(index, { woNumber: e.target.value, numberEdited: true })}
                      aria-invalid={duplicateNumbers.has(draft.woNumber.trim())}
                      className={fieldClass}
                    />
                  </div>
                  <div>
                    <label htmlFor={`${fid}-kapro`} className={labelClass}>
                      Kapro <span aria-hidden="true">*</span>
                    </label>
                    <select
                      id={`${fid}-kapro`}
                      value={draft.kaproId}
                      onChange={(e) => update(index, { kaproId: Number(e.target.value) })}
                      className={fieldClass}
                    >
                      <option value={0}>Select kapro</option>
                      {kapros.map((k) => (
                        <option key={k.id} value={k.id}>
                          {k.kapro_name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor={`${fid}-cdate`} className={labelClass}>
                      Customer WO date
                    </label>
                    <input
                      id={`${fid}-cdate`}
                      type="date"
                      value={draft.customerWoDate}
                      onChange={(e) => update(index, { customerWoDate: e.target.value })}
                      className={fieldClass}
                    />
                  </div>
                </div>
                {wo.customer_wo_number && (
                  <p className="mt-3 text-sm text-slate-600">
                    Customer WO number from the plan: {wo.customer_wo_number}
                  </p>
                )}
              </fieldset>
            );
          })}
        </section>

        <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          The work orders skip the usual wait for an approved readiness form because HSSE has
          already signed off this plan. The project's readiness form is still filled in
          separately. Price, PIC and permit numbers are added on the work details afterwards.
        </p>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Link to={`/plans/${plan.id}`} className={secondaryButton}>
            Cancel
          </Link>
          <button type="submit" disabled={saving} className={primaryButton}>
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Rocket className="h-4 w-4" aria-hidden="true" />
            )}
            {saving ? "Converting" : "Create project and work orders"}
          </button>
        </div>
      </form>
    </div>
  );
}
