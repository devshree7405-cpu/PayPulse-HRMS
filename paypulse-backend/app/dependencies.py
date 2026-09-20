from dataclasses import dataclass

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Employee, User
from app.security import decode_access_token

# tokenUrl is just for the OpenAPI docs "Authorize" button; the real
# route is registered in routers/auth.py.
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")


@dataclass
class CurrentUser:
    """What every route gets after auth - the token's claims plus a live employee row."""

    user_id: int
    employee_id: int
    role: str
    employee: Employee


def get_current_user(
    token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)
) -> CurrentUser:
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = decode_access_token(token)
        user_id = int(payload.get("sub"))
        employee_id = payload.get("employee_id")
        role = payload.get("role")
        if employee_id is None or role is None:
            raise credentials_error
    except (JWTError, ValueError, TypeError):
        raise credentials_error

    # Re-check the user is still active on every request, not just at
    # login time - an HRAdmin deactivating someone should take effect
    # immediately, not just after their token expires.
    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise credentials_error

    employee = db.get(Employee, employee_id)
    if employee is None:
        raise credentials_error

    return CurrentUser(user_id=user.user_id, employee_id=employee_id, role=role, employee=employee)


def require_role(allowed_roles: list[str]):
    """
    Usage: Depends(require_role(["HRAdmin"])) or
    Depends(require_role(["HRAdmin", "Manager"])).
    """

    def _check(current_user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"This action requires one of these roles: {', '.join(allowed_roles)}",
            )
        return current_user

    return _check
