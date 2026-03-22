// src/lib/clinic.js
// ─── All Supabase + WhatsApp + Google Calendar helpers ───────────────────────
import { createClient } from '@supabase/supabase-js'

// ── Supabase client ──────────────────────────────────────────────────────────
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)

// ── Doctor & Slot constants ──────────────────────────────────────────────────
export const DOCTORS = [
  { name: 'Dr. Ananya Reddy',    dept: 'General Physician',  days: ['Mon','Wed','Fri'], color: '#0a7c73' },
  { name: 'Dr. Karthik Sharma',  dept: 'Cardiologist',        days: ['Tue','Thu','Sat'], color: '#2563eb' },
  { name: 'Dr. Priya Nair',      dept: 'Gynecologist',        days: ['Mon','Tue','Wed','Thu','Fri','Sat'], color: '#db2777' },
  { name: 'Dr. Suresh Rao',      dept: 'Pediatrician',        days: ['Mon','Tue','Wed','Thu','Fri','Sat'], color: '#d97706' },
  { name: 'Dr. Venkata Lakshmi', dept: 'Dermatologist',       days: ['Wed','Fri','Sat'], color: '#7c3aed' },
]

export const TIME_SLOTS = [
  '09:00 AM','10:00 AM','11:00 AM','12:00 PM',
  '02:00 PM','03:00 PM','04:00 PM','05:00 PM','06:00 PM','07:00 PM'
]

// ─────────────────────────────────────────────────────────────────────────────
// APPOINTMENTS — CRUD
// ─────────────────────────────────────────────────────────────────────────────

/** Fetch all appointments (with optional filters) */
export async function getAppointments({ doctor, date, status, from, to } = {}) {
  let q = supabase.from('appointments').select('*').order('date', { ascending: false }).order('time_slot')
  if (doctor) q = q.eq('doctor', doctor)
  if (date)   q = q.eq('date', date)
  if (status) q = q.eq('status', status)
  if (from)   q = q.gte('date', from)
  if (to)     q = q.lte('date', to)
  const { data, error } = await q
  if (error) throw error
  return data
}

/** Book a new appointment */
export async function createAppointment(payload) {
  const { data, error } = await supabase
    .from('appointments')
    .insert([payload])
    .select()
    .single()
  if (error) throw error
  return data
}

/** Update appointment status */
export async function updateAppointmentStatus(id, status) {
  const { error } = await supabase
    .from('appointments')
    .update({ status })
    .eq('id', id)
  if (error) throw error
}

/** Delete / cancel appointment */
export async function cancelAppointment(id) {
  return updateAppointmentStatus(id, 'cancelled')
}

// ─────────────────────────────────────────────────────────────────────────────
// SLOT AVAILABILITY
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns available time slots for a doctor on a date.
 * Cross-checks Supabase bookings + Google Calendar busy times.
 */
export async function getAvailableSlots(doctor, date) {
  // 1. Get already-booked slots from Supabase
  const { data: booked, error } = await supabase
    .from('appointments')
    .select('time_slot')
    .eq('doctor', doctor)
    .eq('date', date)
    .neq('status', 'cancelled')
  if (error) throw error

  const bookedSlots = new Set(booked.map(a => a.time_slot))

  // 2. Get busy times from Google Calendar
  const gcalBusy = await getGCalBusySlots(date)

  // 3. Filter out booked + busy
  const available = TIME_SLOTS.filter(slot => {
    if (bookedSlots.has(slot)) return false
    // Check if this slot overlaps with gcal busy periods
    const slotTime = parseSlotTime(date, slot)
    return !gcalBusy.some(busy =>
      slotTime >= new Date(busy.start) && slotTime < new Date(busy.end)
    )
  })

  return available
}

/**
 * Check if a doctor's entire day is fully booked.
 * Returns { isFull, bookedCount, maxSlots }
 */
export async function isDayFull(doctor, date) {
  const { data: config } = await supabase
    .from('slot_config')
    .select('max_slots')
    .eq('doctor', doctor)
    .single()

  const maxSlots = config?.max_slots ?? 10

  const { count } = await supabase
    .from('appointments')
    .select('id', { count: 'exact', head: true })
    .eq('doctor', doctor)
    .eq('date', date)
    .neq('status', 'cancelled')

  return { isFull: count >= maxSlots, bookedCount: count, maxSlots }
}

/**
 * Get all "full" days for a month (for calendar display)
 * Returns Set of "YYYY-MM-DD" strings where ALL doctors are full
 */
export async function getFullDaysForMonth(year, month) {
  const from = `${year}-${String(month).padStart(2,'0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const to = `${year}-${String(month).padStart(2,'0')}-${lastDay}`

  const { data } = await supabase
    .from('appointments')
    .select('doctor, date')
    .gte('date', from)
    .lte('date', to)
    .neq('status', 'cancelled')

  // Group by date → doctor → count
  const byDate = {}
  for (const apt of data || []) {
    if (!byDate[apt.date]) byDate[apt.date] = {}
    byDate[apt.date][apt.doctor] = (byDate[apt.date][apt.doctor] || 0) + 1
  }

  // Get slot configs
  const { data: configs } = await supabase.from('slot_config').select('*')
  const maxMap = {}
  for (const c of configs || []) maxMap[c.doctor] = c.max_slots

  const fullDays = new Set()
  for (const [date, doctorCounts] of Object.entries(byDate)) {
    const allFull = DOCTORS.every(d => {
      const count = doctorCounts[d.name] || 0
      const max   = maxMap[d.name] || 10
      return count >= max
    })
    if (allFull) fullDays.add(date)
  }
  return fullDays
}

/** Dashboard stats */
export async function getDashboardStats() {
  const today = new Date().toISOString().split('T')[0]
  const monthStart = today.slice(0, 8) + '01'

  const [{ count: total }, { count: todayCount }, { count: monthCount }] = await Promise.all([
    supabase.from('appointments').select('id', { count: 'exact', head: true }).neq('status','cancelled'),
    supabase.from('appointments').select('id', { count: 'exact', head: true }).eq('date', today).neq('status','cancelled'),
    supabase.from('appointments').select('id', { count: 'exact', head: true }).gte('date', monthStart).neq('status','cancelled'),
  ])

  return { total, today: todayCount, thisMonth: monthCount }
}

// ─────────────────────────────────────────────────────────────────────────────
// WHATSAPP — Meta Business Cloud API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Send WhatsApp confirmation using an approved Message Template.
 *
 * ONE-TIME SETUP (once template is approved, uncomment the components block):
 * 1. Go to business.facebook.com -> WhatsApp Manager -> Message Templates
 * 2. Create template:
 *    - Category : UTILITY
 *    - Name     : appointment_confirmation
 *    - Language : English
 *    - Body:
 *        Hello {{1}}! Your appointment at HealthPlus Clinic is confirmed.
 *        Date: {{2}} | Time: {{3}} | Doctor: {{4}}
 *        Banjara Hills, Hyderabad | Queries: +91 40 2345 6789
 *        Ref ID: {{5}} | Please arrive 10 mins early.
 * 3. Submit -> approved in minutes for UTILITY category
 */
export async function sendWhatsAppConfirmation(appointment) {
  const { patient_name, phone, doctor, date, time_slot, id } = appointment

  const formattedDate = new Date(date + 'T00:00:00').toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  })

  // Normalize phone to 91XXXXXXXXXX (no +, spaces, dashes)
  const toPhone = phone.replace(/\D/g, '').replace(/^0/, '91')

  try {
    const res = await fetch(
      `https://graph.facebook.com/v19.0/${import.meta.env.VITE_WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${import.meta.env.VITE_WHATSAPP_TOKEN}`,
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: toPhone,
          type: 'template',
          template: {
            // ── TESTING: using hello_world (no parameters needed) ──────────
            name: 'hello_world',
            language: { code: 'en_US' },   // ← must be en_US not en-us!

            // ── PRODUCTION: uncomment below + remove hello_world above ──────
            // name: 'appointment_confirmation',
            // language: { code: 'en' },
            // components: [
            //   {
            //     type: 'body',
            //     parameters: [
            //       { type: 'text', text: patient_name },   // {{1}}
            //       { type: 'text', text: formattedDate },  // {{2}}
            //       { type: 'text', text: time_slot },      // {{3}}
            //       { type: 'text', text: doctor },         // {{4}}
            //       { type: 'text', text: id.slice(0, 8).toUpperCase() }, // {{5}}
            //     ],
            //   },
            // ],
          },
        }),
      }
    )

    const data = await res.json()

    if (data.error) {
      console.warn('WhatsApp error:', data.error.message)
      return false
    }

    // Mark whatsapp_sent in Supabase
    await supabase.from('appointments').update({ whatsapp_sent: true }).eq('id', id)
    console.log('WhatsApp sent:', data.messages?.[0]?.id)
    return true

  } catch (e) {
    console.warn('WhatsApp send failed:', e)
    return false
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// GOOGLE CALENDAR
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get busy time slots from Google Calendar for a given date.
 * Uses FreeBusy API (read-only, needs API key + calendar to be public or shared).
 */
export async function getGCalBusySlots(date) {
  const apiKey  = import.meta.env.VITE_GCAL_API_KEY
  const calId   = import.meta.env.VITE_GCAL_CALENDAR_ID
  if (!apiKey || !calId) return []

  const timeMin = new Date(date + 'T09:00:00+05:30').toISOString()
  const timeMax = new Date(date + 'T20:00:00+05:30').toISOString()

  try {
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/freeBusy?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timeMin,
          timeMax,
          items: [{ id: calId }],
        }),
      }
    )
    const data = await res.json()
    return data.calendars?.[calId]?.busy ?? []
  } catch {
    return []
  }
}

/**
 * Create a Google Calendar event for the appointment.
 * Requires OAuth2 access token (not just API key) — implement OAuth flow separately.
 * This sends to a backend endpoint that has the service account credentials.
 */
export async function createGCalEvent(appointment) {
  const { patient_name, doctor, date, time_slot, id } = appointment
  const [time, period] = time_slot.split(' ')
  const [h, m] = time.split(':')
  let hour = parseInt(h)
  if (period === 'PM' && hour !== 12) hour += 12
  if (period === 'AM' && hour === 12) hour = 0

  const startISO = `${date}T${String(hour).padStart(2,'0')}:${m}:00`
  const endISO   = `${date}T${String(hour + 1).padStart(2,'0')}:${m}:00`

  // Call your backend endpoint (which has OAuth service account)
  // Replace with your actual backend URL
  try {
    const res = await fetch('https://clinic-app-backend-hqwg.onrender.com/api/gcal-create-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        summary: `${patient_name} — ${doctor}`,
        description: `Appointment ID: ${id}\nDoctor: ${doctor}\nPatient: ${patient_name}`,
        start: { dateTime: startISO, timeZone: 'Asia/Kolkata' },
        end:   { dateTime: endISO,   timeZone: 'Asia/Kolkata' },
      }),
    })
    if (res.ok) {
      const event = await res.json()
      await supabase.from('appointments').update({ gcal_event_id: event.id }).eq('id', id)
      return event.id
    }
  } catch (e) {
    console.warn('GCal event creation failed:', e)
  }
  return null
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function parseSlotTime(date, slot) {
  const [time, period] = slot.split(' ')
  const [h, m] = time.split(':')
  let hour = parseInt(h)
  if (period === 'PM' && hour !== 12) hour += 12
  if (period === 'AM' && hour === 12) hour = 0
  return new Date(`${date}T${String(hour).padStart(2,'0')}:${m}:00+05:30`)
}