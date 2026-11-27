import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { useDashboardData } from "../../hooks/useDashboardData";
import { useStackedTables } from "../../hooks/useStackedTables";
import MobileNavDrawer from "./MobileNavDrawer";
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
  X,
  Users,
  ClipboardList,
  ClipboardCheck,
  Bell,
  CalendarClock,
  Database,
  Braces,
  BookOpen,
  Hammer,
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

const BRAND_NAME = "Shipyard System";
const COMPANY_NAME = "Barokah Galangan Perkasa";

// Sidebar navigation list, shared between the desktop sidebar and the mobile
// drawer so grouping and styling can't drift apart. Every entry is a real
// link (open in a new tab, copy the address, middle-click) and the current
// page is exposed with aria-current, not just a colour.
function SidebarNav({
  groups,
  collapsed,
  onNavigate,
}: {
  groups: NavGroup[];
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  return (
    <>
      {groups.map((group, groupIndex) => {
        const headingId = group.title
          ? `nav-group-${group.title.replace(/\W+/g, "-").toLowerCase()}`
          : undefined;
        return (
          <div
            key={group.title ?? `group-${groupIndex}`}
            className={groupIndex > 0 ? "mt-5" : ""}
          >
            {group.title && !collapsed && (
              <h2
                id={headingId}
                className="mb-1.5 px-3 text-xs font-semibold text-blue-200"
              >
                {group.title}
              </h2>
            )}
            {group.title && collapsed && groupIndex > 0 && (
              <div className="mx-2 mb-3 border-t border-white/15" />
            )}
            <ul aria-labelledby={headingId} className="space-y-0.5">
              {group.items.map((item) => {
                const IconComponent = item.icon;
                return (
                  <li key={item.name} className="group relative">
                    <Link
                      to={item.href}
                      onClick={onNavigate}
                      aria-current={item.current ? "page" : undefined}
                      aria-label={collapsed ? item.name : undefined}
                      className={`flex min-h-11 items-center rounded-md px-3 py-2 text-sm transition-colors ${
                        collapsed ? "justify-center" : "gap-3"
                      } ${
                        item.current
                          ? "bg-white font-semibold text-blue-950"
                          : "text-blue-50 hover:bg-white/10 hover:text-white"
                      }`}
                    >
                      <IconComponent
                        className="h-5 w-5 flex-shrink-0"
                        aria-hidden="true"
                      />
                      {!collapsed && <span className="truncate">{item.name}</span>}
                    </Link>

                    {/* Name shown beside the icon while the sidebar is
                        collapsed. Reachable by keyboard focus as well as hover. */}
                    {collapsed && (
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2.5 py-1.5 text-sm text-white opacity-0 shadow-md transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
                      >
                        {item.name}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </>
  );
}

function BrandMark({ showName }: { showName: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <img
        src="/bgp-icon.jpg"
        alt={COMPANY_NAME}
        width={32}
        height={32}
        className="h-8 w-8 flex-shrink-0 rounded-md object-cover"
      />
      {showName && (
        <span className="truncate text-base font-semibold text-white">
          {BRAND_NAME}
        </span>
      )}
    </div>
  );
}

export default function Layout({ children, onLogout }: LayoutProps) {
  useStackedTables();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("sidebar-collapsed") ?? "false");
    } catch {
      return false;
    }
  });
  const location = useLocation();
  const { canAccess, profile, canVerifyExternalVesselWork } = useAuth();
  const { alerts } = useDashboardData();

  // The drawer only exists below lg. If the window grows past it while the
  // drawer is open (rotating a tablet, resizing), close it instead of leaving
  // an invisible modal holding the page inert.
  useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px)");
    const onChange = () => {
      if (query.matches) setDrawerOpen(false);
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  const toggleSidebar = () => {
    const next = !sidebarCollapsed;
    setSidebarCollapsed(next);
    try {
      localStorage.setItem("sidebar-collapsed", JSON.stringify(next));
    } catch {
      // Storage can be blocked; the toggle still works for this visit.
    }
  };

  // One work detail's progress reports: /work-details/:id/progress.
  const isWorkDetailProgressPage = /^\/work-details\/[^/]+\/progress$/.test(
    location.pathname,
  );

  const navGroups: NavGroup[] = [
    {
      title: null,
      items: [
        {
          name: "Dashboard",
          href: "/",
          icon: LayoutDashboard,
          current:
            location.pathname === "/" || location.pathname === "/dashboard",
          show: true,
        },
      ],
    },
    {
      title: "Planning",
      items: [
        {
          name: "Docking Plans",
          href: "/plans",
          icon: CalendarClock,
          current: location.pathname.startsWith("/plans"),
          show: canAccess("shippingPlans"),
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
          // /work-order/:id/add-work-details is adding work details, so it
          // belongs to Work Details below, not here.
          current:
            location.pathname === "/work-orders" ||
            location.pathname.startsWith("/vessel/") ||
            location.pathname.startsWith("/add-work-order") ||
            location.pathname.startsWith("/edit-work-order"),
          show: canAccess("workOrders"),
        },
        {
          name: "Work Details",
          href: "/work-details",
          icon: Wrench,
          // /work-details/:id/progress is a progress page (Work Progress).
          current:
            (location.pathname === "/work-details" ||
              location.pathname.startsWith("/work-details/") ||
              location.pathname.includes("/add-work-details") ||
              location.pathname.startsWith("/edit-work-details")) &&
            !isWorkDetailProgressPage,
          show: canAccess("workDetails"),
        },
        {
          name: "Work Progress",
          href: "/work-progress",
          icon: TrendingUp,
          current:
            location.pathname === "/work-progress" ||
            location.pathname.startsWith("/work-progress/") ||
            location.pathname.startsWith("/add-work-progress") ||
            isWorkDetailProgressPage,
          show: canAccess("progress"),
        },
      ],
    },
    {
      title: "New Building",
      items: [
        {
          name: "New Building",
          href: "/new-building",
          icon: Hammer,
          current: location.pathname === "/new-building",
          show: canAccess("newBuilding"),
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
          show: canAccess("verification") || canVerifyExternalVesselWork,
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
          show: canAccess("importData"),
        },
      ],
    },
    {
      title: "Developer",
      items: [
        {
          name: "API Documentation",
          href: "/developer/api",
          icon: Braces,
          current: location.pathname.startsWith("/developer"),
          show: canAccess("developer"),
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
    {
      title: "Bantuan",
      items: [
        {
          name: "Panduan Pengguna",
          href: "/guide",
          icon: BookOpen,
          current: location.pathname.startsWith("/guide"),
          // Every role, Shipping included.
          show: true,
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

  const alertCount = alerts.length;
  const alertLabel =
    alertCount > 0
      ? `Alerts, ${alertCount} active`
      : "Alerts, none active";
  const userName = profile?.name || "User";

  const skipToContent = (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    const main = document.getElementById("main-content");
    main?.focus();
    main?.scrollIntoView();
  };

  return (
    <div className="flex min-h-dvh bg-slate-50">
      <a
        href="#main-content"
        onClick={skipToContent}
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-md focus:bg-white focus:px-4 focus:py-2.5 focus:text-sm focus:font-semibold focus:text-blue-950 focus:shadow-lg"
      >
        Skip to main content
      </a>

      {/* Desktop sidebar. A flat navy surface: the navy is the brand colour
          from the logo, and nothing on it blurs, glows or floats. */}
      <aside className="on-navy fixed inset-y-0 z-30 hidden lg:flex lg:flex-shrink-0">
        <div
          className={`flex h-dvh flex-col overflow-hidden bg-blue-950 transition-[width] duration-200 ease-out ${
            sidebarCollapsed ? "w-16" : "w-64"
          }`}
        >
          <div
            className={`flex h-16 flex-shrink-0 items-center border-b border-white/10 px-3 ${
              sidebarCollapsed ? "justify-center" : "justify-between"
            }`}
          >
            {!sidebarCollapsed && <BrandMark showName />}
            <button
              type="button"
              onClick={toggleSidebar}
              aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-expanded={!sidebarCollapsed}
              className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-md text-blue-100 transition-colors hover:bg-white/10 hover:text-white"
            >
              {sidebarCollapsed ? (
                <ChevronRight className="h-5 w-5" aria-hidden="true" />
              ) : (
                <ChevronLeft className="h-5 w-5" aria-hidden="true" />
              )}
            </button>
          </div>

          <nav
            aria-label="Main"
            className="sidebar-scroll flex-1 overflow-y-auto px-3 py-5"
          >
            <SidebarNav groups={visibleGroups} collapsed={sidebarCollapsed} />
          </nav>
        </div>
      </aside>

      {/* Mobile and tablet: the same navigation in a swipeable drawer. */}
      <MobileNavDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        label="Navigation menu"
      >
        <div className="flex h-16 flex-shrink-0 items-center justify-between border-b border-white/10 pl-4 pr-2">
          <BrandMark showName />
          <button
            type="button"
            onClick={() => setDrawerOpen(false)}
            aria-label="Close menu"
            data-autofocus
            className="flex h-11 w-11 items-center justify-center rounded-md text-blue-100 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <nav
          aria-label="Main"
          className="sidebar-scroll flex-1 overflow-y-auto px-3 py-5"
        >
          <SidebarNav
            groups={visibleGroups}
            collapsed={false}
            onNavigate={() => setDrawerOpen(false)}
          />
        </nav>
      </MobileNavDrawer>

      <div
        className={`flex min-w-0 flex-1 flex-col transition-[margin] duration-200 ease-out ${
          sidebarCollapsed ? "lg:ml-16" : "lg:ml-64"
        }`}
      >
        <header className="sticky top-0 z-20 flex-shrink-0 border-b border-slate-200 bg-white px-2 sm:px-4">
          <div className="flex min-h-14 items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-1 lg:hidden">
              <button
                type="button"
                onClick={() => setDrawerOpen(true)}
                aria-haspopup="dialog"
                aria-expanded={drawerOpen}
                className="inline-flex h-11 items-center gap-2 rounded-md px-3 text-sm font-medium text-slate-800 transition-colors hover:bg-slate-100"
              >
                <Menu className="h-5 w-5" aria-hidden="true" />
                Menu
              </button>
              <img
                src="/bgp-icon.jpg"
                alt={COMPANY_NAME}
                width={28}
                height={28}
                className="h-7 w-7 flex-shrink-0 rounded-md object-cover"
              />
            </div>

            <div className="ml-auto flex items-center gap-1">
                <Link
                  to="/alerts"
                  aria-label={alertLabel}
                  className="relative inline-flex h-11 w-11 items-center justify-center rounded-md text-slate-700 transition-colors hover:bg-slate-100"
                >
                  <Bell className="h-5 w-5" aria-hidden="true" />
                  {alertCount > 0 && (
                    <span
                      aria-hidden="true"
                      className="absolute right-0.5 top-0.5 flex h-[1.125rem] min-w-[1.125rem] items-center justify-center rounded-full bg-red-700 px-1 text-[11px] font-semibold leading-none text-white"
                    >
                      {alertCount > 9 ? "9+" : alertCount}
                    </span>
                  )}
                </Link>

                <div className="mx-1 h-6 w-px bg-slate-200" aria-hidden="true" />

              <div className="flex items-center gap-2 px-1">
                <span
                  aria-hidden="true"
                  className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-blue-950 text-xs font-semibold text-white"
                >
                  {userName.charAt(0).toUpperCase()}
                </span>
                <span className="hidden max-w-[10rem] truncate text-sm font-medium text-slate-800 sm:block">
                  {userName}
                </span>
                <span className="sr-only sm:hidden">Signed in as {userName}</span>
              </div>

              <button
                type="button"
                onClick={onLogout}
                className="inline-flex h-11 min-w-11 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium text-red-700 transition-colors hover:bg-red-50"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                <span className="sr-only sm:not-sr-only">Logout</span>
              </button>
            </div>
          </div>
        </header>

        {/* overflow-x-clip (not auto): a wide child can't push the page
            sideways, and it doesn't turn <main> into a scroll container that
            would stop the header sticking. */}
        <main
          id="main-content"
          tabIndex={-1}
          className="min-w-0 flex-1 overflow-x-clip outline-none"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
