create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  clinic_id text not null,
  actor_user_id uuid null references auth.users(id) on delete set null,
  actor_doctor_id text null,
  action text not null,
  target_type text null,
  target_id text null,
  metadata jsonb null,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.audit_logs
  add column if not exists actor_user_id uuid null references auth.users(id) on delete set null;

create index if not exists audit_logs_clinic_id_created_at_idx
  on public.audit_logs (clinic_id, created_at desc);

create index if not exists audit_logs_actor_user_id_idx
  on public.audit_logs (actor_user_id, created_at desc);
