-- ============================================================
-- HR MANAGEMENT SYSTEM — MySQL SCHEMA
-- ============================================================
-- Built module by module, matching the design agreed in planning.
-- MODULE 1: Foundation (Org structure + Identity + Auth)
-- ============================================================

CREATE DATABASE IF NOT EXISTS hr_system
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE hr_system;

-- ------------------------------------------------------------
-- DEPARTMENTS
-- head_employee_id is nullable and has NO foreign key yet —
-- employees doesn't exist until the next table. We link it
-- back with an ALTER TABLE at the end of this module.
-- ------------------------------------------------------------
CREATE TABLE departments (
    department_id      INT AUTO_INCREMENT PRIMARY KEY,
    department_name    VARCHAR(100) NOT NULL UNIQUE,
    head_employee_id   INT NULL,               -- FK added later, after employees exists
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- DESIGNATIONS
-- Depends only on departments, so this is safe to create now.
-- ------------------------------------------------------------
CREATE TABLE designations (
    designation_id   INT AUTO_INCREMENT PRIMARY KEY,
    title             VARCHAR(100) NOT NULL,
    department_id     INT NOT NULL,
    grade_level       VARCHAR(20) NULL,          -- e.g. 'L1', 'L2' — optional, keep simple for now
    FOREIGN KEY (department_id) REFERENCES departments(department_id)
        ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- EMPLOYEES
-- The spine of the whole system. manager_id is self-referencing
-- (an employee's manager is also a row in this same table).
-- Per our decision: single-level hierarchy for now — manager_id
-- is NULL for a Manager/top-of-chain (their leave routes to HRAdmin).
-- ------------------------------------------------------------
CREATE TABLE employees (
    employee_id             INT AUTO_INCREMENT PRIMARY KEY,
    employee_code           VARCHAR(20) NOT NULL UNIQUE,     -- e.g. EMP0101
    first_name              VARCHAR(50) NOT NULL,
    last_name               VARCHAR(50) NOT NULL,
    gender                  ENUM('Male','Female','Other') NULL,
    date_of_birth           DATE NULL,
    personal_email          VARCHAR(100) NOT NULL UNIQUE,
    phone                   VARCHAR(20) NULL,
    address                 VARCHAR(255) NULL,
    hire_date               DATE NOT NULL,
    employment_type         ENUM('Full-Time','Part-Time','Contract') NOT NULL DEFAULT 'Full-Time',
    employment_status       ENUM('Active','On Leave','Terminated') NOT NULL DEFAULT 'Active',
    department_id           INT NOT NULL,
    designation_id          INT NOT NULL,
    manager_id              INT NULL,           -- NULL = top of hierarchy (Manager reporting conceptually to CEO)
    emergency_contact_name  VARCHAR(100) NULL,
    emergency_contact_phone VARCHAR(20) NULL,
    profile_photo_url       VARCHAR(255) NULL,
    created_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    FOREIGN KEY (department_id)  REFERENCES departments(department_id)  ON UPDATE CASCADE ON DELETE RESTRICT,
    FOREIGN KEY (designation_id) REFERENCES designations(designation_id) ON UPDATE CASCADE ON DELETE RESTRICT,
    FOREIGN KEY (manager_id)     REFERENCES employees(employee_id)      ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB;

-- Now that employees exists, close the loop on departments.head_employee_id
ALTER TABLE departments
    ADD FOREIGN KEY (head_employee_id) REFERENCES employees(employee_id)
        ON UPDATE CASCADE ON DELETE SET NULL;

-- ------------------------------------------------------------
-- USERS (auth/login — separate from employees on purpose)
-- Role lives here, not on employees, because login/role is an
-- auth concern, not an HR-profile concern.
-- ------------------------------------------------------------
CREATE TABLE users (
    user_id        INT AUTO_INCREMENT PRIMARY KEY,
    employee_id    INT NOT NULL UNIQUE,          -- one login per employee
    email          VARCHAR(100) NOT NULL UNIQUE,
    password_hash  VARCHAR(255) NOT NULL,
    role           ENUM('HRAdmin','Manager','Employee') NOT NULL,
    is_active      BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at  TIMESTAMP NULL,
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    FOREIGN KEY (employee_id) REFERENCES employees(employee_id)
        ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- EMPLOYEE BANK DETAILS
-- Deliberately separate table (not columns on employees) so this
-- sensitive data can be restricted at the query/permission level
-- independently of the general employee profile.
-- account_number/pan_number should be application-layer encrypted
-- before insert — this column just stores the encrypted string.
-- ------------------------------------------------------------
CREATE TABLE employee_bank_details (
    employee_id     INT PRIMARY KEY,             -- 1:1 with employees
    bank_name       VARCHAR(100) NOT NULL,
    account_number  VARCHAR(255) NOT NULL,        -- store encrypted
    ifsc_code       VARCHAR(20) NOT NULL,
    pan_number      VARCHAR(255) NOT NULL,        -- store encrypted
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    FOREIGN KEY (employee_id) REFERENCES employees(employee_id)
        ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- SALARY HISTORY
-- Confirmed during the HRAdmin employee-profile discussion:
-- salary changes must be tracked, not just overwritten.
-- changed_by references the employee who made the change
-- (an HRAdmin is an employee too).
-- ------------------------------------------------------------
CREATE TABLE salary_history (
    salary_history_id  INT AUTO_INCREMENT PRIMARY KEY,
    employee_id         INT NOT NULL,
    old_amount           DECIMAL(12,2) NULL,       -- NULL for the very first salary record
    new_amount           DECIMAL(12,2) NOT NULL,
    reason               VARCHAR(255) NULL,        -- e.g. 'Annual increment', 'Promotion'
    changed_by           INT NOT NULL,              -- employee_id of the HRAdmin who made the change
    changed_on           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (employee_id) REFERENCES employees(employee_id) ON UPDATE CASCADE ON DELETE CASCADE,
    FOREIGN KEY (changed_by)  REFERENCES employees(employee_id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;


-- ============================================================
-- MODULE 2: ATTENDANCE + LEAVE
-- ============================================================

-- ------------------------------------------------------------
-- ATTENDANCE
-- UNIQUE(employee_id, attendance_date) guarantees one record
-- per employee per day at the database level — the app can't
-- accidentally create duplicates even if it has a bug.
-- ------------------------------------------------------------
CREATE TABLE attendance (
    attendance_id     INT AUTO_INCREMENT PRIMARY KEY,
    employee_id        INT NOT NULL,
    attendance_date    DATE NOT NULL,
    check_in_time      TIME NULL,
    check_out_time     TIME NULL,
    status              ENUM('Present','Absent','Half-Day','Work From Home','Late') NOT NULL DEFAULT 'Present',
    hours_worked        DECIMAL(4,2) NULL,
    remarks              VARCHAR(255) NULL,

    UNIQUE KEY uq_employee_date (employee_id, attendance_date),
    FOREIGN KEY (employee_id) REFERENCES employees(employee_id)
        ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- LEAVE TYPES
-- Lookup/master table, configured by HRAdmin (Settings module).
-- ------------------------------------------------------------
CREATE TABLE leave_types (
    leave_type_id          INT AUTO_INCREMENT PRIMARY KEY,
    leave_type_name         VARCHAR(50) NOT NULL UNIQUE,   -- e.g. 'Sick', 'Casual', 'Earned'
    max_days_per_year        INT NOT NULL,
    carry_forward_allowed    BOOLEAN NOT NULL DEFAULT FALSE
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- LEAVE BALANCES
-- Composite PK: one balance row per employee, per leave type,
-- per year. DECIMAL(4,1) allows half-day leaves — drop to INT
-- if you don't want that granularity.
-- ------------------------------------------------------------
CREATE TABLE leave_balances (
    employee_id     INT NOT NULL,
    leave_type_id    INT NOT NULL,
    year              YEAR NOT NULL,
    allocated          DECIMAL(4,1) NOT NULL,
    used               DECIMAL(4,1) NOT NULL DEFAULT 0,
    remaining          DECIMAL(4,1) NOT NULL,

    PRIMARY KEY (employee_id, leave_type_id, year),
    FOREIGN KEY (employee_id)   REFERENCES employees(employee_id)     ON UPDATE CASCADE ON DELETE CASCADE,
    FOREIGN KEY (leave_type_id) REFERENCES leave_types(leave_type_id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- LEAVE REQUESTS
-- approved_by is nullable (empty until acted on) and can point
-- to a manager OR an HRAdmin — matches our routing rule:
-- if employee.manager_id IS NOT NULL -> route to that manager,
-- else -> route to HRAdmin.
--
-- IMPORTANT — things the DATABASE CANNOT enforce, must be
-- handled in the Python backend:
--   1) Balance deduction happens only on approval (not on submit)
--   2) No overlapping pending/approved requests for the same employee
--   3) No back-dated requests (except possibly sick leave)
-- ------------------------------------------------------------
CREATE TABLE leave_requests (
    leave_request_id   INT AUTO_INCREMENT PRIMARY KEY,
    employee_id          INT NOT NULL,
    leave_type_id         INT NOT NULL,
    start_date             DATE NOT NULL,
    end_date               DATE NOT NULL,
    no_of_days             DECIMAL(4,1) NOT NULL,
    reason                  VARCHAR(255) NULL,
    status                  ENUM('Pending','Approved','Rejected','Cancelled') NOT NULL DEFAULT 'Pending',
    applied_on              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    approved_by             INT NULL,              -- employee_id of manager OR HRAdmin who acted on it
    approved_on             TIMESTAMP NULL,
    manager_comments        VARCHAR(255) NULL,

    FOREIGN KEY (employee_id)   REFERENCES employees(employee_id)     ON UPDATE CASCADE ON DELETE CASCADE,
    FOREIGN KEY (leave_type_id) REFERENCES leave_types(leave_type_id) ON UPDATE CASCADE ON DELETE RESTRICT,
    FOREIGN KEY (approved_by)   REFERENCES employees(employee_id)     ON UPDATE CASCADE ON DELETE SET NULL,
    CHECK (end_date >= start_date),

    INDEX idx_employee_status (employee_id, status)     -- speeds up "my requests" and "pending only" queries
) ENGINE=InnoDB;


-- ============================================================
-- MODULE 3: PAYROLL
-- Reminder: Manager has NO access to this module at all — only
-- HRAdmin (full control) and Employee (read-only, own payslips).
-- ============================================================

-- ------------------------------------------------------------
-- SALARY COMPONENTS
-- Lookup table: Basic, HRA, Conveyance, PF, Tax, etc.
-- HRAdmin configures these once; employees never touch this table.
-- ------------------------------------------------------------
CREATE TABLE salary_components (
    component_id     INT AUTO_INCREMENT PRIMARY KEY,
    component_name    VARCHAR(50) NOT NULL UNIQUE,
    component_type     ENUM('Earning','Deduction') NOT NULL
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- EMPLOYEE SALARY STRUCTURE
-- Which components apply to which employee, and the amount.
-- effective_from lets HRAdmin schedule/track changes over time
-- without overwriting old rows (same philosophy as salary_history).
-- ------------------------------------------------------------
CREATE TABLE employee_salary_structure (
    structure_id       INT AUTO_INCREMENT PRIMARY KEY,
    employee_id          INT NOT NULL,
    component_id          INT NOT NULL,
    amount                  DECIMAL(12,2) NOT NULL,
    effective_from          DATE NOT NULL,

    FOREIGN KEY (employee_id)  REFERENCES employees(employee_id)         ON UPDATE CASCADE ON DELETE CASCADE,
    FOREIGN KEY (component_id) REFERENCES salary_components(component_id) ON UPDATE CASCADE ON DELETE RESTRICT,
    UNIQUE KEY uq_emp_component_effective (employee_id, component_id, effective_from)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- PAYSLIPS
-- One row per employee per month. UNIQUE(employee_id, month, year)
-- stops the app from ever generating a payslip twice for the
-- same person in the same month.
-- ------------------------------------------------------------
CREATE TABLE payslips (
    payslip_id         INT AUTO_INCREMENT PRIMARY KEY,
    employee_id           INT NOT NULL,
    payslip_month           TINYINT NOT NULL,
    payslip_year             YEAR NOT NULL,
    gross_pay                 DECIMAL(12,2) NOT NULL,
    total_deductions           DECIMAL(12,2) NOT NULL,
    net_pay                     DECIMAL(12,2) NOT NULL,
    generated_on                 TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status                        ENUM('Draft','Finalized','Paid') NOT NULL DEFAULT 'Draft',

    FOREIGN KEY (employee_id) REFERENCES employees(employee_id) ON UPDATE CASCADE ON DELETE CASCADE,
    UNIQUE KEY uq_employee_month_year (employee_id, payslip_month, payslip_year),
    CHECK (payslip_month BETWEEN 1 AND 12)
) ENGINE=InnoDB;


-- ============================================================
-- MODULE 4: PERFORMANCE REVIEWS
-- Reviewer routing follows the SAME rule as leave approval:
-- reviewer_id = employee.manager_id, or HRAdmin if that's NULL.
-- Rating values match what we already showed on the Employee
-- dashboard mockup ("Exceeds expectations").
-- ============================================================

-- ------------------------------------------------------------
-- REVIEW CYCLES
-- HRAdmin creates/manages these (e.g. 'H1 2026').
-- ------------------------------------------------------------
CREATE TABLE review_cycles (
    cycle_id      INT AUTO_INCREMENT PRIMARY KEY,
    cycle_name      VARCHAR(50) NOT NULL UNIQUE,
    start_date        DATE NOT NULL,
    end_date            DATE NOT NULL,
    status                ENUM('Upcoming','Active','Closed') NOT NULL DEFAULT 'Upcoming',

    CHECK (end_date >= start_date)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- GOALS / KRAs
-- Multiple goals per employee per cycle — no uniqueness
-- restriction needed here, unlike performance_reviews below.
-- ------------------------------------------------------------
CREATE TABLE goals (
    goal_id        INT AUTO_INCREMENT PRIMARY KEY,
    employee_id      INT NOT NULL,
    cycle_id           INT NOT NULL,
    description           VARCHAR(255) NOT NULL,
    target                  VARCHAR(255) NULL,
    weightage                 DECIMAL(5,2) NULL,     -- % weight of this goal within the cycle
    status                       ENUM('Not Started','In Progress','Completed') NOT NULL DEFAULT 'Not Started',

    FOREIGN KEY (employee_id) REFERENCES employees(employee_id)     ON UPDATE CASCADE ON DELETE CASCADE,
    FOREIGN KEY (cycle_id)    REFERENCES review_cycles(cycle_id)    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- PERFORMANCE REVIEWS
-- One row per employee per cycle — UNIQUE(employee_id, cycle_id).
-- self_rating/manager_rating filled at different stages; status
-- tracks progress: Draft (self-review in progress) -> Submitted
-- (waiting on manager) -> Finalized (HRAdmin locked it in).
-- ------------------------------------------------------------
CREATE TABLE performance_reviews (
    review_id  INT AUTO_INCREMENT PRIMARY KEY,
    employee_id  INT NOT NULL,
    cycle_id   INT NOT NULL,
    reviewer_id  INT NOT NULL,   -- manager, OR HRAdmin if employee.manager_id IS NULL
    self_rating   ENUM('Needs Improvement','Meets Expectations','Exceeds Expectations','Outstanding') NULL,
    manager_rating  ENUM('Needs Improvement','Meets Expectations','Exceeds Expectations','Outstanding') NULL,
    self_comments   TEXT NULL,
    manager_feedback  TEXT NULL,
    final_rating    ENUM('Needs Improvement','Meets Expectations','Exceeds Expectations','Outstanding') NULL,
    status     ENUM('Draft','Submitted','Finalized') NOT NULL DEFAULT 'Draft',

    FOREIGN KEY (employee_id) REFERENCES employees(employee_id)  ON UPDATE CASCADE ON DELETE CASCADE,
    FOREIGN KEY (cycle_id)    REFERENCES review_cycles(cycle_id) ON UPDATE CASCADE ON DELETE CASCADE,
    FOREIGN KEY (reviewer_id) REFERENCES employees(employee_id)  ON UPDATE CASCADE ON DELETE RESTRICT,
    UNIQUE KEY uq_employee_cycle (employee_id, cycle_id)
) ENGINE=InnoDB;


-- ============================================================
-- MODULE 5: RECRUITMENT / ONBOARDING
-- Mostly HRAdmin territory; Manager only participates as an
-- interviewer for their own team's openings (per earlier access matrix).
-- ============================================================

-- ------------------------------------------------------------
-- JOB OPENINGS
-- ------------------------------------------------------------
CREATE TABLE job_openings (
    job_id           INT AUTO_INCREMENT PRIMARY KEY,
    title               VARCHAR(100) NOT NULL,
    department_id          INT NOT NULL,
    description               TEXT NULL,
    positions_count             INT NOT NULL DEFAULT 1,
    status                        ENUM('Open','Closed') NOT NULL DEFAULT 'Open',
    posted_by                       INT NOT NULL,          -- employee_id, typically HRAdmin
    posted_on                          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (department_id) REFERENCES departments(department_id) ON UPDATE CASCADE ON DELETE RESTRICT,
    FOREIGN KEY (posted_by)     REFERENCES employees(employee_id)     ON UPDATE CASCADE ON DELETE RESTRICT,
    CHECK (positions_count > 0)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- CANDIDATES
-- converted_employee_id is set once a Hired candidate is
-- onboarded as an actual employee record (see note above).
-- ------------------------------------------------------------
CREATE TABLE candidates (
    candidate_id         INT AUTO_INCREMENT PRIMARY KEY,
    candidate_name          VARCHAR(100) NOT NULL,
    email                       VARCHAR(100) NOT NULL,
    phone                         VARCHAR(20) NULL,
    resume_url                       VARCHAR(255) NULL,
    applied_job_id                     INT NOT NULL,
    status                                ENUM('Applied','Screening','Interview','Offered','Hired','Rejected') NOT NULL DEFAULT 'Applied',
    source                                  VARCHAR(50) NULL,        -- e.g. 'LinkedIn', 'Referral', 'Job portal'
    converted_employee_id                      INT NULL,

    FOREIGN KEY (applied_job_id)        REFERENCES job_openings(job_id)   ON UPDATE CASCADE ON DELETE RESTRICT,
    FOREIGN KEY (converted_employee_id) REFERENCES employees(employee_id) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- INTERVIEWS
-- rating: DECIMAL(3,1) out of 5 — flagged as an assumption,
-- no scale was specified for this one originally.
-- ------------------------------------------------------------
CREATE TABLE interviews (
    interview_id        INT AUTO_INCREMENT PRIMARY KEY,
    candidate_id            INT NOT NULL,
    interviewer_id             INT NOT NULL,
    scheduled_on                  DATETIME NOT NULL,
    feedback                        TEXT NULL,
    rating                             DECIMAL(3,1) NULL,

    FOREIGN KEY (candidate_id)   REFERENCES candidates(candidate_id) ON UPDATE CASCADE ON DELETE CASCADE,
    FOREIGN KEY (interviewer_id) REFERENCES employees(employee_id)   ON UPDATE CASCADE ON DELETE RESTRICT,
    CHECK (rating IS NULL OR (rating BETWEEN 0 AND 5))
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- ONBOARDING TASKS
-- employee_id = the new hire; assigned_to = whoever must
-- complete the task (HRAdmin, IT, manager, etc.)
-- ------------------------------------------------------------
CREATE TABLE onboarding_tasks (
    onboarding_id        INT AUTO_INCREMENT PRIMARY KEY,
    employee_id              INT NOT NULL,
    task_name                   VARCHAR(100) NOT NULL,
    assigned_to                    INT NOT NULL,
    due_date                          DATE NULL,
    status                               ENUM('Pending','In Progress','Completed') NOT NULL DEFAULT 'Pending',

    FOREIGN KEY (employee_id) REFERENCES employees(employee_id) ON UPDATE CASCADE ON DELETE CASCADE,
    FOREIGN KEY (assigned_to) REFERENCES employees(employee_id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

USE hr_system;
INSERT INTO departments (department_name) VALUES ('HR');
INSERT INTO designations (title, department_id)
VALUES ('HR Director', LAST_INSERT_ID());

SELECT * FROM departments;
SELECT * FROM designations;

USE hr_system;
INSERT INTO employees (
    employee_code, first_name, last_name, personal_email,
    hire_date, department_id, designation_id, base_salary
) VALUES (
    'EMP0001', 'Devshree', 'Dhande', 'hRAdmin678@gmail.com',
    CURDATE(), 1, 1, 0
);
delete from employees Where employee_code='EMP0001';
SELECT * FROM employees;


INSERT INTO users (employee_id, email, password_hash, role)
VALUES (4, 'hRAdmin678@gmail.com', '$2b$12$.6SpyTbdxfZX0UNifVYP9e6BW9JrI3s.ckcsE49ETuoj3AvOyZCIW', 'HRAdmin');

SELECT * FROM users;

USE hr_system;

INSERT INTO leave_types (leave_type_name, max_days_per_year, carry_forward_allowed)
VALUES ('Casual', 12, FALSE);

INSERT INTO leave_balances (employee_id, leave_type_id, year, allocated, used, remaining)
VALUES (4, LAST_INSERT_ID(), 2026, 12, 0, 12);

SELECT * FROM leave_types;
SELECT * FROM leave_balances;
USE hr_system;
INSERT INTO salary_components (component_name, component_type) VALUES
('Basic', 'Earning'),
('HRA', 'Earning'),
('Provident Fund', 'Deduction');

SELECT * FROM salary_components;
SELECT email, role, employee_id FROM users;
SELECT * FROM users;

UPDATE users
SET password_hash = '$2b$12$8n5vpWvSBf8eZYlKPpFeseqCCy8B7yNHwfQMN2R0MxyjLk7UwLs56' -- paypulse123
WHERE email = 'hRAdmin678@gmail.com';

SELECT * FROM departments;
SELECT * FROM designations;

INSERT INTO employees (
    employee_code, first_name, last_name, personal_email,
    hire_date, department_id, designation_id, base_salary
) VALUES (
    'EMP00011', 'Shreya', 'Kulkarni', 'shreya678@gmail.com',
    CURDATE(), 1, 1, 0
);
SELECT * FROM employees;

INSERT INTO employees (employee_code, first_name, last_name, personal_email, hire_date, employment_type, employment_status, base_salary, department_id, designation_id, manager_id)
VALUES ('EMP000101', 'Rohan', 'Verma', 'rohan123@paypulse.com', CURDATE(), 'Full-Time', 'Active', 35000, 2, 2, 6);

SELECT employee_id FROM employees WHERE personal_email = 'rohan123@paypulse.com';

INSERT INTO users (employee_id, email, password_hash, role, is_active)
VALUES (6, 'shreya678@gmail.com', '$2b$12$8n5vpWvSBf8eZYlKPpFeseqCCy8B7yNHwfQMN2R0MxyjLk7UwLs56', 'Manager', 1);

INSERT INTO users (employee_id, email, password_hash, role, is_active)
VALUES (7, 'rohan123@paypulse.com', '$2b$12$8n5vpWvSBf8eZYlKPpFeseqCCy8B7yNHwfQMN2R0MxyjLk7UwLs56', 'Employee', 1);