-- Shared workspaces with fixed desks, booked per person per day or per month.
--
-- A workspace has as many desks as its capacity (seats). Every booked person
-- holds one specific desk for the whole period, and a desk can never be booked
-- twice for overlapping periods (exclusion constraint on booking_desks).
-- Workspace bookings are only created through booking requests: the admin
-- assigns desks and confirms, and can later move a booking to other desks.
--
-- Additive for the live site: meeting rooms keep their rules unchanged.

-- ---------------------------------------------------------------------------
-- Prices: per person per day (existing price_daily) and per person per month
-- ---------------------------------------------------------------------------
alter table public.workspaces
  add column if not exists price_monthly numeric(10, 2) check (price_monthly is null or price_monthly >= 0);

comment on column public.workspaces.price_daily is 'Price per person per day (EUR, incl. VAT). NULL = on request.';
comment on column public.workspaces.price_monthly is 'Price per person per month (EUR, incl. VAT). NULL = on request.';
comment on column public.workspaces.capacity is 'Number of seats; one desk per seat (see workspace_desks).';

-- ---------------------------------------------------------------------------
-- Desks
-- ---------------------------------------------------------------------------
create table if not exists public.workspace_desks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  position integer not null check (position between 1 and 500),
  label text not null check (length(btrim(label)) between 1 and 40),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (workspace_id, position)
);
create index if not exists workspace_desks_workspace_idx on public.workspace_desks (workspace_id, position);

alter table public.workspace_desks enable row level security;
create policy "workspace_desks: admin read" on public.workspace_desks for select to authenticated
  using ((select public.is_admin()));
create policy "workspace_desks: admin rename" on public.workspace_desks for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
revoke insert, update, delete on public.workspace_desks from anon, authenticated;
grant update (label) on public.workspace_desks to authenticated;

-- Which desks a workspace booking holds. Kept in sync with the booking's
-- period and status by a trigger on bookings.
create table if not exists public.booking_desks (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  desk_id uuid not null references public.workspace_desks (id) on delete restrict,
  -- Copy of the desk's workspace for quick lookups (no foreign key on purpose:
  -- a second bookings-workspaces path would make API embeds ambiguous).
  workspace_id uuid not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (end_at > start_at),
  unique (booking_id, desk_id),
  -- Hard guarantee: one person per desk at any time, even under concurrent confirmations.
  constraint booking_desks_no_overlap exclude using gist (
    desk_id with =, tstzrange(start_at, end_at, '[)') with &&
  )
);
create index if not exists booking_desks_booking_idx on public.booking_desks (booking_id);
create index if not exists booking_desks_workspace_idx on public.booking_desks (workspace_id, start_at);

alter table public.booking_desks enable row level security;
create policy "booking_desks: admin read" on public.booking_desks for select to authenticated
  using ((select public.is_admin()));
revoke insert, update, delete on public.booking_desks from anon, authenticated;

-- A shared workspace takes several bookings at the same time; the desks are
-- what can't overlap. Rooms keep their own no-overlap constraint.
alter table public.bookings drop constraint if exists bookings_no_overlap_workspace;

-- Desks follow the seat count: raising it adds desks, lowering it retires the
-- highest-numbered desks (refused while one of them is still booked).
create or replace function private.sync_workspace_desks()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.workspace_desks (workspace_id, position, label)
  select new.id, n, n::text from generate_series(1, new.capacity) n
  on conflict (workspace_id, position) do update set active = true where not public.workspace_desks.active;

  if exists (
    select 1 from public.workspace_desks d
      join public.booking_desks bd on bd.desk_id = d.id
     where d.workspace_id = new.id and d.position > new.capacity and d.active and bd.end_at > now()
  ) then
    raise exception 'desks_in_use';
  end if;
  update public.workspace_desks set active = false
   where workspace_id = new.id and position > new.capacity and active;
  return new;
end;
$$;

drop trigger if exists workspaces_sync_desks on public.workspaces;
create trigger workspaces_sync_desks after insert or update of capacity on public.workspaces
  for each row execute function private.sync_workspace_desks();

-- Desks for workspaces that already exist.
insert into public.workspace_desks (workspace_id, position, label)
select w.id, n, n::text from public.workspaces w cross join lateral generate_series(1, w.capacity) n
on conflict (workspace_id, position) do nothing;

-- Keeps a booking's desks in step with the booking: a moved period moves the
-- desks (the exclusion constraint refuses a clash), a cancellation frees them.
create or replace function private.sync_booking_desks()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.booking_type = 'workspace' and old.booking_type = 'room' then
    raise exception 'requests_only';
  end if;
  if new.status not in ('pending', 'confirmed', 'completed') then
    delete from public.booking_desks where booking_id = new.id;
    return new;
  end if;
  if exists (select 1 from public.booking_desks where booking_id = new.id
              and (new.workspace_id is null or workspace_id <> new.workspace_id)) then
    raise exception 'desks_mismatch';
  end if;
  if new.start_at <> old.start_at or new.end_at <> old.end_at then
    update public.booking_desks set start_at = new.start_at, end_at = new.end_at where booking_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists bookings_sync_desks on public.bookings;
create trigger bookings_sync_desks after update on public.bookings
  for each row execute function private.sync_booking_desks();

-- ---------------------------------------------------------------------------
-- Booking requests: per day / per month, desks
-- ---------------------------------------------------------------------------
alter table public.booking_requests
  add column if not exists booking_unit text not null default 'hour' check (booking_unit in ('hour', 'day', 'month')),
  add column if not exists unit_count integer check (unit_count is null or unit_count between 1 and 36),
  add column if not exists preferred_workspace_id uuid references public.workspaces (id) on delete set null,
  add column if not exists assigned_desk_ids uuid[] not null default '{}';

-- Day and month requests have no hour count.
alter table public.booking_requests alter column requested_hours drop not null;
do $$
declare
  c record;
begin
  for c in
    select con.conname from pg_constraint con
      join pg_class cl on cl.oid = con.conrelid
      join pg_namespace n on n.oid = cl.relnamespace
     where n.nspname = 'public' and cl.relname = 'booking_requests' and con.contype = 'c'
       and pg_get_constraintdef(con.oid) ilike '%requested_hours%'
  loop
    execute format('alter table public.booking_requests drop constraint %I', c.conname);
  end loop;
  for c in
    select con.conname from pg_constraint con
      join pg_class cl on cl.oid = con.conrelid
      join pg_namespace n on n.oid = cl.relnamespace
     where n.nspname = 'public' and cl.relname = 'booking_request_events' and con.contype = 'c'
       and pg_get_constraintdef(con.oid) ilike '%event_type%'
  loop
    execute format('alter table public.booking_request_events drop constraint %I', c.conname);
  end loop;
end;
$$;
alter table public.booking_requests add constraint booking_requests_requested_hours_check
  check (requested_hours is null or requested_hours between 1 and 24);
alter table public.booking_request_events add constraint booking_request_events_event_type_check check (event_type in (
  'created', 'status_changed', 'updated', 'price_recalculated', 'price_adjusted', 'note', 'message_sent', 'desks_changed'));

-- Period of a day or month booking, in Berlin time. Days count open days only
-- (Admin > Settings), so "5 days" from a Thursday is Thu, Fri, Mon, Tue, Wed.
-- A month runs from the start date to the same date of the next month.
create or replace function private.workspace_period(p_unit text, p_start date, p_count integer)
returns table (start_at timestamptz, end_at timestamptz, last_day date)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  wd smallint[];
  d date := p_start;
  n integer := 0;
  guard integer := 0;
begin
  if p_start is null or p_count is null or p_count < 1 then
    raise exception 'invalid_duration';
  end if;
  if p_unit = 'day' then
    if p_count > 31 then
      raise exception 'invalid_duration';
    end if;
    select booking_weekdays into wd from public.site_settings where id = 1;
    if not (extract(isodow from p_start)::smallint = any (wd)) then
      raise exception 'closed_day';
    end if;
    loop
      if extract(isodow from d)::smallint = any (wd) then
        n := n + 1;
        last_day := d;
      end if;
      exit when n >= p_count;
      d := d + 1;
      guard := guard + 1;
      if guard > 400 then
        raise exception 'invalid_duration';
      end if;
    end loop;
  elsif p_unit = 'month' then
    if p_count > 12 then
      raise exception 'invalid_duration';
    end if;
    last_day := (p_start + make_interval(months => p_count))::date - 1;
  else
    raise exception 'invalid_value';
  end if;
  start_at := p_start::timestamp at time zone 'Europe/Berlin';
  end_at := (last_day + 1)::timestamp at time zone 'Europe/Berlin';
  return next;
end;
$$;

-- Public workspace request (called by the server action with the service role
-- after it validated the input and calculated the price snapshot).
create or replace function public.submit_workspace_request(
  p_unit text, p_start_date date, p_count integer, p_participants integer,
  p_full_name text, p_email text, p_phone text, p_company text, p_message text, p_locale text,
  p_user_id uuid, p_preferred_workspace_id uuid, p_estimate jsonb, p_estimate_gross numeric
) returns table (request_id uuid, reference text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.site_settings%rowtype;
  per record;
  max_seats integer;
  new_id uuid;
  new_ref text;
  today date := (now() at time zone 'Europe/Berlin')::date;
begin
  if p_participants is null or p_participants < 1 or p_participants > 500 then
    raise exception 'invalid_participants';
  end if;
  if p_email is null or p_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(p_email) > 254 then
    raise exception 'invalid_email';
  end if;
  if coalesce(btrim(p_full_name), '') = '' then
    raise exception 'invalid_name';
  end if;
  if p_locale is null or p_locale not in ('de', 'en') then
    p_locale := 'de';
  end if;
  select * into s from public.site_settings where id = 1;
  if p_start_date is null or p_start_date < today then
    raise exception 'start_in_past';
  end if;
  if p_start_date > today + s.booking_max_days_ahead then
    raise exception 'too_far_ahead';
  end if;
  select * into per from private.workspace_period(p_unit, p_start_date, p_count);

  -- The group must fit into one workspace.
  select max(capacity) into max_seats from public.workspaces where status = 'available' and public_visible;
  if max_seats is null or p_participants > max_seats then
    raise exception 'capacity_exceeded';
  end if;
  if p_preferred_workspace_id is not null and not exists (
    select 1 from public.workspaces where id = p_preferred_workspace_id and public_visible and status = 'available'
  ) then
    p_preferred_workspace_id := null;
  end if;

  new_ref := private.next_request_reference();
  insert into public.booking_requests (
    reference, space_type, booking_unit, unit_count, requested_start, requested_end, requested_hours, requested_participants,
    start_at, end_at, participants, full_name, email, phone, company, message, locale,
    user_id, preferred_workspace_id, estimate_snapshot, estimate_gross,
    price_snapshot, price_gross, price_net, price_vat
  ) values (
    new_ref, 'workspace', p_unit, p_count, per.start_at, per.end_at, null, p_participants,
    per.start_at, per.end_at, p_participants,
    left(btrim(p_full_name), 200), lower(btrim(p_email)),
    nullif(left(btrim(coalesce(p_phone, '')), 50), ''), nullif(left(btrim(coalesce(p_company, '')), 200), ''),
    nullif(left(btrim(coalesce(p_message, '')), 2000), ''), p_locale,
    p_user_id, p_preferred_workspace_id, p_estimate, p_estimate_gross,
    p_estimate, p_estimate_gross,
    nullif(p_estimate ->> 'netCents', '')::numeric / 100,
    nullif(p_estimate ->> 'vatCents', '')::numeric / 100
  ) returning id into new_id;

  insert into public.booking_request_events (request_id, event_type, to_status, actor_label, metadata)
  values (new_id, 'created', 'pending', 'customer', jsonb_build_object('reference', new_ref));

  perform private.write_audit('BOOKING_REQUEST_CREATED', 'booking_request', new_id,
    jsonb_build_object('reference', new_ref, 'space', 'workspace'), p_user_id, 'customer');

  request_id := new_id;
  reference := new_ref;
  return next;
end;
$$;
revoke all on function public.submit_workspace_request(text, date, integer, integer, text, text, text, text, text, text, uuid, uuid, jsonb, numeric) from public, anon, authenticated;
grant execute on function public.submit_workspace_request(text, date, integer, integer, text, text, text, text, text, text, uuid, uuid, jsonb, numeric) to service_role;

-- ---------------------------------------------------------------------------
-- Booking engine changes
-- ---------------------------------------------------------------------------

-- Same checks as before, except that workspaces no longer refuse overlapping
-- bookings as a whole: their desks do (booking_desks).
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

  if p_type = 'room' and exists (
    select 1 from public.bookings bk
     where bk.status in ('pending', 'confirmed')
       and (p_exclude_booking is null or bk.id <> p_exclude_booking)
       and tstzrange(bk.start_at, bk.end_at, '[)') && tstzrange(p_start, p_end, '[)')
       and bk.room_id = p_resource_id
  ) then
    raise exception 'slot_unavailable';
  end if;
end;
$$;

-- Workspace bookings need desks, so they can only come from a confirmed
-- request (which sets bv.desk_flow for its own transaction).
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
  if p_type = 'workspace' and coalesce(current_setting('bv.desk_flow', true), '') <> 'on' then
    raise exception 'requests_only';
  end if;
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

-- Checks a desk selection for a request and returns it in desk order.
create or replace function private.checked_desks(p_workspace_id uuid, p_desk_ids uuid[], p_participants integer)
returns uuid[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  ids uuid[];
begin
  select array_agg(d.id order by d.position) into ids
    from public.workspace_desks d
   where d.id = any (coalesce(p_desk_ids, '{}')) and d.workspace_id = p_workspace_id and d.active;
  if coalesce(array_length(ids, 1), 0) <> coalesce(array_length(p_desk_ids, 1), 0)
     or coalesce(array_length(ids, 1), 0) <> (select count(distinct x) from unnest(p_desk_ids) x) then
    raise exception 'invalid_desks';
  end if;
  if coalesce(array_length(ids, 1), 0) <> p_participants then
    raise exception 'desk_count_mismatch';
  end if;
  return ids;
end;
$$;

-- (Re)writes the desks a workspace booking holds.
create or replace function private.place_booking_desks(p_booking_id uuid, p_workspace_id uuid, p_desk_ids uuid[], p_start timestamptz, p_end timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.booking_desks where booking_id = p_booking_id;
  begin
    insert into public.booking_desks (booking_id, desk_id, workspace_id, start_at, end_at)
    select p_booking_id, x, p_workspace_id, p_start, p_end from unnest(p_desk_ids) x;
  exception when exclusion_violation then
    raise exception 'desk_unavailable';
  end;
end;
$$;

-- Admin: assign (or switch) the workspace and desks of a request. When the
-- request is already confirmed, the reservation moves to the new desks at
-- once. Returns true when a confirmed reservation was moved (the caller then
-- emails the customer).
create or replace function public.admin_assign_workspace_desks(
  p_request_id uuid, p_workspace_id uuid, p_desk_ids uuid[], p_note text default null
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.booking_requests%rowtype;
  bk public.bookings%rowtype;
  has_active boolean := false;
  ids uuid[];
  w public.workspaces%rowtype;
  moved boolean := false;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into r from public.booking_requests where id = p_request_id for update;
  if not found then
    raise exception 'not_found';
  end if;
  if r.space_type <> 'workspace' then
    raise exception 'invalid_resource';
  end if;
  -- Serializes all desk changes for this workspace.
  select * into w from public.workspaces where id = p_workspace_id for update;
  if not found then
    raise exception 'resource_not_found';
  end if;
  ids := private.checked_desks(p_workspace_id, p_desk_ids, r.participants);

  if r.booking_id is not null then
    select * into bk from public.bookings where id = r.booking_id for update;
    has_active := found and bk.status in ('pending', 'confirmed');
  end if;

  if has_active then
    perform private.assert_slot_bookable('workspace', p_workspace_id, bk.start_at, bk.end_at, r.participants, true, bk.id);
    moved := bk.workspace_id is distinct from p_workspace_id
             or not (r.assigned_desk_ids @> ids and ids @> r.assigned_desk_ids);
    delete from public.booking_desks where booking_id = bk.id;
    update public.bookings set workspace_id = p_workspace_id, attendees = r.participants where id = bk.id;
    perform private.place_booking_desks(bk.id, p_workspace_id, ids, bk.start_at, bk.end_at);
  else
    if w.status <> 'available' then
      raise exception 'resource_unavailable';
    end if;
    if exists (
      select 1 from public.booking_desks bd join public.bookings b on b.id = bd.booking_id
       where bd.desk_id = any (ids) and b.status in ('pending', 'confirmed')
         and tstzrange(bd.start_at, bd.end_at, '[)') && tstzrange(r.start_at, r.end_at, '[)')
    ) then
      raise exception 'desk_unavailable';
    end if;
  end if;

  update public.booking_requests
     set assigned_workspace_id = p_workspace_id, assigned_room_id = null, assigned_desk_ids = ids
   where id = p_request_id;

  insert into public.booking_request_events (request_id, event_type, note, actor_id, metadata)
  values (p_request_id, 'desks_changed', nullif(left(btrim(coalesce(p_note, '')), 2000), ''), auth.uid(),
          jsonb_build_object(
            'moved', moved,
            'from', jsonb_build_object('workspace', r.assigned_workspace_id, 'desks', to_jsonb(r.assigned_desk_ids)),
            'to', jsonb_build_object('workspace', p_workspace_id, 'desks', to_jsonb(ids))));
  perform private.write_audit('BOOKING_REQUEST_DESKS', 'booking_request', p_request_id,
    jsonb_build_object('reference', r.reference, 'workspace', p_workspace_id, 'moved', moved));
  return moved;
end;
$$;
revoke all on function public.admin_assign_workspace_desks(uuid, uuid, uuid[], text) from public, anon;
grant execute on function public.admin_assign_workspace_desks(uuid, uuid, uuid[], text) to authenticated;

-- Admin: schedule changes of a request (unchanged for rooms). For workspace
-- requests a different workspace or group size releases the desk selection;
-- a confirmed workspace booking keeps its desks and moves only in time.
create or replace function public.admin_update_booking_request(
  p_request_id uuid, p_resource_type text, p_resource_id uuid, p_start timestamptz, p_end timestamptz, p_participants integer,
  p_price_snapshot jsonb, p_price_net numeric, p_price_vat numeric, p_price_gross numeric,
  p_price_adjusted boolean, p_adjustment_reason text, p_event_type text, p_note text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.booking_requests%rowtype;
  bk public.bookings%rowtype;
  keep_desks boolean := true;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_event_type not in ('updated', 'price_recalculated', 'price_adjusted') then
    raise exception 'invalid_value';
  end if;
  if p_end <= p_start then
    raise exception 'invalid_time_range';
  end if;
  if p_participants is null or p_participants < 1 or p_participants > 1000 then
    raise exception 'invalid_participants';
  end if;
  if p_resource_id is not null and p_resource_type not in ('room', 'workspace') then
    raise exception 'invalid_resource';
  end if;

  select * into r from public.booking_requests where id = p_request_id for update;
  if not found then
    raise exception 'not_found';
  end if;
  if p_price_adjusted and coalesce(btrim(p_adjustment_reason), '') = '' and coalesce(r.price_adjustment_reason, '') = '' then
    raise exception 'reason_required';
  end if;
  if r.space_type = 'workspace' then
    keep_desks := p_resource_type = 'workspace' and p_resource_id is not distinct from r.assigned_workspace_id
                  and p_participants = r.participants;
  end if;

  if r.booking_id is not null then
    select * into bk from public.bookings where id = r.booking_id for update;
    if found and bk.status in ('pending', 'confirmed') then
      if p_resource_id is null then
        raise exception 'room_required';
      end if;
      if r.space_type = 'workspace' and not keep_desks then
        -- Use "switch desks" for a confirmed workspace booking.
        raise exception 'desks_required';
      end if;
      perform private.assert_slot_bookable(p_resource_type, p_resource_id, p_start, p_end, p_participants, true, bk.id);
      begin
        update public.bookings
           set booking_type = p_resource_type,
               workspace_id = case when p_resource_type = 'workspace' then p_resource_id end,
               room_id = case when p_resource_type = 'room' then p_resource_id end,
               start_at = p_start, end_at = p_end, attendees = p_participants
         where id = bk.id;
      exception when exclusion_violation then
        raise exception 'slot_unavailable';
      end;
    end if;
  end if;

  update public.booking_requests
     set assigned_room_id = case when p_resource_type = 'room' then p_resource_id end,
         assigned_workspace_id = case when p_resource_type = 'workspace' then p_resource_id end,
         assigned_desk_ids = case when keep_desks then assigned_desk_ids else '{}' end,
         start_at = p_start,
         end_at = p_end,
         participants = p_participants,
         price_snapshot = coalesce(p_price_snapshot, price_snapshot),
         price_net = p_price_net,
         price_vat = p_price_vat,
         price_gross = p_price_gross,
         price_adjusted = coalesce(p_price_adjusted, false),
         price_adjustment_reason = case when p_price_adjusted
                                        then coalesce(nullif(left(btrim(coalesce(p_adjustment_reason, '')), 1000), ''), price_adjustment_reason) end
   where id = p_request_id;

  insert into public.booking_request_events (request_id, event_type, note, actor_id, metadata)
  values (p_request_id, p_event_type, nullif(left(btrim(coalesce(p_note, '')), 2000), ''), auth.uid(),
          jsonb_build_object(
            'from', jsonb_build_object('resource', coalesce(r.assigned_room_id, r.assigned_workspace_id), 'start', r.start_at, 'end', r.end_at,
                                       'participants', r.participants, 'gross', r.price_gross),
            'to', jsonb_build_object('resource', p_resource_id, 'start', p_start, 'end', p_end,
                                     'participants', p_participants, 'gross', p_price_gross)));
end;
$$;

-- Admin: per day / per month schedule of a workspace request (start date and
-- number of days or months); the period is calculated like on submission.
create or replace function public.admin_update_workspace_request(
  p_request_id uuid, p_unit text, p_start_date date, p_count integer, p_participants integer,
  p_price_snapshot jsonb, p_price_net numeric, p_price_vat numeric, p_price_gross numeric,
  p_price_adjusted boolean, p_event_type text, p_note text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.booking_requests%rowtype;
  per record;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into r from public.booking_requests where id = p_request_id;
  if not found then
    raise exception 'not_found';
  end if;
  if r.space_type <> 'workspace' then
    raise exception 'invalid_resource';
  end if;
  select * into per from private.workspace_period(p_unit, p_start_date, p_count);
  perform public.admin_update_booking_request(
    p_request_id, 'workspace', r.assigned_workspace_id, per.start_at, per.end_at, p_participants,
    p_price_snapshot, p_price_net, p_price_vat, p_price_gross, p_price_adjusted, '', p_event_type, p_note);
  update public.booking_requests set booking_unit = p_unit, unit_count = p_count where id = p_request_id;
end;
$$;
revoke all on function public.admin_update_workspace_request(uuid, text, date, integer, integer, jsonb, numeric, numeric, numeric, boolean, text, text) from public, anon;
grant execute on function public.admin_update_workspace_request(uuid, text, date, integer, integer, jsonb, numeric, numeric, numeric, boolean, text, text) to authenticated;

-- Admin: request status. Unchanged for rooms; confirming a workspace request
-- needs one desk per person and places the booking on those desks.
create or replace function public.admin_set_booking_request_status(
  p_request_id uuid, p_status text, p_note text default null,
  p_alternative_start timestamptz default null, p_alternative_end timestamptz default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.booking_requests%rowtype;
  bk public.bookings%rowtype;
  has_active boolean := false;
  res_type text;
  res_id uuid;
  gid uuid;
  new_booking uuid;
  ids uuid[];
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_status not in ('pending', 'under_review', 'alternative_proposed', 'confirmed', 'rejected', 'cancelled', 'completed') then
    raise exception 'invalid_status';
  end if;

  select * into r from public.booking_requests where id = p_request_id for update;
  if not found then
    raise exception 'not_found';
  end if;
  if r.booking_id is not null then
    select * into bk from public.bookings where id = r.booking_id for update;
    has_active := found and bk.status in ('pending', 'confirmed');
  end if;

  if p_status = 'completed' and r.status <> 'confirmed' then
    raise exception 'invalid_transition';
  end if;
  if p_status = 'alternative_proposed' then
    if p_alternative_start is null or p_alternative_end is null or p_alternative_end <= p_alternative_start then
      raise exception 'alternative_required';
    end if;
  end if;

  if p_status = 'confirmed' then
    res_type := case when r.assigned_workspace_id is not null then 'workspace' else 'room' end;
    res_id := coalesce(r.assigned_room_id, r.assigned_workspace_id);
    if res_id is null then
      raise exception 'room_required';
    end if;
    if res_type = 'workspace' then
      if coalesce(array_length(r.assigned_desk_ids, 1), 0) = 0 then
        raise exception 'desks_required';
      end if;
      -- Locks the workspace, then checks the desks (one per person, active, in this workspace).
      perform 1 from public.workspaces where id = res_id for update;
      ids := private.checked_desks(res_id, r.assigned_desk_ids, r.participants);
      perform set_config('bv.desk_flow', 'on', true);
    end if;
    if has_active then
      -- Already reserved: make sure the reservation matches the request.
      perform private.assert_slot_bookable(res_type, res_id, r.start_at, r.end_at, r.participants, true, bk.id);
      if res_type = 'workspace' then
        delete from public.booking_desks where booking_id = bk.id;
      end if;
      begin
        update public.bookings
           set booking_type = res_type,
               workspace_id = case when res_type = 'workspace' then res_id end,
               room_id = case when res_type = 'room' then res_id end,
               start_at = r.start_at, end_at = r.end_at, attendees = r.participants, status = 'confirmed'
         where id = bk.id;
      exception when exclusion_violation then
        raise exception 'slot_unavailable';
      end;
      new_booking := bk.id;
    else
      if r.user_id is null then
        gid := private.request_guest(r);
      end if;
      select ib.booking_id into new_booking
        from private.insert_booking(res_type, res_id, r.start_at, r.end_at, r.user_id, gid, 'admin',
                                    r.participants, r.reference || coalesce(': ' || r.message, ''), r.locale,
                                    null, auth.uid(), true) ib;
      update public.bookings set booking_request_id = r.id where id = new_booking;
    end if;
    if res_type = 'workspace' then
      perform private.place_booking_desks(new_booking, res_id, ids, r.start_at, r.end_at);
      perform set_config('bv.desk_flow', '', true);
    end if;
  elsif has_active and p_status = 'completed' then
    update public.bookings set status = 'completed' where id = bk.id;
  elsif has_active then
    -- Any other status releases the space (and its desks) again.
    perform private.cancel_booking(bk.id, auth.uid(), coalesce(p_note, r.reference), false, null);
  end if;

  update public.booking_requests
     set status = p_status,
         booking_id = coalesce(new_booking, booking_id),
         status_reason = nullif(left(btrim(coalesce(p_note, '')), 2000), ''),
         alternative_start = case when p_status = 'alternative_proposed' then p_alternative_start else alternative_start end,
         alternative_end = case when p_status = 'alternative_proposed' then p_alternative_end else alternative_end end
   where id = p_request_id;

  insert into public.booking_request_events (request_id, event_type, from_status, to_status, note, actor_id, metadata)
  values (p_request_id, 'status_changed', r.status, p_status, nullif(left(btrim(coalesce(p_note, '')), 2000), ''), auth.uid(),
          jsonb_strip_nulls(jsonb_build_object('resource', coalesce(r.assigned_room_id, r.assigned_workspace_id), 'booking', coalesce(new_booking, r.booking_id),
                                               'alternative_start', p_alternative_start, 'alternative_end', p_alternative_end)));

  perform private.write_audit('BOOKING_REQUEST_STATUS', 'booking_request', p_request_id,
    jsonb_build_object('reference', r.reference, 'from', r.status, 'to', p_status));
  return coalesce(new_booking, r.booking_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Email: "your desk has changed"
-- ---------------------------------------------------------------------------
do $$
declare
  c record;
begin
  for c in
    select con.conname from pg_constraint con
      join pg_class cl on cl.oid = con.conrelid
      join pg_namespace n on n.oid = cl.relnamespace
     where n.nspname = 'public' and cl.relname = 'email_templates' and con.contype = 'c'
       and pg_get_constraintdef(con.oid) ilike '%template_key%'
  loop
    execute format('alter table public.email_templates drop constraint %I', c.conname);
  end loop;
end;
$$;
alter table public.email_templates add constraint email_templates_template_key_check check (template_key in (
  'welcome', 'verify_email', 'password_reset', 'booking_confirmation', 'guest_booking_confirmation',
  'booking_updated', 'booking_cancelled', 'contact_confirmation', 'contact_admin_notification',
  'booking_admin_notification', 'booking_message',
  'request_received', 'request_admin_notification', 'request_confirmed', 'request_rejected',
  'request_alternative', 'request_cancelled', 'request_message', 'request_desk_changed'));

insert into public.email_templates (template_key, locale, subject, heading, intro, outro) values
  ('request_desk_changed', 'de', 'Ihr Arbeitsplatz hat sich geändert ({{reference}})', 'Ihr Arbeitsplatz hat sich geändert',
   'Hallo {{name}}, wir haben Ihre Buchung auf einen anderen Arbeitsplatz verlegt. Ihr neuer Platz: {{resource}}. Zeitraum und Preis bleiben unverändert.',
   'Bei Fragen antworten Sie einfach auf diese E-Mail.'),
  ('request_desk_changed', 'en', 'Your desk has changed ({{reference}})', 'Your desk has changed',
   'Hello {{name}}, we have moved your booking to a different desk. Your new desk: {{resource}}. The period and price stay the same.',
   'If you have any questions, simply reply to this email.')
on conflict (template_key, locale) do nothing;

-- Request emails mention "room"; workspace requests use the same templates.
update public.email_templates
   set intro = 'Hallo {{name}}, wir freuen uns, Ihre Buchung zu bestätigen. Für Sie ist reserviert: {{resource}}.'
 where template_key = 'request_confirmed' and locale = 'de'
   and intro = 'Hallo {{name}}, wir freuen uns, Ihre Buchung zu bestätigen. Für Sie ist der Raum {{resource}} reserviert.';

-- ---------------------------------------------------------------------------
-- Website texts for the workspaces (shown again by the new code)
-- ---------------------------------------------------------------------------
update public.page_section_translations
   set title = 'Arbeitsplätze',
       subtitle = 'Ihr fester Schreibtisch in einem geteilten Arbeitsraum – pro Tag oder pro Monat, Preis pro Person. Senden Sie uns einfach eine Anfrage.'
 where locale = 'de' and section_id in (select s.id from public.page_sections s join public.pages p on p.id = s.page_id
                                         where p.slug = 'coworking' and s.section_type = 'page_header');
update public.page_section_translations
   set title = 'Workspaces',
       subtitle = 'Your own desk in a shared workspace – per day or per month, priced per person. Simply send us a request.'
 where locale = 'en' and section_id in (select s.id from public.page_sections s join public.pages p on p.id = s.page_id
                                         where p.slug = 'coworking' and s.section_type = 'page_header');
update public.page_section_translations
   set title = 'Arbeitsplätze',
       subtitle = 'Geteilte Arbeitsräume mit festem Schreibtisch für jede Person – pro Tag oder pro Monat buchbar.',
       data = data || '{"cta_label": "Alle Arbeitsplätze"}'
 where locale = 'de' and section_id in (select s.id from public.page_sections s join public.pages p on p.id = s.page_id
                                         where p.slug = 'home' and s.section_type = 'workspaces');
update public.page_section_translations
   set title = 'Workspaces',
       subtitle = 'Shared workspaces with a fixed desk for every person – bookable per day or per month.',
       data = data || '{"cta_label": "All workspaces"}'
 where locale = 'en' and section_id in (select s.id from public.page_sections s join public.pages p on p.id = s.page_id
                                         where p.slug = 'home' and s.section_type = 'workspaces');
update public.page_section_translations
   set title = 'Lieber monatlich?',
       subtitle = 'Mit der Monatsbuchung behalten Sie Ihren festen Schreibtisch ab Ihrem Startdatum für einen ganzen Monat.',
       data = data || '{"button_label": "Buchung anfragen"}'
 where locale = 'de' and section_id in (select s.id from public.page_sections s join public.pages p on p.id = s.page_id
                                         where p.slug = 'coworking' and s.section_type = 'cta');
update public.page_section_translations
   set title = 'Prefer monthly?',
       subtitle = 'With a monthly booking you keep your own desk for a whole month from your start date.',
       data = data || '{"button_label": "Request a booking"}'
 where locale = 'en' and section_id in (select s.id from public.page_sections s join public.pages p on p.id = s.page_id
                                         where p.slug = 'coworking' and s.section_type = 'cta');
update public.page_sections
   set settings = settings || '{"button_href": "/booking-request?space=workspace"}'
 where id in (select s.id from public.page_sections s join public.pages p on p.id = s.page_id
               where p.slug = 'coworking' and s.section_type = 'cta');
update public.navigation_items set label_de = 'Arbeitsplätze', label_en = 'Workspaces'
 where href = '/coworking' and label_de = 'Coworking';
