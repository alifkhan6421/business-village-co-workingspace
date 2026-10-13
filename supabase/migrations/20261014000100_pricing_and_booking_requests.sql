-- Business Village: configurable pricing, central booking requests.
--
-- * Pricing rules live in the database (pricing_settings, price_hourly_plans,
--   price_hourly_tiers, price_packages) and are edited in Admin → Pricing.
-- * Visitors no longer book meeting rooms directly. They send a booking request
--   (booking_requests); an admin assigns a room and confirms it, which creates
--   a regular row in bookings (so the existing exclusion constraint still
--   prevents double booking, including concurrent approvals).
-- * Public room availability is no longer exposed.
--
-- Additive only: no tables or data are removed.

-- ---------------------------------------------------------------------------
-- Pricing configuration
-- ---------------------------------------------------------------------------
create table public.pricing_settings (
  id smallint primary key default 1 check (id = 1),
  vat_rate numeric(5, 2) not null default 19 check (vat_rate >= 0 and vat_rate <= 100),
  -- true: stored prices are gross (VAT included); false: stored prices are net.
  prices_include_vat boolean not null default true,
  -- Which total is shown most prominently in the calculator.
  display_mode text not null default 'gross' check (display_mode in ('gross', 'net')),
  show_vat_breakdown boolean not null default true,
  note_de text not null default '',
  note_en text not null default '',
  updated_at timestamptz not null default now()
);
create trigger pricing_settings_touch before update on public.pricing_settings
  for each row execute function private.touch_updated_at();
insert into public.pricing_settings (id) values (1) on conflict (id) do nothing;

-- Hourly pricing: the rate per hour depends on the booked duration. The total
-- is rate × hours; participants do not multiply the price.
create table public.price_hourly_plans (
  id uuid primary key default gen_random_uuid(),
  name_de text not null check (length(btrim(name_de)) between 1 and 120),
  name_en text not null check (length(btrim(name_en)) between 1 and 120),
  description_de text not null default '',
  description_en text not null default '',
  room_id uuid references public.rooms (id) on delete set null,
  min_participants integer not null default 1 check (min_participants between 1 and 1000),
  max_participants integer not null default 10 check (max_participants between 1 and 1000),
  min_hours integer not null default 1 check (min_hours between 1 and 24),
  max_hours integer not null default 12 check (max_hours between 1 and 24),
  -- Added to the hourly rate for every hour beyond the longest configured tier.
  extra_hour_increment numeric(10, 2) not null default 0 check (extra_hour_increment >= 0),
  price_type text not null default 'fixed' check (price_type in ('fixed', 'estimate')),
  active boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (min_participants <= max_participants),
  check (min_hours <= max_hours)
);
create trigger price_hourly_plans_touch before update on public.price_hourly_plans
  for each row execute function private.touch_updated_at();

create table public.price_hourly_tiers (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.price_hourly_plans (id) on delete cascade,
  hours integer not null check (hours between 1 and 24),
  hourly_rate numeric(10, 2) not null check (hourly_rate >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plan_id, hours)
);
create trigger price_hourly_tiers_touch before update on public.price_hourly_tiers
  for each row execute function private.touch_updated_at();

-- Fixed-price rental packages (rooms, the whole venue, event areas).
create table public.price_packages (
  id uuid primary key default gen_random_uuid(),
  name_de text not null check (length(btrim(name_de)) between 1 and 120),
  name_en text not null check (length(btrim(name_en)) between 1 and 120),
  description_de text not null default '',
  description_en text not null default '',
  room_id uuid references public.rooms (id) on delete set null,
  -- flat: one price for the period; per_person: price × participants.
  pricing_mode text not null default 'flat' check (pricing_mode in ('flat', 'per_person')),
  price numeric(10, 2) not null check (price >= 0),
  -- hour: price is per hour (× hours). half_day / full_day / custom: the price
  -- covers one period of up to duration_hours (NULL = any length).
  duration_type text not null default 'custom' check (duration_type in ('hour', 'half_day', 'full_day', 'custom')),
  duration_hours numeric(4, 1) check (duration_hours is null or (duration_hours > 0 and duration_hours <= 24)),
  duration_label_de text not null default '',
  duration_label_en text not null default '',
  min_participants integer not null default 1 check (min_participants between 1 and 1000),
  -- Participants included in the price (room capacity). NULL = no limit.
  max_participants integer check (max_participants is null or max_participants between 1 and 1000),
  -- Charge per participant above max_participants. NULL = more participants are not allowed.
  extra_person_price numeric(10, 2) check (extra_person_price is null or extra_person_price >= 0),
  -- Highest number of extra participants (NULL = no limit).
  max_extra_participants integer check (max_extra_participants is null or max_extra_participants between 1 and 1000),
  price_type text not null default 'estimate' check (price_type in ('fixed', 'estimate')),
  active boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (max_participants is null or min_participants <= max_participants)
);
create trigger price_packages_touch before update on public.price_packages
  for each row execute function private.touch_updated_at();

alter table public.pricing_settings enable row level security;
alter table public.price_hourly_plans enable row level security;
alter table public.price_hourly_tiers enable row level security;
alter table public.price_packages enable row level security;

create policy "pricing_settings: public read" on public.pricing_settings for select to anon, authenticated using (true);
create policy "pricing_settings: admin update" on public.pricing_settings for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "hourly_plans: read active" on public.price_hourly_plans for select to anon, authenticated
  using (active or (select public.is_admin()));
create policy "hourly_plans: admin write" on public.price_hourly_plans for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "hourly_tiers: read active" on public.price_hourly_tiers for select to anon, authenticated
  using ((active and exists (select 1 from public.price_hourly_plans p where p.id = plan_id and p.active))
         or (select public.is_admin()));
create policy "hourly_tiers: admin write" on public.price_hourly_tiers for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "packages: read active" on public.price_packages for select to anon, authenticated
  using (active or (select public.is_admin()));
create policy "packages: admin write" on public.price_packages for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- Every pricing change is written to the activity log.
create or replace function private.audit_pricing_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  rec jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  before jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
begin
  perform private.write_audit(
    'PRICING_' || case tg_op when 'INSERT' then 'CREATED' when 'UPDATE' then 'UPDATED' else 'DELETED' end,
    tg_table_name,
    case when tg_table_name = 'pricing_settings' then null else (rec ->> 'id')::uuid end,
    jsonb_build_object('label', coalesce(rec ->> 'name_de', rec ->> 'hours', 'settings'),
                       'before', before, 'after', case when tg_op = 'DELETE' then null else rec end));
  return null;
end;
$$;

create trigger pricing_settings_audit after update on public.pricing_settings
  for each row execute function private.audit_pricing_change();
create trigger price_hourly_plans_audit after insert or update or delete on public.price_hourly_plans
  for each row execute function private.audit_pricing_change();
create trigger price_hourly_tiers_audit after insert or update or delete on public.price_hourly_tiers
  for each row execute function private.audit_pricing_change();
create trigger price_packages_audit after insert or update or delete on public.price_packages
  for each row execute function private.audit_pricing_change();

-- Initial price list (only on a fresh install of this feature).
do $$
declare
  v_plan uuid;
  v_mini uuid;
  v_room uuid;
begin
  if exists (select 1 from public.price_hourly_plans) or exists (select 1 from public.price_packages) then
    return;
  end if;

  insert into public.price_hourly_plans (name_de, name_en, description_de, description_en,
    min_participants, max_participants, min_hours, max_hours, extra_hour_increment, price_type, display_order)
  values ('Besprechungsraum bis 10 Personen', 'Meeting room up to 10 people',
    'Stundenpreis je nach Buchungsdauer. Die Teilnehmerzahl erhöht den Preis nicht.',
    'Hourly rate depending on the booking duration. The number of participants does not change the price.',
    1, 10, 1, 12, 1, 'fixed', 0)
  returning id into v_plan;

  -- Roter Mini: own hourly plan, starts with the same rates and is switched off
  -- until the administrator confirms its prices.
  select id into v_room from public.rooms where lower(name) = 'roter mini' limit 1;
  insert into public.price_hourly_plans (name_de, name_en, description_de, description_en, room_id,
    min_participants, max_participants, min_hours, max_hours, extra_hour_increment, price_type, active, display_order)
  values ('Roter Mini (bis 8 Personen)', 'Roter Mini (up to 8 people)',
    'Stundenpreis je nach Buchungsdauer.', 'Hourly rate depending on the booking duration.', v_room,
    1, 8, 1, 12, 1, 'fixed', false, 5)
  returning id into v_mini;

  insert into public.price_hourly_tiers (plan_id, hours, hourly_rate)
  select p.id, t.hours, t.rate
    from (values (v_plan), (v_mini)) as p (id)
   cross join (values (1, 12), (2, 17), (3, 21), (4, 25), (5, 27), (6, 29), (7, 30), (8, 31)) as t (hours, rate);

  insert into public.price_packages (name_de, name_en, description_de, description_en, room_id,
    pricing_mode, price, duration_type, duration_hours, duration_label_de, duration_label_en,
    min_participants, max_participants, extra_person_price, price_type, display_order)
  values
    ('Blauer Raum', 'Blauer Raum', 'Raummiete bis 10 Personen.', 'Room rental for up to 10 people.',
      (select id from public.rooms where lower(name) = 'blauer raum' limit 1),
      'flat', 295, 'custom', null, 'Mietdauer wird noch festgelegt', 'Rental period to be confirmed', 1, 10, null, 'estimate', 10),
    ('Roter Maxi', 'Roter Maxi', 'Raummiete bis 20 Personen.', 'Room rental for up to 20 people.',
      (select id from public.rooms where lower(name) = 'roter maxi' limit 1),
      'flat', 395, 'custom', null, 'Mietdauer wird noch festgelegt', 'Rental period to be confirmed', 1, 20, null, 'estimate', 20),
    ('Grüner Raum', 'Grüner Raum', 'Raummiete bis 40 Personen, jede weitere Person 10 €.', 'Room rental for up to 40 people, €10 for each additional person.',
      (select id from public.rooms where lower(name) in ('grüner raum', 'gruener raum') limit 1),
      'flat', 495, 'custom', null, 'Mietdauer wird noch festgelegt', 'Rental period to be confirmed', 1, 40, 10, 'estimate', 30),
    ('Komplett Business Village', 'Entire Business Village', 'Das gesamte Business Village exklusiv.', 'The entire Business Village exclusively.',
      null, 'flat', 2400, 'custom', null, 'Mietdauer wird noch festgelegt', 'Rental period to be confirmed', 1, null, null, 'estimate', 40),
    ('Treppe / Eventfläche', 'Stairs / event area', 'Eventfläche, 10–15 € pro Person je nach Leistungsumfang.', 'Event area, €10–15 per person depending on the services.',
      null, 'per_person', 10, 'custom', null, 'Veranstaltung', 'Event', 1, null, null, 'estimate', 50);
end;
$$;

-- ---------------------------------------------------------------------------
-- Booking requests
-- ---------------------------------------------------------------------------
create table public.booking_requests (
  id uuid primary key default gen_random_uuid(),
  -- Same BV-YYYY-NNNNNN series as bookings; the confirmed booking keeps it.
  reference text not null unique,
  status text not null default 'pending' check (status in (
    'pending', 'under_review', 'alternative_proposed', 'confirmed', 'rejected', 'cancelled', 'completed')),
  user_id uuid references public.profiles (id) on delete set null,
  guest_id uuid references public.guests (id) on delete set null,
  contact_name text not null check (length(btrim(contact_name)) between 1 and 200),
  contact_email text not null check (length(contact_email) between 3 and 254),
  contact_phone text,
  contact_company text,
  message text,
  locale text not null default 'de' check (locale in ('de', 'en')),
  start_at timestamptz not null,
  end_at timestamptz not null,
  duration_hours integer not null check (duration_hours between 1 and 24),
  participants integer not null check (participants between 1 and 1000),
  -- Room page the visitor came from (information only, never an assignment).
  preferred_room_id uuid references public.rooms (id) on delete set null,
  assigned_room_id uuid references public.rooms (id) on delete set null,
  booking_id uuid unique references public.bookings (id) on delete set null,
  -- Price snapshot at submission (server-calculated) – never changes afterwards.
  price_snapshot jsonb,
  estimated_net numeric(10, 2),
  estimated_vat numeric(10, 2),
  estimated_gross numeric(10, 2),
  -- Current quote (recalculated or manually adjusted by an admin).
  quote_snapshot jsonb,
  quote_net numeric(10, 2),
  quote_vat numeric(10, 2),
  quote_gross numeric(10, 2),
  price_adjusted boolean not null default false,
  price_adjustment_reason text,
  alternative_start_at timestamptz,
  alternative_end_at timestamptz,
  alternative_message text,
  status_changed_at timestamptz not null default now(),
  status_changed_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint booking_requests_time_order check (end_at > start_at),
  constraint booking_requests_alt_order check (alternative_end_at is null or alternative_end_at > alternative_start_at)
);
create index booking_requests_start_idx on public.booking_requests (start_at);
create index booking_requests_status_idx on public.booking_requests (status, start_at);
create index booking_requests_created_idx on public.booking_requests (created_at desc);
create index booking_requests_email_idx on public.booking_requests (lower(contact_email), created_at desc);
create index booking_requests_room_idx on public.booking_requests (assigned_room_id);
create index booking_requests_user_idx on public.booking_requests (user_id);
create trigger booking_requests_touch before update on public.booking_requests
  for each row execute function private.touch_updated_at();

-- Status history, internal notes and price changes (admin only).
create table public.booking_request_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.booking_requests (id) on delete cascade,
  event_type text not null check (event_type in ('created', 'status', 'note', 'details', 'price', 'email')),
  from_status text,
  to_status text,
  note text check (note is null or length(note) <= 5000),
  metadata jsonb not null default '{}'::jsonb,
  actor_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index booking_request_events_request_idx on public.booking_request_events (request_id, created_at);

alter table public.booking_requests enable row level security;
alter table public.booking_request_events enable row level security;

-- Members see their own requests; admins see all; visitors none.
create policy "booking_requests: member reads own" on public.booking_requests for select to authenticated
  using (user_id = (select auth.uid()));
create policy "booking_requests: admin reads all" on public.booking_requests for select to authenticated
  using ((select public.is_admin()));
revoke insert, update, delete on public.booking_requests from anon, authenticated;

create policy "booking_request_events: admin read" on public.booking_request_events for select to authenticated
  using ((select public.is_admin()));
revoke insert, update, delete on public.booking_request_events from anon, authenticated;

alter table public.email_logs
  add column if not exists related_booking_request_id uuid references public.booking_requests (id) on delete set null;
create index if not exists email_logs_request_idx on public.email_logs (related_booking_request_id);

-- Requests must be in the future, within the booking horizon, on an opening
-- day and within the daily booking hours (Europe/Berlin, DST-aware).
create or replace function private.assert_request_window(p_start timestamptz, p_end timestamptz, p_is_admin boolean)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s public.site_settings%rowtype;
  local_start timestamp;
  local_end timestamp;
begin
  if p_start is null or p_end is null or p_end <= p_start then
    raise exception 'invalid_time_range';
  end if;
  if p_end - p_start > interval '24 hours' then
    raise exception 'duration_too_long';
  end if;
  if p_is_admin then
    return;
  end if;
  select * into s from public.site_settings where id = 1;
  if p_start < now() then
    raise exception 'start_in_past';
  end if;
  if p_start > now() + make_interval(days => s.booking_max_days_ahead) then
    raise exception 'too_far_ahead';
  end if;
  local_start := p_start at time zone 'Europe/Berlin';
  local_end := p_end at time zone 'Europe/Berlin';
  if local_start::date <> local_end::date and not (local_end::time = '00:00' and local_end::date = local_start::date + 1) then
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
end;
$$;

-- Public submission: only callable with the service role from the
-- submitBookingRequest server action, which validates input, rate-limits and
-- recalculates the price on the server (client totals are never trusted).
create or replace function public.submit_booking_request(
  p_start timestamptz, p_end timestamptz, p_duration_hours integer, p_participants integer,
  p_full_name text, p_email text, p_phone text, p_company text, p_message text, p_locale text,
  p_user_id uuid, p_preferred_room_id uuid,
  p_price_snapshot jsonb, p_net numeric, p_vat numeric, p_gross numeric
) returns table (request_id uuid, reference text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  gid uuid;
  new_id uuid;
  new_ref text;
  name_clean text := left(btrim(coalesce(p_full_name, '')), 200);
  first_part text;
  last_part text;
begin
  if p_email is null or p_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(p_email) > 254 then
    raise exception 'invalid_email';
  end if;
  if name_clean = '' then
    raise exception 'invalid_name';
  end if;
  if p_duration_hours is null or p_duration_hours < 1 or p_duration_hours > 24
     or p_end - p_start <> make_interval(hours => p_duration_hours) then
    raise exception 'invalid_time_range';
  end if;
  if p_participants is null or p_participants < 1 or p_participants > 1000 then
    raise exception 'invalid_participants';
  end if;
  if p_locale not in ('de', 'en') then
    p_locale := 'de';
  end if;
  perform private.assert_request_window(p_start, p_end, false);

  first_part := split_part(name_clean, ' ', 1);
  last_part := btrim(substr(name_clean, length(first_part) + 1));
  insert into public.guests (first_name, last_name, email, phone, company, locale)
  values (left(first_part, 100), left(last_part, 100), lower(btrim(p_email)),
          nullif(left(btrim(coalesce(p_phone, '')), 50), ''), nullif(left(btrim(coalesce(p_company, '')), 200), ''),
          p_locale)
  on conflict ((lower(email))) do update
     set first_name = excluded.first_name,
         last_name = excluded.last_name,
         phone = coalesce(excluded.phone, public.guests.phone),
         company = coalesce(excluded.company, public.guests.company),
         locale = excluded.locale
  returning id into gid;

  new_ref := private.next_booking_reference();
  insert into public.booking_requests (
    reference, user_id, guest_id, contact_name, contact_email, contact_phone, contact_company, message, locale,
    start_at, end_at, duration_hours, participants, preferred_room_id,
    price_snapshot, estimated_net, estimated_vat, estimated_gross,
    quote_snapshot, quote_net, quote_vat, quote_gross
  ) values (
    new_ref, p_user_id, gid, name_clean, lower(btrim(p_email)),
    nullif(left(btrim(coalesce(p_phone, '')), 50), ''), nullif(left(btrim(coalesce(p_company, '')), 200), ''),
    nullif(left(btrim(coalesce(p_message, '')), 2000), ''), p_locale,
    p_start, p_end, p_duration_hours, p_participants,
    (select r.id from public.rooms r where r.id = p_preferred_room_id and r.public_visible),
    p_price_snapshot, p_net, p_vat, p_gross,
    p_price_snapshot, p_net, p_vat, p_gross
  ) returning id into new_id;

  insert into public.booking_request_events (request_id, event_type, to_status, metadata)
  values (new_id, 'created', 'pending', jsonb_build_object('estimated_gross', p_gross));
  perform private.write_audit('BOOKING_REQUEST_CREATED', 'booking_request', new_id,
    jsonb_build_object('reference', new_ref), p_user_id, case when p_user_id is null then 'guest' end);

  request_id := new_id;
  reference := new_ref;
  return next;
end;
$$;
revoke all on function public.submit_booking_request(timestamptz, timestamptz, integer, integer, text, text, text, text, text, text, uuid, uuid, jsonb, numeric, numeric, numeric) from public, anon, authenticated;
grant execute on function public.submit_booking_request(timestamptz, timestamptz, integer, integer, text, text, text, text, text, text, uuid, uuid, jsonb, numeric, numeric, numeric) to service_role;

-- Admin: change date/time, duration, participants and room assignment of an
-- open request, together with the recalculated quote.
create or replace function public.admin_update_booking_request(
  p_request_id uuid, p_start timestamptz, p_end timestamptz, p_duration_hours integer, p_participants integer,
  p_assigned_room_id uuid, p_quote_snapshot jsonb, p_quote_net numeric, p_quote_vat numeric, p_quote_gross numeric
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.booking_requests%rowtype;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into r from public.booking_requests where id = p_request_id for update;
  if not found then
    raise exception 'not_found';
  end if;
  if r.status not in ('pending', 'under_review', 'alternative_proposed') then
    raise exception 'request_closed';
  end if;
  if p_duration_hours is null or p_duration_hours < 1 or p_duration_hours > 24
     or p_end - p_start <> make_interval(hours => p_duration_hours) then
    raise exception 'invalid_time_range';
  end if;
  if p_participants is null or p_participants < 1 or p_participants > 1000 then
    raise exception 'invalid_participants';
  end if;
  if p_assigned_room_id is not null and not exists (select 1 from public.rooms where id = p_assigned_room_id) then
    raise exception 'resource_not_found';
  end if;

  update public.booking_requests
     set start_at = p_start, end_at = p_end, duration_hours = p_duration_hours, participants = p_participants,
         assigned_room_id = p_assigned_room_id,
         quote_snapshot = p_quote_snapshot, quote_net = p_quote_net, quote_vat = p_quote_vat, quote_gross = p_quote_gross,
         price_adjusted = false, price_adjustment_reason = null
   where id = p_request_id;

  insert into public.booking_request_events (request_id, event_type, metadata, actor_id)
  values (p_request_id, 'details', jsonb_build_object(
    'from', jsonb_build_object('start', r.start_at, 'end', r.end_at, 'participants', r.participants, 'room', r.assigned_room_id, 'gross', r.quote_gross),
    'to', jsonb_build_object('start', p_start, 'end', p_end, 'participants', p_participants, 'room', p_assigned_room_id, 'gross', p_quote_gross)),
    auth.uid());
  perform private.write_audit('BOOKING_REQUEST_UPDATED', 'booking_request', p_request_id, jsonb_build_object('reference', r.reference));
end;
$$;
revoke all on function public.admin_update_booking_request(uuid, timestamptz, timestamptz, integer, integer, uuid, jsonb, numeric, numeric, numeric) from public, anon;
grant execute on function public.admin_update_booking_request(uuid, timestamptz, timestamptz, integer, integer, uuid, jsonb, numeric, numeric, numeric) to authenticated;

-- Admin: manual price adjustment, always with a recorded reason.
create or replace function public.admin_adjust_booking_request_price(
  p_request_id uuid, p_net numeric, p_vat numeric, p_gross numeric, p_reason text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.booking_requests%rowtype;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'reason_required';
  end if;
  if p_net is null or p_vat is null or p_gross is null or p_net < 0 or p_vat < 0 or p_gross <> p_net + p_vat then
    raise exception 'invalid_price';
  end if;
  select * into r from public.booking_requests where id = p_request_id for update;
  if not found then
    raise exception 'not_found';
  end if;
  if r.status not in ('pending', 'under_review', 'alternative_proposed') then
    raise exception 'request_closed';
  end if;

  update public.booking_requests
     set quote_net = p_net, quote_vat = p_vat, quote_gross = p_gross,
         price_adjusted = true, price_adjustment_reason = left(btrim(p_reason), 1000)
   where id = p_request_id;

  insert into public.booking_request_events (request_id, event_type, note, metadata, actor_id)
  values (p_request_id, 'price', left(btrim(p_reason), 1000), jsonb_build_object(
    'from', jsonb_build_object('net', r.quote_net, 'vat', r.quote_vat, 'gross', r.quote_gross),
    'to', jsonb_build_object('net', p_net, 'vat', p_vat, 'gross', p_gross)), auth.uid());
  perform private.write_audit('BOOKING_REQUEST_PRICE_ADJUSTED', 'booking_request', p_request_id,
    jsonb_build_object('reference', r.reference, 'from', r.quote_gross, 'to', p_gross, 'reason', left(btrim(p_reason), 1000)));
end;
$$;
revoke all on function public.admin_adjust_booking_request_price(uuid, numeric, numeric, numeric, text) from public, anon;
grant execute on function public.admin_adjust_booking_request_price(uuid, numeric, numeric, numeric, text) to authenticated;

-- Admin: status changes. Confirming creates the booking for the assigned room
-- through the booking engine (room row lock + exclusion constraint), so two
-- overlapping confirmations for the same room can never both succeed.
create or replace function public.admin_set_booking_request_status(
  p_request_id uuid, p_status text, p_note text default null,
  p_alt_start timestamptz default null, p_alt_end timestamptz default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.booking_requests%rowtype;
  allowed text[];
  new_booking uuid;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into r from public.booking_requests where id = p_request_id for update;
  if not found then
    raise exception 'not_found';
  end if;

  allowed := case r.status
    when 'pending' then array['under_review', 'alternative_proposed', 'confirmed', 'rejected', 'cancelled']
    when 'under_review' then array['pending', 'alternative_proposed', 'confirmed', 'rejected', 'cancelled']
    when 'alternative_proposed' then array['under_review', 'alternative_proposed', 'confirmed', 'rejected', 'cancelled']
    when 'confirmed' then array['cancelled', 'completed']
    when 'rejected' then array['under_review']
    else array[]::text[]
  end;
  if not (p_status = any (allowed)) then
    raise exception 'invalid_status_transition';
  end if;

  if p_status = 'confirmed' then
    if r.assigned_room_id is null then
      raise exception 'room_required';
    end if;
    perform private.assert_slot_bookable('room', r.assigned_room_id, r.start_at, r.end_at, r.participants, true);
    begin
      insert into public.bookings (
        booking_reference, booking_type, user_id, guest_id, room_id, start_at, end_at, attendees, purpose,
        status, source, locale, created_by
      ) values (
        r.reference, 'room', r.user_id, case when r.user_id is null then r.guest_id end, r.assigned_room_id,
        r.start_at, r.end_at, r.participants, left(r.message, 1000), 'confirmed', 'admin', r.locale, auth.uid()
      ) returning id into new_booking;
    exception when exclusion_violation then
      raise exception 'slot_unavailable';
    end;
    perform private.write_audit('BOOKING_CREATED', 'booking', new_booking,
      jsonb_build_object('reference', r.reference, 'source', 'request', 'type', 'room'));
  elsif p_status = 'alternative_proposed' then
    if p_alt_start is null or p_alt_end is null or p_alt_end <= p_alt_start then
      raise exception 'invalid_time_range';
    end if;
  elsif p_status in ('cancelled', 'completed') and r.booking_id is not null then
    -- Keep the linked booking in step (the sync trigger below sees the request
    -- is already being updated and does nothing).
    update public.bookings
       set status = p_status,
           cancelled_at = case when p_status = 'cancelled' then now() else cancelled_at end,
           cancelled_by = case when p_status = 'cancelled' then auth.uid() else cancelled_by end,
           cancellation_reason = case when p_status = 'cancelled' then nullif(left(btrim(coalesce(p_note, '')), 1000), '') else cancellation_reason end
     where id = r.booking_id and status in ('pending', 'confirmed');
  end if;

  update public.booking_requests
     set status = p_status,
         booking_id = coalesce(new_booking, booking_id),
         alternative_start_at = case when p_status = 'alternative_proposed' then p_alt_start else alternative_start_at end,
         alternative_end_at = case when p_status = 'alternative_proposed' then p_alt_end else alternative_end_at end,
         alternative_message = case when p_status = 'alternative_proposed' then nullif(left(btrim(coalesce(p_note, '')), 2000), '') else alternative_message end,
         status_changed_at = now(),
         status_changed_by = auth.uid()
   where id = p_request_id;

  insert into public.booking_request_events (request_id, event_type, from_status, to_status, note, metadata, actor_id)
  values (p_request_id, 'status', r.status, p_status, nullif(left(btrim(coalesce(p_note, '')), 5000), ''),
    case when p_status = 'alternative_proposed' then jsonb_build_object('alt_start', p_alt_start, 'alt_end', p_alt_end)
         when p_status = 'confirmed' then jsonb_build_object('room', r.assigned_room_id, 'booking_id', new_booking, 'gross', r.quote_gross)
         else '{}'::jsonb end,
    auth.uid());
  perform private.write_audit('BOOKING_REQUEST_' || upper(p_status), 'booking_request', p_request_id,
    jsonb_build_object('reference', r.reference, 'from', r.status, 'to', p_status));
  return coalesce(new_booking, r.booking_id);
end;
$$;
revoke all on function public.admin_set_booking_request_status(uuid, text, text, timestamptz, timestamptz) from public, anon;
grant execute on function public.admin_set_booking_request_status(uuid, text, text, timestamptz, timestamptz) to authenticated;

create or replace function public.admin_add_booking_request_note(p_request_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if coalesce(btrim(p_note), '') = '' then
    raise exception 'note_required';
  end if;
  if not exists (select 1 from public.booking_requests where id = p_request_id) then
    raise exception 'not_found';
  end if;
  insert into public.booking_request_events (request_id, event_type, note, actor_id)
  values (p_request_id, 'note', left(btrim(p_note), 5000), auth.uid());
end;
$$;
revoke all on function public.admin_add_booking_request_note(uuid, text) from public, anon;
grant execute on function public.admin_add_booking_request_note(uuid, text) to authenticated;

-- Records customer emails in the request history (service role: called after sending).
create or replace function public.log_booking_request_email(p_request_id uuid, p_kind text, p_ok boolean, p_actor uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.booking_request_events (request_id, event_type, metadata, actor_id)
  values (p_request_id, 'email', jsonb_build_object('kind', p_kind, 'ok', p_ok), p_actor);
$$;
revoke all on function public.log_booking_request_email(uuid, text, boolean, uuid) from public, anon, authenticated;
grant execute on function public.log_booking_request_email(uuid, text, boolean, uuid) to service_role;

-- If a booking created from a request is cancelled or completed elsewhere
-- (bookings page, customer cancellation link), the request follows.
create or replace function private.sync_request_from_booking()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.booking_requests%rowtype;
begin
  if new.status is not distinct from old.status or new.status not in ('cancelled', 'completed') then
    return null;
  end if;
  select * into r from public.booking_requests where booking_id = new.id and status = 'confirmed' for update;
  if not found then
    return null;
  end if;
  update public.booking_requests
     set status = new.status, status_changed_at = now(), status_changed_by = auth.uid()
   where id = r.id;
  insert into public.booking_request_events (request_id, event_type, from_status, to_status, note, metadata, actor_id)
  values (r.id, 'status', 'confirmed', new.status, new.cancellation_reason, jsonb_build_object('via', 'booking'), auth.uid());
  return null;
end;
$$;
create trigger bookings_sync_request after update of status on public.bookings
  for each row execute function private.sync_request_from_booking();

-- Admin: which rooms are free for a time range (used before assigning/confirming).
create or replace function public.admin_room_availability(p_start timestamptz, p_end timestamptz)
returns table (room_id uuid, name text, capacity integer, status text, conflict text, conflict_reference text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_end <= p_start then
    raise exception 'invalid_time_range';
  end if;
  return query
    select r.id, r.name, r.capacity, r.status,
           case
             when exists (select 1 from public.resource_blocks b where b.room_id = r.id
                           and tstzrange(b.start_at, b.end_at, '[)') && tstzrange(p_start, p_end, '[)')) then 'blocked'
             when bk.id is not null then 'booked'
             else 'free'
           end,
           bk.booking_reference
      from public.rooms r
      left join lateral (
        select x.id, x.booking_reference from public.bookings x
         where x.room_id = r.id and x.status in ('pending', 'confirmed')
           and tstzrange(x.start_at, x.end_at, '[)') && tstzrange(p_start, p_end, '[)')
         order by x.start_at limit 1
      ) bk on true
     order by r.display_order, r.name;
end;
$$;
revoke all on function public.admin_room_availability(timestamptz, timestamptz) from public, anon;
grant execute on function public.admin_room_availability(timestamptz, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- Meeting rooms can no longer be booked or checked for availability publicly
-- ---------------------------------------------------------------------------
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
  -- Meeting rooms go through booking requests; only admins assign rooms.
  if p_type = 'room' and not p_is_admin then
    raise exception 'room_requests_only';
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
    -- Room occupancy is internal information.
    if not (public.is_admin() or coalesce(auth.role(), '') = 'service_role') then
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
     and public.is_admin()
     and r.public_visible and r.status = 'available'
     and not exists (select 1 from public.bookings bk where bk.room_id = r.id
                       and bk.status in ('pending', 'confirmed')
                       and tstzrange(bk.start_at, bk.end_at, '[)') && tstzrange(p_start, p_end, '[)'))
     and not exists (select 1 from public.resource_blocks b where b.room_id = r.id
                       and tstzrange(b.start_at, b.end_at, '[)') && tstzrange(p_start, p_end, '[)'));
$$;

-- ---------------------------------------------------------------------------
-- Email templates for booking requests
-- ---------------------------------------------------------------------------
alter table public.email_templates drop constraint if exists email_templates_template_key_check;
alter table public.email_templates add constraint email_templates_template_key_check check (template_key in (
  'welcome', 'verify_email', 'password_reset', 'booking_confirmation', 'guest_booking_confirmation',
  'booking_updated', 'booking_cancelled', 'contact_confirmation', 'contact_admin_notification',
  'booking_admin_notification', 'booking_message',
  'request_received', 'request_admin_notification', 'request_confirmed', 'request_rejected',
  'request_cancelled', 'request_alternative', 'request_message'));

insert into public.email_templates (template_key, locale, subject, heading, intro, outro) values
  ('request_received', 'de', 'Ihre Buchungsanfrage {{reference}} ist eingegangen', 'Vielen Dank für Ihre Anfrage, {{name}}!',
   'Ihre Buchungsanfrage ist eingegangen. Unser Team prüft Ihre Anfrage und meldet sich mit einer Bestätigung bei Ihnen.',
   'Bitte beachten Sie: Dies ist noch keine Reservierung. Der angezeigte Preis ist eine Schätzung.'),
  ('request_received', 'en', 'We have received your booking request {{reference}}', 'Thank you for your request, {{name}}!',
   'Your booking request has been received. Our team will review it and contact you with confirmation.',
   'Please note: this is not a reservation yet. The price shown is an estimate.'),
  ('request_admin_notification', 'de', 'Neue Buchungsanfrage {{reference}} von {{name}}', 'Neue Buchungsanfrage',
   'Es ist eine neue Buchungsanfrage eingegangen. Bitte prüfen Sie die Anfrage und weisen Sie einen Raum zu.', ''),
  ('request_admin_notification', 'en', 'New booking request {{reference}} from {{name}}', 'New booking request',
   'A new booking request has arrived. Please review it and assign a room.', ''),
  ('request_confirmed', 'de', 'Ihre Buchung {{reference}} ist bestätigt', 'Ihre Buchung ist bestätigt',
   'Hallo {{name}}, wir freuen uns, Ihre Buchung zu bestätigen. Wir haben Ihnen den Raum {{resource}} reserviert.',
   'Wir freuen uns auf Ihren Besuch im Business Village.'),
  ('request_confirmed', 'en', 'Your booking {{reference}} is confirmed', 'Your booking is confirmed',
   'Hello {{name}}, we are happy to confirm your booking. We have reserved {{resource}} for you.',
   'We look forward to welcoming you at Business Village.'),
  ('request_rejected', 'de', 'Ihre Buchungsanfrage {{reference}}', 'Leider können wir Ihre Anfrage nicht bestätigen',
   'Hallo {{name}}, leider können wir Ihre Buchungsanfrage für den gewünschten Termin nicht bestätigen.',
   'Gerne helfen wir Ihnen bei einem anderen Termin weiter. Antworten Sie einfach auf diese E-Mail.'),
  ('request_rejected', 'en', 'Your booking request {{reference}}', 'Unfortunately we cannot confirm your request',
   'Hello {{name}}, unfortunately we are unable to confirm your booking request for the requested time.',
   'We would be happy to help you find another date. Simply reply to this email.'),
  ('request_cancelled', 'de', 'Ihre Buchung {{reference}} wurde storniert', 'Buchung storniert',
   'Hallo {{name}}, Ihre Buchung bzw. Buchungsanfrage wurde storniert.',
   'Bei Fragen antworten Sie einfach auf diese E-Mail.'),
  ('request_cancelled', 'en', 'Your booking {{reference}} has been cancelled', 'Booking cancelled',
   'Hello {{name}}, your booking or booking request has been cancelled.',
   'If you have any questions, simply reply to this email.'),
  ('request_alternative', 'de', 'Alternativer Termin für Ihre Anfrage {{reference}}', 'Wir schlagen Ihnen einen anderen Termin vor',
   'Hallo {{name}}, der gewünschte Termin ist leider nicht verfügbar. Wir können Ihnen stattdessen den folgenden Termin anbieten.',
   'Bitte antworten Sie auf diese E-Mail, wenn der Termin für Sie passt. Wir bestätigen die Buchung dann umgehend.'),
  ('request_alternative', 'en', 'Alternative date for your request {{reference}}', 'We suggest an alternative date',
   'Hello {{name}}, unfortunately the requested time is not available. We can offer you the following alternative instead.',
   'Please reply to this email if the alternative suits you, and we will confirm your booking right away.'),
  ('request_message', 'de', 'Nachricht zu Ihrer Buchungsanfrage {{reference}}', 'Nachricht zu Ihrer Anfrage',
   'Hallo {{name}}, wir haben eine Nachricht zu Ihrer Buchungsanfrage für Sie:', 'Sie können einfach auf diese E-Mail antworten.'),
  ('request_message', 'en', 'Message about your booking request {{reference}}', 'Message about your request',
   'Hello {{name}}, we have a message about your booking request:', 'You can simply reply to this email.')
on conflict (template_key, locale) do nothing;

-- ---------------------------------------------------------------------------
-- Navigation: "Preise / Pricing" next to the meeting rooms
-- ---------------------------------------------------------------------------
do $$
declare
  m text;
  pos integer;
begin
  if not exists (select 1 from public.navigation_items) then
    return;
  end if;
  foreach m in array array['header', 'footer'] loop
    if exists (select 1 from public.navigation_items where menu = m and href = '/pricing') then
      continue;
    end if;
    select display_order into pos from public.navigation_items where menu = m and href = '/meeting-rooms' limit 1;
    if pos is null then
      select coalesce(max(display_order), 0) into pos from public.navigation_items where menu = m;
    end if;
    update public.navigation_items set display_order = display_order + 1 where menu = m and display_order > pos;
    insert into public.navigation_items (menu, label_de, label_en, href, display_order)
    values (m, 'Preise', 'Pricing', '/pricing', pos + 1);
  end loop;
end;
$$;
