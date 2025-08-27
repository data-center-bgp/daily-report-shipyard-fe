import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "./lib/supabase";
import type { User } from "@supabase/supabase-js";

// Components
import Layout from "./components/common/Layout";
import { Login, Register } from "./components/auth";
import { Dashboard } from "./components/dashboard";
import {
  WorkOrders,
  AddWorkOrder,
  VesselWorkOrders,
} from "./components/workOrders";
import {
  ProgressOverview,
  ProgressTracker,
  ProgressDetails,
} from "./components/progress";
import {
  OperationVerification,
  VerifyOperation,
} from "./components/verification";
import { AddWorkDetails } from "./components/workDetails";
import WorkOrderDetails from "./components/workDetails/WODetails";

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="*" element={<Navigate to="/login" />} />
        </Routes>
      </Router>
    );
  }

  return (
    <Router>
      <Layout user={user}>
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

          {/* Work Details */}
          <Route path="/work-details" element={<WorkOrderDetails />} />
          <Route path="/add-work-details" element={<AddWorkDetails />} />

          {/* Progress Routes */}
          <Route path="/progress" element={<ProgressOverview />} />
          <Route path="/progress/tracker" element={<ProgressTracker />} />
          <Route
            path="/progress/details/:workOrderId"
            element={<ProgressDetails />}
          />

          {/* Verification Routes */}
          <Route
            path="/operation-verification"
            element={<OperationVerification />}
          />
          <Route
            path="/operation-verification/verify/:workOrderId"
            element={<VerifyOperation />}
          />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </Layout>
    </Router>
  );
}

export default App;
