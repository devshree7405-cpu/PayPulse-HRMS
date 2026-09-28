"""
ORM models. These map onto tables that already exist (created by
PayPulse.sql + migration_additions.sql) - this file never calls
Base.metadata.create_all() against them; the SQL files are the
source of truth for the schema, this is just how Python sees it.
"""
from datetime import date, datetime, time
from decimal import Decimal

from sqlalchemy import (
    DECIMAL,
    TIMESTAMP,
    Boolean,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
    Text,
    Time,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


# ============================================================
# MODULE 1 — FOUNDATION
# ============================================================
class Department(Base):
    __tablename__ = "departments"

    department_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    department_name: Mapped[str] = mapped_column(String(100), unique=True)
    head_employee_id: Mapped[int | None] = mapped_column(ForeignKey("employees.employee_id"))
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP, server_default=func.now())


class Designation(Base):
    __tablename__ = "designations"

    designation_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(100))
    department_id: Mapped[int] = mapped_column(ForeignKey("departments.department_id"))
    grade_level: Mapped[str | None] = mapped_column(String(20))


class Employee(Base):
    __tablename__ = "employees"

    employee_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    employee_code: Mapped[str] = mapped_column(String(20), unique=True)
    first_name: Mapped[str] = mapped_column(String(50))
    last_name: Mapped[str] = mapped_column(String(50))
    gender: Mapped[str | None] = mapped_column(Enum("Male", "Female", "Other"))
    date_of_birth: Mapped[date | None] = mapped_column(Date)
    personal_email: Mapped[str] = mapped_column(String(100), unique=True)
    phone: Mapped[str | None] = mapped_column(String(20))
    address: Mapped[str | None] = mapped_column(String(255))
    hire_date: Mapped[date] = mapped_column(Date)
    employment_type: Mapped[str] = mapped_column(
        Enum("Full-Time", "Part-Time", "Contract"), default="Full-Time"
    )
    employment_status: Mapped[str] = mapped_column(
        Enum("Active", "On Leave", "Terminated"), default="Active"
    )
    # Added by migration_additions.sql - see that file for why.
    base_salary: Mapped[Decimal] = mapped_column(DECIMAL(12, 2), default=0)
    department_id: Mapped[int] = mapped_column(ForeignKey("departments.department_id"))
    designation_id: Mapped[int] = mapped_column(ForeignKey("designations.designation_id"))
    manager_id: Mapped[int | None] = mapped_column(ForeignKey("employees.employee_id"))
    emergency_contact_name: Mapped[str | None] = mapped_column(String(100))
    emergency_contact_phone: Mapped[str | None] = mapped_column(String(20))
    profile_photo_url: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        TIMESTAMP, server_default=func.now(), onupdate=func.now()
    )

    department: Mapped["Department"] = relationship(foreign_keys=[department_id])
    designation: Mapped["Designation"] = relationship()
    manager: Mapped["Employee | None"] = relationship(remote_side=[employee_id])
    user: Mapped["User"] = relationship(back_populates="employee", uselist=False)
    bank_details: Mapped["EmployeeBankDetails | None"] = relationship(
        back_populates="employee", uselist=False
    )

    @property
    def has_login(self) -> bool:
        return self.user is not None


class User(Base):
    __tablename__ = "users"

    user_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    employee_id: Mapped[int] = mapped_column(
        ForeignKey("employees.employee_id"), unique=True
    )
    email: Mapped[str] = mapped_column(String(100), unique=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(Enum("HRAdmin", "Manager", "Employee"))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    last_login_at: Mapped[datetime | None] = mapped_column(TIMESTAMP)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        TIMESTAMP, server_default=func.now(), onupdate=func.now()
    )

    employee: Mapped["Employee"] = relationship(back_populates="user")


class EmployeeBankDetails(Base):
    __tablename__ = "employee_bank_details"

    employee_id: Mapped[int] = mapped_column(
        ForeignKey("employees.employee_id"), primary_key=True
    )
    bank_name: Mapped[str] = mapped_column(String(100))
    account_number: Mapped[str] = mapped_column(String(255))  # app-layer encrypted
    ifsc_code: Mapped[str] = mapped_column(String(20))
    pan_number: Mapped[str] = mapped_column(String(255))  # app-layer encrypted
    updated_at: Mapped[datetime] = mapped_column(
        TIMESTAMP, server_default=func.now(), onupdate=func.now()
    )

    employee: Mapped["Employee"] = relationship(back_populates="bank_details")


class SalaryHistory(Base):
    __tablename__ = "salary_history"

    salary_history_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.employee_id"))
    old_amount: Mapped[Decimal | None] = mapped_column(DECIMAL(12, 2))
    new_amount: Mapped[Decimal] = mapped_column(DECIMAL(12, 2))
    reason: Mapped[str | None] = mapped_column(String(255))
    changed_by: Mapped[int] = mapped_column(ForeignKey("employees.employee_id"))
    changed_on: Mapped[datetime] = mapped_column(TIMESTAMP, server_default=func.now())


# ============================================================
# MODULE 2 — ATTENDANCE + LEAVE
# ============================================================
class Attendance(Base):
    __tablename__ = "attendance"
    __table_args__ = (UniqueConstraint("employee_id", "attendance_date", name="uq_employee_date"),)

    attendance_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.employee_id"))
    attendance_date: Mapped[date] = mapped_column(Date)
    check_in_time: Mapped[time | None] = mapped_column(Time)
    check_out_time: Mapped[time | None] = mapped_column(Time)
    status: Mapped[str] = mapped_column(
        Enum("Present", "Absent", "Half-Day", "Work From Home", "Late"), default="Present"
    )
    hours_worked: Mapped[Decimal | None] = mapped_column(DECIMAL(4, 2))
    remarks: Mapped[str | None] = mapped_column(String(255))


class LeaveType(Base):
    __tablename__ = "leave_types"

    leave_type_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    leave_type_name: Mapped[str] = mapped_column(String(50), unique=True)
    max_days_per_year: Mapped[int] = mapped_column(Integer)
    carry_forward_allowed: Mapped[bool] = mapped_column(Boolean, default=False)
    # Added by migration_additions.sql
    is_paid: Mapped[bool] = mapped_column(Boolean, default=True)


class LeaveBalance(Base):
    __tablename__ = "leave_balances"

    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.employee_id"), primary_key=True)
    leave_type_id: Mapped[int] = mapped_column(
        ForeignKey("leave_types.leave_type_id"), primary_key=True
    )
    year: Mapped[int] = mapped_column(Integer, primary_key=True)
    allocated: Mapped[Decimal] = mapped_column(DECIMAL(4, 1))
    used: Mapped[Decimal] = mapped_column(DECIMAL(4, 1), default=0)
    remaining: Mapped[Decimal] = mapped_column(DECIMAL(4, 1))

    leave_type: Mapped["LeaveType"] = relationship()


class LeaveRequest(Base):
    __tablename__ = "leave_requests"

    leave_request_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.employee_id"))
    leave_type_id: Mapped[int] = mapped_column(ForeignKey("leave_types.leave_type_id"))
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date] = mapped_column(Date)
    no_of_days: Mapped[Decimal] = mapped_column(DECIMAL(4, 1))
    reason: Mapped[str | None] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(
        Enum("Pending", "Approved", "Rejected", "Cancelled"), default="Pending"
    )
    applied_on: Mapped[datetime] = mapped_column(TIMESTAMP, server_default=func.now())
    approved_by: Mapped[int | None] = mapped_column(ForeignKey("employees.employee_id"))
    approved_on: Mapped[datetime | None] = mapped_column(TIMESTAMP)
    manager_comments: Mapped[str | None] = mapped_column(String(255))

    employee: Mapped["Employee"] = relationship(foreign_keys=[employee_id])
    leave_type: Mapped["LeaveType"] = relationship()


# ============================================================
# MODULE 3 — PAYROLL
# ============================================================
class SalaryComponent(Base):
    __tablename__ = "salary_components"

    component_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    component_name: Mapped[str] = mapped_column(String(50), unique=True)
    component_type: Mapped[str] = mapped_column(Enum("Earning", "Deduction"))


class EmployeeSalaryStructure(Base):
    __tablename__ = "employee_salary_structure"
    __table_args__ = (
        UniqueConstraint(
            "employee_id", "component_id", "effective_from", name="uq_emp_component_effective"
        ),
    )

    structure_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.employee_id"))
    component_id: Mapped[int] = mapped_column(ForeignKey("salary_components.component_id"))
    amount: Mapped[Decimal] = mapped_column(DECIMAL(12, 2))
    effective_from: Mapped[date] = mapped_column(Date)

    component: Mapped["SalaryComponent"] = relationship()


class Payslip(Base):
    __tablename__ = "payslips"
    __table_args__ = (
        UniqueConstraint("employee_id", "payslip_month", "payslip_year", name="uq_employee_month_year"),
    )

    payslip_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.employee_id"))
    payslip_month: Mapped[int] = mapped_column(Integer)
    payslip_year: Mapped[int] = mapped_column(Integer)
    gross_pay: Mapped[Decimal] = mapped_column(DECIMAL(12, 2))
    total_deductions: Mapped[Decimal] = mapped_column(DECIMAL(12, 2))
    # Added by migration_additions.sql
    lop_days: Mapped[Decimal] = mapped_column(DECIMAL(4, 1), default=0)
    lop_amount: Mapped[Decimal] = mapped_column(DECIMAL(12, 2), default=0)
    net_pay: Mapped[Decimal] = mapped_column(DECIMAL(12, 2))
    generated_on: Mapped[datetime] = mapped_column(TIMESTAMP, server_default=func.now())
    status: Mapped[str] = mapped_column(Enum("Draft", "Finalized", "Paid"), default="Draft")

    details: Mapped[list["PayslipDetail"]] = relationship(back_populates="payslip")


class PayslipDetail(Base):
    """Added by migration_additions.sql - the itemized breakdown the spec calls for."""

    __tablename__ = "payslip_details"

    payslip_detail_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    payslip_id: Mapped[int] = mapped_column(ForeignKey("payslips.payslip_id"))
    component_id: Mapped[int] = mapped_column(ForeignKey("salary_components.component_id"))
    component_type: Mapped[str] = mapped_column(Enum("Earning", "Deduction"))
    amount: Mapped[Decimal] = mapped_column(DECIMAL(12, 2))

    payslip: Mapped["Payslip"] = relationship(back_populates="details")
    component: Mapped["SalaryComponent"] = relationship()


# ============================================================
# MODULE 4 — PERFORMANCE
# ============================================================
class ReviewCycle(Base):
    __tablename__ = "review_cycles"

    cycle_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    cycle_name: Mapped[str] = mapped_column(String(50), unique=True)
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date] = mapped_column(Date)
    status: Mapped[str] = mapped_column(
        Enum("Upcoming", "Active", "Closed"), default="Upcoming"
    )


class Goal(Base):
    __tablename__ = "goals"

    goal_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.employee_id"))
    cycle_id: Mapped[int] = mapped_column(ForeignKey("review_cycles.cycle_id"))
    description: Mapped[str] = mapped_column(String(255))
    target: Mapped[str | None] = mapped_column(String(255))
    weightage: Mapped[Decimal | None] = mapped_column(DECIMAL(5, 2))
    status: Mapped[str] = mapped_column(
        Enum("Not Started", "In Progress", "Completed"), default="Not Started"
    )


class PerformanceReview(Base):
    __tablename__ = "performance_reviews"
    __table_args__ = (UniqueConstraint("employee_id", "cycle_id", name="uq_employee_cycle"),)

    review_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.employee_id"))
    cycle_id: Mapped[int] = mapped_column(ForeignKey("review_cycles.cycle_id"))
    reviewer_id: Mapped[int] = mapped_column(ForeignKey("employees.employee_id"))
    self_rating: Mapped[str | None] = mapped_column(
        Enum("Needs Improvement", "Meets Expectations", "Exceeds Expectations", "Outstanding")
    )
    manager_rating: Mapped[str | None] = mapped_column(
        Enum("Needs Improvement", "Meets Expectations", "Exceeds Expectations", "Outstanding")
    )
    self_comments: Mapped[str | None] = mapped_column(Text)
    manager_feedback: Mapped[str | None] = mapped_column(Text)
    final_rating: Mapped[str | None] = mapped_column(
        Enum("Needs Improvement", "Meets Expectations", "Exceeds Expectations", "Outstanding")
    )
    status: Mapped[str] = mapped_column(Enum("Draft", "Submitted", "Finalized"), default="Draft")

    employee: Mapped["Employee"] = relationship(foreign_keys=[employee_id])


# ============================================================
# MODULE 5 — RECRUITMENT / ONBOARDING
# ============================================================
class JobOpening(Base):
    __tablename__ = "job_openings"

    job_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(100))
    department_id: Mapped[int] = mapped_column(ForeignKey("departments.department_id"))
    # Added by migration_additions.sql
    designation_id: Mapped[int | None] = mapped_column(ForeignKey("designations.designation_id"))
    description: Mapped[str | None] = mapped_column(Text)
    positions_count: Mapped[int] = mapped_column(Integer, default=1)
    status: Mapped[str] = mapped_column(Enum("Open", "Closed"), default="Open")
    posted_by: Mapped[int] = mapped_column(ForeignKey("employees.employee_id"))
    posted_on: Mapped[datetime] = mapped_column(TIMESTAMP, server_default=func.now())


class Candidate(Base):
    __tablename__ = "candidates"

    candidate_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    candidate_name: Mapped[str] = mapped_column(String(100))
    email: Mapped[str] = mapped_column(String(100))
    phone: Mapped[str | None] = mapped_column(String(20))
    resume_url: Mapped[str | None] = mapped_column(String(255))
    applied_job_id: Mapped[int] = mapped_column(ForeignKey("job_openings.job_id"))
    status: Mapped[str] = mapped_column(
        Enum("Applied", "Screening", "Interview", "Offered", "Hired", "Rejected"),
        default="Applied",
    )
    source: Mapped[str | None] = mapped_column(String(50))
    converted_employee_id: Mapped[int | None] = mapped_column(ForeignKey("employees.employee_id"))

    job: Mapped["JobOpening"] = relationship()


class Interview(Base):
    __tablename__ = "interviews"

    interview_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    candidate_id: Mapped[int] = mapped_column(ForeignKey("candidates.candidate_id"))
    interviewer_id: Mapped[int] = mapped_column(ForeignKey("employees.employee_id"))
    scheduled_on: Mapped[datetime] = mapped_column(DateTime)
    feedback: Mapped[str | None] = mapped_column(Text)
    rating: Mapped[Decimal | None] = mapped_column(DECIMAL(3, 1))


class OnboardingTask(Base):
    __tablename__ = "onboarding_tasks"

    onboarding_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.employee_id"))
    task_name: Mapped[str] = mapped_column(String(100))
    assigned_to: Mapped[int] = mapped_column(ForeignKey("employees.employee_id"))
    due_date: Mapped[date | None] = mapped_column(Date)
    status: Mapped[str] = mapped_column(
        Enum("Pending", "In Progress", "Completed"), default="Pending"
    )
