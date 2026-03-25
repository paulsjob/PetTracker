-- Bootstrap script for first admin after moving to Supabase Auth.
--
-- IMPORTANT:
-- 1) Create the auth user first from Supabase Dashboard:
--    Authentication -> Users -> Add user -> set email + password.
-- 2) Copy the new user's UUID (id).
-- 3) Replace placeholders below and run this script in SQL Editor.

begin;

-- Replace these placeholders.
-- Example:
--   user_id   = '9f1f4d47-0e6e-4927-bf46-f69f5d8679b4'
--   doctor_id = 'dr_admin'
--   clinic_id = 'default'
--   name      = 'Clinic Admin'
--   specialty = 'General'

insert into public.doctors (
  id,
  name,
  specialty,
  clinic_id,
  is_active,
  is_admin,
  app_role,
  user_id
)
values (
  'dr_admin',
  'Clinic Admin',
  'General',
  'default',
  true,
  true,
  'admin',
  'REPLACE_WITH_AUTH_USER_UUID'::uuid
)
on conflict (id) do update
set
  name = excluded.name,
  specialty = excluded.specialty,
  clinic_id = excluded.clinic_id,
  is_active = true,
  is_admin = true,
  app_role = 'admin',
  user_id = excluded.user_id;

insert into public.user_roles (
  user_id,
  clinic_id,
  role,
  is_active
)
values (
  'REPLACE_WITH_AUTH_USER_UUID'::uuid,
  'default',
  'admin',
  true
)
on conflict (user_id) do update
set
  clinic_id = excluded.clinic_id,
  role = 'admin',
  is_active = true,
  updated_at = timezone('utc', now());

commit;
