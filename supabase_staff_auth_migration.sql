-- Staff auth migration: bind staff records to Supabase Auth users and role mapping.
-- Run this AFTER your base schema has created public.doctors.

alter table public.doctors
  add column if not exists user_id uuid unique,
  add column if not exists app_role text not null default 'standard_user';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'doctors_user_id_fkey'
  ) then
    alter table public.doctors
      add constraint doctors_user_id_fkey
      foreign key (user_id)
      references auth.users (id)
      on delete set null;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'doctors_app_role_check'
  ) then
    alter table public.doctors
      add constraint doctors_app_role_check
      check (app_role in ('admin', 'standard_user'));
  end if;
end;
$$;

create table if not exists public.user_roles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  clinic_id text not null,
  role text not null check (role in ('admin', 'standard_user')),
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists user_roles_clinic_role_idx
  on public.user_roles (clinic_id, role)
  where is_active = true;

update public.doctors d
set app_role = case when d.is_admin then 'admin' else 'standard_user' end
where d.app_role is null
   or d.app_role not in ('admin', 'standard_user');
