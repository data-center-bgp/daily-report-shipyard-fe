import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import MaterialControl from "./MaterialControl";
import type { MaterialsStatus } from "../../types/bastp.types";
import {
  Package,
  ArrowLeft,
  Loader,
  AlertTriangle,
  FileText,
  CheckCircle2,
} from "lucide-react";

interface WorkDetail {
  id: number;
  description: string;
  quantity: number;
  uom: string;
  material_count?: number;
  materials_status?: MaterialsStatus;
}

interface BastpInfo {
  id: number;
  number: string;
  created_at: string;
  status: string;
  vessel?: {
    id: number;
    name: string;
  };
}

export default function BASTPMaterialsPage() {
  const { bastpId } = useParams<{ bastpId: string }>();
  const navigate = useNavigate();
  const [bastp, setBastp] = useState<BastpInfo | null>(null);
  const [workDetails, setWorkDetails] = useState<WorkDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedWorkDetail, setSelectedWorkDetail] =
    useState<WorkDetail | null>(null);

  // Once a BASTP is ready for (or already) invoicing, its materials are
  // financially committed and shouldn't change anymore.
  const isLocked =
    bastp?.status === "READY_FOR_INVOICE" || bastp?.status === "INVOICED";

  useEffect(() => {
    if (bastpId) {
      fetchBastpInfo();
      fetchWorkDetails();
    }
  }, [bastpId]);

  const fetchBastpInfo = async () => {
    try {
      const { data, error: fetchError } = await supabase
        .from("bastp")
        .select(
          `
          id,
          number,
          created_at,
          status,
          vessel:vessel_id (
            id,
            name
          )
        `,
        )
        .eq("id", bastpId)
        .is("deleted_at", null)
        .single();

      if (fetchError) throw fetchError;
      setBastp(data as any);
    } catch (err) {
      console.error("Error fetching BASTP info:", err);
      setError(err instanceof Error ? err.message : "Failed to load BASTP");
    }
  };

  const fetchWorkDetails = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch work details from bastp_work_details join table
      const { data: bastpWorkDetails, error: fetchError } = await supabase
        .from("bastp_work_details")
        .select(
          `
          id,
          materials_status,
          work_details:work_details_id (
            id,
            description,
            quantity,
            uom
          )
        `,
        )
        .eq("bastp_id", bastpId)
        .is("deleted_at", null);

      if (fetchError) throw fetchError;

      // Extract work details
      const workDetailsArray: WorkDetail[] = [];
      bastpWorkDetails?.forEach((item: any) => {
        if (item.work_details) {
          const wd = item.work_details;
          workDetailsArray.push({
            id: wd.id,
            description: wd.description,
            quantity: wd.quantity,
            uom: wd.uom,
            materials_status: item.materials_status,
          });
        }
      });

      // Fetch material counts for all work details in one round trip and
      // tally client-side, instead of firing one count query per row.
      const countByWorkDetail = new Map<number, number>();
      if (workDetailsArray.length > 0) {
        const { data: materialRows, error: materialsError } = await supabase
          .from("material_control")
          .select("work_details_id")
          .eq("bastp_id", bastpId)
          .in(
            "work_details_id",
            workDetailsArray.map((wd) => wd.id),
          )
          .is("deleted_at", null);

        if (materialsError) {
          console.error("Error counting materials:", materialsError);
        }

        (materialRows || []).forEach((row) => {
          countByWorkDetail.set(
            row.work_details_id,
            (countByWorkDetail.get(row.work_details_id) || 0) + 1,
          );
        });
      }

      const workDetailsWithCounts = workDetailsArray.map((wd) => ({
        ...wd,
        material_count: countByWorkDetail.get(wd.id) || 0,
      }));

      setWorkDetails(workDetailsWithCounts);
    } catch (err) {
      console.error("Error fetching work details:", err);
      setError(
        err instanceof Error ? err.message : "Failed to load work details",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleManageMaterials = (workDetail: WorkDetail) => {
    setSelectedWorkDetail(workDetail);
  };

  const handleCloseMaterialControl = () => {
    setSelectedWorkDetail(null);
    // Refresh counts after closing
    fetchWorkDetails();
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="flex items-center justify-center py-12">
          <Loader className="w-8 h-8 text-blue-600 animate-spin" />
          <span className="ml-3 text-gray-600">Loading materials...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <div className="flex items-center">
            <AlertTriangle className="w-6 h-6 text-red-600 mr-3" />
            <div>
              <h3 className="text-red-900 font-semibold">Error</h3>
              <p className="text-red-700 mt-1">{error}</p>
            </div>
          </div>
          <button
            onClick={() => navigate(`/bastp/${bastpId}`)}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back to BASTP Details
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header with Back Button */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate(`/bastp/${bastpId}`)}
          className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          Back to BASTP Details
        </button>
      </div>

      {/* BASTP Info Card */}
      {bastp && (
        <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-lg p-6">
          <div className="flex items-center gap-3 mb-2">
            <Package className="w-6 h-6 text-green-600" />
            <h1 className="text-2xl font-bold text-gray-900">
              Material Control
            </h1>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
            <div>
              <p className="text-sm text-gray-600">BASTP Number</p>
              <p className="text-lg font-semibold text-gray-900">
                {bastp.number}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Vessel Name</p>
              <p className="text-lg font-semibold text-gray-900">
                {bastp.vessel?.name || "-"}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Created Date</p>
              <p className="text-lg font-semibold text-gray-900">
                {new Date(bastp.created_at).toLocaleDateString()}
              </p>
            </div>
          </div>
          {isLocked && (
            <p className="mt-4 text-sm text-yellow-800 bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2">
              This BASTP is {bastp.status === "INVOICED" ? "invoiced" : "ready for invoice"} —
              materials are locked from further changes.
            </p>
          )}
          {!isLocked && bastp.status === "VERIFIED" && workDetails.length > 0 && (
            <p className="mt-4 text-sm text-blue-800 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
              {workDetails.filter((wd) => wd.materials_status === "SUBMITTED").length} of{" "}
              {workDetails.length} work details have submitted materials — all
              must be submitted before this BASTP can become ready for invoice.
            </p>
          )}
        </div>
      )}

      {/* Material Control for Selected Work Detail */}
      {selectedWorkDetail && (
        <div className="bg-white border-2 border-blue-300 rounded-lg p-6 shadow-lg">
          <MaterialControl
            bastpId={parseInt(bastpId!)}
            workDetailsId={selectedWorkDetail.id}
            workDetailsDescription={selectedWorkDetail.description}
            onClose={handleCloseMaterialControl}
            locked={isLocked}
          />
        </div>
      )}

      {/* Work Details List */}
      {workDetails.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg border border-gray-200">
          <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500 text-lg mb-2">No work details found</p>
          <p className="text-gray-400 text-sm">
            Add work details to this BASTP first
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Work Details ({workDetails.length})
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              Select a work detail to manage materials
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Description
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Quantity
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    UOM
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Materials
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {workDetails.map((workDetail) => (
                  <tr
                    key={workDetail.id}
                    className={`hover:bg-gray-50 transition-colors ${
                      selectedWorkDetail?.id === workDetail.id
                        ? "bg-blue-50"
                        : ""
                    }`}
                  >
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-gray-900">
                        {workDetail.description}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="text-sm text-gray-900">
                        {workDetail.quantity.toLocaleString()}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        {workDetail.uom}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      {workDetail.material_count !== undefined &&
                      workDetail.material_count > 0 ? (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800">
                          <Package className="w-3 h-3 mr-1" />
                          {workDetail.material_count}
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                          No materials
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      {workDetail.materials_status === "SUBMITTED" ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800">
                          <CheckCircle2 className="w-3 h-3" /> Submitted
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                          <AlertTriangle className="w-3 h-3" /> Draft
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => handleManageMaterials(workDetail)}
                        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors text-sm font-medium ${
                          selectedWorkDetail?.id === workDetail.id
                            ? "bg-blue-600 text-white hover:bg-blue-700"
                            : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                        }`}
                      >
                        <Package className="w-4 h-4" />
                        {selectedWorkDetail?.id === workDetail.id
                          ? "Selected"
                          : "Manage"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
