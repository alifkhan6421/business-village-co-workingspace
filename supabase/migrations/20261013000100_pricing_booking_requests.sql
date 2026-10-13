-- Business Village: admin-managed pricing and the central booking request workflow.
--
-- Purely additive: new tables, new functions, new nullable columns and a wider
-- email template key list. Nothing the current site relies on is changed, so
-- the live site keeps working on the same database until this code is merged.

-- ---------------------------------------------------------------------------
-- Pricing
-- ---------------------------------------------------------------------------
create table public.pricing_settings (
  id smallint primary key default 1 check (id = 1),
  vat_rate numeric(5, 2) not null default 19.00 check (vat_rate >= 0 and vat_rate <= 100),
  -- true: stored prices are gross (VAT included); false: stored prices are net.
  prices_include_vat boolean not null default true,
  -- Which total is shown as the headline figure; net, VAT and gross are always listed.
  display_mode text not null default 'gross' check (display_mode in ('gross', 'net')),
  updated_at timestamptz not null default now()
);
create trigger pricing_settings_touch before update on public.pricing_settings
  for each row execute function private.touch_updated_at();
insert into public.pricing_settings (id) values (1) on conflict do nothing;

create table public.pricing_packages (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name_de text not null check (length(name_de) between 1 and 120),
  name_en text not null check (length(name_en) between 1 and 120),
  description_de text not null default '',
  description_en text not null default '',
  -- hourly_tiers: rate per hour from the tier table x hours
  -- fixed:        package price x number of rental periods
  -- per_person:   price per participant (optionally a range up to price_max)
  pricing_mode text not null check (pricing_mode in ('hourly_tiers', 'fixed', 'per_person')),
  price numeric(10, 2) check (price is null or price >= 0),
  price_max numeric(10, 2) check (price_max is null or price_max >= 0),
  -- Rental period one fixed price covers. 'unspecified' = not confirmed yet: one price per booking.
  duration_unit text not null default 'unspecified'
    check (duration_unit in ('hour', 'half_day', 'full_day', 'custom', 'unspecified')),
  duration_hours integer check (duration_hours is null or duration_hours between 1 and 24),
  min_hours integer not null default 1 check (min_hours between 1 and 24),
  max_hours integer not null default 10 check (max_hours between 1 and 24),
  -- hourly_tiers: added to the highest tier's hourly rate for each hour beyond it.
  extra_hour_increment numeric(10, 2) not null default 0 check (extra_hour_increment >= 0),
  min_participants integer not null default 1 check (min_participants between 1 and 1000),
  max_participants integer check (max_participants is null or max_participants between 1 and 1000),
  -- Participants covered by the price; extra_person_price is charged per person above it.
  included_participants integer check (included_participants is null or included_participants between 1 and 1000),
  extra_person_price numeric(10, 2) check (extra_person_price is null or extra_person_price >= 0),
  room_id uuid references public.rooms (id) on delete set null,
  -- true: the calculator shows the result as a confirmed package price, not an estimate.
  price_is_final boolean not null default false,
  active boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (max_hours >= min_hours),
  check (max_participants is null or max_participants >= min_participants),
  check (price_max is null or price is null or price_max >= price),
  check (duration_unit not in ('half_day', 'full_day', 'custom') or duration_hours is not null)
);
create index pricing_packages_order_idx on public.pricing_packages (sort_order, name_de);
create trigger pricing_packages_touch before update on public.pricing_packages
  for each row execute function private.touch_updated_at();

create table public.pricing_hourly_tiers (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.pricing_packages (id) on delete cascade,
  hours integer not null check (hours between 1 and 24),
  hourly_rate numeric(10, 2) not null check (hourly_rate >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (package_id, hours)
);
create trigger pricing_hourly_tiers_touch before update on public.pricing_hourly_tiers
  for each row execute function private.touch_updated_at();

alter table public.pricing_settings enable row level security;
alter table public.pricing_packages enable row level security;
alter table public.pricing_hourly_tiers enable row level security;

-- Visitors see the tax settings and active packages only; admins manage everything.
create policy "pricing_settings: public read" on public.pricing_settings for select to anon, authenticated using (true);
create policy "pricing_settings: admin update" on public.pricing_settings for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "pricing_packages: public read active" on public.pricing_packages for select to anon, authenticated
  using (active or (select public.is_admin()));
create policy "pricing_packages: admin write" on public.pricing_packages for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "pricing_tiers: public read active" on public.pricing_hourly_tiers for select to anon, authenticated
  using ((active and exists (select 1 from public.pricing_packages p where p.id = package_id and p.active))
         or (select public.is_admin()));
create policy "pricing_tiers: admin write" on public.pricing_hourly_tiers for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

revoke insert, delete on public.pricing_settings from anon, authenticated;
revoke insert, update, delete on public.pricing_packages from anon;
revoke insert, update, delete on public.pricing_hourly_tiers from anon;

-- Initial configuration. Hourly meeting room tiers are live; the fixed packages
-- carry their prices but stay inactive until the rental periods are confirmed.
insert into public.pricing_packages
  (slug, name_de, name_en, description_de, description_en, pricing_mode, price, price_max, duration_unit, duration_hours,
   min_hours, max_hours, extra_hour_increment, min_participants, max_participants, included_participants, extra_person_price,
   price_is_final, active, sort_order)
values
  ('meeting-room-hourly', 'Besprechungsraum bis 10 Personen', 'Meeting room for up to 10 people',
   'Stundenpreis nach Buchungsdauer. Die Personenzahl erhöht den Preis nicht.',
   'Hourly rate by booking length. The number of people does not change the price.',
   'hourly_tiers', null, null, 'hour', null, 1, 10, 1.00, 1, 10, null, null, false, true, 10),
  ('roter-mini', 'Roter Mini', 'Roter Mini',
   'Kleiner Besprechungsraum für bis zu 8 Personen, Stundenpreis nach Buchungsdauer.',
   'Small meeting room for up to 8 people, hourly rate by booking length.',
   'hourly_tiers', null, null, 'hour', null, 1, 10, 1.00, 1, 8, null, null, false, false, 20),
  ('blauer-raum', 'Blauer Raum', 'Blue Room', 'Raum für bis zu 10 Personen.', 'Room for up to 10 people.',
   'fixed', 295.00, null, 'unspecified', null, 1, 14, 0, 1, 10, null, null, false, false, 30),
  ('roter-maxi', 'Roter Maxi', 'Roter Maxi', 'Raum für bis zu 20 Personen.', 'Room for up to 20 people.',
   'fixed', 395.00, null, 'unspecified', null, 1, 14, 0, 1, 20, null, null, false, false, 40),
  ('gruener-raum', 'Grüner Raum', 'Green Room', 'Raum für bis zu 40 Personen.', 'Room for up to 40 people.',
   'fixed', 495.00, null, 'unspecified', null, 1, 14, 0, 1, 40, null, null, false, false, 50),
  ('komplett-business-village', 'Komplett Business Village', 'Entire Business Village',
   'Das gesamte Business Village exklusiv. Ab 41 Personen 10 € je weitere Person.',
   'The entire Business Village exclusively. From the 41st person, €10 per additional person.',
   'fixed', 2400.00, null, 'unspecified', null, 1, 14, 0, 1, null, 40, 10.00, false, false, 60),
  ('treppe-event', 'Treppe / Eventfläche', 'Stairs / event area',
   'Eventfläche, Preis pro Person je nach Umfang.', 'Event area, price per person depending on scope.',
   'per_person', 10.00, 15.00, 'unspecified', null, 1, 14, 0, 1, null, null, null, false, false, 70)
on conflict (slug) do nothing;

insert into public.pricing_hourly_tiers (package_id, hours, hourly_rate)
select p.id, t.hours, t.rate
  from public.pricing_packages p
  cross join (values (1, 12.00), (2, 17.00), (3, 21.00), (4, 25.00), (5, 27.00), (6, 29.00), (7, 30.00), (8, 31.00)) as t (hours, rate)
 where p.slug in ('meeting-room-hourly', 'roter-mini')
on conflict (package_id, hours) do nothing;

-- ---------------------------------------------------------------------------
-- Booking requests
-- ---------------------------------------------------------------------------
create sequence public.booking_request_seq start 1;

create table public.booking_requests (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  status text not null default 'pending' check (status in (
    'pending', 'under_review', 'alternative_proposed', 'confirmed', 'rejected', 'cancelled', 'completed')),
  -- What kind of space the customer asks for: a meeting room or a coworking desk.
  space_type text not null default 'room' check (space_type in ('room', 'workspace')),
  -- What the customer asked for (never changed afterwards).
  requested_start timestamptz not null,
  requested_end timestamptz not null,
  requested_hours integer not null check (requested_hours between 1 and 24),
  requested_participants integer not null check (requested_participants between 1 and 1000),
  -- Working schedule: starts as the request, admins may adjust it.
  start_at timestamptz not null,
  end_at timestamptz not null,
  participants integer not null check (participants between 1 and 1000),
  full_name text not null check (length(full_name) between 1 and 200),
  email text not null check (length(email) between 3 and 254),
  phone text,
  company text,
  message text,
  locale text not null default 'de' check (locale in ('de', 'en')),
  user_id uuid references public.profiles (id) on delete set null,
  -- The room page the visitor came from; a hint only, never an assignment.
  source_room_id uuid references public.rooms (id) on delete set null,
  package_id uuid references public.pricing_packages (id) on delete set null,
  -- Price snapshot calculated on the server at submission (kept as the customer saw it).
  estimate_snapshot jsonb,
  estimate_gross numeric(10, 2),
  -- Current price (recalculated or adjusted by an admin); confirmed with the booking.
  price_snapshot jsonb,
  price_net numeric(10, 2),
  price_vat numeric(10, 2),
  price_gross numeric(10, 2),
  price_adjusted boolean not null default false,
  price_adjustment_reason text,
  assigned_room_id uuid references public.rooms (id) on delete set null,
  assigned_workspace_id uuid references public.workspaces (id) on delete set null,
  alternative_start timestamptz,
  alternative_end timestamptz,
  status_reason text,
  booking_id uuid references public.bookings (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (requested_end > requested_start),
  check (end_at > start_at),
  check (num_nonnulls(assigned_room_id, assigned_workspace_id) <= 1),
  check (alternative_end is null or alternative_start is null or alternative_end > alternative_start)
);
create index booking_requests_created_idx on public.booking_requests (created_at desc);
create index booking_requests_start_idx on public.booking_requests (start_at);
create index booking_requests_status_idx on public.booking_requests (status);
create index booking_requests_email_idx on public.booking_requests (lower(email), created_at desc);
create trigger booking_requests_touch before update on public.booking_requests
  for each row execute function private.touch_updated_at();

-- Status history, room/price changes and internal notes.
create table public.booking_request_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.booking_requests (id) on delete cascade,
  event_type text not null check (event_type in (
    'created', 'status_changed', 'updated', 'price_recalculated', 'price_adjusted', 'note', 'message_sent')),
  from_status text,
  to_status text,
  note text,
  metadata jsonb not null default '{}'::jsonb,
  actor_id uuid references public.profiles (id) on delete set null,
  actor_label text,
  created_at timestamptz not null default now()
);
create index booking_request_events_idx on public.booking_request_events (request_id, created_at);

-- Links reservations and emails back to the request they came from.
alter table public.bookings
  add column if not exists booking_request_id uuid references public.booking_requests (id) on delete set null;
alter table public.email_logs
  add column if not exists related_booking_request_id uuid references public.booking_requests (id) on delete set null;
create index if not exists email_logs_request_idx on public.email_logs (related_booking_request_id);

alter table public.booking_requests enable row level security;
alter table public.booking_request_events enable row level security;

-- Requests contain personal data: admins only. Visitors submit through the
-- server (service role) and never read requests back.
create policy "booking_requests: admin read" on public.booking_requests for select to authenticated
  using ((select public.is_admin()));
revoke insert, update, delete on public.booking_requests from anon, authenticated;
create policy "booking_request_events: admin read" on public.booking_request_events for select to authenticated
  using ((select public.is_admin()));
revoke insert, update, delete on public.booking_request_events from anon, authenticated;

create or replace function private.next_request_reference()
returns text
language sql
security definer
set search_path = ''
as $$
  select 'BA-' || to_char(now() at time zone 'Europe/Berlin', 'YYYY') || '-'
         || lpad(nextval('public.booking_request_seq')::text, 5, '0');
$$;

-- Called only by the server action after it has validated the input and
-- calculated the price snapshot. Opening hours and dates are checked again here.
create or replace function public.submit_booking_request(
  p_space_type text, p_start timestamptz, p_hours integer, p_participants integer,
  p_full_name text, p_email text, p_phone text, p_company text, p_message text, p_locale text,
  p_user_id uuid, p_source_room_id uuid, p_package_id uuid, p_estimate jsonb, p_estimate_gross numeric
) returns table (request_id uuid, reference text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.site_settings%rowtype;
  v_end timestamptz;
  local_start timestamp;
  local_end timestamp;
  new_id uuid;
  new_ref text;
begin
  if p_hours is null or p_hours < 1 or p_hours > 24 then
    raise exception 'invalid_duration';
  end if;
  if p_participants is null or p_participants < 1 or p_participants > 1000 then
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
  if p_space_type is null or p_space_type not in ('room', 'workspace') then
    raise exception 'invalid_value';
  end if;

  select * into s from public.site_settings where id = 1;
  v_end := p_start + make_interval(hours => p_hours);
  if p_start < now() then
    raise exception 'start_in_past';
  end if;
  if p_start > now() + make_interval(days => s.booking_max_days_ahead) then
    raise exception 'too_far_ahead';
  end if;
  local_start := p_start at time zone 'Europe/Berlin';
  local_end := v_end at time zone 'Europe/Berlin';
  if not (extract(isodow from local_start)::smallint = any (s.booking_weekdays)) then
    raise exception 'closed_day';
  end if;
  if local_start::time < s.booking_day_start
     or (local_start::date <> local_end::date and not (local_end::time = '00:00' and s.booking_day_end = '00:00'))
     or (local_start::date = local_end::date and local_end::time > s.booking_day_end and s.booking_day_end <> '00:00') then
    raise exception 'outside_opening_hours';
  end if;

  new_ref := private.next_request_reference();
  insert into public.booking_requests (
    reference, space_type, requested_start, requested_end, requested_hours, requested_participants,
    start_at, end_at, participants, full_name, email, phone, company, message, locale,
    user_id, source_room_id, package_id, estimate_snapshot, estimate_gross,
    price_snapshot, price_gross, price_net, price_vat
  ) values (
    new_ref, p_space_type, p_start, v_end, p_hours, p_participants,
    p_start, v_end, p_participants,
    left(btrim(p_full_name), 200), lower(btrim(p_email)),
    nullif(left(btrim(coalesce(p_phone, '')), 50), ''), nullif(left(btrim(coalesce(p_company, '')), 200), ''),
    nullif(left(btrim(coalesce(p_message, '')), 2000), ''), p_locale,
    p_user_id, p_source_room_id, p_package_id, p_estimate, p_estimate_gross,
    p_estimate, p_estimate_gross,
    nullif(p_estimate ->> 'netCents', '')::numeric / 100,
    nullif(p_estimate ->> 'vatCents', '')::numeric / 100
  ) returning id into new_id;

  insert into public.booking_request_events (request_id, event_type, to_status, actor_label, metadata)
  values (new_id, 'created', 'pending', 'customer', jsonb_build_object('reference', new_ref));

  perform private.write_audit('BOOKING_REQUEST_CREATED', 'booking_request', new_id,
    jsonb_build_object('reference', new_ref), p_user_id, 'customer');

  request_id := new_id;
  reference := new_ref;
  return next;
end;
$$;
revoke all on function public.submit_booking_request(text, timestamptz, integer, integer, text, text, text, text, text, text, uuid, uuid, uuid, jsonb, numeric) from public, anon, authenticated;
grant execute on function public.submit_booking_request(text, timestamptz, integer, integer, text, text, text, text, text, text, uuid, uuid, uuid, jsonb, numeric) to service_role;

-- Customer of a request as a guest record, so the confirmed reservation has an owner.
create or replace function private.request_guest(r public.booking_requests)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  first_part text;
  last_part text;
  gid uuid;
begin
  first_part := btrim(regexp_replace(r.full_name, '\s+\S+$', ''));
  last_part := btrim(substring(r.full_name from '\S+$'));
  if first_part = '' or first_part = r.full_name then
    first_part := r.full_name;
    last_part := '';
  end if;
  insert into public.guests (first_name, last_name, email, phone, company, locale)
  values (left(first_part, 100), left(last_part, 100), r.email, r.phone, r.company, r.locale)
  on conflict ((lower(email))) do update
     set phone = coalesce(excluded.phone, public.guests.phone),
         company = coalesce(excluded.company, public.guests.company),
         locale = excluded.locale
  returning id into gid;
  return gid;
end;
$$;

-- Admin: change the schedule, room, participants and price of a request. When
-- the request is already confirmed, the reservation moves with it (same
-- double-booking checks as every other booking).
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
  -- A manual price always carries a reason (a kept adjustment keeps its reason).
  if p_price_adjusted and coalesce(btrim(p_adjustment_reason), '') = '' and coalesce(r.price_adjustment_reason, '') = '' then
    raise exception 'reason_required';
  end if;

  if r.booking_id is not null then
    select * into bk from public.bookings where id = r.booking_id for update;
    if found and bk.status in ('pending', 'confirmed') then
      if p_resource_id is null then
        raise exception 'room_required';
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
revoke all on function public.admin_update_booking_request(uuid, text, uuid, timestamptz, timestamptz, integer, jsonb, numeric, numeric, numeric, boolean, text, text, text) from public, anon;
grant execute on function public.admin_update_booking_request(uuid, text, uuid, timestamptz, timestamptz, integer, jsonb, numeric, numeric, numeric, boolean, text, text, text) to authenticated;

-- Admin: move a request to another status. Confirming creates the reservation
-- for the assigned room inside this transaction; the room row lock in
-- assert_slot_bookable serializes concurrent approvals and the exclusion
-- constraint on bookings is the final guarantee against double booking.
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
    if has_active then
      -- Already reserved: make sure the reservation matches the request.
      perform private.assert_slot_bookable(res_type, res_id, r.start_at, r.end_at, r.participants, true, bk.id);
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
  elsif has_active and p_status = 'completed' then
    update public.bookings set status = 'completed' where id = bk.id;
  elsif has_active then
    -- Any other status releases the room again.
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
revoke all on function public.admin_set_booking_request_status(uuid, text, text, timestamptz, timestamptz) from public, anon;
grant execute on function public.admin_set_booking_request_status(uuid, text, text, timestamptz, timestamptz) to authenticated;

-- Admin: internal note or a record of a message sent to the customer.
create or replace function public.admin_add_booking_request_event(p_request_id uuid, p_event_type text, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_event_type not in ('note', 'message_sent') then
    raise exception 'invalid_value';
  end if;
  if coalesce(btrim(p_note), '') = '' then
    raise exception 'invalid_value';
  end if;
  if not exists (select 1 from public.booking_requests where id = p_request_id) then
    raise exception 'not_found';
  end if;
  insert into public.booking_request_events (request_id, event_type, note, actor_id)
  values (p_request_id, p_event_type, left(btrim(p_note), 5000), auth.uid());
end;
$$;
revoke all on function public.admin_add_booking_request_event(uuid, text, text) from public, anon;
grant execute on function public.admin_add_booking_request_event(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Email templates for the request workflow (editable under Admin > Settings)
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
  'request_alternative', 'request_cancelled', 'request_message'));

insert into public.email_templates (template_key, locale, subject, heading, intro, outro) values
  ('request_received', 'de', 'Ihre Buchungsanfrage {{reference}}', 'Vielen Dank, {{name}}!',
   'Ihre Buchungsanfrage ist eingegangen. Unser Team prüft Ihre Anfrage und meldet sich mit einer Bestätigung bei Ihnen. Bitte beachten Sie: Ihre Anfrage ist noch keine verbindliche Reservierung.',
   'Bei Fragen antworten Sie einfach auf diese E-Mail.'),
  ('request_received', 'en', 'Your booking request {{reference}}', 'Thank you, {{name}}!',
   'Your booking request has been received. Our team will review it and contact you with confirmation. Please note: your request is not yet a confirmed reservation.',
   'If you have any questions, simply reply to this email.'),
  ('request_admin_notification', 'de', 'Neue Buchungsanfrage {{reference}}', 'Neue Buchungsanfrage',
   '{{name}} hat eine Buchungsanfrage gesendet. Bitte prüfen Sie die Anfrage und weisen Sie einen Raum zu.', ''),
  ('request_admin_notification', 'en', 'New booking request {{reference}}', 'New booking request',
   '{{name}} has sent a booking request. Please review it and assign a room.', ''),
  ('request_confirmed', 'de', 'Ihre Buchung ist bestätigt ({{reference}})', 'Ihre Buchung ist bestätigt',
   'Hallo {{name}}, wir freuen uns, Ihre Buchung zu bestätigen. Für Sie ist der Raum {{resource}} reserviert.',
   'Wir freuen uns auf Ihren Besuch.'),
  ('request_confirmed', 'en', 'Your booking is confirmed ({{reference}})', 'Your booking is confirmed',
   'Hello {{name}}, we are happy to confirm your booking. We have reserved {{resource}} for you.',
   'We look forward to seeing you.'),
  ('request_rejected', 'de', 'Ihre Buchungsanfrage {{reference}}', 'Leider können wir Ihre Anfrage nicht bestätigen',
   'Hallo {{name}}, leider können wir Ihre Buchungsanfrage zum gewünschten Termin nicht bestätigen.',
   'Gerne helfen wir Ihnen bei einem anderen Termin. Antworten Sie einfach auf diese E-Mail.'),
  ('request_rejected', 'en', 'Your booking request {{reference}}', 'Unfortunately we cannot confirm your request',
   'Hello {{name}}, unfortunately we cannot confirm your booking request for the requested time.',
   'We are happy to help you find another time. Simply reply to this email.'),
  ('request_alternative', 'de', 'Alternativer Termin für Ihre Anfrage {{reference}}', 'Wir schlagen einen anderen Termin vor',
   'Hallo {{name}}, zum gewünschten Termin ist leider kein passender Raum frei. Wir können Ihnen folgenden Termin anbieten:',
   'Bitte antworten Sie auf diese E-Mail, ob der Termin für Sie passt.'),
  ('request_alternative', 'en', 'Alternative time for your request {{reference}}', 'We suggest a different time',
   'Hello {{name}}, unfortunately no suitable room is free at the requested time. We can offer you the following time:',
   'Please reply to this email to let us know whether this time suits you.'),
  ('request_cancelled', 'de', 'Ihre Buchung {{reference}} wurde storniert', 'Buchung storniert',
   'Hallo {{name}}, Ihre Buchung wurde storniert.', 'Bei Fragen antworten Sie einfach auf diese E-Mail.'),
  ('request_cancelled', 'en', 'Your booking {{reference}} has been cancelled', 'Booking cancelled',
   'Hello {{name}}, your booking has been cancelled.', 'If you have any questions, simply reply to this email.'),
  ('request_message', 'de', 'Nachricht zu Ihrer Buchungsanfrage {{reference}}', 'Nachricht zu Ihrer Anfrage',
   'Hallo {{name}}, wir haben eine Nachricht zu Ihrer Buchungsanfrage für Sie:', ''),
  ('request_message', 'en', 'Message about your booking request {{reference}}', 'Message about your request',
   'Hello {{name}}, we have a message about your booking request:', '')
on conflict (template_key, locale) do nothing;
