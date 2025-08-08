import { useState, useEffect } from "react";
import { supabase, type User } from "../lib/supabase";
import WorkOrderTable from "./WorkOrderTable";

interface DashboardProps {
  onLogout: () => void;
}

type TabType =
  | "work-order"
  | "permit-to-work"
  | "project-progress"
  | "invoice-details";

export default function Dashboard({ onLogout }: DashboardProps) {
  const [activeTab, setActiveTab] = useState<TabType>("work-order");
  const [user, setUser] = useState<User | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  useEffect(() => {
    // Get current user from Supabase auth and fetch profile
    const getCurrentUser = async () => {
      console.log("Fetching current user...");
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();

      console.log("Current user:", authUser);

      if (authUser) {
        try {
          console.log("Fetching user profile ID:", authUser.id);
          // Fetch user profile from profiles table
          const { data: profile, error } = await supabase
            .from("profiles")
            .select("*")
            .eq("auth_user_id", authUser.id)
            .single();

          console.log("User profile:", profile, error);

          if (error) {
            console.error("Error fetching profile:", error);

            // If profile doesn't exist, create one from auth metadata
            if (error.code === "PGRST116") {
              // No rows found
              const { error: insertError } = await supabase
                .from("profiles")
                .insert({
                  auth_user_id: authUser.id,
                  name: authUser.user_metadata?.name || "User",
                  email: authUser.email || "",
                  company: authUser.user_metadata?.company || "Unknown",
                  role: authUser.user_metadata?.role || "Unknown",
                });

              if (insertError) {
                console.error("Error creating profile:", insertError);
              } else {
                // Retry fetching the profile
                const { data: newProfile } = await supabase
                  .from("profiles")
                  .select("*")
                  .eq("auth_user_id", authUser.id)
                  .single();

                if (newProfile) {
                  setUser({
                    id: newProfile.auth_user_id,
                    email: newProfile.email,
                    name: newProfile.name,
                    company: newProfile.company,
                    role: newProfile.role,
                  });
                  return;
                }
              }
            }

            // Fallback to auth metadata if profile operations fail
            setUser({
              id: authUser.id,
              email: authUser.email || "",
              name: authUser.user_metadata?.name || "User",
              company: authUser.user_metadata?.company || "Unknown",
              role: authUser.user_metadata?.role || "Unknown",
            });
          } else if (profile) {
            // Use profile data from database
            setUser({
              id: profile.auth_user_id,
              email: profile.email,
              name: profile.name,
              company: profile.company,
              role: profile.role,
            });
          }
        } catch (err) {
          console.error("Error in getCurrentUser:", err);
          // Fallback to auth metadata
          setUser({
            id: authUser.id,
            email: authUser.email || "",
            name: authUser.user_metadata?.name || "User",
            company: authUser.user_metadata?.company || "Unknown",
            role: authUser.user_metadata?.role || "Unknown",
          });
        }
      }
    };

    getCurrentUser();
  }, []);

  const tabs = [
    { id: "work-order", name: "Work Order", icon: "📋" },
    { id: "permit-to-work", name: "Permit to Work", icon: "📄" },
    { id: "project-progress", name: "Project Progress", icon: "📊" },
    { id: "invoice-details", name: "Invoice Details", icon: "💰" },
  ] as const;

  const handleLogout = async () => {
    await supabase.auth.signOut();
    onLogout();
  };

  const renderActiveTab = () => {
    switch (activeTab) {
      case "work-order":
        return <WorkOrderTable />;
      case "permit-to-work":
        return (
          <div className="flex items-center justify-center h-64">
            <p className="text-gray-500">Permit to Work - Coming Soon</p>
          </div>
        );
      case "project-progress":
        return (
          <div className="flex items-center justify-center h-64">
            <p className="text-gray-500">Project Progress - Coming Soon</p>
          </div>
        );
      case "invoice-details":
        return (
          <div className="flex items-center justify-center h-64">
            <p className="text-gray-500">Invoice Details - Coming Soon</p>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <div
        className={`${
          isSidebarOpen ? "w-64" : "w-16"
        } bg-gradient-to-b from-slate-900 via-blue-900 to-slate-900 transition-all duration-300 flex flex-col`}
      >
        {/* Sidebar Header */}
        <div className="p-4 border-b border-white/10">
          <div className="flex items-center justify-between">
            {isSidebarOpen && (
              <h1 className="text-white font-bold text-lg">Shipyard Portal</h1>
            )}
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="text-white hover:text-blue-300 transition-colors"
            >
              {isSidebarOpen ? "←" : "→"}
            </button>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4">
          <ul className="space-y-2">
            {tabs.map((tab) => (
              <li key={tab.id}>
                <button
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center p-3 rounded-lg transition-all duration-200 ${
                    activeTab === tab.id
                      ? "bg-blue-600 text-white"
                      : "text-slate-300 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  <span className="text-xl mr-3">{tab.icon}</span>
                  {isSidebarOpen && (
                    <span className="font-medium">{tab.name}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {/* User Info & Logout */}
        <div className="p-4 border-t border-white/10">
          {isSidebarOpen ? (
            <div className="space-y-3">
              <div className="text-slate-300 text-sm">
                <p className="font-medium text-white">{user?.name}</p>
                <p>
                  {user?.role} at {user?.company}
                </p>
                <p className="text-xs opacity-75">{user?.email}</p>
              </div>
              <button
                onClick={handleLogout}
                className="w-full bg-red-600 hover:bg-red-700 text-white py-2 px-4 rounded-lg transition-colors duration-200"
              >
                Logout
              </button>
            </div>
          ) : (
            <button
              onClick={handleLogout}
              className="w-full bg-red-600 hover:bg-red-700 text-white p-2 rounded-lg transition-colors duration-200"
              title="Logout"
            >
              🚪
            </button>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className="bg-white shadow-sm border-b p-6">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold text-gray-800">
              {tabs.find((tab) => tab.id === activeTab)?.name}
            </h2>
            <div className="flex items-center space-x-4">
              <span className="text-gray-600">Welcome back, {user?.name}</span>
            </div>
          </div>
        </header>

        {/* Content Area */}
        <main className="flex-1 p-6">{renderActiveTab()}</main>
      </div>
    </div>
  );
}
