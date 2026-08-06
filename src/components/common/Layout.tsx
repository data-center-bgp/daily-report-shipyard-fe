import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../hooks/useAuth";
import { useDashboardData } from "../../hooks/useDashboardData";
import {
  LayoutDashboard,
  FolderKanban,
  FileText,
  Wrench,
  TrendingUp,
  CheckCircle,
  FileCheck,
  Receipt,
  ScrollText,
  Download,
  Upload,
  Menu,
  LogOut,
  ChevronLeft,
  ChevronRight,
  User,
  Users,
  ClipboardList,
  ClipboardCheck,
  Bell,
  Database,
  type LucideIcon,
} from "lucide-react";

interface LayoutProps {
  children: React.ReactNode;
  onLogout: () => void;
}

interface NavItem {
  name: string;
  href: string;
  icon: LucideIcon;
  current: boolean;
  show: boolean;
}

interface NavGroup {
  title: string | null;
  items: NavItem[];
}

// ─── Sidebar navigation list — shared between the desktop and mobile
// drawers so grouping/styling can't drift out of sync between the two.
function SidebarNav({
  groups,
  collapsed,
  onNavigate,
}: {
  groups: NavGroup[];
  collapsed: boolean;
  onNavigate: (href: string) => void;
}) {
  return (
    <>
      {groups.map((group, groupIndex) => (
        <div
          key={group.title ?? `group-${groupIndex}`}
          className={groupIndex > 0 ? "mt-6" : ""}
        >
          {group.title && !collapsed && (
            <p className="px-3 mb-2 text-xs font-semibold text-blue-300/70 uppercase tracking-wider">
              {group.title}
            </p>
          )}
          {group.title && collapsed && groupIndex > 0 && (
            <div className="border-t border-blue-700/50 mx-2 mb-3" />
          )}
          <div className="space-y-1">
            {group.items.map((item) => {
              const IconComponent = item.icon;
              return (
                <div key={item.name} className="relative group">
                  <button
                    onClick={() => onNavigate(item.href)}
                    className={`w-full text-left px-3 py-2.5 rounded-xl flex items-center transition-all duration-200 ${
                      collapsed ? "justify-center" : "space-x-3"
                    } ${
                      item.current
                        ? "bg-white text-blue-800 shadow-lg shadow-black/10"
                        : "text-blue-100 hover:bg-white/10 hover:text-white hover:translate-x-0.5"
                    }`}
                  >
                    <IconComponent className="w-5 h-5 flex-shrink-0" />
                    {!collapsed && (
                      <span className="font-medium truncate">
                        {item.name}
                      </span>
                    )}
                  </button>

                  {/* Tooltip for collapsed state */}
                  {collapsed && (
                    <div className="absolute left-full ml-2 top-1/2 transform -translate-y-1/2 bg-gray-900 text-white px-2 py-1 rounded text-sm whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-50 pointer-events-none">
                      {item.name}
                      <div className="absolute left-0 top-1/2 transform -translate-y-1/2 -translate-x-1 w-2 h-2 bg-gray-900 rotate-45"></div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}

export default function Layout({ children, onLogout }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [_user, setUser] = useState<any>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const { canAccess, profile } = useAuth();
  const { alerts } = useDashboardData();

  useEffect(() => {
    const getUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setUser(user);
    };
    getUser();
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem("sidebar-collapsed");
    if (saved) {
      setSidebarCollapsed(JSON.parse(saved));
    }
  }, []);

  const toggleSidebar = () => {
    const newState = !sidebarCollapsed;
    setSidebarCollapsed(newState);
    localStorage.setItem("sidebar-collapsed", JSON.stringify(newState));
  };

  const navGroups: NavGroup[] = [
    {
      title: null,
      items: [
        {
          name: "Dashboard",
          href: "/",
          icon: LayoutDashboard,
          current: location.pathname === "/",
          show: true,
        },
      ],
    },
    {
      title: "Operations",
      items: [
        {
          name: "Projects",
          href: "/projects",
          icon: FolderKanban,
          current: location.pathname.startsWith("/projects"),
          show: canAccess("workOrders"),
        },
        {
          name: "Work Orders",
          href: "/work-orders",
          icon: FileText,
          current:
            location.pathname === "/work-orders" ||
            location.pathname.startsWith("/vessel/") ||
            location.pathname.startsWith("/work-order/") ||
            location.pathname.startsWith("/add-work-order") ||
            location.pathname.startsWith("/edit-work-order"),
          show: canAccess("workOrders"),
        },
        {
          name: "Work Details",
          href: "/work-details",
          icon: Wrench,
          current:
            location.pathname === "/work-details" ||
            location.pathname.startsWith("/work-details/") ||
            location.pathname.includes("/add-work-details") ||
            location.pathname.includes("/edit-work-details"),
          show: canAccess("workDetails"),
        },
        {
          name: "Work Progress",
          href: "/work-progress",
          icon: TrendingUp,
          current:
            location.pathname === "/work-progress" ||
            location.pathname.startsWith("/work-progress/") ||
            location.pathname.includes("/add-progress") ||
            location.pathname.includes("/edit-progress"),
          show: canAccess("progress"),
        },
      ],
    },
    {
      title: "Approvals & Review",
      items: [
        {
          name: "Readiness Queue",
          href: "/readiness-queue",
          icon: ClipboardCheck,
          current: location.pathname === "/readiness-queue",
          show: canAccess("readinessQueue"),
        },
        {
          name: "Additional WO Approvals",
          href: "/additional-wo-approvals",
          icon: ClipboardList,
          current: location.pathname === "/additional-wo-approvals",
          show: canAccess("additionalWoApprovals"),
        },
        {
          name: "Work Verification",
          href: "/work-verification",
          icon: CheckCircle,
          current:
            location.pathname === "/work-verification" ||
            location.pathname.startsWith("/work-verification/"),
          show: canAccess("verification"),
        },
      ],
    },
    {
      title: "Finance & Documents",
      items: [
        {
          name: "BASTP",
          href: "/bastp",
          icon: FileCheck,
          current:
            location.pathname === "/bastp" ||
            location.pathname.startsWith("/bastp/"),
          show: canAccess("bastp"),
        },
        {
          name: "Invoices",
          href: "/invoices",
          icon: Receipt,
          current:
            location.pathname === "/invoices" ||
            location.pathname.startsWith("/invoices/") ||
            location.pathname.includes("/invoice"),
          show: canAccess("invoices"),
        },
      ],
    },
    {
      title: "Data Tools",
      items: [
        {
          name: "Export Data",
          href: "/export-data",
          icon: Download,
          current: location.pathname === "/export-data",
          show: canAccess("exportData"),
        },
        {
          name: "Import Data",
          href: "/import-data",
          icon: Upload,
          current: location.pathname === "/import-data",
          show: canAccess("exportData"),
        },
      ],
    },
    {
      title: "Administration",
      items: [
        {
          name: "Activity Logs",
          href: "/activity-logs",
          icon: ScrollText,
          current:
            location.pathname === "/activity-logs" ||
            location.pathname.startsWith("/activity-logs/"),
          // Everyone can see this now — Master/Manager see every user's
          // activity, everyone else only sees their own (scoped in
          // ActivityLog.tsx).
          show: true,
        },
        {
          name: "User Management",
          href: "/user-management",
          icon: Users,
          current: location.pathname === "/user-management",
          show: canAccess("userManagement"),
        },
        {
          name: "Master Data",
          href: "/master-data",
          icon: Database,
          current: location.pathname === "/master-data",
          show: canAccess("masterData"),
        },
      ],
    },
  ];

  const visibleGroups = navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => item.show),
    }))
    .filter((group) => group.items.length > 0);

  const handleNavigate = (href: string) => navigate(href);

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar for desktop */}
      <div className="hidden lg:flex lg:flex-shrink-0 lg:fixed lg:inset-y-0 lg:z-30">
        <div
          className={`relative flex flex-col h-screen overflow-hidden bg-gradient-to-b from-blue-950 via-blue-900 to-slate-950 shadow-xl transition-all duration-300 ease-in-out ${
            sidebarCollapsed ? "w-16" : "w-64"
          }`}
        >
          {/* Decorative glow + texture, matching the login page */}
          <div className="pointer-events-none absolute -top-16 -left-16 w-64 h-64 bg-blue-500/20 rounded-full blur-3xl" />
          <div className="pointer-events-none absolute bottom-24 -right-16 w-64 h-64 bg-indigo-400/15 rounded-full blur-3xl" />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.06)_1px,transparent_0)] bg-[size:22px_22px]" />

          {/* Logo/Header */}
          <div className="relative z-10 flex-shrink-0 flex items-center justify-between h-16 px-4 bg-blue-950/60 border-b border-white/10">
            <div className="flex items-center space-x-3 min-w-0">
              <img
                src="/bgp-icon.jpg"
                alt="Barokah Galangan Perkasa"
                className="w-8 h-8 rounded-lg object-cover flex-shrink-0 ring-1 ring-white/20"
              />
              {!sidebarCollapsed && (
                <h1 className="text-lg font-bold text-white transition-opacity duration-200 truncate">
                  Shipyard System
                </h1>
              )}
            </div>

            {/* Collapse Toggle Button */}
            <button
              onClick={toggleSidebar}
              className="flex-shrink-0 w-8 h-8 bg-white/10 hover:bg-white/20 rounded-lg flex items-center justify-center text-white transition-all duration-200 hover:scale-105"
              title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {sidebarCollapsed ? (
                <ChevronRight className="w-4 h-4" />
              ) : (
                <ChevronLeft className="w-4 h-4" />
              )}
            </button>
          </div>

          {/* Navigation */}
          <nav className="relative z-10 flex-1 px-3 py-6 overflow-y-auto sidebar-scroll">
            <SidebarNav
              groups={visibleGroups}
              collapsed={sidebarCollapsed}
              onNavigate={handleNavigate}
            />
          </nav>
        </div>
      </div>

      {/* Mobile sidebar */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="fixed inset-0 bg-gray-600 bg-opacity-75"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="relative flex flex-col max-w-xs w-full h-full overflow-hidden bg-gradient-to-b from-blue-950 via-blue-900 to-slate-950 shadow-2xl">
            <div className="pointer-events-none absolute -top-16 -left-16 w-64 h-64 bg-blue-500/20 rounded-full blur-3xl" />
            <div className="pointer-events-none absolute bottom-24 -right-16 w-64 h-64 bg-indigo-400/15 rounded-full blur-3xl" />

            {/* Mobile sidebar header */}
            <div className="relative z-10 flex-shrink-0 flex items-center justify-between h-16 px-6 bg-blue-950/60 border-b border-white/10">
              <div className="flex items-center space-x-3">
                <img
                  src="/bgp-icon.jpg"
                  alt="Barokah Galangan Perkasa"
                  className="w-8 h-8 rounded-lg object-cover ring-1 ring-white/20"
                />
                <h1 className="text-xl font-bold text-white">
                  Shipyard System
                </h1>
              </div>
              <button
                onClick={() => setSidebarOpen(false)}
                className="text-white hover:text-blue-200 transition-colors p-1"
              >
                <span className="text-xl">✕</span>
              </button>
            </div>

            {/* Mobile navigation */}
            <nav className="relative z-10 flex-1 px-4 py-6 overflow-y-auto sidebar-scroll">
              <SidebarNav
                groups={visibleGroups}
                collapsed={false}
                onNavigate={(href) => {
                  handleNavigate(href);
                  setSidebarOpen(false);
                }}
              />
            </nav>
          </div>
        </div>
      )}

      {/* Main content */}
      <div
        className={`flex-1 flex flex-col overflow-hidden transition-all duration-300 ${
          sidebarCollapsed ? "lg:ml-16" : "lg:ml-64"
        }`}
      >
        {/* Top navbar */}
        <div className="flex-shrink-0 bg-white border-b border-gray-200 px-4 py-3 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 lg:hidden">
              <button
                onClick={() => setSidebarOpen(true)}
                className="-ml-2 text-gray-600 hover:text-gray-900 p-2 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <Menu className="w-6 h-6" />
              </button>
              <img
                src="/bgp-icon.jpg"
                alt="Barokah Galangan Perkasa"
                className="w-6 h-6 rounded object-cover"
              />
              <h1 className="text-lg font-medium text-gray-900">
                Shipyard System
              </h1>
            </div>

            <div className="flex items-center space-x-1 ml-auto">
              <button
                onClick={() => navigate("/alerts")}
                title="Alerts"
                className="relative p-2 rounded-lg text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors"
              >
                <Bell className="w-5 h-5" />
                {alerts.length > 0 && (
                  <span className="absolute top-0.5 right-0.5 flex items-center justify-center min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-red-600 text-white text-[10px] font-bold leading-none">
                    {alerts.length > 9 ? "9+" : alerts.length}
                  </span>
                )}
              </button>

              <div className="w-px h-6 bg-gray-200 mx-1"></div>

              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center ring-2 ring-blue-100 flex-shrink-0">
                  {profile?.name ? (
                    <span className="text-white text-xs font-bold">
                      {profile.name.charAt(0).toUpperCase()}
                    </span>
                  ) : (
                    <User className="w-4 h-4 text-white" />
                  )}
                </div>
                <span className="hidden sm:block text-sm font-medium text-gray-700 max-w-[10rem] truncate">
                  {profile?.name || "User"}
                </span>
              </div>

              <button
                onClick={onLogout}
                title="Logout"
                className="flex items-center space-x-1.5 text-sm font-medium text-red-600 hover:text-red-700 hover:bg-red-50 px-3 py-2 rounded-lg transition-colors"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Logout</span>
              </button>
            </div>
          </div>
        </div>

        {/* Page content */}
        <main className="flex-1 overflow-auto bg-gray-50">{children}</main>
      </div>
    </div>
  );
}
