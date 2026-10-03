-- Business Village demo data (amenities, workspaces, meeting rooms, guest
-- bookings, announcements). Runs on `supabase db reset` locally and can be
-- applied to a hosted project with `supabase db push --include-seed`.
-- Demo user accounts, images and member bookings are created by
-- `npm run seed:demo` (scripts/seed-demo.ts), which uses the Auth + Storage APIs.

do $seed$
declare
  a record;
  ws record;
  rm record;
  g1 uuid;
  g2 uuid;
  d1 date;
  d2 date;
begin
  if exists (select 1 from public.amenities) then
    raise notice 'Demo data already present, skipping';
    return;
  end if;

  -- Amenities ---------------------------------------------------------------
  insert into public.amenities (slug, icon, amenity_type, display_order) values
    ('wifi', 'wifi', 'general', 1),
    ('monitor', 'monitor', 'workspace', 2),
    ('docking-station', 'plug', 'workspace', 3),
    ('standing-desk', 'arrow-up-down', 'workspace', 4),
    ('whiteboard', 'presentation', 'room', 5),
    ('tv', 'tv', 'room', 6),
    ('projector', 'projector', 'room', 7),
    ('video-conferencing', 'video', 'room', 8),
    ('air-conditioning', 'air-vent', 'general', 9),
    ('wheelchair-accessible', 'accessibility', 'general', 10);

  insert into public.amenity_translations (amenity_id, locale, name, description)
  select am.id, t.locale, t.name, t.description
    from public.amenities am
    join (values
      ('wifi', 'de', 'WLAN', 'Schnelles, stabiles WLAN im gesamten Gebäude.'),
      ('wifi', 'en', 'Wi-Fi', 'Fast, reliable Wi-Fi throughout the building.'),
      ('monitor', 'de', 'Monitor', 'Externer 27-Zoll-Monitor am Arbeitsplatz.'),
      ('monitor', 'en', 'Monitor', 'External 27-inch monitor at the desk.'),
      ('docking-station', 'de', 'Dockingstation', 'USB-C-Dockingstation für Laptop, Monitor und Peripherie.'),
      ('docking-station', 'en', 'Docking Station', 'USB-C docking station for laptop, monitor and peripherals.'),
      ('standing-desk', 'de', 'Höhenverstellbarer Schreibtisch', 'Elektrisch höhenverstellbar für Arbeiten im Sitzen und Stehen.'),
      ('standing-desk', 'en', 'Standing Desk', 'Electrically height-adjustable for sitting and standing.'),
      ('whiteboard', 'de', 'Whiteboard', 'Großes Whiteboard mit Stiften.'),
      ('whiteboard', 'en', 'Whiteboard', 'Large whiteboard with markers.'),
      ('tv', 'de', 'TV-Bildschirm', 'Großer Bildschirm für Präsentationen.'),
      ('tv', 'en', 'TV', 'Large screen for presentations.'),
      ('projector', 'de', 'Beamer', 'Beamer mit HDMI- und USB-C-Anschluss.'),
      ('projector', 'en', 'Projector', 'Projector with HDMI and USB-C input.'),
      ('video-conferencing', 'de', 'Videokonferenz', 'Kamera, Mikrofon und Lautsprecher für hybride Meetings.'),
      ('video-conferencing', 'en', 'Video Conferencing', 'Camera, microphone and speakers for hybrid meetings.'),
      ('air-conditioning', 'de', 'Klimaanlage', 'Angenehmes Raumklima auch im Sommer.'),
      ('air-conditioning', 'en', 'Air Conditioning', 'A comfortable climate even in summer.'),
      ('wheelchair-accessible', 'de', 'Barrierefrei', 'Stufenloser Zugang und Aufzug.'),
      ('wheelchair-accessible', 'en', 'Wheelchair Accessible', 'Step-free access and elevator.')
    ) as t(slug, locale, name, description) on t.slug = am.slug;

  -- Workspaces --------------------------------------------------------------
  insert into public.workspaces (name, slug, desk_number, floor, zone, capacity, display_order, featured,
    short_description_de, short_description_en, full_description_de, full_description_en)
  select v.name, lower(v.name), v.name, v.floor, v.zone, 1, v.ord, v.featured,
    v.sd_de, v.sd_en,
    '<p>' || v.sd_de || '</p><p>Der Arbeitsplatz ist mit ergonomischem Stuhl, Steckdosen und schnellem WLAN ausgestattet. Kaffee und Wasser stehen in der Gemeinschaftsküche bereit.</p>',
    '<p>' || v.sd_en || '</p><p>The desk comes with an ergonomic chair, power outlets and fast Wi-Fi. Coffee and water are available in the shared kitchen.</p>'
  from (values
    ('A-01', '1. OG', 'Zone A – Fensterseite', 1, true,
      'Heller Fensterplatz mit Blick ins Grüne und höhenverstellbarem Schreibtisch.',
      'Bright window desk with a view of the greenery and a standing desk.'),
    ('A-02', '1. OG', 'Zone A – Fensterseite', 2, true,
      'Ruhiger Fensterplatz mit großem Monitor und Dockingstation.',
      'Quiet window desk with a large monitor and docking station.'),
    ('A-03', '1. OG', 'Zone A – Fensterseite', 3, false,
      'Komfortabler Arbeitsplatz mit Tageslicht – ideal für konzentriertes Arbeiten.',
      'Comfortable desk with daylight – ideal for focused work.'),
    ('A-04', '1. OG', 'Zone A – Fensterseite', 4, false,
      'Fensterplatz mit zwei Monitoren für umfangreiche Projekte.',
      'Window desk with dual monitors for larger projects.'),
    ('B-01', '1. OG', 'Zone B – Ruhebereich', 5, true,
      'Arbeitsplatz im Ruhebereich, perfekt für Telefon-freie Fokuszeit.',
      'Desk in the quiet area, perfect for phone-free focus time.'),
    ('B-02', '1. OG', 'Zone B – Ruhebereich', 6, false,
      'Ruhiger Platz mit Monitor, nahe der Kaffeeküche.',
      'Quiet desk with monitor, close to the kitchen.'),
    ('B-03', '1. OG', 'Zone B – Ruhebereich', 7, false,
      'Kompakter Arbeitsplatz mit Dockingstation.',
      'Compact desk with docking station.'),
    ('B-04', '1. OG', 'Zone B – Ruhebereich', 8, true,
      'Eckplatz mit viel Ablagefläche und höhenverstellbarem Tisch.',
      'Corner desk with plenty of space and a standing desk.')
  ) as v(name, floor, zone, ord, featured, sd_de, sd_en);

  insert into public.workspace_amenities (workspace_id, amenity_id)
  select w.id, am.id from public.workspaces w join public.amenities am on
    am.slug in ('wifi', 'air-conditioning', 'wheelchair-accessible')
    or (am.slug = 'monitor' and w.name in ('A-02', 'A-04', 'B-02', 'B-04'))
    or (am.slug = 'docking-station' and w.name in ('A-02', 'A-04', 'B-03', 'B-04'))
    or (am.slug = 'standing-desk' and w.name in ('A-01', 'B-04'));

  -- Meeting rooms -----------------------------------------------------------
  insert into public.rooms (name, slug, floor, capacity, display_order, featured,
    short_description_de, short_description_en, full_description_de, full_description_en)
  values
    ('Berlin Room', 'berlin-room', 'EG', 10, 1, true,
      'Großer Besprechungsraum für bis zu 10 Personen – ideal für Workshops und Präsentationen.',
      'Large meeting room for up to 10 people – ideal for workshops and presentations.',
      '<p>Der Berlin Room ist unser größter Besprechungsraum. Mit Beamer, großem Whiteboard und Videokonferenztechnik eignet er sich für Workshops, Schulungen und Kundenpräsentationen.</p>',
      '<p>The Berlin Room is our largest meeting room. With a projector, large whiteboard and video conferencing it is suited to workshops, training sessions and client presentations.</p>'),
    ('Munich Room', 'munich-room', 'EG', 6, 2, true,
      'Heller Raum für Teammeetings mit bis zu 6 Personen.',
      'Bright room for team meetings of up to 6 people.',
      '<p>Der Munich Room bietet Platz für sechs Personen und ist mit TV-Bildschirm und Whiteboard ausgestattet – perfekt für Teammeetings.</p>',
      '<p>The Munich Room seats six people and comes with a TV screen and whiteboard – perfect for team meetings.</p>'),
    ('Hamburg Room', 'hamburg-room', '1. OG', 8, 3, true,
      'Hybrid-Meetingraum mit moderner Videokonferenztechnik.',
      'Hybrid meeting room with modern video conferencing.',
      '<p>Im Hamburg Room verbinden Sie Teilnehmende vor Ort und remote: Kamera, Raummikrofon und großer Bildschirm sind fest installiert.</p>',
      '<p>The Hamburg Room connects on-site and remote participants: camera, room microphone and a large screen are permanently installed.</p>'),
    ('Focus Room', 'focus-room', '1. OG', 2, 4, false,
      'Kleiner Rückzugsraum für Telefonate und Gespräche zu zweit.',
      'Small retreat for calls and one-on-one conversations.',
      '<p>Der Focus Room ist ein ruhiger Raum für vertrauliche Gespräche, Bewerbungsgespräche oder Videocalls.</p>',
      '<p>The Focus Room is a quiet space for confidential conversations, interviews or video calls.</p>');

  insert into public.room_amenities (room_id, amenity_id)
  select r.id, am.id from public.rooms r join public.amenities am on
    am.slug in ('wifi', 'air-conditioning')
    or (am.slug = 'whiteboard' and r.slug in ('berlin-room', 'munich-room', 'hamburg-room'))
    or (am.slug = 'projector' and r.slug = 'berlin-room')
    or (am.slug = 'tv' and r.slug in ('munich-room', 'hamburg-room', 'focus-room'))
    or (am.slug = 'video-conferencing' and r.slug in ('berlin-room', 'hamburg-room', 'focus-room'))
    or (am.slug = 'wheelchair-accessible' and r.slug in ('berlin-room', 'munich-room'));

  -- Guest bookings on the next two weekdays --------------------------------
  select min(d)::date into d1 from generate_series(current_date + 1, current_date + 7, interval '1 day') d
   where extract(isodow from d) between 1 and 5;
  select min(d)::date into d2 from generate_series(d1 + 1, d1 + 7, interval '1 day') d
   where extract(isodow from d) between 1 and 5;

  insert into public.guests (first_name, last_name, email, company, locale)
  values ('Lena', 'Hoffmann', 'lena.hoffmann@example.com', 'Hoffmann Consulting', 'de') returning id into g1;
  insert into public.guests (first_name, last_name, email, company, locale)
  values ('James', 'Carter', 'james.carter@example.com', null, 'en') returning id into g2;

  select id into rm from public.rooms where slug = 'munich-room';
  insert into public.bookings (booking_reference, booking_type, guest_id, room_id, start_at, end_at, attendees, purpose, status, source, locale)
  values ('BV-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.booking_reference_seq')::text, 6, '0'),
          'room', g1, rm.id,
          (d1 + time '09:00') at time zone 'Europe/Berlin', (d1 + time '11:00') at time zone 'Europe/Berlin',
          4, 'Kundenworkshop', 'confirmed', 'guest', 'de');

  select id into ws from public.workspaces where name = 'A-02';
  insert into public.bookings (booking_reference, booking_type, guest_id, workspace_id, start_at, end_at, attendees, status, source, locale)
  values ('BV-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.booking_reference_seq')::text, 6, '0'),
          'workspace', g2, ws.id,
          (d2 + time '08:00') at time zone 'Europe/Berlin', (d2 + time '17:00') at time zone 'Europe/Berlin',
          1, 'confirmed', 'guest', 'en');

  -- Maintenance block -------------------------------------------------------
  select id into ws from public.workspaces where name = 'B-03';
  insert into public.resource_blocks (resource_type, workspace_id, start_at, end_at, reason, note)
  values ('workspace', ws.id, (d1 + time '07:00') at time zone 'Europe/Berlin', (d1 + time '13:00') at time zone 'Europe/Berlin',
          'maintenance', 'Neuer Monitor wird installiert');

  -- Announcements -----------------------------------------------------------
  insert into public.announcements (title_de, title_en, content_de, content_en, publish_at)
  values
    ('Neue Videokonferenztechnik im Hamburg Room', 'New video conferencing in the Hamburg Room',
     'Ab sofort ist der Hamburg Room mit neuer Kamera und Raummikrofon ausgestattet. Ideal für hybride Meetings!',
     'The Hamburg Room now has a new camera and room microphone. Ideal for hybrid meetings!', now() - interval '1 day'),
    ('Kaffeeküche: neue Kaffeemaschine', 'Kitchen: new coffee machine',
     'In der Gemeinschaftsküche im 1. OG steht ab dieser Woche eine neue Siebträgermaschine für Sie bereit.',
     'A new espresso machine is now available in the shared kitchen on the first floor.', now() - interval '2 hours');
end
$seed$;
