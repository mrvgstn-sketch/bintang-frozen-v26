-- Bintang Frozen V26 - Storage untuk foto nota.
-- Jalankan satu kali di Supabase SQL Editor sebelum memakai upload foto versi baru.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('bf-nota', 'bf-nota', true, 10485760, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- User terautentikasi dapat upload foto nota miliknya sendiri di folder store/user-id/...
drop policy if exists "bf_nota_insert_own" on storage.objects;
create policy "bf_nota_insert_own"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'bf-nota'
  and (storage.foldername(name))[2] = auth.uid()::text
);

-- Bucket public: pembacaan gambar dilakukan melalui public URL.
drop policy if exists "bf_nota_select_public" on storage.objects;
create policy "bf_nota_select_public"
on storage.objects for select to public
using (bucket_id = 'bf-nota');

-- Pemilik file dapat menghapus file miliknya bila kelak cleanup orphan diaktifkan.
drop policy if exists "bf_nota_delete_own" on storage.objects;
create policy "bf_nota_delete_own"
on storage.objects for delete to authenticated
using (
  bucket_id = 'bf-nota'
  and (storage.foldername(name))[2] = auth.uid()::text
);
