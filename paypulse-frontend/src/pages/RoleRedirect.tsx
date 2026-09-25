import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { roleHomePath } from "../routes/roleHome";

export default function RoleRedirect() {
  const { session } = useAuth();
  return <Navigate to={session ? roleHomePath(session.role) : "/login"} replace />;
}
