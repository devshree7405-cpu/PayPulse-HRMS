import type { UserRole } from "../types/auth";

export function roleHomePath(role: UserRole): string {
  switch (role) {
    case "HRAdmin":
      return "/hr";
    case "Manager":
      return "/manager";
    case "Employee":
      return "/employee";
  }
}
