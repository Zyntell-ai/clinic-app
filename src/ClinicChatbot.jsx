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
  { label: "📅 Book",    text: "I want to book an appointment" },
  { label: "🕐 Hours",   text: "What are your working hours?" },
  { label: "👨‍⚕️ Doctors", text: "Which doctors are available?" },
  { label: "💊 Services",text: "What services do you offer?" },
  { label: "🚨 Emergency",text: "Emergency contact number?" },
  { label: "💰 Fees",    text: "What are the consultation fees?" },
];

// ─── Sub-components ───────────────────────────────────────────────────────────
function TypingDots() {
  return (
    <div style={{ display: "flex", gap: 10 }}>
      <div className="chat-avatar bot-avatar">🏥</div>
      <div style={{
        padding: "14px 18px", borderRadius: 18, borderBottomLeftRadius: 4,
        display: "flex", gap: 5, alignItems: "center",
        background: "#fff", boxShadow: "0 2px 12px rgba(0,0,0,.06)",
      }}>
        {[0, 0.2, 0.4].map((d, i) => (
          <span key={i} style={{
            width: 7, height: 7, borderRadius: "50%",
            background: "#0bbfb3", display: "block",
            animation: `chatBounce 1.2s ${d}s infinite ease-in-out`,
          }} />
        ))}
      </div>
    </div>
  );
}

function BookingCard({ data }) {
  return (
    <div style={{
      background: "linear-gradient(135deg,#e6f5f4,#f0fffe)",
      border: "1.5px solid rgba(10,124,115,.25)",
      borderRadius: 16, padding: "16px 18px",
      fontSize: 13.5, lineHeight: 1.8, marginTop: 8, color: "#0d2926",
    }}>
      <div style={{ fontWeight: 700, color: "#0a7c73", marginBottom: 12, fontSize: 15, display: "flex", alignItems: "center", gap: 6 }}>
        ✅ Appointment Confirmed!
      </div>
      <div style={{ display: "grid", gap: 4 }}>
        <div>📋 <strong>Ref ID:</strong> {data.id}</div>
        <div>👤 <strong>Patient:</strong> {data.patient_name}</div>
        <div>👨‍⚕️ <strong>Doctor:</strong> {data.doctor}</div>
        <div>📅 <strong>Date:</strong> {new Date(data.date + "T00:00:00").toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</div>
        <div>🕐 <strong>Time:</strong> {data.time_slot}</div>
      </div>
      <div style={{
        marginTop: 12, padding: "8px 12px",
        background: "rgba(10,124,115,.08)", borderRadius: 10,
        fontSize: 12.5, color: "#0a7c73",
      }}>
        📲 WhatsApp confirmation sent to {data.phone}
      </div>
    </div>
  );
}

function DoctorPicker({ onSelect }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8, width: "100%" }}>
      {DOCTORS.map((doc) => (
        <button key={doc.name} onClick={() => onSelect(doc.name)}
          className="doctor-pick-btn"
          style={{
            textAlign: "left", padding: "10px 14px", borderRadius: 12,
            border: "1.5px solid #c8e6e3", background: "#fff",
            cursor: "pointer", display: "flex", alignItems: "center",
            gap: 10, fontFamily: "'DM Sans',sans-serif", width: "100%",
            transition: "all .18s",
          }}
        >
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: doc.color, display: "inline-block", flexShrink: 0 }} />
          <div>
            <div style={{ fontWeight: 600, fontSize: 13, color: "#0d2926" }}>{doc.name}</div>
            <div style={{ fontSize: 11.5, color: "#5a7a77" }}>{doc.dept} · {doc.days.join("/")}</div>
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
          className="slot-btn"
          style={{
            padding: "8px 14px", borderRadius: 10,
            border: "1.5px solid #c8e6e3", background: "#fff",
            color: "#0a7c73", fontWeight: 600, fontSize: 13,
            cursor: "pointer", transition: "all .18s",
            fontFamily: "'DM Sans',sans-serif",
          }}
        >
          🕐 {slot}
        </button>
      ))}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function ClinicChatbot() {
  const [messages,       setMessages]       = useState([]);
  const [geminiHistory,  setGeminiHistory]  = useState([]);
  const [input,          setInput]          = useState("");
  const [loading,        setLoading]        = useState(false);
  const [bookingCard,    setBookingCard]    = useState(null);
  const [bookingFlow,    setBookingFlow]    = useState(null);
  const [availSlots,     setAvailSlots]     = useState([]);
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

    if (hasGeminiKey) {
      const newHistory = [...geminiHistory, { role: "user", parts: [{ text: msg }] }];
      const ok = await callGemini(newHistory, msg);
      if (ok) return;
    }

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

  const callGemini = async (history, originalMsg) => {
    try {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
          contents: history,
          generationConfig: { maxOutputTokens: 512, temperature: 0.7 },
        }),
      });

      const data = await res.json();

      if (data.error) {
        console.warn("Gemini API error:", data.error.message);
        setLoading(false);
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
      setGeminiHistory([...history, { role: "model", parts: [{ text: reply }] }]);

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

  const canSend = input.trim() && !loading;

  return (
    <>
      <style>{`
        /* ── Chatbot layout ── */
        .chatbot-page {
          flex: 1;
          display: flex;
          align-items: flex-start;
          justify-content: center;
          padding: 20px 16px 24px;
          background: linear-gradient(160deg, #e8f7f6 0%, #f0fffe 50%, #e4f3f1 100%);
          min-height: calc(100dvh - 56px);
        }
        @media (max-width: 600px) {
          .chatbot-page {
            padding: 0;
            align-items: stretch;
            background: #f6fafa;
          }
        }

        .chatbot-container {
          width: 100%;
          max-width: 480px;
          height: 760px;
          max-height: calc(100dvh - 56px - 40px);
          border-radius: 28px;
          background: #fff;
          box-shadow: 0 8px 48px rgba(10,124,115,.14), 0 2px 0 #c8e6e3;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          animation: chatRise .55s cubic-bezier(.22,1,.36,1) both;
          font-family: 'DM Sans', sans-serif;
          border: 1px solid rgba(10,124,115,.1);
        }
        @media (max-width: 600px) {
          .chatbot-container {
            max-width: 100%;
            height: calc(100dvh - 56px);
            max-height: none;
            border-radius: 0;
            box-shadow: none;
            border: none;
            animation: none;
          }
        }

        /* ── Chat messages ── */
        .chat-msgs {
          flex: 1;
          overflow-y: auto;
          padding: 20px 16px 12px;
          display: flex;
          flex-direction: column;
          gap: 14px;
          background: #f6fafa;
          scroll-behavior: smooth;
        }
        @media (max-width: 600px) {
          .chat-msgs { padding: 16px 12px 10px; }
        }

        /* ── Avatars ── */
        .chat-avatar {
          width: 32px; height: 32px;
          border-radius: 10px;
          flex-shrink: 0; margin-top: 2px;
          display: flex; align-items: center; justify-content: center;
          font-size: 15px;
        }
        .user-avatar { background: #0a7c73; }
        .bot-avatar  { background: #d4f0ed; }

        /* ── Bubbles ── */
        .chat-bubble {
          padding: 11px 14px;
          border-radius: 18px;
          font-size: 14px;
          line-height: 1.6;
          max-width: 80%;
          word-break: break-word;
        }
        .user-bubble {
          background: #0a7c73;
          color: #fff;
          border-bottom-right-radius: 4px;
          box-shadow: 0 2px 12px rgba(10,124,115,.2);
        }
        .bot-bubble {
          background: #fff;
          color: #0d2926;
          border-bottom-left-radius: 4px;
          box-shadow: 0 2px 12px rgba(0,0,0,.06);
        }

        /* ── Message row ── */
        .msg-row {
          display: flex;
          gap: 8px;
          animation: chatFadeUp .3s ease both;
        }
        .msg-row.user { flex-direction: row-reverse; }

        .msg-col {
          display: flex;
          flex-direction: column;
          max-width: 84%;
        }
        .msg-col.user { align-items: flex-end; }
        .msg-col.bot  { align-items: flex-start; }

        .msg-time {
          font-size: 10.5px;
          margin-top: 4px;
          padding: 0 4px;
        }
        .user .msg-time { color: rgba(0,0,0,.3); }
        .bot .msg-time  { color: #5a7a77; }

        /* ── Quick replies ── */
        .qr-bar {
          display: flex;
          gap: 6px;
          padding: 6px 14px 8px;
          background: #f6fafa;
          overflow-x: auto;
          flex-shrink: 0;
          scrollbar-width: none;
          -webkit-overflow-scrolling: touch;
        }
        .qr-bar::-webkit-scrollbar { display: none; }

        .qr-btn {
          border: 1.5px solid #c8e6e3;
          background: #fff;
          color: #0a7c73;
          font-family: 'DM Sans', sans-serif;
          font-size: 12.5px;
          font-weight: 500;
          padding: 7px 13px;
          border-radius: 20px;
          cursor: pointer;
          transition: all .18s;
          white-space: nowrap;
          flex-shrink: 0;
        }
        .qr-btn:hover:not(:disabled) {
          background: #0a7c73;
          color: #fff;
          border-color: #0a7c73;
          transform: translateY(-1px);
        }
        .qr-btn:disabled { opacity: .55; cursor: not-allowed; }

        /* ── Input area ── */
        .chat-input-area {
          padding: 12px 14px;
          padding-bottom: calc(12px + env(safe-area-inset-bottom, 0px));
          background: #fff;
          border-top: 1px solid #c8e6e3;
          display: flex;
          gap: 8px;
          align-items: flex-end;
          flex-shrink: 0;
        }
        .chat-input-wrap {
          flex: 1;
          background: #f6fafa;
          border: 1.5px solid #c8e6e3;
          border-radius: 18px;
          padding: 9px 14px;
          display: flex;
          align-items: center;
          transition: border-color .18s;
        }
        .chat-input-wrap:focus-within {
          border-color: #0a7c73;
          background: #fff;
        }
        .chat-textarea {
          flex: 1; border: none; background: transparent;
          font-family: 'DM Sans', sans-serif;
          font-size: 14px; color: #0d2926;
          resize: none; outline: none;
          max-height: 80px; line-height: 1.45;
        }
        .chat-textarea::placeholder { color: #9ab8b5; }

        .send-btn {
          width: 44px; height: 44px;
          border-radius: 14px; border: none;
          cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0; transition: all .2s;
          outline: none;
        }
        .send-btn:hover:not(:disabled) { transform: scale(1.06); }
        .send-btn:disabled { cursor: not-allowed; }

        /* ── Doctor & slot buttons hover ── */
        .doctor-pick-btn:hover {
          background: #e6f5f4 !important;
          border-color: #0a7c73 !important;
        }
        .slot-btn:hover {
          background: #0a7c73 !important;
          color: #fff !important;
        }

        /* ── Animations ── */
        @keyframes chatRise    { from{opacity:0;transform:translateY(24px) scale(.98)} to{opacity:1;transform:translateY(0) scale(1)} }
        @keyframes chatFadeUp  { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes chatBounce  { 0%,80%,100%{transform:translateY(0);opacity:.5} 40%{transform:translateY(-6px);opacity:1} }
        @keyframes chatPulse   { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.6;transform:scale(.8)} }
      `}</style>

      <div className="chatbot-page">
        <div className="chatbot-container">

          {/* ── HEADER ── */}
          <div style={{
            background: "linear-gradient(135deg,#0a7c73,#0bbfb3)",
            padding: "20px 22px 18px",
            display: "flex", alignItems: "center", gap: 14,
            flexShrink: 0, position: "relative", overflow: "hidden",
          }}>
            {/* Decorative circles */}
            <div style={{ position:"absolute", width:180, height:180, borderRadius:"50%", background:"rgba(255,255,255,.06)", top:-60, right:-40, pointerEvents:"none" }} />
            <div style={{ position:"absolute", width:100, height:100, borderRadius:"50%", background:"rgba(255,255,255,.04)", bottom:-50, left:60, pointerEvents:"none" }} />

            <div style={{
              width: 50, height: 50, borderRadius: 16,
              background: "rgba(255,255,255,.18)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 24, flexShrink: 0,
              border: "1.5px solid rgba(255,255,255,.3)",
              boxShadow: "0 4px 12px rgba(0,0,0,.12)",
            }}>🏥</div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: "'DM Serif Display',serif", color: "#fff", fontSize: 17, letterSpacing: "-.2px" }}>
                HealthPlus Clinic
              </div>
              <div style={{ color: "rgba(255,255,255,.72)", fontSize: 12, marginTop: 2 }}>
                Banjara Hills, Hyderabad
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 6 }}>
                <span style={{
                  width: 7, height: 7, borderRadius: "50%",
                  background: "#7fffd4", boxShadow: "0 0 6px #7fffd4",
                  animation: "chatPulse 2s infinite", display: "inline-block",
                }} />
                <span style={{ color: "rgba(255,255,255,.82)", fontSize: 11.5, fontWeight: 500 }}>
                  Meera — AI Receptionist {hasGeminiKey ? "✨" : "(Demo)"}
                </span>
              </div>
            </div>

            <div style={{
              background: "rgba(255,255,255,.18)",
              border: "1px solid rgba(255,255,255,.28)",
              color: "#fff", fontSize: 11, fontWeight: 700,
              padding: "4px 10px", borderRadius: 20, flexShrink: 0,
              letterSpacing: ".5px",
            }}>24 / 7</div>
          </div>

          {/* ── MESSAGES ── */}
          <div className="chat-msgs">
            {messages.map((msg, i) => (
              <div key={i} className={`msg-row ${msg.role === "user" ? "user" : "bot"}`}>
                <div className={`chat-avatar ${msg.role === "user" ? "user-avatar" : "bot-avatar"}`}>
                  {msg.role === "user" ? "👤" : "🏥"}
                </div>
                <div className={`msg-col ${msg.role === "user" ? "user" : "bot"}`}>
                  <div
                    className={`chat-bubble ${msg.role === "user" ? "user-bubble" : "bot-bubble"}`}
                    dangerouslySetInnerHTML={{
                      __html: msg.role === "user"
                        ? msg.content.replace(/</g, "&lt;")
                        : parseMarkdown(msg.content),
                    }}
                  />
                  {msg.widget === "doctor_picker" && <DoctorPicker onSelect={(name) => send(name)} />}
                  {msg.widget === "slot_picker"   && <SlotPicker slots={msg.slots || availSlots} onSelect={(s) => send(s)} />}
                  <div className="msg-time">
                    {msg.role === "user" ? msg.time : `Meera · ${msg.time}`}
                  </div>
                  {bookingCard && i === messages.length - 1 && msg.role === "assistant" && (
                    <BookingCard data={bookingCard} />
                  )}
                </div>
              </div>
            ))}
            {loading && <TypingDots />}
            <div ref={bottomRef} />
          </div>

          {/* ── QUICK REPLIES ── */}
          {!bookingFlow && (
            <div className="qr-bar">
              {QUICK_REPLIES.map((qr) => (
                <button key={qr.text} className="qr-btn" onClick={() => send(qr.text)} disabled={loading}>
                  {qr.label}
                </button>
              ))}
            </div>
          )}

          {/* ── INPUT ── */}
          <div className="chat-input-area">
            <div className="chat-input-wrap">
              <textarea
                ref={textareaRef}
                className="chat-textarea"
                value={input}
                onChange={(e) => { setInput(e.target.value); autoResize(e); }}
                onKeyDown={handleKey}
                placeholder={bookingFlow ? "Type your answer…" : "Ask me anything…"}
                rows={1}
              />
            </div>
            <button
              className="send-btn"
              onClick={() => send(input)}
              disabled={!canSend}
              style={{ background: canSend ? "#0a7c73" : "#c8e6e3" }}
            >
              <svg viewBox="0 0 24 24" width={18} height={18} fill="white">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
              </svg>
            </button>
          </div>

        </div>
      </div>
    </>
  );
}