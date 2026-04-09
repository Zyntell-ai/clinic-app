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

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  teal:   "#0a7c73",
  teal2:  "#0bbfb3",
  mint:   "#e6f5f4",
  navy:   "#0d2926",
  sub:    "#5a7a77",
  border: "#c8e6e3",
  bg:     "#f2faf9",
  card:   "#ffffff",
  red:    "#e05252",
  green:  "#22c55e",
  amber:  "#f59e0b",
  blue:   "#3b82f6",
};

const STATUS_COLOR = {
  confirmed: { bg: "#dcfce7", text: "#16a34a", dot: "#22c55e" },
  completed: { bg: "#dbeafe", text: "#1d4ed8", dot: "#3b82f6" },
  cancelled:  { bg: "#fee2e2", text: "#dc2626", dot: "#ef4444" },
};

// ─── Tiny reusable components ─────────────────────────────────────────────────
const Badge = ({ status }) => {
  const s = STATUS_COLOR[status] || STATUS_COLOR.confirmed;
  return (
    <span style={{
      background: s.bg, color: s.text,
      fontSize: 11, fontWeight: 600,
      padding: "3px 10px", borderRadius: 20,
      display: "inline-flex", alignItems: "center", gap: 5,
      whiteSpace: "nowrap",
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: s.dot, display: "inline-block" }} />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
};

const StatCard = ({ icon, label, value, sub, color, delay }) => (
  <div style={{
    background: C.card, borderRadius: 20,
    padding: "20px 22px",
    boxShadow: "0 2px 20px rgba(10,124,115,.07)",
    border: `1px solid ${C.border}`,
    animation: `dashSlideUp .5s ${delay}s cubic-bezier(.22,1,.36,1) both`,
    display: "flex", flexDirection: "column", gap: 3,
  }}>
    <div style={{ fontSize: 26 }}>{icon}</div>
    <div style={{
      fontSize: 32, fontWeight: 700,
      color: color || C.teal,
      fontFamily: "'DM Serif Display',serif",
      marginTop: 6, lineHeight: 1,
    }}>
      {value}
    </div>
    <div style={{ fontSize: 13, fontWeight: 600, color: C.navy }}>{label}</div>
    {sub && <div style={{ fontSize: 11.5, color: C.sub }}>{sub}</div>}
  </div>
);

// ─── Mini calendar ────────────────────────────────────────────────────────────
function MiniCalendar({ year, month, fullDays, selectedDate, onSelect }) {
  const firstDay   = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const today      = new Date().toISOString().split("T")[0];
  const cells      = [];

  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const pad = (n) => String(n).padStart(2, "0");

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2, marginBottom: 6 }}>
        {["S","M","T","W","T","F","S"].map((d, i) => (
          <div key={i} style={{ textAlign: "center", fontSize: 11, fontWeight: 600, color: C.sub, padding: "4px 0" }}>{d}</div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 3 }}>
        {cells.map((d, i) => {
          if (!d) return <div key={i} />;
          const dateStr  = `${year}-${pad(month)}-${pad(d)}`;
          const isFull   = fullDays.has(dateStr);
          const isToday  = dateStr === today;
          const isSel    = dateStr === selectedDate;
          return (
            <button key={i} onClick={() => onSelect(isSel ? null : dateStr)}
              style={{
                aspectRatio: "1", borderRadius: 8, fontSize: 12,
                fontWeight: isToday ? 700 : 500,
                border: isSel ? `2px solid ${C.teal}` : "2px solid transparent",
                background: isFull ? "#fee2e2" : isSel ? C.mint : isToday ? C.mint : "transparent",
                color:      isFull ? C.red   : isSel ? C.teal : isToday ? C.teal : C.navy,
                cursor: "pointer", transition: "all .15s", position: "relative",
              }}
            >
              {d}
              {isFull && (
                <span style={{ position:"absolute", top:1, right:2, fontSize:8, color:C.red, fontWeight:700 }}>●</span>
              )}
            </button>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 12, marginTop: 10, fontSize: 11, color: C.sub }}>
        <span><span style={{ color: C.red }}>●</span> Fully Booked</span>
        <span><span style={{ color: C.teal }}>●</span> Today / Selected</span>
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
          <div style={{ fontWeight: 600, color: C.navy, fontSize: 13.5 }}>{apt.patient_name}</div>
          <div style={{ fontSize: 11.5, color: C.sub, marginTop: 1 }}>{apt.phone}</div>
        </td>
        <td style={tdStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: doctor?.color || C.teal, display: "inline-block", flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.navy }}>{apt.doctor}</div>
              <div style={{ fontSize: 11, color: C.sub }}>{apt.department}</div>
            </div>
          </div>
        </td>
        <td style={tdStyle}>
          <div style={{ fontSize: 13, color: C.navy }}>
            {new Date(apt.date + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
          </div>
          <div style={{ fontSize: 12, color: C.sub }}>{apt.time_slot}</div>
        </td>
        <td style={tdStyle}><Badge status={apt.status} /></td>
        <td style={tdStyle}>
          <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
            {apt.whatsapp_sent  && <span title="WhatsApp sent"    style={{ fontSize: 15 }}>📲</span>}
            {apt.gcal_event_id  && <span title="Calendar synced"  style={{ fontSize: 15 }}>📅</span>}
          </div>
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={5} style={{ padding: "0 16px 14px", background: "#f0fffe" }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", paddingTop: 10 }}>
              {apt.status !== "completed" && (
                <ActionBtn label="✅ Mark Completed" color={C.green} onClick={() => onStatusChange(apt.id, "completed")} />
              )}
              {apt.status !== "cancelled" && (
                <ActionBtn label="❌ Cancel" color={C.red} onClick={() => onCancel(apt.id)} />
              )}
              {apt.notes && (
                <div style={{ fontSize: 12.5, color: C.sub, padding: "6px 12px", background: "#fff", borderRadius: 8, border: `1px solid ${C.border}` }}>
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
    <button onClick={(e) => { e.stopPropagation(); onClick(); }}
      style={{
        background: color + "1a", color, border: `1px solid ${color}44`,
        borderRadius: 8, padding: "6px 14px",
        fontSize: 12.5, fontWeight: 600, cursor: "pointer", transition: "all .15s",
        fontFamily: "'DM Sans',sans-serif",
      }}
    >
      {label}
    </button>
  );
}

const tdStyle = { padding: "13px 16px", verticalAlign: "middle", borderBottom: `1px solid ${C.border}` };

// ─── Mobile Appointment Card ──────────────────────────────────────────────────
function AptCard({ apt, onStatusChange, onCancel }) {
  const [open, setOpen] = useState(false);
  const doctor = DOCTORS.find((d) => d.name === apt.doctor);

  return (
    <div style={{
      background: C.card, borderRadius: 14,
      border: `1px solid ${C.border}`,
      overflow: "hidden", marginBottom: 10,
      boxShadow: "0 1px 8px rgba(10,124,115,.05)",
    }}>
      <div onClick={() => setOpen(!open)}
        style={{ padding: "14px 16px", cursor: "pointer", display: "flex", alignItems: "flex-start", gap: 12 }}
      >
        <div style={{
          width: 36, height: 36, borderRadius: 10,
          background: (doctor?.color || C.teal) + "20",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 18, flexShrink: 0,
        }}>👤</div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
            <div style={{ fontWeight: 600, fontSize: 14, color: C.navy }}>{apt.patient_name}</div>
            <Badge status={apt.status} />
          </div>
          <div style={{ fontSize: 12.5, color: C.sub, marginTop: 3 }}>{apt.doctor} · {apt.department}</div>
          <div style={{ display: "flex", gap: 12, marginTop: 6, fontSize: 12 }}>
            <span style={{ color: C.navy }}>
              📅 {new Date(apt.date + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
            </span>
            <span style={{ color: C.navy }}>🕐 {apt.time_slot}</span>
            {apt.whatsapp_sent && <span>📲</span>}
          </div>
        </div>

        <div style={{ fontSize: 14, color: C.sub, flexShrink: 0, paddingTop: 2 }}>
          {open ? "▲" : "▼"}
        </div>
      </div>

      {open && (
        <div style={{ padding: "0 16px 14px", borderTop: `1px solid ${C.border}`, paddingTop: 12 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {apt.status !== "completed" && (
              <ActionBtn label="✅ Completed" color={C.green} onClick={() => onStatusChange(apt.id, "completed")} />
            )}
            {apt.status !== "cancelled" && (
              <ActionBtn label="❌ Cancel" color={C.red} onClick={() => onCancel(apt.id)} />
            )}
          </div>
          {apt.phone && (
            <div style={{ marginTop: 8, fontSize: 12, color: C.sub }}>📱 {apt.phone}</div>
          )}
          {apt.notes && (
            <div style={{ marginTop: 6, fontSize: 12, color: C.sub }}>📝 {apt.notes}</div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── MAIN DASHBOARD ───────────────────────────────────────────────────────────
export default function ClinicDashboard() {
  const now = new Date();
  const [stats,       setStats]       = useState({ total: 0, today: 0, thisMonth: 0 });
  const [appointments, setApts]       = useState([]);
  const [fullDays,    setFullDays]    = useState(new Set());
  const [loading,     setLoading]     = useState(true);
  const [calYear,     setCalYear]     = useState(now.getFullYear());
  const [calMonth,    setCalMonth]    = useState(now.getMonth() + 1);
  const [filterDoc,   setFilterDoc]   = useState("");
  const [filterDate,  setFilterDate]  = useState("");
  const [filterStatus,setFilterSt]   = useState("");
  const [activeTab,   setActiveTab]   = useState("all");
  const [sidebarOpen, setSidebar]     = useState(true);

  // ── Data fetching ────────────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const currentDate = new Date();
      const [s, apts, fd] = await Promise.all([
        getDashboardStats(),
        getAppointments({
          doctor:  filterDoc    || undefined,
          date:    (activeTab === "today" ? currentDate.toISOString().split("T")[0] : filterDate) || undefined,
          status:  filterStatus || undefined,
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

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    const channel = supabase
      .channel("appointments-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments" }, fetchAll)
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
    if (calMonth === 1) { setCalYear(y => y - 1); setCalMonth(12); }
    else setCalMonth(m => m - 1);
  };
  const calNext = () => {
    if (calMonth === 12) { setCalYear(y => y + 1); setCalMonth(1); }
    else setCalMonth(m => m + 1);
  };

  const monthName = new Date(calYear, calMonth - 1).toLocaleString("en-IN", { month: "long", year: "numeric" });

  const doctorStats = DOCTORS.map((doc) => {
    const all      = appointments.filter((a) => a.doctor === doc.name);
    const todayApts = all.filter((a) => a.date === now.toISOString().split("T")[0]);
    return { ...doc, total: all.length, today: todayApts.length };
  });

  const navTabClick = (id) => {
    setActiveTab(id);
    // On mobile, close sidebar after nav tap
    if (window.innerWidth < 768) setSidebar(false);
  };

  const filterDocClick = (name) => {
    setFilterDoc(filterDoc === name ? "" : name);
    setActiveTab("all");
    if (window.innerWidth < 768) setSidebar(false);
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600&display=swap');
        *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
        body { font-family:'DM Sans',sans-serif; }
        @keyframes dashSlideUp { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }
        @keyframes dashFadeIn  { from{opacity:0} to{opacity:1} }
        select { font-family:'DM Sans',sans-serif; }
        table  { border-collapse:collapse; width:100%; }
        th     { text-align:left; font-size:11px; font-weight:700; color:${C.sub}; letter-spacing:.8px; text-transform:uppercase; padding:10px 16px; background:#f8fdfc; border-bottom:2px solid ${C.border}; white-space:nowrap; }
        tr:last-child td { border-bottom:none !important; }

        /* ── Dashboard layout ── */
        .dash-layout    { display:flex; min-height:calc(100dvh - 56px); background:${C.bg}; }

        /* ── Sidebar ── */
        .dash-sidebar {
          width: 256px;
          flex-shrink: 0;
          background: #fff;
          border-right: 1px solid ${C.border};
          display: flex;
          flex-direction: column;
          transition: transform .3s cubic-bezier(.22,1,.36,1), width .3s cubic-bezier(.22,1,.36,1);
          overflow: hidden;
        }
        .dash-sidebar.closed { width: 0; }

        @media (max-width: 768px) {
          .dash-sidebar {
            position: fixed;
            top: 56px; left: 0; bottom: 0;
            z-index: 400;
            width: 270px !important;
            transform: translateX(0);
            box-shadow: 4px 0 32px rgba(0,0,0,.14);
          }
          .dash-sidebar.closed {
            transform: translateX(-100%);
            width: 270px !important;
          }
        }

        /* ── Sidebar backdrop ── */
        .dash-backdrop {
          display: none;
        }
        @media (max-width: 768px) {
          .dash-backdrop {
            display: block;
            position: fixed;
            inset: 56px 0 0 0;
            z-index: 300;
            background: rgba(13,41,38,.4);
            backdrop-filter: blur(2px);
            animation: dashFadeIn .2s ease;
          }
        }

        /* ── Main content ── */
        .dash-main {
          flex: 1;
          overflow-y: auto;
          padding: 24px 28px;
          min-width: 0;
        }
        @media (max-width: 640px) {
          .dash-main { padding: 16px 14px; }
        }

        /* ── Stats grid ── */
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 14px;
          margin-bottom: 24px;
        }
        @media (max-width: 480px) {
          .stats-grid { grid-template-columns: repeat(2, 1fr); gap: 10px; }
        }

        /* ── Filters ── */
        .filter-bar {
          background: ${C.card};
          border-radius: 14px;
          padding: 12px 16px;
          margin-bottom: 18px;
          border: 1px solid ${C.border};
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          align-items: center;
        }
        .filter-select {
          border: 1px solid ${C.border};
          border-radius: 8px;
          padding: 7px 12px;
          font-size: 13px;
          color: ${C.navy};
          background: #f8fdfc;
          outline: none;
          cursor: pointer;
          font-family:'DM Sans',sans-serif;
        }
        .filter-select:focus { border-color: ${C.teal}; }

        /* ── Table container ── */
        .table-wrap {
          background: ${C.card};
          border-radius: 18px;
          overflow: hidden;
          border: 1px solid ${C.border};
          box-shadow: 0 2px 20px rgba(10,124,115,.06);
        }
        .table-scroll { overflow-x: auto; }

        /* ── Hide table / show cards on mobile ── */
        .apt-table-view  { display: block; }
        .apt-cards-view  { display: none; }

        @media (max-width: 640px) {
          .apt-table-view { display: none; }
          .apt-cards-view { display: block; padding: 12px; }
        }

        /* ── Doctor cards grid ── */
        .doctor-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
          gap: 14px;
          margin-bottom: 24px;
        }
        @media (max-width: 480px) {
          .doctor-grid { grid-template-columns: repeat(2, 1fr); gap: 10px; }
        }

        /* ── Top bar ── */
        .dash-topbar {
          display: flex;
          align-items: center;
          gap: 14px;
          margin-bottom: 22px;
          flex-wrap: wrap;
        }

        /* ── Hamburger ── */
        .sidebar-toggle {
          border: 1px solid ${C.border};
          background: ${C.card};
          border-radius: 10px;
          width: 38px; height: 38px;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer;
          font-size: 17px;
          transition: all .15s;
          flex-shrink: 0;
        }
        .sidebar-toggle:hover { background: ${C.mint}; border-color: ${C.teal}; }

        /* ── Refresh btn ── */
        .refresh-btn {
          background: ${C.teal}; color: #fff;
          border: none; border-radius: 10px;
          padding: 8px 16px;
          cursor: pointer; font-family:'DM Sans',sans-serif;
          font-size: 13px; font-weight: 600;
          display: flex; align-items: center; gap: 6px;
          transition: all .18s; flex-shrink: 0;
          margin-left: auto;
        }
        .refresh-btn:hover { background: #0bbfb3; transform: translateY(-1px); }

        /* ── Nav item ── */
        .sidebar-nav-item {
          width: 100%; text-align: left;
          padding: 10px 14px; border-radius: 12px;
          border: none; cursor: pointer;
          display: flex; align-items: center; gap: 10px;
          font-family:'DM Sans',sans-serif; font-size: 14px;
          margin-bottom: 3px; transition: all .15s;
        }

        /* ── Doctor filter item ── */
        .sidebar-doc-item {
          width: 100%; text-align: left;
          padding: 8px 14px; border-radius: 10px;
          border: none; cursor: pointer;
          display: flex; align-items: center; gap: 8px;
          font-family:'DM Sans',sans-serif; font-size: 13px;
          margin-bottom: 2px; transition: all .15s;
        }
      `}</style>

      <div className="dash-layout">

        {/* ── SIDEBAR BACKDROP (mobile only) ── */}
        {sidebarOpen && (
          <div className="dash-backdrop" onClick={() => setSidebar(false)} />
        )}

        {/* ── SIDEBAR ── */}
        <aside className={`dash-sidebar${sidebarOpen ? "" : " closed"}`}>
          <div style={{ padding: "24px 22px 18px", borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
            <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 21, color: C.teal }}>HealthPlus</div>
            <div style={{ fontSize: 12, color: C.sub, marginTop: 2 }}>Clinic Management</div>
          </div>

          {/* Nav */}
          <nav style={{ padding: "14px 10px", flex: 1, overflowY: "auto" }}>
            {[
              { id: "all",     icon: "📋", label: "All Appointments" },
              { id: "today",   icon: "📅", label: "Today's Schedule" },
              { id: "doctor",  icon: "👨‍⚕️", label: "By Doctor" },
            ].map((tab) => (
              <button key={tab.id} className="sidebar-nav-item"
                onClick={() => navTabClick(tab.id)}
                style={{
                  background: activeTab === tab.id ? C.mint : "transparent",
                  color:      activeTab === tab.id ? C.teal : C.navy,
                  fontWeight: activeTab === tab.id ? 600 : 400,
                }}
              >
                <span style={{ fontSize: 16 }}>{tab.icon}</span>
                {tab.label}
              </button>
            ))}

            <div style={{ height: 1, background: C.border, margin: "12px 4px" }} />

            <div style={{ fontSize: 11, fontWeight: 700, color: C.sub, letterSpacing: .8, padding: "0 6px 8px", textTransform: "uppercase" }}>
              Doctors
            </div>
            {DOCTORS.map((doc) => (
              <button key={doc.name} className="sidebar-doc-item"
                onClick={() => filterDocClick(doc.name)}
                style={{
                  background: filterDoc === doc.name ? doc.color + "1a" : "transparent",
                  color:      filterDoc === doc.name ? doc.color : C.sub,
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: doc.color, display: "inline-block", flexShrink: 0 }} />
                <div>
                  <div style={{ fontWeight: 600, color: filterDoc === doc.name ? doc.color : C.navy, fontSize: 12.5 }}>
                    {doc.name}
                  </div>
                  <div style={{ fontSize: 11, color: C.sub }}>{doc.dept}</div>
                </div>
              </button>
            ))}
          </nav>

          {/* Mini Calendar */}
          <div style={{ padding: "14px 18px 20px", borderTop: `1px solid ${C.border}`, flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <button onClick={calPrev} style={{ border: "none", background: "none", cursor: "pointer", color: C.sub, fontSize: 18, padding: "2px 6px", borderRadius: 6, transition: "all .15s" }}>‹</button>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.navy }}>{monthName}</div>
              <button onClick={calNext} style={{ border: "none", background: "none", cursor: "pointer", color: C.sub, fontSize: 18, padding: "2px 6px", borderRadius: 6, transition: "all .15s" }}>›</button>
            </div>
            <MiniCalendar
              year={calYear} month={calMonth}
              fullDays={fullDays} selectedDate={filterDate}
              onSelect={(d) => { setFilterDate(d || ""); setActiveTab("all"); }}
            />
          </div>
        </aside>

        {/* ── MAIN ── */}
        <main className="dash-main">

          {/* Top bar */}
          <div className="dash-topbar">
            <button className="sidebar-toggle" onClick={() => setSidebar(!sidebarOpen)}>
              {sidebarOpen ? "✕" : "☰"}
            </button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h1 style={{ fontFamily: "'DM Serif Display',serif", fontSize: 24, color: C.navy, lineHeight: 1.2 }}>
                {activeTab === "today" ? "Today's Schedule" : activeTab === "doctor" ? "By Doctor" : "Appointments"}
              </h1>
              <div style={{ fontSize: 12.5, color: C.sub, marginTop: 3 }}>
                {now.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
              </div>
            </div>
            {loading && <div style={{ fontSize: 12, color: C.sub, animation: "dashFadeIn .3s", flexShrink: 0 }}>⟳ Loading…</div>}
            <button className="refresh-btn" onClick={fetchAll}>↺ Refresh</button>
          </div>

          {/* ── STATS ── */}
          <div className="stats-grid">
            <StatCard icon="📋" label="Total"       value={stats.total}     color={C.teal}    delay={0}    sub="All time" />
            <StatCard icon="📅" label="Today"       value={stats.today}     color={C.blue}    delay={0.05} sub="Scheduled today" />
            <StatCard icon="📆" label="This Month"  value={stats.thisMonth} color="#7c3aed"   delay={0.1}  sub={monthName} />
            <StatCard icon="🔴" label="Fully Booked" value={fullDays.size}  color={C.red}     delay={0.15} sub="Days this month" />
          </div>

          {/* ── DOCTOR CARDS ── */}
          {activeTab === "doctor" && (
            <div className="doctor-grid">
              {doctorStats.map((doc, i) => (
                <div key={doc.name}
                  onClick={() => { setFilterDoc(doc.name); setActiveTab("all"); }}
                  style={{
                    background: C.card, borderRadius: 18, padding: "18px",
                    cursor: "pointer",
                    border: `1.5px solid ${filterDoc === doc.name ? doc.color : C.border}`,
                    boxShadow: `0 2px 14px ${doc.color}18`,
                    animation: `dashSlideUp .4s ${i * 0.06}s cubic-bezier(.22,1,.36,1) both`,
                    transition: "transform .15s, box-shadow .15s",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-3px)"; e.currentTarget.style.boxShadow = `0 8px 28px ${doc.color}30`; }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)";   e.currentTarget.style.boxShadow = `0 2px 14px ${doc.color}18`; }}
                >
                  <div style={{ width: 38, height: 38, borderRadius: 11, background: doc.color + "20", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, marginBottom: 10 }}>
                    👨‍⚕️
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 13.5, color: C.navy }}>{doc.name}</div>
                  <div style={{ fontSize: 12, color: C.sub, marginTop: 2 }}>{doc.dept}</div>
                  <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 20, fontWeight: 700, color: doc.color }}>{doc.today}</div>
                      <div style={{ fontSize: 10.5, color: C.sub }}>Today</div>
                    </div>
                    <div style={{ width: 1, background: C.border }} />
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 20, fontWeight: 700, color: doc.color }}>{doc.total}</div>
                      <div style={{ fontSize: 10.5, color: C.sub }}>Total</div>
                    </div>
                  </div>
                  <div style={{ marginTop: 10, display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {doc.days.map((d) => (
                      <span key={d} style={{ fontSize: 10, fontWeight: 600, background: doc.color + "18", color: doc.color, padding: "2px 7px", borderRadius: 6 }}>{d}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── FILTERS ── */}
          <div className="filter-bar">
            <div style={{ fontSize: 13, fontWeight: 600, color: C.sub }}>Filter:</div>
            <select className="filter-select" value={filterDoc} onChange={(e) => setFilterDoc(e.target.value)}>
              <option value="">All Doctors</option>
              {DOCTORS.map((d) => <option key={d.name} value={d.name}>{d.name}</option>)}
            </select>
            <input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} className="filter-select" />
            <select className="filter-select" value={filterStatus} onChange={(e) => setFilterSt(e.target.value)}>
              <option value="">All Status</option>
              <option value="confirmed">Confirmed</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
            {(filterDoc || filterDate || filterStatus) && (
              <button onClick={() => { setFilterDoc(""); setFilterDate(""); setFilterSt(""); }}
                style={{ border: `1px solid ${C.red}44`, background: C.red + "11", color: C.red, borderRadius: 8, padding: "6px 12px", cursor: "pointer", fontFamily: "'DM Sans',sans-serif", fontSize: 12.5 }}>
                ✕ Clear
              </button>
            )}
            <div style={{ marginLeft: "auto", fontSize: 12.5, color: C.sub, fontWeight: 500 }}>
              {appointments.length} apt{appointments.length !== 1 ? "s" : ""}
            </div>
          </div>

          {/* ── APPOINTMENTS — TABLE (desktop) / CARDS (mobile) ── */}
          {appointments.length === 0 && !loading ? (
            <div style={{ background: C.card, borderRadius: 18, border: `1px solid ${C.border}`, padding: "60px 0", textAlign: "center", color: C.sub }}>
              <div style={{ fontSize: 42, marginBottom: 12 }}>📭</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: C.navy }}>No appointments found</div>
              <div style={{ fontSize: 13, marginTop: 4 }}>Try adjusting your filters</div>
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="apt-table-view table-wrap">
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Patient</th>
                        <th>Doctor</th>
                        <th>Date & Time</th>
                        <th>Status</th>
                        <th>Links</th>
                      </tr>
                    </thead>
                    <tbody>
                      {appointments.map((apt) => (
                        <AptRow key={apt.id} apt={apt} onStatusChange={handleStatusChange} onCancel={handleCancel} />
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Mobile cards */}
              <div className="apt-cards-view">
                {appointments.map((apt) => (
                  <AptCard key={apt.id} apt={apt} onStatusChange={handleStatusChange} onCancel={handleCancel} />
                ))}
              </div>
            </>
          )}

          {/* ── FULLY BOOKED ALERT ── */}
          {fullDays.size > 0 && (
            <div style={{
              marginTop: 18,
              background: "#fee2e2", border: `1px solid #fca5a5`,
              borderRadius: 14, padding: "14px 20px",
              display: "flex", alignItems: "flex-start", gap: 12,
            }}>
              <span style={{ fontSize: 20, flexShrink: 0 }}>🔴</span>
              <div>
                <div style={{ fontWeight: 700, color: "#dc2626", fontSize: 14 }}>
                  {fullDays.size} day{fullDays.size !== 1 ? "s" : ""} fully booked this month
                </div>
                <div style={{ fontSize: 12.5, color: "#ef4444", marginTop: 3 }}>
                  {Array.from(fullDays).sort().map((d) =>
                    new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" })
                  ).join(" · ")}
                </div>
              </div>
            </div>
          )}

          {/* Spacer for mobile */}
          <div style={{ height: 32 }} />
        </main>
      </div>
    </>
  );
}