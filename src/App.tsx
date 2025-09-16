import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import { AuthProvider, useAuth } from "./hooks/useAuth";

// Components
import Layout from "./components/common/Layout";
import { Login } from "./components/auth";
import { Dashboard } from "./components/dashboard";
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
import { AddWorkProgress, WorkProgressTable } from "./components/workProgress";
import { InvoiceList, AddInvoice, EditInvoice } from "./components/invoice";
import { ExportData } from "./components/exportData";

// Separate the app routes into its own component that uses the auth context
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
    <Layout onLogout={handleLogout}>
      <Routes>
        {/* Dashboard */}
        <Route path="/" element={<Dashboard />} />
        <Route path="/dashboard" element={<Dashboard />} />

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
        <Route path="/add-work-details" element={<AddWorkDetails />} />
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

        {/* Verification Routes */}
        <Route path="/work-verification" element={<WorkVerification />} />
        <Route
          path="/work-verification/verify/:workDetailsId"
          element={<VerifyWorkDetails />}
        />

        {/* Invoice Routes */}
        <Route path="/invoices" element={<InvoiceList />} />
        <Route path="/invoices/add" element={<AddInvoice />} />
        <Route path="/invoices/:id/edit" element={<EditInvoice />} />

        {/* Import/Export Routes */}
        <Route path="/export-data" element={<ExportData />} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Layout>
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
