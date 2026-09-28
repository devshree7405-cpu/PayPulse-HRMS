"""Create the seven demo login accounts used during frontend development.

Safe to run again: existing users are retained and their password is reset to
the shared development password.  It deliberately does not touch HRAdmin.
"""

from datetime import date

from app.database import SessionLocal
from app.models import Department, Designation, Employee, LeaveBalance, LeaveType, User
from app.security import hash_password

SHARED_PASSWORD = "paypulse123"

NEW_ACCOUNTS = [
    {
        "email": "ishan.mehta@paypulse.com",
        "role": "Manager",
        "employee_code": "DEMO-MGR-001",
        "first_name": "Ishan",
        "last_name": "Mehta",
        "designation": "Engineering Manager",
        "manager_email": None,
    },
    {
        "email": "nisha.sharma@paypulse.com",
        "role": "Employee",
        "employee_code": "DEMO-EMP-001",
        "first_name": "Nisha",
        "last_name": "Sharma",
        "designation": "Software Engineer",
        "manager_email": "shreya678@gmail.com",
    },
    {
        "email": "karan.patel@paypulse.com",
        "role": "Employee",
        "employee_code": "DEMO-EMP-002",
        "first_name": "Karan",
        "last_name": "Patel",
        "designation": "Software Engineer",
        "manager_email": "shreya678@gmail.com",
    },
    {
        "email": "priya.nair@paypulse.com",
        "role": "Employee",
        "employee_code": "DEMO-EMP-003",
        "first_name": "Priya",
        "last_name": "Nair",
        "designation": "Software Engineer",
        "manager_email": "ishan.mehta@paypulse.com",
    },
    {
        "email": "aditya.singh@paypulse.com",
        "role": "Employee",
        "employee_code": "DEMO-EMP-004",
        "first_name": "Aditya",
        "last_name": "Singh",
        "designation": "Software Engineer",
        "manager_email": "ishan.mehta@paypulse.com",
    },
]


def get_designation_id(db, title: str, department_id: int) -> int:
    designation = (
        db.query(Designation)
        .filter(Designation.title == title, Designation.department_id == department_id)
        .first()
    )
    if designation is None:
        designation = Designation(title=title, department_id=department_id, grade_level="L2")
        db.add(designation)
        db.flush()
    return designation.designation_id


def main() -> None:
    db = SessionLocal()
    try:
        engineering = db.query(Department).filter(Department.department_name == "Engineering").first()
        if engineering is None:
            raise RuntimeError("Engineering department is required before creating demo accounts.")

        password_hash = hash_password(SHARED_PASSWORD)

        # First create the manager so their employee_id is available for reports.
        ordered_accounts = sorted(NEW_ACCOUNTS, key=lambda account: account["role"] != "Manager")
        for account in ordered_accounts:
            user = db.query(User).filter(User.email == account["email"]).first()
            if user is None:
                employee = Employee(
                    employee_code=account["employee_code"],
                    first_name=account["first_name"],
                    last_name=account["last_name"],
                    personal_email=account["email"],
                    hire_date=date(2025, 1, 6),
                    employment_type="Full-Time",
                    employment_status="Active",
                    base_salary=850000,
                    department_id=engineering.department_id,
                    designation_id=get_designation_id(db, account["designation"], engineering.department_id),
                )
                db.add(employee)
                db.flush()
                user = User(
                    employee_id=employee.employee_id,
                    email=account["email"],
                    password_hash=password_hash,
                    role=account["role"],
                    is_active=True,
                )
                db.add(user)
                db.flush()
            else:
                user.password_hash = password_hash
                user.role = account["role"]
                user.is_active = True

        # Assign the new Employees to their specified Manager.
        for account in NEW_ACCOUNTS:
            if account["manager_email"] is None:
                continue
            user = db.query(User).filter(User.email == account["email"]).one()
            manager = db.query(User).filter(User.email == account["manager_email"]).one()
            user.employee.manager_id = manager.employee_id

        # The existing HR Admin, Manager and Employee also use the shared demo password.
        for user in db.query(User).filter(User.role.in_(["HRAdmin", "Manager", "Employee"])).all():
            user.password_hash = password_hash
            user.is_active = True

        casual_leave = db.query(LeaveType).filter(LeaveType.leave_type_name == "Casual").first()
        if casual_leave is None:
            casual_leave = LeaveType(
                leave_type_name="Casual", max_days_per_year=12, carry_forward_allowed=False, is_paid=True
            )
            db.add(casual_leave)
            db.flush()

        for employee in db.query(Employee).all():
            balance = (
                db.query(LeaveBalance)
                .filter(
                    LeaveBalance.employee_id == employee.employee_id,
                    LeaveBalance.leave_type_id == casual_leave.leave_type_id,
                    LeaveBalance.year == 2026,
                )
                .first()
            )
            if balance is None:
                db.add(
                    LeaveBalance(
                        employee_id=employee.employee_id,
                        leave_type_id=casual_leave.leave_type_id,
                        year=2026,
                        allocated=12,
                        used=0,
                        remaining=12,
                    )
                )

        db.commit()
        print("Demo accounts ready:")
        for user in db.query(User).order_by(User.role, User.email).all():
            print(f"{user.role:8} {user.email}")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
