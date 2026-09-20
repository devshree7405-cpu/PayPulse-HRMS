from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import auth, attendance, employees, leave, payroll, performance, recruitment

app = FastAPI(
    title="PayPulse HRMS API",
    description="Payroll, attendance and performance management for HRAdmin, Manager and Employee roles.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(employees.router)
app.include_router(attendance.router)
app.include_router(leave.router)
app.include_router(payroll.router)
app.include_router(performance.router)
app.include_router(recruitment.router)


@app.get("/health", tags=["Health"])
def health_check():
    return {"status": "ok"}
