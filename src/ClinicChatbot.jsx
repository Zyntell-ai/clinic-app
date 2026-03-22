// src/ClinicChatbot.jsx
// ─── Clinic chatbot powered by Google Gemini API (free tier!) ─────────────────
import { useState, useEffect, useRef } from "react";
import {
  DOCTORS,
  getAvailableSlots,
  isDayFull,
  createAppointment,
  sendWhatsAppConfirmation,
  createGCalEvent,
} from "./lib/clinic";

// ─── Gemini system instruction ────────────────────────────────────────────────
const SYSTEM_INSTRUCTION = `You are Meera, the friendly and professional AI receptionist for HealthPlus Clinic located in Banjara Hills, Hyderabad, India.

CLINIC INFORMATION:
- Name: HealthPlus Clinic
- Address: Plot 42, Road No. 12, Banjara Hills, Hyderabad - 500034
- Phone: +91 40 2345 6789 | WhatsApp: +91 98765 43210
- Email: care@healthplusclinic.in
- Working Hours: Monday-Saturday 9:00 AM - 8:00 PM | Sunday 10:00 AM - 2:00 PM (Emergency only)

DOCTORS:
- Dr. Ananya Reddy (General Physician) - Mon/Wed/Fri - Rs.500
- Dr. Karthik Sharma (Cardiologist) - Tue/Thu/Sat - Rs.1200
- Dr. Priya Nair (Gynecologist) - Mon-Sat - Rs.1000
- Dr. Suresh Rao (Pediatrician) - Mon-Sat - Rs.800
- Dr. Venkata Lakshmi (Dermatologist) - Wed/Fri/Sat - Rs.900

SERVICES: General Consultations, ECG & Echo, Blood Tests (same-day), Vaccinations, Antenatal Care, Pediatric Care, Skin Treatments, Diabetes Management, Blood Pressure Monitoring, Minor Surgeries

HEALTH PACKAGES: Starting from Rs.1,999

EMERGENCY: +91 98765 00000 (24/7) | Ambulance: 108

APPOINTMENT BOOKING:
When a patient wants to book, collect step by step:
1. Full Name
2. Phone number with country code (e.g. 919876543210)
3. Preferred doctor or department
4. Preferred date (ask them to type in YYYY-MM-DD format)
5. Preferred time slot

RULES:
- Be warm, friendly, and concise - like a caring receptionist
- Use simple English
- Never give medical advice - always say "please consult our doctor"
- Add relevant emojis to keep it friendly
- If you don't know something, offer to connect them with clinic staff
- Format lists with bullet points using the • symbol`;

// ─── Rule-based fallback engine ───────────────────────────────────────────────
const RULES = [
  {
    match: /hour|time|open|close|timing|schedule|when/i,
    reply: `🕐 *HealthPlus Clinic Working Hours:*\n\n• Monday - Saturday: 9:00 AM - 8:00 PM\n• Sunday: 10:00 AM - 2:00 PM (Emergency only)\n\nWould you like to **book an appointment**? 😊`,
  },
  {
    match: /fee|cost|price|charge|pay|how much/i,
    reply: `💰 *Consultation Fees:*\n\n• Dr. Ananya Reddy (General Physician) — ₹500\n• Dr. Karthik Sharma (Cardiologist) — ₹1,200\n• Dr. Priya Nair (Gynecologist) — ₹1,000\n• Dr. Suresh Rao (Pediatrician) — ₹800\n• Dr. Venkata Lakshmi (Dermatologist) — ₹900\n\nHealth Check-up Packages starting from ₹1,999`,
  },
  {
    match: /doctor|physician|specialist|who.*available|staff/i,
    reply: `👨‍⚕️ *Our Doctors:*\n\n• **Dr. Ananya Reddy** — General Physician (Mon/Wed/Fri)\n• **Dr. Karthik Sharma** — Cardiologist (Tue/Thu/Sat)\n• **Dr. Priya Nair** — Gynecologist (Mon–Sat)\n• **Dr. Suresh Rao** — Pediatrician (Mon–Sat)\n• **Dr. Venkata Lakshmi** — Dermatologist (Wed/Fri/Sat)\n\nWant to book an appointment? 📅`,
  },
  {
    match: /service|treat|offer|test|blood|ecg|vaccine|lab/i,
    reply: `💊 *Our Services:*\n\n• General Consultations\n• ECG & Echo\n• Blood Tests (same-day results)\n• Vaccinations & Immunizations\n• Antenatal & Prenatal Care\n• Pediatric Care\n• Skin Treatments\n• Diabetes Management\n• Blood Pressure Monitoring\n• Minor Surgeries`,
  },
  {
    match: /emergency|urgent|ambulance|critical/i,
    reply: `🚨 *Emergency Contacts:*\n\n• **HealthPlus Emergency:** +91 98765 00000 (24/7)\n• **Ambulance (Free):** 108\n• **Clinic Phone:** +91 40 2345 6789\n\nFor life-threatening emergencies call **108** immediately! 🙏`,
  },
  {
    match: /address|location|where|direction|map|find/i,
    reply: `📍 *HealthPlus Clinic:*\n\nPlot 42, Road No. 12\nBanjara Hills, Hyderabad – 500034\n\n📞 +91 40 2345 6789\n📱 WhatsApp: +91 98765 43210\n\nEasy parking available! 🚗`,
  },
  {
    match: /book|appointment|schedule|slot|visit|reserve/i,
    reply: null,
    action: "start_booking",
  },
  {
    match: /hi|hello|hey|good morning|good afternoon|namaste/i,
    reply: `Hello! Welcome to **HealthPlus Clinic** 👋\n\nI'm Meera, your virtual assistant. How can I help you today?\n\n• 📅 Book an appointment\n• 🕐 Working hours\n• 👨‍⚕️ Our doctors\n• 💊 Services\n• 💰 Fees\n• 🚨 Emergency`,
  },
  {
    match: /thank|thanks|great|awesome|perfect/i,
    reply: `You're welcome! 😊 Is there anything else I can help you with?`,
  },
  {
    match: /cancel|reschedule|change.*appointment/i,
    reply: `To cancel or reschedule, please contact us:\n\n📞 **+91 40 2345 6789**\n📱 **WhatsApp: +91 98765 43210**\n\nOur team will assist you right away! 🙏`,
  },
];

function getRuleResponse(text) {
  for (const rule of RULES) {
    if (rule.match.test(text)) return rule;
  }
  return null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const getTime = () =>
  new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

const parseMarkdown = (text) =>
  text
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/^• /gm, '<span style="color:#0a7c73;margin-right:3px">•</span>')
    .replace(/^(\d+)\. /gm, '<strong style="color:#0a7c73">$1.</strong> ')
    .replace(/\n/g, "<br/>");

const QUICK_REPLIES = [
  { label: "📅 Book Appointment", text: "I want to book an appointment" },
  { label: "🕐 Working Hours",    text: "What are your working hours?" },
  { label: "👨‍⚕️ Our Doctors",      text: "Which doctors are available?" },
  { label: "💊 Services",         text: "What services do you offer?" },
  { label: "🚨 Emergency",        text: "Emergency contact number?" },
  { label: "💰 Fees",             text: "What are the consultation fees?" },
];

const avatarStyle = (role) => ({
  width: 32, height: 32, borderRadius: 10, flexShrink: 0, marginTop: 2,
  background: role === "user" ? "#0a7c73" : "#d4f0ed",
  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16,
});

const bubbleBase = {
  padding: "12px 15px", borderRadius: 18, fontSize: 14, lineHeight: 1.6, maxWidth: "78%",
};

// ─── Sub-components ───────────────────────────────────────────────────────────
function TypingDots() {
  return (
    <div style={{ display: "flex", gap: 10 }}>
      <div style={avatarStyle("bot")}>🏥</div>
      <div style={{ ...bubbleBase, padding: "14px 18px", display: "flex", gap: 5, alignItems: "center", background: "#fff", boxShadow: "0 2px 12px rgba(0,0,0,.06)" }}>
        {[0, 0.2, 0.4].map((d, i) => (
          <span key={i} style={{ width: 7, height: 7, borderRadius: "50%", background: "#0bbfb3", display: "block", animation: `bounce 1.2s ${d}s infinite ease-in-out` }} />
        ))}
      </div>
    </div>
  );
}

function BookingCard({ data }) {
  return (
    <div style={{ background: "linear-gradient(135deg,#e6f5f4,#f0fffe)", border: "1.5px solid #0a7c7355", borderRadius: 16, padding: "14px 16px", fontSize: 13.5, lineHeight: 1.8, marginTop: 6, color: "#0d2926" }}>
      <div style={{ fontWeight: 700, color: "#0a7c73", marginBottom: 10, fontSize: 15 }}>✅ Appointment Confirmed!</div>
      <div>📋 <strong>Ref ID:</strong> {data.id}</div>
      <div>👤 <strong>Patient:</strong> {data.patient_name}</div>
      <div>👨‍⚕️ <strong>Doctor:</strong> {data.doctor}</div>
      <div>📅 <strong>Date:</strong> {new Date(data.date + "T00:00:00").toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</div>
      <div>🕐 <strong>Time:</strong> {data.time_slot}</div>
      <div style={{ marginTop: 10, padding: "8px 10px", background: "rgba(10,124,115,.08)", borderRadius: 8, fontSize: 12.5, color: "#0a7c73" }}>
        📲 WhatsApp confirmation sent to {data.phone}
      </div>
    </div>
  );
}

function DoctorPicker({ onSelect }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8, width: "100%" }}>
      {DOCTORS.map((doc) => (
        <button key={doc.name} onClick={() => onSelect(doc.name)}
          style={{ textAlign: "left", padding: "10px 14px", borderRadius: 12, border: "1.5px solid #c8e6e3", background: "#fff", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, transition: "all .2s", fontFamily: "'DM Sans',sans-serif", width: "100%" }}
          onMouseEnter={e => { e.currentTarget.style.background = "#e6f5f4"; e.currentTarget.style.borderColor = "#0a7c73"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "#fff"; e.currentTarget.style.borderColor = "#c8e6e3"; }}
        >
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: doc.color, display: "inline-block", flexShrink: 0 }} />
          <div>
            <div style={{ fontWeight: 600, fontSize: 13, color: "#0d2926" }}>{doc.name}</div>
            <div style={{ fontSize: 11.5, color: "#5a7a77" }}>{doc.dept} · {doc.days.join("/")} </div>
          </div>
        </button>
      ))}
    </div>
  );
}

function SlotPicker({ slots, onSelect }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
      {slots.map((slot) => (
        <button key={slot} onClick={() => onSelect(slot)}
          style={{ padding: "8px 14px", borderRadius: 10, border: "1.5px solid #c8e6e3", background: "#fff", color: "#0a7c73", fontWeight: 600, fontSize: 13, cursor: "pointer", transition: "all .2s", fontFamily: "'DM Sans',sans-serif" }}
          onMouseEnter={e => { e.currentTarget.style.background = "#0a7c73"; e.currentTarget.style.color = "#fff"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "#fff"; e.currentTarget.style.color = "#0a7c73"; }}
        >
          🕐 {slot}
        </button>
      ))}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function ClinicChatbot() {
  const [messages,    setMessages]    = useState([]);
  const [geminiHistory, setGeminiHistory] = useState([]); // [{role, parts:[{text}]}]
  const [input,       setInput]       = useState("");
  const [loading,     setLoading]     = useState(false);
  const [bookingCard, setBookingCard] = useState(null);
  const [bookingFlow, setBookingFlow] = useState(null);
  const [availSlots,  setAvailSlots]  = useState([]);
  const bottomRef   = useRef(null);
  const textareaRef = useRef(null);

  const hasGeminiKey = !!(import.meta.env.VITE_GEMINI_API_KEY);

  useEffect(() => {
    setMessages([{
      role: "assistant",
      content: `Hello! I'm **Meera**, your virtual assistant at **HealthPlus Clinic** 👋\n\nI can help you with:\n• 📅 Booking appointments\n• 🕐 Working hours & location\n• 👨‍⚕️ Our doctors & services\n• 💰 Consultation fees\n• 🚨 Emergency contacts\n\nHow can I help you today?`,
      time: getTime(),
    }]);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, bookingCard]);

  const addBotMessage = (content, extra = {}) => {
    setMessages((prev) => [...prev, { role: "assistant", content, time: getTime(), ...extra }]);
  };

  // ─── Booking flow ──────────────────────────────────────────────────────────
  const handleBookingStep = async (userText) => {
    const flow = bookingFlow;

    if (flow.step === "doctor") {
      const match = DOCTORS.find(d =>
        d.name.toLowerCase().includes(userText.toLowerCase()) ||
        d.dept.toLowerCase().includes(userText.toLowerCase())
      );
      if (!match) {
        addBotMessage("Please choose a doctor from the list below 👇", { widget: "doctor_picker" });
        return;
      }
      setBookingFlow({ step: "date", data: { ...flow.data, doctor: match.name, department: match.dept } });
      addBotMessage(`Great choice! **${match.name}** (${match.dept}) ✅\n\nEnter your preferred date:\n📅 Format: **YYYY-MM-DD** (e.g., 2025-04-20)`);
      return;
    }

    if (flow.step === "date") {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(userText.trim())) {
        addBotMessage("Please use the format **YYYY-MM-DD**\nExample: **2025-04-20** 📅");
        return;
      }
      setLoading(true);
      try {
        const { isFull } = await isDayFull(flow.data.doctor, userText.trim());
        if (isFull) {
          addBotMessage(`❌ **${flow.data.doctor}** is fully booked on **${userText.trim()}**.\n\nPlease try another date 📅`);
          setLoading(false);
          return;
        }
        const slots = await getAvailableSlots(flow.data.doctor, userText.trim());
        if (!slots.length) {
          addBotMessage(`😔 No slots available on **${userText.trim()}**. Please try another date.`);
          setLoading(false);
          return;
        }
        setAvailSlots(slots);
        setBookingFlow({ step: "slot", data: { ...flow.data, date: userText.trim() } });
        addBotMessage(`✅ **${slots.length} slots available!** Pick your preferred time 👇`, { widget: "slot_picker", slots });
      } catch {
        addBotMessage("Couldn't check availability right now. Please call **+91 40 2345 6789** 📞");
        setBookingFlow(null);
      }
      setLoading(false);
      return;
    }

    if (flow.step === "slot") {
      const slotMatch = availSlots.find(s => s.toLowerCase() === userText.toLowerCase().trim());
      if (!slotMatch) {
        addBotMessage("Please pick a time from the options above 👆", { widget: "slot_picker", slots: availSlots });
        return;
      }
      setBookingFlow({ step: "name", data: { ...flow.data, time_slot: slotMatch } });
      addBotMessage(`🕐 **${slotMatch}** selected!\n\nWhat is your **full name**? 👤`);
      return;
    }

    if (flow.step === "name") {
      if (userText.trim().length < 2) { addBotMessage("Please enter your full name 👤"); return; }
      setBookingFlow({ step: "phone", data: { ...flow.data, patient_name: userText.trim() } });
      addBotMessage(`Thanks, **${userText.trim()}**! 😊\n\nPlease share your **WhatsApp number** with country code:\n📱 Example: **919876543210**`);
      return;
    }

    if (flow.step === "phone") {
      const phone = userText.replace(/\s/g, "");
      if (phone.length < 10) { addBotMessage("Please enter a valid phone number.\nExample: **919876543210** 📱"); return; }
      const { data } = flow;
      setBookingFlow({ step: "confirm", data: { ...data, phone } });
      addBotMessage(
        `Please confirm your appointment:\n\n` +
        `👤 **Name:** ${data.patient_name}\n` +
        `👨‍⚕️ **Doctor:** ${data.doctor}\n` +
        `📅 **Date:** ${new Date(data.date + "T00:00:00").toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}\n` +
        `🕐 **Time:** ${data.time_slot}\n` +
        `📱 **Phone:** ${phone}\n\n` +
        `Type **YES** to confirm or **NO** to cancel.`
      );
      return;
    }

    if (flow.step === "confirm") {
      if (/yes|confirm|ok|sure|book|proceed/i.test(userText.trim())) {
        setLoading(true);
        try {
          const apt = await createAppointment({ ...flow.data, status: "confirmed" });
          sendWhatsAppConfirmation(apt).catch(console.warn);
          createGCalEvent(apt).catch(console.warn);
          setBookingCard({ ...flow.data, id: apt.id.slice(0, 8).toUpperCase() });
          addBotMessage(`Your appointment is booked! 🎉\n\nA WhatsApp confirmation has been sent to **${flow.data.phone}**.\n\nSee you soon at HealthPlus Clinic! 🏥`);
        } catch {
          addBotMessage("Booking failed. Please call **+91 40 2345 6789** 📞");
        }
        setBookingFlow(null);
        setLoading(false);
      } else {
        setBookingFlow(null);
        addBotMessage("Booking cancelled. Feel free to start over anytime! 😊");
      }
    }
  };

  // ─── Main send ─────────────────────────────────────────────────────────────
  const send = async (text) => {
    const msg = text.trim();
    if (!msg || loading) return;
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    setBookingCard(null);
    setMessages((prev) => [...prev, { role: "user", content: msg, time: getTime() }]);

    if (bookingFlow) { await handleBookingStep(msg); return; }

    setLoading(true);

    // ── Try Gemini API ──────────────────────────────────────────────────────
    if (hasGeminiKey) {
      const newHistory = [
        ...geminiHistory,
        { role: "user", parts: [{ text: msg }] },
      ];
      const ok = await callGemini(newHistory, msg);
      if (ok) return;
    }

    // ── Rule-based fallback ─────────────────────────────────────────────────
    await new Promise((r) => setTimeout(r, 600));
    const rule = getRuleResponse(msg);
    if (rule?.action === "start_booking") {
      setBookingFlow({ step: "doctor", data: {} });
      addBotMessage("Sure! Let's book your appointment 📅\n\nPlease select your preferred doctor 👇", { widget: "doctor_picker" });
    } else if (rule) {
      addBotMessage(rule.reply);
    } else {
      addBotMessage(`I can help you with:\n\n• 📅 Book an appointment\n• 🕐 Working hours\n• 👨‍⚕️ Our doctors\n• 💊 Services\n• 💰 Fees\n• 🚨 Emergency\n\nOr call us: **+91 40 2345 6789** 😊`);
    }
    setLoading(false);
  };

  // ─── Gemini API call ───────────────────────────────────────────────────────
  // Uses gemini-2.0-flash — fastest, free tier, 15 RPM, 1M tokens/day free
  const callGemini = async (history, originalMsg) => {
    try {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: {
            parts: [{ text: SYSTEM_INSTRUCTION }],
          },
          contents: history,
          generationConfig: {
            maxOutputTokens: 512,
            temperature: 0.7,
          },
        }),
      });

      const data = await res.json();

      // Handle API errors gracefully
      if (data.error) {
        console.warn("Gemini API error:", data.error.message);
        setLoading(false);
        // Fall to rules
        const rule = getRuleResponse(originalMsg);
        if (rule?.action === "start_booking") {
          setBookingFlow({ step: "doctor", data: {} });
          addBotMessage("Sure! Let's book your appointment 📅\n\nPlease select your preferred doctor 👇", { widget: "doctor_picker" });
        } else if (rule) {
          addBotMessage(rule.reply);
        } else {
          addBotMessage("I can help with appointments, hours, doctors, services & fees. What would you like to know? 😊");
        }
        return true;
      }

      const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || "I didn't catch that. Could you please rephrase? 😊";

      // Update Gemini history with both user msg + assistant response
      setGeminiHistory([
        ...history,
        { role: "model", parts: [{ text: reply }] },
      ]);

      // Check if Gemini wants to start booking flow
      if (/book.*appointment|schedule.*appointment|make.*appointment/i.test(reply) && !bookingFlow) {
        setBookingFlow({ step: "doctor", data: {} });
        addBotMessage(reply + "\n\nPlease select your preferred doctor 👇", { widget: "doctor_picker" });
      } else {
        addBotMessage(reply);
      }

      setLoading(false);
      return true;
    } catch (err) {
      console.error("Gemini call failed:", err);
      setLoading(false);
      return false;
    }
  };

  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); }
  };
  const autoResize = (e) => {
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 80) + "px";
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@300;400;500;600&display=swap');
        *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
        body { font-family:'DM Sans',sans-serif; background:linear-gradient(135deg,#e8f7f6,#f0fffe,#e4f3f1); min-height:100vh; display:flex; align-items:center; justify-content:center; padding:20px; }
        @keyframes fadeUp  { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        @keyframes bounce  { 0%,80%,100%{transform:translateY(0);opacity:.5} 40%{transform:translateY(-6px);opacity:1} }
        @keyframes rise    { from{opacity:0;transform:translateY(30px) scale(.97)} to{opacity:1;transform:translateY(0) scale(1)} }
        @keyframes pulse   { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.6;transform:scale(.8)} }
        ::-webkit-scrollbar{width:4px} ::-webkit-scrollbar-thumb{background:#c8e6e3;border-radius:4px}
        .qr-btn:hover:not(:disabled){background:#0a7c73!important;color:#fff!important;border-color:#0a7c73!important;transform:translateY(-1px)}
        .send-btn:hover:not(:disabled){background:#0bbfb3!important;transform:scale(1.05)}
      `}</style>

      <div style={{ width: "100%", maxWidth: 480, height: 760, borderRadius: 28, background: "#fff", boxShadow: "0 8px 40px rgba(10,124,115,.12), 0 2px 0 #c8e6e3", display: "flex", flexDirection: "column", overflow: "hidden", animation: "rise .6s cubic-bezier(.22,1,.36,1) both", fontFamily: "'DM Sans',sans-serif" }}>

        {/* ── HEADER ── */}
        <div style={{ background: "linear-gradient(135deg,#0a7c73,#0bbfb3)", padding: "22px 24px 20px", display: "flex", alignItems: "center", gap: 14, flexShrink: 0, position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", width: 200, height: 200, borderRadius: "50%", background: "rgba(255,255,255,.07)", top: -70, right: -50 }} />
          <div style={{ width: 52, height: 52, borderRadius: 16, background: "rgba(255,255,255,.18)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, flexShrink: 0, border: "1.5px solid rgba(255,255,255,.3)" }}>🏥</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "'DM Serif Display',serif", color: "#fff", fontSize: 18 }}>HealthPlus Clinic</div>
            <div style={{ color: "rgba(255,255,255,.75)", fontSize: 12.5, marginTop: 2 }}>Banjara Hills, Hyderabad</div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, color: "rgba(255,255,255,.85)", fontSize: 12, fontWeight: 500, marginTop: 5 }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#7fffd4", boxShadow: "0 0 6px #7fffd4", animation: "pulse 2s infinite", display: "inline-block" }} />
              Meera — AI Receptionist {hasGeminiKey ? "✨" : "(Demo Mode)"}
            </div>
          </div>
          <div style={{ background: "rgba(255,255,255,.2)", border: "1px solid rgba(255,255,255,.3)", color: "#fff", fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 20 }}>24 / 7</div>
        </div>

        {/* ── MESSAGES ── */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 18px 12px", display: "flex", flexDirection: "column", gap: 14, background: "#f6fafa" }}>
          {messages.map((msg, i) => (
            <div key={i} style={{ display: "flex", gap: 10, flexDirection: msg.role === "user" ? "row-reverse" : "row", animation: "fadeUp .3s ease both" }}>
              <div style={avatarStyle(msg.role)}>{msg.role === "user" ? "👤" : "🏥"}</div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: msg.role === "user" ? "flex-end" : "flex-start", maxWidth: "82%" }}>
                <div style={{ ...bubbleBase, background: msg.role === "user" ? "#0a7c73" : "#fff", color: msg.role === "user" ? "#fff" : "#0d2926", borderBottomRightRadius: msg.role === "user" ? 4 : 18, borderBottomLeftRadius: msg.role === "user" ? 18 : 4, boxShadow: msg.role === "user" ? "none" : "0 2px 12px rgba(0,0,0,.06)" }}
                  dangerouslySetInnerHTML={{ __html: msg.role === "user" ? msg.content.replace(/</g, "&lt;") : parseMarkdown(msg.content) }}
                />
                {msg.widget === "doctor_picker" && <DoctorPicker onSelect={(name) => send(name)} />}
                {msg.widget === "slot_picker"   && <SlotPicker slots={msg.slots || availSlots} onSelect={(s) => send(s)} />}
                <div style={{ fontSize: 10.5, color: msg.role === "user" ? "rgba(255,255,255,.55)" : "#5a7a77", marginTop: 4, padding: "0 4px" }}>
                  {msg.role === "user" ? msg.time : `Meera · ${msg.time}`}
                </div>
                {bookingCard && i === messages.length - 1 && msg.role === "assistant" && <BookingCard data={bookingCard} />}
              </div>
            </div>
          ))}
          {loading && <TypingDots />}
          <div ref={bottomRef} />
        </div>

        {/* ── QUICK REPLIES ── */}
        {!bookingFlow && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: "4px 18px 8px", background: "#f6fafa", flexShrink: 0 }}>
            {QUICK_REPLIES.map((qr) => (
              <button key={qr.text} className="qr-btn" onClick={() => send(qr.text)} disabled={loading}
                style={{ border: "1.5px solid #c8e6e3", background: "#fff", color: "#0a7c73", fontFamily: "'DM Sans',sans-serif", fontSize: 12.5, fontWeight: 500, padding: "7px 14px", borderRadius: 20, cursor: "pointer", transition: "all .2s" }}>
                {qr.label}
              </button>
            ))}
          </div>
        )}

        {/* ── INPUT ── */}
        <div style={{ padding: "14px 16px 18px", background: "#fff", borderTop: "1px solid #c8e6e3", display: "flex", gap: 10, alignItems: "flex-end", flexShrink: 0 }}>
          <div style={{ flex: 1, background: "#f6fafa", border: "1.5px solid #c8e6e3", borderRadius: 18, padding: "10px 16px", display: "flex", alignItems: "center" }}>
            <textarea ref={textareaRef} value={input}
              onChange={(e) => { setInput(e.target.value); autoResize(e); }}
              onKeyDown={handleKey}
              placeholder={bookingFlow ? "Type your answer…" : "Ask me anything…"}
              rows={1}
              style={{ flex: 1, border: "none", background: "transparent", fontFamily: "'DM Sans',sans-serif", fontSize: 14, color: "#0d2926", resize: "none", outline: "none", maxHeight: 80, lineHeight: 1.4 }}
            />
          </div>
          <button className="send-btn" onClick={() => send(input)} disabled={loading || !input.trim()}
            style={{ width: 46, height: 46, borderRadius: 14, background: (!input.trim() || loading) ? "#c8e6e3" : "#0a7c73", border: "none", cursor: (!input.trim() || loading) ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all .2s" }}>
            <svg viewBox="0 0 24 24" width={20} height={20} fill="white"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" /></svg>
          </button>
        </div>

      </div>
    </>
  );
}