-- Anonymous-safe patient lookup for pet parent tracker links.
-- Run after enabling RLS policies so parents can still lookup by System ID + Access Code.

create or replace function public.lookup_patient_with_access_code(
  lookup_patient_id text,
  lookup_access_code text
)
returns setof public.patients
language sql
security definer
set search_path = public
stable
as $$
  select p.*
  from public.patients p
  where p.id = lookup_patient_id
    and p.access_code = lookup_access_code
    and (
      p.status <> 'discharged'
      or (p.access_code_expires_at is not null and now() <= p.access_code_expires_at)
    )
  limit 1;
$$;

revoke all on function public.lookup_patient_with_access_code(text, text) from public;
grant execute on function public.lookup_patient_with_access_code(text, text) to anon;
grant execute on function public.lookup_patient_with_access_code(text, text) to authenticated;
