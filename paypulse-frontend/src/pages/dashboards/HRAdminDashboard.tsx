import {
  Bell, Briefcase, Building2, CheckCircle, ChevronDown,
  Clock3, FileText, LayoutDashboard, LogOut, Menu, Plane, Plus,
  ReceiptText, Save, Settings, Star, UserRound, Users, UserPlus,
  Wallet, X, XCircle,
} from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { api, extractErrorMessage } from "../../lib/api";

type Page =
  | "overview" | "attendance" | "leave" | "payslips" | "profile"
  | "employees" | "org-structure" | "payroll" | "performance"
  | "recruitment" | "leave-approvals";

type Employee = {
  employee_id: number; employee_code: string; first_name: string; last_name: string;
  gender: string | null; date_of_birth: string | null;
  personal_email: string; phone: string | null; address: string | null; hire_date: string;
  employment_type: string; employment_status: string; base_salary: number;
  department_id: number; designation_id: number; manager_id: number | null;
  emergency_contact_name: string | null; emergency_contact_phone: string | null;
};
type Department = { department_id: number; department_name: string; head_employee_id: number | null };
type Designation = { designation_id: number; title: string; department_id: number; grade_level: string | null };
type Attendance = {
  attendance_id: number; attendance_date: string; check_in_time: string | null;
  check_out_time: string | null; status: string; hours_worked: number | null;
};
type LeaveType = { leave_type_id: number; leave_type_name: string; max_days_per_year: number };
type LeaveBalance = { leave_type_id: number; allocated: number; used: number; remaining: number };
type LeaveRequest = {
  leave_request_id: number; leave_type_id: number; start_date: string; end_date: string;
  no_of_days: number; reason: string | null; status: string; applied_on: string; employee_id: number;
};
type Payslip = {
  payslip_id: number; payslip_month: number; payslip_year: number; gross_pay: number;
  total_deductions: number; net_pay: number; lop_days: number; lop_amount: number; status: string;
  details: { component_id: number; component_type: string; amount: number }[];
};
type ReviewCycle = { cycle_id: number; cycle_name: string; start_date: string; end_date: string; status: string };
type PerformanceReview = {
  review_id: number; employee_id: number; cycle_id: number; reviewer_id: number;
  self_rating: string | null; manager_rating: string | null;
  self_comments: string | null; manager_feedback: string | null;
  final_rating: string | null; status: string;
};
type SalaryComponent = { component_id: number; component_name: string; component_type: "Earning" | "Deduction" };
type SalaryStructureRow = { structure_id: number; employee_id: number; component_id: number; amount: number; effective_from: string };
type JobOpening = {
  job_id: number; title: string; department_id: number; designation_id: number | null;
  description: string | null; positions_count: number; status: string; posted_by: number; posted_on: string;
};
type Candidate = {
  candidate_id: number; candidate_name: string; email: string; phone: string | null;
  resume_url: string | null; applied_job_id: number; status: string; source: string | null;
  converted_employee_id: number | null;
};
type OnboardingTask = {
  onboarding_id: number; employee_id: number; task_name: string; assigned_to: number;
  due_date: string | null; status: string;
};

const RATING_OPTIONS = ["Needs Improvement", "Meets Expectations", "Exceeds Expectations", "Outstanding"] as const;
const CANDIDATE_STATUSES = ["Applied", "Screening", "Interview", "Offered", "Hired", "Rejected"] as const;

const navigation: { page: Page; label: string; icon: typeof LayoutDashboard; section?: string }[] = [
  { page: "overview", label: "Overview", icon: LayoutDashboard },
  { page: "attendance", label: "My attendance", icon: Clock3 },
  { page: "leave", label: "My leave", icon: Plane },
  { page: "payslips", label: "My payslips", icon: ReceiptText },
  { page: "profile", label: "My profile", icon: UserRound },
  { page: "employees", label: "Employee directory", icon: Users, section: "HR Admin" },
  { page: "org-structure", label: "Org structure", icon: Building2, section: "HR Admin" },
  { page: "payroll", label: "Payroll", icon: Wallet, section: "HR Admin" },
  { page: "performance", label: "Performance reviews", icon: Star, section: "HR Admin" },
  { page: "recruitment", label: "Recruitment", icon: Briefcase, section: "HR Admin" },
  { page: "leave-approvals", label: "Leave approvals", icon: CheckCircle, section: "HR Admin" },
];
const pageTitles: Record<Page, string> = {
  overview: "Overview", attendance: "My attendance", leave: "My leave",
  payslips: "My payslips", profile: "My profile",
  employees: "Employee directory", "org-structure": "Org structure",
  payroll: "Payroll", performance: "Performance reviews",
  recruitment: "Recruitment", "leave-approvals": "Leave approvals",
};

const monthName = new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric" });
const money = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

function initials(e: Employee | null) { return e ? `${e.first_name[0]}${e.last_name[0]}`.toUpperCase() : "H"; }
function fullName(e: Employee) { return `${e.first_name} ${e.last_name}`; }
function formatDate(v: string) {
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${v}T00:00:00`));
}
function formatTime(v: string | null) {
  return v ? new Date(`1970-01-01T${v}`).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—";
}
function statusStyle(s: string) {
  return s === "Approved" || s === "Present" || s === "Active" || s === "Open" || s === "Hired" || s === "Finalized"
    ? "bg-emerald-50 text-emerald-700"
    : s === "Pending" || s === "Screening" || s === "Interview" || s === "Draft" || s === "Upcoming"
    ? "bg-amber-50 text-amber-700"
    : s === "Rejected" || s === "Absent" || s === "Terminated" || s === "Closed"
    ? "bg-rose-50 text-rose-700"
    : "bg-brand-50 text-brand-700";
}
function ratingColor(r: string | null) {
  if (!r) return "bg-slate-50 text-slate-500";
  if (r === "Outstanding") return "bg-emerald-50 text-emerald-700";
  if (r === "Exceeds Expectations") return "bg-brand-50 text-brand-700";
  if (r === "Meets Expectations") return "bg-amber-50 text-amber-700";
  return "bg-rose-50 text-rose-700";
}

function BrandMark() {
  return (
    <div className="grid h-9 w-9 place-items-center rounded-xl bg-brand-500 shadow-[0_6px_14px_rgba(79,95,224,0.28)]">
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-white" strokeWidth="2.7">
        <path d="M5 16.5 9.2 12l3 2.7L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M15.7 7.5H19v3.3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <article className={`rounded-2xl border border-slate-100 bg-white p-5 shadow-[0_8px_28px_rgba(26,44,92,0.05)] sm:p-6 ${className}`}>
      {children}
    </article>
  );
}
function Modal({ children, onClose, wide = false }: { children: ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 py-10">
      <div className={`w-full ${wide ? "max-w-2xl" : "max-w-md"} rounded-2xl bg-white p-6 shadow-xl`}>
        {children}
      </div>
      <button className="fixed inset-0 -z-10" aria-label="Close" onClick={onClose} />
    </div>
  );
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block text-sm font-semibold text-slate-600">{label}{children}</label>;
}
const inputClass = "mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal text-sm outline-none focus:border-brand-400 focus:ring-3 focus:ring-brand-50";

export default function HRAdminDashboard() {
  const { session, logout } = useAuth();
  const navigate = useNavigate();
  const [activePage, setActivePage] = useState<Page>("overview");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const [me, setMe] = useState<Employee | null>(null);
  const [myAttendance, setMyAttendance] = useState<Attendance[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [myBalances, setMyBalances] = useState<LeaveBalance[]>([]);
  const [myRequests, setMyRequests] = useState<LeaveRequest[]>([]);
  const [myPayslips, setMyPayslips] = useState<Payslip[]>([]);

  const [allEmployees, setAllEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [cycles, setCycles] = useState<ReviewCycle[]>([]);
  const [unassignedLeave, setUnassignedLeave] = useState<LeaveRequest[]>([]);
  const [components, setComponents] = useState<SalaryComponent[]>([]);
  const [jobs, setJobs] = useState<JobOpening[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);

  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  const load = async () => {
    if (!session) return;
    try {
      setLoading(true);
      const id = session.employeeId;
      const year = new Date().getFullYear();

      const results = await Promise.allSettled([
        api.get<Employee>(`/employees/${id}`),
        api.get<Attendance[]>(`/attendance/${id}`),
        api.get<LeaveType[]>("/leave/types"),
        api.get<LeaveBalance[]>(`/leave/balance/${id}?year=${year}`),
        api.get<LeaveRequest[]>(`/leave/requests/${id}`),
        api.get<Payslip[]>(`/payroll/payslip/${id}`),
        api.get<Employee[]>("/employees"),
        api.get<Department[]>("/departments"),
        api.get<Designation[]>("/designations"),
        api.get<ReviewCycle[]>("/performance/cycles"),
        api.get<LeaveRequest[]>("/leave/requests/unassigned"),
        api.get<SalaryComponent[]>("/payroll/components"),
        api.get<JobOpening[]>("/jobs"),
        api.get<Candidate[]>("/candidates"),
      ]);
      const [
        meRes, attRes, typesRes, balRes, reqRes, payRes, empRes, deptRes,
        desigRes, cyclesRes, unassignedRes, compRes, jobsRes, candRes,
      ] = results;

      if (meRes.status === "fulfilled") setMe(meRes.value.data);
      if (attRes.status === "fulfilled") setMyAttendance(attRes.value.data);
      if (typesRes.status === "fulfilled") setLeaveTypes(typesRes.value.data);
      if (balRes.status === "fulfilled") setMyBalances(balRes.value.data);
      if (reqRes.status === "fulfilled") setMyRequests(reqRes.value.data);
      if (payRes.status === "fulfilled") setMyPayslips(payRes.value.data);
      if (empRes.status === "fulfilled") setAllEmployees(empRes.value.data);
      if (deptRes.status === "fulfilled") setDepartments(deptRes.value.data);
      if (desigRes.status === "fulfilled") setDesignations(desigRes.value.data);
      if (cyclesRes.status === "fulfilled") setCycles(cyclesRes.value.data);
      if (unassignedRes.status === "fulfilled") setUnassignedLeave(unassignedRes.value.data);
      if (compRes.status === "fulfilled") setComponents(compRes.value.data);
      if (jobsRes.status === "fulfilled") setJobs(jobsRes.value.data);
      if (candRes.status === "fulfilled") setCandidates(candRes.value.data);

      const failed = results.find((r) => r.status === "rejected") as PromiseRejectedResult | undefined;
      if (failed) setNotice(extractErrorMessage(failed.reason, "Some dashboard data could not be loaded."));
    } catch (err) {
      setNotice(extractErrorMessage(err, "Could not load dashboard data."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [session]);

  const today = new Date().toISOString().slice(0, 10);
  const todayAtt = myAttendance.find((a) => a.attendance_date === today);
  const checkedIn = Boolean(todayAtt?.check_in_time && !todayAtt?.check_out_time);
  const myNameStr = me ? `${me.first_name} ${me.last_name}` : "HR Admin";

  const selectPage = (page: Page) => { setActivePage(page); setMobileNavOpen(false); };

  const doAttendance = async () => {
    try {
      setActionLoading(true);
      await api.post(checkedIn ? "/attendance/checkout" : "/attendance/checkin");
      setNotice(checkedIn ? "Checked out for today." : "Checked in. Have a great day!");
    } catch (err) {
      setNotice(extractErrorMessage(err, "Attendance could not be updated."));
    } finally {
      await load();
      setActionLoading(false);
    }
  };

  const doLogout = () => { logout(); navigate("/login", { replace: true }); };

  const pendingUnassignedLeave = unassignedLeave.filter((r) => r.status === "Pending");
  const employeeById = (id: number) => allEmployees.find((e) => e.employee_id === id);
  const departmentById = (id: number) => departments.find((d) => d.department_id === id);
  const designationById = (id: number) => designations.find((d) => d.designation_id === id);

  const sidebar = (
    <aside className="flex h-full w-64 flex-col border-r border-slate-200/80 bg-white px-4 py-6">
      <div className="flex items-center gap-3 px-3">
        <BrandMark />
        <span className="text-lg font-bold tracking-tight text-slate-900">PayPulse</span>
      </div>
      <p className="mt-10 px-3 text-[11px] font-bold uppercase tracking-[0.13em] text-slate-400">HR portal</p>
      <nav className="mt-3 space-y-1 overflow-y-auto" aria-label="HR Admin navigation">
        {navigation.map(({ page, label, icon: Icon, section }, idx) => {
          const prevSection = idx > 0 ? navigation[idx - 1].section : undefined;
          return (
            <div key={page}>
              {section && section !== prevSection && (
                <p className="mt-5 px-3 text-[11px] font-bold uppercase tracking-[0.13em] text-slate-400">{section}</p>
              )}
              <button
                onClick={() => selectPage(page)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition ${
                  activePage === page ? "bg-brand-50 text-brand-600" : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                }`}
              >
                <Icon size={18} strokeWidth={activePage === page ? 2.4 : 2} />
                {label}
                {page === "leave-approvals" && pendingUnassignedLeave.length > 0 && (
                  <span className="ml-auto rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">
                    {pendingUnassignedLeave.length}
                  </span>
                )}
              </button>
            </div>
          );
        })}
      </nav>
      <div className="mt-auto space-y-1 border-t border-slate-100 pt-5">
        <button className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-500 hover:bg-slate-50">
          <Settings size={18} /> Settings
        </button>
        <button onClick={doLogout} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-rose-500 hover:bg-rose-50">
          <LogOut size={18} /> Log out
        </button>
      </div>
    </aside>
  );

  if (loading)
    return (
      <div className="grid min-h-screen place-items-center bg-[#f7f8fc]">
        <div className="text-center">
          <div className="mx-auto h-9 w-9 animate-spin rounded-full border-4 border-brand-100 border-t-brand-500" />
          <p className="mt-4 text-sm font-medium text-slate-500">Loading your workspace…</p>
        </div>
      </div>
    );

  return (
    <div className="min-h-screen bg-[#f7f8fc] font-sans text-slate-900">
      {mobileNavOpen && (
        <button className="fixed inset-0 z-30 bg-slate-900/30 lg:hidden" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)} />
      )}
      <div className={`fixed inset-y-0 left-0 z-40 transition-transform lg:translate-x-0 ${mobileNavOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <button onClick={() => setMobileNavOpen(false)} className="absolute right-3 top-4 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 lg:hidden" aria-label="Close navigation">
          <X size={20} />
        </button>
        {sidebar}
      </div>
      <main className="lg:ml-64">
        <header className="flex h-[76px] items-center justify-between border-b border-slate-200/80 bg-white px-5 sm:px-8">
          <div className="flex items-center gap-3">
            <button onClick={() => setMobileNavOpen(true)} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden" aria-label="Open navigation">
              <Menu size={21} />
            </button>
            <div>
              <p className="text-xs font-medium text-slate-400">
                {new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date())}
              </p>
              <p className="mt-0.5 text-sm font-semibold text-slate-700">{pageTitles[activePage]}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 sm:gap-5">
            <button className="relative rounded-full p-2 text-slate-500 hover:bg-slate-100" aria-label="Notifications">
              <Bell size={20} />
              {pendingUnassignedLeave.length > 0 && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full border-2 border-white bg-rose-500" />}
            </button>
            <div className="hidden h-8 w-px bg-slate-200 sm:block" />
            <button onClick={() => selectPage("profile")} className="flex items-center gap-2 text-left">
              <div className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-[#a9c8ff] to-[#607bf0] text-sm font-bold text-white">
                {initials(me)}
              </div>
              <div className="hidden sm:block">
                <p className="text-sm font-semibold text-slate-700">{myNameStr}</p>
                <p className="text-xs text-slate-400">{me?.employee_code}</p>
              </div>
              <ChevronDown className="hidden text-slate-400 sm:block" size={16} />
            </button>
          </div>
        </header>

        <div className="mx-auto max-w-[1440px] p-5 sm:p-8 lg:p-10">
          {notice && (
            <div className="mb-6 flex items-center justify-between gap-3 rounded-xl border border-brand-100 bg-brand-50 px-4 py-3 text-sm font-medium text-brand-700">
              <span>{notice}</span>
              <button onClick={() => setNotice("")} aria-label="Dismiss">×</button>
            </div>
          )}
          {activePage === "overview" && (
            <OverviewPage
              me={me} checkedIn={checkedIn} myAttendance={myAttendance}
              allEmployees={allEmployees} departments={departments} jobs={jobs}
              pendingUnassignedLeave={pendingUnassignedLeave}
              actionLoading={actionLoading} onAttendance={doAttendance} onNavigate={selectPage}
            />
          )}
          {activePage === "attendance" && (
            <AttendancePage records={myAttendance} checkedIn={checkedIn} actionLoading={actionLoading} onAttendance={doAttendance} />
          )}
          {activePage === "leave" && (
            <LeavePage types={leaveTypes} balances={myBalances} requests={myRequests} onSubmitted={load} onNotice={setNotice} />
          )}
          {activePage === "payslips" && <PayslipsPage payslips={myPayslips} />}
          {activePage === "profile" && me && (
            <ProfilePage employee={me} onSaved={(next) => { setMe(next); setNotice("Profile updated."); }} onNotice={setNotice} />
          )}
          {activePage === "employees" && (
            <EmployeeDirectoryPage
              employees={allEmployees} departments={departments} designations={designations}
              departmentById={departmentById} designationById={designationById}
              onRefresh={load} onNotice={setNotice}
            />
          )}
          {activePage === "org-structure" && (
            <OrgStructurePage departments={departments} designations={designations} onRefresh={load} onNotice={setNotice} />
          )}
          {activePage === "payroll" && (
            <PayrollPage employees={allEmployees} components={components} onNotice={setNotice} />
          )}
          {activePage === "performance" && (
            <PerformancePage
              employees={allEmployees} cycles={cycles} employeeById={employeeById}
              onRefresh={load} onNotice={setNotice}
            />
          )}
          {activePage === "recruitment" && (
            <RecruitmentPage
              jobs={jobs} candidates={candidates} departments={departments} designations={designations}
              employees={allEmployees} onRefresh={load} onNotice={setNotice}
            />
          )}
          {activePage === "leave-approvals" && (
            <LeaveApprovalsPage
              requests={unassignedLeave} leaveTypes={leaveTypes} employeeById={employeeById}
              onRefresh={load} onNotice={setNotice}
            />
          )}
        </div>
      </main>
    </div>
  );
}

// ─── Overview ────────────────────────────────────────────────────────────────
function OverviewPage({
  me, checkedIn, myAttendance, allEmployees, departments, jobs,
  pendingUnassignedLeave, actionLoading, onAttendance, onNavigate,
}: {
  me: Employee | null; checkedIn: boolean; myAttendance: Attendance[];
  allEmployees: Employee[]; departments: Department[]; jobs: JobOpening[];
  pendingUnassignedLeave: LeaveRequest[];
  actionLoading: boolean; onAttendance: () => void; onNavigate: (p: Page) => void;
}) {
  const firstName = me?.first_name ?? "there";
  const recent = myAttendance.slice(0, 7).reverse();
  const openJobs = jobs.filter((j) => j.status === "Open").length;

  return (
    <>
      <section className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div>
          <p className="text-sm font-semibold text-brand-600">Good morning, {firstName} <span aria-hidden="true">👋</span></p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900 sm:text-[34px]">Organization at a glance.</h1>
          <p className="mt-2 text-sm text-slate-500">Manage employees, payroll, performance and recruitment.</p>
        </div>
        <button
          onClick={() => onNavigate("employees")}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 shadow-sm hover:border-brand-200 hover:text-brand-600"
        >
          <UserPlus size={17} /> Add employee
        </button>
      </section>

      <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Total employees", value: allEmployees.length, sub: "across the org", icon: Users, color: "text-brand-600 bg-brand-50" },
          { label: "Departments", value: departments.length, sub: "active teams", icon: Building2, color: "text-violet-600 bg-violet-50" },
          { label: "Open positions", value: openJobs, sub: "job openings", icon: Briefcase, color: "text-amber-600 bg-amber-50" },
          { label: "Leave to review", value: pendingUnassignedLeave.length, sub: "top-of-hierarchy", icon: CheckCircle, color: "text-emerald-600 bg-emerald-50" },
        ].map(({ label, value, sub, icon: Icon, color }) => (
          <Card key={label}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
                <p className="mt-2 text-3xl font-bold text-slate-900">{value}</p>
                <p className="mt-1 text-xs text-slate-400">{sub}</p>
              </div>
              <div className={`rounded-xl p-3 ${color}`}><Icon size={22} /></div>
            </div>
          </Card>
        ))}
      </section>

      <section className="mt-5 grid gap-5 xl:grid-cols-[1.32fr_0.68fr]">
        <article className="overflow-hidden rounded-2xl bg-gradient-to-br from-[#4e61db] via-[#5369df] to-[#7b90ee] p-6 text-white shadow-[0_16px_38px_rgba(67,84,191,0.22)] sm:p-7">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-blue-100">Today's attendance</p>
              <p className="mt-2 text-3xl font-bold tracking-tight">{checkedIn ? "You're checked in" : "Ready for the day?"}</p>
              <p className="mt-1 text-sm text-blue-100">{checkedIn ? "Your working time is being recorded." : "Check in when you begin work."}</p>
            </div>
            <div className="rounded-xl bg-white/15 p-3"><Clock3 size={23} /></div>
          </div>
          <div className="mt-8 flex flex-col gap-4 border-t border-white/20 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs text-blue-100">Today</p>
              <p className="mt-1 text-lg font-bold">{checkedIn ? "Currently working" : "Not checked in"}</p>
            </div>
            <button disabled={actionLoading} onClick={onAttendance} className="rounded-xl bg-white px-5 py-2.5 text-sm font-bold text-brand-600 shadow-sm transition hover:bg-blue-50 disabled:cursor-wait disabled:opacity-70">
              {actionLoading ? "Updating…" : checkedIn ? "Check out" : "Check in"}
            </button>
          </div>
        </article>
        <Card>
          <p className="text-sm font-semibold text-slate-700">Recent attendance</p>
          <div className="mt-5 flex h-36 items-end justify-between gap-2">
            {recent.length ? recent.map((e) => (
              <div key={e.attendance_id} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                <div className="flex w-full max-w-9 flex-1 items-end rounded-t-md bg-brand-50">
                  <div className="w-full rounded-t-md bg-brand-500" style={{ height: `${Math.min(100, ((Number(e.hours_worked) || 7) / 9) * 100)}%` }} />
                </div>
                <span className="text-[10px] font-medium text-slate-400">
                  {new Intl.DateTimeFormat("en", { weekday: "short" }).format(new Date(`${e.attendance_date}T00:00:00`))}
                </span>
              </div>
            )) : <p className="m-auto text-sm text-slate-400">No records yet.</p>}
          </div>
        </Card>
      </section>

      <section className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {[
          { page: "employees" as Page, label: "Employee directory", sub: `${allEmployees.length} people`, icon: Users },
          { page: "payroll" as Page, label: "Payroll", sub: "Structures & payslips", icon: Wallet },
          { page: "performance" as Page, label: "Performance reviews", sub: "Cycles & finalization", icon: Star },
          { page: "recruitment" as Page, label: "Recruitment", sub: `${openJobs} open roles`, icon: Briefcase },
          { page: "org-structure" as Page, label: "Org structure", sub: `${departments.length} departments`, icon: Building2 },
          { page: "leave-approvals" as Page, label: "Leave approvals", sub: `${pendingUnassignedLeave.length} pending`, icon: CheckCircle },
        ].map(({ page, label, sub, icon: Icon }) => (
          <button
            key={page} onClick={() => onNavigate(page)}
            className="flex items-center gap-4 rounded-2xl border border-slate-100 bg-white p-5 text-left shadow-[0_8px_28px_rgba(26,44,92,0.05)] transition hover:border-brand-200 hover:shadow-md"
          >
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-brand-600"><Icon size={22} /></div>
            <div><p className="font-bold text-slate-800">{label}</p><p className="mt-0.5 text-xs text-slate-400">{sub}</p></div>
            <ChevronDown className="-rotate-90 ml-auto text-slate-300" size={18} />
          </button>
        ))}
      </section>
    </>
  );
}

// ─── My Attendance ────────────────────────────────────────────────────────────
function AttendancePage({ records, checkedIn, actionLoading, onAttendance }: {
  records: Attendance[]; checkedIn: boolean; actionLoading: boolean; onAttendance: () => void;
}) {
  return (
    <>
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Attendance</h1>
          <p className="mt-2 text-sm text-slate-500">Track your daily check-ins and worked hours.</p>
        </div>
        <button disabled={actionLoading} onClick={onAttendance} className="rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-brand-600 disabled:opacity-70">
          {actionLoading ? "Updating…" : checkedIn ? "Check out" : "Check in"}
        </button>
      </section>
      <Card className="mt-7 overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-6 py-4 font-semibold">Date</th>
                <th className="px-6 py-4 font-semibold">Check in</th>
                <th className="px-6 py-4 font-semibold">Check out</th>
                <th className="px-6 py-4 font-semibold">Worked hours</th>
                <th className="px-6 py-4 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {records.length ? records.map((r) => (
                <tr key={r.attendance_id} className="text-slate-600">
                  <td className="px-6 py-4 font-semibold text-slate-700">{formatDate(r.attendance_date)}</td>
                  <td className="px-6 py-4">{formatTime(r.check_in_time)}</td>
                  <td className="px-6 py-4">{formatTime(r.check_out_time)}</td>
                  <td className="px-6 py-4">{r.hours_worked ? `${r.hours_worked} hrs` : "In progress"}</td>
                  <td className="px-6 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusStyle(r.status)}`}>{r.status}</span></td>
                </tr>
              )) : <tr><td colSpan={5} className="px-6 py-14 text-center text-slate-400">No attendance records yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

// ─── My Leave ────────────────────────────────────────────────────────────────
function LeavePage({ types, balances, requests, onSubmitted, onNotice }: {
  types: LeaveType[]; balances: LeaveBalance[]; requests: LeaveRequest[];
  onSubmitted: () => Promise<void>; onNotice: (m: string) => void;
}) {
  const [form, setForm] = useState({ leave_type_id: String(types[0]?.leave_type_id ?? ""), start_date: "", end_date: "", reason: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!form.leave_type_id && types[0]) setForm((f) => ({ ...f, leave_type_id: String(types[0].leave_type_id) }));
  }, [types, form.leave_type_id]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      await api.post("/leave/request", { ...form, leave_type_id: Number(form.leave_type_id) });
      onNotice("Leave request submitted for approval.");
      setForm((f) => ({ ...f, start_date: "", end_date: "", reason: "" }));
      await onSubmitted();
    } catch (err) { onNotice(extractErrorMessage(err, "Could not submit leave request.")); }
    finally { setSaving(false); }
  };

  const typeName = (id: number) => types.find((t) => t.leave_type_id === id)?.leave_type_name ?? "Leave";

  return (
    <>
      <section>
        <h1 className="text-3xl font-bold tracking-tight">My leave</h1>
        <p className="mt-2 text-sm text-slate-500">Request time off and track your leave history.</p>
      </section>
      <section className="mt-7 grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
        <Card>
          <h2 className="text-base font-bold text-slate-800">Leave balance</h2>
          <div className="mt-5 space-y-4">
            {balances.length ? balances.map((b) => (
              <div key={b.leave_type_id}>
                <div className="flex justify-between text-sm">
                  <span className="font-semibold text-slate-700">{typeName(b.leave_type_id)}</span>
                  <span className="text-slate-500">{b.remaining} / {b.allocated} days</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-brand-500" style={{ width: `${(Number(b.remaining) / Number(b.allocated)) * 100}%` }} />
                </div>
              </div>
            )) : <p className="text-sm text-slate-400">No leave balance set up yet.</p>}
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-2"><Plus size={18} className="text-brand-600" /><h2 className="text-base font-bold text-slate-800">New leave request</h2></div>
          <form onSubmit={submit} className="mt-5 grid gap-4 sm:grid-cols-2">
            <Field label="Leave type">
              <select required value={form.leave_type_id} onChange={(e) => setForm({ ...form, leave_type_id: e.target.value })} className={inputClass}>
                <option value="">Select type</option>
                {types.map((t) => <option key={t.leave_type_id} value={t.leave_type_id}>{t.leave_type_name}</option>)}
              </select>
            </Field>
            <div />
            <Field label="Start date">
              <input required min={new Date().toISOString().slice(0, 10)} type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} className={inputClass} />
            </Field>
            <Field label="End date">
              <input required min={form.start_date || new Date().toISOString().slice(0, 10)} type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} className={inputClass} />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Reason">
                <textarea required value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} rows={3} className={`${inputClass} resize-none`} />
              </Field>
            </div>
            <div className="sm:col-span-2 flex justify-end">
              <button disabled={saving || !types.length} className="rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-600 disabled:opacity-60">
                {saving ? "Submitting…" : "Submit request"}
              </button>
            </div>
          </form>
        </Card>
      </section>
      <Card className="mt-5 overflow-hidden p-0">
        <div className="px-5 py-5 sm:px-6"><h2 className="text-base font-bold text-slate-800">Request history</h2></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-6 py-3 font-semibold">Leave type</th>
                <th className="px-6 py-3 font-semibold">Dates</th>
                <th className="px-6 py-3 font-semibold">Days</th>
                <th className="px-6 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {requests.length ? requests.map((r) => (
                <tr key={r.leave_request_id}>
                  <td className="px-6 py-4 font-semibold text-slate-700">{typeName(r.leave_type_id)}</td>
                  <td className="px-6 py-4 text-slate-500">{formatDate(r.start_date)} – {formatDate(r.end_date)}</td>
                  <td className="px-6 py-4 text-slate-500">{r.no_of_days}</td>
                  <td className="px-6 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusStyle(r.status)}`}>{r.status}</span></td>
                </tr>
              )) : <tr><td colSpan={4} className="px-6 py-12 text-center text-slate-400">No leave requests yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

// ─── My Payslips ─────────────────────────────────────────────────────────────
function PayslipsPage({ payslips }: { payslips: Payslip[] }) {
  const [expanded, setExpanded] = useState<number | null>(null);
  return (
    <>
      <section>
        <h1 className="text-3xl font-bold tracking-tight">My payslips</h1>
        <p className="mt-2 text-sm text-slate-500">Review your finalized monthly pay statements.</p>
      </section>
      <div className="mt-7 space-y-4">
        {payslips.length ? payslips.map((p) => (
          <Card key={p.payslip_id}>
            <button onClick={() => setExpanded(expanded === p.payslip_id ? null : p.payslip_id)} className="flex w-full items-center gap-4 text-left">
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-brand-600"><ReceiptText size={21} /></div>
              <div className="flex-1">
                <p className="font-bold text-slate-800">{monthName.format(new Date(p.payslip_year, p.payslip_month - 1))}</p>
                <p className="mt-0.5 text-xs text-slate-400">{p.status}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-400">Net pay</p>
                <p className="font-bold text-slate-800">{money.format(p.net_pay)}</p>
              </div>
              <ChevronDown className={`ml-2 text-slate-400 transition ${expanded === p.payslip_id ? "rotate-180" : ""}`} />
            </button>
            {expanded === p.payslip_id && (
              <div className="mt-5 border-t border-slate-100 pt-5">
                <div className="grid gap-3 text-sm sm:grid-cols-3">
                  <p className="rounded-lg bg-slate-50 p-3 text-slate-500">Gross pay<strong className="mt-1 block text-slate-800">{money.format(p.gross_pay)}</strong></p>
                  <p className="rounded-lg bg-slate-50 p-3 text-slate-500">Deductions<strong className="mt-1 block text-slate-800">{money.format(p.total_deductions)}</strong></p>
                  <p className="rounded-lg bg-brand-50 p-3 text-brand-700">Net pay<strong className="mt-1 block text-brand-800">{money.format(p.net_pay)}</strong></p>
                </div>
              </div>
            )}
          </Card>
        )) : (
          <Card className="py-16 text-center">
            <FileText className="mx-auto text-brand-300" size={34} />
            <h2 className="mt-4 font-bold text-slate-700">No payslips yet</h2>
          </Card>
        )}
      </div>
    </>
  );
}

// ─── My Profile ──────────────────────────────────────────────────────────────
function ProfilePage({ employee, onSaved, onNotice }: {
  employee: Employee; onSaved: (e: Employee) => void; onNotice: (m: string) => void;
}) {
  const [form, setForm] = useState({
    phone: employee.phone ?? "", address: employee.address ?? "",
    emergency_contact_name: employee.emergency_contact_name ?? "",
    emergency_contact_phone: employee.emergency_contact_phone ?? "",
  });
  const [saving, setSaving] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try { setSaving(true); const { data } = await api.patch<Employee>("/employees/me/profile", form); onSaved(data); }
    catch (err) { onNotice(extractErrorMessage(err, "Profile could not be saved.")); }
    finally { setSaving(false); }
  };
  return (
    <>
      <section>
        <h1 className="text-3xl font-bold tracking-tight">My profile</h1>
        <p className="mt-2 text-sm text-slate-500">Keep your personal and emergency contact details current.</p>
      </section>
      <section className="mt-7 grid gap-5 xl:grid-cols-[0.7fr_1.3fr]">
        <Card>
          <div className="grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-[#a9c8ff] to-[#607bf0] text-xl font-bold text-white">{initials(employee)}</div>
          <h2 className="mt-4 text-xl font-bold text-slate-800">{fullName(employee)}</h2>
          <p className="mt-1 text-sm text-slate-400">{employee.employee_code}</p>
          <div className="mt-6 space-y-3 border-t border-slate-100 pt-5 text-sm">
            <p><span className="block text-xs text-slate-400">Work email</span><span className="font-medium text-slate-700">{employee.personal_email}</span></p>
            <p><span className="block text-xs text-slate-400">Employment</span><span className="font-medium text-slate-700">{employee.employment_type} · {employee.employment_status}</span></p>
            <p><span className="block text-xs text-slate-400">Joined</span><span className="font-medium text-slate-700">{formatDate(employee.hire_date)}</span></p>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-2"><UserRound size={18} className="text-brand-600" /><h2 className="text-base font-bold text-slate-800">Contact details</h2></div>
          <form onSubmit={submit} className="mt-5 grid gap-4 sm:grid-cols-2">
            <Field label="Phone number">
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Add your phone number" className={inputClass} />
            </Field>
            <Field label="Emergency contact">
              <input value={form.emergency_contact_name} onChange={(e) => setForm({ ...form, emergency_contact_name: e.target.value })} placeholder="Contact name" className={inputClass} />
            </Field>
            <Field label="Emergency phone">
              <input value={form.emergency_contact_phone} onChange={(e) => setForm({ ...form, emergency_contact_phone: e.target.value })} placeholder="Contact phone number" className={inputClass} />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Address">
                <textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} rows={3} className={`${inputClass} resize-none`} />
              </Field>
            </div>
            <div className="sm:col-span-2 flex justify-end">
              <button disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-600 disabled:opacity-60">
                <Save size={16} />{saving ? "Saving…" : "Save changes"}
              </button>
            </div>
          </form>
        </Card>
      </section>
    </>
  );
}

// ─── Employee Directory ──────────────────────────────────────────────────────
function EmployeeDirectoryPage({ employees, departments, designations, departmentById, designationById, onRefresh, onNotice }: {
  employees: Employee[]; departments: Department[]; designations: Designation[];
  departmentById: (id: number) => Department | undefined; designationById: (id: number) => Designation | undefined;
  onRefresh: () => Promise<void>; onNotice: (m: string) => void;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [search, setSearch] = useState("");

  const filtered = employees.filter((e) =>
    `${e.first_name} ${e.last_name} ${e.employee_code} ${e.personal_email}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Employee directory</h1>
          <p className="mt-2 text-sm text-slate-500">{employees.length} employees across the organization.</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-600">
          <UserPlus size={16} /> Add employee
        </button>
      </section>

      <input
        value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, code or email…"
        className={`mt-6 max-w-md ${inputClass}`}
      />

      <Card className="mt-5 overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-6 py-3 font-semibold">Employee</th>
                <th className="px-6 py-3 font-semibold">Department</th>
                <th className="px-6 py-3 font-semibold">Designation</th>
                <th className="px-6 py-3 font-semibold">Status</th>
                <th className="px-6 py-3 font-semibold">Manager</th>
                <th className="px-6 py-3 font-semibold" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length ? filtered.map((emp) => {
                const mgr = employees.find((m) => m.employee_id === emp.manager_id);
                return (
                  <tr key={emp.employee_id} className="text-slate-600">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#a9c8ff] to-[#607bf0] text-xs font-bold text-white">{initials(emp)}</div>
                        <div>
                          <p className="font-semibold text-slate-700">{fullName(emp)}</p>
                          <p className="text-xs text-slate-400">{emp.employee_code}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">{departmentById(emp.department_id)?.department_name ?? "—"}</td>
                    <td className="px-6 py-4">{designationById(emp.designation_id)?.title ?? "—"}</td>
                    <td className="px-6 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusStyle(emp.employment_status)}`}>{emp.employment_status}</span></td>
                    <td className="px-6 py-4">{mgr ? fullName(mgr) : <span className="text-slate-400">None (top-level)</span>}</td>
                    <td className="px-6 py-4 text-right">
                      <button onClick={() => setEditing(emp)} className="text-sm font-semibold text-brand-600 hover:text-brand-700">Edit</button>
                    </td>
                  </tr>
                );
              }) : <tr><td colSpan={6} className="px-6 py-14 text-center text-slate-400">No employees match your search.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      {showAdd && (
        <AddEmployeeModal
          departments={departments} designations={designations} employees={employees}
          onClose={() => setShowAdd(false)}
          onSaved={async () => { setShowAdd(false); onNotice("Employee created."); await onRefresh(); }}
          onNotice={onNotice}
        />
      )}
      {editing && (
        <EditEmployeeModal
          employee={editing} departments={departments} designations={designations} employees={employees}
          onClose={() => setEditing(null)}
          onSaved={async () => { setEditing(null); onNotice("Employee updated."); await onRefresh(); }}
          onNotice={onNotice}
        />
      )}
    </>
  );
}

function AddEmployeeModal({ departments, designations, employees, onClose, onSaved, onNotice }: {
  departments: Department[]; designations: Designation[]; employees: Employee[];
  onClose: () => void; onSaved: () => Promise<void>; onNotice: (m: string) => void;
}) {
  const [form, setForm] = useState({
    first_name: "", last_name: "", personal_email: "", phone: "", hire_date: new Date().toISOString().slice(0, 10),
    employment_type: "Full-Time", department_id: String(departments[0]?.department_id ?? ""),
    designation_id: String(designations[0]?.designation_id ?? ""), manager_id: "", base_salary: "",
  });
  const [createAccount, setCreateAccount] = useState(false);
  const [account, setAccount] = useState({ email: "", password: "", role: "Employee" as "HRAdmin" | "Manager" | "Employee" });
  const [saving, setSaving] = useState(false);

  const availableDesignations = designations.filter((d) => d.department_id === Number(form.department_id));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      await api.post("/employees", {
        first_name: form.first_name, last_name: form.last_name, personal_email: form.personal_email,
        phone: form.phone || undefined, hire_date: form.hire_date, employment_type: form.employment_type,
        department_id: Number(form.department_id), designation_id: Number(form.designation_id),
        manager_id: form.manager_id ? Number(form.manager_id) : undefined,
        base_salary: form.base_salary ? Number(form.base_salary) : 0,
        account: createAccount ? account : undefined,
      });
      await onSaved();
    } catch (err) { onNotice(extractErrorMessage(err, "Could not create employee.")); }
    finally { setSaving(false); }
  };

  return (
    <Modal onClose={onClose} wide>
      <h2 className="text-lg font-bold text-slate-800">Add employee</h2>
      <form onSubmit={submit} className="mt-5 grid gap-4 sm:grid-cols-2">
        <Field label="First name"><input required value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} className={inputClass} /></Field>
        <Field label="Last name"><input required value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} className={inputClass} /></Field>
        <Field label="Personal email"><input required type="email" value={form.personal_email} onChange={(e) => setForm({ ...form, personal_email: e.target.value })} className={inputClass} /></Field>
        <Field label="Phone"><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={inputClass} /></Field>
        <Field label="Hire date"><input required type="date" value={form.hire_date} onChange={(e) => setForm({ ...form, hire_date: e.target.value })} className={inputClass} /></Field>
        <Field label="Employment type">
          <select value={form.employment_type} onChange={(e) => setForm({ ...form, employment_type: e.target.value })} className={inputClass}>
            <option>Full-Time</option><option>Part-Time</option><option>Contract</option>
          </select>
        </Field>
        <Field label="Department">
          <select required value={form.department_id} onChange={(e) => setForm({ ...form, department_id: e.target.value, designation_id: "" })} className={inputClass}>
            <option value="">Select department</option>
            {departments.map((d) => <option key={d.department_id} value={d.department_id}>{d.department_name}</option>)}
          </select>
        </Field>
        <Field label="Designation">
          <select required value={form.designation_id} onChange={(e) => setForm({ ...form, designation_id: e.target.value })} className={inputClass}>
            <option value="">Select designation</option>
            {availableDesignations.map((d) => <option key={d.designation_id} value={d.designation_id}>{d.title}</option>)}
          </select>
        </Field>
        <Field label="Manager (optional)">
          <select value={form.manager_id} onChange={(e) => setForm({ ...form, manager_id: e.target.value })} className={inputClass}>
            <option value="">None (top-level)</option>
            {employees.map((e) => <option key={e.employee_id} value={e.employee_id}>{fullName(e)}</option>)}
          </select>
        </Field>
        <Field label="Base salary">
          <input type="number" min="0" step="0.01" value={form.base_salary} onChange={(e) => setForm({ ...form, base_salary: e.target.value })} className={inputClass} />
        </Field>

        <div className="sm:col-span-2 rounded-xl border border-slate-200 p-4">
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <input type="checkbox" checked={createAccount} onChange={(e) => setCreateAccount(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
            Create a login account for this employee
          </label>
          {createAccount && (
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <Field label="Login email"><input required={createAccount} type="email" value={account.email} onChange={(e) => setAccount({ ...account, email: e.target.value })} className={inputClass} /></Field>
              <Field label="Password"><input required={createAccount} type="password" value={account.password} onChange={(e) => setAccount({ ...account, password: e.target.value })} className={inputClass} /></Field>
              <Field label="Role">
                <select value={account.role} onChange={(e) => setAccount({ ...account, role: e.target.value as typeof account.role })} className={inputClass}>
                  <option value="Employee">Employee</option><option value="Manager">Manager</option><option value="HRAdmin">HRAdmin</option>
                </select>
              </Field>
            </div>
          )}
        </div>

        <div className="sm:col-span-2 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
          <button disabled={saving} className="rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-600 disabled:opacity-60">{saving ? "Creating…" : "Create employee"}</button>
        </div>
      </form>
    </Modal>
  );
}

function EditEmployeeModal({ employee, departments, designations, employees, onClose, onSaved, onNotice }: {
  employee: Employee; departments: Department[]; designations: Designation[]; employees: Employee[];
  onClose: () => void; onSaved: () => Promise<void>; onNotice: (m: string) => void;
}) {
  const [form, setForm] = useState({
    first_name: employee.first_name, last_name: employee.last_name, personal_email: employee.personal_email,
    phone: employee.phone ?? "", employment_type: employee.employment_type, employment_status: employee.employment_status,
    department_id: String(employee.department_id), designation_id: String(employee.designation_id),
    manager_id: employee.manager_id ? String(employee.manager_id) : "",
    base_salary: String(employee.base_salary), salary_change_reason: "",
  });
  const [saving, setSaving] = useState(false);

  const availableDesignations = designations.filter((d) => d.department_id === Number(form.department_id));
  const salaryChanged = Number(form.base_salary) !== Number(employee.base_salary);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (salaryChanged && !form.salary_change_reason.trim()) {
      onNotice("A reason is required when changing base salary.");
      return;
    }
    try {
      setSaving(true);
      await api.patch(`/employees/${employee.employee_id}`, {
        first_name: form.first_name, last_name: form.last_name, personal_email: form.personal_email,
        phone: form.phone || undefined, employment_type: form.employment_type, employment_status: form.employment_status,
        department_id: Number(form.department_id), designation_id: Number(form.designation_id),
        manager_id: form.manager_id ? Number(form.manager_id) : null,
        base_salary: Number(form.base_salary),
        salary_change_reason: salaryChanged ? form.salary_change_reason : undefined,
      });
      await onSaved();
    } catch (err) { onNotice(extractErrorMessage(err, "Could not update employee.")); }
    finally { setSaving(false); }
  };

  return (
    <Modal onClose={onClose} wide>
      <h2 className="text-lg font-bold text-slate-800">Edit {fullName(employee)}</h2>
      <form onSubmit={submit} className="mt-5 grid gap-4 sm:grid-cols-2">
        <Field label="First name"><input required value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} className={inputClass} /></Field>
        <Field label="Last name"><input required value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} className={inputClass} /></Field>
        <Field label="Personal email"><input required type="email" value={form.personal_email} onChange={(e) => setForm({ ...form, personal_email: e.target.value })} className={inputClass} /></Field>
        <Field label="Phone"><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={inputClass} /></Field>
        <Field label="Employment type">
          <select value={form.employment_type} onChange={(e) => setForm({ ...form, employment_type: e.target.value })} className={inputClass}>
            <option>Full-Time</option><option>Part-Time</option><option>Contract</option>
          </select>
        </Field>
        <Field label="Employment status">
          <select value={form.employment_status} onChange={(e) => setForm({ ...form, employment_status: e.target.value })} className={inputClass}>
            <option>Active</option><option>On Leave</option><option>Terminated</option>
          </select>
        </Field>
        <Field label="Department">
          <select value={form.department_id} onChange={(e) => setForm({ ...form, department_id: e.target.value, designation_id: "" })} className={inputClass}>
            {departments.map((d) => <option key={d.department_id} value={d.department_id}>{d.department_name}</option>)}
          </select>
        </Field>
        <Field label="Designation">
          <select value={form.designation_id} onChange={(e) => setForm({ ...form, designation_id: e.target.value })} className={inputClass}>
            {availableDesignations.map((d) => <option key={d.designation_id} value={d.designation_id}>{d.title}</option>)}
          </select>
        </Field>
        <Field label="Manager">
          <select value={form.manager_id} onChange={(e) => setForm({ ...form, manager_id: e.target.value })} className={inputClass}>
            <option value="">None (top-level)</option>
            {employees.filter((e) => e.employee_id !== employee.employee_id).map((e) => <option key={e.employee_id} value={e.employee_id}>{fullName(e)}</option>)}
          </select>
        </Field>
        <Field label="Base salary">
          <input type="number" min="0" step="0.01" value={form.base_salary} onChange={(e) => setForm({ ...form, base_salary: e.target.value })} className={inputClass} />
        </Field>
        {salaryChanged && (
          <div className="sm:col-span-2">
            <Field label="Reason for salary change (required, logs to salary history)">
              <input required value={form.salary_change_reason} onChange={(e) => setForm({ ...form, salary_change_reason: e.target.value })} placeholder="e.g. Annual increment, promotion…" className={inputClass} />
            </Field>
          </div>
        )}
        <div className="sm:col-span-2 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
          <button disabled={saving} className="rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-600 disabled:opacity-60">{saving ? "Saving…" : "Save changes"}</button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Org Structure ────────────────────────────────────────────────────────────
function OrgStructurePage({ departments, designations, onRefresh, onNotice }: {
  departments: Department[]; designations: Designation[]; onRefresh: () => Promise<void>; onNotice: (m: string) => void;
}) {
  const [deptName, setDeptName] = useState("");
  const [desigForm, setDesigForm] = useState({ title: "", department_id: String(departments[0]?.department_id ?? ""), grade_level: "" });
  const [savingDept, setSavingDept] = useState(false);
  const [savingDesig, setSavingDesig] = useState(false);

  const addDepartment = async (e: FormEvent) => {
    e.preventDefault();
    try {
      setSavingDept(true);
      await api.post("/departments", { department_name: deptName });
      setDeptName("");
      onNotice("Department created.");
      await onRefresh();
    } catch (err) { onNotice(extractErrorMessage(err, "Could not create department.")); }
    finally { setSavingDept(false); }
  };

  const addDesignation = async (e: FormEvent) => {
    e.preventDefault();
    try {
      setSavingDesig(true);
      await api.post("/designations", { title: desigForm.title, department_id: Number(desigForm.department_id), grade_level: desigForm.grade_level || undefined });
      setDesigForm({ ...desigForm, title: "", grade_level: "" });
      onNotice("Designation created.");
      await onRefresh();
    } catch (err) { onNotice(extractErrorMessage(err, "Could not create designation.")); }
    finally { setSavingDesig(false); }
  };

  const departmentName = (id: number) => departments.find((d) => d.department_id === id)?.department_name ?? "—";

  return (
    <>
      <section>
        <h1 className="text-3xl font-bold tracking-tight">Org structure</h1>
        <p className="mt-2 text-sm text-slate-500">Manage departments and designations.</p>
      </section>
      <section className="mt-7 grid gap-5 xl:grid-cols-2">
        <Card>
          <h2 className="text-base font-bold text-slate-800">Departments</h2>
          <form onSubmit={addDepartment} className="mt-4 flex gap-2">
            <input required value={deptName} onChange={(e) => setDeptName(e.target.value)} placeholder="New department name" className={`flex-1 ${inputClass}`} />
            <button disabled={savingDept} className="rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-600 disabled:opacity-60">{savingDept ? "…" : "Add"}</button>
          </form>
          <div className="mt-5 divide-y divide-slate-100">
            {departments.length ? departments.map((d) => (
              <div key={d.department_id} className="flex items-center justify-between py-3">
                <span className="font-semibold text-slate-700">{d.department_name}</span>
                <span className="text-xs text-slate-400">{designations.filter((g) => g.department_id === d.department_id).length} designations</span>
              </div>
            )) : <p className="py-4 text-sm text-slate-400">No departments yet.</p>}
          </div>
        </Card>
        <Card>
          <h2 className="text-base font-bold text-slate-800">Designations</h2>
          <form onSubmit={addDesignation} className="mt-4 grid gap-3 sm:grid-cols-2">
            <input required value={desigForm.title} onChange={(e) => setDesigForm({ ...desigForm, title: e.target.value })} placeholder="Title (e.g. Software Engineer)" className={inputClass} />
            <select required value={desigForm.department_id} onChange={(e) => setDesigForm({ ...desigForm, department_id: e.target.value })} className={inputClass}>
              <option value="">Department</option>
              {departments.map((d) => <option key={d.department_id} value={d.department_id}>{d.department_name}</option>)}
            </select>
            <input value={desigForm.grade_level} onChange={(e) => setDesigForm({ ...desigForm, grade_level: e.target.value })} placeholder="Grade level (optional)" className={inputClass} />
            <button disabled={savingDesig} className="rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-600 disabled:opacity-60">{savingDesig ? "Adding…" : "Add designation"}</button>
          </form>
          <div className="mt-5 divide-y divide-slate-100">
            {designations.length ? designations.map((d) => (
              <div key={d.designation_id} className="flex items-center justify-between py-3 text-sm">
                <span className="font-semibold text-slate-700">{d.title}</span>
                <span className="text-xs text-slate-400">{departmentName(d.department_id)}{d.grade_level ? ` · ${d.grade_level}` : ""}</span>
              </div>
            )) : <p className="py-4 text-sm text-slate-400">No designations yet.</p>}
          </div>
        </Card>
      </section>
    </>
  );
}

// ─── Payroll ─────────────────────────────────────────────────────────────────
function PayrollPage({ employees, components, onNotice }: {
  employees: Employee[]; components: SalaryComponent[]; onNotice: (m: string) => void;
}) {
  const [selectedId, setSelectedId] = useState<string>("");
  const [structure, setStructure] = useState<SalaryStructureRow[]>([]);
  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [line, setLine] = useState({ component_id: String(components[0]?.component_id ?? ""), amount: "", effective_from: new Date().toISOString().slice(0, 10) });
  const [genMonth, setGenMonth] = useState(String(new Date().getMonth() + 1));
  const [genYear, setGenYear] = useState(String(new Date().getFullYear()));
  const [savingLine, setSavingLine] = useState(false);
  const [generating, setGenerating] = useState(false);

  const selectedEmployee = employees.find((e) => e.employee_id === Number(selectedId));
  const componentName = (id: number) => components.find((c) => c.component_id === id)?.component_name ?? `#${id}`;

  const loadEmployeeData = async (employeeId: string) => {
    if (!employeeId) { setStructure([]); setPayslips([]); return; }
    try {
      setLoadingData(true);
      const [structRes, slipsRes] = await Promise.all([
        api.get<SalaryStructureRow[]>(`/payroll/salary-structure/${employeeId}`),
        api.get<Payslip[]>(`/payroll/payslip/${employeeId}`),
      ]);
      setStructure(structRes.data);
      setPayslips(slipsRes.data);
    } catch (err) { onNotice(extractErrorMessage(err, "Could not load payroll data.")); }
    finally { setLoadingData(false); }
  };

  useEffect(() => { void loadEmployeeData(selectedId); }, [selectedId]);

  const addLine = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedId) return;
    try {
      setSavingLine(true);
      await api.post(`/payroll/salary-structure/${selectedId}`, {
        lines: [{ component_id: Number(line.component_id), amount: Number(line.amount), effective_from: line.effective_from }],
      });
      onNotice("Salary structure updated.");
      setLine({ ...line, amount: "" });
      await loadEmployeeData(selectedId);
    } catch (err) { onNotice(extractErrorMessage(err, "Could not update salary structure.")); }
    finally { setSavingLine(false); }
  };

  const generate = async () => {
    if (!selectedId) return;
    try {
      setGenerating(true);
      await api.post(`/payroll/generate/${selectedId}?month=${genMonth}&year=${genYear}`);
      onNotice("Payslip generated.");
      await loadEmployeeData(selectedId);
    } catch (err) { onNotice(extractErrorMessage(err, "Could not generate payslip.")); }
    finally { setGenerating(false); }
  };

  return (
    <>
      <section>
        <h1 className="text-3xl font-bold tracking-tight">Payroll</h1>
        <p className="mt-2 text-sm text-slate-500">Define salary structures and generate monthly payslips.</p>
      </section>

      <Card className="mt-7">
        <Field label="Select employee">
          <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} className={`max-w-md ${inputClass}`}>
            <option value="">Choose an employee…</option>
            {employees.map((e) => <option key={e.employee_id} value={e.employee_id}>{fullName(e)} ({e.employee_code})</option>)}
          </select>
        </Field>
      </Card>

      {selectedEmployee && (
        <div className="mt-5 grid gap-5 xl:grid-cols-2">
          <Card>
            <h2 className="text-base font-bold text-slate-800">Salary structure</h2>
            <p className="mt-1 text-xs text-slate-400">Current active components for {fullName(selectedEmployee)}</p>
            <div className="mt-4 divide-y divide-slate-100">
              {loadingData ? (
                <p className="py-4 text-sm text-slate-400">Loading…</p>
              ) : structure.length ? structure.map((row) => (
                <div key={row.structure_id} className="flex items-center justify-between py-2.5 text-sm">
                  <span className="font-medium text-slate-700">{componentName(row.component_id)}</span>
                  <span className="text-slate-500">{money.format(row.amount)} <span className="text-xs text-slate-400">from {formatDate(row.effective_from)}</span></span>
                </div>
              )) : <p className="py-4 text-sm text-slate-400">No salary structure defined yet.</p>}
            </div>
            <form onSubmit={addLine} className="mt-5 grid gap-3 border-t border-slate-100 pt-5 sm:grid-cols-3">
              <select required value={line.component_id} onChange={(e) => setLine({ ...line, component_id: e.target.value })} className={inputClass}>
                <option value="">Component</option>
                {components.map((c) => <option key={c.component_id} value={c.component_id}>{c.component_name} ({c.component_type})</option>)}
              </select>
              <input required type="number" min="0" step="0.01" placeholder="Amount" value={line.amount} onChange={(e) => setLine({ ...line, amount: e.target.value })} className={inputClass} />
              <input required type="date" value={line.effective_from} onChange={(e) => setLine({ ...line, effective_from: e.target.value })} className={inputClass} />
              <button disabled={savingLine} className="sm:col-span-3 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-600 disabled:opacity-60">{savingLine ? "Saving…" : "Add / update component"}</button>
            </form>
          </Card>

          <Card>
            <h2 className="text-base font-bold text-slate-800">Generate payslip</h2>
            <div className="mt-4 flex gap-3">
              <select value={genMonth} onChange={(e) => setGenMonth(e.target.value)} className={inputClass}>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <option key={m} value={m}>{monthName.format(new Date(2000, m - 1))}</option>)}
              </select>
              <input type="number" value={genYear} onChange={(e) => setGenYear(e.target.value)} className={`w-28 ${inputClass}`} />
              <button onClick={() => void generate()} disabled={generating} className="shrink-0 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-600 disabled:opacity-60">{generating ? "Generating…" : "Generate"}</button>
            </div>
            <h3 className="mt-6 text-sm font-bold uppercase tracking-wide text-slate-400">Payslip history</h3>
            <div className="mt-3 divide-y divide-slate-100">
              {payslips.length ? payslips.map((p) => (
                <div key={p.payslip_id} className="flex items-center justify-between py-3 text-sm">
                  <div>
                    <p className="font-semibold text-slate-700">{monthName.format(new Date(p.payslip_year, p.payslip_month - 1))}</p>
                    <p className="text-xs text-slate-400">LOP: {p.lop_days} days ({money.format(p.lop_amount)})</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-slate-800">{money.format(p.net_pay)}</p>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${statusStyle(p.status)}`}>{p.status}</span>
                  </div>
                </div>
              )) : <p className="py-4 text-sm text-slate-400">No payslips generated yet.</p>}
            </div>
          </Card>
        </div>
      )}
    </>
  );
}

// ─── Performance ─────────────────────────────────────────────────────────────
function PerformancePage({ employees, cycles, employeeById, onRefresh, onNotice }: {
  employees: Employee[]; cycles: ReviewCycle[]; employeeById: (id: number) => Employee | undefined;
  onRefresh: () => Promise<void>; onNotice: (m: string) => void;
}) {
  const [showCreateCycle, setShowCreateCycle] = useState(false);
  const [cycleForm, setCycleForm] = useState({ cycle_name: "", start_date: "", end_date: "", status: "Upcoming" as "Upcoming" | "Active" | "Closed" });
  const [savingCycle, setSavingCycle] = useState(false);

  const [selectedCycleId, setSelectedCycleId] = useState<string>(String(cycles[0]?.cycle_id ?? ""));
  const [reviews, setReviews] = useState<PerformanceReview[]>([]);
  const [loadingReviews, setLoadingReviews] = useState(false);

  const [initForm, setInitForm] = useState({ employee_id: "" });
  const [initializing, setInitializing] = useState(false);
  const [finalizing, setFinalizing] = useState<number | null>(null);
  const [finalRating, setFinalRating] = useState<Record<number, string>>({});

  const loadReviews = async (cycleId: string) => {
    if (!cycleId) { setReviews([]); return; }
    try {
      setLoadingReviews(true);
      const { data } = await api.get<PerformanceReview[]>(`/performance/reviews?cycle_id=${cycleId}`);
      setReviews(data);
    } catch (err) { onNotice(extractErrorMessage(err, "Could not load reviews.")); }
    finally { setLoadingReviews(false); }
  };

  useEffect(() => { void loadReviews(selectedCycleId); }, [selectedCycleId]);
  useEffect(() => { if (!selectedCycleId && cycles[0]) setSelectedCycleId(String(cycles[0].cycle_id)); }, [cycles]);

  const createCycle = async (e: FormEvent) => {
    e.preventDefault();
    try {
      setSavingCycle(true);
      await api.post("/performance/cycles", cycleForm);
      onNotice("Review cycle created.");
      setShowCreateCycle(false);
      setCycleForm({ cycle_name: "", start_date: "", end_date: "", status: "Upcoming" });
      await onRefresh();
    } catch (err) { onNotice(extractErrorMessage(err, "Could not create review cycle.")); }
    finally { setSavingCycle(false); }
  };

  const initializeReview = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedCycleId || !initForm.employee_id) return;
    try {
      setInitializing(true);
      await api.post(`/performance/reviews/${initForm.employee_id}/${selectedCycleId}`);
      onNotice("Review initialized for employee.");
      setInitForm({ employee_id: "" });
      await loadReviews(selectedCycleId);
    } catch (err) { onNotice(extractErrorMessage(err, "Could not initialize review.")); }
    finally { setInitializing(false); }
  };

  const finalize = async (reviewId: number) => {
    const rating = finalRating[reviewId];
    if (!rating) { onNotice("Select a final rating first."); return; }
    try {
      setFinalizing(reviewId);
      await api.patch(`/performance/reviews/${reviewId}/finalize`, { final_rating: rating });
      onNotice("Review finalized.");
      await loadReviews(selectedCycleId);
    } catch (err) { onNotice(extractErrorMessage(err, "Could not finalize review.")); }
    finally { setFinalizing(null); }
  };

  const selectedCycle = cycles.find((c) => c.cycle_id === Number(selectedCycleId));

  return (
    <>
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Performance reviews</h1>
          <p className="mt-2 text-sm text-slate-500">Create cycles, initialize reviews, and finalize ratings.</p>
        </div>
        <button onClick={() => setShowCreateCycle(true)} className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-600">
          <Plus size={16} /> New cycle
        </button>
      </section>

      {showCreateCycle && (
        <Modal onClose={() => setShowCreateCycle(false)}>
          <h2 className="text-lg font-bold text-slate-800">Create review cycle</h2>
          <form onSubmit={createCycle} className="mt-5 space-y-4">
            <Field label="Cycle name"><input required value={cycleForm.cycle_name} onChange={(e) => setCycleForm({ ...cycleForm, cycle_name: e.target.value })} placeholder="e.g. H2 2026" className={inputClass} /></Field>
            <Field label="Start date"><input required type="date" value={cycleForm.start_date} onChange={(e) => setCycleForm({ ...cycleForm, start_date: e.target.value })} className={inputClass} /></Field>
            <Field label="End date"><input required type="date" value={cycleForm.end_date} onChange={(e) => setCycleForm({ ...cycleForm, end_date: e.target.value })} className={inputClass} /></Field>
            <Field label="Status">
              <select value={cycleForm.status} onChange={(e) => setCycleForm({ ...cycleForm, status: e.target.value as typeof cycleForm.status })} className={inputClass}>
                <option value="Upcoming">Upcoming</option><option value="Active">Active</option><option value="Closed">Closed</option>
              </select>
            </Field>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setShowCreateCycle(false)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
              <button disabled={savingCycle} className="rounded-xl bg-brand-500 px-4 py-2 text-sm font-bold text-white hover:bg-brand-600 disabled:opacity-60">{savingCycle ? "Creating…" : "Create cycle"}</button>
            </div>
          </form>
        </Modal>
      )}

      <Card className="mt-7">
        <div className="flex flex-wrap items-end gap-4">
          <Field label="Review cycle">
            <select value={selectedCycleId} onChange={(e) => setSelectedCycleId(e.target.value)} className={`max-w-xs ${inputClass}`}>
              <option value="">Select cycle</option>
              {cycles.map((c) => <option key={c.cycle_id} value={c.cycle_id}>{c.cycle_name}</option>)}
            </select>
          </Field>
          {selectedCycle && <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusStyle(selectedCycle.status)}`}>{selectedCycle.status}</span>}
        </div>

        {selectedCycleId && (
          <form onSubmit={initializeReview} className="mt-5 flex flex-wrap items-end gap-3 border-t border-slate-100 pt-5">
            <Field label="Initialize review for">
              <select required value={initForm.employee_id} onChange={(e) => setInitForm({ employee_id: e.target.value })} className={`max-w-xs ${inputClass}`}>
                <option value="">Select employee</option>
                {employees.map((e) => <option key={e.employee_id} value={e.employee_id}>{fullName(e)}</option>)}
              </select>
            </Field>
            <button disabled={initializing} className="rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-600 disabled:opacity-60">{initializing ? "Initializing…" : "Initialize"}</button>
          </form>
        )}
      </Card>

      <div className="mt-5 space-y-4">
        {loadingReviews ? (
          <Card className="py-12 text-center text-sm text-slate-400">Loading reviews…</Card>
        ) : reviews.length ? reviews.map((review) => {
          const emp = employeeById(review.employee_id);
          const canFinalize = review.manager_rating !== null && review.status !== "Finalized";
          return (
            <Card key={review.review_id}>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <div className="flex flex-1 items-center gap-3 min-w-0">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#a9c8ff] to-[#607bf0] text-xs font-bold text-white">
                    {emp ? initials(emp) : "?"}
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-slate-800">{emp ? fullName(emp) : `Employee #${review.employee_id}`}</p>
                    <span className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-xs font-bold ${statusStyle(review.status)}`}>{review.status}</span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  {review.self_rating && (
                    <div className="text-right">
                      <p className="text-xs text-slate-400">Self</p>
                      <span className={`mt-0.5 inline-block rounded-full px-2.5 py-1 text-xs font-bold ${ratingColor(review.self_rating)}`}>{review.self_rating}</span>
                    </div>
                  )}
                  {review.manager_rating && (
                    <div className="text-right">
                      <p className="text-xs text-slate-400">Manager</p>
                      <span className={`mt-0.5 inline-block rounded-full px-2.5 py-1 text-xs font-bold ${ratingColor(review.manager_rating)}`}>{review.manager_rating}</span>
                    </div>
                  )}
                  {review.final_rating ? (
                    <div className="text-right">
                      <p className="text-xs text-slate-400">Final</p>
                      <span className={`mt-0.5 inline-block rounded-full px-2.5 py-1 text-xs font-bold ${ratingColor(review.final_rating)}`}>{review.final_rating}</span>
                    </div>
                  ) : canFinalize ? (
                    <div className="flex items-center gap-2">
                      <select
                        value={finalRating[review.review_id] ?? ""}
                        onChange={(e) => setFinalRating({ ...finalRating, [review.review_id]: e.target.value })}
                        className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold outline-none focus:border-brand-400"
                      >
                        <option value="">Final rating…</option>
                        {RATING_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                      <button
                        onClick={() => void finalize(review.review_id)}
                        disabled={finalizing === review.review_id}
                        className="rounded-xl bg-brand-500 px-3 py-2 text-xs font-bold text-white hover:bg-brand-600 disabled:opacity-60"
                      >
                        {finalizing === review.review_id ? "…" : "Finalize"}
                      </button>
                    </div>
                  ) : (
                    <span className="text-xs text-slate-400">Awaiting manager rating</span>
                  )}
                </div>
              </div>
            </Card>
          );
        }) : (
          <Card className="py-16 text-center">
            <Star className="mx-auto text-brand-300" size={34} />
            <h2 className="mt-4 font-bold text-slate-700">No reviews in this cycle</h2>
            <p className="mt-1 text-sm text-slate-400">Initialize a review above to get started.</p>
          </Card>
        )}
      </div>
    </>
  );
}

// ─── Recruitment ─────────────────────────────────────────────────────────────
function RecruitmentPage({ jobs, candidates, departments, designations, employees, onRefresh, onNotice }: {
  jobs: JobOpening[]; candidates: Candidate[]; departments: Department[]; designations: Designation[];
  employees: Employee[]; onRefresh: () => Promise<void>; onNotice: (m: string) => void;
}) {
  const [tab, setTab] = useState<"jobs" | "candidates" | "interviews" | "onboarding">("jobs");
  const [showAddJob, setShowAddJob] = useState(false);
  const [showAddCandidate, setShowAddCandidate] = useState(false);
  const [hireModal, setHireModal] = useState<Candidate | null>(null);

  const departmentName = (id: number) => departments.find((d) => d.department_id === id)?.department_name ?? "—";
  const jobTitle = (id: number) => jobs.find((j) => j.job_id === id)?.title ?? `#${id}`;

  const updateStatus = async (candidateId: number, newStatus: string) => {
    try {
      await api.patch(`/candidates/${candidateId}/status`, { status: newStatus });
      onNotice(`Candidate marked as ${newStatus}.`);
      await onRefresh();
    } catch (err) { onNotice(extractErrorMessage(err, "Could not update candidate status.")); }
  };

  return (
    <>
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Recruitment</h1>
          <p className="mt-2 text-sm text-slate-500">Post jobs, manage candidates, and run the hire flow.</p>
        </div>
      </section>

      <div className="mt-6 flex gap-1 rounded-xl bg-slate-100 p-1 w-fit">
        {(["jobs", "candidates", "interviews", "onboarding"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`rounded-lg px-4 py-2 text-sm font-semibold capitalize transition ${tab === t ? "bg-white text-brand-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
            {t}
          </button>
        ))}
      </div>

      {tab === "jobs" && (
        <div className="mt-6">
          <div className="flex justify-end">
            <button onClick={() => setShowAddJob(true)} className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-600"><Plus size={16} /> Post job</button>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {jobs.length ? jobs.map((job) => (
              <Card key={job.job_id}>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-bold text-slate-800">{job.title}</p>
                    <p className="mt-1 text-xs text-slate-400">{departmentName(job.department_id)}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusStyle(job.status)}`}>{job.status}</span>
                </div>
                {job.description && <p className="mt-3 text-sm text-slate-500 line-clamp-2">{job.description}</p>}
                <p className="mt-3 text-xs text-slate-400">{job.positions_count} position{job.positions_count !== 1 ? "s" : ""} · {candidates.filter((c) => c.applied_job_id === job.job_id).length} candidates</p>
              </Card>
            )) : <Card className="col-span-full py-12 text-center text-sm text-slate-400">No job openings yet.</Card>}
          </div>
        </div>
      )}

      {tab === "candidates" && (
        <div className="mt-6">
          <div className="flex justify-end">
            <button onClick={() => setShowAddCandidate(true)} disabled={!jobs.length} className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-600 disabled:opacity-50"><Plus size={16} /> Add candidate</button>
          </div>
          <Card className="mt-4 overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="px-6 py-3 font-semibold">Candidate</th>
                    <th className="px-6 py-3 font-semibold">Applied for</th>
                    <th className="px-6 py-3 font-semibold">Status</th>
                    <th className="px-6 py-3 font-semibold">Update</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {candidates.length ? candidates.map((c) => (
                    <tr key={c.candidate_id} className="text-slate-600">
                      <td className="px-6 py-4"><p className="font-semibold text-slate-700">{c.candidate_name}</p><p className="text-xs text-slate-400">{c.email}</p></td>
                      <td className="px-6 py-4">{jobTitle(c.applied_job_id)}</td>
                      <td className="px-6 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusStyle(c.status)}`}>{c.status}</span></td>
                      <td className="px-6 py-4">
                        {c.status === "Hired" || c.status === "Rejected" ? (
                          <span className="text-xs text-slate-400">Pipeline closed</span>
                        ) : (
                          <select
                            defaultValue=""
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === "Hired") setHireModal(c);
                              else if (val) void updateStatus(c.candidate_id, val);
                              e.target.value = "";
                            }}
                            className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-semibold outline-none focus:border-brand-400"
                          >
                            <option value="">Move to…</option>
                            {CANDIDATE_STATUSES.filter((s) => s !== c.status).map((s) => <option key={s} value={s}>{s}</option>)}
                          </select>
                        )}
                      </td>
                    </tr>
                  )) : <tr><td colSpan={4} className="px-6 py-14 text-center text-slate-400">No candidates yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {tab === "interviews" && <ScheduleInterviewCard candidates={candidates} employees={employees} onNotice={onNotice} />}
      {tab === "onboarding" && <OnboardingCard employees={employees} onNotice={onNotice} />}

      {showAddJob && (
        <AddJobModal departments={departments} designations={designations} onClose={() => setShowAddJob(false)}
          onSaved={async () => { setShowAddJob(false); onNotice("Job posted."); await onRefresh(); }} onNotice={onNotice} />
      )}
      {showAddCandidate && (
        <AddCandidateModal jobs={jobs} onClose={() => setShowAddCandidate(false)}
          onSaved={async () => { setShowAddCandidate(false); onNotice("Candidate added."); await onRefresh(); }} onNotice={onNotice} />
      )}
      {hireModal && (
        <HireCandidateModal
          candidate={hireModal} designations={designations} employees={employees}
          onClose={() => setHireModal(null)}
          onSaved={async () => { setHireModal(null); onNotice(`${hireModal.candidate_name} hired and converted to an employee.`); await onRefresh(); }}
          onNotice={onNotice}
        />
      )}
    </>
  );
}

function AddJobModal({ departments, designations, onClose, onSaved, onNotice }: {
  departments: Department[]; designations: Designation[]; onClose: () => void; onSaved: () => Promise<void>; onNotice: (m: string) => void;
}) {
  const [form, setForm] = useState({ title: "", department_id: String(departments[0]?.department_id ?? ""), designation_id: "", description: "", positions_count: "1" });
  const [saving, setSaving] = useState(false);
  const availableDesignations = designations.filter((d) => d.department_id === Number(form.department_id));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      await api.post("/jobs", {
        title: form.title, department_id: Number(form.department_id),
        designation_id: form.designation_id ? Number(form.designation_id) : undefined,
        description: form.description || undefined, positions_count: Number(form.positions_count),
      });
      await onSaved();
    } catch (err) { onNotice(extractErrorMessage(err, "Could not post job.")); }
    finally { setSaving(false); }
  };

  return (
    <Modal onClose={onClose}>
      <h2 className="text-lg font-bold text-slate-800">Post job opening</h2>
      <form onSubmit={submit} className="mt-5 space-y-4">
        <Field label="Title"><input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={inputClass} /></Field>
        <Field label="Department">
          <select required value={form.department_id} onChange={(e) => setForm({ ...form, department_id: e.target.value, designation_id: "" })} className={inputClass}>
            {departments.map((d) => <option key={d.department_id} value={d.department_id}>{d.department_name}</option>)}
          </select>
        </Field>
        <Field label="Designation (optional)">
          <select value={form.designation_id} onChange={(e) => setForm({ ...form, designation_id: e.target.value })} className={inputClass}>
            <option value="">None</option>
            {availableDesignations.map((d) => <option key={d.designation_id} value={d.designation_id}>{d.title}</option>)}
          </select>
        </Field>
        <Field label="Positions"><input type="number" min="1" value={form.positions_count} onChange={(e) => setForm({ ...form, positions_count: e.target.value })} className={inputClass} /></Field>
        <Field label="Description"><textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={`${inputClass} resize-none`} /></Field>
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
          <button disabled={saving} className="rounded-xl bg-brand-500 px-4 py-2 text-sm font-bold text-white hover:bg-brand-600 disabled:opacity-60">{saving ? "Posting…" : "Post job"}</button>
        </div>
      </form>
    </Modal>
  );
}

function AddCandidateModal({ jobs, onClose, onSaved, onNotice }: {
  jobs: JobOpening[]; onClose: () => void; onSaved: () => Promise<void>; onNotice: (m: string) => void;
}) {
  const [form, setForm] = useState({ candidate_name: "", email: "", phone: "", resume_url: "", applied_job_id: String(jobs[0]?.job_id ?? ""), source: "" });
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      await api.post("/candidates", {
        candidate_name: form.candidate_name, email: form.email, phone: form.phone || undefined,
        resume_url: form.resume_url || undefined, applied_job_id: Number(form.applied_job_id), source: form.source || undefined,
      });
      await onSaved();
    } catch (err) { onNotice(extractErrorMessage(err, "Could not add candidate.")); }
    finally { setSaving(false); }
  };

  return (
    <Modal onClose={onClose}>
      <h2 className="text-lg font-bold text-slate-800">Add candidate</h2>
      <form onSubmit={submit} className="mt-5 space-y-4">
        <Field label="Full name"><input required value={form.candidate_name} onChange={(e) => setForm({ ...form, candidate_name: e.target.value })} className={inputClass} /></Field>
        <Field label="Email"><input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputClass} /></Field>
        <Field label="Phone"><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={inputClass} /></Field>
        <Field label="Applied for">
          <select required value={form.applied_job_id} onChange={(e) => setForm({ ...form, applied_job_id: e.target.value })} className={inputClass}>
            <option value="">Select job</option>
            {jobs.map((j) => <option key={j.job_id} value={j.job_id}>{j.title}</option>)}
          </select>
        </Field>
        <Field label="Source"><input value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} placeholder="e.g. LinkedIn, Referral" className={inputClass} /></Field>
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
          <button disabled={saving} className="rounded-xl bg-brand-500 px-4 py-2 text-sm font-bold text-white hover:bg-brand-600 disabled:opacity-60">{saving ? "Adding…" : "Add candidate"}</button>
        </div>
      </form>
    </Modal>
  );
}

function HireCandidateModal({ candidate, designations, employees, onClose, onSaved, onNotice }: {
  candidate: Candidate; designations: Designation[]; employees: Employee[];
  onClose: () => void; onSaved: () => Promise<void>; onNotice: (m: string) => void;
}) {
  const [form, setForm] = useState({
    designation_id: "", manager_id: "", employment_type: "Full-Time", base_salary: "", hire_date: new Date().toISOString().slice(0, 10),
  });
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      await api.patch(`/candidates/${candidate.candidate_id}/status`, {
        status: "Hired",
        designation_id: form.designation_id ? Number(form.designation_id) : undefined,
        manager_id: form.manager_id ? Number(form.manager_id) : undefined,
        employment_type: form.employment_type, base_salary: Number(form.base_salary || 0), hire_date: form.hire_date,
      });
      await onSaved();
    } catch (err) { onNotice(extractErrorMessage(err, "Could not complete hire flow.")); }
    finally { setSaving(false); }
  };

  return (
    <Modal onClose={onClose}>
      <h2 className="text-lg font-bold text-slate-800">Hire {candidate.candidate_name}</h2>
      <p className="mt-1 text-sm text-slate-500">This automatically converts the candidate into a real employee record.</p>
      <form onSubmit={submit} className="mt-5 space-y-4">
        <Field label="Designation (falls back to the job's, if any)">
          <select value={form.designation_id} onChange={(e) => setForm({ ...form, designation_id: e.target.value })} className={inputClass}>
            <option value="">Use job's designation</option>
            {designations.map((d) => <option key={d.designation_id} value={d.designation_id}>{d.title}</option>)}
          </select>
        </Field>
        <Field label="Manager (optional)">
          <select value={form.manager_id} onChange={(e) => setForm({ ...form, manager_id: e.target.value })} className={inputClass}>
            <option value="">None (top-level)</option>
            {employees.map((e) => <option key={e.employee_id} value={e.employee_id}>{fullName(e)}</option>)}
          </select>
        </Field>
        <Field label="Employment type">
          <select value={form.employment_type} onChange={(e) => setForm({ ...form, employment_type: e.target.value })} className={inputClass}>
            <option>Full-Time</option><option>Part-Time</option><option>Contract</option>
          </select>
        </Field>
        <Field label="Base salary"><input type="number" min="0" step="0.01" value={form.base_salary} onChange={(e) => setForm({ ...form, base_salary: e.target.value })} className={inputClass} /></Field>
        <Field label="Hire date"><input type="date" value={form.hire_date} onChange={(e) => setForm({ ...form, hire_date: e.target.value })} className={inputClass} /></Field>
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
          <button disabled={saving} className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-600 disabled:opacity-60">{saving ? "Hiring…" : "Confirm hire"}</button>
        </div>
      </form>
    </Modal>
  );
}

function ScheduleInterviewCard({ candidates, employees, onNotice }: {
  candidates: Candidate[]; employees: Employee[]; onNotice: (m: string) => void;
}) {
  const [form, setForm] = useState({ candidate_id: "", interviewer_id: "", scheduled_on: "", feedback: "", rating: "" });
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      await api.post("/interviews", {
        candidate_id: Number(form.candidate_id), interviewer_id: Number(form.interviewer_id),
        scheduled_on: new Date(form.scheduled_on).toISOString(),
        feedback: form.feedback || undefined, rating: form.rating ? Number(form.rating) : undefined,
      });
      onNotice("Interview scheduled.");
      setForm({ candidate_id: "", interviewer_id: "", scheduled_on: "", feedback: "", rating: "" });
    } catch (err) { onNotice(extractErrorMessage(err, "Could not schedule interview.")); }
    finally { setSaving(false); }
  };

  const activeCandidates = candidates.filter((c) => c.status !== "Hired" && c.status !== "Rejected");

  return (
    <Card className="mt-6 max-w-xl">
      <h2 className="text-base font-bold text-slate-800">Schedule interview</h2>
      <p className="mt-1 text-xs text-slate-400">Shared with the Manager role — either can schedule interviews.</p>
      <form onSubmit={submit} className="mt-5 space-y-4">
        <Field label="Candidate">
          <select required value={form.candidate_id} onChange={(e) => setForm({ ...form, candidate_id: e.target.value })} className={inputClass}>
            <option value="">Select candidate</option>
            {activeCandidates.map((c) => <option key={c.candidate_id} value={c.candidate_id}>{c.candidate_name}</option>)}
          </select>
        </Field>
        <Field label="Interviewer">
          <select required value={form.interviewer_id} onChange={(e) => setForm({ ...form, interviewer_id: e.target.value })} className={inputClass}>
            <option value="">Select interviewer</option>
            {employees.map((e) => <option key={e.employee_id} value={e.employee_id}>{fullName(e)}</option>)}
          </select>
        </Field>
        <Field label="Scheduled on"><input required type="datetime-local" value={form.scheduled_on} onChange={(e) => setForm({ ...form, scheduled_on: e.target.value })} className={inputClass} /></Field>
        <Field label="Feedback (optional)"><textarea rows={2} value={form.feedback} onChange={(e) => setForm({ ...form, feedback: e.target.value })} className={`${inputClass} resize-none`} /></Field>
        <Field label="Rating (optional, 0-10)"><input type="number" min="0" max="10" step="0.1" value={form.rating} onChange={(e) => setForm({ ...form, rating: e.target.value })} className={inputClass} /></Field>
        <button disabled={saving} className="rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-600 disabled:opacity-60">{saving ? "Scheduling…" : "Schedule interview"}</button>
      </form>
    </Card>
  );
}

function OnboardingCard({ employees, onNotice }: { employees: Employee[]; onNotice: (m: string) => void }) {
  const [form, setForm] = useState({ employee_id: "", task_name: "", assigned_to: "", due_date: "" });
  const [saving, setSaving] = useState(false);
  const [lookupId, setLookupId] = useState("");
  const [tasks, setTasks] = useState<OnboardingTask[]>([]);
  const [looking, setLooking] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      await api.post("/onboarding-tasks", {
        employee_id: Number(form.employee_id), task_name: form.task_name,
        assigned_to: Number(form.assigned_to), due_date: form.due_date || undefined,
      });
      onNotice("Onboarding task created.");
      setForm({ employee_id: "", task_name: "", assigned_to: "", due_date: "" });
    } catch (err) { onNotice(extractErrorMessage(err, "Could not create onboarding task.")); }
    finally { setSaving(false); }
  };

  const lookup = async () => {
    if (!lookupId) return;
    try {
      setLooking(true);
      const { data } = await api.get<OnboardingTask[]>(`/onboarding-tasks/${lookupId}`);
      setTasks(data);
    } catch (err) { onNotice(extractErrorMessage(err, "Could not load onboarding tasks.")); }
    finally { setLooking(false); }
  };

  return (
    <div className="mt-6 grid gap-5 xl:grid-cols-2">
      <Card>
        <h2 className="text-base font-bold text-slate-800">Create onboarding task</h2>
        <p className="mt-1 text-xs text-slate-400">Shared with the Manager role — either can assign onboarding tasks.</p>
        <form onSubmit={submit} className="mt-5 space-y-4">
          <Field label="For employee">
            <select required value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value })} className={inputClass}>
              <option value="">Select employee</option>
              {employees.map((e) => <option key={e.employee_id} value={e.employee_id}>{fullName(e)}</option>)}
            </select>
          </Field>
          <Field label="Task name"><input required value={form.task_name} onChange={(e) => setForm({ ...form, task_name: e.target.value })} placeholder="e.g. Laptop setup" className={inputClass} /></Field>
          <Field label="Assigned to">
            <select required value={form.assigned_to} onChange={(e) => setForm({ ...form, assigned_to: e.target.value })} className={inputClass}>
              <option value="">Select assignee</option>
              {employees.map((e) => <option key={e.employee_id} value={e.employee_id}>{fullName(e)}</option>)}
            </select>
          </Field>
          <Field label="Due date (optional)"><input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} className={inputClass} /></Field>
          <button disabled={saving} className="rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-600 disabled:opacity-60">{saving ? "Creating…" : "Create task"}</button>
        </form>
      </Card>
      <Card>
        <h2 className="text-base font-bold text-slate-800">View tasks for employee</h2>
        <div className="mt-4 flex gap-2">
          <select value={lookupId} onChange={(e) => setLookupId(e.target.value)} className={inputClass}>
            <option value="">Select employee</option>
            {employees.map((e) => <option key={e.employee_id} value={e.employee_id}>{fullName(e)}</option>)}
          </select>
          <button onClick={() => void lookup()} disabled={looking || !lookupId} className="shrink-0 rounded-xl bg-slate-800 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-700 disabled:opacity-60">View</button>
        </div>
        <div className="mt-4 divide-y divide-slate-100">
          {tasks.length ? tasks.map((t) => (
            <div key={t.onboarding_id} className="flex items-center justify-between py-2.5 text-sm">
              <span className="font-medium text-slate-700">{t.task_name}</span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${statusStyle(t.status)}`}>{t.status}</span>
            </div>
          )) : <p className="py-4 text-sm text-slate-400">No tasks loaded. Select an employee and click View.</p>}
        </div>
      </Card>
    </div>
  );
}

// ─── Leave Approvals (top-of-hierarchy) ──────────────────────────────────────
function LeaveApprovalsPage({ requests, leaveTypes, employeeById, onRefresh, onNotice }: {
  requests: LeaveRequest[]; leaveTypes: LeaveType[];
  employeeById: (id: number) => Employee | undefined;
  onRefresh: () => Promise<void>; onNotice: (m: string) => void;
}) {
  const [acting, setActing] = useState<number | null>(null);
  const [rejectId, setRejectId] = useState<number | null>(null);
  const [comment, setComment] = useState("");

  const pending = requests.filter((r) => r.status === "Pending");
  const resolved = requests.filter((r) => r.status !== "Pending");
  const typeName = (id: number) => leaveTypes.find((t) => t.leave_type_id === id)?.leave_type_name ?? "Leave";

  const approve = async (id: number) => {
    try { setActing(id); await api.post(`/leave/${id}/approve`); onNotice("Leave request approved."); await onRefresh(); }
    catch (err) { onNotice(extractErrorMessage(err, "Could not approve request.")); }
    finally { setActing(null); }
  };

  const reject = async () => {
    if (!rejectId) return;
    try {
      setActing(rejectId);
      await api.post(`/leave/${rejectId}/reject`, { manager_comments: comment });
      onNotice("Leave request rejected.");
      setRejectId(null); setComment("");
      await onRefresh();
    } catch (err) { onNotice(extractErrorMessage(err, "Could not reject request.")); }
    finally { setActing(null); }
  };

  return (
    <>
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Leave approvals</h1>
          <p className="mt-2 text-sm text-slate-500">Top-of-hierarchy coverage: employees with no manager assigned.</p>
        </div>
        {pending.length > 0 && <span className="inline-flex h-8 items-center rounded-full bg-amber-100 px-3 text-sm font-bold text-amber-700">{pending.length} pending</span>}
      </section>

      {rejectId !== null && (
        <Modal onClose={() => { setRejectId(null); setComment(""); }}>
          <h2 className="text-base font-bold text-slate-800">Reject leave request</h2>
          <p className="mt-1 text-sm text-slate-500">Add a comment to explain your decision (optional).</p>
          <textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Optional reason…" rows={3} className={`mt-4 ${inputClass} resize-none`} />
          <div className="mt-4 flex justify-end gap-3">
            <button onClick={() => { setRejectId(null); setComment(""); }} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
            <button onClick={() => void reject()} disabled={acting === rejectId} className="rounded-xl bg-rose-500 px-4 py-2 text-sm font-bold text-white hover:bg-rose-600 disabled:opacity-60">{acting === rejectId ? "Rejecting…" : "Reject"}</button>
          </div>
        </Modal>
      )}

      <div className="mt-7">
        <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-400">Pending ({pending.length})</h2>
        {pending.length ? (
          <div className="space-y-4">
            {pending.map((r) => {
              const emp = employeeById(r.employee_id);
              return (
                <Card key={r.leave_request_id} className="flex flex-col gap-4 sm:flex-row sm:items-center">
                  <div className="flex flex-1 items-center gap-3 min-w-0">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#a9c8ff] to-[#607bf0] text-xs font-bold text-white">{emp ? initials(emp) : "?"}</div>
                    <div className="min-w-0">
                      <p className="font-bold text-slate-800">{emp ? fullName(emp) : `Employee #${r.employee_id}`}</p>
                      <p className="text-xs text-slate-400">{typeName(r.leave_type_id)} · {formatDate(r.start_date)} – {formatDate(r.end_date)} · {r.no_of_days} day{r.no_of_days !== 1 ? "s" : ""}</p>
                      {r.reason && <p className="mt-1 truncate text-xs text-slate-500">"{r.reason}"</p>}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button onClick={() => void approve(r.leave_request_id)} disabled={acting === r.leave_request_id} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-600 disabled:opacity-60">
                      <CheckCircle size={15} />{acting === r.leave_request_id ? "…" : "Approve"}
                    </button>
                    <button onClick={() => setRejectId(r.leave_request_id)} disabled={acting === r.leave_request_id} className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-white px-4 py-2 text-sm font-bold text-rose-600 hover:bg-rose-50 disabled:opacity-60">
                      <XCircle size={15} /> Reject
                    </button>
                  </div>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card className="py-12 text-center">
            <CheckCircle className="mx-auto text-emerald-300" size={34} />
            <p className="mt-3 font-bold text-slate-700">All caught up!</p>
            <p className="mt-1 text-sm text-slate-400">No pending leave requests from unmanaged employees.</p>
          </Card>
        )}
      </div>

      {resolved.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-400">History ({resolved.length})</h2>
          <Card className="overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="px-6 py-3 font-semibold">Employee</th>
                    <th className="px-6 py-3 font-semibold">Leave type</th>
                    <th className="px-6 py-3 font-semibold">Dates</th>
                    <th className="px-6 py-3 font-semibold">Days</th>
                    <th className="px-6 py-3 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {resolved.map((r) => {
                    const emp = employeeById(r.employee_id);
                    return (
                      <tr key={r.leave_request_id} className="text-slate-600">
                        <td className="px-6 py-4 font-semibold text-slate-700">{emp ? fullName(emp) : `#${r.employee_id}`}</td>
                        <td className="px-6 py-4">{typeName(r.leave_type_id)}</td>
                        <td className="px-6 py-4">{formatDate(r.start_date)} – {formatDate(r.end_date)}</td>
                        <td className="px-6 py-4">{r.no_of_days}</td>
                        <td className="px-6 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusStyle(r.status)}`}>{r.status}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
