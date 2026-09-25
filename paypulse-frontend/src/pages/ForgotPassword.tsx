import { useNavigate } from "react-router-dom";

export default function ForgotPassword() {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#eef0fb] px-6 text-center">
      <div className="w-full max-w-md rounded-2xl bg-white p-10 shadow-xl">
        <h2 className="text-2xl font-bold text-slate-900">Reset Password</h2>
        <p className="mt-2 text-sm text-slate-500">
          Password reset isn&apos;t available yet. Please contact your HR admin to reset your
          credentials.
        </p>
        <button
          onClick={() => navigate("/login")}
          className="mt-6 w-full rounded-lg bg-gradient-to-r from-brand-500 to-brand-700 py-2.5 text-sm font-semibold text-white shadow-md transition hover:opacity-95"
        >
          Back to Login
        </button>
      </div>
    </div>
  );
}
