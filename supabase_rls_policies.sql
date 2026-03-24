-- Row Level Security hardening for production deployments.
-- Assumes your authenticated JWT includes these custom claims:
--   clinic_id: text
--   doctor_id: text
--   is_admin: boolean
--
-- Example JWT payload snippet:
-- {
--   "role": "authenticated",
--   "clinic_id": "default",
--   "doctor_id": "doc_abc123",
--   "is_admin": true
-- }

create or replace function public.current_clinic_id()
returns text
language sql
stable
as $$
  select coalesce(auth.jwt() ->> 'clinic_id', '');
$$;

create or replace function public.current_doctor_id()
returns text
language sql
stable
as $$
  select coalesce(auth.jwt() ->> 'doctor_id', '');
$$;

create or replace function public.current_is_admin()
returns boolean
language sql
stable
as $$
  select coalesce((auth.jwt() ->> 'is_admin')::boolean, false);
$$;

create or replace function public.current_staff_is_active()
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.doctors d
    where d.id = public.current_doctor_id()
      and d.clinic_id = public.current_clinic_id()
      and d.is_active = true
  );
$$;

-- PATIENTS
alter table public.patients enable row level security;

create policy patients_select_same_clinic_active_staff
  on public.patients
  for select
  using (
    auth.role() = 'authenticated'
    and clinic_id = public.current_clinic_id()
    and public.current_staff_is_active()
  );

create policy patients_insert_same_clinic_active_staff
  on public.patients
  for insert
  with check (
    auth.role() = 'authenticated'
    and clinic_id = public.current_clinic_id()
    and public.current_staff_is_active()
    and doctor_id = public.current_doctor_id()
  );

create policy patients_update_same_clinic_active_staff
  on public.patients
  for update
  using (
    auth.role() = 'authenticated'
    and clinic_id = public.current_clinic_id()
    and public.current_staff_is_active()
  )
  with check (
    auth.role() = 'authenticated'
    and clinic_id = public.current_clinic_id()
    and public.current_staff_is_active()
  );

-- Only admins can delete patient rows.
create policy patients_delete_admin_only
  on public.patients
  for delete
  using (
    auth.role() = 'authenticated'
    and clinic_id = public.current_clinic_id()
    and public.current_staff_is_active()
    and public.current_is_admin()
  );

-- DOCTORS / STAFF
alter table public.doctors enable row level security;

create policy doctors_select_same_clinic_active_staff
  on public.doctors
  for select
  using (
    auth.role() = 'authenticated'
    and clinic_id = public.current_clinic_id()
    and public.current_staff_is_active()
  );

create policy doctors_admin_insert
  on public.doctors
  for insert
  with check (
    auth.role() = 'authenticated'
    and clinic_id = public.current_clinic_id()
    and public.current_staff_is_active()
    and public.current_is_admin()
  );

create policy doctors_admin_update
  on public.doctors
  for update
  using (
    auth.role() = 'authenticated'
    and clinic_id = public.current_clinic_id()
    and public.current_staff_is_active()
    and public.current_is_admin()
  )
  with check (
    auth.role() = 'authenticated'
    and clinic_id = public.current_clinic_id()
    and public.current_staff_is_active()
    and public.current_is_admin()
  );

create policy doctors_admin_delete
  on public.doctors
  for delete
  using (
    auth.role() = 'authenticated'
    and clinic_id = public.current_clinic_id()
    and public.current_staff_is_active()
    and public.current_is_admin()
  );

-- CLINIC SETTINGS
alter table public.clinic_settings enable row level security;

create policy clinic_settings_select_same_clinic_active_staff
  on public.clinic_settings
  for select
  using (
    auth.role() = 'authenticated'
    and clinic_id = public.current_clinic_id()
    and public.current_staff_is_active()
  );

create policy clinic_settings_admin_write
  on public.clinic_settings
  for all
  using (
    auth.role() = 'authenticated'
    and clinic_id = public.current_clinic_id()
    and public.current_staff_is_active()
    and public.current_is_admin()
  )
  with check (
    auth.role() = 'authenticated'
    and clinic_id = public.current_clinic_id()
    and public.current_staff_is_active()
    and public.current_is_admin()
  );

-- AUDIT LOGS
alter table public.audit_logs enable row level security;

create policy audit_logs_select_same_clinic_active_staff
  on public.audit_logs
  for select
  using (
    auth.role() = 'authenticated'
    and clinic_id = public.current_clinic_id()
    and public.current_staff_is_active()
  );

create policy audit_logs_insert_same_clinic_active_staff
  on public.audit_logs
  for insert
  with check (
    auth.role() = 'authenticated'
    and clinic_id = public.current_clinic_id()
    and public.current_staff_is_active()
    and actor_doctor_id = public.current_doctor_id()
  );

-- Optional: lock all direct access for anon users explicitly.
revoke all on table public.patients from anon;
revoke all on table public.doctors from anon;
revoke all on table public.clinic_settings from anon;
revoke all on table public.audit_logs from anon;
