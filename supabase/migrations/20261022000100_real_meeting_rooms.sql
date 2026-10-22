-- The five real Business Village meeting rooms. Every other room is hidden from
-- the public site (not deleted), so existing bookings stay intact.
-- Photos ship with the site (public/images/rooms, see src/lib/stock-photos.ts)
-- and are shown until an admin uploads photos for a room.
-- Safe to run more than once.

insert into public.amenities (slug, icon, amenity_type, display_order)
values ('air-purifier', 'air-vent', 'room', 9), ('flexible-seating', 'layout-grid', 'room', 10)
on conflict (slug) do nothing;

insert into public.amenity_translations (amenity_id, locale, name)
select a.id, v.locale, v.name
from (values
  ('air-purifier', 'de', 'Luftreinigung'), ('air-purifier', 'en', 'Air purification'),
  ('flexible-seating', 'de', 'Flexible Bestuhlung'), ('flexible-seating', 'en', 'Flexible seating')
) as v (slug, locale, name)
join public.amenities a on a.slug = v.slug
on conflict (amenity_id, locale) do nothing;

insert into public.rooms (name, slug, capacity, display_order, featured, public_visible, status,
  short_description_de, short_description_en, full_description_de, full_description_en)
values
  ('Cube', 'cube', 4, 1, true, true, 'available',
    'Kleiner Besprechungsraum (9 m²) für bis zu 4 Personen, mit Flachbildschirm und Luftreinigung.',
    'Small meeting room (9 m²) for up to 4 people, with a flat-screen display and air purification.',
    '<p>Der Cube ist ein kleiner Besprechungsraum mit 9 m² für bis zu 4 Personen. Er ist mit einem Flachbildschirm und einem integrierten Luftreinigungssystem ausgestattet.</p>',
    '<p>The Cube is a small 9 m² meeting room for up to 4 people. It is equipped with a flat-screen display and an integrated air purification system.</p>'),
  ('Red Mini', 'red-mini', 6, 2, true, true, 'available',
    'Voll ausgestatteter Besprechungsraum (18,5 m²) für bis zu 6 Personen, mit Flachbildschirm.',
    'Fully equipped meeting room (18.5 m²) for up to 6 people, with a flat-screen display.',
    '<p>Der Red Mini ist ein voll ausgestatteter Besprechungsraum mit 18,5 m² für bis zu 6 Personen. Ein Flachbildschirm ist vorhanden.</p>',
    '<p>The Red Mini is a fully equipped 18.5 m² meeting room for up to 6 people. It includes a flat-screen display.</p>'),
  ('Blue Room', 'blue-room', 10, 3, true, true, 'available',
    'Voll ausgestatteter Besprechungsraum (38 m²) für bis zu 10 Personen, mit großem Flachbildschirm.',
    'Fully equipped meeting room (38 m²) for up to 10 people, with a large flat-screen display.',
    '<p>Der Blue Room ist ein voll ausgestatteter Besprechungsraum mit 38 m². Er bietet Platz für bis zu 10 Personen und verfügt über einen großen Flachbildschirm.</p>',
    '<p>The Blue Room is a fully equipped 38 m² meeting room. It accommodates up to 10 people and includes a large flat-screen display.</p>'),
  ('Red Maxi', 'red-maxi', 18, 4, true, true, 'available',
    'Großer Besprechungsraum (37 m²) für bis zu 18 Personen, mit 2 Flachbildschirmen, teilbar in zwei Räume.',
    'Large meeting room (37 m²) for up to 18 people, with 2 flat-screen displays, divisible into two rooms.',
    '<p>Der Red Maxi ist ein großer Besprechungsraum mit 37 m² für bis zu 18 Personen. Er ist voll ausgestattet mit 2 Flachbildschirmen und mobilen Tischen. Der Raum lässt sich flexibel in zwei separate Räume teilen.</p>',
    '<p>The Red Maxi is a large 37 m² meeting room with a capacity of up to 18 people. It is fully equipped with 2 flat-screen displays and mobile tables, and the space can be flexibly divided into two separate rooms.</p>'),
  ('Green Room', 'green-room', 68, 5, true, true, 'available',
    'Raum für Symposien, Seminare und Konferenzen (90 m²) für bis zu 68 Personen, mit 3D-Leinwand (4 × 4 m) und Beamer.',
    'Space for symposiums, seminars and conferences (90 m²) for up to 68 people, with a 3D projection screen (4 × 4 m) and projector.',
    '<p>Der Green Room bietet auf 90 m² Platz für bis zu 68 Personen und ist speziell für Symposien, Seminare, Konferenzen und Meetings ausgestattet. Flexible Bestuhlung ist möglich, dazu kommen eine 3D-Projektionsleinwand (4 × 4 Meter) und ein Beamer.</p>',
    '<p>The Green Room offers 90 m² for up to 68 people and is specially equipped for symposiums, seminars, conferences and meetings. Flexible seating arrangements are available, along with a 3D projection screen (4 × 4 meters) and a projector.</p>')
on conflict (slug) do update set
  name = excluded.name,
  capacity = excluded.capacity,
  display_order = excluded.display_order,
  featured = excluded.featured,
  public_visible = excluded.public_visible,
  short_description_de = excluded.short_description_de,
  short_description_en = excluded.short_description_en,
  full_description_de = excluded.full_description_de,
  full_description_en = excluded.full_description_en;

insert into public.room_amenities (room_id, amenity_id)
select r.id, a.id
from (values
  ('cube', 'tv'), ('cube', 'air-purifier'), ('cube', 'wifi'),
  ('red-mini', 'tv'), ('red-mini', 'wifi'),
  ('blue-room', 'tv'), ('blue-room', 'wifi'),
  ('red-maxi', 'tv'), ('red-maxi', 'flexible-seating'), ('red-maxi', 'wifi'),
  ('green-room', 'projector'), ('green-room', 'flexible-seating'), ('green-room', 'wifi')
) as v (room_slug, amenity_slug)
join public.rooms r on r.slug = v.room_slug
join public.amenities a on a.slug = v.amenity_slug
on conflict do nothing;

-- Hide every other room from the public site. Rows and their bookings are kept;
-- admins still see them and can switch them back on.
update public.rooms
set public_visible = false, featured = false
where slug not in ('cube', 'red-mini', 'blue-room', 'red-maxi', 'green-room');
