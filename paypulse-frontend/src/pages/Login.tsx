import { useState, type FormEvent } from "react";
import { Eye, EyeOff, Lock, Mail } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { extractErrorMessage } from "../lib/api";
import { roleHomePath } from "../routes/roleHome";

const REMEMBER_EMAIL_KEY = "pp_remembered_email";

export default function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [email, setEmail] = useState(() => localStorage.getItem(REMEMBER_EMAIL_KEY) ?? "");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(() => Boolean(localStorage.getItem(REMEMBER_EMAIL_KEY)));
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const session = await login({ email, password });

      if (rememberMe) {
        localStorage.setItem(REMEMBER_EMAIL_KEY, email);
      } else {
        localStorage.removeItem(REMEMBER_EMAIL_KEY);
      }

      navigate(roleHomePath(session.role), { replace: true });
    } catch (err) {
      setError(extractErrorMessage(err, "Something went wrong. Please try again."));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-[#eef0fb]">
      {/* Left brand panel */}
      <div className="relative hidden w-1/2 overflow-hidden bg-gradient-to-br from-brand-500 via-brand-600 to-indigo-800 lg:flex lg:flex-col lg:justify-between">
        <div
          className="absolute left-8 top-8 h-28 w-28 opacity-40"
          style={{
            backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.6) 1.5px, transparent 1.5px)",
            backgroundSize: "14px 14px",
          }}
        />
        <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/10" />
        <div className="pointer-events-none absolute bottom-24 right-10 h-72 w-72 rounded-full border border-white/20" />
        <div className="pointer-events-none absolute -bottom-10 left-10 h-6 w-6 rounded-full bg-emerald-300" />

        <div className="relative z-10 mt-40 px-16">
          <h1 className="max-w-sm text-5xl font-bold leading-tight text-white">
            Manage your workforce with ease
          </h1>
          <p className="mt-6 max-w-sm text-indigo-100">
            Sign in to access attendance, payroll and performance — all in one place.
          </p>
        </div>

        <div className="relative z-10 mb-10 ml-10 w-fit">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/95 px-5 py-2.5 text-sm font-semibold text-brand-700 shadow-lg">
            <span aria-hidden>↗</span> PayPulse HRMS
          </span>
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex w-full flex-1 items-center justify-center px-6 py-12 lg:w-1/2">
        <div className="w-full max-w-md rounded-2xl bg-white p-10 shadow-xl">
          <div className="flex flex-col items-center text-center">
            <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-2xl font-bold text-white shadow-md">
              P
            </div>
            <h2 className="text-2xl font-bold text-slate-900">Hello! Welcome back</h2>
            <p className="mt-1 text-sm text-slate-500">Sign in to your PayPulse account</p>
          </div>

          <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-slate-700">
                Email
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@paypulse.com"
                  className="w-full rounded-lg border border-slate-200 py-2.5 pl-10 pr-3 text-sm text-slate-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-slate-700">
                Password
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••"
                  className="w-full rounded-lg border border-slate-200 py-2.5 pl-10 pr-10 text-sm text-slate-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between text-sm">
              <label className="flex items-center gap-2 text-slate-600">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                />
                Remember me
              </label>
              <button
                type="button"
                onClick={() => navigate("/forgot-password")}
                className="font-medium text-brand-600 hover:text-brand-700"
              >
                Reset Password?
              </button>
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600" role="alert">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-lg bg-gradient-to-r from-brand-500 to-brand-700 py-2.5 text-sm font-semibold text-white shadow-md transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? "Signing in..." : "Login"}
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-slate-400">
            Don&apos;t have an account? Contact your HR admin for access.
          </p>
        </div>
      </div>
    </div>
  );
}
