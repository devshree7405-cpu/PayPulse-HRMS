from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import CurrentUser, get_current_user, require_role
from app.models import Employee, Goal, PerformanceReview, ReviewCycle
from app.schemas.performance import (
    GoalCreate,
    GoalOut,
    ReviewCycleCreate,
    ReviewCycleOut,
    ReviewFinalizeIn,
    ReviewManagerIn,
    ReviewOut,
    ReviewSelfIn,
)

router = APIRouter(prefix="/performance", tags=["Performance"])


@router.get("/cycles", response_model=list[ReviewCycleOut])
def list_cycles(
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    return db.query(ReviewCycle).order_by(ReviewCycle.start_date.desc()).all()


@router.get("/reviews/my-team", response_model=list[ReviewOut])
def list_my_team_reviews(
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(["Manager", "HRAdmin"])),
):
    """Returns all reviews where this manager is the assigned reviewer."""
    return (
        db.query(PerformanceReview)
        .filter(PerformanceReview.reviewer_id == current_user.employee_id)
        .order_by(PerformanceReview.cycle_id.desc())
        .all()
    )


@router.post("/cycles", response_model=ReviewCycleOut, status_code=status.HTTP_201_CREATED)
def create_cycle(
    payload: ReviewCycleCreate,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(["HRAdmin"])),
):
    cycle = ReviewCycle(**payload.model_dump())
    db.add(cycle)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A cycle with this name already exists")
    db.refresh(cycle)
    return cycle


@router.post("/goals", response_model=GoalOut, status_code=status.HTTP_201_CREATED)
def create_goal(
    payload: GoalCreate,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    target = db.get(Employee, payload.employee_id)
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")
    if db.get(ReviewCycle, payload.cycle_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Review cycle not found")

    is_self = current_user.employee_id == payload.employee_id
    is_their_manager = current_user.role == "Manager" and target.manager_id == current_user.employee_id
    if not (is_self or is_their_manager or current_user.role == "HRAdmin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="You can only add goals for yourself or a direct report"
        )

    goal = Goal(**payload.model_dump())
    db.add(goal)
    db.commit()
    db.refresh(goal)
    return goal


@router.post(
    "/reviews/{employee_id}/{cycle_id}", response_model=ReviewOut, status_code=status.HTTP_201_CREATED
)
def initialize_review(
    employee_id: int,
    cycle_id: int,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(["HRAdmin"])),
):
    employee = db.get(Employee, employee_id)
    if employee is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")
    if db.get(ReviewCycle, cycle_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Review cycle not found")

    # Same routing rule as leave approval: the employee's manager, or
    # (here) the initiating HRAdmin when there's no manager to assign.
    reviewer_id = employee.manager_id if employee.manager_id is not None else current_user.employee_id

    review = PerformanceReview(
        employee_id=employee_id, cycle_id=cycle_id, reviewer_id=reviewer_id, status="Draft"
    )
    db.add(review)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="A review already exists for this employee in this cycle"
        )
    db.refresh(review)
    return review


def _get_review_or_404(review_id: int, db: Session) -> PerformanceReview:
    review = db.get(PerformanceReview, review_id)
    if review is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Review not found")
    return review


@router.patch("/reviews/{review_id}/self", response_model=ReviewOut)
def submit_self_review(
    review_id: int,
    payload: ReviewSelfIn,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    review = _get_review_or_404(review_id, db)
    if current_user.employee_id != review.employee_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This isn't your review to fill in")

    review.self_rating = payload.self_rating
    review.self_comments = payload.self_comments
    review.status = "Submitted"
    db.commit()
    db.refresh(review)
    return review


@router.patch("/reviews/{review_id}/manager", response_model=ReviewOut)
def submit_manager_review(
    review_id: int,
    payload: ReviewManagerIn,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    review = _get_review_or_404(review_id, db)
    if current_user.employee_id != review.reviewer_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You are not the assigned reviewer")

    review.manager_rating = payload.manager_rating
    review.manager_feedback = payload.manager_feedback
    db.commit()
    db.refresh(review)
    return review


@router.patch("/reviews/{review_id}/finalize", response_model=ReviewOut)
def finalize_review(
    review_id: int,
    payload: ReviewFinalizeIn,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(["HRAdmin"])),
):
    review = _get_review_or_404(review_id, db)
    review.final_rating = payload.final_rating
    review.status = "Finalized"
    db.commit()
    db.refresh(review)
    return review
