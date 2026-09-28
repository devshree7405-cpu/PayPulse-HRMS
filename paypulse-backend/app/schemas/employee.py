from datetime import date, datetime
from decimal import Decimal
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, EmailStr


# ---------- Departments / Designations ----------
class DepartmentCreate(BaseModel):
    department_name: str
    head_employee_id: Optional[int] = None


class DepartmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    department_id: int
    department_name: str
    head_employee_id: Optional[int] = None


class DesignationCreate(BaseModel):
    title: str
    department_id: int
    grade_level: Optional[str] = None


class DesignationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    designation_id: int
    title: str
    department_id: int
    grade_level: Optional[str] = None


# ---------- Bank details ----------
class BankDetailsIn(BaseModel):
    bank_name: str
    account_number: str
    ifsc_code: str
    pan_number: str


class BankDetailsOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    employee_id: int
    bank_name: str
    account_number: str
    ifsc_code: str
    pan_number: str
    updated_at: datetime


# ---------- Login account, optionally provisioned alongside an employee ----------
# Not in the original spec - a person needs a `users` row to ever log
# in, so employee creation optionally creates one in the same
# transaction. Omit `account` to create an HR-profile-only record and
# wire up login later.
class AccountIn(BaseModel):
    email: EmailStr
    password: str
    role: Literal["HRAdmin", "Manager", "Employee"] = "Employee"


# ---------- Employees ----------
class EmployeeCreate(BaseModel):
    first_name: str
    last_name: str
    gender: Optional[Literal["Male", "Female", "Other"]] = None
    date_of_birth: Optional[date] = None
    personal_email: EmailStr
    phone: Optional[str] = None
    address: Optional[str] = None
    hire_date: date
    employment_type: Literal["Full-Time", "Part-Time", "Contract"] = "Full-Time"
    employment_status: Literal["Active", "On Leave", "Terminated"] = "Active"
    base_salary: Decimal = Decimal("0")
    department_id: int
    designation_id: int
    manager_id: Optional[int] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    profile_photo_url: Optional[str] = None

    bank_details: Optional[BankDetailsIn] = None
    account: Optional[AccountIn] = None


class EmployeeUpdate(BaseModel):
    """Every field optional - PATCH only touches what's provided."""

    first_name: Optional[str] = None
    last_name: Optional[str] = None
    gender: Optional[Literal["Male", "Female", "Other"]] = None
    date_of_birth: Optional[date] = None
    personal_email: Optional[EmailStr] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    employment_type: Optional[Literal["Full-Time", "Part-Time", "Contract"]] = None
    employment_status: Optional[Literal["Active", "On Leave", "Terminated"]] = None
    base_salary: Optional[Decimal] = None
    salary_change_reason: Optional[str] = None  # goes into salary_history.reason, not employees
    department_id: Optional[int] = None
    designation_id: Optional[int] = None
    manager_id: Optional[int] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    profile_photo_url: Optional[str] = None


class EmployeeSelfUpdate(BaseModel):
    """Fields an employee may maintain on their own profile."""

    phone: Optional[str] = None
    address: Optional[str] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    profile_photo_url: Optional[str] = None


class EmployeeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    employee_id: int
    employee_code: str
    first_name: str
    last_name: str
    gender: Optional[str] = None
    date_of_birth: Optional[date] = None
    personal_email: str
    phone: Optional[str] = None
    address: Optional[str] = None
    hire_date: date
    employment_type: str
    employment_status: str
    base_salary: Decimal
    department_id: int
    designation_id: int
    manager_id: Optional[int] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    profile_photo_url: Optional[str] = None
    created_at: datetime
    updated_at: datetime
