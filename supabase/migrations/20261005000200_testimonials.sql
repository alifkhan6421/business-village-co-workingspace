-- Adds the "testimonials" CMS section type (quotes with name and role, per language).
alter table public.page_sections drop constraint if exists page_sections_section_type_check;
alter table public.page_sections add constraint page_sections_section_type_check check (section_type in (
  'hero', 'availability_search', 'text', 'image_text', 'features', 'steps', 'cta', 'faq',
  'gallery', 'amenities', 'rooms', 'workspaces', 'page_header', 'workspace_list', 'room_list',
  'amenity_list', 'contact_info', 'contact_form', 'map', 'imprint', 'custom', 'testimonials'));
