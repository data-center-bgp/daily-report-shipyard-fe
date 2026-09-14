import { lazy, Suspense } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import { AuthProvider, useAuth } from "./hooks/useAuth";
import { DashboardDataProvider } from "./hooks/useDashboardData";

import Layout from "./components/common/Layout";

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

function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
    </div>
  );
}

function AppRoutes() {
  const { user, loading, signOut } = useAuth();

  const handleLogout = async () => {
    await signOut();
  };

  if (loading) {
    return <PageLoader />;
  }

  if (!user) {
    return (
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="*" element={<Navigate to="/login" />} />
        </Routes>
      </Suspense>
    );
  }

  return (
    <DashboardDataProvider>
      <Layout onLogout={handleLogout}>
        <Suspense fallback={<PageLoader />}>
          <Routes>
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
          <Route path="/work-verification" element={<WorkVerification />} />
          <Route
            path="/work-verification/verify/:workDetailsId"
            element={<VerifyWorkDetails />}
          />

          {/* BASTP Routes */}
          <Route path="/bastp" element={<BASTP />} />
          <Route path="/bastp/create" element={<CreateBASTP />} />
          <Route path="/bastp/edit/:bastpId" element={<CreateBASTP />} />
          <Route path="/bastp/:bastpId" element={<BASTPDetails />} />
          <Route
            path="/bastp/:bastpId/materials"
            element={<BASTPMaterialsPage />}
          />

          {/* Invoice Routes */}
          <Route path="/invoices" element={<InvoiceList />} />
          <Route path="/invoices/create/:bastpId" element={<ManageInvoice />} />
          <Route path="/invoices/edit/:invoiceId" element={<ManageInvoice />} />
          <Route path="/invoices/:invoiceId" element={<InvoiceDetails />} />

          {/* Activity Log Routes */}
          <Route path="/activity-logs" element={<ActivityLogPage />} />

          {/* User Management Routes */}
          <Route path="/user-management" element={<UserManagementPage />} />

          {/* Master Data Routes */}
          <Route path="/master-data" element={<MasterDataPage />} />

          {/* Import/Export Routes */}
          <Route path="/export-data" element={<ExportData />} />
          <Route path="/import-data" element={<ImportData />} />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" />} />
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
