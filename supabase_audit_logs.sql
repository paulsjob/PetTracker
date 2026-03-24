create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  clinic_id text not null,
  actor_doctor_id text null,
  action text not null,
  target_type text null,
  target_id text null,
  metadata jsonb null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists audit_logs_clinic_id_created_at_idx
  on public.audit_logs (clinic_id, created_at desc);
