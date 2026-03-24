create table if not exists public.clinic_settings (
  clinic_id text primary key,
  name text not null,
  phone text not null,
  hours text not null,
  email text not null default '',
  updated_at timestamptz not null default timezone('utc', now())
);

insert into public.clinic_settings (clinic_id, name, phone, hours, email)
values (
  'default',
  'PetTracker',
  '(555) 123-4567',
  'Mon–Fri 8am–6pm, Sat 9am–1pm',
  'hello@vettrack.pro'
)
on conflict (clinic_id) do update
set
  name = excluded.name,
  phone = excluded.phone,
  hours = excluded.hours,
  email = excluded.email,
  updated_at = timezone('utc', now());
