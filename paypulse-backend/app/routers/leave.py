from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import CurrentUser, get_current_user
from app.models import Employee, LeaveBalance, LeaveRequest, LeaveType
from app.schemas.leave import LeaveBalanceOut, LeaveRejectIn, LeaveRequestCreate, LeaveRequestOut

router = APIRouter(prefix="/leave", tags=["Leave"])


def _resolve_target_employee(
    requested_employee_id: Optional[int], current_user: CurrentUser, db: Session
) -> Employee:
    """
    Who is this leave request for? Defaults to the caller. An
    HRAdmin/Manager filing on someone else's behalf must name them
    explicitly, and a Manager can only do it for a direct report.
    """
    if requested_employee_id is None or requested_employee_id == current_user.employee_id:
        return current_user.employee  # self

    if current_user.role not in ("HRAdmin", "Manager"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="You can only file leave for yourself"
        )
    target = db.get(Employee, requested_employee_id)
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")
    if current_user.role == "Manager" and target.manager_id != current_user.employee_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="You can only file leave for a direct report"
        )
    return target


def _assert_can_act_on(employee: Employee, current_user: CurrentUser):
    """Same routing rule everywhere: the employee's manager, or HRAdmin if there is none."""
    is_their_manager = employee.manager_id is not None and employee.manager_id == current_user.employee_id
    is_hradmin_covering_top = employee.manager_id is None and current_user.role == "HRAdmin"
    if not (is_their_manager or is_hradmin_covering_top):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to act on this request"
        )


@router.post("/request", response_model=LeaveRequestOut, status_code=status.HTTP_201_CREATED)
def request_leave(
    payload: LeaveRequestCreate,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    employee = _resolve_target_employee(payload.employee_id, current_user, db)

    leave_type = db.get(LeaveType, payload.leave_type_id)
    if leave_type is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Leave type not found")

    is_sick_leave = leave_type.leave_type_name.strip().lower() == "sick"
    if payload.start_date < date.today() and not is_sick_leave:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Back-dated leave requests are only allowed for Sick leave",
        )

    overlap = (
        db.query(LeaveRequest)
        .filter(
            LeaveRequest.employee_id == employee.employee_id,
            LeaveRequest.status.in_(["Pending", "Approved"]),
            LeaveRequest.start_date <= payload.end_date,
            LeaveRequest.end_date >= payload.start_date,
        )
        .first()
    )
    if overlap is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This overlaps an existing pending or approved leave request",
        )

    no_of_days = Decimal((payload.end_date - payload.start_date).days + 1)

    leave_request = LeaveRequest(
        employee_id=employee.employee_id,
        leave_type_id=payload.leave_type_id,
        start_date=payload.start_date,
        end_date=payload.end_date,
        no_of_days=no_of_days,
        reason=payload.reason,
        status="Pending",
    )
    db.add(leave_request)
    db.commit()
    db.refresh(leave_request)
    return leave_request


@router.post("/{leave_request_id}/approve", response_model=LeaveRequestOut)
def approve_leave(
    leave_request_id: int,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    leave_request = db.get(LeaveRequest, leave_request_id)
    if leave_request is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Leave request not found")
    if leave_request.status != "Pending":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=f"This request is already {leave_request.status}"
        )

    employee = db.get(Employee, leave_request.employee_id)
    _assert_can_act_on(employee, current_user)

    year = leave_request.start_date.year
    balance = (
        db.query(LeaveBalance)
        .filter(
            LeaveBalance.employee_id == leave_request.employee_id,
            LeaveBalance.leave_type_id == leave_request.leave_type_id,
            LeaveBalance.year == year,
        )
        .with_for_update()
        .first()
    )
    if balance is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"No leave balance on file for this employee/type/{year}",
        )
    if balance.remaining < leave_request.no_of_days:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Insufficient leave balance")

    balance.used += leave_request.no_of_days
    balance.remaining -= leave_request.no_of_days

    leave_request.status = "Approved"
    leave_request.approved_by = current_user.employee_id
    leave_request.approved_on = datetime.now()

    db.commit()
    db.refresh(leave_request)
    return leave_request


@router.post("/{leave_request_id}/reject", response_model=LeaveRequestOut)
def reject_leave(
    leave_request_id: int,
    payload: LeaveRejectIn,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    leave_request = db.get(LeaveRequest, leave_request_id)
    if leave_request is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Leave request not found")
    if leave_request.status != "Pending":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=f"This request is already {leave_request.status}"
        )

    employee = db.get(Employee, leave_request.employee_id)
    _assert_can_act_on(employee, current_user)

    leave_request.status = "Rejected"
    leave_request.manager_comments = payload.manager_comments
    leave_request.approved_by = current_user.employee_id
    leave_request.approved_on = datetime.now()

    db.commit()
    db.refresh(leave_request)
    return leave_request


@router.get("/balance/{employee_id}", response_model=list[LeaveBalanceOut])
def get_leave_balance(
    employee_id: int,
    year: Optional[int] = None,
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

    query = db.query(LeaveBalance).filter(LeaveBalance.employee_id == employee_id)
    if year:
        query = query.filter(LeaveBalance.year == year)
    return query.all()
