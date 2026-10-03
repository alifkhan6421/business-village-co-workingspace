-- Business Village: guests, bookings, resource blocks, booking engine

create table public.guests (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  email text not null,
  phone text,
  company text,
  locale text not null default 'de' check (locale in ('de', 'en')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index guests_email_unique on public.guests (lower(email));
create trigger guests_touch before update on public.guests
  for each row execute function private.touch_updated_at();

create sequence public.booking_reference_seq start 1;

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  booking_reference text not null unique,
  booking_type text not null check (booking_type in ('workspace', 'room')),
  user_id uuid references public.profiles (id) on delete restrict,
  guest_id uuid references public.guests (id) on delete restrict,
  workspace_id uuid references public.workspaces (id) on delete restrict,
  room_id uuid references public.rooms (id) on delete restrict,
  start_at timestamptz not null,
  end_at timestamptz not null,
  attendees integer not null default 1 check (attendees between 1 and 500),
  purpose text,
  status text not null default 'confirmed'
    check (status in ('pending', 'confirmed', 'cancelled', 'completed', 'no_show')),
  source text not null check (source in ('member', 'guest', 'admin')),
  locale text not null default 'de' check (locale in ('de', 'en')),
  management_token_hash text unique,
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles (id) on delete set null,
  cancellation_reason text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bookings_time_order check (end_at > start_at),
  constraint bookings_owner check (num_nonnulls(user_id, guest_id) >= 1),
  constraint bookings_resource check (
    (booking_type = 'workspace' and workspace_id is not null and room_id is null)
    or (booking_type = 'room' and room_id is not null and workspace_id is null)
  ),
  -- Hard guarantee against double booking, even under concurrent requests.
  constraint bookings_no_overlap_workspace exclude using gist (
    workspace_id with =, tstzrange(start_at, end_at, '[)') with &&
  ) where (workspace_id is not null and status in ('pending', 'confirmed')),
  constraint bookings_no_overlap_room exclude using gist (
    room_id with =, tstzrange(start_at, end_at, '[)') with &&
  ) where (room_id is not null and status in ('pending', 'confirmed'))
);
create index bookings_user_idx on public.bookings (user_id, start_at desc);
create index bookings_guest_idx on public.bookings (guest_id);
create index bookings_start_idx on public.bookings (start_at);
create trigger bookings_touch before update on public.bookings
  for each row execute function private.touch_updated_at();

-- Internal notes are admin-only, so they live outside the member-readable table.
create table public.booking_notes (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  note text not null check (length(note) between 1 and 5000),
  created_at timestamptz not null default now()
);
create index booking_notes_booking_idx on public.booking_notes (booking_id, created_at);

create table public.resource_blocks (
  id uuid primary key default gen_random_uuid(),
  resource_type text not null check (resource_type in ('workspace', 'room')),
  workspace_id uuid references public.workspaces (id) on delete cascade,
  room_id uuid references public.rooms (id) on delete cascade,
  start_at timestamptz not null,
  end_at timestamptz not null,
  reason text not null check (reason in ('maintenance', 'private_event', 'repairs', 'cleaning', 'administrative_hold')),
  note text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  check (end_at > start_at),
  check (
    (resource_type = 'workspace' and workspace_id is not null and room_id is null)
    or (resource_type = 'room' and room_id is not null and workspace_id is null)
  )
);
create index resource_blocks_ws_idx on public.resource_blocks (workspace_id, start_at);
create index resource_blocks_room_idx on public.resource_blocks (room_id, start_at);

-- ---------------------------------------------------------------------------
-- RLS: members read their own bookings, admins everything. Nobody but the
-- booking functions below can insert or update bookings.
-- ---------------------------------------------------------------------------
alter table public.guests enable row level security;
alter table public.bookings enable row level security;
alter table public.booking_notes enable row level security;
alter table public.resource_blocks enable row level security;

create policy "guests: admin" on public.guests for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "bookings: member reads own" on public.bookings for select to authenticated
  using (user_id = (select auth.uid()));
create policy "bookings: admin reads all" on public.bookings for select to authenticated
  using ((select public.is_admin()));
revoke insert, update, delete on public.bookings from anon, authenticated;

create policy "booking_notes: admin" on public.booking_notes for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "blocks: admin read" on public.resource_blocks for select to authenticated
  using ((select public.is_admin()));
revoke insert, update, delete on public.resource_blocks from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Booking engine
-- ---------------------------------------------------------------------------

-- Validates a requested slot against resource state, business rules, blocks and
-- existing bookings. Locks the resource row so that concurrent requests for the
-- same resource are serialized; the exclusion constraints are the final backstop.
create or replace function private.assert_slot_bookable(
  p_type text, p_resource_id uuid, p_start timestamptz, p_end timestamptz,
  p_attendees integer, p_is_admin boolean, p_exclude_booking uuid default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  res_status text;
  res_visible boolean;
  res_capacity integer;
  s public.site_settings%rowtype;
  local_start timestamp;
  local_end timestamp;
begin
  if p_type not in ('workspace', 'room') or p_resource_id is null then
    raise exception 'invalid_resource';
  end if;
  if p_start is null or p_end is null or p_end <= p_start then
    raise exception 'invalid_time_range';
  end if;

  if p_type = 'workspace' then
    select status, public_visible, capacity into res_status, res_visible, res_capacity
      from public.workspaces where id = p_resource_id for update;
  else
    select status, public_visible, capacity into res_status, res_visible, res_capacity
      from public.rooms where id = p_resource_id for update;
  end if;

  if not found then
    raise exception 'resource_not_found';
  end if;
  if res_status <> 'available' then
    raise exception 'resource_unavailable';
  end if;
  if not res_visible and not p_is_admin then
    raise exception 'resource_not_found';
  end if;
  if coalesce(p_attendees, 1) > res_capacity then
    raise exception 'capacity_exceeded';
  end if;

  select * into s from public.site_settings where id = 1;

  if not p_is_admin then
    if p_start < now() then
      raise exception 'start_in_past';
    end if;
    if p_start > now() + make_interval(days => s.booking_max_days_ahead) then
      raise exception 'too_far_ahead';
    end if;
    if p_end - p_start > make_interval(hours => s.booking_max_hours) then
      raise exception 'duration_too_long';
    end if;
    if extract(epoch from (p_end - p_start)) < s.booking_slot_minutes * 60 then
      raise exception 'duration_too_short';
    end if;

    local_start := p_start at time zone 'Europe/Berlin';
    local_end := p_end at time zone 'Europe/Berlin';
    if local_start::date <> local_end::date and local_end::time <> '00:00' then
      raise exception 'outside_opening_hours';
    end if;
    if local_start::time < s.booking_day_start
       or (local_end::time > s.booking_day_end and local_end::time <> '00:00')
       or (local_end::time = '00:00' and s.booking_day_end <> '00:00') then
      raise exception 'outside_opening_hours';
    end if;
    if not (extract(isodow from local_start)::smallint = any (s.booking_weekdays)) then
      raise exception 'closed_day';
    end if;
    if (extract(minute from local_start)::int % s.booking_slot_minutes) <> 0
       or (extract(minute from local_end)::int % s.booking_slot_minutes) <> 0
       or extract(second from local_start) <> 0 or extract(second from local_end) <> 0 then
      raise exception 'invalid_slot_alignment';
    end if;
  end if;

  if exists (
    select 1 from public.resource_blocks b
     where tstzrange(b.start_at, b.end_at, '[)') && tstzrange(p_start, p_end, '[)')
       and ((p_type = 'workspace' and b.workspace_id = p_resource_id)
         or (p_type = 'room' and b.room_id = p_resource_id))
  ) then
    raise exception 'resource_blocked';
  end if;

  if exists (
    select 1 from public.bookings bk
     where bk.status in ('pending', 'confirmed')
       and (p_exclude_booking is null or bk.id <> p_exclude_booking)
       and tstzrange(bk.start_at, bk.end_at, '[)') && tstzrange(p_start, p_end, '[)')
       and ((p_type = 'workspace' and bk.workspace_id = p_resource_id)
         or (p_type = 'room' and bk.room_id = p_resource_id))
  ) then
    raise exception 'slot_unavailable';
  end if;
end;
$$;

create or replace function private.next_booking_reference()
returns text
language sql
security definer
set search_path = ''
as $$
  select 'BV-' || to_char(now() at time zone 'Europe/Berlin', 'YYYY') || '-'
         || lpad(nextval('public.booking_reference_seq')::text, 6, '0');
$$;

create or replace function private.insert_booking(
  p_type text, p_resource_id uuid, p_start timestamptz, p_end timestamptz,
  p_user_id uuid, p_guest_id uuid, p_source text, p_attendees integer, p_purpose text,
  p_locale text, p_token_hash text, p_actor uuid, p_is_admin boolean
) returns table (booking_id uuid, booking_reference text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_id uuid;
  new_ref text;
begin
  perform private.assert_slot_bookable(p_type, p_resource_id, p_start, p_end, p_attendees, p_is_admin);

  new_ref := private.next_booking_reference();

  begin
    insert into public.bookings (
      booking_reference, booking_type, user_id, guest_id, workspace_id, room_id,
      start_at, end_at, attendees, purpose, status, source, locale, management_token_hash, created_by
    ) values (
      new_ref, p_type, p_user_id, p_guest_id,
      case when p_type = 'workspace' then p_resource_id end,
      case when p_type = 'room' then p_resource_id end,
      p_start, p_end, coalesce(p_attendees, 1), nullif(left(btrim(coalesce(p_purpose, '')), 1000), ''),
      'confirmed', p_source, coalesce(p_locale, 'de'), p_token_hash, p_actor
    ) returning id into new_id;
  exception when exclusion_violation then
    raise exception 'slot_unavailable';
  end;

  perform private.write_audit('BOOKING_CREATED', 'booking', new_id,
    jsonb_build_object('reference', new_ref, 'source', p_source, 'type', p_type),
    p_actor, case when p_source = 'guest' then 'guest' end);

  booking_id := new_id;
  booking_reference := new_ref;
  return next;
end;
$$;

-- Member booking: the user is resolved from the JWT, never from input.
create or replace function public.create_member_booking(
  p_type text, p_resource_id uuid, p_start timestamptz, p_end timestamptz,
  p_attendees integer default 1, p_purpose text default null, p_locale text default 'de'
) returns table (booking_id uuid, booking_reference text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_locale not in ('de', 'en') then
    p_locale := 'de';
  end if;
  return query
    select * from private.insert_booking(p_type, p_resource_id, p_start, p_end, uid, null, 'member',
                                         p_attendees, p_purpose, p_locale, null, uid, false);
end;
$$;
revoke all on function public.create_member_booking(text, uuid, timestamptz, timestamptz, integer, text, text) from public, anon;
grant execute on function public.create_member_booking(text, uuid, timestamptz, timestamptz, integer, text, text) to authenticated;

-- Guest booking: only callable with the service role from the server-side
-- createGuestBooking action (which validates input and hashes the token).
create or replace function public.create_guest_booking(
  p_type text, p_resource_id uuid, p_start timestamptz, p_end timestamptz,
  p_first_name text, p_last_name text, p_email text, p_phone text, p_company text,
  p_purpose text, p_attendees integer, p_locale text, p_token_hash text
) returns table (booking_id uuid, booking_reference text, guest_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  gid uuid;
  r record;
begin
  if p_email is null or p_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(p_email) > 254 then
    raise exception 'invalid_email';
  end if;
  if coalesce(btrim(p_first_name), '') = '' or coalesce(btrim(p_last_name), '') = '' then
    raise exception 'invalid_name';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_token';
  end if;
  if p_locale not in ('de', 'en') then
    p_locale := 'de';
  end if;

  insert into public.guests (first_name, last_name, email, phone, company, locale)
  values (left(btrim(p_first_name), 100), left(btrim(p_last_name), 100), lower(btrim(p_email)),
          nullif(left(btrim(coalesce(p_phone, '')), 50), ''), nullif(left(btrim(coalesce(p_company, '')), 200), ''),
          p_locale)
  on conflict ((lower(email))) do update
     set first_name = excluded.first_name,
         last_name = excluded.last_name,
         phone = coalesce(excluded.phone, public.guests.phone),
         company = coalesce(excluded.company, public.guests.company),
         locale = excluded.locale
  returning id into gid;

  select * into r from private.insert_booking(p_type, p_resource_id, p_start, p_end, null, gid, 'guest',
                                               p_attendees, p_purpose, p_locale, p_token_hash, null, false);
  booking_id := r.booking_id;
  booking_reference := r.booking_reference;
  guest_id := gid;
  return next;
end;
$$;
revoke all on function public.create_guest_booking(text, uuid, timestamptz, timestamptz, text, text, text, text, text, text, integer, text, text) from public, anon, authenticated;
grant execute on function public.create_guest_booking(text, uuid, timestamptz, timestamptz, text, text, text, text, text, text, integer, text, text) to service_role;

-- Admin booking for a member or a guest.
create or replace function public.admin_create_booking(
  p_type text, p_resource_id uuid, p_start timestamptz, p_end timestamptz,
  p_user_id uuid, p_guest_id uuid, p_attendees integer, p_purpose text, p_locale text
) returns table (booking_id uuid, booking_reference text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if num_nonnulls(p_user_id, p_guest_id) <> 1 then
    raise exception 'invalid_customer';
  end if;
  if p_locale not in ('de', 'en') then
    p_locale := 'de';
  end if;
  return query
    select * from private.insert_booking(p_type, p_resource_id, p_start, p_end, p_user_id, p_guest_id,
                                         'admin', p_attendees, p_purpose, p_locale, null, auth.uid(), true);
end;
$$;
revoke all on function public.admin_create_booking(text, uuid, timestamptz, timestamptz, uuid, uuid, integer, text, text) from public, anon;
grant execute on function public.admin_create_booking(text, uuid, timestamptz, timestamptz, uuid, uuid, integer, text, text) to authenticated;

-- Admin: attach a management token to a guest booking created from the admin panel.
create or replace function public.admin_set_booking_token(p_booking_id uuid, p_token_hash text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_token';
  end if;
  update public.bookings set management_token_hash = p_token_hash where id = p_booking_id;
end;
$$;
revoke all on function public.admin_set_booking_token(uuid, text) from public, anon;
grant execute on function public.admin_set_booking_token(uuid, text) to authenticated;

-- Admin: change time/resource/status details.
create or replace function public.admin_update_booking(
  p_booking_id uuid, p_type text, p_resource_id uuid, p_start timestamptz, p_end timestamptz,
  p_attendees integer, p_purpose text, p_status text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.bookings%rowtype;
  changes jsonb;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_status not in ('pending', 'confirmed', 'cancelled', 'completed', 'no_show') then
    raise exception 'invalid_status';
  end if;

  select * into b from public.bookings where id = p_booking_id for update;
  if not found then
    raise exception 'not_found';
  end if;

  if p_status in ('pending', 'confirmed') then
    perform private.assert_slot_bookable(p_type, p_resource_id, p_start, p_end, p_attendees, true, p_booking_id);
  end if;

  changes := jsonb_build_object(
    'reference', b.booking_reference,
    'from', jsonb_build_object('start', b.start_at, 'end', b.end_at, 'resource', coalesce(b.workspace_id, b.room_id), 'status', b.status),
    'to', jsonb_build_object('start', p_start, 'end', p_end, 'resource', p_resource_id, 'status', p_status));

  begin
    update public.bookings
       set booking_type = p_type,
           workspace_id = case when p_type = 'workspace' then p_resource_id end,
           room_id = case when p_type = 'room' then p_resource_id end,
           start_at = p_start,
           end_at = p_end,
           attendees = coalesce(p_attendees, attendees),
           purpose = nullif(left(btrim(coalesce(p_purpose, '')), 1000), ''),
           status = p_status,
           cancelled_at = case when p_status = 'cancelled' and b.status <> 'cancelled' then now()
                               when p_status <> 'cancelled' then null else cancelled_at end,
           cancelled_by = case when p_status = 'cancelled' and b.status <> 'cancelled' then auth.uid()
                               when p_status <> 'cancelled' then null else cancelled_by end
     where id = p_booking_id;
  exception when exclusion_violation then
    raise exception 'slot_unavailable';
  end;

  perform private.write_audit(
    case when p_status = 'cancelled' and b.status <> 'cancelled' then 'BOOKING_CANCELLED' else 'BOOKING_UPDATED' end,
    'booking', p_booking_id, changes);
end;
$$;
revoke all on function public.admin_update_booking(uuid, text, uuid, timestamptz, timestamptz, integer, text, text) from public, anon;
grant execute on function public.admin_update_booking(uuid, text, uuid, timestamptz, timestamptz, integer, text, text) to authenticated;

-- Shared cancellation logic.
create or replace function private.cancel_booking(p_booking_id uuid, p_actor uuid, p_reason text, p_enforce_cutoff boolean, p_actor_label text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.bookings%rowtype;
  cutoff smallint;
begin
  select * into b from public.bookings where id = p_booking_id for update;
  if not found then
    raise exception 'not_found';
  end if;
  if b.status not in ('pending', 'confirmed') then
    raise exception 'not_cancellable';
  end if;
  if p_enforce_cutoff then
    select cancellation_cutoff_hours into cutoff from public.site_settings where id = 1;
    if b.start_at - make_interval(hours => cutoff) < now() then
      raise exception 'cancellation_window_passed';
    end if;
  end if;

  update public.bookings
     set status = 'cancelled', cancelled_at = now(), cancelled_by = p_actor,
         cancellation_reason = nullif(left(btrim(coalesce(p_reason, '')), 1000), '')
   where id = p_booking_id;

  perform private.write_audit('BOOKING_CANCELLED', 'booking', p_booking_id,
    jsonb_build_object('reference', b.booking_reference), p_actor, p_actor_label);
  return b.booking_reference;
end;
$$;

create or replace function public.cancel_my_booking(p_booking_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner uuid;
begin
  select user_id into owner from public.bookings where id = p_booking_id;
  if owner is null or owner <> auth.uid() then
    raise exception 'not_found';
  end if;
  return private.cancel_booking(p_booking_id, auth.uid(), null, true, null);
end;
$$;
revoke all on function public.cancel_my_booking(uuid) from public, anon;
grant execute on function public.cancel_my_booking(uuid) to authenticated;

create or replace function public.cancel_booking_by_token(p_token_hash text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  bid uuid;
begin
  select id into bid from public.bookings where management_token_hash = p_token_hash;
  if bid is null then
    raise exception 'not_found';
  end if;
  return private.cancel_booking(bid, null, null, true, 'guest');
end;
$$;
revoke all on function public.cancel_booking_by_token(text) from public, anon, authenticated;
grant execute on function public.cancel_booking_by_token(text) to service_role;

create or replace function public.admin_cancel_booking(p_booking_id uuid, p_reason text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return private.cancel_booking(p_booking_id, auth.uid(), p_reason, false, null);
end;
$$;
revoke all on function public.admin_cancel_booking(uuid, text) from public, anon;
grant execute on function public.admin_cancel_booking(uuid, text) to authenticated;

-- Resource blocks (admin only). Returns the number of existing active bookings
-- that overlap the new block so the admin can follow up on them.
create or replace function public.admin_create_block(
  p_type text, p_resource_id uuid, p_start timestamptz, p_end timestamptz, p_reason text, p_note text
) returns table (block_id uuid, overlapping_bookings integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_id uuid;
  n integer;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_end <= p_start then
    raise exception 'invalid_time_range';
  end if;

  -- same lock as the booking engine: no booking can slip in concurrently
  if p_type = 'workspace' then
    perform 1 from public.workspaces where id = p_resource_id for update;
  elsif p_type = 'room' then
    perform 1 from public.rooms where id = p_resource_id for update;
  else
    raise exception 'invalid_resource';
  end if;
  if not found then
    raise exception 'resource_not_found';
  end if;

  insert into public.resource_blocks (resource_type, workspace_id, room_id, start_at, end_at, reason, note, created_by)
  values (p_type,
          case when p_type = 'workspace' then p_resource_id end,
          case when p_type = 'room' then p_resource_id end,
          p_start, p_end, p_reason, nullif(btrim(coalesce(p_note, '')), ''), auth.uid())
  returning id into new_id;

  select count(*) into n from public.bookings bk
   where bk.status in ('pending', 'confirmed')
     and tstzrange(bk.start_at, bk.end_at, '[)') && tstzrange(p_start, p_end, '[)')
     and ((p_type = 'workspace' and bk.workspace_id = p_resource_id) or (p_type = 'room' and bk.room_id = p_resource_id));

  perform private.write_audit('RESOURCE_BLOCKED', p_type, p_resource_id,
    jsonb_build_object('block_id', new_id, 'reason', p_reason, 'start', p_start, 'end', p_end));

  block_id := new_id;
  overlapping_bookings := n;
  return next;
end;
$$;
revoke all on function public.admin_create_block(text, uuid, timestamptz, timestamptz, text, text) from public, anon;
grant execute on function public.admin_create_block(text, uuid, timestamptz, timestamptz, text, text) to authenticated;

create or replace function public.admin_delete_block(p_block_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.resource_blocks%rowtype;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  delete from public.resource_blocks where id = p_block_id returning * into b;
  if found then
    perform private.write_audit('RESOURCE_UNBLOCKED', b.resource_type, coalesce(b.workspace_id, b.room_id),
      jsonb_build_object('reason', b.reason, 'start', b.start_at, 'end', b.end_at));
  end if;
end;
$$;
revoke all on function public.admin_delete_block(uuid) from public, anon;
grant execute on function public.admin_delete_block(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Public availability: only time ranges and a kind, never who booked or why.
-- ---------------------------------------------------------------------------
create or replace function public.get_busy_slots(
  p_type text, p_resource_id uuid, p_from timestamptz, p_to timestamptz
) returns table (start_at timestamptz, end_at timestamptz, kind text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_to <= p_from or p_to - p_from > interval '100 days' then
    raise exception 'invalid_time_range';
  end if;
  if p_type = 'workspace' then
    if not exists (select 1 from public.workspaces w where w.id = p_resource_id
                    and ((w.public_visible and w.status <> 'disabled') or public.is_admin())) then
      return;
    end if;
  elsif p_type = 'room' then
    if not exists (select 1 from public.rooms r where r.id = p_resource_id
                    and ((r.public_visible and r.status <> 'disabled') or public.is_admin())) then
      return;
    end if;
  else
    raise exception 'invalid_resource';
  end if;

  return query
    select bk.start_at, bk.end_at, 'booked'::text
      from public.bookings bk
     where bk.status in ('pending', 'confirmed')
       and bk.start_at < p_to and bk.end_at > p_from
       and ((p_type = 'workspace' and bk.workspace_id = p_resource_id) or (p_type = 'room' and bk.room_id = p_resource_id))
    union all
    select b.start_at, b.end_at, 'blocked'::text
      from public.resource_blocks b
     where b.start_at < p_to and b.end_at > p_from
       and ((p_type = 'workspace' and b.workspace_id = p_resource_id) or (p_type = 'room' and b.room_id = p_resource_id));
end;
$$;
revoke all on function public.get_busy_slots(text, uuid, timestamptz, timestamptz) from public;
grant execute on function public.get_busy_slots(text, uuid, timestamptz, timestamptz) to anon, authenticated;

-- IDs of public resources that are free for the whole requested range.
create or replace function public.find_available_resources(
  p_type text, p_start timestamptz, p_end timestamptz
) returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select w.id from public.workspaces w
   where p_type = 'workspace' and p_end > p_start
     and w.public_visible and w.status = 'available'
     and not exists (select 1 from public.bookings bk where bk.workspace_id = w.id
                       and bk.status in ('pending', 'confirmed')
                       and tstzrange(bk.start_at, bk.end_at, '[)') && tstzrange(p_start, p_end, '[)'))
     and not exists (select 1 from public.resource_blocks b where b.workspace_id = w.id
                       and tstzrange(b.start_at, b.end_at, '[)') && tstzrange(p_start, p_end, '[)'))
  union all
  select r.id from public.rooms r
   where p_type = 'room' and p_end > p_start
     and r.public_visible and r.status = 'available'
     and not exists (select 1 from public.bookings bk where bk.room_id = r.id
                       and bk.status in ('pending', 'confirmed')
                       and tstzrange(bk.start_at, bk.end_at, '[)') && tstzrange(p_start, p_end, '[)'))
     and not exists (select 1 from public.resource_blocks b where b.room_id = r.id
                       and tstzrange(b.start_at, b.end_at, '[)') && tstzrange(p_start, p_end, '[)'));
$$;
revoke all on function public.find_available_resources(text, timestamptz, timestamptz) from public;
grant execute on function public.find_available_resources(text, timestamptz, timestamptz) to anon, authenticated;

-- Utilization for the admin dashboard: booked hours / bookable hours.
create or replace function public.admin_utilization(p_from timestamptz, p_to timestamptz)
returns table (resource_type text, resource_count integer, booked_hours numeric, bookable_hours numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s public.site_settings%rowtype;
  day_hours numeric;
  open_days integer;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into s from public.site_settings where id = 1;
  day_hours := extract(epoch from (s.booking_day_end - s.booking_day_start)) / 3600.0;
  select count(*) into open_days
    from generate_series((p_from at time zone 'Europe/Berlin')::date, ((p_to - interval '1 second') at time zone 'Europe/Berlin')::date, interval '1 day') d
   where extract(isodow from d)::smallint = any (s.booking_weekdays);

  return query
  select 'workspace'::text,
         (select count(*)::int from public.workspaces where status = 'available'),
         coalesce((select sum(extract(epoch from (least(bk.end_at, p_to) - greatest(bk.start_at, p_from))) / 3600.0)
                     from public.bookings bk
                    where bk.workspace_id is not null and bk.status in ('confirmed', 'completed', 'pending')
                      and bk.start_at < p_to and bk.end_at > p_from), 0)::numeric,
         ((select count(*) from public.workspaces where status = 'available') * day_hours * open_days)::numeric
  union all
  select 'room'::text,
         (select count(*)::int from public.rooms where status = 'available'),
         coalesce((select sum(extract(epoch from (least(bk.end_at, p_to) - greatest(bk.start_at, p_from))) / 3600.0)
                     from public.bookings bk
                    where bk.room_id is not null and bk.status in ('confirmed', 'completed', 'pending')
                      and bk.start_at < p_to and bk.end_at > p_from), 0)::numeric,
         ((select count(*) from public.rooms where status = 'available') * day_hours * open_days)::numeric;
end;
$$;
revoke all on function public.admin_utilization(timestamptz, timestamptz) from public, anon;
grant execute on function public.admin_utilization(timestamptz, timestamptz) to authenticated;

-- Reference generator for trusted server-side tooling (seed scripts, imports).
create or replace function public.next_booking_reference()
returns text
language sql
security definer
set search_path = ''
as $$
  select private.next_booking_reference();
$$;
revoke all on function public.next_booking_reference() from public, anon, authenticated;
grant execute on function public.next_booking_reference() to service_role;
