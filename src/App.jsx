import { useState } from "react";
import ClinicChatbot from "./ClinicChatbot";
import ClinicDashboard from "./ClinicDashboard";

function App() {
  const [page, setPage] = useState("chatbot"); // "chatbot" | "dashboard"

  return (
    <>
      {/* ── Nav ── */}
      <nav
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 1000,
          background: "#fff",
          borderBottom: "1px solid #c8e6e3",
          padding: "0 24px",
          height: 52,
          display: "flex",
          alignItems: "center",
          gap: 12,
          boxShadow: "0 2px 12px rgba(10,124,115,.08)",
        }}
      >
        <span
          style={{
            fontFamily: "'DM Serif Display', serif",
            color: "#0a7c73",
            fontSize: 18,
            marginRight: 8,
          }}
        >
          HealthPlus
        </span>

        {[
          { id: "chatbot", label: "💬 Patient Chatbot" },
          { id: "dashboard", label: "📋 Clinic Dashboard" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setPage(tab.id)}
            style={{
              border: "none",
              borderRadius: 8,
              padding: "6px 16px",
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              transition: "all .2s",
              background: page === tab.id ? "#0a7c73" : "transparent",
              color: page === tab.id ? "#fff" : "#5a7a77",
            }}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {/* ── Page ── */}
      <div style={{ paddingTop: 52 }}>
        {page === "chatbot" && <ClinicChatbot />}
        {page === "dashboard" && <ClinicDashboard />}
      </div>
    </>
  );
}

export default App;
