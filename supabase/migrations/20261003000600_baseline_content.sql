-- Business Village: baseline CMS structure and default bilingual content.
-- Everything here is editable from the admin panel afterwards. Uses
-- "on conflict do nothing" so it never overwrites edited production content.

insert into public.site_settings (
  id, company_name, company_legal_name, address_line_1, postcode, city, country,
  phone, general_email, booking_email, support_email,
  opening_hours_de, opening_hours_en,
  footer_description_de, footer_description_en,
  footer_copyright_de, footer_copyright_en,
  default_seo_title_de, default_seo_title_en,
  default_seo_description_de, default_seo_description_en,
  social_links
) values (
  1, 'Business Village', 'Business Village (bitte rechtlichen Namen eintragen)', 'Musterstraße 1', '12345', 'Musterstadt', 'Deutschland',
  '+49 000 0000000', 'info@business-village.de', 'booking@business-village.de', 'support@business-village.de',
  E'Montag – Freitag: 08:00 – 20:00 Uhr\nSamstag und Sonntag: geschlossen',
  E'Monday – Friday: 8:00 am – 8:00 pm\nSaturday and Sunday: closed',
  'Flexible Arbeitsplätze und Besprechungsräume für Selbstständige, Teams und Unternehmen.',
  'Flexible workspaces and meeting rooms for freelancers, teams and companies.',
  '© {year} Business Village. Alle Rechte vorbehalten.',
  '© {year} Business Village. All rights reserved.',
  'Business Village – Coworking und Besprechungsräume',
  'Business Village – Coworking and meeting rooms',
  'Arbeitsplätze und Besprechungsräume flexibel online buchen – im Business Village.',
  'Book workspaces and meeting rooms flexibly online at Business Village.',
  '[]'::jsonb
) on conflict (id) do nothing;

insert into public.private_settings (id, contact_destination_email)
values (1, 'info@business-village.de')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Navigation
-- ---------------------------------------------------------------------------
insert into public.navigation_items (menu, label_de, label_en, href, display_order)
select * from (values
  ('header', 'Startseite', 'Home', '/', 1),
  ('header', 'Coworking', 'Coworking', '/coworking', 2),
  ('header', 'Besprechungsräume', 'Meeting Rooms', '/meeting-rooms', 3),
  ('header', 'Ausstattung', 'Amenities', '/amenities', 4),
  ('header', 'So funktioniert es', 'How It Works', '/how-it-works', 5),
  ('header', 'Kontakt', 'Contact', '/contact', 6),
  ('footer', 'Coworking', 'Coworking', '/coworking', 1),
  ('footer', 'Besprechungsräume', 'Meeting Rooms', '/meeting-rooms', 2),
  ('footer', 'Ausstattung', 'Amenities', '/amenities', 3),
  ('footer', 'So funktioniert es', 'How It Works', '/how-it-works', 4),
  ('footer', 'Kontakt', 'Contact', '/contact', 5),
  ('legal', 'Impressum', 'Imprint / Legal Notice', '/imprint', 1),
  ('legal', 'Datenschutz', 'Privacy Policy', '/privacy', 2),
  ('legal', 'AGB', 'Terms', '/terms', 3)
) as v(menu, label_de, label_en, href, display_order)
where not exists (select 1 from public.navigation_items);

-- ---------------------------------------------------------------------------
-- Pages + sections (helper functions dropped at the end)
-- ---------------------------------------------------------------------------
create or replace function private.seed_page(
  p_slug text, p_type text,
  p_title_de text, p_title_en text,
  p_seo_title_de text, p_seo_title_en text,
  p_seo_desc_de text, p_seo_desc_en text
) returns uuid language plpgsql as $$
declare pid uuid;
begin
  select id into pid from public.pages where slug = p_slug;
  if pid is not null then
    return null; -- already exists: never overwrite
  end if;
  insert into public.pages (slug, page_type, status, is_system, published_at)
  values (p_slug, p_type, 'published', true, now()) returning id into pid;
  insert into public.page_translations (page_id, locale, title, seo_title, seo_description)
  values (pid, 'de', p_title_de, p_seo_title_de, p_seo_desc_de),
         (pid, 'en', p_title_en, p_seo_title_en, p_seo_desc_en);
  return pid;
end; $$;

create or replace function private.seed_section(
  p_page uuid, p_type text, p_order int, p_settings jsonb,
  p_title_de text, p_subtitle_de text, p_content_de text, p_data_de jsonb,
  p_title_en text, p_subtitle_en text, p_content_en text, p_data_en jsonb
) returns void language plpgsql as $$
declare sid uuid;
begin
  if p_page is null then return; end if;
  insert into public.page_sections (page_id, section_type, settings, display_order)
  values (p_page, p_type, coalesce(p_settings, '{}'), p_order) returning id into sid;
  insert into public.page_section_translations (section_id, locale, title, subtitle, content, data)
  values (sid, 'de', coalesce(p_title_de, ''), coalesce(p_subtitle_de, ''), coalesce(p_content_de, ''), coalesce(p_data_de, '{}')),
         (sid, 'en', coalesce(p_title_en, ''), coalesce(p_subtitle_en, ''), coalesce(p_content_en, ''), coalesce(p_data_en, '{}'));
end; $$;

do $seed$
declare
  pid uuid;
  steps_de jsonb := '[
    {"icon":"layout-grid","title":"Arbeitsplatz wählen","text":"Wählen Sie einen Coworking-Arbeitsplatz oder einen Besprechungsraum, der zu Ihnen passt."},
    {"icon":"calendar-days","title":"Datum und Uhrzeit auswählen","text":"Im Kalender sehen Sie sofort, welche Zeiten frei sind."},
    {"icon":"mouse-pointer-click","title":"Buchen","text":"Buchen Sie als Gast mit Ihrer E-Mail-Adresse oder mit Ihrem Mitgliedskonto."},
    {"icon":"mail-check","title":"Bestätigung erhalten","text":"Sie erhalten sofort eine Bestätigung mit Ihrer Buchungsnummer per E-Mail."},
    {"icon":"settings-2","title":"Buchung verwalten","text":"Über den Link in der E-Mail oder unter „Meine Buchungen“ können Sie Ihre Buchung jederzeit einsehen oder stornieren."}
  ]';
  steps_en jsonb := '[
    {"icon":"layout-grid","title":"Choose a workspace","text":"Pick a coworking desk or a meeting room that suits you."},
    {"icon":"calendar-days","title":"Pick a date and time","text":"The calendar shows you right away which times are free."},
    {"icon":"mouse-pointer-click","title":"Book","text":"Book as a guest with your email address or with your member account."},
    {"icon":"mail-check","title":"Receive confirmation","text":"You instantly receive a confirmation email with your booking reference."},
    {"icon":"settings-2","title":"Manage your booking","text":"Use the link in the email or \"My Bookings\" to view or cancel your booking at any time."}
  ]';
  faq_de jsonb := '[
    {"question":"Muss ich mich registrieren, um zu buchen?","answer":"Nein. Sie können als Gast nur mit Ihrer E-Mail-Adresse buchen. Mit einem Mitgliedskonto haben Sie alle Buchungen an einem Ort im Blick."},
    {"question":"Kann ich eine Buchung stornieren?","answer":"Ja. Über den Link in Ihrer Bestätigungs-E-Mail oder unter „Meine Buchungen“ können Sie bis kurz vor Beginn stornieren."},
    {"question":"Was ist im Arbeitsplatz enthalten?","answer":"WLAN, Strom, Zugang zur Kaffeeküche und – je nach Platz – Monitor und Dockingstation. Die genaue Ausstattung finden Sie auf jeder Detailseite."},
    {"question":"Wie erreiche ich Sie bei Fragen?","answer":"Schreiben Sie uns über das Kontaktformular oder rufen Sie uns während der Öffnungszeiten an."}
  ]';
  faq_en jsonb := '[
    {"question":"Do I need an account to book?","answer":"No. You can book as a guest with just your email address. A member account keeps all your bookings in one place."},
    {"question":"Can I cancel a booking?","answer":"Yes. Use the link in your confirmation email or \"My Bookings\" to cancel up until shortly before the start time."},
    {"question":"What is included with a workspace?","answer":"Wi-Fi, power, access to the kitchen and – depending on the desk – a monitor and docking station. Each detail page lists the exact amenities."},
    {"question":"How can I reach you with questions?","answer":"Send us a message through the contact form or give us a call during opening hours."}
  ]';
begin
  -- Home ---------------------------------------------------------------------
  pid := private.seed_page('home', 'landing', 'Startseite', 'Home',
    'Business Village – Coworking und Besprechungsräume', 'Business Village – Coworking and meeting rooms',
    'Flexible Arbeitsplätze und Besprechungsräume stunden- oder tageweise online buchen.',
    'Book flexible workspaces and meeting rooms online by the hour or by the day.');
  perform private.seed_section(pid, 'hero', 1, '{"primary_href":"/coworking","secondary_href":"/meeting-rooms"}',
    'Flexible Arbeitsplätze für Ihr Unternehmen',
    'Coworking-Arbeitsplätze und Besprechungsräume im Business Village – stunden- oder tageweise buchbar, ohne langfristige Bindung.',
    '', '{"primary_label":"Arbeitsplatz buchen","secondary_label":"Besprechungsräume ansehen","eyebrow":"Coworking · Meetings · Workshops"}',
    'Flexible workspaces designed around your business',
    'Coworking desks and meeting rooms at Business Village – bookable by the hour or by the day, with no long-term commitment.',
    '', '{"primary_label":"Book a Workspace","secondary_label":"View meeting rooms","eyebrow":"Coworking · Meetings · Workshops"}');
  perform private.seed_section(pid, 'availability_search', 2, '{}',
    'Verfügbarkeit prüfen', 'Wählen Sie Datum, Uhrzeit und Personenzahl – wir zeigen Ihnen sofort, was frei ist.', '', '{}',
    'Check availability', 'Choose a date, time and group size – we will show you what is free right away.', '', '{}');
  perform private.seed_section(pid, 'workspaces', 3, '{"limit":4}',
    'Ausgewählte Arbeitsplätze', 'Ruhige Schreibtische mit allem, was Sie für einen produktiven Tag brauchen.', '', '{"cta_label":"Alle Arbeitsplätze"}',
    'Featured workspaces', 'Quiet desks with everything you need for a productive day.', '', '{"cta_label":"All workspaces"}');
  perform private.seed_section(pid, 'rooms', 4, '{"limit":3}',
    'Besprechungsräume', 'Für Meetings, Workshops und Kundentermine – mit moderner Präsentationstechnik.', '', '{"cta_label":"Alle Besprechungsräume"}',
    'Meeting rooms', 'For meetings, workshops and client appointments – with modern presentation equipment.', '', '{"cta_label":"All meeting rooms"}');
  perform private.seed_section(pid, 'features', 5, '{}',
    'Warum Business Village', 'Ein professionelles Arbeitsumfeld, das sich Ihrem Alltag anpasst.', '',
    '{"items":[
      {"icon":"calendar-check","title":"Flexibel buchen","text":"Stunden- oder tageweise – Sie buchen genau dann, wenn Sie einen Platz brauchen."},
      {"icon":"map-pin","title":"Gut erreichbar","text":"Zentral gelegen und bequem mit öffentlichen Verkehrsmitteln oder dem Auto erreichbar."},
      {"icon":"shield-check","title":"Professionelles Umfeld","text":"Ruhige Arbeitsbereiche, schnelles WLAN und ein freundliches Team vor Ort."},
      {"icon":"users","title":"Für Einzelne und Teams","text":"Vom einzelnen Schreibtisch bis zum Workshop-Raum für größere Gruppen."}]}',
    'Why Business Village', 'A professional working environment that adapts to your day.', '',
    '{"items":[
      {"icon":"calendar-check","title":"Flexible booking","text":"By the hour or by the day – book exactly when you need a space."},
      {"icon":"map-pin","title":"Easy to reach","text":"Centrally located and easy to reach by public transport or car."},
      {"icon":"shield-check","title":"Professional environment","text":"Quiet work areas, fast Wi-Fi and a friendly team on site."},
      {"icon":"users","title":"For individuals and teams","text":"From a single desk to a workshop room for larger groups."}]}');
  perform private.seed_section(pid, 'amenities', 6, '{"limit":8}',
    'Ausstattung', 'Alles vorhanden, damit Sie sich ganz auf Ihre Arbeit konzentrieren können.', '', '{"cta_label":"Gesamte Ausstattung"}',
    'Amenities', 'Everything in place so you can focus entirely on your work.', '', '{"cta_label":"All amenities"}');
  perform private.seed_section(pid, 'steps', 7, '{}',
    'So funktioniert es', 'In wenigen Schritten zu Ihrem Arbeitsplatz.', '', jsonb_build_object('items', steps_de),
    'How it works', 'Your workspace in just a few steps.', '', jsonb_build_object('items', steps_en));
  perform private.seed_section(pid, 'faq', 8, '{}',
    'Häufige Fragen', '', '', jsonb_build_object('items', faq_de),
    'Frequently asked questions', '', '', jsonb_build_object('items', faq_en));
  perform private.seed_section(pid, 'cta', 9, '{"button_href":"/coworking","variant":"primary"}',
    'Bereit für Ihren nächsten Arbeitstag?', 'Buchen Sie Ihren Arbeitsplatz jetzt online – in weniger als einer Minute.', '', '{"button_label":"Jetzt buchen"}',
    'Ready for your next working day?', 'Book your workspace online now – in less than a minute.', '', '{"button_label":"Book now"}');
  perform private.seed_section(pid, 'cta', 10, '{"button_href":"/contact","variant":"contact","show_address":true}',
    'Besuchen Sie uns', 'Sie möchten sich die Räume vorab ansehen? Wir zeigen Ihnen gern alles vor Ort.', '', '{"button_label":"Kontakt aufnehmen"}',
    'Visit us', 'Would you like to see the spaces first? We are happy to show you around.', '', '{"button_label":"Get in touch"}');

  -- Coworking -----------------------------------------------------------------
  pid := private.seed_page('coworking', 'landing', 'Coworking', 'Coworking',
    'Coworking-Arbeitsplätze buchen | Business Village', 'Book coworking desks | Business Village',
    'Finden Sie freie Coworking-Arbeitsplätze im Business Village und buchen Sie direkt online.',
    'Find available coworking desks at Business Village and book directly online.');
  perform private.seed_section(pid, 'page_header', 1, '{}',
    'Coworking-Arbeitsplätze', 'Ruhige, voll ausgestattete Arbeitsplätze – flexibel buchbar für einen Tag oder ein paar Stunden. Filtern Sie nach Datum, Etage und Ausstattung.', '', '{}',
    'Coworking desks', 'Quiet, fully equipped desks – flexibly bookable for a day or a few hours. Filter by date, floor and amenities.', '', '{}');
  perform private.seed_section(pid, 'workspace_list', 2, '{}', '', '', '', '{}', '', '', '', '{}');
  perform private.seed_section(pid, 'cta', 3, '{"button_href":"/contact","variant":"muted"}',
    'Sie brauchen einen festen Arbeitsplatz?', 'Sprechen Sie uns an – wir finden gemeinsam die passende Lösung für Sie oder Ihr Team.', '', '{"button_label":"Kontakt aufnehmen"}',
    'Need a permanent desk?', 'Get in touch – together we will find the right solution for you or your team.', '', '{"button_label":"Get in touch"}');

  -- Meeting rooms -------------------------------------------------------------
  pid := private.seed_page('meeting-rooms', 'landing', 'Besprechungsräume', 'Meeting Rooms',
    'Besprechungsräume mieten | Business Village', 'Meeting rooms for rent | Business Village',
    'Moderne Besprechungsräume mit Präsentationstechnik – stundenweise online buchbar.',
    'Modern meeting rooms with presentation equipment – bookable online by the hour.');
  perform private.seed_section(pid, 'page_header', 1, '{}',
    'Besprechungsräume', 'Für Teammeetings, Workshops und Kundentermine: Unsere Räume sind mit Bildschirm, Whiteboard und Videokonferenztechnik ausgestattet.', '', '{}',
    'Meeting rooms', 'For team meetings, workshops and client appointments: our rooms come with screens, whiteboards and video conferencing.', '', '{}');
  perform private.seed_section(pid, 'room_list', 2, '{}', '', '', '', '{}', '', '', '', '{}');
  perform private.seed_section(pid, 'cta', 3, '{"button_href":"/contact","variant":"muted"}',
    'Planen Sie eine größere Veranstaltung?', 'Wir unterstützen Sie gern bei Catering, Technik und Ablauf.', '', '{"button_label":"Anfrage senden"}',
    'Planning a larger event?', 'We are happy to help with catering, equipment and logistics.', '', '{"button_label":"Send an inquiry"}');

  -- Amenities -----------------------------------------------------------------
  pid := private.seed_page('amenities', 'landing', 'Ausstattung', 'Amenities',
    'Ausstattung | Business Village', 'Amenities | Business Village',
    'Schnelles WLAN, Monitore, Videokonferenztechnik und mehr – die Ausstattung im Business Village.',
    'Fast Wi-Fi, monitors, video conferencing and more – the amenities at Business Village.');
  perform private.seed_section(pid, 'page_header', 1, '{}',
    'Ausstattung', 'Alles, was Sie für konzentriertes Arbeiten und erfolgreiche Meetings brauchen.', '', '{}',
    'Amenities', 'Everything you need for focused work and successful meetings.', '', '{}');
  perform private.seed_section(pid, 'amenity_list', 2, '{}', '', '', '', '{}', '', '', '', '{}');
  perform private.seed_section(pid, 'cta', 3, '{"button_href":"/coworking","variant":"primary"}',
    'Überzeugt?', 'Finden Sie jetzt einen freien Arbeitsplatz.', '', '{"button_label":"Arbeitsplatz buchen"}',
    'Convinced?', 'Find an available workspace now.', '', '{"button_label":"Book a Workspace"}');

  -- How it works --------------------------------------------------------------
  pid := private.seed_page('how-it-works', 'landing', 'So funktioniert es', 'How It Works',
    'So funktioniert die Buchung | Business Village', 'How booking works | Business Village',
    'In fünf einfachen Schritten zu Ihrem Arbeitsplatz oder Besprechungsraum im Business Village.',
    'Five simple steps to your workspace or meeting room at Business Village.');
  perform private.seed_section(pid, 'page_header', 1, '{}',
    'So funktioniert es', 'Vom ersten Klick bis zum Arbeitstag vor Ort: So einfach buchen Sie bei uns.', '', '{}',
    'How it works', 'From the first click to your day on site: this is how easy booking is.', '', '{}');
  perform private.seed_section(pid, 'steps', 2, '{"layout":"vertical"}',
    '', '', '', jsonb_build_object('items', steps_de),
    '', '', '', jsonb_build_object('items', steps_en));
  perform private.seed_section(pid, 'cta', 3, '{"button_href":"/coworking","variant":"primary"}',
    'Jetzt ausprobieren', 'Sehen Sie sich die freien Arbeitsplätze an.', '', '{"button_label":"Arbeitsplatz buchen"}',
    'Try it now', 'Take a look at the available workspaces.', '', '{"button_label":"Book a Workspace"}');

  -- Contact -------------------------------------------------------------------
  pid := private.seed_page('contact', 'standard', 'Kontakt', 'Contact',
    'Kontakt | Business Village', 'Contact | Business Village',
    'Fragen zu Arbeitsplätzen oder Besprechungsräumen? Kontaktieren Sie das Business Village.',
    'Questions about workspaces or meeting rooms? Get in touch with Business Village.');
  perform private.seed_section(pid, 'page_header', 1, '{}',
    'Kontakt', 'Sie haben Fragen zu unseren Arbeitsplätzen, Besprechungsräumen oder einer Buchung? Wir helfen Ihnen gern weiter.', '', '{}',
    'Contact', 'Do you have questions about our workspaces, meeting rooms or a booking? We are happy to help.', '', '{}');
  perform private.seed_section(pid, 'contact_info', 2, '{}',
    'So erreichen Sie uns', '', '',
    '{"address_label":"Adresse","phone_label":"Telefon","email_label":"E-Mail","hours_label":"Öffnungszeiten"}',
    'How to reach us', '', '',
    '{"address_label":"Address","phone_label":"Phone","email_label":"Email","hours_label":"Opening hours"}');
  perform private.seed_section(pid, 'contact_form', 3, '{}',
    'Schreiben Sie uns', 'Wir melden uns in der Regel innerhalb eines Werktags bei Ihnen.', '',
    '{"success_message":"Vielen Dank für Ihre Nachricht! Wir melden uns so schnell wie möglich bei Ihnen."}',
    'Send us a message', 'We usually get back to you within one business day.', '',
    '{"success_message":"Thank you for your message! We will get back to you as soon as possible."}');
  perform private.seed_section(pid, 'map', 4, '{"embed_url":""}',
    'Anfahrt', '', '', '{}', 'Directions', '', '', '{}');

  -- Legal ---------------------------------------------------------------------
  pid := private.seed_page('imprint', 'legal', 'Impressum', 'Imprint / Legal Notice',
    'Impressum | Business Village', 'Imprint / Legal Notice | Business Village', '', '');
  perform private.seed_section(pid, 'imprint', 1,
    '{"legal_name":"","representative":"","address":"","phone":"","email":"","register_court":"","register_number":"","vat_id":"","responsible_person":""}',
    'Impressum', '', '<p><em>Bitte ergänzen Sie hier die rechtlich geprüften Pflichtangaben (Angaben gemäß § 5 DDG) im Adminbereich unter Website → Rechtliches → Impressum.</em></p>', '{}',
    'Imprint / Legal Notice', '', '<p><em>Please complete the legally reviewed mandatory information in the admin area under Website → Legal pages → Imprint.</em></p>', '{}');

  pid := private.seed_page('privacy', 'legal', 'Datenschutzerklärung', 'Privacy Policy',
    'Datenschutz | Business Village', 'Privacy Policy | Business Village', '', '');
  perform private.seed_section(pid, 'text', 1, '{}',
    'Datenschutzerklärung', '', '<p><em>Bitte hinterlegen Sie hier Ihre rechtlich geprüfte Datenschutzerklärung (Adminbereich → Website → Rechtliches → Datenschutz).</em></p>', '{}',
    'Privacy Policy', '', '<p><em>Please add your legally reviewed privacy policy here (Admin → Website → Legal pages → Privacy).</em></p>', '{}');

  pid := private.seed_page('terms', 'legal', 'Allgemeine Geschäftsbedingungen', 'Terms and Conditions',
    'AGB | Business Village', 'Terms | Business Village', '', '');
  perform private.seed_section(pid, 'text', 1, '{}',
    'Allgemeine Geschäftsbedingungen', '', '<p><em>Bitte hinterlegen Sie hier Ihre rechtlich geprüften AGB (Adminbereich → Website → Rechtliches → AGB).</em></p>', '{}',
    'Terms and Conditions', '', '<p><em>Please add your legally reviewed terms and conditions here (Admin → Website → Legal pages → Terms).</em></p>', '{}');
end
$seed$;

drop function private.seed_section(uuid, text, int, jsonb, text, text, text, jsonb, text, text, text, jsonb);
drop function private.seed_page(text, text, text, text, text, text, text, text);

-- ---------------------------------------------------------------------------
-- Email templates ({{name}}, {{reference}}, {{resource}} are replaced at send time)
-- ---------------------------------------------------------------------------
insert into public.email_templates (template_key, locale, subject, heading, intro, outro) values
  ('welcome', 'de', 'Willkommen im Business Village', 'Willkommen, {{name}}!',
   'Ihr Konto ist jetzt aktiv. Ab sofort können Sie Arbeitsplätze und Besprechungsräume online buchen und alle Buchungen unter „Meine Buchungen“ verwalten.',
   'Wir freuen uns auf Ihren Besuch.'),
  ('welcome', 'en', 'Welcome to Business Village', 'Welcome, {{name}}!',
   'Your account is now active. You can book workspaces and meeting rooms online and manage all your bookings under "My Bookings".',
   'We look forward to seeing you.'),
  ('verify_email', 'de', 'Bitte bestätigen Sie Ihre E-Mail-Adresse', 'E-Mail-Adresse bestätigen',
   'Hallo {{name}}, vielen Dank für Ihre Registrierung im Business Village. Bitte bestätigen Sie Ihre E-Mail-Adresse, um Ihr Konto zu aktivieren.',
   'Falls Sie sich nicht registriert haben, können Sie diese E-Mail ignorieren.'),
  ('verify_email', 'en', 'Please confirm your email address', 'Confirm your email address',
   'Hello {{name}}, thank you for signing up with Business Village. Please confirm your email address to activate your account.',
   'If you did not sign up, you can safely ignore this email.'),
  ('password_reset', 'de', 'Passwort zurücksetzen', 'Neues Passwort festlegen',
   'Hallo {{name}}, wir haben eine Anfrage zum Zurücksetzen Ihres Passworts erhalten. Über den folgenden Button können Sie ein neues Passwort festlegen.',
   'Falls Sie diese Anfrage nicht gestellt haben, können Sie diese E-Mail ignorieren. Ihr Passwort bleibt unverändert.'),
  ('password_reset', 'en', 'Reset your password', 'Set a new password',
   'Hello {{name}}, we received a request to reset your password. Use the button below to choose a new password.',
   'If you did not request this, you can ignore this email. Your password will not change.'),
  ('booking_confirmation', 'de', 'Buchung bestätigt – {{resource}}', 'Ihre Buchung ist bestätigt',
   'Hallo {{name}}, vielen Dank für Ihre Buchung. Hier sind die Details:', 'Wir freuen uns auf Ihren Besuch im Business Village.'),
  ('booking_confirmation', 'en', 'Booking confirmed – {{resource}}', 'Your booking is confirmed',
   'Hello {{name}}, thank you for your booking. Here are the details:', 'We look forward to welcoming you at Business Village.'),
  ('guest_booking_confirmation', 'de', 'Ihre Buchung im Business Village ist bestätigt', 'Ihre Buchung ist bestätigt',
   'Hallo {{name}}, vielen Dank für Ihre Buchung. Über den Button unten können Sie Ihre Buchung jederzeit einsehen oder stornieren.',
   'Wir freuen uns auf Ihren Besuch im Business Village.'),
  ('guest_booking_confirmation', 'en', 'Your Business Village booking is confirmed', 'Your booking is confirmed',
   'Hello {{name}}, thank you for your booking. Use the button below to view or cancel your booking at any time.',
   'We look forward to welcoming you at Business Village.'),
  ('booking_updated', 'de', 'Ihre Buchung im Business Village wurde geändert', 'Ihre Buchung wurde aktualisiert',
   'Hallo {{name}}, wir haben Ihre Buchung {{reference}} angepasst. Hier sind die aktuellen Details:',
   'Bei Fragen antworten Sie einfach auf diese E-Mail.'),
  ('booking_updated', 'en', 'Your Business Village booking has been updated', 'Your booking has been updated',
   'Hello {{name}}, we have updated your booking {{reference}}. Here are the current details:',
   'If you have any questions, simply reply to this email.'),
  ('booking_cancelled', 'de', 'Buchung storniert – {{reference}}', 'Ihre Buchung wurde storniert',
   'Hallo {{name}}, Ihre Buchung {{reference}} wurde storniert.', 'Wir würden uns freuen, Sie bald wieder im Business Village begrüßen zu dürfen.'),
  ('booking_cancelled', 'en', 'Booking cancelled – {{reference}}', 'Your booking has been cancelled',
   'Hello {{name}}, your booking {{reference}} has been cancelled.', 'We hope to welcome you at Business Village again soon.'),
  ('contact_confirmation', 'de', 'Wir haben Ihre Nachricht erhalten', 'Vielen Dank für Ihre Nachricht',
   'Hallo {{name}}, vielen Dank für Ihre Anfrage. Wir haben Ihre Nachricht erhalten und melden uns so schnell wie möglich bei Ihnen.',
   'Ihr Team vom Business Village'),
  ('contact_confirmation', 'en', 'We have received your message', 'Thank you for your message',
   'Hello {{name}}, thank you for contacting us. We have received your message and will get back to you as soon as possible.',
   'Your Business Village team'),
  ('contact_admin_notification', 'de', 'Neue Kontaktanfrage von {{name}}', 'Neue Kontaktanfrage',
   'Über das Kontaktformular ist eine neue Anfrage eingegangen.', ''),
  ('contact_admin_notification', 'en', 'New contact request from {{name}}', 'New contact request',
   'A new request was submitted through the contact form.', ''),
  ('booking_admin_notification', 'de', 'Neue Buchung {{reference}} – {{resource}}', 'Neue Buchung eingegangen',
   'Es ist eine neue Buchung eingegangen:', ''),
  ('booking_admin_notification', 'en', 'New booking {{reference}} – {{resource}}', 'New booking received',
   'A new booking has been made:', ''),
  ('booking_message', 'de', 'Nachricht zu Ihrer Buchung {{reference}}', 'Nachricht zu Ihrer Buchung',
   'Hallo {{name}}, wir haben eine Nachricht zu Ihrer Buchung {{reference}}:', 'Sie können direkt auf diese E-Mail antworten.'),
  ('booking_message', 'en', 'Message about your booking {{reference}}', 'Message about your booking',
   'Hello {{name}}, we have a message regarding your booking {{reference}}:', 'You can reply directly to this email.')
on conflict (template_key, locale) do nothing;
