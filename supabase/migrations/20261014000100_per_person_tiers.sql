-- Pricing follows the Business Village price sheet:
-- * Meeting rooms up to 10 people: the tier price is per person for the whole
--   booking (5 people × 4 hours = 5 × 25 € = 125 €), not an hourly rate. A flag
--   keeps "rate × hours" available for other hourly packages.
-- * From 10 people a whole room can be rented at a flat price instead
--   ("Ab 10 Pax pauschale Raummiete"); Blauer and Grüner Raum take 1–2 extra people.
-- * The calculator starts with a choice of what to book: a meeting room, the
--   event stairs or the entire venue (Komplett BV).
alter table public.pricing_packages
  add column if not exists tier_price_per_person boolean not null default false,
  add column if not exists category text not null default 'meeting'
    check (category in ('meeting', 'stairs', 'venue'));

update public.pricing_packages
   set tier_price_per_person = true,
       description_de = 'Preis pro Person nach Buchungsdauer. Jede weitere Stunde über 8 Stunden kostet 1 € pro Person mehr.',
       description_en = 'Price per person by booking length. Each hour beyond 8 hours costs €1 more per person.'
 where slug = 'meeting-room-hourly';

update public.pricing_packages set active = true, min_participants = 10, max_participants = 12,
       description_de = 'Ganzer Raum für 10 Personen, 1–2 weitere Personen möglich.',
       description_en = 'Whole room for 10 people, 1–2 extra people possible.'
 where slug = 'blauer-raum';
update public.pricing_packages set active = true, min_participants = 10,
       description_de = 'Ganzer Raum für bis zu 20 Personen.', description_en = 'Whole room for up to 20 people.'
 where slug = 'roter-maxi';
update public.pricing_packages set active = true, min_participants = 10, max_participants = 42,
       description_de = 'Ganzer Raum für 40 Personen, 1–2 weitere Personen möglich.',
       description_en = 'Whole room for 40 people, 1–2 extra people possible.'
 where slug = 'gruener-raum';

update public.pricing_packages set category = 'stairs', active = true where slug = 'treppe-event';
update public.pricing_packages set category = 'venue', active = true,
       description_de = 'Treppe und alle Räume exklusiv. Ab 41 Personen 10 € je weitere Person.',
       description_en = 'The stairs and all rooms exclusively. From the 41st person, €10 per additional person.'
 where slug = 'komplett-business-village';
