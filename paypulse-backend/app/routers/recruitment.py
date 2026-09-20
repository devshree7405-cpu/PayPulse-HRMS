import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import CurrentUser, get_current_user, require_role
from app.models import Candidate, Designation, Employee, Interview, JobOpening, OnboardingTask
from app.schemas.recruitment import (
    CandidateCreate,
    CandidateOut,
    CandidateStatusIn,
    InterviewCreate,
    InterviewOut,
    JobCreate,
    JobOut,
    OnboardingTaskCreate,
    OnboardingTaskOut,
)

router = APIRouter(tags=["Recruitment"])

TERMINAL_STATUSES = {"Hired", "Rejected"}


# ============================================================
# JOBS
# ============================================================
@router.post("/jobs", response_model=JobOut, status_code=status.HTTP_201_CREATED)
def create_job(
    payload: JobCreate,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(["HRAdmin"])),
):
    job = JobOpening(**payload.model_dump(), posted_by=current_user.employee_id)
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


@router.get("/jobs", response_model=list[JobOut])
def list_jobs(db: Session = Depends(get_db), current_user: CurrentUser = Depends(get_current_user)):
    return db.query(JobOpening).order_by(JobOpening.posted_on.desc()).all()


# ============================================================
# CANDIDATES
# ============================================================
@router.post("/candidates", response_model=CandidateOut, status_code=status.HTTP_201_CREATED)
def create_candidate(
    payload: CandidateCreate,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(["HRAdmin"])),
):
    if db.get(JobOpening, payload.applied_job_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job opening not found")

    candidate = Candidate(**payload.model_dump(), status="Applied")
    db.add(candidate)
    db.commit()
    db.refresh(candidate)
    return candidate


def _split_name(full_name: str) -> tuple[str, str]:
    parts = full_name.strip().split(" ", 1)
    return (parts[0], parts[1] if len(parts) > 1 else "")


@router.patch("/candidates/{candidate_id}/status", response_model=CandidateOut)
def update_candidate_status(
    candidate_id: int,
    payload: CandidateStatusIn,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(["HRAdmin"])),
):
    candidate = db.get(Candidate, candidate_id)
    if candidate is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")
    if candidate.status in TERMINAL_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"This candidate's pipeline is already {candidate.status} and can't be moved further",
        )

    if payload.status != "Hired":
        candidate.status = payload.status
        db.commit()
        db.refresh(candidate)
        return candidate

    # ---- Automated Hire Flow ----
    job = candidate.job
    designation_id = payload.designation_id or job.designation_id
    if designation_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No designation_id on the job opening - supply one to hire this candidate",
        )
    if db.get(Designation, designation_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Designation not found")
    if payload.manager_id is not None and db.get(Employee, payload.manager_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Manager not found")

    first_name, last_name = _split_name(candidate.candidate_name)
    new_employee = Employee(
        employee_code=f"TMP-{uuid.uuid4().hex[:12]}",
        first_name=first_name,
        last_name=last_name or first_name,
        personal_email=candidate.email,
        phone=candidate.phone,
        hire_date=payload.hire_date or date.today(),
        employment_type=payload.employment_type,
        employment_status="Active",
        base_salary=payload.base_salary,
        department_id=job.department_id,
        designation_id=designation_id,
        manager_id=payload.manager_id,
    )
    db.add(new_employee)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An employee with this email already exists - can't convert this candidate",
        )

    new_employee.employee_code = f"EMP{new_employee.employee_id:04d}"
    candidate.status = "Hired"
    candidate.converted_employee_id = new_employee.employee_id

    db.commit()
    db.refresh(candidate)
    return candidate


# ============================================================
# INTERVIEWS
# ============================================================
@router.post("/interviews", response_model=InterviewOut, status_code=status.HTTP_201_CREATED)
def schedule_interview(
    payload: InterviewCreate,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(["HRAdmin", "Manager"])),
):
    if db.get(Candidate, payload.candidate_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")
    if db.get(Employee, payload.interviewer_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Interviewer not found")

    interview = Interview(**payload.model_dump())
    db.add(interview)
    db.commit()
    db.refresh(interview)
    return interview


# ============================================================
# ONBOARDING
# ============================================================
@router.post("/onboarding-tasks", response_model=OnboardingTaskOut, status_code=status.HTTP_201_CREATED)
def create_onboarding_task(
    payload: OnboardingTaskCreate,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(["HRAdmin", "Manager"])),
):
    if db.get(Employee, payload.employee_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")
    if db.get(Employee, payload.assigned_to) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assignee not found")

    task = OnboardingTask(**payload.model_dump())
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


@router.get("/onboarding-tasks/{employee_id}", response_model=list[OnboardingTaskOut])
def list_onboarding_tasks(
    employee_id: int, db: Session = Depends(get_db), current_user: CurrentUser = Depends(get_current_user)
):
    return db.query(OnboardingTask).filter(OnboardingTask.employee_id == employee_id).all()
