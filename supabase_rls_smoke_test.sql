-- RLS smoke test for session-based staff auth policy set.
-- Run AFTER schema + supabase_staff_auth_migration.sql + audit + rls policies.

begin;

-- Seed test users/roles as migration data (run as privileged SQL editor user).
insert into public.doctors (id, name, specialty, clinic_id, is_active, is_admin, app_role, user_id)
values
  ('dr_standard', 'Standard User', 'ER', 'default', true, false, 'standard_user', '11111111-1111-1111-1111-111111111111'),
  ('dr_admin', 'Admin User', 'Surgery', 'default', true, true, 'admin', '22222222-2222-2222-2222-222222222222')
on conflict (id) do update
set
  user_id = excluded.user_id,
  app_role = excluded.app_role,
  is_admin = excluded.is_admin,
  is_active = true;

insert into public.user_roles (user_id, clinic_id, role, is_active)
values
  ('11111111-1111-1111-1111-111111111111', 'default', 'standard_user', true),
  ('22222222-2222-2222-2222-222222222222', 'default', 'admin', true)
on conflict (user_id) do update
set
  clinic_id = excluded.clinic_id,
  role = excluded.role,
  is_active = true;

-- 1) Non-admin can read patients, but cannot create staff.
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"11111111-1111-1111-1111-111111111111"}',
  true
);

select id, clinic_id, doctor_id from public.patients limit 5;

insert into public.doctors (id, name, specialty, clinic_id, is_active, is_admin, app_role)
values ('should_fail_non_admin', 'Non Admin', 'ER', 'default', true, false, 'standard_user');

rollback;

begin;

-- 2) Admin can mutate staff rows and clinic settings.
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"22222222-2222-2222-2222-222222222222"}',
  true
);

insert into public.doctors (id, name, specialty, clinic_id, is_active, is_admin, app_role)
values ('rls_test_doc', 'RLS Test Doc', 'Surgery', 'default', true, false, 'standard_user');

update public.doctors set is_active = false where id = 'rls_test_doc';

delete from public.doctors where id = 'rls_test_doc';

rollback;

begin;

-- 3) Cross-clinic write fails.
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"22222222-2222-2222-2222-222222222222"}',
  true
);

insert into public.patients (
  id, name, owner, clinic_id, doctor_id, access_code, stage, status, stage_history
)
values (
  'rls_cross_clinic_fail',
  'Cross Clinic',
  'Owner Name',
  'other_clinic',
  'dr_admin',
  '123456',
  'checked-in',
  'active',
  '[]'::jsonb
);

rollback;
