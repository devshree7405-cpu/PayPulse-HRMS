import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import CurrentUser, get_current_user, require_role
from app.models import Department, Designation, Employee, EmployeeBankDetails, SalaryHistory, User
from app.schemas.employee import (
    AccountIn,
    AccountOut,
    BankDetailsOut,
    DepartmentCreate,
    DepartmentOut,
    DesignationCreate,
    DesignationOut,
    EmployeeCreate,
    EmployeeOut,
    EmployeeSelfUpdate,
    EmployeeUpdate,
)
from app.security import hash_password

router = APIRouter(tags=["Employees"])


def _assert_can_view_employee(target: Employee, current_user: CurrentUser):
    if current_user.role == "HRAdmin":
        return
    if current_user.role == "Manager" and (
        target.employee_id == current_user.employee_id or target.manager_id == current_user.employee_id
    ):
        return
    if current_user.role == "Employee" and target.employee_id == current_user.employee_id:
        return
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to view this employee")


def _get_employee_or_404(employee_id: int, db: Session) -> Employee:
    employee = db.get(Employee, employee_id)
    if employee is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")
    return employee


# ============================================================
# EMPLOYEES
# ============================================================
@router.post("/employees", response_model=EmployeeOut, status_code=status.HTTP_201_CREATED)
def create_employee(
    payload: EmployeeCreate,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(["HRAdmin"])),
):
    data = payload.model_dump(exclude={"bank_details", "account"})

    # Step 1: insert with a placeholder code (employee_code is NOT NULL
    # UNIQUE, so it can't be blank even for an instant) and flush to
    # get the real auto-increment id from MySQL.
    employee = Employee(employee_code=f"TMP-{uuid.uuid4().hex[:12]}", **data)
    db.add(employee)
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=_friendly_integrity_error(exc))

    # Step 2: now that we have the id, set the real code.
    employee.employee_code = f"EMP{employee.employee_id:04d}"

    if payload.bank_details:
        db.add(EmployeeBankDetails(employee_id=employee.employee_id, **payload.bank_details.model_dump()))

    if payload.account:
        db.add(
            User(
                employee_id=employee.employee_id,
                email=payload.account.email,
                password_hash=hash_password(payload.account.password),
                role=payload.account.role,
            )
        )

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=_friendly_integrity_error(exc))

    db.refresh(employee)
    return employee


def _friendly_integrity_error(exc: IntegrityError) -> str:
    message = str(exc.orig)
    if "personal_email" in message:
        return "An employee with this personal email already exists."
    if "users.email" in message or ("email" in message and "users" in message):
        return "An account with this login email already exists."
    return "This record conflicts with an existing one."


@router.get("/employees", response_model=list[EmployeeOut])
def list_employees(
    db: Session = Depends(get_db), current_user: CurrentUser = Depends(get_current_user)
):
    """
    Not in the original spec, but the directory screen needs
    something to call - scoped with the same visibility rule as
    GET /employees/{id}: HRAdmin sees everyone, a Manager sees
    themselves plus direct reports, an Employee sees only themselves.
    """
    query = db.query(Employee)
    if current_user.role == "Manager":
        query = query.filter(
            (Employee.manager_id == current_user.employee_id)
            | (Employee.employee_id == current_user.employee_id)
        )
    elif current_user.role == "Employee":
        query = query.filter(Employee.employee_id == current_user.employee_id)
    return query.order_by(Employee.employee_id).all()


@router.patch("/employees/me/profile", response_model=EmployeeOut)
def update_my_profile(
    payload: EmployeeSelfUpdate,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    """Employees can keep contact details current without HR-level access."""
    employee = _get_employee_or_404(current_user.employee_id, db)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(employee, field, value)
    db.commit()
    db.refresh(employee)
    return employee


@router.get("/employees/{employee_id}", response_model=EmployeeOut)
def get_employee(
    employee_id: int, db: Session = Depends(get_db), current_user: CurrentUser = Depends(get_current_user)
):
    employee = _get_employee_or_404(employee_id, db)
    _assert_can_view_employee(employee, current_user)
    return employee


@router.patch("/employees/{employee_id}", response_model=EmployeeOut)
def update_employee(
    employee_id: int,
    payload: EmployeeUpdate,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(["HRAdmin"])),
):
    employee = _get_employee_or_404(employee_id, db)
    updates = payload.model_dump(exclude={"salary_change_reason"}, exclude_unset=True)

    new_salary = updates.pop("base_salary", None)
    if new_salary is not None and new_salary != employee.base_salary:
        db.add(
            SalaryHistory(
                employee_id=employee.employee_id,
                old_amount=employee.base_salary,
                new_amount=new_salary,
                reason=payload.salary_change_reason,
                changed_by=current_user.employee_id,
            )
        )
        employee.base_salary = new_salary

    for field, value in updates.items():
        setattr(employee, field, value)

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=_friendly_integrity_error(exc))

    db.refresh(employee)
    return employee


@router.post(
    "/employees/{employee_id}/account", response_model=AccountOut, status_code=status.HTTP_201_CREATED
)
def create_employee_account(
    employee_id: int,
    payload: AccountIn,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(["HRAdmin"])),
):
    """
    Provisions a login for an employee who doesn't have one yet - covers
    both a manually-created HR-profile-only record and, notably, a
    candidate the hire-flow converted into an employee (that flow only
    creates the Employee row, never a User).
    """
    employee = _get_employee_or_404(employee_id, db)
    if employee.user is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="This employee already has a login account"
        )

    user = User(
        employee_id=employee_id,
        email=payload.email,
        password_hash=hash_password(payload.password),
        role=payload.role,
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=_friendly_integrity_error(exc))
    return AccountOut(email=user.email, role=user.role, employee_id=employee_id)


@router.get("/employees/{employee_id}/bank-details", response_model=BankDetailsOut)
def get_bank_details(
    employee_id: int, db: Session = Depends(get_db), current_user: CurrentUser = Depends(get_current_user)
):
    if current_user.role != "HRAdmin" and current_user.employee_id != employee_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")

    details = db.get(EmployeeBankDetails, employee_id)
    if details is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No bank details on file")
    return details


# ============================================================
# DEPARTMENTS / DESIGNATIONS
# ============================================================
@router.post("/departments", response_model=DepartmentOut, status_code=status.HTTP_201_CREATED)
def create_department(
    payload: DepartmentCreate,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(["HRAdmin"])),
):
    department = Department(**payload.model_dump())
    db.add(department)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A department with this name already exists.")
    db.refresh(department)
    return department


@router.get("/departments", response_model=list[DepartmentOut])
def list_departments(db: Session = Depends(get_db), current_user: CurrentUser = Depends(get_current_user)):
    # Read-only reference data - fine for any logged-in role (form dropdowns need it too).
    return db.query(Department).order_by(Department.department_name).all()


@router.post("/designations", response_model=DesignationOut, status_code=status.HTTP_201_CREATED)
def create_designation(
    payload: DesignationCreate,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(["HRAdmin"])),
):
    if db.get(Department, payload.department_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Department not found")
    designation = Designation(**payload.model_dump())
    db.add(designation)
    db.commit()
    db.refresh(designation)
    return designation


@router.get("/designations", response_model=list[DesignationOut])
def list_designations(db: Session = Depends(get_db), current_user: CurrentUser = Depends(get_current_user)):
    return db.query(Designation).order_by(Designation.title).all()
