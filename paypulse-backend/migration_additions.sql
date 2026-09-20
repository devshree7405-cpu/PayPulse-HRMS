-- ============================================================
-- PAYPULSE — SCHEMA ADDITIONS
-- Run this AFTER PayPulse.sql. It only ADDS columns/tables —
-- nothing in your original file is changed or removed.
--
-- WHY THESE ARE NEEDED (gaps between the SQL and the API spec):
--
-- 1) `employees` has no `base_salary`. But the spec says PATCH
--    /employees/{id} must snapshot "base salary" changes into
--    salary_history, and payroll's LOP formula needs a single
--    "Base Salary" figure (Daily Rate = Base Salary / days in
--    month). employee_salary_structure is a component-by-
--    component breakdown (Basic, HRA, PF...), not one number —
--    so it can't serve that role on its own.
--
-- 2) `payslip_details` (the itemized per-component breakdown the
--    spec says to insert alongside the `payslips` master row)
--    was never defined.
--
-- 3) `leave_types` has no way to say a leave type is unpaid, but
--    the LOP formula needs "Unpaid Leaves" as an input. Added
--    `is_paid` so specific types (e.g. an "Unpaid" leave type)
--    can be excluded from pay.
--
-- 4) `payslips` stores gross/deductions/net but not the LOP
--    figures that produced them — added for auditability so a
--    payslip is self-explanatory without recomputing.
--
-- 5) `job_openings` has no designation, so the automated hire
--    flow (candidate -> employee) has nothing to set
--    employees.designation_id from. Added as nullable so it can
--    still be supplied manually at hire time if left unset.
-- ============================================================

USE hr_system;

ALTER TABLE employees
    ADD COLUMN base_salary DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER employment_status;

ALTER TABLE leave_types
    ADD COLUMN is_paid BOOLEAN NOT NULL DEFAULT TRUE AFTER carry_forward_allowed;

ALTER TABLE payslips
    ADD COLUMN lop_days   DECIMAL(4,1)  NOT NULL DEFAULT 0 AFTER total_deductions,
    ADD COLUMN lop_amount DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER lop_days;

ALTER TABLE job_openings
    ADD COLUMN designation_id INT NULL AFTER department_id,
    ADD FOREIGN KEY (designation_id) REFERENCES designations(designation_id)
        ON UPDATE CASCADE ON DELETE SET NULL;

CREATE TABLE payslip_details (
    payslip_detail_id  INT AUTO_INCREMENT PRIMARY KEY,
    payslip_id          INT NOT NULL,
    component_id          INT NOT NULL,
    component_type           ENUM('Earning','Deduction') NOT NULL,  -- denormalized snapshot: protects
    amount                      DECIMAL(12,2) NOT NULL,             -- history if the component is edited later

    FOREIGN KEY (payslip_id)   REFERENCES payslips(payslip_id)             ON UPDATE CASCADE ON DELETE CASCADE,
    FOREIGN KEY (component_id) REFERENCES salary_components(component_id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;
