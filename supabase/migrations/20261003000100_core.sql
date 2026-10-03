-- Business Village: core schema (profiles, roles, audit log, helpers)

create extension if not exists pgcrypto with schema extensions;
create extension if not exists btree_gist with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- updated_at helper
-- ---------------------------------------------------------------------------
create or replace function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  first_name text not null default '',
  last_name text not null default '',
  full_name text generated always as (btrim(first_name || ' ' || last_name)) stored,
  email text not null,
  phone text,
  company text,
  department text,
  role text not null default 'member' check (role in ('admin', 'member')),
  avatar_url text,
  email_verified boolean not null default false,
  preferred_locale text not null default 'de' check (preferred_locale in ('de', 'en')),
  terms_accepted_at timestamptz,
  privacy_accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_email_idx on public.profiles (lower(email));
create index profiles_role_idx on public.profiles (role);

create trigger profiles_touch before update on public.profiles
  for each row execute function private.touch_updated_at();

-- Role lookup used by every RLS policy. SECURITY DEFINER so it can read profiles
-- without recursing through the profiles policies.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated, service_role;

-- New auth user -> profile. The role is ALWAYS 'member' here; whatever the
-- browser put into user metadata is ignored for the role.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  loc text := coalesce(meta ->> 'preferred_locale', 'de');
begin
  if loc not in ('de', 'en') then
    loc := 'de';
  end if;

  insert into public.profiles (
    id, email, first_name, last_name, company, phone, role,
    email_verified, preferred_locale, terms_accepted_at, privacy_accepted_at
  ) values (
    new.id,
    new.email,
    left(coalesce(meta ->> 'first_name', ''), 100),
    left(coalesce(meta ->> 'last_name', ''), 100),
    nullif(left(coalesce(meta ->> 'company', ''), 200), ''),
    nullif(left(coalesce(meta ->> 'phone', ''), 50), ''),
    'member',
    new.email_confirmed_at is not null,
    loc,
    case when (meta ->> 'terms_accepted') = 'true' then now() end,
    case when (meta ->> 'privacy_accepted') = 'true' then now() end
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

create or replace function private.handle_user_updated()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
     set email = new.email,
         email_verified = new.email_confirmed_at is not null
   where id = new.id
     and (email is distinct from new.email
          or email_verified is distinct from (new.email_confirmed_at is not null));
  return new;
end;
$$;

create trigger on_auth_user_updated
  after update of email, email_confirmed_at on auth.users
  for each row execute function private.handle_user_updated();

alter table public.profiles enable row level security;

create policy "profiles: read own" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "profiles: admin read all" on public.profiles
  for select to authenticated using ((select public.is_admin()));
create policy "profiles: update own" on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy "profiles: admin update" on public.profiles
  for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- Column-level privileges: nobody can write role / email / email_verified
-- through the API. Role changes go through admin_set_user_role().
revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (first_name, last_name, phone, company, department, avatar_url, preferred_locale)
  on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- audit log
-- ---------------------------------------------------------------------------
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  actor_id uuid references public.profiles (id) on delete set null,
  actor_label text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_logs_created_idx on public.audit_logs (created_at desc);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id);

alter table public.audit_logs enable row level security;
create policy "audit: admin read" on public.audit_logs
  for select to authenticated using ((select public.is_admin()));
revoke insert, update, delete on public.audit_logs from anon, authenticated;

create or replace function private.write_audit(
  p_action text, p_entity_type text, p_entity_id uuid,
  p_metadata jsonb default '{}'::jsonb, p_actor uuid default null, p_actor_label text default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_logs (action, entity_type, entity_id, actor_id, actor_label, metadata)
  values (p_action, p_entity_type, p_entity_id, coalesce(p_actor, auth.uid()), p_actor_label,
          coalesce(p_metadata, '{}'::jsonb));
end;
$$;

-- Admin-only logging entry point for actions performed by server actions
-- (page edits, settings changes). Members cannot forge entries.
create or replace function public.log_admin_activity(
  p_action text, p_entity_type text, p_entity_id uuid, p_metadata jsonb default '{}'::jsonb
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_action !~ '^[A-Z_]{3,64}$' then
    raise exception 'invalid_action';
  end if;
  perform private.write_audit(p_action, p_entity_type, p_entity_id, p_metadata);
end;
$$;
revoke all on function public.log_admin_activity(text, text, uuid, jsonb) from public, anon;
grant execute on function public.log_admin_activity(text, text, uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Role management (admin only, never via signup)
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_user_role(p_user_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_role text;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_role not in ('admin', 'member') then
    raise exception 'invalid_role';
  end if;

  select role into old_role from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'not_found';
  end if;
  if old_role = p_role then
    return;
  end if;
  if old_role = 'admin' and p_role <> 'admin'
     and (select count(*) from public.profiles where role = 'admin') <= 1 then
    raise exception 'last_admin';
  end if;

  update public.profiles set role = p_role where id = p_user_id;
  perform private.write_audit('USER_ROLE_CHANGED', 'profile', p_user_id,
    jsonb_build_object('from', old_role, 'to', p_role));
end;
$$;
revoke all on function public.admin_set_user_role(uuid, text) from public, anon;
grant execute on function public.admin_set_user_role(uuid, text) to authenticated;
