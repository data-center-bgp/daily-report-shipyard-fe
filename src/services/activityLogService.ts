import { supabase } from "../lib/supabase";
import type { ActivityLog } from "../lib/supabase";

interface LogActivityParams {
  action: "create" | "update" | "delete";
  tableName: string;
  recordId: number;
  oldData?: Record<string, any>;
  newData?: Record<string, any>;
  description?: string;
}

export class ActivityLogService {
  /**
   * Log an activity to the database
   */
  static async logActivity({
    action,
    tableName,
    recordId,
    oldData,
    newData,
    description,
  }: LogActivityParams): Promise<void> {
    try {
      // Get current user profile
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        return;
      }

      // Get user profile
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id, name, email")
        .eq("auth_user_id", user.id)
        .single();

      if (profileError) {
        return;
      }

      if (!profile) {
        return;
      }

      // Calculate changes if both old and new data exist
      let changes: Record<string, { old: any; new: any }> | undefined;
      if (oldData && newData) {
        changes = {};
        Object.keys(newData).forEach((key) => {
          if (JSON.stringify(oldData[key]) !== JSON.stringify(newData[key])) {
            changes![key] = {
              old: oldData[key],
              new: newData[key],
            };
          }
        });
      }

      // Get IP address and user agent (if available in browser)
      const ipAddress = await this.getIpAddress();
      const userAgent = navigator.userAgent;

      const logData = {
        user_id: profile.id,
        user_name: profile.name,
        user_email: profile.email,
        action,
        table_name: tableName,
        record_id: recordId,
        old_data: oldData || null,
        new_data: newData || null,
        changes: changes || null,
        ip_address: ipAddress || null,
        user_agent: userAgent || null,
        description: description || null,
      };

      // Insert activity log
      const { error } = await supabase.from("activity_logs").insert(logData);

      if (error) {
        console.error("Failed to insert activity log:", error);
      }
    } catch (error) {
      console.error("Error logging activity:", error);
    }
  }

  /**
   * Get user's IP address (optional, using external service)
   */
  private static async getIpAddress(): Promise<string | undefined> {
    try {
      const response = await fetch("https://api.ipify.org?format=json");
      const data = await response.json();
      return data.ip;
    } catch {
      return undefined;
    }
  }

  /**
   * Get activity logs for a specific record
   */
  static async getActivityLogs(
    tableName: string,
    recordId: number,
  ): Promise<ActivityLog[]> {
    const { data, error } = await supabase
      .from("activity_logs")
      .select("*")
      .eq("table_name", tableName)
      .eq("record_id", recordId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Failed to fetch activity logs:", error);
      return [];
    }

    return data || [];
  }

  /**
   * Get all activity logs with pagination
   */
  static async getAllActivityLogs(
    page: number = 1,
    pageSize: number = 50,
    filters?: {
      userId?: number;
      tableName?: string;
      action?: string;
      startDate?: string;
      endDate?: string;
    },
  ): Promise<{ data: ActivityLog[]; count: number }> {
    let query = supabase
      .from("activity_logs")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1);

    // Apply filters
    if (filters?.userId) {
      query = query.eq("user_id", filters.userId);
    }
    if (filters?.tableName) {
      query = query.eq("table_name", filters.tableName);
    }
    if (filters?.action) {
      query = query.eq("action", filters.action);
    }
    if (filters?.startDate) {
      query = query.gte("created_at", filters.startDate);
    }
    if (filters?.endDate) {
      query = query.lte("created_at", filters.endDate);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error("Failed to fetch activity logs:", error);
      return { data: [], count: 0 };
    }

    return { data: data || [], count: count || 0 };
  }

  /**
   * Get activity logs for current user
   */
  static async getMyActivityLogs(
    page: number = 1,
    pageSize: number = 50,
  ): Promise<{ data: ActivityLog[]; count: number }> {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { data: [], count: 0 };
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("auth_user_id", user.id)
      .single();

    if (!profile) {
      return { data: [], count: 0 };
    }

    return this.getAllActivityLogs(page, pageSize, { userId: profile.id });
  }
}
