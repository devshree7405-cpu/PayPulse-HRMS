import {
  Bell, CalendarDays, ChevronDown, Clock3, FileText, LayoutDashboard,
  LogOut, Menu, Plane, Plus, ReceiptText, Save, Settings, Star,
  UserRound, Users, X, CheckCircle, XCircle, TrendingUp,
} from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { api, extractErrorMessage } from "../../lib/api";

type Page =
  | "overview" | "attendance" | "leave" | "payslips" | "profile"
  | "team-approvals" | "team-performance" | "team-directory";

type Employee = {
  employee_id: number; employee_code: string; first_name: string; last_name: string;
  personal_email: string; phone: string | null; address: string | null; hire_date: string;
  employment_type: string; employment_status: string; department_id: number; designation_id: number;
  emergency_contact_name: string | null; emergency_contact_phone: string | null;
  manager_id: number | null;
};
type Attendance = {
  attendance_id: number; attendance_date: string; check_in_time: string | null;
  check_out_time: string | null; status: string; hours_worked: number | null;
};
type LeaveType = { leave_type_id: number; leave_type_name: string; max_days_per_year: number };
type LeaveBalance = { leave_type_id: number; allocated: number; used: number; remaining: number };
type LeaveRequest = {
  leave_request_id: number; leave_type_id: number; start_date: string; end_date: string;
  no_of_days: number; reason: string | null; status: string; applied_on: string;
  employee_id: number;
};
type Payslip = {
  payslip_id: number; payslip_month: number; payslip_year: number; gross_pay: number;
  total_deductions: number; net_pay: number; status: string;
  details: { component_id: number; component_type: string; amount: number }[];
};
type ReviewCycle = { cycle_id: number; cycle_name: string; start_date: string; end_date: string; status: string };
type PerformanceReview = {
  review_id: number; employee_id: number; cycle_id: number; reviewer_id: number;
  self_rating: string | null; manager_rating: string | null;
  self_comments: string | null; manager_feedback: string | null;
  final_rating: string | null; status: string;
};

const RATING_OPTIONS = ["Needs Improvement", "Meets Expectations", "Exceeds Expectations", "Outstanding"] as const;

const navigation: { page: Page; label: string; icon: typeof LayoutDashboard; section?: string }[] = [
  { page: "overview", label: "Overview", icon: LayoutDashboard },
  { page: "attendance", label: "My attendance", icon: Clock3 },
  { page: "leave", label: "My leave", icon: Plane },
  { page: "payslips", label: "My payslips", icon: ReceiptText },
  { page: "profile", label: "My profile", icon: UserRound },
  { page: "team-directory", label: "Team directory", icon: Users, section: "Team" },
  { page: "team-approvals", label: "Leave approvals", icon: CheckCircle, section: "Team" },
  { page: "team-performance", label: "Performance reviews", icon: Star, section: "Team" },
];
const pageTitles: Record<Page, string> = {
  overview: "Overview", attendance: "My attendance", leave: "My leave",
  payslips: "My payslips", profile: "My profile",
  "team-directory": "Team directory", "team-approvals": "Leave approvals",
  "team-performance": "Performance reviews",
};

const monthName = new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric" });
const money = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

function initials(e: Employee | null) {
  return e ? `${e.first_name[0]}${e.last_name[0]}`.toUpperCase() : "M";
}
function fullName(e: Employee) { return `${e.first_name} ${e.last_name}`; }
function formatDate(v: string) {
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" })
    .format(new Date(`${v}T00:00:00`));
}
function formatTime(v: string | null) {
  return v ? new Date(`1970-01-01T${v}`).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—";
}
function statusStyle(s: string) {
  return s === "Approved" || s === "Present"
    ? "bg-emerald-50 text-emerald-700"
    : s === "Pending"
    ? "bg-amber-50 text-amber-700"
    : s === "Rejected" || s === "Absent"
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

export default function ManagerDashboard() {
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
  const [team, setTeam] = useState<Employee[]>([]);
  const [teamLeaveRequests, setTeamLeaveRequests] = useState<LeaveRequest[]>([]);
  const [cycles, setCycles] = useState<ReviewCycle[]>([]);
  const [teamReviews, setTeamReviews] = useState<PerformanceReview[]>([]);

  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [notice, setNotice] = useState("");

  const load = async () => {
    if (!session) return;
    try {
      setLoading(true);
      const id = session.employeeId;
      const year = new Date().getFullYear();

      const [meRes, attRes, typesRes, balRes, reqRes, payRes, teamRes, cyclesRes, reviewsRes] =
        await Promise.all([
          api.get<Employee>(`/employees/${id}`),
          api.get<Attendance[]>(`/attendance/${id}`),
          api.get<LeaveType[]>("/leave/types"),
          api.get<LeaveBalance[]>(`/leave/balance/${id}?year=${year}`),
          api.get<LeaveRequest[]>(`/leave/requests/${id}`),
          api.get<Payslip[]>(`/payroll/payslip/${id}`),
          api.get<Employee[]>("/employees"),
          api.get<ReviewCycle[]>("/performance/cycles"),
          api.get<PerformanceReview[]>("/performance/reviews/my-team"),
        ]);

      setMe(meRes.data);
      setMyAttendance(attRes.data);
      setLeaveTypes(typesRes.data);
      setMyBalances(balRes.data);
      setMyRequests(reqRes.data);
      setMyPayslips(payRes.data);

      const directReports = teamRes.data.filter((e) => e.manager_id === id);
      setTeam(directReports);

      const allLeaveReqs = await Promise.all(
        directReports.map((e) =>
          api.get<LeaveRequest[]>(`/leave/requests/${e.employee_id}`)
            .then((r) => r.data)
            .catch(() => [] as LeaveRequest[])
        )
      );
      setTeamLeaveRequests(allLeaveReqs.flat());
      setCycles(cyclesRes.data);
      setTeamReviews(reviewsRes.data);
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
  const myName = me ? `${me.first_name} ${me.last_name}` : "Manager";

  const selectPage = (page: Page) => { setActivePage(page); setMobileNavOpen(false); };

  const doAttendance = async () => {
    try {
      setActionLoading(true);
      await api.post(checkedIn ? "/attendance/checkout" : "/attendance/checkin");
      setNotice(checkedIn ? "Checked out for today." : "Checked in. Have a great day!");
      await load();
    } catch (err) {
      setNotice(extractErrorMessage(err, "Attendance could not be updated."));
    } finally {
      setActionLoading(false);
    }
  };

  const doLogout = () => { logout(); navigate("/login", { replace: true }); };

  const pendingTeamLeave = teamLeaveRequests.filter((r) => r.status === "Pending");
  const employeeById = (id: number) => team.find((e) => e.employee_id === id);

  const sidebar = (
    <aside className="flex h-full w-64 flex-col border-r border-slate-200/80 bg-white px-4 py-6">
      <div className="flex items-center gap-3 px-3">
        <BrandMark />
        <span className="text-lg font-bold tracking-tight text-slate-900">PayPulse</span>
      </div>
      <p className="mt-10 px-3 text-[11px] font-bold uppercase tracking-[0.13em] text-slate-400">Manager portal</p>
      <nav className="mt-3 space-y-1" aria-label="Manager navigation">
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
                {page === "team-approvals" && pendingTeamLeave.length > 0 && (
                  <span className="ml-auto rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">
                    {pendingTeamLeave.length}
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
        <button
          className="fixed inset-0 z-30 bg-slate-900/30 lg:hidden"
          aria-label="Close navigation"
          onClick={() => setMobileNavOpen(false)}
        />
      )}
      <div className={`fixed inset-y-0 left-0 z-40 transition-transform lg:translate-x-0 ${mobileNavOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <button
          onClick={() => setMobileNavOpen(false)}
          className="absolute right-3 top-4 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 lg:hidden"
          aria-label="Close navigation"
        >
          <X size={20} />
        </button>
        {sidebar}
      </div>
      <main className="lg:ml-64">
        <header className="flex h-[76px] items-center justify-between border-b border-slate-200/80 bg-white px-5 sm:px-8">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileNavOpen(true)}
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
              aria-label="Open navigation"
            >
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
              {pendingTeamLeave.length > 0 && (
                <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full border-2 border-white bg-rose-500" />
              )}
            </button>
            <div className="hidden h-8 w-px bg-slate-200 sm:block" />
            <button onClick={() => selectPage("profile")} className="flex items-center gap-2 text-left">
              <div className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-[#a9c8ff] to-[#607bf0] text-sm font-bold text-white">
                {initials(me)}
              </div>
              <div className="hidden sm:block">
                <p className="text-sm font-semibold text-slate-700">{myName}</p>
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
              myRequests={myRequests} myBalances={myBalances} myPayslips={myPayslips}
              team={team} teamLeaveRequests={teamLeaveRequests}
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
          {activePage === "team-directory" && <TeamDirectoryPage team={team} />}
          {activePage === "team-approvals" && (
            <TeamApprovalsPage
              requests={teamLeaveRequests} leaveTypes={leaveTypes}
              employeeById={employeeById} onRefresh={load} onNotice={setNotice}
            />
          )}
          {activePage === "team-performance" && (
            <TeamPerformancePage
              team={team} cycles={cycles} reviews={teamReviews}
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
  me, checkedIn, myAttendance, myRequests, myBalances, myPayslips,
  team, teamLeaveRequests, actionLoading, onAttendance, onNavigate,
}: {
  me: Employee | null; checkedIn: boolean; myAttendance: Attendance[];
  myRequests: LeaveRequest[]; myBalances: LeaveBalance[]; myPayslips: Payslip[];
  team: Employee[]; teamLeaveRequests: LeaveRequest[];
  actionLoading: boolean; onAttendance: () => void; onNavigate: (p: Page) => void;
}) {
  const firstName = me?.first_name ?? "Manager";
  const remaining = myBalances.reduce((t, b) => t + Number(b.remaining), 0);
  const pendingLeave = teamLeaveRequests.filter((r) => r.status === "Pending").length;
  const recent = myAttendance.slice(0, 7).reverse();

  return (
    <>
      <section className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div>
          <p className="text-sm font-semibold text-brand-600">Good morning, {firstName} <span aria-hidden="true">👋</span></p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900 sm:text-[34px]">Your team at a glance.</h1>
          <p className="mt-2 text-sm text-slate-500">Manage your team's leave, performance, and attendance.</p>
        </div>
        <button
          onClick={() => onNavigate("team-approvals")}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 shadow-sm hover:border-brand-200 hover:text-brand-600"
        >
          <CheckCircle size={17} /> Review approvals {pendingLeave > 0 && <span className="ml-1 rounded-full bg-amber-100 px-1.5 text-xs text-amber-700">{pendingLeave}</span>}
        </button>
      </section>

      {/* Team stat tiles */}
      <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Team size", value: team.length, sub: "direct reports", icon: Users, color: "text-brand-600 bg-brand-50" },
          { label: "Pending approvals", value: pendingLeave, sub: "leave requests", icon: Plane, color: "text-amber-600 bg-amber-50" },
          { label: "My leave balance", value: remaining, sub: "days remaining", icon: CalendarDays, color: "text-emerald-600 bg-emerald-50" },
          { label: "My payslips", value: myPayslips.length, sub: "available", icon: ReceiptText, color: "text-violet-600 bg-violet-50" },
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

      {/* Attendance hero + recent bar chart */}
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
            <button
              disabled={actionLoading} onClick={onAttendance}
              className="rounded-xl bg-white px-5 py-2.5 text-sm font-bold text-brand-600 shadow-sm transition hover:bg-blue-50 disabled:cursor-wait disabled:opacity-70"
            >
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

      {/* Quick nav cards */}
      <section className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {[
          { page: "team-approvals" as Page, label: "Leave approvals", sub: `${pendingLeave} pending`, icon: CheckCircle },
          { page: "team-performance" as Page, label: "Performance reviews", sub: "Rate your team", icon: Star },
          { page: "team-directory" as Page, label: "Team directory", sub: `${team.length} members`, icon: Users },
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

      {/* My leave summary */}
      <Card className="mt-5">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-800">My leave requests</h2>
          <button onClick={() => onNavigate("leave")} className="text-sm font-semibold text-brand-600">Manage</button>
        </div>
        {myRequests.length ? (
          <div className="mt-4 space-y-3">
            {myRequests.slice(0, 3).map((r) => (
              <div key={r.leave_request_id} className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 text-sm">
                <div>
                  <p className="font-semibold text-slate-700">{formatDate(r.start_date)} – {formatDate(r.end_date)}</p>
                  <p className="text-xs text-slate-400">{r.no_of_days} day{r.no_of_days !== 1 ? "s" : ""}</p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusStyle(r.status)}`}>{r.status}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm text-slate-400">No leave requests yet.</p>
        )}
      </Card>
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
        <button
          disabled={actionLoading} onClick={onAttendance}
          className="rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-brand-600 disabled:opacity-70"
        >
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
              )) : (
                <tr><td colSpan={5} className="px-6 py-14 text-center text-slate-400">No attendance records yet.</td></tr>
              )}
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
  const [form, setForm] = useState({
    leave_type_id: String(types[0]?.leave_type_id ?? ""), start_date: "", end_date: "", reason: "",
  });
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
            <label className="text-sm font-semibold text-slate-600">Leave type
              <select required value={form.leave_type_id} onChange={(e) => setForm({ ...form, leave_type_id: e.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-normal outline-none focus:border-brand-400 focus:ring-3 focus:ring-brand-50">
                <option value="">Select type</option>
                {types.map((t) => <option key={t.leave_type_id} value={t.leave_type_id}>{t.leave_type_name}</option>)}
              </select>
            </label>
            <div />
            <label className="text-sm font-semibold text-slate-600">Start date
              <input required min={new Date().toISOString().slice(0, 10)} type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-brand-400 focus:ring-3 focus:ring-brand-50" />
            </label>
            <label className="text-sm font-semibold text-slate-600">End date
              <input required min={form.start_date || new Date().toISOString().slice(0, 10)} type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-brand-400 focus:ring-3 focus:ring-brand-50" />
            </label>
            <label className="sm:col-span-2 text-sm font-semibold text-slate-600">Reason
              <textarea required value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} rows={3} className="mt-1.5 w-full resize-none rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-brand-400 focus:ring-3 focus:ring-brand-50" />
            </label>
            <div className="sm:col-span-2 flex justify-end">
              <button disabled={saving || !types.length} className="rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-600 disabled:opacity-60">
                {saving ? "Submitting…" : "Submit request"}
              </button>
            </div>
          </form>
        </Card>
      </section>
      <Card className="mt-5 overflow-hidden p-0">
        <div className="px-5 py-5 sm:px-6">
          <h2 className="text-base font-bold text-slate-800">Request history</h2>
        </div>
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
            <label className="text-sm font-semibold text-slate-600">Phone number
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Add your phone number" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-brand-400 focus:ring-3 focus:ring-brand-50" />
            </label>
            <label className="text-sm font-semibold text-slate-600">Emergency contact
              <input value={form.emergency_contact_name} onChange={(e) => setForm({ ...form, emergency_contact_name: e.target.value })} placeholder="Contact name" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-brand-400 focus:ring-3 focus:ring-brand-50" />
            </label>
            <label className="text-sm font-semibold text-slate-600">Emergency phone
              <input value={form.emergency_contact_phone} onChange={(e) => setForm({ ...form, emergency_contact_phone: e.target.value })} placeholder="Contact phone number" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-brand-400 focus:ring-3 focus:ring-brand-50" />
            </label>
            <label className="sm:col-span-2 text-sm font-semibold text-slate-600">Address
              <textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} rows={3} className="mt-1.5 w-full resize-none rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-brand-400 focus:ring-3 focus:ring-brand-50" />
            </label>
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

// ─── Team Directory ───────────────────────────────────────────────────────────
function TeamDirectoryPage({ team }: { team: Employee[] }) {
  return (
    <>
      <section>
        <h1 className="text-3xl font-bold tracking-tight">Team directory</h1>
        <p className="mt-2 text-sm text-slate-500">Your direct reports at a glance.</p>
      </section>
      {team.length ? (
        <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {team.map((emp) => (
            <Card key={emp.employee_id}>
              <div className="flex items-center gap-4">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[#a9c8ff] to-[#607bf0] text-sm font-bold text-white">
                  {initials(emp)}
                </div>
                <div className="min-w-0">
                  <p className="truncate font-bold text-slate-800">{fullName(emp)}</p>
                  <p className="text-xs text-slate-400">{emp.employee_code}</p>
                </div>
              </div>
              <div className="mt-4 space-y-2 border-t border-slate-100 pt-4 text-sm">
                <p className="flex gap-2"><span className="text-slate-400 w-24 shrink-0">Email</span><span className="truncate font-medium text-slate-700">{emp.personal_email}</span></p>
                <p className="flex gap-2"><span className="text-slate-400 w-24 shrink-0">Status</span><span className={`rounded-full px-2 py-0.5 text-xs font-bold ${emp.employment_status === "Active" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{emp.employment_status}</span></p>
                <p className="flex gap-2"><span className="text-slate-400 w-24 shrink-0">Type</span><span className="font-medium text-slate-700">{emp.employment_type}</span></p>
                <p className="flex gap-2"><span className="text-slate-400 w-24 shrink-0">Joined</span><span className="font-medium text-slate-700">{formatDate(emp.hire_date)}</span></p>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="mt-7 py-16 text-center">
          <Users className="mx-auto text-brand-300" size={34} />
          <h2 className="mt-4 font-bold text-slate-700">No direct reports</h2>
          <p className="mt-1 text-sm text-slate-400">Your team members will appear here once assigned.</p>
        </Card>
      )}
    </>
  );
}

// ─── Team Leave Approvals ────────────────────────────────────────────────────
function TeamApprovalsPage({ requests, leaveTypes, employeeById, onRefresh, onNotice }: {
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
    try {
      setActing(id);
      await api.post(`/leave/${id}/approve`);
      onNotice("Leave request approved.");
      await onRefresh();
    } catch (err) { onNotice(extractErrorMessage(err, "Could not approve request.")); }
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
          <p className="mt-2 text-sm text-slate-500">Review and act on your team's leave requests.</p>
        </div>
        {pending.length > 0 && (
          <span className="inline-flex h-8 items-center rounded-full bg-amber-100 px-3 text-sm font-bold text-amber-700">
            {pending.length} pending
          </span>
        )}
      </section>

      {/* Reject modal */}
      {rejectId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-base font-bold text-slate-800">Reject leave request</h2>
            <p className="mt-1 text-sm text-slate-500">Add a comment to explain your decision (optional).</p>
            <textarea
              value={comment} onChange={(e) => setComment(e.target.value)}
              placeholder="Optional reason…" rows={3}
              className="mt-4 w-full resize-none rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-400 focus:ring-3 focus:ring-brand-50"
            />
            <div className="mt-4 flex justify-end gap-3">
              <button onClick={() => { setRejectId(null); setComment(""); }} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
              <button onClick={() => void reject()} disabled={acting === rejectId} className="rounded-xl bg-rose-500 px-4 py-2 text-sm font-bold text-white hover:bg-rose-600 disabled:opacity-60">
                {acting === rejectId ? "Rejecting…" : "Reject"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pending */}
      <div className="mt-7">
        <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-400">Pending ({pending.length})</h2>
        {pending.length ? (
          <div className="space-y-4">
            {pending.map((r) => {
              const emp = employeeById(r.employee_id);
              return (
                <Card key={r.leave_request_id} className="flex flex-col gap-4 sm:flex-row sm:items-center">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#a9c8ff] to-[#607bf0] text-xs font-bold text-white">
                      {emp ? initials(emp) : "?"}
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-slate-800">{emp ? fullName(emp) : `Employee #${r.employee_id}`}</p>
                      <p className="text-xs text-slate-400">{typeName(r.leave_type_id)} · {formatDate(r.start_date)} – {formatDate(r.end_date)} · {r.no_of_days} day{r.no_of_days !== 1 ? "s" : ""}</p>
                      {r.reason && <p className="mt-1 truncate text-xs text-slate-500">"{r.reason}"</p>}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      onClick={() => void approve(r.leave_request_id)}
                      disabled={acting === r.leave_request_id}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-600 disabled:opacity-60"
                    >
                      <CheckCircle size={15} />{acting === r.leave_request_id ? "…" : "Approve"}
                    </button>
                    <button
                      onClick={() => setRejectId(r.leave_request_id)}
                      disabled={acting === r.leave_request_id}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-white px-4 py-2 text-sm font-bold text-rose-600 hover:bg-rose-50 disabled:opacity-60"
                    >
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
            <p className="mt-1 text-sm text-slate-400">No pending leave requests from your team.</p>
          </Card>
        )}
      </div>

      {/* Resolved */}
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

// ─── Team Performance ────────────────────────────────────────────────────────
function TeamPerformancePage({ team, cycles, reviews, onRefresh, onNotice }: {
  team: Employee[]; cycles: ReviewCycle[]; reviews: PerformanceReview[];
  onRefresh: () => Promise<void>; onNotice: (m: string) => void;
}) {
  const [ratingForm, setRatingForm] = useState<{ reviewId: number; rating: string; feedback: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const activeCycles = cycles.filter((c) => c.status === "Active");
  const cycleById = (id: number) => cycles.find((c) => c.cycle_id === id);

  const submitRating = async (e: FormEvent) => {
    e.preventDefault();
    if (!ratingForm) return;
    try {
      setSaving(true);
      await api.patch(`/performance/reviews/${ratingForm.reviewId}/manager`, {
        manager_rating: ratingForm.rating,
        manager_feedback: ratingForm.feedback || undefined,
      });
      onNotice("Performance rating submitted.");
      setRatingForm(null);
      await onRefresh();
    } catch (err) { onNotice(extractErrorMessage(err, "Could not submit rating.")); }
    finally { setSaving(false); }
  };

  const empName = (id: number) => {
    const e = team.find((t) => t.employee_id === id);
    return e ? fullName(e) : `Employee #${id}`;
  };
  const empInitials = (id: number) => {
    const e = team.find((t) => t.employee_id === id);
    return e ? initials(e) : "?";
  };

  return (
    <>
      <section>
        <h1 className="text-3xl font-bold tracking-tight">Performance reviews</h1>
        <p className="mt-2 text-sm text-slate-500">Rate your team members and track review progress.</p>
      </section>

      {/* Rating modal */}
      {ratingForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-base font-bold text-slate-800">Submit manager rating</h2>
            <p className="mt-1 text-sm text-slate-500">Choose a rating and optionally add feedback.</p>
            <form onSubmit={(e) => void submitRating(e)} className="mt-5 space-y-4">
              <div className="grid grid-cols-2 gap-2">
                {RATING_OPTIONS.map((opt) => (
                  <button
                    key={opt} type="button"
                    onClick={() => setRatingForm({ ...ratingForm, rating: opt })}
                    className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                      ratingForm.rating === opt
                        ? "border-brand-400 bg-brand-50 text-brand-700"
                        : "border-slate-200 text-slate-600 hover:border-slate-300"
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
              <label className="block text-sm font-semibold text-slate-600">Feedback
                <textarea
                  value={ratingForm.feedback} onChange={(e) => setRatingForm({ ...ratingForm, feedback: e.target.value })}
                  placeholder="Optional feedback…" rows={3}
                  className="mt-1.5 w-full resize-none rounded-xl border border-slate-200 px-3 py-2.5 font-normal text-sm outline-none focus:border-brand-400 focus:ring-3 focus:ring-brand-50"
                />
              </label>
              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setRatingForm(null)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
                <button type="submit" disabled={saving || !ratingForm.rating} className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2 text-sm font-bold text-white hover:bg-brand-600 disabled:opacity-60">
                  <TrendingUp size={15} />{saving ? "Saving…" : "Submit rating"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Active cycles notice */}
      {activeCycles.length > 0 && (
        <div className="mt-7 rounded-xl border border-brand-100 bg-brand-50 px-4 py-3 text-sm text-brand-700">
          <strong>Active:</strong> {activeCycles.map((c) => c.cycle_name).join(", ")}
        </div>
      )}

      {/* Reviews list */}
      {reviews.length ? (
        <div className="mt-7 space-y-4">
          {reviews.map((review) => (
            <Card key={review.review_id}>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#a9c8ff] to-[#607bf0] text-xs font-bold text-white">
                    {empInitials(review.employee_id)}
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-slate-800">{empName(review.employee_id)}</p>
                    <p className="text-xs text-slate-400">
                      {cycleById(review.cycle_id)?.cycle_name ?? `Cycle #${review.cycle_id}`} ·
                      <span className={`ml-1 rounded-full px-2 py-0.5 text-xs font-bold ${statusStyle(review.status)}`}>{review.status}</span>
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-3">
                  {review.self_rating && (
                    <div className="text-right">
                      <p className="text-xs text-slate-400">Self rating</p>
                      <span className={`mt-0.5 inline-block rounded-full px-2.5 py-1 text-xs font-bold ${ratingColor(review.self_rating)}`}>{review.self_rating}</span>
                    </div>
                  )}
                  {review.manager_rating ? (
                    <div className="text-right">
                      <p className="text-xs text-slate-400">Manager rating</p>
                      <span className={`mt-0.5 inline-block rounded-full px-2.5 py-1 text-xs font-bold ${ratingColor(review.manager_rating)}`}>{review.manager_rating}</span>
                    </div>
                  ) : (
                    <button
                      onClick={() => setRatingForm({ reviewId: review.review_id, rating: "", feedback: "" })}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-brand-500 px-4 py-2 text-sm font-bold text-white hover:bg-brand-600"
                    >
                      <Star size={14} /> Rate
                    </button>
                  )}
                </div>
              </div>
              {(review.self_comments || review.manager_feedback) && (
                <div className="mt-4 grid gap-3 border-t border-slate-100 pt-4 text-sm sm:grid-cols-2">
                  {review.self_comments && <p className="rounded-lg bg-slate-50 p-3 text-slate-500"><span className="mb-1 block text-xs font-semibold text-slate-400">Self comments</span>{review.self_comments}</p>}
                  {review.manager_feedback && <p className="rounded-lg bg-brand-50 p-3 text-brand-700"><span className="mb-1 block text-xs font-semibold text-brand-500">Manager feedback</span>{review.manager_feedback}</p>}
                </div>
              )}
            </Card>
          ))}
        </div>
      ) : (
        <Card className="mt-7 py-16 text-center">
          <Star className="mx-auto text-brand-300" size={34} />
          <h2 className="mt-4 font-bold text-slate-700">No reviews assigned</h2>
          <p className="mt-1 text-sm text-slate-400">Performance reviews your team submits will appear here for you to rate.</p>
        </Card>
      )}
    </>
  );
}
