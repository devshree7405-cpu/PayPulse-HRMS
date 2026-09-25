import { LogOut } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useNavigate } from "react-router-dom";

interface DashboardShellProps {
  title: string;
  roleLabel: string;
}

export function DashboardShell({ title, roleLabel }: DashboardShellProps) {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 px-6 text-center">
      <span className="rounded-full bg-brand-50 px-4 py-1 text-sm font-medium text-brand-700">
        {roleLabel}
      </span>
      <h1 className="text-3xl font-semibold text-slate-900">{title}</h1>
      <p className="max-w-md text-slate-500">
        This dashboard is coming up next. Login is wired end-to-end with the backend.
      </p>
      <button
        onClick={handleLogout}
        className="mt-4 inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
      >
        <LogOut size={16} />
        Log out
      </button>
    </div>
  );
}
