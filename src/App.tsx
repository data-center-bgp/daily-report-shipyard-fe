import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import { AuthProvider, useAuth } from "./hooks/useAuth";
import { DashboardDataProvider } from "./hooks/useDashboardData";

import Layout from "./components/common/Layout";
import { Login } from "./components/auth";
import { Dashboard, Alerts } from "./components/dashboard";
import { ProjectsList, AddProject, ProjectDetails } from "./components/projects";
import { ReadinessForm, ReadinessQueue } from "./components/readiness";
import { AdditionalWoApprovals } from "./components/additionalWoApprovals";
import {
  WorkOrders,
  AddWorkOrder,
  VesselWorkOrders,
  EditWorkOrder,
} from "./components/workOrders";
import {
  WorkVerification,
  VerifyWorkDetails,
} from "./components/workVerification";
import { AddWorkDetails, EditWorkDetails } from "./components/workDetails";
import WorkOrderDetails from "./components/workDetails/WODetails";
import {
  AddWorkProgress,
  WorkProgressTable,
  EditWorkProgress,
} from "./components/workProgress";
import {
  InvoiceList,
  InvoiceDetails,
  ManageInvoice,
} from "./components/invoice";
import { ExportData } from "./components/exportData";
import { ImportData } from "./components/importData";
import BASTP from "./components/bastp/BASTP";
import CreateBASTP from "./components/bastp/CreateBASTP";
import BASTPDetails from "./components/bastp/BASTPDetails";
import BASTPMaterialsPage from "./components/bastp/BASTPMaterialsPage";
import ActivityLogPage from "./components/activityLog/ActivityLogPage";
import UserManagementPage from "./components/userManagement/UserManagementPage";
import MasterDataPage from "./components/masterData/MasterDataPage";

function AppRoutes() {
  const { user, loading, signOut } = useAuth();

  const handleLogout = async () => {
    await signOut();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" />} />
      </Routes>
    );
  }

  return (
    <DashboardDataProvider>
      <Layout onLogout={handleLogout}>
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
