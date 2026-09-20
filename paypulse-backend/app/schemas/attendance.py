from datetime import date, time
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict


class AttendanceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    attendance_id: int
    employee_id: int
    attendance_date: date
    check_in_time: Optional[time] = None
    check_out_time: Optional[time] = None
    status: str
    hours_worked: Optional[Decimal] = None
    remarks: Optional[str] = None
