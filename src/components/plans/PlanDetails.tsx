import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  MessageSquare,
  Pencil,
  Plus,
  RotateCcw,
  Rocket,
  Send,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../hooks/useAuth";
import { ActivityLogService } from "../../services/activityLogService";
import { PageSkeleton } from "../common/Skeleton";
import {
  describeLead,
  formatPlanDate,
  loadPlan,
  planGaps,
  reopenPlan,
  reviewPlan,
  submitPlan,
} from "../../utils/dockingPlans";
import type {
  PlanBundle,
  PlanReview,
  PlanWorkDetail,
  PlanWorkOrder,
  ReviewerRole,
} from "../../types/dockingPlan.types";
import {
  PLAN_STATUS,
  dangerButton,
  fieldClass,
  primaryButton,
  secondaryButton,
} from "./planStatus";
import {
  PlanReopenDialog,
  PlanReviewDialog,
  PlanWorkDetailDialog,
  PlanWorkOrderDialog,
  type LookupOption,
} from "./PlanDialogs";

type WorkDialog =
  | { kind: "work-order"; existing: PlanWorkOrder | null }
  | { kind: "work-detail"; workOrderId: number; existing: PlanWorkDetail | null }
  | { kind: "review" }
  | { kind: "reopen" };

interface LineNote {
  role: ReviewerRole;
  note: string;
}

const REVIEWERS: ReviewerRole[] = ["PPIC", "HSSE"];

export default function PlanDetails() {
  const { planId } = useParams();
  const id = Number(planId);
  const navigate = useNavigate();
  const location = useLocation();
  const { profile } = useAuth();

  const [bundle, setBundle] = useState<PlanBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<WorkDialog | null>(null);
  const [scopes, setScopes] = useState<LookupOption[]>([]);
  const [locations, setLocations] = useState<LookupOption[]>([]);
  // Notes the reviewer is drafting on single lines, sent with the decision.
  const [pendingNotes, setPendingNotes] = useState<Record<string, string>>({});
  const [openNotes, setOpenNotes] = useState<Set<string>>(new Set());
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const fetchPlan = useCallback(async () => {
    try {
      setError(null);
      setBundle(await loadPlan(id));
    } catch (err) {
      console.error("Error loading plan:", err);
      setError(err instanceof Error ? err.message : "Failed to load the plan");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    setLoading(true);
    fetchPlan();
  }, [fetchPlan]);

  useEffect(() => {
    const state = location.state as { message?: string } | null;
    if (state?.message) {
      setNotice(state.message);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location, navigate]);

  const plan = bundle?.plan;
  const role = profile?.role;
  const isAuthor =
    !!plan &&
    (role === "MASTER" || (role === "SHIPPING" && plan.user_id === profile?.id));
  const editable =
    !!plan && isAuthor && (plan.status === "DRAFT" || plan.status === "NEEDS_CLARIFICATION");

  // Lookups are only needed to add or edit a work detail.
  useEffect(() => {
    if (!editable || scopes.length > 0) return;
    (async () => {
      const [scopeRes, locationRes] = await Promise.all([
        supabase
          .from("work_scope")
          .select("id, work_scope")
          .is("deleted_at", null)
          .order("work_scope"),
        supabase
          .from("location")
          .select("id, location")
          .is("deleted_at", null)
          .order("location"),
      ]);
      setScopes(
        (scopeRes.data || []).map((s: { id: number; work_scope: string }) => ({
          id: s.id,
          label: s.work_scope,
        })),
      );
      setLocations(
        (locationRes.data || []).map((l: { id: number; location: string }) => ({
          id: l.id,
          label: l.location,
        })),
      );
    })();
  }, [editable, scopes.length]);

  const currentReviews = useMemo(
    () => (bundle ? bundle.reviews.filter((r) => r.revision_no === bundle.plan.revision_no) : []),
    [bundle],
  );

  // Notes from the current revision's reviews, keyed to the line they are on.
  const lineNotes = useMemo(() => {
    const byWo = new Map<number, LineNote[]>();
    const byWd = new Map<number, LineNote[]>();
    currentReviews.forEach((review) =>
      review.notes.forEach((n) => {
        const entry = { role: review.reviewer_role, note: n.note };
        if (n.plan_work_order_id) {
          byWo.set(n.plan_work_order_id, [...(byWo.get(n.plan_work_order_id) || []), entry]);
        }
        if (n.plan_work_detail_id) {
          byWd.set(n.plan_work_detail_id, [...(byWd.get(n.plan_work_detail_id) || []), entry]);
        }
      }),
    );
    return { byWo, byWd };
  }, [currentReviews]);

  const reviewRoleOptions: ReviewerRole[] = useMemo(() => {
    if (!plan || plan.status !== "SUBMITTED") return [];
    const mine: ReviewerRole[] =
      role === "PPIC" ? ["PPIC"] : role === "HSSE" ? ["HSSE"] : role === "MASTER" ? REVIEWERS : [];
    return mine.filter((r) => !currentReviews.some((rv) => rv.reviewer_role === r));
  }, [plan, role, currentReviews]);

  const canReview = reviewRoleOptions.length > 0;
  const canConvertOrReopen = !!plan && plan.status === "APPROVED" && (role === "PPIC" || role === "MASTER");
  const gaps = bundle ? planGaps(bundle.workOrders) : [];

  const openDialog = (next: WorkDialog) => {
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    setDialog(next);
  };
  const closeDialog = () => {
    setDialog(null);
    const target = returnFocusRef.current;
    requestAnimationFrame(() => {
      if (target && document.contains(target)) target.focus();
    });
  };
  const savedAndClose = async (message: string) => {
    closeDialog();
    setNotice(message);
    await fetchPlan();
  };

  const runAction = async (action: () => Promise<void>, success: string) => {
    try {
      setBusy(true);
      setActionError(null);
      await action();
      setNotice(success);
      await fetchPlan();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "That did not work.");
    } finally {
      setBusy(false);
    }
  };

  const softDelete = async (
    table: "docking_plan_work_orders" | "docking_plan_work_details",
    rowId: number,
    description: string,
  ) => {
    const now = new Date().toISOString();
    if (table === "docking_plan_work_orders") {
      const { error: detailError } = await supabase
        .from("docking_plan_work_details")
        .update({ deleted_at: now })
        .eq("plan_work_order_id", rowId)
        .is("deleted_at", null);
      if (detailError) throw detailError;
    }
    const { error: deleteError } = await supabase
      .from(table)
      .update({ deleted_at: now })
      .eq("id", rowId)
      .select("id")
      .single();
    if (deleteError) throw deleteError;
    await ActivityLogService.logActivity({
      action: "delete",
      tableName: table,
      recordId: rowId,
      description,
    });
  };

  const handleRemoveWorkOrder = (wo: PlanWorkOrder, index: number) => {
    if (
      !window.confirm(
        `Remove work order ${index + 1} and its ${wo.work_details.length} work detail(s) from this plan?`,
      )
    ) {
      return;
    }
    runAction(
      () => softDelete("docking_plan_work_orders", wo.id, `Removed a work order from plan ${plan?.plan_name}`),
      "Work order removed.",
    );
  };

  const handleRemoveWorkDetail = (wd: PlanWorkDetail) => {
    if (!window.confirm("Remove this work detail from the plan?")) return;
    runAction(
      () => softDelete("docking_plan_work_details", wd.id, `Removed a work detail from plan ${plan?.plan_name}`),
      "Work detail removed.",
    );
  };

  const handleDeletePlan = async () => {
    if (!plan) return;
    if (!window.confirm(`Delete the plan "${plan.plan_name}"? This cannot be undone from the app.`)) {
      return;
    }
    try {
      setBusy(true);
      setActionError(null);
      const { error: deleteError } = await supabase
        .from("docking_plans")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", plan.id)
        .select("id")
        .single();
      if (deleteError) throw deleteError;
      await ActivityLogService.logActivity({
        action: "delete",
        tableName: "docking_plans",
        recordId: plan.id,
        description: `Deleted plan ${plan.plan_name}`,
      });
      navigate("/plans", { state: { message: "Plan deleted." } });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "The plan could not be deleted.");
      setBusy(false);
    }
  };

  const toggleNote = (key: string) => {
    setOpenNotes((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const pendingLineNotes = Object.entries(pendingNotes)
    .filter(([, text]) => text.trim() !== "")
    .map(([key, text]) => {
      const [kind, rowId] = key.split("-");
      return kind === "wo"
        ? { work_order_id: Number(rowId), note: text.trim() }
        : { work_detail_id: Number(rowId), note: text.trim() };
    });

  const pageShell = "mx-auto w-full max-w-[96rem] px-4 py-5 sm:px-6 lg:px-8 lg:py-8";

  if (loading) {
    return (
      <div className={pageShell}>
        <PageSkeleton label="Loading plan..." padding="none" action rows={5} columns={5} />
      </div>
    );
  }

  if (error || !bundle || !plan) {
    return (
      <div className={pageShell}>
        <div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-900">
          <p className="font-semibold">This plan could not load.</p>
          <p className="mt-1">{error || "It may have been deleted."}</p>
          <Link to="/plans" className="mt-3 inline-flex min-h-11 items-center font-medium text-blue-800 underline">
            Back to plans
          </Link>
        </div>
      </div>
    );
  }

  const badge = PLAN_STATUS[plan.status];
  const { workOrders, reviews } = bundle;
  const detailCount = workOrders.reduce((sum, wo) => sum + wo.work_details.length, 0);

  return (
    <div className={`${pageShell} space-y-6`}>
      <div>
        <Link
          to="/plans"
          className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-blue-800 hover:underline"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to plans
        </Link>

        <header className="mt-1 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h1 className="break-words text-2xl font-bold text-slate-900 sm:text-3xl">
              {plan.plan_name}
            </h1>
            <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-700">
              <span
                className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium ${badge.className}`}
              >
                <badge.Icon className="h-3.5 w-3.5" aria-hidden="true" />
                {badge.label}
              </span>
              <span className="font-medium text-slate-900">{plan.vessel?.name || "No vessel"}</span>
              {plan.vessel?.company && <span>{plan.vessel.company}</span>}
              {plan.docking_type && <span>{plan.docking_type}</span>}
            </p>
            <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:flex sm:flex-wrap">
              <div>
                <dt className="text-slate-600">Target docking</dt>
                <dd className="font-medium text-slate-900">
                  {formatPlanDate(plan.target_docking_date)}{" "}
                  <span className="font-normal text-slate-600">
                    ({describeLead(plan.target_docking_date)})
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-slate-600">Scope</dt>
                <dd className="font-medium tabular-nums text-slate-900">
                  {workOrders.length} work order{workOrders.length === 1 ? "" : "s"}, {detailCount} detail
                  {detailCount === 1 ? "" : "s"}
                </dd>
              </div>
              <div>
                <dt className="text-slate-600">Planned by</dt>
                <dd className="font-medium text-slate-900">{plan.author?.name || "Unknown"}</dd>
              </div>
              {plan.revision_no > 0 && (
                <div>
                  <dt className="text-slate-600">Submission</dt>
                  <dd className="font-medium tabular-nums text-slate-900">#{plan.revision_no}</dd>
                </div>
              )}
            </dl>
          </div>

          <div className="flex flex-wrap gap-2 lg:justify-end">
            {editable && (
              <>
                <button
                  type="button"
                  disabled={busy || gaps.length > 0}
                  aria-describedby={gaps.length > 0 ? "submit-gaps" : undefined}
                  onClick={() =>
                    runAction(
                      () => submitPlan(plan),
                      "Plan submitted. PPIC and HSSE will review it.",
                    )
                  }
                  className={primaryButton}
                >
                  <Send className="h-4 w-4" aria-hidden="true" /> Submit for review
                </button>
                <Link to={`/plans/${plan.id}/edit`} className={secondaryButton}>
                  <Pencil className="h-4 w-4" aria-hidden="true" /> Edit details
                </Link>
                <button type="button" disabled={busy} onClick={handleDeletePlan} className={dangerButton}>
                  <Trash2 className="h-4 w-4" aria-hidden="true" /> Delete plan
                </button>
              </>
            )}
            {canReview && (
              <button
                type="button"
                disabled={busy}
                onClick={() => openDialog({ kind: "review" })}
                className={primaryButton}
              >
                <ShieldCheck className="h-4 w-4" aria-hidden="true" /> Review plan
              </button>
            )}
            {canConvertOrReopen && (
              <>
                <Link to={`/plans/${plan.id}/convert`} className={primaryButton}>
                  <Rocket className="h-4 w-4" aria-hidden="true" /> Convert to project
                </Link>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => openDialog({ kind: "reopen" })}
                  className={secondaryButton}
                >
                  <RotateCcw className="h-4 w-4" aria-hidden="true" /> Reopen
                </button>
              </>
            )}
          </div>
        </header>

        {editable && gaps.length > 0 && (
          <ul id="submit-gaps" className="mt-3 list-disc pl-5 text-sm text-slate-700">
            {gaps.map((gap) => (
              <li key={gap}>{gap}</li>
            ))}
          </ul>
        )}
      </div>

      {notice && (
        <p
          role="status"
          className="flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm font-medium text-emerald-900"
        >
          <CheckCircle2 className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
          {notice}
        </p>
      )}
      {actionError && (
        <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">
          {actionError}
        </p>
      )}

      <StatusPanel plan={plan} isAuthor={isAuthor} />

      {plan.revision_no > 0 && plan.status !== "DRAFT" && (
        <section aria-labelledby="signoff-title" className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 id="signoff-title" className="text-base font-semibold text-slate-900">
            Shipyard sign-off, submission #{plan.revision_no}
          </h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {REVIEWERS.map((reviewer) => (
              <SignOffCard
                key={reviewer}
                reviewer={reviewer}
                review={currentReviews.find((r) => r.reviewer_role === reviewer)}
              />
            ))}
          </div>
        </section>
      )}

      {plan.notes && (
        <section aria-label="Notes from Shipping" className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-base font-semibold text-slate-900">Notes from Shipping</h2>
          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{plan.notes}</p>
        </section>
      )}

      <section aria-labelledby="wo-title" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="wo-title" className="text-xl font-semibold text-slate-900">
            Work orders
          </h2>
          {editable && (
            <button
              type="button"
              disabled={busy}
              onClick={() => openDialog({ kind: "work-order", existing: null })}
              className={secondaryButton}
            >
              <Plus className="h-4 w-4" aria-hidden="true" /> Add work order
            </button>
          )}
        </div>

        {workOrders.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-10 text-center">
            <p className="text-sm font-medium text-slate-900">No work orders in this plan yet</p>
            <p className="mt-1 text-sm text-slate-600">
              {editable
                ? "Add a work order, then the work details under it."
                : "Shipping has not added any work orders."}
            </p>
          </div>
        ) : (
          workOrders.map((wo, index) => {
            const woKey = `wo-${wo.id}`;
            const woNotes = lineNotes.byWo.get(wo.id) || [];
            return (
              <article key={wo.id} className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold text-slate-900">Work order {index + 1}</h3>
                    <p className="text-sm text-slate-700">
                      {wo.work_location || "No location set"}
                      {wo.customer_wo_number && <> · Customer WO {wo.customer_wo_number}</>}
                    </p>
                    {wo.notes && <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{wo.notes}</p>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {editable && (
                      <>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            openDialog({ kind: "work-detail", workOrderId: wo.id, existing: null })
                          }
                          className={secondaryButton}
                        >
                          <Plus className="h-4 w-4" aria-hidden="true" /> Add work detail
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => openDialog({ kind: "work-order", existing: wo })}
                          aria-label={`Edit work order ${index + 1}`}
                          className={secondaryButton}
                        >
                          <Pencil className="h-4 w-4" aria-hidden="true" /> Edit
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleRemoveWorkOrder(wo, index)}
                          aria-label={`Remove work order ${index + 1}`}
                          className={dangerButton}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" /> Remove
                        </button>
                      </>
                    )}
                    {canReview && (
                      <button
                        type="button"
                        aria-expanded={openNotes.has(woKey)}
                        onClick={() => toggleNote(woKey)}
                        className={secondaryButton}
                      >
                        <MessageSquare className="h-4 w-4" aria-hidden="true" /> Note on this work order
                      </button>
                    )}
                  </div>
                </div>

                <LineNotes notes={woNotes} />
                {canReview && openNotes.has(woKey) && (
                  <NoteEditor
                    label={`Note on work order ${index + 1}`}
                    value={pendingNotes[woKey] || ""}
                    onChange={(text) => setPendingNotes((prev) => ({ ...prev, [woKey]: text }))}
                  />
                )}

                {wo.work_details.length === 0 ? (
                  <p className="p-4 text-sm text-slate-600">No work details yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="table-stack min-w-full divide-y divide-slate-200">
                      <caption className="sr-only">Work details of work order {index + 1}</caption>
                      <thead className="bg-white">
                        <tr>
                          {["Description", "Scope", "Location", "Quantity", "Planned", "Actions"].map(
                            (heading) => (
                              <th
                                key={heading}
                                scope="col"
                                className="px-4 py-2 text-left text-sm font-semibold text-slate-700"
                              >
                                {heading}
                              </th>
                            ),
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {wo.work_details.map((wd) => {
                          const wdKey = `wd-${wd.id}`;
                          const wdNotes = lineNotes.byWd.get(wd.id) || [];
                          return (
                            <tr key={wd.id} className="align-top">
                              <td className="px-4 py-3 text-sm text-slate-900">
                                <div className="whitespace-pre-wrap">{wd.description}</div>
                                {wd.notes && (
                                  <div className="mt-1 whitespace-pre-wrap text-slate-600">{wd.notes}</div>
                                )}
                                {wdNotes.map((n, i) => (
                                  <p
                                    key={i}
                                    className="mt-2 flex items-start gap-1.5 rounded bg-amber-50 p-2 text-amber-950"
                                  >
                                    <MessageSquare className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
                                    <span>
                                      <span className="font-semibold">{n.role}:</span> {n.note}
                                    </span>
                                  </p>
                                ))}
                                {canReview && openNotes.has(wdKey) && (
                                  <NoteEditor
                                    label="Note on this work detail"
                                    value={pendingNotes[wdKey] || ""}
                                    onChange={(text) =>
                                      setPendingNotes((prev) => ({ ...prev, [wdKey]: text }))
                                    }
                                  />
                                )}
                              </td>
                              <td className="px-4 py-3 text-sm text-slate-800">{wd.work_scope?.work_scope || "Not set"}</td>
                              <td className="px-4 py-3 text-sm text-slate-800">{wd.location?.location || "Not set"}</td>
                              <td className="whitespace-nowrap px-4 py-3 text-sm tabular-nums text-slate-900">
                                {wd.quantity ?? 0} {wd.uom}
                              </td>
                              <td className="px-4 py-3 text-sm text-slate-800">
                                {wd.planned_start_date || wd.target_close_date ? (
                                  <>
                                    {formatPlanDate(wd.planned_start_date)} to{" "}
                                    {formatPlanDate(wd.target_close_date)}
                                  </>
                                ) : (
                                  "Not set"
                                )}
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex flex-wrap gap-2">
                                  {editable && (
                                    <>
                                      <button
                                        type="button"
                                        disabled={busy}
                                        onClick={() =>
                                          openDialog({
                                            kind: "work-detail",
                                            workOrderId: wo.id,
                                            existing: wd,
                                          })
                                        }
                                        className="inline-flex min-h-11 items-center gap-1 rounded-md px-2 text-sm font-medium text-blue-800 hover:bg-blue-50 md:min-h-0 md:py-1"
                                      >
                                        <Pencil className="h-4 w-4" aria-hidden="true" /> Edit
                                      </button>
                                      <button
                                        type="button"
                                        disabled={busy}
                                        onClick={() => handleRemoveWorkDetail(wd)}
                                        className="inline-flex min-h-11 items-center gap-1 rounded-md px-2 text-sm font-medium text-red-800 hover:bg-red-50 md:min-h-0 md:py-1"
                                      >
                                        <Trash2 className="h-4 w-4" aria-hidden="true" /> Remove
                                      </button>
                                    </>
                                  )}
                                  {canReview && (
                                    <button
                                      type="button"
                                      aria-expanded={openNotes.has(wdKey)}
                                      onClick={() => toggleNote(wdKey)}
                                      className="inline-flex min-h-11 items-center gap-1 rounded-md px-2 text-sm font-medium text-blue-800 hover:bg-blue-50 md:min-h-0 md:py-1"
                                    >
                                      <MessageSquare className="h-4 w-4" aria-hidden="true" /> Note
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </article>
            );
          })
        )}
      </section>

      <ReviewHistory reviews={reviews} />

      {dialog?.kind === "work-order" && (
        <PlanWorkOrderDialog
          plan={plan}
          existing={dialog.existing}
          nextSortOrder={workOrders.length}
          onClose={closeDialog}
          onSaved={() => savedAndClose(dialog.existing ? "Work order saved." : "Work order added.")}
        />
      )}
      {dialog?.kind === "work-detail" && (
        <PlanWorkDetailDialog
          plan={plan}
          workOrderId={dialog.workOrderId}
          existing={dialog.existing}
          nextSortOrder={workOrders.find((w) => w.id === dialog.workOrderId)?.work_details.length ?? 0}
          scopes={scopes}
          locations={locations}
          onClose={closeDialog}
          onSaved={() => savedAndClose(dialog.existing ? "Work detail saved." : "Work detail added.")}
        />
      )}
      {dialog?.kind === "review" && (
        <PlanReviewDialog
          plan={plan}
          roleOptions={reviewRoleOptions}
          lineNoteCount={pendingLineNotes.length}
          onClose={closeDialog}
          onSubmit={async ({ reviewerRole, decision, generalNote }) => {
            await reviewPlan(plan, {
              reviewerRole,
              decision,
              generalNote,
              lineNotes: pendingLineNotes,
            });
            setPendingNotes({});
            setOpenNotes(new Set());
            await savedAndClose(
              decision === "APPROVED" ? "Your approval is recorded." : "The plan was sent back to Shipping.",
            );
          }}
        />
      )}
      {dialog?.kind === "reopen" && (
        <PlanReopenDialog
          plan={plan}
          onClose={closeDialog}
          onSubmit={async (reason) => {
            await reopenPlan(plan, reason);
            await savedAndClose("The plan is a draft again.");
          }}
        />
      )}
    </div>
  );
}

function StatusPanel({
  plan,
  isAuthor,
}: {
  plan: PlanBundle["plan"];
  isAuthor: boolean;
}) {
  let tone = "border-slate-300 bg-slate-50 text-slate-900";
  let Icon = Pencil;
  let body: React.ReactNode;

  switch (plan.status) {
    case "DRAFT":
      body = (
        <>
          {isAuthor
            ? "This plan is a draft. Add its work orders and work details, then submit it for review."
            : "Shipping is still drafting this plan."}
          {plan.reopened_reason && (
            <>
              {" "}
              Reopened by the shipyard: {plan.reopened_reason}
            </>
          )}
        </>
      );
      break;
    case "SUBMITTED":
      tone = "border-amber-300 bg-amber-50 text-amber-950";
      Icon = Clock;
      body = "Submitted for review. PPIC and HSSE each need to sign off before it can be approved.";
      break;
    case "NEEDS_CLARIFICATION":
      tone = "border-orange-300 bg-orange-50 text-orange-950";
      Icon = AlertTriangle;
      body = isAuthor
        ? "The shipyard sent this plan back. Fix what the notes below ask for, then submit it again."
        : "The shipyard sent this plan back to Shipping for changes.";
      break;
    case "APPROVED":
      tone = "border-emerald-300 bg-emerald-50 text-emerald-950";
      Icon = CheckCircle2;
      body = `Approved by PPIC and HSSE${
        plan.approved_at ? ` on ${formatPlanDate(plan.approved_at.slice(0, 10))}` : ""
      }. PPIC converts it into a project when the vessel is ready.`;
      break;
    case "CONVERTED":
      tone = "border-blue-300 bg-blue-50 text-blue-950";
      Icon = Rocket;
      body = (
        <>
          This plan is now a live project.{" "}
          {plan.converted_project_id && (
            <Link to={`/projects/${plan.converted_project_id}`} className="font-semibold underline">
              Open the project
            </Link>
          )}
        </>
      );
      break;
  }

  return (
    <p className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${tone}`}>
      <Icon className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
      <span>{body}</span>
    </p>
  );
}

function SignOffCard({ reviewer, review }: { reviewer: ReviewerRole; review: PlanReview | undefined }) {
  const state = review
    ? review.decision === "APPROVED"
      ? { Icon: CheckCircle2, text: "Approved", tone: "text-emerald-800" }
      : { Icon: AlertTriangle, text: "Sent back", tone: "text-orange-900" }
    : { Icon: Clock, text: "Waiting", tone: "text-slate-700" };
  return (
    <div className="rounded-md border border-slate-200 p-3">
      <p className="flex items-center justify-between gap-2 text-sm">
        <span className="font-semibold text-slate-900">{reviewer}</span>
        <span className={`inline-flex items-center gap-1 font-medium ${state.tone}`}>
          <state.Icon className="h-4 w-4" aria-hidden="true" />
          {state.text}
        </span>
      </p>
      {review && (
        <p className="mt-1 text-sm text-slate-600">
          {review.reviewer?.name || "Reviewer"}, {formatPlanDate(review.reviewed_at.slice(0, 10))}
        </p>
      )}
      {review?.general_note && (
        <p className="mt-2 whitespace-pre-wrap text-sm text-slate-800">{review.general_note}</p>
      )}
    </div>
  );
}

function LineNotes({ notes }: { notes: LineNote[] }) {
  if (notes.length === 0) return null;
  return (
    <div className="space-y-1 border-b border-slate-200 bg-amber-50 p-3">
      {notes.map((n, i) => (
        <p key={i} className="flex items-start gap-1.5 text-sm text-amber-950">
          <MessageSquare className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
          <span>
            <span className="font-semibold">{n.role}:</span> {n.note}
          </span>
        </p>
      ))}
    </div>
  );
}

function NoteEditor({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (text: string) => void;
}) {
  const fieldId = useId();
  return (
    <div className="mt-2 p-0 sm:px-0">
      <label htmlFor={fieldId} className="mb-1 block text-sm font-medium text-slate-700">
        {label}
      </label>
      <textarea
        id={fieldId}
        rows={2}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${fieldClass} sm:min-h-0`}
        placeholder="Sent with your decision"
      />
    </div>
  );
}

function ReviewHistory({ reviews }: { reviews: PlanReview[] }) {
  if (reviews.length === 0) return null;
  return (
    <section aria-labelledby="history-title" className="space-y-3">
      <h2 id="history-title" className="text-xl font-semibold text-slate-900">
        Review history
      </h2>
      <ol className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
        {reviews.map((review) => (
          <li key={review.id} className="p-4 text-sm">
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-semibold text-slate-900">
                {review.reviewer_role} {review.decision === "APPROVED" ? "approved" : "sent back"}
              </span>
              <span className="text-slate-600">
                submission #{review.revision_no}, {review.reviewer?.name || "Reviewer"},{" "}
                {formatPlanDate(review.reviewed_at.slice(0, 10))}
              </span>
            </p>
            {review.general_note && (
              <p className="mt-1 whitespace-pre-wrap text-slate-800">{review.general_note}</p>
            )}
            {review.notes.length > 0 && (
              <p className="mt-1 text-slate-600">
                {review.notes.length} note{review.notes.length === 1 ? "" : "s"} on individual lines.
              </p>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
