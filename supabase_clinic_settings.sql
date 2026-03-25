create table if not exists public.clinic_settings (
  clinic_id text primary key,
  name text not null,
  phone text not null,
  hours text not null,
  email text not null default '',
  brand_color text not null default '#4f46e5',
  logo_url text,
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.clinic_settings
  add column if not exists brand_color text not null default '#4f46e5',
  add column if not exists logo_url text;

insert into public.clinic_settings (clinic_id, name, phone, hours, email, brand_color, logo_url)
values (
  'default',
  'PetTracker',
  '(555) 123-4567',
  'Mon–Fri 8am–6pm, Sat 9am–1pm',
  'hello@vettrack.pro',
  '#4f46e5',
  null
)
on conflict (clinic_id) do update
set
  name = excluded.name,
  phone = excluded.phone,
  hours = excluded.hours,
  email = excluded.email,
  brand_color = excluded.brand_color,
  logo_url = excluded.logo_url,
  updated_at = timezone('utc', now());
