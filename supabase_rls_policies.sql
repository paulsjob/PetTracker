-- Session-based RLS policies for Supabase Auth.
-- Requires: supabase_staff_auth_migration.sql and supabase_audit_logs.sql.

create or replace function public.current_staff_clinic_id()
returns text
language sql
stable
as $$
  select coalesce(
    (
      select d.clinic_id
      from public.doctors d
      where d.user_id = auth.uid()
        and d.is_active = true
      limit 1
    ),
    ''
  );
$$;

create or replace function public.current_staff_doctor_id()
returns text
language sql
stable
as $$
  select coalesce(
    (
      select d.id
      from public.doctors d
      where d.user_id = auth.uid()
        and d.is_active = true
      limit 1
    ),
    ''
  );
$$;

create or replace function public.current_staff_role()
returns text
language sql
stable
as $$
  select coalesce(
    (
      select ur.role
      from public.user_roles ur
      where ur.user_id = auth.uid()
        and ur.clinic_id = public.current_staff_clinic_id()
        and ur.is_active = true
      limit 1
    ),
    'standard_user'
  );
$$;

create or replace function public.current_staff_is_admin()
returns boolean
language sql
stable
as $$
  select public.current_staff_role() = 'admin';
$$;

create or replace function public.current_staff_is_active()
returns boolean
language sql
stable
as $$
  select auth.role() = 'authenticated'
    and auth.uid() is not null
    and public.current_staff_clinic_id() <> '';
$$;

alter table public.user_roles enable row level security;

drop policy if exists user_roles_admin_select on public.user_roles;
create policy user_roles_admin_select
  on public.user_roles
  for select
  using (
    public.current_staff_is_active()
    and clinic_id = public.current_staff_clinic_id()
    and public.current_staff_is_admin()
  );

drop policy if exists user_roles_admin_write on public.user_roles;
create policy user_roles_admin_write
  on public.user_roles
  for all
  using (
    public.current_staff_is_active()
    and clinic_id = public.current_staff_clinic_id()
    and public.current_staff_is_admin()
  )
  with check (
    public.current_staff_is_active()
    and clinic_id = public.current_staff_clinic_id()
    and role in ('admin', 'standard_user')
    and public.current_staff_is_admin()
  );

-- PATIENTS
alter table public.patients enable row level security;
drop policy if exists patients_select_same_clinic_active_staff on public.patients;
drop policy if exists patients_insert_same_clinic_active_staff on public.patients;
drop policy if exists patients_update_same_clinic_active_staff on public.patients;
drop policy if exists patients_delete_admin_only on public.patients;

create policy patients_select_same_clinic_active_staff
  on public.patients
  for select
  using (
    public.current_staff_is_active()
    and clinic_id = public.current_staff_clinic_id()
  );

drop policy if exists patients_parent_realtime_select_by_id_and_access_code on public.patients;
create policy patients_parent_realtime_select_by_id_and_access_code
  on public.patients
  for select
  to anon
  using (
    auth.role() = 'anon'
    and id = coalesce((current_setting('request.jwt.claims', true))::json ->> 'patient_id', '')
    and access_code = coalesce((current_setting('request.jwt.claims', true))::json ->> 'access_code', '')
  );

create policy patients_insert_same_clinic_active_staff
  on public.patients
  for insert
  with check (
    public.current_staff_is_active()
    and clinic_id = public.current_staff_clinic_id()
    and doctor_id = public.current_staff_doctor_id()
  );

create policy patients_update_same_clinic_active_staff
  on public.patients
  for update
  using (
    public.current_staff_is_active()
    and clinic_id = public.current_staff_clinic_id()
  )
  with check (
    public.current_staff_is_active()
    and clinic_id = public.current_staff_clinic_id()
  );

create policy patients_delete_admin_only
  on public.patients
  for delete
  using (
    public.current_staff_is_active()
    and clinic_id = public.current_staff_clinic_id()
    and public.current_staff_is_admin()
  );

-- DOCTORS / STAFF
alter table public.doctors enable row level security;
drop policy if exists doctors_select_same_clinic_active_staff on public.doctors;
drop policy if exists doctors_admin_insert on public.doctors;
drop policy if exists doctors_admin_update on public.doctors;
drop policy if exists doctors_admin_delete on public.doctors;

create policy doctors_select_same_clinic_active_staff
  on public.doctors
  for select
  using (
    public.current_staff_is_active()
    and clinic_id = public.current_staff_clinic_id()
  );

create policy doctors_admin_insert
  on public.doctors
  for insert
  with check (
    public.current_staff_is_active()
    and clinic_id = public.current_staff_clinic_id()
    and app_role in ('admin', 'standard_user')
    and public.current_staff_is_admin()
  );

create policy doctors_admin_update
  on public.doctors
  for update
  using (
    public.current_staff_is_active()
    and clinic_id = public.current_staff_clinic_id()
    and public.current_staff_is_admin()
  )
  with check (
    public.current_staff_is_active()
    and clinic_id = public.current_staff_clinic_id()
    and app_role in ('admin', 'standard_user')
    and public.current_staff_is_admin()
  );

create policy doctors_admin_delete
  on public.doctors
  for delete
  using (
    public.current_staff_is_active()
    and clinic_id = public.current_staff_clinic_id()
    and public.current_staff_is_admin()
  );

-- CLINIC SETTINGS
alter table public.clinic_settings enable row level security;
drop policy if exists clinic_settings_select_same_clinic_active_staff on public.clinic_settings;
drop policy if exists clinic_settings_select_anon on public.clinic_settings;
drop policy if exists clinic_settings_admin_write on public.clinic_settings;

create policy clinic_settings_select_same_clinic_active_staff
  on public.clinic_settings
  for select
  using (
    public.current_staff_is_active()
    and clinic_id = public.current_staff_clinic_id()
  );

create policy clinic_settings_select_anon
  on public.clinic_settings
  for select
  to anon
  using (true);

create policy clinic_settings_admin_write
  on public.clinic_settings
  for all
  using (
    public.current_staff_is_active()
    and clinic_id = public.current_staff_clinic_id()
    and public.current_staff_is_admin()
  )
  with check (
    public.current_staff_is_active()
    and clinic_id = public.current_staff_clinic_id()
    and public.current_staff_is_admin()
  );

-- AUDIT LOGS
alter table public.audit_logs enable row level security;
drop policy if exists audit_logs_select_same_clinic_active_staff on public.audit_logs;
drop policy if exists audit_logs_insert_same_clinic_active_staff on public.audit_logs;

create policy audit_logs_select_same_clinic_active_staff
  on public.audit_logs
  for select
  using (
    public.current_staff_is_active()
    and clinic_id = public.current_staff_clinic_id()
  );

create policy audit_logs_insert_same_clinic_active_staff
  on public.audit_logs
  for insert
  with check (
    public.current_staff_is_active()
    and clinic_id = public.current_staff_clinic_id()
    and actor_user_id = auth.uid()
    and (actor_doctor_id is null or actor_doctor_id = public.current_staff_doctor_id())
  );

revoke all on table public.patients from anon;
revoke all on table public.doctors from anon;
revoke all on table public.clinic_settings from anon;
revoke all on table public.audit_logs from anon;
revoke all on table public.user_roles from anon;

grant select on table public.patients to anon;
