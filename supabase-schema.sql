-- ─────────────────────────────────────────────────────────────
-- HealthPlus Clinic — Supabase Schema
-- Run this in your Supabase SQL editor
-- ─────────────────────────────────────────────────────────────

-- APPOINTMENTS table
create table if not exists appointments (
  id              uuid primary key default gen_random_uuid(),
  patient_name    text not null,
  phone           text not null,
  doctor          text not null,
  department      text,
  date            date not null,
  time_slot       text not null,
  status          text not null default 'confirmed',   -- confirmed | cancelled | completed
  notes           text,
  whatsapp_sent   boolean default false,
  gcal_event_id   text,
  created_at      timestamptz default now()
);

-- INDEX for fast queries
create index if not exists idx_appointments_date   on appointments(date);
create index if not exists idx_appointments_doctor on appointments(doctor);
create index if not exists idx_appointments_status on appointments(status);

-- SLOT CONFIG table (how many slots per doctor per day)
create table if not exists slot_config (
  id          serial primary key,
  doctor      text unique not null,
  max_slots   int not null default 10
);

-- Seed default doctors
insert into slot_config (doctor, max_slots) values
  ('Dr. Ananya Reddy',     10),
  ('Dr. Karthik Sharma',    8),
  ('Dr. Priya Nair',       10),
  ('Dr. Suresh Rao',       12),
  ('Dr. Venkata Lakshmi',   8)
on conflict (doctor) do nothing;

-- RLS (Row Level Security) — allow all for now (lock down in production)
alter table appointments enable row level security;
alter table slot_config   enable row level security;

create policy "Allow all" on appointments for all using (true) with check (true);
create policy "Allow all" on slot_config   for all using (true) with check (true);