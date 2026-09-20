import calendar
from datetime import date
from decimal import ROUND_HALF_UP, Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.dependencies import CurrentUser, get_current_user, require_role
from app.models import (
    Employee,
    EmployeeSalaryStructure,
    LeaveRequest,
    LeaveType,
    Payslip,
    PayslipDetail,
    SalaryComponent,
    Attendance,
)
from app.schemas.payroll import PayslipOut, SalaryStructureIn, SalaryStructureOut

router = APIRouter(prefix="/payroll", tags=["Payroll"])


@router.post(
    "/salary-structure/{employee_id}",
    response_model=list[SalaryStructureOut],
    status_code=status.HTTP_201_CREATED,
)
def set_salary_structure(
    employee_id: int,
    payload: SalaryStructureIn,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(["HRAdmin"])),
):
    if db.get(Employee, employee_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")

    rows = []
    for line in payload.lines:
        if db.get(SalaryComponent, line.component_id) is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Salary component {line.component_id} not found",
            )
        row = EmployeeSalaryStructure(employee_id=employee_id, **line.model_dump())
        db.add(row)
        rows.append(row)

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="One of these components already has a row effective on that exact date for this employee",
        )
    for row in rows:
        db.refresh(row)
    return rows


def _active_structure_rows(db: Session, employee_id: int, period_end: date) -> list[EmployeeSalaryStructure]:
    """
    The salary structure as of a given date: for each component, the
    row with the latest effective_from that is still <= period_end.
    Mirrors the same "don't overwrite history, just add a new dated
    row" pattern as salary_history.
    """
    latest_dates = (
        db.query(
            EmployeeSalaryStructure.component_id,
            func.max(EmployeeSalaryStructure.effective_from).label("latest"),
        )
        .filter(
            EmployeeSalaryStructure.employee_id == employee_id,
            EmployeeSalaryStructure.effective_from <= period_end,
        )
        .group_by(EmployeeSalaryStructure.component_id)
        .subquery()
    )
    return (
        db.query(EmployeeSalaryStructure)
        .join(
            latest_dates,
            (EmployeeSalaryStructure.component_id == latest_dates.c.component_id)
            & (EmployeeSalaryStructure.effective_from == latest_dates.c.latest),
        )
        .filter(EmployeeSalaryStructure.employee_id == employee_id)
        .options(joinedload(EmployeeSalaryStructure.component))
        .all()
    )


@router.post("/generate/{employee_id}", response_model=PayslipOut, status_code=status.HTTP_201_CREATED)
def generate_payslip(
    employee_id: int,
    month: int,
    year: int,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(["HRAdmin"])),
):
    if not 1 <= month <= 12:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="month must be 1-12")

    employee = db.get(Employee, employee_id)
    if employee is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")

    existing = (
        db.query(Payslip)
        .filter(Payslip.employee_id == employee_id, Payslip.payslip_month == month, Payslip.payslip_year == year)
        .first()
    )
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"A payslip for {month}/{year} already exists for this employee",
        )

    total_days_in_month = calendar.monthrange(year, month)[1]
    period_start = date(year, month, 1)
    period_end = date(year, month, total_days_in_month)

    # ---- 1. Pull active salary components as of this month/year ----
    structure_rows = _active_structure_rows(db, employee_id, period_end)
    gross_pay = sum((r.amount for r in structure_rows if r.component.component_type == "Earning"), Decimal("0"))
    deduction_total = sum(
        (r.amount for r in structure_rows if r.component.component_type == "Deduction"), Decimal("0")
    )

    # ---- 2. LOP: Daily Rate = Base Salary / Total Days in Month ----
    daily_rate = (employee.base_salary / total_days_in_month).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    unexcused_absences = (
        db.query(func.count(Attendance.attendance_id))
        .filter(
            Attendance.employee_id == employee_id,
            Attendance.status == "Absent",
            Attendance.attendance_date >= period_start,
            Attendance.attendance_date <= period_end,
        )
        .scalar()
        or 0
    )

    # Unpaid leave days: approved requests on an unpaid leave_type,
    # clamped to the days that actually fall inside this month (a
    # request spanning month-end only counts the days on this side).
    unpaid_requests = (
        db.query(LeaveRequest)
        .join(LeaveType, LeaveRequest.leave_type_id == LeaveType.leave_type_id)
        .filter(
            LeaveRequest.employee_id == employee_id,
            LeaveRequest.status == "Approved",
            LeaveType.is_paid.is_(False),
            LeaveRequest.start_date <= period_end,
            LeaveRequest.end_date >= period_start,
        )
        .all()
    )
    unpaid_leave_days = Decimal("0")
    for req in unpaid_requests:
        overlap_start = max(req.start_date, period_start)
        overlap_end = min(req.end_date, period_end)
        unpaid_leave_days += Decimal((overlap_end - overlap_start).days + 1)

    lop_units = Decimal(unexcused_absences) + unpaid_leave_days
    lop_amount = (daily_rate * lop_units).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    # ---- 3. Net pay ----
    net_pay = gross_pay - deduction_total - lop_amount
    total_deductions = deduction_total + lop_amount

    payslip = Payslip(
        employee_id=employee_id,
        payslip_month=month,
        payslip_year=year,
        gross_pay=gross_pay,
        total_deductions=total_deductions,
        lop_days=lop_units,
        lop_amount=lop_amount,
        net_pay=net_pay,
        status="Finalized",
    )
    db.add(payslip)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"A payslip for {month}/{year} already exists for this employee",
        )

    for row in structure_rows:
        db.add(
            PayslipDetail(
                payslip_id=payslip.payslip_id,
                component_id=row.component_id,
                component_type=row.component.component_type,
                amount=row.amount,
            )
        )

    db.commit()
    return (
        db.query(Payslip)
        .options(joinedload(Payslip.details))
        .filter(Payslip.payslip_id == payslip.payslip_id)
        .first()
    )


@router.get("/payslip/{employee_id}", response_model=list[PayslipOut])
def get_payslips(
    employee_id: int, db: Session = Depends(get_db), current_user: CurrentUser = Depends(get_current_user)
):
    if current_user.role == "Manager":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Managers cannot access payroll")
    if current_user.role == "Employee" and current_user.employee_id != employee_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
    if current_user.role == "HRAdmin" and db.get(Employee, employee_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")

    return (
        db.query(Payslip)
        .options(joinedload(Payslip.details))
        .filter(Payslip.employee_id == employee_id)
        .order_by(Payslip.payslip_year.desc(), Payslip.payslip_month.desc())
        .all()
    )
