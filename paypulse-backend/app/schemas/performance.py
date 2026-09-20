from datetime import date
from decimal import Decimal
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict

Rating = Literal["Needs Improvement", "Meets Expectations", "Exceeds Expectations", "Outstanding"]


class ReviewCycleCreate(BaseModel):
    cycle_name: str
    start_date: date
    end_date: date
    status: Literal["Upcoming", "Active", "Closed"] = "Upcoming"


class ReviewCycleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    cycle_id: int
    cycle_name: str
    start_date: date
    end_date: date
    status: str


class GoalCreate(BaseModel):
    employee_id: int
    cycle_id: int
    description: str
    target: Optional[str] = None
    weightage: Optional[Decimal] = None


class GoalOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    goal_id: int
    employee_id: int
    cycle_id: int
    description: str
    target: Optional[str] = None
    weightage: Optional[Decimal] = None
    status: str


class ReviewSelfIn(BaseModel):
    self_rating: Rating
    self_comments: Optional[str] = None


class ReviewManagerIn(BaseModel):
    manager_rating: Rating
    manager_feedback: Optional[str] = None


class ReviewFinalizeIn(BaseModel):
    final_rating: Rating


class ReviewOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    review_id: int
    employee_id: int
    cycle_id: int
    reviewer_id: int
    self_rating: Optional[str] = None
    manager_rating: Optional[str] = None
    self_comments: Optional[str] = None
    manager_feedback: Optional[str] = None
    final_rating: Optional[str] = None
    status: str
