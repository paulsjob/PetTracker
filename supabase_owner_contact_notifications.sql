-- Adds unified owner contact channel and supports notification workflows.
alter table public.patients
  add column if not exists owner_contact text;

-- Backfill owner_contact from the legacy owner_phone column where possible.
update public.patients
set owner_contact = owner_phone
where owner_contact is null
  and owner_phone is not null;

create index if not exists idx_patients_owner_contact on public.patients(owner_contact);
