import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase, type Vessel } from "../../lib/supabase";
import { ActivityLogService } from "../../services/activityLogService";
import { useAuth } from "../../hooks/useAuth";
import { ArrowLeft, FolderKanban, Plus } from "lucide-react";
import { WORK_TYPE_OPTIONS } from "../../constants/workTypes";
import { suggestProjectName } from "../../utils/projectNaming";

export default function AddProject() {
  const navigate = useNavigate();
  const { isOperationsReadOnly } = useAuth();

  const [vessels, setVessels] = useState<Vessel[]>([]);
  const [loadingVessels, setLoadingVessels] = useState(true);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [currentUser, setCurrentUser] = useState<any>(null);

  const [vesselSearchTerm, setVesselSearchTerm] = useState("");
  const [showVesselDropdown, setShowVesselDropdown] = useState(false);
  const vesselDropdownRef = useRef<HTMLDivElement>(null);

  const [formData, setFormData] = useState({
    project_name: "",
    vessel_id: "",
    docking_type: "",
  });
  // Tracks whether the user has typed their own project name, so vessel/
  // docking-type changes stop overwriting it once they have.
  const [nameManuallyEdited, setNameManuallyEdited] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOperationsReadOnly) {
      alert("You don't have permission to create projects");
      navigate("/projects");
    }
  }, [isOperationsReadOnly, navigate]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        vesselDropdownRef.current &&
        !vesselDropdownRef.current.contains(event.target as Node)
      ) {
        setShowVesselDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const getCurrentUser = async () => {
      try {
        const {
          data: { user },
          error,
        } = await supabase.auth.getUser();
        if (error) throw error;
        setCurrentUser(user);
      } catch (err) {
        console.error("Error getting current user:", err);
        setError("Failed to get user information. Please login again.");
      }
    };
    getCurrentUser();
  }, []);

  useEffect(() => {
    const fetchVessels = async () => {
      try {
        setLoadingVessels(true);
        const { data, error } = await supabase
          .from("vessel")
          .select("*")
          .is("deleted_at", null)
          .order("name");

        if (error) throw error;
        setVessels(data || []);
      } catch (err) {
        console.error("Error fetching vessels:", err);
        setError("Failed to load vessels. Please refresh the page.");
      } finally {
        setLoadingVessels(false);
      }
    };
    fetchVessels();
  }, []);

  const filteredVessels = vessels.filter((vessel) => {
    const searchLower = vesselSearchTerm.toLowerCase();
    return (
      vessel.name?.toLowerCase().includes(searchLower) ||
      vessel.type?.toLowerCase().includes(searchLower) ||
      vessel.company?.toLowerCase().includes(searchLower)
    );
  });

  const handleVesselSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setVesselSearchTerm(e.target.value);
    setShowVesselDropdown(true);
    if (formData.vessel_id) {
      setFormData((prev) => ({ ...prev, vessel_id: "" }));
    }
  };

  const handleVesselSelect = (vessel: Vessel) => {
    setFormData((prev) => ({ ...prev, vessel_id: vessel.id.toString() }));
    setVesselSearchTerm(`${vessel.name} - ${vessel.type} (${vessel.company})`);
    setShowVesselDropdown(false);
  };

  // Re-suggest the project name whenever vessel or docking type changes,
  // until the user types their own name.
  useEffect(() => {
    if (nameManuallyEdited) return;
    if (!formData.vessel_id || !formData.docking_type) return;

    const vessel = vessels.find((v) => v.id.toString() === formData.vessel_id);
    if (!vessel) return;

    let cancelled = false;
    suggestProjectName(vessel.id, vessel.name, vessel.company, formData.docking_type).then(
      (name) => {
        if (!cancelled) setFormData((prev) => ({ ...prev, project_name: name }));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [formData.vessel_id, formData.docking_type, nameManuallyEdited, vessels]);

  const validateForm = () => {
    if (!formData.project_name.trim()) {
      setError("Project name is required");
      return false;
    }
    if (!formData.vessel_id) {
      setError("Vessel is required");
      return false;
    }
    if (!formData.docking_type) {
      setError("Jenis Docking is required");
      return false;
    }
    if (!currentUser) {
      setError("User information not available. Please refresh and try again.");
      return false;
    }
    setError(null);
    return true;
  };

  const resolveUserId = async (): Promise<number> => {
    const { data: userProfile, error: profileError } = await supabase
      .from("profiles")
      .select("id")
      .eq("auth_user_id", currentUser.id)
      .maybeSingle();

    if (profileError) {
      throw new Error(`Failed to query user profile: ${profileError.message}`);
    }

    if (userProfile) return userProfile.id;

    const { data: newProfile, error: createError } = await supabase
      .from("user_profile")
      .insert({
        auth_user_id: currentUser.id,
        email: currentUser.email,
        name:
          currentUser.user_metadata?.full_name ||
          currentUser.email?.split("@")[0] ||
          "User",
      })
      .select("id")
      .single();

    if (createError) {
      if (createError.code === "23505") {
        const { data: existingProfile, error: fetchError } = await supabase
          .from("user_profile")
          .select("id")
          .eq("auth_user_id", currentUser.id)
          .single();
        if (fetchError || !existingProfile) {
          throw new Error("Failed to fetch existing user profile");
        }
        return existingProfile.id;
      }
      throw new Error(`Failed to create user profile: ${createError.message}`);
    }

    if (!newProfile?.id) {
      throw new Error("Failed to create user profile - no ID returned");
    }
    return newProfile.id;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setLoading(true);
    setError(null);

    try {
      const userId = await resolveUserId();

      const submitData = {
        project_name: formData.project_name.trim(),
        vessel_id: parseInt(formData.vessel_id),
        docking_type: formData.docking_type,
        user_id: userId,
      };

      const { data, error } = await supabase
        .from("projects")
        .insert([submitData])
        .select()
        .single();

      if (error) throw new Error(`Database error: ${error.message}`);
      if (!data) throw new Error("No data returned from project creation");

      await ActivityLogService.logActivity({
        action: "create",
        tableName: "projects",
        recordId: data.id,
        newData: data,
        description: `Created project ${data.project_name}`,
      });

      navigate(`/projects/${data.id}`, {
        state: { message: "Project created successfully!" },
      });
    } catch (err) {
      console.error("Error creating project:", err);
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  if (loadingVessels || !currentUser) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">
            {loadingVessels ? "Loading vessels..." : "Loading user information..."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div className="flex items-center">
              <button
                onClick={() => navigate("/projects")}
                className="mr-4 text-gray-600 hover:text-gray-900 flex items-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" /> Back
              </button>
              <h1 className="text-2xl font-bold text-gray-900">New Project</h1>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="bg-white shadow rounded-lg">
          <div className="p-6 border-b border-gray-200">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <FolderKanban className="w-6 h-6 text-blue-500" />
                </div>
                <div className="ml-3">
                  <p className="text-blue-800 font-medium">
                    One vessel per project
                  </p>
                  <p className="text-blue-700 text-sm">
                    A project groups every work order for one docking event.
                    Once created, its vessel can't be changed.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {error && (
            <div className="p-6 border-b border-gray-200">
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-red-600">{error}</p>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            <div className="relative" ref={vesselDropdownRef}>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Vessel <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={vesselSearchTerm}
                onChange={handleVesselSearch}
                onFocus={() => setShowVesselDropdown(true)}
                placeholder="Search vessel by name, type, or company..."
                className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required={!formData.vessel_id}
              />

              {showVesselDropdown && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                  {filteredVessels.length > 0 ? (
                    filteredVessels.map((vessel) => (
                      <div
                        key={vessel.id}
                        onClick={() => handleVesselSelect(vessel)}
                        className={`px-3 py-2 cursor-pointer hover:bg-blue-50 ${
                          formData.vessel_id === vessel.id.toString()
                            ? "bg-blue-100"
                            : ""
                        }`}
                      >
                        <div className="font-medium text-gray-900">
                          {vessel.name}
                        </div>
                        <div className="text-sm text-gray-600">
                          {vessel.type} • {vessel.company}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="px-3 py-2 text-gray-500 text-sm">
                      No vessels found
                    </div>
                  )}
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Jenis Docking <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.docking_type}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, docking_type: e.target.value }))
                }
                className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              >
                <option value="">Select Jenis Docking</option>
                {WORK_TYPE_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Project Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.project_name}
                onChange={(e) => {
                  setNameManuallyEdited(true);
                  setFormData((prev) => ({
                    ...prev,
                    project_name: e.target.value,
                  }));
                }}
                placeholder="e.g., BAROKAH GEMILANG PERKASA-MT M PATRICIA-Repair-2026-01"
                className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
              <p className="text-xs text-gray-500 mt-1">
                Auto-suggested from the vessel and jenis docking — edit freely.
              </p>
            </div>

            <div className="flex justify-end gap-4 pt-6 border-t">
              <button
                type="button"
                onClick={() => navigate("/projects")}
                disabled={loading}
                className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || vessels.length === 0 || !currentUser}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {loading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Creating...
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" /> Create Project
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
