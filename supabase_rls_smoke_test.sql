-- RLS smoke test for VetTrack Pro production policy set.
-- Run AFTER schema + clinic settings + audit logs + supabase_rls_policies.sql.
--
-- This script emulates JWT claims using request.jwt.claims.
-- It verifies both allowed and denied behavior using role-level checks.

begin;

-- 1) Non-admin staff in clinic "default" can read same-clinic patients.
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","clinic_id":"default","doctor_id":"dr_smith","is_admin":false}',
  true
);

-- Expected: succeeds (0+ rows)
select id, clinic_id, doctor_id from public.patients limit 5;

-- Expected: fails (non-admin cannot create staff)
insert into public.doctors (id, name, specialty, pin, clinic_id, is_active, is_admin)
values ('should_fail_non_admin', 'Non Admin', 'ER', '9999', 'default', true, false);

rollback;

begin;

-- 2) Admin staff in clinic "default" can perform admin mutations.
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","clinic_id":"default","doctor_id":"dr_admin","is_admin":true}',
  true
);

-- Expected: succeeds
insert into public.doctors (id, name, specialty, pin, clinic_id, is_active, is_admin)
values ('rls_test_doc', 'RLS Test Doc', 'Surgery', '1234', 'default', true, false);

-- Expected: succeeds
update public.doctors set is_active = false where id = 'rls_test_doc';

-- Expected: succeeds
delete from public.doctors where id = 'rls_test_doc';

rollback;

begin;

-- 3) Cross-clinic write should fail.
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","clinic_id":"default","doctor_id":"dr_admin","is_admin":true}',
  true
);

-- Expected: fails because clinic_id does not match current_clinic_id()
insert into public.patients (
  id, name, owner, clinic_id, doctor_id, access_code, stage, status, stage_history
)
values (
  'rls_cross_clinic_fail',
  'Cross Clinic',
  'Owner Name',
  'other_clinic',
  'dr_admin',
  'ABCD12',
  'checked-in',
  'active',
  '[]'::jsonb
);

rollback;
