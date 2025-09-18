/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import type {
  ProjectProgressFormData,
  ProgressFilter,
  ProgressStats,
  WorkProgressWithDetails,
} from "../types/progressTypes";

// Add missing types that are specific to the useProgress hook
interface ProgressSummary {
  work_order_id: number;
  current_progress: number;
  latest_report_date: string;
  total_reports: number;
  work_order: {
    id: number;
    customer_wo_number: string;
    shipyard_wo_number: string;
    wo_location: string;
    wo_description: string;
    vessel: {
      name: string;
      type: string;
      company: string;
    };
  };
  progress_history: {
    date: string;
    progress: number;
    reporter: string;
  }[];
}

interface ProgressChartData {
  date: string;
  progress: number;
  reporter: string;
  formatted_date: string;
}

export const useProgress = () => {
  const [progress, setProgress] = useState<WorkProgressWithDetails[]>([]);
  const [progressSummaries, setProgressSummaries] = useState<ProgressSummary[]>(
    []
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<ProgressStats | null>(null);

  const fetchProgress = useCallback(async (filter?: ProgressFilter) => {
    try {
      setLoading(true);
      setError(null);

      let query = supabase
        .from("project_progress")
        .select(
          `
          *,
          work_order:work_order_id (
            id,
            customer_wo_number,
            shipyard_wo_number,
            wo_location,
            wo_description,
            vessel:vessel_id (
              name,
              type,
              company
            )
          ),
          user:user_id (
            id,
            name,
            email
          )
        `
        )
        .is("deleted_at", null)
        .order("report_date", { ascending: false });

      // Apply filters - updated to use the unified filter interface
      if (filter?.work_order_id) {
        query = query.eq("work_order_id", filter.work_order_id);
      }
      if (filter?.date_from) {
        query = query.gte("report_date", filter.date_from);
      }
      if (filter?.date_to) {
        query = query.lte("report_date", filter.date_to);
      }
      if (filter?.project_progress_min !== undefined) {
        query = query.gte("progress", filter.project_progress_min);
      }
      if (filter?.project_progress_max !== undefined) {
        query = query.lte("progress", filter.project_progress_max);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Transform data to match WorkProgressWithDetails interface
      const transformedData = (data || []).map((item: any) => ({
        ...item,
        work_order: Array.isArray(item.work_order)
          ? item.work_order[0]
          : item.work_order,
        user: Array.isArray(item.user) ? item.user[0] : item.user,
      })) as WorkProgressWithDetails[];

      setProgress(transformedData);
      return transformedData;
    } catch (err) {
      console.error("Error fetching progress:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch progress");
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch progress summary for each work order (latest progress)
  const fetchProgressSummaries = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const { data: allProgress, error } = await supabase
        .from("project_progress")
        .select(
          `
          *,
          work_order:work_order_id (
            id,
            customer_wo_number,
            shipyard_wo_number,
            wo_location,
            wo_description,
            vessel:vessel_id (
              name,
              type,
              company
            )
          ),
          user:user_id (
            id,
            name,
            email
          )
        `
        )
        .is("deleted_at", null)
        .order("report_date", { ascending: false });

      if (error) throw error;

      // Group by work_order_id and get latest progress for each
      const summariesMap = new Map<number, ProgressSummary>();

      allProgress?.forEach((item) => {
        const workOrder = Array.isArray(item.work_order)
          ? item.work_order[0]
          : item.work_order;
        const user = Array.isArray(item.user) ? item.user[0] : item.user;

        if (!summariesMap.has(item.work_order_id)) {
          summariesMap.set(item.work_order_id, {
            work_order_id: item.work_order_id,
            current_progress: item.progress,
            latest_report_date: item.report_date,
            total_reports: 1,
            work_order: workOrder,
            progress_history: [
              {
                date: item.report_date,
                progress: item.progress,
                reporter: user?.name || "Unknown",
              },
            ],
          });
        } else {
          // Add to history and increment count
          const existing = summariesMap.get(item.work_order_id)!;
          existing.total_reports++;
          existing.progress_history.push({
            date: item.report_date,
            progress: item.progress,
            reporter: user?.name || "Unknown",
          });
        }
      });

      const summaries = Array.from(summariesMap.values());
      setProgressSummaries(summaries);
      return summaries;
    } catch (err) {
      console.error("Error fetching progress summaries:", err);
      setError("Failed to fetch progress summaries");
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const addProgress = useCallback(
    async (progressData: ProjectProgressFormData) => {
      try {
        setLoading(true);
        setError(null);

        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) throw new Error("User not authenticated");

        const { data: profile } = await supabase
          .from("profiles")
          .select("id")
          .eq("auth_user_id", user.id)
          .single();

        if (!profile) throw new Error("User profile not found");

        const { data: existingProgress } = await supabase
          .from("project_progress")
          .select("id")
          .eq("work_order_id", progressData.work_order_id)
          .eq("report_date", progressData.report_date)
          .is("deleted_at", null)
          .maybeSingle();

        if (existingProgress) {
          throw new Error(
            "Progress already recorded for this date. Please choose a different date."
          );
        }

        const { data, error } = await supabase
          .from("project_progress")
          .insert([
            {
              progress: progressData.progress,
              report_date: progressData.report_date,
              work_order_id: progressData.work_order_id,
              user_id: profile.id,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          ])
          .select()
          .single();

        if (error) throw error;

        await fetchProgress();
        await fetchProgressSummaries();

        return data;
      } catch (err) {
        console.error("Error adding progress:", err);
        setError(err instanceof Error ? err.message : "Failed to add progress");
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [fetchProgress, fetchProgressSummaries]
  );

  const getWorkOrderProgress = useCallback(
    async (workOrderId: number): Promise<ProgressChartData[]> => {
      try {
        const { data, error } = await supabase
          .from("project_progress")
          .select(
            `
          progress,
          report_date,
          user:user_id (name)
        `
          )
          .eq("work_order_id", workOrderId)
          .is("deleted_at", null)
          .order("report_date", { ascending: true });

        if (error) throw error;

        return (data || []).map((item) => {
          const user = Array.isArray(item.user) ? item.user[0] : item.user;
          return {
            date: item.report_date,
            progress: item.progress,
            reporter: user?.name || "Unknown",
            formatted_date: new Date(item.report_date).toLocaleDateString(),
          };
        });
      } catch (err) {
        console.error("Error fetching work order progress:", err);
        return [];
      }
    },
    []
  );

  // Get progress statistics - updated to use unified ProgressStats
  const fetchProgressStats = useCallback(async (): Promise<ProgressStats> => {
    try {
      const summaries = await fetchProgressSummaries();

      const total_projects = summaries.length;
      const completed_projects = summaries.filter(
        (s) => s.current_progress >= 100
      ).length;
      const active_projects = total_projects - completed_projects;
      const average_project_progress =
        summaries.length > 0
          ? summaries.reduce((sum, s) => sum + s.current_progress, 0) /
            summaries.length
          : 0;

      // Simple heuristic for projects behind schedule (less than expected progress)
      const today = new Date();
      const projects_behind_schedule = summaries.filter((s) => {
        const lastReport = new Date(s.latest_report_date);
        const daysSinceLastReport = Math.floor(
          (today.getTime() - lastReport.getTime()) / (1000 * 60 * 60 * 24)
        );
        // Consider behind if no update in 3+ days and not 100% complete
        return daysSinceLastReport > 3 && s.current_progress < 100;
      }).length;

      const projects_on_track = active_projects - projects_behind_schedule;

      // Fetch work details stats for the unified interface
      const { data: workDetailsStats, error: workDetailsError } = await supabase
        .from("work_progress")
        .select("work_details_id, progress_percentage, evidence_url")
        .is("deleted_at", null);

      let total_work_details = 0;
      let completed_work_details = 0;
      let work_details_with_evidence = 0;
      let average_details_progress = 0;

      if (!workDetailsError && workDetailsStats) {
        // Get unique work details and their max progress
        const workDetailsMap = new Map<
          number,
          { maxProgress: number; hasEvidence: boolean }
        >();

        workDetailsStats.forEach((item) => {
          const existing = workDetailsMap.get(item.work_details_id);
          const hasEvidence = !!item.evidence_url;

          if (!existing || existing.maxProgress < item.progress_percentage) {
            workDetailsMap.set(item.work_details_id, {
              maxProgress: item.progress_percentage,
              hasEvidence: existing?.hasEvidence || hasEvidence,
            });
          }
        });

        total_work_details = workDetailsMap.size;
        completed_work_details = Array.from(workDetailsMap.values()).filter(
          (detail) => detail.maxProgress >= 100
        ).length;
        work_details_with_evidence = Array.from(workDetailsMap.values()).filter(
          (detail) => detail.hasEvidence
        ).length;
        average_details_progress =
          Array.from(workDetailsMap.values()).reduce(
            (sum, detail) => sum + detail.maxProgress,
            0
          ) / total_work_details || 0;
      }

      const stats: ProgressStats = {
        // Project level stats
        total_projects,
        active_projects,
        completed_projects,
        average_project_progress:
          Math.round(average_project_progress * 100) / 100,
        projects_behind_schedule,
        projects_on_track,

        // Work details level stats
        total_work_details,
        completed_work_details,
        work_details_with_evidence,
        average_details_progress:
          Math.round(average_details_progress * 100) / 100,
      };

      setStats(stats);
      return stats;
    } catch (err) {
      console.error("Error fetching progress stats:", err);
      const defaultStats: ProgressStats = {
        total_projects: 0,
        active_projects: 0,
        completed_projects: 0,
        average_project_progress: 0,
        projects_behind_schedule: 0,
        projects_on_track: 0,
        total_work_details: 0,
        completed_work_details: 0,
        work_details_with_evidence: 0,
        average_details_progress: 0,
      };
      setStats(defaultStats);
      return defaultStats;
    }
  }, [fetchProgressSummaries]);

  const deleteProgress = useCallback(
    async (progressId: number) => {
      try {
        setLoading(true);
        setError(null);

        const { error } = await supabase
          .from("project_progress")
          .update({
            deleted_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", progressId);

        if (error) throw error;

        await fetchProgress();
        await fetchProgressSummaries();

        return true;
      } catch (err) {
        console.error("Error deleting progress:", err);
        setError(
          err instanceof Error ? err.message : "Failed to delete progress"
        );
        return false;
      } finally {
        setLoading(false);
      }
    },
    [fetchProgress, fetchProgressSummaries]
  );

  useEffect(() => {
    fetchProgress();
    fetchProgressSummaries();
    fetchProgressStats();
  }, [fetchProgress, fetchProgressSummaries, fetchProgressStats]);

  return {
    // Data
    progress,
    progressSummaries,
    stats,
    loading,
    error,

    // Actions
    fetchProgress,
    fetchProgressSummaries,
    addProgress,
    getWorkOrderProgress,
    fetchProgressStats,
    deleteProgress,

    // Utilities
    clearError: () => setError(null),
  };
};
