-- White-label branding storage bucket and RLS policies
insert into storage.buckets (id, name, public)
values ('clinic_assets', 'clinic_assets', true)
on conflict (id) do update
set public = true;

-- Authenticated admins can upload/update/delete clinic assets in their own clinic folder.
drop policy if exists clinic_assets_admin_insert on storage.objects;
create policy clinic_assets_admin_insert
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'clinic_assets'
    and public.current_staff_is_active()
    and public.current_staff_is_admin()
    and split_part(name, '/', 1) = public.current_staff_clinic_id()
  );

drop policy if exists clinic_assets_admin_update on storage.objects;
create policy clinic_assets_admin_update
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'clinic_assets'
    and public.current_staff_is_active()
    and public.current_staff_is_admin()
    and split_part(name, '/', 1) = public.current_staff_clinic_id()
  )
  with check (
    bucket_id = 'clinic_assets'
    and public.current_staff_is_active()
    and public.current_staff_is_admin()
    and split_part(name, '/', 1) = public.current_staff_clinic_id()
  );

drop policy if exists clinic_assets_admin_delete on storage.objects;
create policy clinic_assets_admin_delete
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'clinic_assets'
    and public.current_staff_is_active()
    and public.current_staff_is_admin()
    and split_part(name, '/', 1) = public.current_staff_clinic_id()
  );

-- Public read access for logos/images.
drop policy if exists clinic_assets_public_read on storage.objects;
create policy clinic_assets_public_read
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'clinic_assets');
