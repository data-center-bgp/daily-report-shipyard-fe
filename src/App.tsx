import { lazy, Suspense } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";
import { AuthProvider, useAuth } from "./hooks/useAuth";
import { RoleGuard } from "./components/auth/RoleGuard";
import { DashboardDataProvider } from "./hooks/useDashboardData";

import Layout from "./components/common/Layout";
import LoadingState from "./components/common/LoadingState";

// Every route below is its own chunk — none of this is needed until the
// user actually navigates there, so keeping it out of the main bundle
// keeps first load (e.g. the login page) fast regardless of how large the
// app grows.
const Login = lazy(() => import("./components/auth/Login"));

const Dashboard = lazy(() => import("./components/dashboard/Dashboard"));
const Alerts = lazy(() => import("./components/dashboard/Alerts"));

const ProjectsList = lazy(() => import("./components/projects/ProjectsList"));
const AddProject = lazy(() => import("./components/projects/AddProject"));
const ProjectDetails = lazy(
  () => import("./components/projects/ProjectDetails"),
);

const ReadinessForm = lazy(
  () => import("./components/readiness/ReadinessForm"),
);
const ReadinessQueue = lazy(
  () => import("./components/readiness/ReadinessQueue"),
);

const AdditionalWoApprovals = lazy(
  () => import("./components/additionalWoApprovals/AdditionalWoApprovals"),
);

const WorkOrders = lazy(() => import("./components/workOrders/WorkOrders"));
const AddWorkOrder = lazy(
  () => import("./components/workOrders/AddWorkOrder"),
);
const VesselWorkOrders = lazy(
  () => import("./components/workOrders/VesselWorkOrders"),
);
const EditWorkOrder = lazy(
  () => import("./components/workOrders/EditWorkOrder"),
);

const WorkOrderDetails = lazy(
  () => import("./components/workDetails/WODetails"),
);
const AddWorkDetails = lazy(
  () => import("./components/workDetails/AddWorkDetails"),
);
const EditWorkDetails = lazy(
  () => import("./components/workDetails/EditWorkDetails"),
);

const AddWorkProgress = lazy(
  () => import("./components/workProgress/AddWorkProgress"),
);
const WorkProgressTable = lazy(
  () => import("./components/workProgress/WorkProgressTable"),
);
const EditWorkProgress = lazy(
  () => import("./components/workProgress/EditWorkProgress"),
);

const WorkVerification = lazy(
  () => import("./components/workVerification/WorkVerification"),
);
const VerifyWorkDetails = lazy(
  () => import("./components/workVerification/VerifyWorkDetails"),
);

const InvoiceList = lazy(() => import("./components/invoice/InvoiceList"));
const InvoiceDetails = lazy(
  () => import("./components/invoice/InvoiceDetails"),
);
const ManageInvoice = lazy(
  () => import("./components/invoice/ManageInvoice"),
);

const ExportData = lazy(() => import("./components/exportData/ExportData"));
const ImportData = lazy(() => import("./components/importData/ImportData"));

const BASTP = lazy(() => import("./components/bastp/BASTP"));
const CreateBASTP = lazy(() => import("./components/bastp/CreateBASTP"));
const BASTPDetails = lazy(() => import("./components/bastp/BASTPDetails"));
const BASTPMaterialsPage = lazy(
  () => import("./components/bastp/BASTPMaterialsPage"),
);

const ActivityLogPage = lazy(
  () => import("./components/activityLog/ActivityLogPage"),
);
const UserManagementPage = lazy(
  () => import("./components/userManagement/UserManagementPage"),
);
const MasterDataPage = lazy(
  () => import("./components/masterData/MasterDataPage"),
);
const ApiDocs = lazy(() => import("./components/developer/ApiDocs"));
const NotFound = lazy(() => import("./components/common/NotFound"));

// A link opened while logged out (a shared invoice, a BASTP) goes to the
// login page carrying the address it asked for...
function RedirectToLogin() {
  const location = useLocation();
  return (
    <Navigate
      to="/login"
      replace
      state={{ from: location.pathname + location.search }}
    />
  );
}

// ...and once logged in, the still-open /login address sends the user on to
// that page instead of always to the Dashboard.
function AfterLoginRedirect() {
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  return (
    <Navigate to={from && from !== "/login" ? from : "/"} replace />
  );
}

// Pages the sidebar hides from a role must also refuse that role when the
// address is typed in. Waits for the profile (it arrives a moment after the
// user right after logging in) so a permitted user is never bounced home.
function RequireAccess({
  feature,
  allowExternalVerifier = false,
  children,
}: {
  feature: string;
  allowExternalVerifier?: boolean;
  children: React.ReactNode;
}) {
  const { profile, canAccess, canVerifyExternalVesselWork } = useAuth();
  if (!profile) return <LoadingState />;
  const allowed =
    canAccess(feature) || (allowExternalVerifier && canVerifyExternalVesselWork);
  return allowed ? <>{children}</> : <Navigate to="/" replace />;
}

function AppRoutes() {
  const { user, loading, signOut } = useAuth();

  const handleLogout = async () => {
    await signOut();
  };

  if (loading) {
    return <LoadingState variant="fullScreen" />;
  }

  if (!user) {
    return (
      <Suspense fallback={<LoadingState variant="fullScreen" />}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="*" element={<RedirectToLogin />} />
        </Routes>
      </Suspense>
    );
  }

  return (
    <DashboardDataProvider>
      <Layout onLogout={handleLogout}>
        <Suspense fallback={<LoadingState />}>
          <Routes>
          {/* Just logged in: continue to the page the user originally asked for */}
          <Route path="/login" element={<AfterLoginRedirect />} />

          {/* Dashboard */}
          <Route path="/" element={<Dashboard />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/alerts" element={<Alerts />} />

          {/* Projects */}
          <Route path="/projects" element={<ProjectsList />} />
          <Route path="/projects/add" element={<AddProject />} />
          <Route path="/projects/:projectId" element={<ProjectDetails />} />
          <Route
            path="/projects/:projectId/readiness"
            element={<ReadinessForm />}
          />
          <Route path="/readiness-queue" element={<ReadinessQueue />} />
          <Route
            path="/additional-wo-approvals"
            element={<AdditionalWoApprovals />}
          />

          {/* Work Orders */}
          <Route path="/work-orders" element={<WorkOrders />} />
          <Route path="/add-work-order" element={<AddWorkOrder />} />
          <Route
            path="/vessel/:vesselId/work-orders"
            element={<VesselWorkOrders />}
          />
          <Route
            path="/edit-work-order/:workOrderId"
            element={<EditWorkOrder />}
          />

          {/* Work Details */}
          <Route path="/work-details" element={<WorkOrderDetails />} />
          <Route path="/work-details/add" element={<AddWorkDetails />} />
          <Route
            path="/work-details/add/:workOrderId"
            element={<AddWorkDetails />}
          />
          <Route
            path="/work-order/:workOrderId/add-work-details"
            element={<AddWorkDetails />}
          />
          <Route
            path="/edit-work-details/:workDetailsId"
            element={<EditWorkDetails />}
          />

          {/* Work Progress Routes */}
          <Route path="/work-progress" element={<WorkProgressTable />} />
          <Route path="/add-work-progress" element={<AddWorkProgress />} />
          <Route
            path="/add-work-progress/:workDetailsId"
            element={<AddWorkProgress />}
          />
          <Route
            path="/work-details/:workDetailsId/progress"
            element={<WorkProgressTable />}
          />
          <Route
            path="/work-progress/edit/:progressId"
            element={<EditWorkProgress />}
          />

          {/* Verification Routes */}
          <Route
            path="/work-verification"
            element={
              <RequireAccess feature="verification" allowExternalVerifier>
                <WorkVerification />
              </RequireAccess>
            }
          />
          <Route
            path="/work-verification/verify/:workDetailsId"
            element={
              <RequireAccess feature="verification" allowExternalVerifier>
                <VerifyWorkDetails />
              </RequireAccess>
            }
          />

          {/* BASTP Routes */}
          <Route
            path="/bastp"
            element={
              <RequireAccess feature="bastp">
                <BASTP />
              </RequireAccess>
            }
          />
          <Route
            path="/bastp/create"
            element={
              <RequireAccess feature="bastp">
                <CreateBASTP />
              </RequireAccess>
            }
          />
          <Route
            path="/bastp/edit/:bastpId"
            element={
              <RequireAccess feature="bastp">
                <CreateBASTP />
              </RequireAccess>
            }
          />
          <Route
            path="/bastp/:bastpId"
            element={
              <RequireAccess feature="bastp">
                <BASTPDetails />
              </RequireAccess>
            }
          />
          <Route
            path="/bastp/:bastpId/materials"
            element={
              <RequireAccess feature="bastp">
                <BASTPMaterialsPage />
              </RequireAccess>
            }
          />

          {/* Invoice Routes */}
          <Route
            path="/invoices"
            element={
              <RequireAccess feature="invoices">
                <InvoiceList />
              </RequireAccess>
            }
          />
          <Route
            path="/invoices/create/:bastpId"
            element={
              <RequireAccess feature="invoices">
                <ManageInvoice />
              </RequireAccess>
            }
          />
          <Route
            path="/invoices/edit/:invoiceId"
            element={
              <RequireAccess feature="invoices">
                <ManageInvoice />
              </RequireAccess>
            }
          />
          <Route
            path="/invoices/:invoiceId"
            element={
              <RequireAccess feature="invoices">
                <InvoiceDetails />
              </RequireAccess>
            }
          />

          {/* Activity Log Routes */}
          <Route path="/activity-logs" element={<ActivityLogPage />} />

          {/* User Management Routes */}
          <Route path="/user-management" element={<UserManagementPage />} />

          {/* Master Data Routes */}
          <Route path="/master-data" element={<MasterDataPage />} />

          {/* Developer — MASTER only. Anyone else who types the address is
              sent home, and the page code is never even loaded for them. */}
          <Route
            path="/developer/api"
            element={
              <RoleGuard feature="developer" fallback={<Navigate to="/" replace />}>
                <ApiDocs />
              </RoleGuard>
            }
          />

          {/* Import/Export Routes */}
          <Route path="/export-data" element={<ExportData />} />
          <Route path="/import-data" element={<ImportData />} />

          {/* Fallback: say so, instead of quietly opening the Dashboard */}
          <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </Layout>
    </DashboardDataProvider>
  );
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <AppRoutes />
      </Router>
    </AuthProvider>
  );
}

export default App;
