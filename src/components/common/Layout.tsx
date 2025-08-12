import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";

interface LayoutProps {
  children: React.ReactNode;
  onLogout: () => void;
}

export default function Layout({ children, onLogout }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [user, setUser] = useState<any>(null);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    // Get current user
    const getUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setUser(user);
    };
    getUser();
  }, []);

  // Load collapsed state from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("sidebar-collapsed");
    if (saved) {
      setSidebarCollapsed(JSON.parse(saved));
    }
  }, []);

  // Save collapsed state to localStorage
  const toggleSidebar = () => {
    const newState = !sidebarCollapsed;
    setSidebarCollapsed(newState);
    localStorage.setItem("sidebar-collapsed", JSON.stringify(newState));
  };

  const navigation = [
    {
      name: "Dashboard",
      href: "/",
      icon: "📊",
      current: location.pathname === "/",
    },
    {
      name: "Work Orders",
      href: "/work-orders",
      icon: "📋",
      current: location.pathname === "/work-orders",
    },
    {
      name: "Permits to Work",
      href: "/permits",
      icon: "📄",
      current:
        location.pathname === "/permits" ||
        location.pathname === "/upload-permit",
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar for desktop */}
      <div className="hidden lg:flex lg:flex-shrink-0">
        <div
          className={`flex flex-col bg-gradient-to-b from-blue-900 via-blue-800 to-blue-900 shadow-xl transition-all duration-300 ease-in-out ${
            sidebarCollapsed ? "w-16" : "w-64"
          }`}
        >
          {/* Logo/Header */}
          <div className="flex items-center justify-between h-16 px-4 bg-blue-800 border-b border-blue-700">
            <div className="flex items-center space-x-3 min-w-0">
              <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center flex-shrink-0">
                <span className="text-blue-800 text-lg font-bold">🚢</span>
              </div>
              {!sidebarCollapsed && (
                <h1 className="text-lg font-bold text-white transition-opacity duration-200 truncate">
                  Shipyard System
                </h1>
              )}
            </div>

            {/* Collapse Toggle Button - Inside sidebar */}
            <button
              onClick={toggleSidebar}
              className="flex-shrink-0 w-8 h-8 bg-blue-700 hover:bg-blue-600 rounded-lg flex items-center justify-center text-white text-sm transition-all duration-200 hover:scale-105"
              title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              <span className="transform transition-transform duration-200">
                {sidebarCollapsed ? "▶" : "◀"}
              </span>
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-3 py-6 space-y-1">
            {navigation.map((item) => (
              <div key={item.name} className="relative group">
                <button
                  onClick={() => navigate(item.href)}
                  className={`w-full text-left px-3 py-3 rounded-xl flex items-center transition-all duration-200 ${
                    sidebarCollapsed ? "justify-center" : "space-x-3"
                  } ${
                    item.current
                      ? "bg-white text-blue-800 shadow-lg transform scale-105"
                      : "text-blue-100 hover:bg-blue-700 hover:text-white hover:transform hover:scale-105"
                  }`}
                >
                  <span className="text-xl flex-shrink-0">{item.icon}</span>
                  {!sidebarCollapsed && (
                    <span className="font-medium transition-opacity duration-200 truncate">
                      {item.name}
                    </span>
                  )}
                </button>

                {/* Tooltip for collapsed state */}
                {sidebarCollapsed && (
                  <div className="absolute left-full ml-2 top-1/2 transform -translate-y-1/2 bg-gray-900 text-white px-2 py-1 rounded text-sm whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-50 pointer-events-none">
                    {item.name}
                    <div className="absolute left-0 top-1/2 transform -translate-y-1/2 -translate-x-1 w-2 h-2 bg-gray-900 rotate-45"></div>
                  </div>
                )}
              </div>
            ))}
          </nav>

          {/* User Info & Logout */}
          <div className="p-3 border-t border-blue-700 bg-blue-800">
            {!sidebarCollapsed ? (
              // Expanded user info
              <>
                <div className="flex items-center space-x-3 mb-4">
                  <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center ring-2 ring-blue-400 flex-shrink-0">
                    <span className="text-white text-sm font-bold">
                      {user?.email?.charAt(0).toUpperCase() || "U"}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">
                      {user?.email || "User"}
                    </p>
                    <p className="text-xs text-blue-200">Online</p>
                  </div>
                </div>
                <button
                  onClick={onLogout}
                  className="w-full bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors text-sm font-medium flex items-center justify-center space-x-2 shadow-md hover:shadow-lg"
                >
                  <span>🚪</span>
                  <span>Logout</span>
                </button>
              </>
            ) : (
              // Collapsed user info
              <div className="flex flex-col items-center space-y-3">
                <div className="relative group">
                  <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center ring-2 ring-blue-400 cursor-pointer">
                    <span className="text-white text-sm font-bold">
                      {user?.email?.charAt(0).toUpperCase() || "U"}
                    </span>
                  </div>
                  {/* User tooltip */}
                  <div className="absolute left-full ml-2 top-1/2 transform -translate-y-1/2 bg-gray-900 text-white px-2 py-1 rounded text-sm whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-50 pointer-events-none">
                    {user?.email || "User"} - Online
                    <div className="absolute left-0 top-1/2 transform -translate-y-1/2 -translate-x-1 w-2 h-2 bg-gray-900 rotate-45"></div>
                  </div>
                </div>

                <div className="relative group">
                  <button
                    onClick={onLogout}
                    className="w-10 h-10 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center justify-center shadow-md hover:shadow-lg"
                  >
                    <span>🚪</span>
                  </button>
                  {/* Logout tooltip */}
                  <div className="absolute left-full ml-2 top-1/2 transform -translate-y-1/2 bg-gray-900 text-white px-2 py-1 rounded text-sm whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-50 pointer-events-none">
                    Logout
                    <div className="absolute left-0 top-1/2 transform -translate-y-1/2 -translate-x-1 w-2 h-2 bg-gray-900 rotate-45"></div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile sidebar */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="fixed inset-0 bg-gray-600 bg-opacity-75"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="relative flex flex-col max-w-xs w-full bg-gradient-to-b from-blue-900 via-blue-800 to-blue-900 shadow-2xl">
            {/* Mobile sidebar header */}
            <div className="flex items-center justify-between h-16 px-6 bg-blue-800 border-b border-blue-700">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
                  <span className="text-blue-800 text-lg font-bold">🚢</span>
                </div>
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
            <nav className="flex-1 px-4 py-6 space-y-1">
              {navigation.map((item) => (
                <button
                  key={item.name}
                  onClick={() => {
                    navigate(item.href);
                    setSidebarOpen(false);
                  }}
                  className={`w-full text-left px-4 py-3 rounded-xl flex items-center space-x-3 transition-all duration-200 ${
                    item.current
                      ? "bg-white text-blue-800 shadow-lg"
                      : "text-blue-100 hover:bg-blue-700 hover:text-white"
                  }`}
                >
                  <span className="text-xl">{item.icon}</span>
                  <span className="font-medium">{item.name}</span>
                </button>
              ))}
            </nav>

            {/* Mobile user info */}
            <div className="p-4 border-t border-blue-700 bg-blue-800">
              <div className="flex items-center space-x-3 mb-4">
                <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center ring-2 ring-blue-400">
                  <span className="text-white text-sm font-bold">
                    {user?.email?.charAt(0).toUpperCase() || "U"}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">
                    {user?.email || "User"}
                  </p>
                  <p className="text-xs text-blue-200">Online</p>
                </div>
              </div>
              <button
                onClick={onLogout}
                className="w-full bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors text-sm font-medium flex items-center justify-center space-x-2 shadow-md hover:shadow-lg"
              >
                <span>🚪</span>
                <span>Logout</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile header */}
        <div className="lg:hidden bg-white border-b border-gray-200 px-4 py-3 shadow-sm">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setSidebarOpen(true)}
              className="text-gray-600 hover:text-gray-900 p-2 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <span className="text-xl">☰</span>
            </button>
            <div className="flex items-center space-x-2">
              <div className="w-6 h-6 bg-blue-600 rounded flex items-center justify-center">
                <span className="text-white text-sm">🚢</span>
              </div>
              <h1 className="text-lg font-medium text-gray-900">
                Shipyard System
              </h1>
            </div>
            <div className="w-10"></div> {/* Spacer for centering */}
          </div>
        </div>

        {/* Page content */}
        <main className="flex-1 overflow-auto bg-gray-50">{children}</main>
      </div>
    </div>
  );
}
