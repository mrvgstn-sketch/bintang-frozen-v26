\set ON_ERROR_STOP on

create schema if not exists auth;

do $$
begin
  if not exists(select 1 from pg_roles where rolname='authenticated') then
    create role authenticated nologin;
  end if;
end $$;

create or replace function auth.uid()
returns uuid
language sql stable
as $$
  select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;
$$;

grant usage on schema auth to authenticated;
grant execute on function auth.uid() to authenticated;

create table if not exists public.bf_profiles(
  id uuid primary key,
  email text not null,
  display_name text,
  role text not null default 'operator',
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.bf_profiles(id,email,display_name,role,active) values
('11111111-1111-1111-1111-111111111111','owner1@test.local','Owner One','owner',true),
('11111111-1111-1111-1111-111111111112','owner2@test.local','Owner Two','owner',true),
('22222222-2222-2222-2222-222222222222','admin@test.local','Admin','admin',true),
('33333333-3333-3333-3333-333333333333','operator@test.local','Operator','operator',true)
on conflict(id) do update set email=excluded.email,display_name=excluded.display_name,role=excluded.role,active=excluded.active;
