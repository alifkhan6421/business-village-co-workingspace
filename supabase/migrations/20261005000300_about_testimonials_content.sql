-- Content for the design refresh: an "About us" page, an (inactive) testimonials
-- section on the home page to fill with real quotes, and header navigation
-- Home · Coworking · Meeting rooms · Amenities · About us · Contact.
-- Safe to run more than once.
do $$
declare
  v_home uuid;
  v_about uuid;
  v_sec uuid;
begin
  select id into v_home from public.pages where slug = 'home';

  -- Testimonials on the home page, before the FAQ, switched off until real quotes are entered.
  if v_home is not null and not exists (
    select 1 from public.page_sections where page_id = v_home and section_type = 'testimonials'
  ) then
    update public.page_sections set display_order = display_order + 1
      where page_id = v_home and display_order >= coalesce(
        (select display_order from public.page_sections where page_id = v_home and section_type = 'faq' limit 1), 1000);
    insert into public.page_sections (page_id, section_type, display_order, active)
      values (v_home, 'testimonials', coalesce(
        (select display_order - 1 from public.page_sections where page_id = v_home and section_type = 'faq' limit 1), 1000), false)
      returning id into v_sec;
    insert into public.page_section_translations (section_id, locale, title, subtitle, data) values
      (v_sec, 'de', 'Das sagen unsere Mitglieder', 'Echte Stimmen aus dem Business Village.',
        '{"items": [{"quote": "Hier steht das Zitat eines Kunden. Bitte in der Verwaltung durch echte Kundenstimmen ersetzen.", "name": "Name", "role": "Firma"}]}'),
      (v_sec, 'en', 'What our members say', 'Real voices from Business Village.',
        '{"items": [{"quote": "A customer quote goes here. Please replace it with real testimonials in the admin area.", "name": "Name", "role": "Company"}]}');
  end if;

  -- About us page.
  if not exists (select 1 from public.pages where slug = 'about') then
    insert into public.pages (slug, page_type, status, published_at) values ('about', 'standard', 'published', now())
      returning id into v_about;
    insert into public.page_translations (page_id, locale, title, seo_title, seo_description) values
      (v_about, 'de', 'Über uns', 'Über uns – Business Village', 'Wer wir sind und warum Business Village der richtige Ort für Ihre Arbeit ist.'),
      (v_about, 'en', 'About us', 'About us – Business Village', 'Who we are and why Business Village is the right place for your work.');

    insert into public.page_sections (page_id, section_type, display_order, settings)
      values (v_about, 'page_header', 1, '{"cta_href": "/coworking"}') returning id into v_sec;
    insert into public.page_section_translations (section_id, locale, title, subtitle, data) values
      (v_sec, 'de', 'Über Business Village', 'Flexible Arbeitsplätze und Besprechungsräume für Selbstständige, Teams und Unternehmen.', '{"cta_label": "Räume ansehen"}'),
      (v_sec, 'en', 'About Business Village', 'Flexible workspaces and meeting rooms for freelancers, teams and companies.', '{"cta_label": "Explore spaces"}');

    insert into public.page_sections (page_id, section_type, display_order, settings)
      values (v_about, 'image_text', 2, '{"image_position": "right"}') returning id into v_sec;
    insert into public.page_section_translations (section_id, locale, title, content) values
      (v_sec, 'de', 'Unsere Idee', '<p>Business Village ist ein Ort zum konzentrierten Arbeiten und für gute Begegnungen. Ob Sie einen Schreibtisch für einen Tag brauchen oder einen Raum für Ihr Team: Sie buchen online, kommen vorbei und legen los.</p><p>Diesen Text können Sie in der Verwaltung unter Website › Seiten › Über uns anpassen.</p>'),
      (v_sec, 'en', 'Our idea', '<p>Business Village is a place for focused work and good conversations. Whether you need a desk for a day or a room for your team: book online, come by and get started.</p><p>You can edit this text in the admin area under Website › Pages › About us.</p>');

    -- "Why choose us": same cards as on the home page.
    insert into public.page_sections (page_id, section_type, display_order) values (v_about, 'features', 3) returning id into v_sec;
    insert into public.page_section_translations (section_id, locale, title, subtitle, data)
      select v_sec, t.locale, t.title, t.subtitle, t.data
      from public.page_section_translations t
      join public.page_sections s on s.id = t.section_id
      where s.page_id = v_home and s.section_type = 'features'
      order by s.display_order limit 2;

    insert into public.page_sections (page_id, section_type, display_order, settings)
      values (v_about, 'cta', 4, '{"variant": "contact", "button_href": "/contact", "show_address": true}') returning id into v_sec;
    insert into public.page_section_translations (section_id, locale, title, subtitle, data) values
      (v_sec, 'de', 'Besuchen Sie uns', 'Wir zeigen Ihnen gerne unsere Räume.', '{"button_label": "Kontakt aufnehmen"}'),
      (v_sec, 'en', 'Visit us', 'We are happy to show you around.', '{"button_label": "Get in touch"}');
  end if;

  -- Header: add "About us" before Contact; "How it works" stays in the footer.
  if not exists (select 1 from public.navigation_items where menu = 'header' and href = '/p/about') then
    update public.navigation_items set display_order = display_order + 1
      where menu = 'header' and href = '/contact';
    insert into public.navigation_items (menu, label_de, label_en, href, display_order)
      values ('header', 'Über uns', 'About us', '/p/about',
        coalesce((select display_order - 1 from public.navigation_items where menu = 'header' and href = '/contact' limit 1), 99));
    update public.navigation_items set active = false where menu = 'header' and href = '/how-it-works';
  end if;
  if not exists (select 1 from public.navigation_items where menu = 'footer' and href = '/p/about') then
    insert into public.navigation_items (menu, label_de, label_en, href, display_order)
      values ('footer', 'Über uns', 'About us', '/p/about',
        coalesce((select max(display_order) + 1 from public.navigation_items where menu = 'footer'), 99));
  end if;
end $$;
