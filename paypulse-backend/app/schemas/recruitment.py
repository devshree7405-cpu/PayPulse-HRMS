from datetime import date, datetime
from decimal import Decimal
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, EmailStr

CandidateStatus = Literal["Applied", "Screening", "Interview", "Offered", "Hired", "Rejected"]


# ---------- Jobs ----------
class JobCreate(BaseModel):
    title: str
    department_id: int
    designation_id: Optional[int] = None
    description: Optional[str] = None
    positions_count: int = 1


class JobOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    job_id: int
    title: str
    department_id: int
    designation_id: Optional[int] = None
    description: Optional[str] = None
    positions_count: int
    status: str
    posted_by: int
    posted_on: datetime


# ---------- Candidates ----------
class CandidateCreate(BaseModel):
    candidate_name: str
    email: EmailStr
    phone: Optional[str] = None
    resume_url: Optional[str] = None
    applied_job_id: int
    source: Optional[str] = None


class CandidateOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    candidate_id: int
    candidate_name: str
    email: str
    phone: Optional[str] = None
    resume_url: Optional[str] = None
    applied_job_id: int
    status: str
    source: Optional[str] = None
    converted_employee_id: Optional[int] = None


class CandidateStatusIn(BaseModel):
    status: CandidateStatus
    # Only used, and required, when status is being set to "Hired" and
    # the job opening itself has no designation_id to fall back on -
    # see the Automated Hire Flow note in routers/recruitment.py.
    designation_id: Optional[int] = None
    manager_id: Optional[int] = None
    employment_type: Literal["Full-Time", "Part-Time", "Contract"] = "Full-Time"
    base_salary: Decimal = Decimal("0")
    hire_date: Optional[date] = None


# ---------- Interviews ----------
class InterviewCreate(BaseModel):
    candidate_id: int
    interviewer_id: int
    scheduled_on: datetime
    feedback: Optional[str] = None
    rating: Optional[Decimal] = None


class InterviewOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    interview_id: int
    candidate_id: int
    interviewer_id: int
    scheduled_on: datetime
    feedback: Optional[str] = None
    rating: Optional[Decimal] = None


# ---------- Onboarding ----------
class OnboardingTaskCreate(BaseModel):
    employee_id: int
    task_name: str
    assigned_to: int
    due_date: Optional[date] = None


class OnboardingTaskOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    onboarding_id: int
    employee_id: int
    task_name: str
    assigned_to: int
    due_date: Optional[date] = None
    status: str
