-- Bintang Frozen V26 - upgrade penyimpanan pusat dan Storage foto.
-- Aman dijalankan berulang. Jalankan di Supabase SQL Editor sebelum deploy aplikasi baru.

-- 1) Pusat state per-key dengan optimistic revision.
create table if not exists public.bf_state_items (
  store_code text not null,
  state_key text not null,
  value text not null,
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default now(),
  updated_by uuid null references auth.users(id) on delete set null,
  primary key (store_code, state_key)
);

create index if not exists bf_state_items_updated_at_idx
  on public.bf_state_items (store_code, updated_at desc);

alter table public.bf_state_items enable row level security;

drop policy if exists "bf_state_items_read_active" on public.bf_state_items;
create policy "bf_state_items_read_active"
on public.bf_state_items for select to authenticated
using (
  exists (
    select 1 from public.bf_profiles p
    where p.id = auth.uid() and p.active = true
  )
);

drop policy if exists "bf_state_items_insert_active" on public.bf_state_items;
create policy "bf_state_items_insert_active"
on public.bf_state_items for insert to authenticated
with check (
  updated_by = auth.uid()
  and exists (
    select 1 from public.bf_profiles p
    where p.id = auth.uid() and p.active = true
  )
);

drop policy if exists "bf_state_items_update_active" on public.bf_state_items;
create policy "bf_state_items_update_active"
on public.bf_state_items for update to authenticated
using (
  exists (
    select 1 from public.bf_profiles p
    where p.id = auth.uid() and p.active = true
  )
)
with check (
  updated_by = auth.uid()
  and exists (
    select 1 from public.bf_profiles p
    where p.id = auth.uid() and p.active = true
  )
);

drop policy if exists "bf_state_items_delete_active" on public.bf_state_items;
create policy "bf_state_items_delete_active"
on public.bf_state_items for delete to authenticated
using (
  exists (
    select 1 from public.bf_profiles p
    where p.id = auth.uid() and p.active = true
  )
);

-- 2) Migrasi satu kali snapshot pusat lama ke key V26.
-- Tabel lama tidak lagi dibaca/ditulis oleh aplikasi setelah upgrade.
do $$
begin
  if to_regclass('public.bf_shared_state') is not null then
    insert into public.bf_state_items (store_code,state_key,value,revision,updated_at,updated_by)
    select s.store_code,
      case e.key
        when 'bf_masuk_v23_manual' then 'bf_masuk_v26'
        when 'bf_keluar_v23_manual' then 'bf_keluar_v26'
        when 'bf_note_pengeluaran_v23b' then 'bf_note_pengeluaran_v26'
        when 'bf_note_pengeluaran_v23c' then 'bf_note_pengeluaran_v26'
        when 'bf_note_setoran_v23b' then 'bf_note_setoran_v26'
        when 'bf_note_setoran_v23c' then 'bf_note_setoran_v26'
        when 'bf_note_sembako_v23c' then 'bf_note_sembako_v26'
        when 'bf_tally_pro_v25' then 'bf_tally_pro_v26'
        when 'bf_tally_detail_v25' then 'bf_tally_detail_v26'
        when 'bf_tally_cols_v25' then 'bf_tally_cols_v26'
        else e.key
      end as state_key,
      e.value,
      1,
      coalesce(s.updated_at,now()),
      case when s.updated_by::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then s.updated_by::text::uuid else null end
    from public.bf_shared_state s
    cross join lateral jsonb_each_text(s.data::jsonb) e
    where e.key not in ('bf_note_pengeluaran_v23b','bf_note_pengeluaran_v23c','bf_note_setoran_v23b','bf_note_setoran_v23c')
    on conflict (store_code,state_key) do nothing;

    -- Gabungkan generasi catatan keuangan lama tanpa menimpa data yang sudah ada.
    insert into public.bf_state_items (store_code,state_key,value,revision,updated_at,updated_by)
    select s.store_code,'bf_note_pengeluaran_v26',
      coalesce((select jsonb_agg(distinct x)::text from (
        select jsonb_array_elements(coalesce((s.data->>'bf_note_pengeluaran_v23b')::jsonb,'[]'::jsonb)) x
        union all
        select jsonb_array_elements(coalesce((s.data->>'bf_note_pengeluaran_v23c')::jsonb,'[]'::jsonb)) x
      ) q),'[]'),1,coalesce(s.updated_at,now()),case when s.updated_by::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then s.updated_by::text::uuid else null end
    from public.bf_shared_state s
    where s.data::jsonb ? 'bf_note_pengeluaran_v23b' or s.data::jsonb ? 'bf_note_pengeluaran_v23c'
    on conflict (store_code,state_key) do nothing;

    insert into public.bf_state_items (store_code,state_key,value,revision,updated_at,updated_by)
    select s.store_code,'bf_note_setoran_v26',
      coalesce((select jsonb_agg(distinct x)::text from (
        select jsonb_array_elements(coalesce((s.data->>'bf_note_setoran_v23b')::jsonb,'[]'::jsonb)) x
        union all
        select jsonb_array_elements(coalesce((s.data->>'bf_note_setoran_v23c')::jsonb,'[]'::jsonb)) x
      ) q),'[]'),1,coalesce(s.updated_at,now()),case when s.updated_by::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then s.updated_by::text::uuid else null end
    from public.bf_shared_state s
    where s.data::jsonb ? 'bf_note_setoran_v23b' or s.data::jsonb ? 'bf_note_setoran_v23c'
    on conflict (store_code,state_key) do nothing;
  end if;
end $$;

-- 3) Cadangan state harian terpisah dari data aktif.
create table if not exists public.bf_state_snapshots (
  store_code text not null,
  snapshot_date date not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  created_by uuid null references auth.users(id) on delete set null,
  primary key (store_code, snapshot_date)
);
alter table public.bf_state_snapshots enable row level security;
drop policy if exists "bf_state_snapshots_owner_all" on public.bf_state_snapshots;
create policy "bf_state_snapshots_owner_all" on public.bf_state_snapshots for all to authenticated
using (exists (select 1 from public.bf_profiles p where p.id=auth.uid() and p.active=true and p.role='owner'))
with check (created_by=auth.uid() and exists (select 1 from public.bf_profiles p where p.id=auth.uid() and p.active=true and p.role='owner'));

-- 4) Storage foto nota.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('bf-nota', 'bf-nota', true, 10485760, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "bf_nota_insert_own" on storage.objects;
create policy "bf_nota_insert_own"
on storage.objects for insert to authenticated
with check (bucket_id='bf-nota' and (storage.foldername(name))[2]=auth.uid()::text);

drop policy if exists "bf_nota_select_public" on storage.objects;
create policy "bf_nota_select_public"
on storage.objects for select to public
using (bucket_id='bf-nota');

drop policy if exists "bf_nota_delete_own" on storage.objects;
create policy "bf_nota_delete_own"
on storage.objects for delete to authenticated
using (bucket_id='bf-nota' and (storage.foldername(name))[2]=auth.uid()::text);

-- Aktifkan Realtime untuk tabel state bila belum terdaftar.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='bf_state_items') then
    alter publication supabase_realtime add table public.bf_state_items;
  end if;
end $$;
