import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase, type Vessel, type Kapro } from "../../lib/supabase";
import { ActivityLogService } from "../../services/activityLogService";
import { useAuth } from "../../hooks/useAuth";
import {
  ArrowLeft,
  FileText,
  Plus,
  FolderKanban,
  AlertTriangle,
  CheckCircle2,
  Clock,
} from "lucide-react";
import { WORK_TYPE_OPTIONS } from "../../constants/workTypes";
import { suggestProjectName } from "../../utils/projectNaming";

interface ProjectOption {
  id: number;
  project_name: string;
  vessel_id: number;
  vessel: { id: number; name: string; type: string; company: string } | null;
  readiness_form: { status: string } | null;
}

export default function AddWorkOrder() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isReadOnly } = useAuth();
  const [vessels, setVessels] = useState<Vessel[]>([]);
  const [kapros, setKapros] = useState<Kapro[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [loadingVessels, setLoadingVessels] = useState(true);
  const [loadingKapros, setLoadingKapros] = useState(true);
  const [loadingProjects, setLoadingProjects] = useState(true);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [currentUser, setCurrentUser] = useState<any>(null);

  // Project picker
  const [projectSearchTerm, setProjectSearchTerm] = useState("");
  const [showProjectDropdown, setShowProjectDropdown] = useState(false);
  const projectDropdownRef = useRef<HTMLDivElement>(null);
  const [selectedProject, setSelectedProject] = useState<ProjectOption | null>(
    null,
  );
  // Whether the selected project already has an original (non-additional)
  // work order — an additional WO can't exist without one. null = still checking.
  const [hasOriginalInProject, setHasOriginalInProject] = useState<
    boolean | null
  >(null);

  // Additional-WO approval requests for the selected project
  const [additionalWoRequests, setAdditionalWoRequests] = useState<
    {
      id: number;
      status: "PENDING" | "APPROVED" | "REJECTED";
      reason: string;
      decision_notes: string | null;
      work_order_id: number | null;
    }[]
  >([]);
  const [loadingAdditionalWoRequests, setLoadingAdditionalWoRequests] =
    useState(false);
  const [requestReason, setRequestReason] = useState("");
  const [submittingRequest, setSubmittingRequest] = useState(false);

  // Inline "new project" creation
  const [showNewProjectForm, setShowNewProjectForm] = useState(false);
  const [newProjectVesselId, setNewProjectVesselId] = useState("");
  const [newProjectName, setNewProjectName] = useState("");
  // Tracks whether the user has typed their own project name, so vessel
  // changes stop overwriting it once they have.
  const [newProjectNameManuallyEdited, setNewProjectNameManuallyEdited] =
    useState(false);
  const [newProjectVesselSearch, setNewProjectVesselSearch] = useState("");
  const [showNewProjectVesselDropdown, setShowNewProjectVesselDropdown] =
    useState(false);
  const [creatingProject, setCreatingProject] = useState(false);

  const [formData, setFormData] = useState({
    // Required fields
    shipyard_wo_number: "",
    shipyard_wo_date: "",

    // Optional fields
    customer_wo_number: "",
    customer_wo_date: "",
    is_additional_wo: false,
    kapro_id: "",
    work_location: "",
    work_type: "",
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchProjects = async () => {
    try {
      setLoadingProjects(true);
      const { data, error } = await supabase
        .from("projects")
        .select(
          `
          id, project_name, vessel_id,
          vessel:vessel_id ( id, name, type, company ),
          readiness_form:readiness_form_id ( status )
        `,
        )
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setProjects((data as any) || []);
    } catch (err) {
      console.error("Error fetching projects:", err);
      setError("Failed to load projects. Please refresh the page.");
    } finally {
      setLoadingProjects(false);
    }
  };

  // Preselect project from navigation state (e.g. coming from Project Details)
  useEffect(() => {
    if (location.state?.preselectedProjectId && projects.length > 0) {
      const preselected = projects.find(
        (p) => p.id === location.state.preselectedProjectId,
      );
      if (preselected) {
        setSelectedProject(preselected);
        setProjectSearchTerm(
          `${preselected.project_name} — ${preselected.vessel?.name || ""}`,
        );
      }
    }
  }, [location.state, projects]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        projectDropdownRef.current &&
        !projectDropdownRef.current.contains(event.target as Node)
      ) {
        setShowProjectDropdown(false);
        setShowNewProjectVesselDropdown(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  useEffect(() => {
    if (isReadOnly) {
      alert("You don't have permission to create work orders");
      navigate("/work-orders");
    }
  }, [isReadOnly, navigate]);

  // Get current user on component mount
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

  // Fetch vessels, kapros, projects on mount
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

    const fetchKapros = async () => {
      try {
        setLoadingKapros(true);
        const { data, error } = await supabase
          .from("kapro")
          .select("*")
          .is("deleted_at", null)
          .order("kapro_name");

        if (error) throw error;
        setKapros(data || []);
      } catch (err) {
        console.error("Error fetching kapros:", err);
        setError("Failed to load kapros. Please refresh the page.");
      } finally {
        setLoadingKapros(false);
      }
    };

    fetchVessels();
    fetchKapros();
    fetchProjects();
  }, []);

  const filteredProjects = projects.filter((project) => {
    const searchLower = projectSearchTerm.toLowerCase();
    return (
      project.project_name?.toLowerCase().includes(searchLower) ||
      project.vessel?.name?.toLowerCase().includes(searchLower) ||
      project.vessel?.company?.toLowerCase().includes(searchLower)
    );
  });

  const filteredNewProjectVessels = vessels.filter((vessel) => {
    const searchLower = newProjectVesselSearch.toLowerCase();
    return (
      vessel.name?.toLowerCase().includes(searchLower) ||
      vessel.type?.toLowerCase().includes(searchLower) ||
      vessel.company?.toLowerCase().includes(searchLower)
    );
  });

  const handleProjectSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setProjectSearchTerm(e.target.value);
    setShowProjectDropdown(true);
    if (selectedProject) {
      setSelectedProject(null);
    }
  };

  const handleProjectSelect = (project: ProjectOption) => {
    setSelectedProject(project);
    setProjectSearchTerm(`${project.project_name} — ${project.vessel?.name || ""}`);
    setShowProjectDropdown(false);
  };

  // Check whether the selected project already has an original WO, so the
  // "Additional Work Order" checkbox can be disabled when there's nothing
  // for it to be additional to yet.
  useEffect(() => {
    if (!selectedProject) {
      setHasOriginalInProject(null);
      return;
    }

    let cancelled = false;
    setHasOriginalInProject(null);

    supabase
      .from("work_order")
      .select("id", { count: "exact", head: true })
      .eq("project_id", selectedProject.id)
      .eq("is_additional_wo", false)
      .is("deleted_at", null)
      .then(({ count, error }) => {
        if (cancelled) return;
        if (error) {
          console.error("Error checking for original work order:", error);
          setHasOriginalInProject(false);
          return;
        }
        setHasOriginalInProject((count || 0) > 0);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedProject]);

  // If the checkbox was checked before the project had an original WO
  // confirmed, uncheck it once we learn there isn't one.
  useEffect(() => {
    if (hasOriginalInProject === false && formData.is_additional_wo) {
      setFormData((prev) => ({ ...prev, is_additional_wo: false }));
    }
  }, [hasOriginalInProject, formData.is_additional_wo]);

  const fetchAdditionalWoRequests = async (projectId: number) => {
    setLoadingAdditionalWoRequests(true);
    try {
      const { data, error } = await supabase
        .from("additional_wo_requests")
        .select("id, status, reason, decision_notes, work_order_id")
        .eq("project_id", projectId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setAdditionalWoRequests((data as any) || []);
    } catch (err) {
      console.error("Error fetching additional WO requests:", err);
      setAdditionalWoRequests([]);
    } finally {
      setLoadingAdditionalWoRequests(false);
    }
  };

  useEffect(() => {
    if (!selectedProject) {
      setAdditionalWoRequests([]);
      return;
    }
    fetchAdditionalWoRequests(selectedProject.id);
  }, [selectedProject]);

  const unconsumedApprovedRequest = additionalWoRequests.find(
    (r) => r.status === "APPROVED" && !r.work_order_id,
  );
  const latestPendingRequest = additionalWoRequests.find(
    (r) => r.status === "PENDING",
  );
  // additionalWoRequests is ordered newest-first, so the first REJECTED
  // entry found is the most recent one.
  const latestRejectedRequest = additionalWoRequests.find(
    (r) => r.status === "REJECTED",
  );

  const handleSubmitAdditionalWoRequest = async () => {
    if (!selectedProject || !requestReason.trim() || !currentUser) return;

    setSubmittingRequest(true);
    setError(null);
    try {
      const userId = await resolveUserId();

      const { data: newRequest, error: insertError } = await supabase
        .from("additional_wo_requests")
        .insert({
          project_id: selectedProject.id,
          vessel_id: selectedProject.vessel_id,
          requested_by: userId,
          reason: requestReason.trim(),
        })
        .select()
        .single();

      if (insertError) throw insertError;

      await ActivityLogService.logActivity({
        action: "create",
        tableName: "additional_wo_requests",
        recordId: newRequest.id,
        newData: newRequest,
        description: `Requested additional work order approval for project ${selectedProject.project_name}`,
      });

      setRequestReason("");
      await fetchAdditionalWoRequests(selectedProject.id);
    } catch (err) {
      console.error("Error submitting additional WO request:", err);
      setError(
        err instanceof Error ? err.message : "Failed to submit request",
      );
    } finally {
      setSubmittingRequest(false);
    }
  };

  // Shared with handleSubmit and handleSubmitAdditionalWoRequest — looks up
  // (or lazily creates) the current user's profile row.
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

  // Re-suggest the quick-create project name whenever the vessel or the work
  // order's own Work Type changes (the project's docking type is taken from
  // the work order being created), until the user types their own name.
  useEffect(() => {
    if (newProjectNameManuallyEdited) return;
    if (!newProjectVesselId || !formData.work_type) return;

    const vessel = vessels.find((v) => v.id.toString() === newProjectVesselId);
    if (!vessel) return;

    let cancelled = false;
    suggestProjectName(vessel.id, vessel.name, vessel.company, formData.work_type).then(
      (name) => {
        if (!cancelled) setNewProjectName(name);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [newProjectVesselId, formData.work_type, newProjectNameManuallyEdited, vessels]);

  const handleCreateProject = async () => {
    if (!newProjectVesselId || !newProjectName.trim() || !currentUser) {
      setError("Vessel and project name are required to create a new project");
      return;
    }
    if (!formData.work_type) {
      setError("Select a Work Type above first — the new project's Jenis Docking is taken from it");
      return;
    }

    setCreatingProject(true);
    setError(null);

    try {
      const userId = await resolveUserId();

      const { data: newProject, error: projectError } = await supabase
        .from("projects")
        .insert({
          project_name: newProjectName.trim(),
          vessel_id: parseInt(newProjectVesselId),
          docking_type: formData.work_type,
          user_id: userId,
        })
        .select("id, project_name, vessel_id, vessel:vessel_id ( id, name, type, company )")
        .single();

      if (projectError) throw projectError;

      const created: ProjectOption = { ...(newProject as any), readiness_form: null };
      setProjects((prev) => [created, ...prev]);
      setSelectedProject(created);
      setProjectSearchTerm(`${created.project_name} — ${created.vessel?.name || ""}`);
      setShowNewProjectForm(false);
      setNewProjectName("");
      setNewProjectNameManuallyEdited(false);
      setNewProjectVesselId("");
      setNewProjectVesselSearch("");

      await ActivityLogService.logActivity({
        action: "create",
        tableName: "projects",
        recordId: created.id,
        newData: created,
        description: `Created project ${created.project_name}`,
      });
    } catch (err) {
      console.error("Error creating project:", err);
      setError(err instanceof Error ? err.message : "Failed to create project");
    } finally {
      setCreatingProject(false);
    }
  };

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value, type } = e.target;

    if (type === "checkbox") {
      const checked = (e.target as HTMLInputElement).checked;
      setFormData((prev) => ({
        ...prev,
        [name]: checked,
      }));
    } else {
      setFormData((prev) => ({
        ...prev,
        [name]: name === "kapro_id" ? parseInt(value) || "" : value,
      }));
    }
  };

  const validateForm = () => {
    if (!selectedProject) {
      setError("Please select or create a project for this work order");
      return false;
    }

    const required = ["shipyard_wo_number", "shipyard_wo_date"];
    for (const field of required) {
      const value = formData[field as keyof typeof formData];
      if (!value) {
        setError(`${field.replace(/_/g, " ").toUpperCase()} is required`);
        return false;
      }
    }

    if (!currentUser) {
      setError("User information not available. Please refresh and try again.");
      return false;
    }

    setError(null);
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm() || !selectedProject) {
      return;
    }

    setLoading(true);
    setError(null);

    let approvedRequestIdToConsume: number | null = null;

    try {
      // Gate: the ORIGINAL work order for a project requires an approved
      // readiness form. Re-check fresh from the DB rather than trusting
      // whatever was loaded into the picker, in case it changed since.
      if (!formData.is_additional_wo) {
        const { data: freshProject, error: freshError } = await supabase
          .from("projects")
          .select("readiness_form:readiness_form_id ( status )")
          .eq("id", selectedProject.id)
          .single();

        if (freshError) throw freshError;

        const status = (freshProject as any)?.readiness_form?.status;
        if (status !== "APPROVED") {
          setError(
            "This project's Readiness Form must be fully approved before creating its original work order. Additional work orders don't need this — check \"Additional Work Order\" if that's what this is, or finish the Readiness Form first.",
          );
          setLoading(false);
          return;
        }
      } else {
        // Gate: an ADDITIONAL work order can't exist without an original
        // one already in the project. Re-check fresh from the DB.
        const { count: originalCount, error: originalError } = await supabase
          .from("work_order")
          .select("id", { count: "exact", head: true })
          .eq("project_id", selectedProject.id)
          .eq("is_additional_wo", false)
          .is("deleted_at", null);

        if (originalError) throw originalError;

        if (!originalCount) {
          setError(
            "This project doesn't have an original work order yet, so it can't have an additional one. Create the original work order first, or uncheck \"Additional Work Order\".",
          );
          setLoading(false);
          return;
        }

        // Gate: an ADDITIONAL work order also requires an Operation Head
        // approval on file. Re-check fresh from the DB.
        const { data: freshRequests, error: requestError } = await supabase
          .from("additional_wo_requests")
          .select("id")
          .eq("project_id", selectedProject.id)
          .eq("status", "APPROVED")
          .is("work_order_id", null)
          .is("deleted_at", null)
          .limit(1);

        if (requestError) throw requestError;

        if (!freshRequests || freshRequests.length === 0) {
          setError(
            "This additional work order needs an approved request from the Operation Head first. Submit a request below and wait for approval.",
          );
          setLoading(false);
          return;
        }

        approvedRequestIdToConsume = freshRequests[0].id;
      }

      const userId = await resolveUserId();

      const submitData = {
        vessel_id: selectedProject.vessel_id,
        project_id: selectedProject.id,
        shipyard_wo_number: formData.shipyard_wo_number.trim(),
        shipyard_wo_date: formData.shipyard_wo_date,
        customer_wo_number: formData.customer_wo_number.trim() || null,
        customer_wo_date: formData.customer_wo_date || null,
        is_additional_wo: formData.is_additional_wo,
        kapro_id: formData.kapro_id
          ? parseInt(formData.kapro_id.toString())
          : null,
        work_location: formData.work_location.trim() || null,
        work_type: formData.work_type || null,
        user_id: userId,
      };

      const { data, error } = await supabase
        .from("work_order")
        .insert([submitData])
        .select()
        .single();

      if (error) {
        console.error("Database error:", error);
        throw new Error(`Database error: ${error.message}`);
      }

      if (!data) {
        throw new Error("No data returned from work order creation");
      }

      // Log the activity
      await ActivityLogService.logActivity({
        action: "create",
        tableName: "work_order",
        recordId: data.id,
        newData: data,
        description: `Created work order ${data.shipyard_wo_number}`,
      });

      // Consume the approval so it can't back a second additional WO
      if (approvedRequestIdToConsume) {
        const { error: consumeError } = await supabase
          .from("additional_wo_requests")
          .update({
            work_order_id: data.id,
            updated_at: new Date().toISOString(),
          })
          .eq("id", approvedRequestIdToConsume);
        if (consumeError) {
          console.error("Error consuming additional WO request:", consumeError);
        }
      }

      navigate(`/projects/${selectedProject.id}`, {
        state: { message: "Work order created successfully!" },
      });
    } catch (err) {
      console.error("Error creating work order:", err);
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    navigate("/work-orders");
  };

  if (loadingVessels || loadingKapros || loadingProjects || !currentUser) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">
            {loadingVessels
              ? "Loading vessels..."
              : loadingKapros
                ? "Loading kapros..."
                : loadingProjects
                  ? "Loading projects..."
                  : "Loading user information..."}
          </p>
        </div>
      </div>
    );
  }

  const selectedProjectReadinessStatus = selectedProject?.readiness_form?.status;
  const showReadinessWarning =
    selectedProject &&
    !formData.is_additional_wo &&
    selectedProjectReadinessStatus !== "APPROVED";

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div className="flex items-center">
              <button
                onClick={handleCancel}
                className="mr-4 text-gray-600 hover:text-gray-900 flex items-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" /> Back
              </button>
              <h1 className="text-2xl font-bold text-gray-900">
                Add New Work Order
              </h1>
            </div>
            <div className="text-sm text-gray-600">
              Creating as: {currentUser?.email}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-2xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="bg-white shadow rounded-lg">
          {/* Info Banner */}
          <div className="p-6 border-b border-gray-200">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <FileText className="w-6 h-6 text-blue-500" />
                </div>
                <div className="ml-3">
                  <p className="text-blue-800 font-medium">
                    Simplified Work Order
                  </p>
                  <p className="text-blue-700 text-sm">
                    Every work order belongs to a project. Pick an existing
                    project or create a new one — its vessel carries over
                    automatically.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-6 border-b border-gray-200">
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-red-600">{error}</p>
              </div>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            {/* Project Selection with Search */}
            <div className="relative" ref={projectDropdownRef}>
              <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center justify-between">
                <span>
                  Project <span className="text-red-500">*</span>
                </span>
                {!showNewProjectForm && (
                  <button
                    type="button"
                    onClick={() => setShowNewProjectForm(true)}
                    className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" /> New Project
                  </button>
                )}
              </label>

              {!showNewProjectForm ? (
                <>
                  <input
                    type="text"
                    value={projectSearchTerm}
                    onChange={handleProjectSearch}
                    onFocus={() => setShowProjectDropdown(true)}
                    placeholder="Search project by name, vessel, or company..."
                    className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required={!selectedProject}
                  />
                  {!selectedProject && projectSearchTerm && (
                    <p className="text-xs text-amber-600 mt-1">
                      Please select a project from the dropdown
                    </p>
                  )}

                  {showProjectDropdown && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                      {filteredProjects.length > 0 ? (
                        filteredProjects.map((project) => (
                          <div
                            key={project.id}
                            onClick={() => handleProjectSelect(project)}
                            className={`px-3 py-2 cursor-pointer hover:bg-blue-50 ${
                              selectedProject?.id === project.id
                                ? "bg-blue-100"
                                : ""
                            }`}
                          >
                            <div className="font-medium text-gray-900 flex items-center gap-1">
                              <FolderKanban className="w-3.5 h-3.5 text-blue-600" />
                              {project.project_name}
                            </div>
                            <div className="text-sm text-gray-600">
                              {project.vessel?.name} • {project.vessel?.type} (
                              {project.vessel?.company})
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="px-3 py-2 text-gray-500 text-sm">
                          No projects found
                        </div>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <div className="border border-gray-300 rounded-lg p-4 space-y-3 bg-gray-50">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Vessel
                    </label>
                    <input
                      type="text"
                      value={newProjectVesselSearch}
                      onChange={(e) => {
                        setNewProjectVesselSearch(e.target.value);
                        setShowNewProjectVesselDropdown(true);
                        setNewProjectVesselId("");
                      }}
                      onFocus={() => setShowNewProjectVesselDropdown(true)}
                      placeholder="Search vessel..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                    />
                    {showNewProjectVesselDropdown && (
                      <div className="mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                        {filteredNewProjectVessels.map((vessel) => (
                          <div
                            key={vessel.id}
                            onClick={() => {
                              setNewProjectVesselId(vessel.id.toString());
                              setNewProjectVesselSearch(
                                `${vessel.name} - ${vessel.type} (${vessel.company})`,
                              );
                              setShowNewProjectVesselDropdown(false);
                            }}
                            className="px-3 py-2 cursor-pointer hover:bg-blue-50 text-sm"
                          >
                            {vessel.name} - {vessel.type} ({vessel.company})
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Project Name
                    </label>
                    <input
                      type="text"
                      value={newProjectName}
                      onChange={(e) => {
                        setNewProjectNameManuallyEdited(true);
                        setNewProjectName(e.target.value);
                      }}
                      placeholder="e.g., BAROKAH GEMILANG PERKASA-MT M PATRICIA-Repair-2026-01"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                    />
                    {!formData.work_type && (
                      <p className="text-xs text-amber-600 mt-1">
                        Select a Work Type above first — the new project's
                        Jenis Docking is taken from it.
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleCreateProject}
                      disabled={
                        creatingProject ||
                        !newProjectVesselId ||
                        !newProjectName.trim() ||
                        !formData.work_type
                      }
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
                    >
                      {creatingProject ? "Creating..." : "Create & Use This Project"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowNewProjectForm(false)}
                      className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-100"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {vessels.length === 0 && (
                <p className="text-sm text-gray-500 mt-1">
                  No vessels available. Please add vessels first.
                </p>
              )}
            </div>

            {/* Additional WO Checkbox (moved up: it affects the readiness gate) */}
            <div className="flex items-center">
              <input
                type="checkbox"
                name="is_additional_wo"
                id="is_additional_wo"
                checked={formData.is_additional_wo}
                onChange={handleInputChange}
                disabled={!selectedProject || hasOriginalInProject !== true}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded disabled:opacity-50"
              />
              <label
                htmlFor="is_additional_wo"
                className="ml-2 block text-sm text-gray-700"
              >
                Check this if this is an ADDITIONAL Work Order
              </label>
            </div>
            {selectedProject && hasOriginalInProject === false && (
              <p className="text-xs text-gray-500 -mt-4">
                This project has no original work order yet, so it can't have
                an additional one. Create the original work order first.
              </p>
            )}

            {/* Operation Head approval for additional work orders */}
            {selectedProject &&
              hasOriginalInProject === true &&
              formData.is_additional_wo &&
              !loadingAdditionalWoRequests && (
                <div>
                  {unconsumedApprovedRequest ? (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex gap-3">
                      <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                      <p className="text-green-800 text-sm">
                        Approved by the Operation Head — you can create this
                        additional work order.
                      </p>
                    </div>
                  ) : latestPendingRequest ? (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex gap-3">
                      <Clock className="w-5 h-5 text-amber-600 flex-shrink-0" />
                      <div>
                        <p className="text-amber-800 text-sm font-medium">
                          Waiting for Operation Head approval
                        </p>
                        <p className="text-amber-700 text-sm mt-1">
                          Your request: "{latestPendingRequest.reason}"
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="border border-gray-300 rounded-lg p-4 space-y-3">
                      <p className="text-sm font-medium text-gray-900">
                        Request Operation Head approval
                      </p>
                      <p className="text-xs text-gray-500">
                        An additional work order needs an approved request
                        before it can be created.
                      </p>
                      {latestRejectedRequest && (
                        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                          <p className="text-red-800 text-xs font-medium">
                            A previous request was rejected
                          </p>
                          {latestRejectedRequest.decision_notes && (
                            <p className="text-red-700 text-xs mt-1">
                              "{latestRejectedRequest.decision_notes}"
                            </p>
                          )}
                        </div>
                      )}
                      <textarea
                        value={requestReason}
                        onChange={(e) => setRequestReason(e.target.value)}
                        rows={2}
                        placeholder="Why is this additional work order needed?"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                      />
                      <button
                        type="button"
                        onClick={handleSubmitAdditionalWoRequest}
                        disabled={submittingRequest || !requestReason.trim()}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
                      >
                        {submittingRequest ? "Submitting..." : "Submit Request"}
                      </button>
                    </div>
                  )}
                </div>
              )}

            {showReadinessWarning && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
                <div>
                  <p className="text-amber-800 text-sm font-medium">
                    This project's Readiness Form isn't approved yet
                  </p>
                  <p className="text-amber-700 text-sm mt-1">
                    An original work order can't be created until it is. If
                    this is an additional work order instead, check the box
                    above.
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      navigate(`/projects/${selectedProject!.id}/readiness`)
                    }
                    className="text-amber-800 underline text-sm mt-2"
                  >
                    Go to Readiness Form
                  </button>
                </div>
              </div>
            )}

            {/* Required Fields */}
            <div className="space-y-6">
              <h3 className="text-lg font-medium text-gray-900 border-b pb-2">
                Required Information
              </h3>

              {/* Shipyard WO Number */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Shipyard Work Order Number{" "}
                  <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="shipyard_wo_number"
                  value={formData.shipyard_wo_number}
                  onChange={handleInputChange}
                  className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="e.g., SY-2024-001"
                  required
                />
              </div>

              {/* Shipyard WO Date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Shipyard Work Order Date{" "}
                  <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  name="shipyard_wo_date"
                  value={formData.shipyard_wo_date}
                  onChange={handleInputChange}
                  className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              </div>
            </div>

            {/* Optional Fields */}
            <div className="space-y-6">
              <h3 className="text-lg font-medium text-gray-900 border-b pb-2">
                Optional Information
              </h3>

              {/* Work Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Work Type <span className="text-gray-500">(Optional)</span>
                </label>
                <select
                  name="work_type"
                  value={formData.work_type}
                  onChange={handleInputChange}
                  className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Select Work Type</option>
                  {WORK_TYPE_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  Select the type of work to be performed
                </p>
              </div>

              {/* Work Location */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Work Location{" "}
                  <span className="text-gray-500">(Optional)</span>
                </label>
                <input
                  type="text"
                  name="work_location"
                  value={formData.work_location}
                  onChange={handleInputChange}
                  className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="e.g., Dock 1, Workshop Area A"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Specify the general location where work will be performed
                </p>
              </div>

              {/* Customer WO Number */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Customer Work Order Number{" "}
                  <span className="text-gray-500">(Optional)</span>
                </label>
                <input
                  type="text"
                  name="customer_wo_number"
                  value={formData.customer_wo_number}
                  onChange={handleInputChange}
                  className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="e.g., WO-2024-001"
                />
              </div>

              {/* Customer WO Date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Customer Work Order Date{" "}
                  <span className="text-gray-500">(Optional)</span>
                </label>
                <input
                  type="date"
                  name="customer_wo_date"
                  value={formData.customer_wo_date}
                  onChange={handleInputChange}
                  className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {/* Kapro Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Kapro <span className="text-gray-500">(Optional)</span>
                </label>
                <select
                  name="kapro_id"
                  value={formData.kapro_id}
                  onChange={handleInputChange}
                  className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Select Kapro</option>
                  {kapros.map((kapro) => (
                    <option key={kapro.id} value={kapro.id}>
                      {kapro.kapro_name}
                    </option>
                  ))}
                </select>
                {kapros.length === 0 && (
                  <p className="text-sm text-gray-500 mt-1">
                    No kapros available.
                  </p>
                )}
              </div>
            </div>

            {/* Form Actions */}
            <div className="flex justify-end gap-4 pt-6 border-t">
              <button
                type="button"
                onClick={handleCancel}
                disabled={loading}
                className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={
                  loading ||
                  vessels.length === 0 ||
                  !currentUser ||
                  (formData.is_additional_wo && !unconsumedApprovedRequest)
                }
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {loading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Creating...
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" /> Create Work Order
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
