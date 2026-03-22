// src/ClinicDashboard.jsx
// ─── Full clinic dashboard: stats, appointments, doctor view, filled-day calendar ─
import { useState, useEffect, useCallback } from "react";
import {
  supabase,
  DOCTORS,
  getAppointments,
  getDashboardStats,
  getFullDaysForMonth,
  updateAppointmentStatus,
  cancelAppointment,
} from "./lib/clinic";

// ─── Styles / tokens ──────────────────────────────────────────────────────────
const C = {
  teal: "#0a7c73",
  teal2: "#0bbfb3",
  mint: "#e6f5f4",
  navy: "#0d2926",
  sub: "#5a7a77",
  border: "#c8e6e3",
  bg: "#f4faf9",
  card: "#ffffff",
  red: "#e05252",
  green: "#22c55e",
  amber: "#f59e0b",
  blue: "#3b82f6",
};

const STATUS_COLOR = {
  confirmed: { bg: "#dcfce7", text: "#16a34a", dot: "#22c55e" },
  completed: { bg: "#dbeafe", text: "#1d4ed8", dot: "#3b82f6" },
  cancelled: { bg: "#fee2e2", text: "#dc2626", dot: "#ef4444" },
};

// ─── Tiny reusable components ─────────────────────────────────────────────────
const Badge = ({ status }) => {
  const s = STATUS_COLOR[status] || STATUS_COLOR.confirmed;
  return (
    <span
      style={{
        background: s.bg,
        color: s.text,
        fontSize: 11,
        fontWeight: 600,
        padding: "3px 10px",
        borderRadius: 20,
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: s.dot,
          display: "inline-block",
        }}
      />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
};

const StatCard = ({ icon, label, value, sub, color, delay }) => (
  <div
    style={{
      background: C.card,
      borderRadius: 20,
      padding: "22px 24px",
      boxShadow: "0 2px 20px rgba(10,124,115,.07)",
      border: `1px solid ${C.border}`,
      animation: `slideUp .5s ${delay}s cubic-bezier(.22,1,.36,1) both`,
      display: "flex",
      flexDirection: "column",
      gap: 4,
    }}
  >
    <div style={{ fontSize: 28 }}>{icon}</div>
    <div
      style={{
        fontSize: 30,
        fontWeight: 700,
        color: color || C.teal,
        fontFamily: "'DM Serif Display',serif",
        marginTop: 6,
      }}
    >
      {value}
    </div>
    <div style={{ fontSize: 13, fontWeight: 600, color: C.navy }}>{label}</div>
    {sub && <div style={{ fontSize: 11.5, color: C.sub }}>{sub}</div>}
  </div>
);

// ─── Mini calendar component ──────────────────────────────────────────────────
function MiniCalendar({ year, month, fullDays, selectedDate, onSelect }) {
  const firstDay = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const today = new Date().toISOString().split("T")[0];
  const cells = [];

  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const pad = (n) => String(n).padStart(2, "0");

  return (
    <div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7,1fr)",
          gap: 2,
          marginBottom: 6,
        }}
      >
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <div
            key={i}
            style={{
              textAlign: "center",
              fontSize: 11,
              fontWeight: 600,
              color: C.sub,
              padding: "4px 0",
            }}
          >
            {d}
          </div>
        ))}
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7,1fr)",
          gap: 3,
        }}
      >
        {cells.map((d, i) => {
          if (!d) return <div key={i} />;
          const dateStr = `${year}-${pad(month)}-${pad(d)}`;
          const isFull = fullDays.has(dateStr);
          const isToday = dateStr === today;
          const isSelected = dateStr === selectedDate;
          return (
            <button
              key={i}
              onClick={() => onSelect(isSelected ? null : dateStr)}
              style={{
                aspectRatio: "1",
                borderRadius: 8,
                fontSize: 12,
                fontWeight: isToday ? 700 : 500,
                border: isSelected
                  ? `2px solid ${C.teal}`
                  : "2px solid transparent",
                background: isFull
                  ? "#fee2e2"
                  : isSelected
                    ? C.mint
                    : isToday
                      ? C.mint
                      : "transparent",
                color: isFull
                  ? C.red
                  : isSelected
                    ? C.teal
                    : isToday
                      ? C.teal
                      : C.navy,
                cursor: "pointer",
                transition: "all .15s",
                position: "relative",
              }}
            >
              {d}
              {isFull && (
                <span
                  style={{
                    position: "absolute",
                    top: 1,
                    right: 2,
                    fontSize: 8,
                    color: C.red,
                    fontWeight: 700,
                  }}
                >
                  ●
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div
        style={{
          display: "flex",
          gap: 12,
          marginTop: 10,
          fontSize: 11,
          color: C.sub,
        }}
      >
        <span>
          <span style={{ color: C.red }}>●</span> Fully Booked
        </span>
        <span>
          <span style={{ color: C.teal }}>●</span> Today / Selected
        </span>
      </div>
    </div>
  );
}

// ─── Appointment row ──────────────────────────────────────────────────────────
function AptRow({ apt, onStatusChange, onCancel }) {
  const [open, setOpen] = useState(false);
  const doctor = DOCTORS.find((d) => d.name === apt.doctor);

  return (
    <>
      <tr
        onClick={() => setOpen(!open)}
        style={{ cursor: "pointer", transition: "background .15s" }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "#f0fffe")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
      >
        <td style={tdStyle}>
          <div style={{ fontWeight: 600, color: C.navy, fontSize: 14 }}>
            {apt.patient_name}
          </div>
          <div style={{ fontSize: 12, color: C.sub }}>{apt.phone}</div>
        </td>
        <td style={tdStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: doctor?.color || C.teal,
                display: "inline-block",
                flexShrink: 0,
              }}
            />
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.navy }}>
                {apt.doctor}
              </div>
              <div style={{ fontSize: 11, color: C.sub }}>{apt.department}</div>
            </div>
          </div>
        </td>
        <td style={tdStyle}>
          <div style={{ fontSize: 13, color: C.navy }}>
            {new Date(apt.date + "T00:00:00").toLocaleDateString("en-IN", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </div>
          <div style={{ fontSize: 12, color: C.sub }}>{apt.time_slot}</div>
        </td>
        <td style={tdStyle}>
          <Badge status={apt.status} />
        </td>
        <td style={tdStyle}>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {apt.whatsapp_sent && (
              <span title="WhatsApp sent" style={{ fontSize: 16 }}>
                📲
              </span>
            )}
            {apt.gcal_event_id && (
              <span title="Calendar synced" style={{ fontSize: 16 }}>
                📅
              </span>
            )}
          </div>
        </td>
      </tr>
      {open && (
        <tr>
          <td
            colSpan={5}
            style={{ padding: "0 16px 16px", background: "#f0fffe" }}
          >
            <div
              style={{
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
                paddingTop: 10,
              }}
            >
              {apt.status !== "completed" && (
                <ActionBtn
                  label="✅ Mark Completed"
                  color={C.green}
                  onClick={() => onStatusChange(apt.id, "completed")}
                />
              )}
              {apt.status !== "cancelled" && (
                <ActionBtn
                  label="❌ Cancel"
                  color={C.red}
                  onClick={() => onCancel(apt.id)}
                />
              )}
              {apt.notes && (
                <div
                  style={{
                    fontSize: 12.5,
                    color: C.sub,
                    padding: "6px 12px",
                    background: "#fff",
                    borderRadius: 8,
                    border: `1px solid ${C.border}`,
                  }}
                >
                  📝 {apt.notes}
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function ActionBtn({ label, color, onClick }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      style={{
        background: color + "22",
        color,
        border: `1px solid ${color}44`,
        borderRadius: 8,
        padding: "6px 14px",
        fontSize: 12.5,
        fontWeight: 600,
        cursor: "pointer",
        transition: "all .15s",
      }}
    >
      {label}
    </button>
  );
}

const tdStyle = {
  padding: "14px 16px",
  verticalAlign: "middle",
  borderBottom: `1px solid ${C.border}`,
};

// ─── MAIN DASHBOARD ───────────────────────────────────────────────────────────
export default function ClinicDashboard() {
  const now = new Date();
  const [stats, setStats] = useState({ total: 0, today: 0, thisMonth: 0 });
  const [appointments, setApts] = useState([]);
  const [fullDays, setFullDays] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth() + 1);
  const [filterDoc, setFilterDoc] = useState("");
  const [filterDate, setFilterDate] = useState("");
  const [filterStatus, setFilterSt] = useState("");
  const [activeTab, setActiveTab] = useState("all"); // all | today | doctor
  const [sidebarOpen, setSidebar] = useState(true);

  // ── Data fetching ────────────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const currentDate = new Date();
      const [s, apts, fd] = await Promise.all([
        getDashboardStats(),
        getAppointments({
          doctor: filterDoc || undefined,
          date:
            (activeTab === "today"
              ? currentDate.toISOString().split("T")[0]
              : filterDate) || undefined,
          status: filterStatus || undefined,
        }),
        getFullDaysForMonth(calYear, calMonth),
      ]);
      setStats(s);
      setApts(apts);
      setFullDays(fd);
    } finally {
      setLoading(false);
    }
  }, [filterDoc, filterDate, filterStatus, activeTab, calYear, calMonth]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // ── Realtime subscription ────────────────────────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel("appointments-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "appointments" },
        fetchAll,
      )
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [fetchAll]);

  const handleStatusChange = async (id, status) => {
    await updateAppointmentStatus(id, status);
    fetchAll();
  };
  const handleCancel = async (id) => {
    if (window.confirm("Cancel this appointment?")) {
      await cancelAppointment(id);
      fetchAll();
    }
  };

  const calPrev = () => {
    if (calMonth === 1) {
      setCalYear((y) => y - 1);
      setCalMonth(12);
    } else setCalMonth((m) => m - 1);
  };
  const calNext = () => {
    if (calMonth === 12) {
      setCalYear((y) => y + 1);
      setCalMonth(1);
    } else setCalMonth((m) => m + 1);
  };

  const monthName = new Date(calYear, calMonth - 1).toLocaleString("en-IN", {
    month: "long",
    year: "numeric",
  });

  // ── Per-doctor stats ─────────────────────────────────────────────────────────
  const doctorStats = DOCTORS.map((doc) => {
    const all = appointments.filter((a) => a.doctor === doc.name);
    const todayApts = all.filter(
      (a) => a.date === now.toISOString().split("T")[0],
    );
    return { ...doc, total: all.length, today: todayApts.length };
  });

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@300;400;500;600&display=swap');
        *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
        body { font-family:'DM Sans',sans-serif; background:${C.bg}; min-height:100vh; }
        @keyframes slideUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
        @keyframes fadeIn  { from{opacity:0} to{opacity:1} }
        ::-webkit-scrollbar{width:5px} ::-webkit-scrollbar-thumb{background:${C.border};border-radius:4px}
        select { font-family:'DM Sans',sans-serif; }
        table  { border-collapse:collapse; width:100%; }
        th     { text-align:left; font-size:11px; font-weight:700; color:${C.sub}; letter-spacing:.8px; text-transform:uppercase; padding:10px 16px; background:#f8fdfc; border-bottom:2px solid ${C.border}; }
        tr:last-child td { border-bottom:none !important; }
      `}</style>

      <div style={{ display: "flex", minHeight: "100vh" }}>
        {/* ── SIDEBAR ── */}
        <aside
          style={{
            width: sidebarOpen ? 260 : 0,
            flexShrink: 0,
            overflow: "hidden",
            background: "#fff",
            borderRight: `1px solid ${C.border}`,
            transition: "width .3s cubic-bezier(.22,1,.36,1)",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              padding: "28px 24px 20px",
              borderBottom: `1px solid ${C.border}`,
            }}
          >
            <div
              style={{
                fontFamily: "'DM Serif Display',serif",
                fontSize: 22,
                color: C.teal,
              }}
            >
              HealthPlus
            </div>
            <div style={{ fontSize: 12, color: C.sub, marginTop: 2 }}>
              Clinic Management Dashboard
            </div>
          </div>

          {/* Nav */}
          <nav style={{ padding: "16px 12px", flex: 1, overflowY: "auto" }}>
            {[
              { id: "all", icon: "📋", label: "All Appointments" },
              { id: "today", icon: "📅", label: "Today's Schedule" },
              { id: "doctor", icon: "👨‍⚕️", label: "By Doctor" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  width: "100%",
                  textAlign: "left",
                  padding: "11px 14px",
                  borderRadius: 12,
                  border: "none",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  background: activeTab === tab.id ? C.mint : "transparent",
                  color: activeTab === tab.id ? C.teal : C.navy,
                  fontFamily: "'DM Sans',sans-serif",
                  fontSize: 14,
                  fontWeight: activeTab === tab.id ? 600 : 400,
                  marginBottom: 4,
                  transition: "all .15s",
                }}
              >
                <span style={{ fontSize: 16 }}>{tab.icon}</span>
                {tab.label}
              </button>
            ))}

            <div
              style={{ height: 1, background: C.border, margin: "12px 0" }}
            />

            {/* Doctor quick-filter */}
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: C.sub,
                letterSpacing: 0.8,
                padding: "0 6px 8px",
                textTransform: "uppercase",
              }}
            >
              Doctors
            </div>
            {DOCTORS.map((doc) => (
              <button
                key={doc.name}
                onClick={() => {
                  setFilterDoc(filterDoc === doc.name ? "" : doc.name);
                  setActiveTab("all");
                }}
                style={{
                  width: "100%",
                  textAlign: "left",
                  padding: "8px 14px",
                  borderRadius: 10,
                  border: "none",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  background:
                    filterDoc === doc.name ? doc.color + "22" : "transparent",
                  fontFamily: "'DM Sans',sans-serif",
                  fontSize: 13,
                  color: filterDoc === doc.name ? doc.color : C.sub,
                  marginBottom: 2,
                  transition: "all .15s",
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: doc.color,
                    display: "inline-block",
                    flexShrink: 0,
                  }}
                />
                <div>
                  <div
                    style={{
                      fontWeight: 600,
                      color: filterDoc === doc.name ? doc.color : C.navy,
                      fontSize: 12.5,
                    }}
                  >
                    {doc.name.replace("Dr. ", "Dr. ")}
                  </div>
                  <div style={{ fontSize: 11, color: C.sub }}>{doc.dept}</div>
                </div>
              </button>
            ))}
          </nav>

          {/* Mini Calendar */}
          <div
            style={{
              padding: "16px 20px 24px",
              borderTop: `1px solid ${C.border}`,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 12,
              }}
            >
              <button
                onClick={calPrev}
                style={{
                  border: "none",
                  background: "none",
                  cursor: "pointer",
                  color: C.sub,
                  fontSize: 16,
                  padding: "2px 6px",
                }}
              >
                ‹
              </button>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.navy }}>
                {monthName}
              </div>
              <button
                onClick={calNext}
                style={{
                  border: "none",
                  background: "none",
                  cursor: "pointer",
                  color: C.sub,
                  fontSize: 16,
                  padding: "2px 6px",
                }}
              >
                ›
              </button>
            </div>
            <MiniCalendar
              year={calYear}
              month={calMonth}
              fullDays={fullDays}
              selectedDate={filterDate}
              onSelect={(d) => {
                setFilterDate(d || "");
                setActiveTab("all");
              }}
            />
          </div>
        </aside>

        {/* ── MAIN ── */}
        <main style={{ flex: 1, overflowY: "auto", padding: "28px 32px" }}>
          {/* Top bar */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
              marginBottom: 28,
            }}
          >
            <button
              onClick={() => setSidebar(!sidebarOpen)}
              style={{
                border: `1px solid ${C.border}`,
                background: C.card,
                borderRadius: 10,
                padding: "8px 10px",
                cursor: "pointer",
                fontSize: 16,
              }}
            >
              ☰
            </button>
            <div style={{ flex: 1 }}>
              <h1
                style={{
                  fontFamily: "'DM Serif Display',serif",
                  fontSize: 26,
                  color: C.navy,
                }}
              >
                {activeTab === "today"
                  ? "Today's Schedule"
                  : activeTab === "doctor"
                    ? "By Doctor"
                    : "Appointments"}
              </h1>
              <div style={{ fontSize: 13, color: C.sub, marginTop: 2 }}>
                {new Date().toLocaleDateString("en-IN", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </div>
            </div>
            {loading && (
              <div
                style={{ fontSize: 12, color: C.sub, animation: "fadeIn .3s" }}
              >
                ⟳ Loading…
              </div>
            )}
            <button
              onClick={fetchAll}
              style={{
                background: C.teal,
                color: "#fff",
                border: "none",
                borderRadius: 10,
                padding: "9px 18px",
                cursor: "pointer",
                fontFamily: "'DM Sans',sans-serif",
                fontSize: 13,
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              ↺ Refresh
            </button>
          </div>

          {/* ── STATS ── */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))",
              gap: 16,
              marginBottom: 28,
            }}
          >
            <StatCard
              icon="📋"
              label="Total Appointments"
              value={stats.total}
              color={C.teal}
              delay={0}
              sub="All time"
            />
            <StatCard
              icon="📅"
              label="Today"
              value={stats.today}
              color={C.blue}
              delay={0.05}
              sub="Scheduled today"
            />
            <StatCard
              icon="📆"
              label="This Month"
              value={stats.thisMonth}
              color="#7c3aed"
              delay={0.1}
              sub={monthName}
            />
            <StatCard
              icon="🔴"
              label="Fully Booked Days"
              value={fullDays.size}
              color={C.red}
              delay={0.15}
              sub="This month"
            />
          </div>

          {/* ── DOCTOR CARDS (By Doctor tab) ── */}
          {activeTab === "doctor" && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))",
                gap: 16,
                marginBottom: 28,
              }}
            >
              {doctorStats.map((doc, i) => (
                <div
                  key={doc.name}
                  onClick={() => {
                    setFilterDoc(doc.name);
                    setActiveTab("all");
                  }}
                  style={{
                    background: C.card,
                    borderRadius: 18,
                    padding: "20px",
                    cursor: "pointer",
                    border: `1.5px solid ${filterDoc === doc.name ? doc.color : C.border}`,
                    boxShadow: `0 2px 16px ${doc.color}18`,
                    animation: `slideUp .4s ${i * 0.06}s cubic-bezier(.22,1,.36,1) both`,
                    transition: "transform .15s, box-shadow .15s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = "translateY(-3px)";
                    e.currentTarget.style.boxShadow = `0 8px 28px ${doc.color}30`;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "translateY(0)";
                    e.currentTarget.style.boxShadow = `0 2px 16px ${doc.color}18`;
                  }}
                >
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 12,
                      background: doc.color + "22",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 20,
                      marginBottom: 12,
                    }}
                  >
                    👨‍⚕️
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: C.navy }}>
                    {doc.name}
                  </div>
                  <div style={{ fontSize: 12, color: C.sub, marginTop: 2 }}>
                    {doc.dept}
                  </div>
                  <div style={{ display: "flex", gap: 12, marginTop: 14 }}>
                    <div style={{ textAlign: "center" }}>
                      <div
                        style={{
                          fontSize: 20,
                          fontWeight: 700,
                          color: doc.color,
                        }}
                      >
                        {doc.today}
                      </div>
                      <div style={{ fontSize: 10.5, color: C.sub }}>Today</div>
                    </div>
                    <div style={{ width: 1, background: C.border }} />
                    <div style={{ textAlign: "center" }}>
                      <div
                        style={{
                          fontSize: 20,
                          fontWeight: 700,
                          color: doc.color,
                        }}
                      >
                        {doc.total}
                      </div>
                      <div style={{ fontSize: 10.5, color: C.sub }}>Total</div>
                    </div>
                  </div>
                  <div
                    style={{
                      marginTop: 10,
                      display: "flex",
                      gap: 4,
                      flexWrap: "wrap",
                    }}
                  >
                    {doc.days.map((d) => (
                      <span
                        key={d}
                        style={{
                          fontSize: 10,
                          fontWeight: 600,
                          background: doc.color + "18",
                          color: doc.color,
                          padding: "2px 7px",
                          borderRadius: 6,
                        }}
                      >
                        {d}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── FILTERS ── */}
          <div
            style={{
              background: C.card,
              borderRadius: 16,
              padding: "14px 20px",
              marginBottom: 20,
              border: `1px solid ${C.border}`,
              display: "flex",
              gap: 12,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 600, color: C.sub }}>
              Filter:
            </div>
            <select
              value={filterDoc}
              onChange={(e) => setFilterDoc(e.target.value)}
              style={selectStyle}
            >
              <option value="">All Doctors</option>
              {DOCTORS.map((d) => (
                <option key={d.name} value={d.name}>
                  {d.name}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              style={selectStyle}
            />
            <select
              value={filterStatus}
              onChange={(e) => setFilterSt(e.target.value)}
              style={selectStyle}
            >
              <option value="">All Status</option>
              <option value="confirmed">Confirmed</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
            {(filterDoc || filterDate || filterStatus) && (
              <button
                onClick={() => {
                  setFilterDoc("");
                  setFilterDate("");
                  setFilterSt("");
                }}
                style={{
                  border: `1px solid ${C.red}44`,
                  background: C.red + "11",
                  color: C.red,
                  borderRadius: 8,
                  padding: "6px 12px",
                  cursor: "pointer",
                  fontFamily: "'DM Sans',sans-serif",
                  fontSize: 12.5,
                }}
              >
                ✕ Clear
              </button>
            )}
            <div style={{ marginLeft: "auto", fontSize: 13, color: C.sub }}>
              {appointments.length} appointment
              {appointments.length !== 1 ? "s" : ""}
            </div>
          </div>

          {/* ── APPOINTMENTS TABLE ── */}
          <div
            style={{
              background: C.card,
              borderRadius: 20,
              overflow: "hidden",
              border: `1px solid ${C.border}`,
              boxShadow: "0 2px 20px rgba(10,124,115,.06)",
            }}
          >
            {appointments.length === 0 && !loading ? (
              <div
                style={{ padding: "60px 0", textAlign: "center", color: C.sub }}
              >
                <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>
                  No appointments found
                </div>
                <div style={{ fontSize: 13, marginTop: 4 }}>
                  Try adjusting your filters
                </div>
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table>
                  <thead>
                    <tr>
                      <th>Patient</th>
                      <th>Doctor</th>
                      <th>Date & Time</th>
                      <th>Status</th>
                      <th>Integrations</th>
                    </tr>
                  </thead>
                  <tbody>
                    {appointments.map((apt) => (
                      <AptRow
                        key={apt.id}
                        apt={apt}
                        onStatusChange={handleStatusChange}
                        onCancel={handleCancel}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── FULLY BOOKED ALERT ── */}
          {fullDays.size > 0 && (
            <div
              style={{
                marginTop: 20,
                background: "#fee2e2",
                border: `1px solid #fca5a5`,
                borderRadius: 14,
                padding: "14px 20px",
                display: "flex",
                alignItems: "center",
                gap: 12,
              }}
            >
              <span style={{ fontSize: 20 }}>🔴</span>
              <div>
                <div
                  style={{ fontWeight: 700, color: "#dc2626", fontSize: 14 }}
                >
                  {fullDays.size} day{fullDays.size !== 1 ? "s" : ""} fully
                  booked this month
                </div>
                <div style={{ fontSize: 12.5, color: "#ef4444", marginTop: 3 }}>
                  {Array.from(fullDays)
                    .sort()
                    .map((d) =>
                      new Date(d + "T00:00:00").toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                      }),
                    )
                    .join(" · ")}
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </>
  );
}

const selectStyle = {
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  padding: "7px 12px",
  fontSize: 13,
  color: C.navy,
  background: "#f8fdfc",
  outline: "none",
  cursor: "pointer",
};
