import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../hooks/useAuth";
import type {
  GeneralServiceType,
  GeneralServiceInput,
} from "../../types/generalService.types";
import {
  Anchor,
  Loader,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Save,
} from "lucide-react";

interface DockingPlanningProps {
  workOrderId: number;
}

// Self-contained "Docking Planning" panel for a Work Order — a schedule
// estimate (service + date range -> auto-derived total_days), independent
// of BASTP's own General Services which record what was actually billed,
// potentially split across several partial BASTPs for the same work order.
// Mirrors CreateBASTP.tsx's General Services section (same checkbox + date
// range + auto-computed days UX), reusing the same general_service_types
// master list, but persists to work_order_general_services instead.
export default function DockingPlanning({ workOrderId }: DockingPlanningProps) {
  const { canManageDockingPlanning } = useAuth();

  const [serviceTypes, setServiceTypes] = useState<GeneralServiceType[]>([]);
  const [selectedServices, setSelectedServices] = useState<
    GeneralServiceInput[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [serviceTypesRes, existingRes] = await Promise.all([
        supabase
          .from("general_service_types")
          .select("*")
          .order("display_order", { ascending: true }),
        supabase
          .from("work_order_general_services")
          .select("service_type_id, start_date, close_date, total_days, remarks")
          .eq("work_order_id", workOrderId)
          .is("deleted_at", null),
      ]);

      if (serviceTypesRes.error) throw serviceTypesRes.error;
      if (existingRes.error) throw existingRes.error;

      setServiceTypes(serviceTypesRes.data || []);
      setSelectedServices(
        (existingRes.data || []).map((s) => ({
          service_type_id: s.service_type_id,
          start_date: s.start_date || "",
          close_date: s.close_date || "",
          total_days: s.total_days || 0,
          remarks: s.remarks || "",
        })),
      );
    } catch (err) {
      console.error("Error loading docking planning:", err);
      setError(
        err instanceof Error ? err.message : "Failed to load docking planning",
      );
    } finally {
      setLoading(false);
    }
  }, [workOrderId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const calculateTotalDays = (startDate: string, closeDate: string): number => {
    if (!startDate || !closeDate) return 0;
    const start = new Date(startDate);
    const end = new Date(closeDate);
    if (end < start) return 0;
    const diffDays =
      Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    return diffDays > 0 ? diffDays : 0;
  };

  const handleToggleService = (serviceTypeId: number) => {
    if (!canManageDockingPlanning) return;
    setSuccess(null);
    setSelectedServices((prev) => {
      const exists = prev.some((s) => s.service_type_id === serviceTypeId);
      if (exists) {
        return prev.filter((s) => s.service_type_id !== serviceTypeId);
      }
      return [
        ...prev,
        {
          service_type_id: serviceTypeId,
          start_date: "",
          close_date: "",
          total_days: 0,
          remarks: "",
        },
      ];
    });
  };

  const updateService = (
    serviceTypeId: number,
    patch: Partial<GeneralServiceInput>,
  ) => {
    setSuccess(null);
    setSelectedServices((prev) =>
      prev.map((s) =>
        s.service_type_id === serviceTypeId ? { ...s, ...patch } : s,
      ),
    );
  };

  const handleStartDateChange = (serviceTypeId: number, startDate: string) => {
    const service = selectedServices.find(
      (s) => s.service_type_id === serviceTypeId,
    );
    updateService(serviceTypeId, {
      start_date: startDate,
      total_days: calculateTotalDays(startDate, service?.close_date || ""),
    });
  };

  const handleCloseDateChange = (serviceTypeId: number, closeDate: string) => {
    const service = selectedServices.find(
      (s) => s.service_type_id === serviceTypeId,
    );
    updateService(serviceTypeId, {
      close_date: closeDate,
      total_days: calculateTotalDays(service?.start_date || "", closeDate),
    });
  };

  const handleSave = async () => {
    if (!canManageDockingPlanning) return;

    const incomplete = selectedServices.some(
      (s) => !s.start_date || !s.close_date,
    );
    if (incomplete) {
      setError(
        "Please set both a start and close date for every selected docking stage.",
      );
      return;
    }

    try {
      setSaving(true);
      setError(null);
      setSuccess(null);

      // Same delete-then-reinsert convention CreateBASTP.tsx already uses
      // for BASTP's own General Services — simpler than diffing, and this
      // list is always small (a handful of docking stages at most).
      const { error: deleteError } = await supabase
        .from("work_order_general_services")
        .delete()
        .eq("work_order_id", workOrderId);
      if (deleteError) throw deleteError;

      if (selectedServices.length > 0) {
        const { error: insertError } = await supabase
          .from("work_order_general_services")
          .insert(
            selectedServices.map((s) => ({
              work_order_id: workOrderId,
              service_type_id: s.service_type_id,
              start_date: s.start_date,
              close_date: s.close_date,
              total_days: s.total_days,
              remarks: s.remarks || null,
            })),
          );
        if (insertError) throw insertError;
      }

      setSuccess("Docking planning saved.");
    } catch (err) {
      console.error("Error saving docking planning:", err);
      setError(
        err instanceof Error ? err.message : "Failed to save docking planning",
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6 text-center">
        <Loader className="w-6 h-6 text-blue-600 animate-spin mx-auto" />
        <p className="text-gray-600 mt-2 text-sm">Loading docking planning...</p>
      </div>
    );
  }

  // View-only rendering (no checkboxes/date pickers) for anyone who isn't
  // MASTER/PPIC/ADMIN_SHIPPING — matches how the rest of the app keeps
  // view access open while gating writes.
  if (!canManageDockingPlanning) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2 mb-4">
          <Anchor className="w-5 h-5" /> Docking Planning
        </h2>
        {selectedServices.length === 0 ? (
          <p className="text-gray-500 text-sm">
            No docking planning has been added for this work order yet.
          </p>
        ) : (
          <div className="space-y-2">
            {selectedServices.map((s) => {
              const type = serviceTypes.find(
                (t) => t.id === s.service_type_id,
              );
              return (
                <div
                  key={s.service_type_id}
                  className="flex items-center justify-between border border-gray-200 rounded-lg p-3 text-sm"
                >
                  <span className="font-medium text-gray-900">
                    {type?.service_name || "Unknown service"}
                  </span>
                  <span className="text-gray-600">
                    {s.start_date} → {s.close_date} ({s.total_days} Hari)
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="mb-4">
        <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
          <Anchor className="w-5 h-5" /> Docking Planning
        </h2>
        <p className="text-sm text-gray-600 mt-1">
          Schedule estimate only — this is separate from BASTP's own General
          Services, which still records what was actually billed.
        </p>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2 text-sm text-red-700">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}
      {success && (
        <div className="mb-4 bg-green-50 border border-green-200 rounded-lg p-3 flex items-center gap-2 text-sm text-green-700">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> {success}
        </div>
      )}

      {serviceTypes.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-gray-500">No service types available</p>
          <button
            type="button"
            onClick={() => fetchData()}
            className="mt-2 flex items-center gap-2 text-blue-600 hover:text-blue-800 text-sm mx-auto"
          >
            <RefreshCw className="w-4 h-4" /> Retry Loading
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {serviceTypes.map((serviceType) => {
            const isSelected = selectedServices.some(
              (s) => s.service_type_id === serviceType.id,
            );
            const serviceData = selectedServices.find(
              (s) => s.service_type_id === serviceType.id,
            );

            return (
              <div
                key={serviceType.id}
                className={`border rounded-lg p-4 transition-colors ${
                  isSelected
                    ? "border-blue-500 bg-blue-50"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className="flex items-center pt-1">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleToggleService(serviceType.id)}
                      className="w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="font-medium text-gray-900 cursor-pointer">
                      {serviceType.service_name}
                    </label>

                    {isSelected && (
                      <>
                        <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Start Date <span className="text-red-500">*</span>
                            </label>
                            <input
                              type="date"
                              value={serviceData?.start_date || ""}
                              onChange={(e) =>
                                handleStartDateChange(
                                  serviceType.id,
                                  e.target.value,
                                )
                              }
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                              required
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Close Date <span className="text-red-500">*</span>
                            </label>
                            <input
                              type="date"
                              value={serviceData?.close_date || ""}
                              onChange={(e) =>
                                handleCloseDateChange(
                                  serviceType.id,
                                  e.target.value,
                                )
                              }
                              min={serviceData?.start_date}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                              required
                            />
                            {serviceData?.start_date &&
                              serviceData?.close_date &&
                              new Date(serviceData.close_date) <
                                new Date(serviceData.start_date) && (
                                <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                                  <AlertTriangle className="w-3 h-3" /> Close
                                  date cannot be before start date
                                </p>
                              )}
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Total Days
                            </label>
                            <input
                              type="number"
                              value={serviceData?.total_days || 0}
                              readOnly
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 cursor-not-allowed"
                              placeholder="Auto-calculated"
                            />
                            <p className="text-xs text-gray-500 mt-1">
                              Auto-calculated from dates
                            </p>
                          </div>
                        </div>
                        <div className="mt-3">
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Remarks (Optional)
                          </label>
                          <input
                            type="text"
                            value={serviceData?.remarks || ""}
                            onChange={(e) =>
                              updateService(serviceType.id, {
                                remarks: e.target.value,
                              })
                            }
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            placeholder="Add notes..."
                          />
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-6 flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
        >
          {saving ? (
            <Loader className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          {saving ? "Saving..." : "Save Docking Planning"}
        </button>
      </div>
    </div>
  );
}
