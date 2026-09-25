from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User
from app.schemas.auth import LoginRequest, TokenResponse
from app.security import create_access_token, verify_password

router = APIRouter(prefix="/auth", tags=["Auth"])


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email).first()

    # Same error for "no such user" and "wrong password" - never let a
    # login form confirm which emails exist in the system.
    invalid = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect email or password"
    )
    if user is None or not verify_password(payload.password, user.password_hash):
        raise invalid
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="This account has been deactivated"
        )

    user.last_login_at = datetime.now()
    db.commit()

    token = create_access_token(
        employee_id=user.employee_id, role=user.role, user_id=user.user_id
    )
    return TokenResponse(access_token=token, role=user.role, employee_id=user.employee_id)
