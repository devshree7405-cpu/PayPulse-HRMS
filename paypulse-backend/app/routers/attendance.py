from datetime import date, datetime
from decimal import ROUND_HALF_UP, Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import CurrentUser, get_current_user
from app.models import Attendance, Employee
from app.schemas.attendance import AttendanceOut

router = APIRouter(prefix="/attendance", tags=["Attendance"])


@router.post("/checkin", response_model=AttendanceOut, status_code=status.HTTP_201_CREATED)
def check_in(db: Session = Depends(get_db), current_user: CurrentUser = Depends(get_current_user)):
    today = date.today()
    existing = (
        db.query(Attendance)
        .filter(Attendance.employee_id == current_user.employee_id, Attendance.attendance_date == today)
        .first()
    )
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Already checked in today"
        )

    record = Attendance(
        employee_id=current_user.employee_id,
        attendance_date=today,
        check_in_time=datetime.now().time().replace(microsecond=0),
        status="Present",
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


@router.post("/checkout", response_model=AttendanceOut)
def check_out(db: Session = Depends(get_db), current_user: CurrentUser = Depends(get_current_user)):
    today = date.today()
    record = (
        db.query(Attendance)
        .filter(Attendance.employee_id == current_user.employee_id, Attendance.attendance_date == today)
        .first()
    )
    if record is None or record.check_in_time is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No active check-in today")
    if record.check_out_time is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Already checked out today")

    now = datetime.now().time().replace(microsecond=0)
    record.check_out_time = now

    checkin_dt = datetime.combine(today, record.check_in_time)
    checkout_dt = datetime.combine(today, now)
    hours = Decimal((checkout_dt - checkin_dt).total_seconds() / 3600).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )
    record.hours_worked = hours

    db.commit()
    db.refresh(record)
    return record


@router.get("/{employee_id}", response_model=list[AttendanceOut])
def get_attendance(
    employee_id: int,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    target = db.get(Employee, employee_id)
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")

    allowed = (
        current_user.role == "HRAdmin"
        or current_user.employee_id == employee_id
        or (current_user.role == "Manager" and target.manager_id == current_user.employee_id)
    )
    if not allowed:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")

    query = db.query(Attendance).filter(Attendance.employee_id == employee_id)
    if start_date:
        query = query.filter(Attendance.attendance_date >= start_date)
    if end_date:
        query = query.filter(Attendance.attendance_date <= end_date)
    return query.order_by(Attendance.attendance_date.desc()).all()
