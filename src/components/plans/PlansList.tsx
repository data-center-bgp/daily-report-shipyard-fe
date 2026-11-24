import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { CheckCircle2, ClipboardList, Plus, RefreshCw, Search, X } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../hooks/useAuth";
import { PageSkeleton } from "../common/Skeleton";
import { ApprovalTags } from "../projects/ApprovalTags";
import Pagination from "../common/Pagination";
import { describeLead, formatPlanDate } from "../../utils/dockingPlans";
import type { PlanStatus, PlanVessel } from "../../types/dockingPlan.types";
import {
  PLAN_STATUS,
  PLAN_STATUS_ORDER,
  primaryButton,
  secondaryButton,
} from "./planStatus";

const PAGE_SIZE = 20;

interface PlanListRow {
  id: number;
  plan_name: string;
  docking_type: string | null;
  target_docking_date: string;
  status: PlanStatus;
  revision_no: number;
  approved_at: string | null;
  converted_project: { readiness_form: { status: string } | null } | null;
  vessel: PlanVessel | null;
  author: { name: string | null } | null;
  docking_plan_work_orders:
    | { id: number; docking_plan_work_details: { id: number }[] }[]
    | null;
  docking_plan_reviews:
    | { revision_no: number; reviewer_role: string; decision: string }[]
    | null;
}

// "PPIC approved, HSSE pending" for a plan that is waiting on the shipyard.
function signOffSummary(plan: PlanListRow): string | null {
  if (plan.status !== "SUBMITTED") return null;
  const current = (plan.docking_plan_reviews || []).filter(
    (r) => r.revision_no === plan.revision_no,
  );
  const review = current.find((r) => r.reviewer_role === "PPIC");
  return `PPIC ${review ? review.decision.toLowerCase() : "pending"}`;
}

export default function PlansList() {
  const [plans, setPlans] = useState<PlanListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<PlanStatus | "">("");
  const [page, setPage] = useState(1);
  const [message, setMessage] = useState<string | null>(null);

  const navigate = useNavigate();
  const location = useLocation();
  const searchId = useId();
  const { profile } = useAuth();
  const canCreate = profile?.role === "SHIPPING" || profile?.role === "MASTER";
  const isReviewer = profile?.role === "PPIC";

  const fetchPlans = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const { data, error: fetchError } = await supabase
        .from("docking_plans")
        .select(
          `
          id, plan_name, docking_type, target_docking_date, status, revision_no, approved_at,
          converted_project:converted_project_id ( readiness_form:readiness_form_id ( status ) ),
          vessel:vessel_id ( id, name, type, company ),
          author:user_id ( name ),
          docking_plan_work_orders ( id, docking_plan_work_details ( id ) ),
          docking_plan_reviews ( revision_no, reviewer_role, decision )
        `,
        )
        .is("deleted_at", null)
        .is("docking_plan_work_orders.deleted_at", null)
        .is("docking_plan_work_orders.docking_plan_work_details.deleted_at", null)
        .order("target_docking_date", { ascending: true });

      if (fetchError) throw fetchError;
      setPlans((data as unknown as PlanListRow[]) || []);
    } catch (err) {
      console.error("Error fetching plans:", err);
      setError(err instanceof Error ? err.message : "Failed to load plans");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPlans();
  }, [fetchPlans]);

  useEffect(() => {
    const state = location.state as { message?: string } | null;
    if (state?.message) {
      setMessage(state.message);
      navigate(location.pathname, { replace: true, state: {} });
      const timer = setTimeout(() => setMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [location, navigate]);

  const searched = useMemo(() => {
    if (!searchTerm) return plans;
    const needle = searchTerm.toLowerCase();
    return plans.filter(
      (p) =>
        p.plan_name?.toLowerCase().includes(needle) ||
        p.vessel?.name?.toLowerCase().includes(needle) ||
        p.vessel?.company?.toLowerCase().includes(needle),
    );
  }, [plans, searchTerm]);

  const statusCounts = useMemo(() => {
    const counts: Partial<Record<PlanStatus, number>> = {};
    searched.forEach((p) => {
      counts[p.status] = (counts[p.status] || 0) + 1;
    });
    return counts;
  }, [searched]);

  const filtered = useMemo(
    () => (statusFilter ? searched.filter((p) => p.status === statusFilter) : searched),
    [searched, statusFilter],
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagePlans = filtered.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );
  const hasFilters = searchTerm !== "" || statusFilter !== "";
  const awaitingCount = plans.filter((p) => p.status === "SUBMITTED").length;

  const clearFilters = () => {
    setSearchTerm("");
    setStatusFilter("");
    setPage(1);
  };

  const pageShell = "mx-auto w-full max-w-[96rem] px-4 py-5 sm:px-6 lg:px-8 lg:py-8";

  if (loading) {
    return (
      <div className={pageShell}>
        <PageSkeleton
          label="Loading plans..."
          padding="none"
          action
          filters
          rows={6}
          columns={5}
        />
      </div>
    );
  }

  if (error) {
    return (
      <div className={pageShell}>
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-lg border border-red-300 bg-red-50 p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <p className="text-sm text-red-900">
            <span className="font-semibold">Plans could not load.</span> {error}
          </p>
          <button
            type="button"
            onClick={fetchPlans}
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-red-700 bg-white px-4 text-sm font-medium text-red-800 hover:bg-red-100"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`${pageShell} space-y-6`}>
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">
            Docking plans
          </h1>
          <p className="mt-1 text-sm text-slate-600 sm:text-base">
            Work planned ahead of a vessel's docking. The shipyard reviews each
            plan before it becomes a project.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={fetchPlans} className={secondaryButton}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" /> Refresh
          </button>
          {canCreate && (
            <Link to="/plans/new" className={primaryButton}>
              <Plus className="h-4 w-4" aria-hidden="true" /> New plan
            </Link>
          )}
        </div>
      </header>

      {message && (
        <div
          role="status"
          className="flex items-center justify-between gap-3 rounded-lg border border-emerald-300 bg-emerald-50 p-4"
        >
          <p className="flex items-center gap-2 text-sm font-medium text-emerald-900">
            <CheckCircle2 className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
            {message}
          </p>
          <button
            type="button"
            onClick={() => setMessage(null)}
            aria-label="Dismiss message"
            className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-md text-emerald-900 hover:bg-emerald-100"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {isReviewer && awaitingCount > 0 && statusFilter !== "SUBMITTED" && (
        <div className="flex flex-col gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-medium text-amber-950">
            {awaitingCount} plan{awaitingCount === 1 ? "" : "s"} waiting for
            review.
          </p>
          <button
            type="button"
            onClick={() => {
              setStatusFilter("SUBMITTED");
              setPage(1);
            }}
            className={secondaryButton}
          >
            Show them
          </button>
        </div>
      )}

      <section aria-label="Find a plan" className="space-y-4">
        <form role="search" onSubmit={(e) => e.preventDefault()} className="max-w-xl">
          <label
            htmlFor={searchId}
            className="mb-1 block text-sm font-medium text-slate-700"
          >
            Search plans
          </label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600"
              aria-hidden="true"
            />
            <input
              id={searchId}
              type="search"
              placeholder="Plan name, vessel or company"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setPage(1);
              }}
              className="min-h-11 w-full rounded-md border border-slate-300 bg-white py-2 pl-9 pr-3 text-base text-slate-900 placeholder:text-slate-500 focus:border-blue-700 sm:min-h-10 sm:text-sm"
            />
          </div>
        </form>

        <div role="group" aria-label="Filter by plan status" className="flex flex-wrap gap-2">
          {[
            { key: "" as const, label: "All", count: searched.length },
            ...PLAN_STATUS_ORDER.map((key) => ({
              key,
              label: PLAN_STATUS[key].label,
              count: statusCounts[key] || 0,
            })),
          ].map((chip) => (
            <button
              key={chip.key || "all"}
              type="button"
              aria-pressed={statusFilter === chip.key}
              onClick={() => {
                setStatusFilter(chip.key);
                setPage(1);
              }}
              className={`inline-flex min-h-11 items-center gap-2 rounded-md border px-3 text-sm font-medium transition-colors sm:min-h-10 ${
                statusFilter === chip.key
                  ? "border-blue-950 bg-blue-950 text-white"
                  : "border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
              }`}
            >
              {chip.label}
              <span
                className={`tabular-nums ${
                  statusFilter === chip.key ? "text-blue-100" : "text-slate-600"
                }`}
              >
                {chip.count}
              </span>
            </button>
          ))}
        </div>

        <p role="status" className="text-sm text-slate-600">
          {filtered.length === plans.length
            ? `${plans.length} plans`
            : `${filtered.length} of ${plans.length} plans`}
        </p>
      </section>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-12 text-center">
          <ClipboardList className="mx-auto h-8 w-8 text-slate-500" aria-hidden="true" />
          <p className="mt-2 text-sm font-medium text-slate-900">
            {hasFilters ? "No plans match these filters" : "No plans yet"}
          </p>
          <p className="mt-1 text-sm text-slate-600">
            {hasFilters
              ? "Try a different search, or show every status."
              : "A plan lists the work orders and work details for a vessel's coming docking."}
          </p>
          {hasFilters ? (
            <button type="button" onClick={clearFilters} className={`mt-4 ${secondaryButton}`}>
              Show all plans
            </button>
          ) : (
            canCreate && (
              <Link to="/plans/new" className={`mt-4 ${primaryButton}`}>
                <Plus className="h-4 w-4" aria-hidden="true" /> Create the first plan
              </Link>
            )
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="table-stack min-w-full divide-y divide-slate-200">
              <caption className="sr-only">Docking plans, earliest docking first</caption>
              <thead className="bg-slate-50">
                <tr>
                  {["Plan", "Vessel", "Target docking", "Scope", "Status"].map((heading) => (
                    <th
                      key={heading}
                      scope="col"
                      className="px-4 py-3 text-left text-sm font-semibold text-slate-700"
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {pagePlans.map((plan) => {
                  const badge = PLAN_STATUS[plan.status];
                  const workOrders = plan.docking_plan_work_orders || [];
                  const detailCount = workOrders.reduce(
                    (sum, wo) => sum + wo.docking_plan_work_details.length,
                    0,
                  );
                  const signOff = signOffSummary(plan);
                  return (
                    <tr
                      key={plan.id}
                      onClick={() => navigate(`/plans/${plan.id}`)}
                      className="cursor-pointer transition-colors hover:bg-slate-50"
                    >
                      <td className="px-4 py-3">
                        <Link
                          to={`/plans/${plan.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="flex min-h-11 items-center rounded text-sm font-semibold text-blue-800 hover:underline md:inline-block md:min-h-0"
                        >
                          {plan.plan_name}
                        </Link>
                        {plan.author?.name && (
                          <div className="text-sm text-slate-600">
                            By {plan.author.name}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <div className="font-medium text-slate-900">
                          {plan.vessel?.name || "No vessel"}
                        </div>
                        {plan.vessel?.company && (
                          <div className="text-slate-600">{plan.vessel.company}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <div className="text-slate-900">
                          {formatPlanDate(plan.target_docking_date)}
                        </div>
                        <div className="text-slate-600">
                          {describeLead(plan.target_docking_date)}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm tabular-nums text-slate-900">
                        {workOrders.length} work order{workOrders.length === 1 ? "" : "s"},{" "}
                        {detailCount} detail{detailCount === 1 ? "" : "s"}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium ${badge.className}`}
                        >
                          <badge.Icon className="h-3.5 w-3.5" aria-hidden="true" />
                          {badge.label}
                        </span>
                        {signOff && (
                          <div className="mt-1 text-sm text-slate-600">{signOff}</div>
                        )}
                        {plan.status === "CONVERTED" && (
                          <ApprovalTags
                            className="mt-2"
                            plan={{ id: plan.id, approved_at: plan.approved_at }}
                            readinessStatus={plan.converted_project?.readiness_form?.status}
                          />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Pagination
        page={currentPage}
        totalItems={filtered.length}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
      />
    </div>
  );
}
