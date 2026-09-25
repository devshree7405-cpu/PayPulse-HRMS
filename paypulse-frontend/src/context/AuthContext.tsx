import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { api } from "../lib/api";
import type { AuthSession, LoginRequest, TokenResponse, UserRole } from "../types/auth";

const STORAGE_KEY = "pp_access_token";
const ROLE_KEY = "pp_role";
const EMPLOYEE_KEY = "pp_employee_id";

interface AuthContextValue {
  session: AuthSession | null;
  login: (payload: LoginRequest) => Promise<AuthSession>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function readStoredSession(): AuthSession | null {
  const accessToken = localStorage.getItem(STORAGE_KEY);
  const role = localStorage.getItem(ROLE_KEY) as UserRole | null;
  const employeeId = localStorage.getItem(EMPLOYEE_KEY);
  if (!accessToken || !role || !employeeId) return null;
  return { accessToken, role, employeeId: Number(employeeId) };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(() => readStoredSession());

  const login = async (payload: LoginRequest): Promise<AuthSession> => {
    const { data } = await api.post<TokenResponse>("/auth/login", payload);
    const nextSession: AuthSession = {
      accessToken: data.access_token,
      role: data.role,
      employeeId: data.employee_id,
    };
    localStorage.setItem(STORAGE_KEY, nextSession.accessToken);
    localStorage.setItem(ROLE_KEY, nextSession.role);
    localStorage.setItem(EMPLOYEE_KEY, String(nextSession.employeeId));
    setSession(nextSession);
    return nextSession;
  };

  const logout = () => {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(ROLE_KEY);
    localStorage.removeItem(EMPLOYEE_KEY);
    setSession(null);
  };

  const value = useMemo(() => ({ session, login, logout }), [session]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
