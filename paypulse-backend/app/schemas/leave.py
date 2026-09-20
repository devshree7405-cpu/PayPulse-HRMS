from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict, field_validator


class LeaveRequestCreate(BaseModel):
    leave_type_id: int
    start_date: date
    end_date: date
    reason: Optional[str] = None
    # Only meaningful when an HRAdmin/Manager files leave on someone
    # else's behalf; an Employee's own submissions ignore this and
    # always use their own id.
    employee_id: Optional[int] = None

    @field_validator("end_date")
    @classmethod
    def end_not_before_start(cls, end_date: date, info):
        start_date = info.data.get("start_date")
        if start_date and end_date < start_date:
            raise ValueError("end_date must be on or after start_date")
        return end_date


class LeaveRejectIn(BaseModel):
    manager_comments: Optional[str] = None


class LeaveRequestOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    leave_request_id: int
    employee_id: int
    leave_type_id: int
    start_date: date
    end_date: date
    no_of_days: Decimal
    reason: Optional[str] = None
    status: str
    applied_on: datetime
    approved_by: Optional[int] = None
    approved_on: Optional[datetime] = None
    manager_comments: Optional[str] = None


class LeaveBalanceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    employee_id: int
    leave_type_id: int
    year: int
    allocated: Decimal
    used: Decimal
    remaining: Decimal
