"""Seed manager dashboard data for local development.

Creates:
  - Attendance, leave history and payslip for the demo manager (Ishan Mehta)
  - 2 extra direct reports (6 total in Engineering team, 4 under Ishan)
  - Attendance + leave balances for all 4 direct reports
  - 1 pending + 1 approved leave request per direct report (for approvals page)
  - A "Monthly Review" cycle for last month
  - PerformanceReviews with self-ratings for each direct report (so manager can rate)

Safe to re-run: all inserts are guarded by existence checks.
"""

from datetime import date, datetime, time, timedelta
from decimal import Decimal
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.database import SessionLocal
from app.models import (
    Attendance, Department, Designation, Employee, LeaveBalance,
    LeaveRequest, LeaveType, Payslip, PayslipDetail, PerformanceReview,
    ReviewCycle, SalaryComponent, User,
)
from app.security import hash_password

SHARED_PASSWORD = "paypulse123"

EXTRA_REPORTS = [
    {
        "email": "rohan.verma@paypulse.com",
        "first_name": "Rohan",
        "last_name": "Verma",
        "employee_code": "DEMO-EMP-005",
        "designation": "Software Engineer",
        "hire_date": date(2024, 3, 10),
        "base_salary": Decimal("780000"),
    },
    {
        "email": "sneha.joshi@paypulse.com",
        "first_name": "Sneha",
        "last_name": "Joshi",
        "employee_code": "DEMO-EMP-006",
        "designation": "Software Engineer",
        "hire_date": date(2024, 7, 22),
        "base_salary": Decimal("820000"),
    },
]

SELF_RATINGS = [
    ("Exceeds Expectations", "Delivered the sprint goals ahead of schedule and mentored two juniors."),
    ("Meets Expectations", "Met all assigned tickets; looking to take on more ownership next cycle."),
    ("Outstanding", "Led the API refactor independently, zero production bugs post-deploy."),
    ("Exceeds Expectations", "Consistent quality, proactive in code reviews, finished two stretch goals."),
]


def previous_month(today: date) -> tuple[int, int]:
    return (today.year - 1, 12) if today.month == 1 else (today.year, today.month - 1)


def get_or_create_designation(db, title: str, department_id: int) -> Designation:
    d = db.query(Designation).filter(
        Designation.title == title, Designation.department_id == department_id
    ).first()
    if d is None:
        d = Designation(title=title, department_id=department_id, grade_level="L2")
        db.add(d)
        db.flush()
    return d


def get_or_create_component(db, name: str, ctype: str) -> SalaryComponent:
    c = db.query(SalaryComponent).filter(SalaryComponent.component_name == name).first()
    if c is None:
        c = SalaryComponent(component_name=name, component_type=ctype)
        db.add(c)
        db.flush()
    return c


def seed_attendance(db, employee_id: int, today: date, variation: int = 0) -> None:
    for offset in range(35, 0, -1):
        att_date = today - timedelta(days=offset)
        if att_date.weekday() >= 5:
            continue
        exists = db.query(Attendance).filter(
            Attendance.employee_id == employee_id, Attendance.attendance_date == att_date
        ).first()
        if exists:
            continue
        day_idx = (att_date.day + variation) % 4
        check_in = time(9, 0 + day_idx * 4)
        check_out = time(18, 10 + day_idx * 3)
        status = "Work From Home" if att_date.weekday() == 3 and att_date.day % 3 == 0 else "Present"
        db.add(Attendance(
            employee_id=employee_id,
            attendance_date=att_date,
            check_in_time=check_in,
            check_out_time=check_out,
            status=status,
            hours_worked=Decimal("8.75"),
        ))


def seed_leave_data(db, employee_id: int, manager_id: int, today: date,
                    add_pending: bool = False, offset_days: int = 18) -> None:
    casual = db.query(LeaveType).filter(LeaveType.leave_type_name == "Casual").first()
    if casual is None:
        casual = LeaveType(leave_type_name="Casual", max_days_per_year=12,
                           carry_forward_allowed=False, is_paid=True)
        db.add(casual)
        db.flush()

    sick = db.query(LeaveType).filter(LeaveType.leave_type_name == "Sick").first()
    if sick is None:
        sick = LeaveType(leave_type_name="Sick", max_days_per_year=6,
                         carry_forward_allowed=False, is_paid=True)
        db.add(sick)
        db.flush()

    # Ensure leave balance for current year
    for lt, alloc, used in [(casual, Decimal("12"), Decimal("2")), (sick, Decimal("6"), Decimal("1"))]:
        bal = db.query(LeaveBalance).filter(
            LeaveBalance.employee_id == employee_id,
            LeaveBalance.leave_type_id == lt.leave_type_id,
            LeaveBalance.year == today.year,
        ).first()
        if bal is None:
            db.add(LeaveBalance(
                employee_id=employee_id,
                leave_type_id=lt.leave_type_id,
                year=today.year,
                allocated=alloc,
                used=used,
                remaining=alloc - used,
            ))

    # Approved past leave (casual)
    marker = f"Demo approved leave #{employee_id}"
    if not db.query(LeaveRequest).filter(
        LeaveRequest.employee_id == employee_id, LeaveRequest.reason == marker
    ).first():
        start = today - timedelta(days=offset_days)
        while start.weekday() >= 5:
            start -= timedelta(days=1)
        end = start + timedelta(days=1)
        db.add(LeaveRequest(
            employee_id=employee_id,
            leave_type_id=casual.leave_type_id,
            start_date=start,
            end_date=end,
            no_of_days=Decimal("2"),
            reason=marker,
            status="Approved",
            approved_by=manager_id,
            approved_on=datetime.combine(end, time(10, 0)),
        ))

    # Pending leave request (for team approvals page to show something)
    if add_pending:
        pending_marker = f"Demo pending leave #{employee_id}"
        if not db.query(LeaveRequest).filter(
            LeaveRequest.employee_id == employee_id, LeaveRequest.reason == pending_marker
        ).first():
            start = today + timedelta(days=7)
            while start.weekday() >= 5:
                start += timedelta(days=1)
            end = start + timedelta(days=2)
            db.add(LeaveRequest(
                employee_id=employee_id,
                leave_type_id=casual.leave_type_id,
                start_date=start,
                end_date=end,
                no_of_days=Decimal("3"),
                reason=pending_marker,
                status="Pending",
            ))


def seed_payslip(db, employee_id: int, today: date,
                 basic: Decimal, hra: Decimal, conveyance: Decimal, pf: Decimal) -> None:
    year, month = previous_month(today)
    if db.query(Payslip).filter(
        Payslip.employee_id == employee_id,
        Payslip.payslip_year == year,
        Payslip.payslip_month == month,
    ).first():
        return

    basic_c = get_or_create_component(db, "Basic salary", "Earning")
    hra_c = get_or_create_component(db, "House rent allowance", "Earning")
    conv_c = get_or_create_component(db, "Conveyance allowance", "Earning")
    pf_c = get_or_create_component(db, "Provident fund", "Deduction")

    earnings = [(basic_c, basic), (hra_c, hra), (conv_c, conveyance)]
    deductions = [(pf_c, pf)]
    gross = sum(a for _, a in earnings)
    total_ded = sum(a for _, a in deductions)

    slip = Payslip(
        employee_id=employee_id,
        payslip_month=month,
        payslip_year=year,
        gross_pay=gross,
        total_deductions=total_ded,
        lop_days=Decimal("0"),
        lop_amount=Decimal("0"),
        net_pay=gross - total_ded,
        status="Paid",
    )
    db.add(slip)
    db.flush()
    for comp, amt in earnings:
        db.add(PayslipDetail(payslip_id=slip.payslip_id, component_id=comp.component_id,
                              component_type="Earning", amount=amt))
    for comp, amt in deductions:
        db.add(PayslipDetail(payslip_id=slip.payslip_id, component_id=comp.component_id,
                              component_type="Deduction", amount=amt))


def get_or_create_monthly_cycle(db, today: date) -> ReviewCycle:
    year, month = previous_month(today)
    cycle_name = f"Monthly Review - {date(year, month, 1).strftime('%B %Y')}"
    cycle = db.query(ReviewCycle).filter(ReviewCycle.cycle_name == cycle_name).first()
    if cycle is None:
        first_day = date(year, month, 1)
        last_day = (date(year, month + 1, 1) - timedelta(days=1)) if month < 12 else date(year, 12, 31)
        cycle = ReviewCycle(
            cycle_name=cycle_name,
            start_date=first_day,
            end_date=last_day,
            status="Active",
        )
        db.add(cycle)
        db.flush()
    return cycle


def main() -> None:
    db = SessionLocal()
    today = date.today()
    try:
        engineering = db.query(Department).filter(Department.department_name == "Engineering").first()
        if engineering is None:
            raise RuntimeError("Run seed_demo_logins.py first (Engineering department is required).")

        ishan = db.query(User).filter(User.email == "ishan.mehta@paypulse.com").first()
        if ishan is None:
            raise RuntimeError("Manager account not found. Run seed_demo_logins.py first.")
        mgr_id = ishan.employee_id

        # ── 1. Extra direct reports for Ishan only ─────────────────────────
        print("Creating extra direct reports for Ishan Mehta...")
        for account in EXTRA_REPORTS:
            existing = db.query(User).filter(User.email == account["email"]).first()
            if existing is None:
                desig = get_or_create_designation(db, account["designation"], engineering.department_id)
                emp = Employee(
                    employee_code=account["employee_code"],
                    first_name=account["first_name"],
                    last_name=account["last_name"],
                    personal_email=account["email"],
                    hire_date=account["hire_date"],
                    employment_type="Full-Time",
                    employment_status="Active",
                    base_salary=account["base_salary"],
                    department_id=engineering.department_id,
                    designation_id=desig.designation_id,
                    manager_id=mgr_id,
                )
                db.add(emp)
                db.flush()
                db.add(User(
                    employee_id=emp.employee_id,
                    email=account["email"],
                    password_hash=hash_password(SHARED_PASSWORD),
                    role="Employee",
                    is_active=True,
                ))
                db.flush()
        db.commit()

        # ── 2. Seed every manager account found in the system ──────────────
        # (Managers can't view their own payslips - backend blocks that
        # role entirely from /payroll - so no payslip is seeded for them.)
        all_managers = db.query(User).filter(User.role == "Manager").all()
        cycle = get_or_create_monthly_cycle(db, today)

        for manager_user in all_managers:
            mgr = manager_user.employee_id
            mgr_name = f"{manager_user.employee.first_name} {manager_user.employee.last_name}"
            print(f"\nSeeding data for manager: {mgr_name} <{manager_user.email}>")

            seed_attendance(db, mgr, today, variation=1)
            seed_leave_data(db, mgr, manager_id=mgr, today=today, add_pending=False, offset_days=22)

            direct_reports = db.query(Employee).filter(Employee.manager_id == mgr).all()
            if not direct_reports:
                print("  (no direct reports - skipping team data)")
                continue

            for idx, emp in enumerate(direct_reports):
                seed_attendance(db, emp.employee_id, today, variation=idx)
                seed_leave_data(
                    db, emp.employee_id, manager_id=mgr, today=today,
                    add_pending=(idx % 2 == 0),   # alternating: half have a pending request
                    offset_days=14 + idx * 4,
                )
                seed_payslip(db, emp.employee_id, today,
                             basic=Decimal("45000"), hra=Decimal("24000"),
                             conveyance=Decimal("1500"), pf=Decimal("3000"))

                # Monthly performance review with self-rating already filled in
                review_exists = db.query(PerformanceReview).filter(
                    PerformanceReview.employee_id == emp.employee_id,
                    PerformanceReview.cycle_id == cycle.cycle_id,
                ).first()
                if not review_exists:
                    rating, comments = SELF_RATINGS[idx % len(SELF_RATINGS)]
                    db.add(PerformanceReview(
                        employee_id=emp.employee_id,
                        cycle_id=cycle.cycle_id,
                        reviewer_id=mgr,
                        self_rating=rating,
                        self_comments=comments,
                        status="Submitted",
                    ))
            print(f"  Direct reports: {[f'{e.first_name} {e.last_name}' for e in direct_reports]}")

        db.commit()
        print(f"\nDone. Seeded {len(all_managers)} manager account(s).")
        print(f"Review cycle: '{cycle.cycle_name}'")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
