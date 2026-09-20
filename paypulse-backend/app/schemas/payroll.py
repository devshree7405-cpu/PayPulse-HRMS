from datetime import date, datetime
from decimal import Decimal
from typing import List

from pydantic import BaseModel, ConfigDict


class SalaryStructureLine(BaseModel):
    component_id: int
    amount: Decimal
    effective_from: date


class SalaryStructureIn(BaseModel):
    lines: List[SalaryStructureLine]


class SalaryStructureOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    structure_id: int
    employee_id: int
    component_id: int
    amount: Decimal
    effective_from: date


class PayslipDetailOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    component_id: int
    component_type: str
    amount: Decimal


class PayslipOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    payslip_id: int
    employee_id: int
    payslip_month: int
    payslip_year: int
    gross_pay: Decimal
    total_deductions: Decimal
    lop_days: Decimal
    lop_amount: Decimal
    net_pay: Decimal
    generated_on: datetime
    status: str
    details: List[PayslipDetailOut] = []
