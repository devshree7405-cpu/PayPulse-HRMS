export type UserRole = "HRAdmin" | "Manager" | "Employee";

export interface LoginRequest {
  email: string;
  password: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  role: UserRole;
  employee_id: number;
}

export interface AuthSession {
  accessToken: string;
  role: UserRole;
  employeeId: number;
}
