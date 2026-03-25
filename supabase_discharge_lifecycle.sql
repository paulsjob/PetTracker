-- Discharge lifecycle hardening:
-- 1) Add grace-period fields for access-code expiry.
-- 2) Provide a secure RPC for staff-triggered discharge.

alter table if exists public.patients
  add column if not exists discharged_at timestamptz,
  add column if not exists access_code_expires_at timestamptz;

create or replace function public.discharge_patient_with_grace(
  discharge_patient_id text,
  grace_period interval default interval '24 hours'
)
returns public.patients
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_patient public.patients;
begin
  update public.patients
  set
    status = 'discharged',
    discharged_at = now(),
    access_code_expires_at = now() + grace_period,
    updated_at = now()
  where id = discharge_patient_id
  returning * into updated_patient;

  return updated_patient;
end;
$$;

revoke all on function public.discharge_patient_with_grace(text, interval) from public;
grant execute on function public.discharge_patient_with_grace(text, interval) to authenticated;
