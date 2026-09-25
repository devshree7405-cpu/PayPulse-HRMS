import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { ProtectedRoute } from "./routes/ProtectedRoute";
import Login from "./pages/Login";
import ForgotPassword from "./pages/ForgotPassword";
import RoleRedirect from "./pages/RoleRedirect";
import HRAdminDashboard from "./pages/dashboards/HRAdminDashboard";
import ManagerDashboard from "./pages/dashboards/ManagerDashboard";
import EmployeeDashboard from "./pages/dashboards/EmployeeDashboard";

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<RoleRedirect />} />
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route
            path="/hr"
            element={
              <ProtectedRoute allowedRoles={["HRAdmin"]}>
                <HRAdminDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/manager"
            element={
              <ProtectedRoute allowedRoles={["Manager"]}>
                <ManagerDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/employee"
            element={
              <ProtectedRoute allowedRoles={["Employee"]}>
                <EmployeeDashboard />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<RoleRedirect />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
