"""Seed repeat-safe employee dashboard data for local development.

The script only inserts records that do not already exist. It is safe to run
again after using the application: attendance, leave, and payslip changes made
through the UI remain intact.
"""

from datetime import date, datetime, time, timedelta
from decimal import Decimal
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.database import SessionLocal
from app.models import Attendance, LeaveBalance, LeaveRequest, LeaveType, Payslip, PayslipDetail, SalaryComponent, User


def previous_month(today: date) -> tuple[int, int]:
    return (today.year - 1, 12) if today.month == 1 else (today.year, today.month - 1)


def get_component(db, name: str, component_type: str) -> SalaryComponent:
    component = db.query(SalaryComponent).filter(SalaryComponent.component_name == name).first()
    if component is None:
        component = SalaryComponent(component_name=name, component_type=component_type)
        db.add(component)
        db.flush()
    return component


def seed_attendance(db, employee_id: int, today: date) -> None:
    """Add completed weekday attendance up to yesterday for chart/table data."""
    for offset in range(35, 0, -1):
        attendance_date = today - timedelta(days=offset)
        if attendance_date.weekday() >= 5:
            continue
        exists = (
            db.query(Attendance)
            .filter(Attendance.employee_id == employee_id, Attendance.attendance_date == attendance_date)
            .first()
        )
        if exists:
            continue

        day_index = attendance_date.day % 4
        check_in = time(9, 5 + (day_index * 5))
        check_out = time(17, 45 + (day_index * 3))
        status = "Work From Home" if attendance_date.weekday() == 2 and attendance_date.day % 2 == 0 else "Present"
        db.add(
            Attendance(
                employee_id=employee_id,
                attendance_date=attendance_date,
                check_in_time=check_in,
                check_out_time=check_out,
                status=status,
                hours_worked=Decimal("8.50"),
            )
        )


def seed_leave(db, employee_id: int, manager_id: int | None, today: date) -> None:
    casual = db.query(LeaveType).filter(LeaveType.leave_type_name == "Casual").first()
    if casual is None:
        casual = LeaveType(leave_type_name="Casual", max_days_per_year=12, carry_forward_allowed=False, is_paid=True)
        db.add(casual)
        db.flush()

    marker = "Demo sample leave"
    exists = (
        db.query(LeaveRequest)
        .filter(LeaveRequest.employee_id == employee_id, LeaveRequest.reason == marker)
        .first()
    )
    if exists:
        return

    start_date = today - timedelta(days=19)
    while start_date.weekday() >= 5:
        start_date -= timedelta(days=1)
    end_date = start_date + timedelta(days=1)
    db.add(
        LeaveRequest(
            employee_id=employee_id,
            leave_type_id=casual.leave_type_id,
            start_date=start_date,
            end_date=end_date,
            no_of_days=Decimal("2"),
            reason=marker,
            status="Approved",
            approved_by=manager_id,
            approved_on=datetime.combine(end_date, time(18, 0)),
        )
    )

    balance = (
        db.query(LeaveBalance)
        .filter(
            LeaveBalance.employee_id == employee_id,
            LeaveBalance.leave_type_id == casual.leave_type_id,
            LeaveBalance.year == today.year,
        )
        .first()
    )
    if balance is None:
        db.add(
            LeaveBalance(
                employee_id=employee_id,
                leave_type_id=casual.leave_type_id,
                year=today.year,
                allocated=Decimal("12"),
                used=Decimal("2"),
                remaining=Decimal("10"),
            )
        )
    else:
        balance.used += Decimal("2")
        balance.remaining -= Decimal("2")


def seed_payslip(db, employee_id: int, today: date) -> None:
    year, month = previous_month(today)
    exists = (
        db.query(Payslip)
        .filter(Payslip.employee_id == employee_id, Payslip.payslip_year == year, Payslip.payslip_month == month)
        .first()
    )
    if exists:
        return

    basic = get_component(db, "Basic salary", "Earning")
    hra = get_component(db, "House rent allowance", "Earning")
    conveyance = get_component(db, "Conveyance allowance", "Earning")
    provident_fund = get_component(db, "Provident fund", "Deduction")

    earnings = [(basic, Decimal("45000")), (hra, Decimal("24000")), (conveyance, Decimal("1500"))]
    deductions = [(provident_fund, Decimal("3000"))]
    gross_pay = sum((amount for _, amount in earnings), Decimal("0"))
    total_deductions = sum((amount for _, amount in deductions), Decimal("0"))

    payslip = Payslip(
        employee_id=employee_id,
        payslip_month=month,
        payslip_year=year,
        gross_pay=gross_pay,
        total_deductions=total_deductions,
        lop_days=Decimal("0"),
        lop_amount=Decimal("0"),
        net_pay=gross_pay - total_deductions,
        status="Paid",
    )
    db.add(payslip)
    db.flush()
    for component, amount in earnings:
        db.add(PayslipDetail(payslip_id=payslip.payslip_id, component_id=component.component_id, component_type="Earning", amount=amount))
    for component, amount in deductions:
        db.add(PayslipDetail(payslip_id=payslip.payslip_id, component_id=component.component_id, component_type="Deduction", amount=amount))


def main() -> None:
    db = SessionLocal()
    today = date.today()
    try:
        employees = db.query(User).filter(User.role == "Employee", User.is_active.is_(True)).all()
        for user in employees:
            seed_attendance(db, user.employee_id, today)
            seed_leave(db, user.employee_id, user.employee.manager_id, today)
            seed_payslip(db, user.employee_id, today)
        db.commit()
        print(f"Dashboard data is ready for {len(employees)} employee accounts.")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
