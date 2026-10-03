-- Business Village: CMS (pages, sections, translations), navigation, settings,
-- announcements, email templates

-- ---------------------------------------------------------------------------
-- site_settings: public business information (single row)
-- ---------------------------------------------------------------------------
create table public.site_settings (
  id smallint primary key default 1 check (id = 1),
  company_name text not null default 'Business Village',
  company_legal_name text not null default '',
  address_line_1 text not null default '',
  address_line_2 text not null default '',
  postcode text not null default '',
  city text not null default '',
  country text not null default 'Deutschland',
  phone text not null default '',
  general_email text not null default '',
  booking_email text not null default '',
  support_email text not null default '',
  opening_hours_de text not null default '',
  opening_hours_en text not null default '',
  logo_media_id uuid references public.media (id) on delete set null,
  footer_logo_media_id uuid references public.media (id) on delete set null,
  favicon_media_id uuid references public.media (id) on delete set null,
  social_links jsonb not null default '[]'::jsonb check (jsonb_typeof(social_links) = 'array'),
  footer_description_de text not null default '',
  footer_description_en text not null default '',
  footer_copyright_de text not null default '',
  footer_copyright_en text not null default '',
  announcement_banner_de text not null default '',
  announcement_banner_en text not null default '',
  default_seo_title_de text not null default '',
  default_seo_title_en text not null default '',
  default_seo_description_de text not null default '',
  default_seo_description_en text not null default '',
  default_seo_image_id uuid references public.media (id) on delete set null,
  -- booking rules (used by the booking engine and the calendars)
  booking_day_start time not null default '07:00',
  booking_day_end time not null default '21:00',
  booking_weekdays smallint[] not null default '{1,2,3,4,5}',
  booking_slot_minutes smallint not null default 30 check (booking_slot_minutes in (15, 30, 60)),
  booking_max_hours smallint not null default 12 check (booking_max_hours between 1 and 24),
  booking_max_days_ahead smallint not null default 180 check (booking_max_days_ahead between 1 and 730),
  cancellation_cutoff_hours smallint not null default 2 check (cancellation_cutoff_hours between 0 and 168),
  updated_at timestamptz not null default now()
);
create trigger site_settings_touch before update on public.site_settings
  for each row execute function private.touch_updated_at();

-- Internal configuration that must not be publicly readable.
create table public.private_settings (
  id smallint primary key default 1 check (id = 1),
  contact_destination_email text not null default '',
  contact_confirmation_enabled boolean not null default true,
  contact_admin_notification_enabled boolean not null default true,
  booking_admin_notification_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);
create trigger private_settings_touch before update on public.private_settings
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- pages / translations / sections
-- ---------------------------------------------------------------------------
create table public.pages (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  page_type text not null default 'standard' check (page_type in ('standard', 'landing', 'legal')),
  status text not null default 'draft' check (status in ('draft', 'published')),
  is_system boolean not null default false,
  seo_image_id uuid references public.media (id) on delete set null,
  canonical_url text check (canonical_url is null or canonical_url ~ '^https://[^\s]+$'),
  noindex boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger pages_touch before update on public.pages
  for each row execute function private.touch_updated_at();

create table public.page_translations (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.pages (id) on delete cascade,
  locale text not null check (locale in ('de', 'en')),
  title text not null default '',
  seo_title text not null default '',
  seo_description text not null default '',
  og_title text not null default '',
  og_description text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (page_id, locale)
);
create trigger page_translations_touch before update on public.page_translations
  for each row execute function private.touch_updated_at();

create table public.page_sections (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.pages (id) on delete cascade,
  section_type text not null check (section_type in (
    'hero', 'availability_search', 'text', 'image_text', 'features', 'steps', 'cta', 'faq',
    'gallery', 'amenities', 'rooms', 'workspaces', 'page_header', 'workspace_list', 'room_list',
    'amenity_list', 'contact_info', 'contact_form', 'map', 'imprint', 'custom')),
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  media_id uuid references public.media (id) on delete restrict,
  display_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index page_sections_page_idx on public.page_sections (page_id, display_order);
create trigger page_sections_touch before update on public.page_sections
  for each row execute function private.touch_updated_at();

create table public.page_section_translations (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.page_sections (id) on delete cascade,
  locale text not null check (locale in ('de', 'en')),
  title text not null default '',
  subtitle text not null default '',
  content text not null default '',
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (section_id, locale)
);
create trigger page_section_translations_touch before update on public.page_section_translations
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- navigation (header, footer, legal links)
-- ---------------------------------------------------------------------------
create table public.navigation_items (
  id uuid primary key default gen_random_uuid(),
  menu text not null check (menu in ('header', 'footer', 'legal')),
  label_de text not null,
  label_en text not null,
  -- Only internal paths ("/contact") or absolute https URLs. Blocks javascript:,
  -- data:, protocol-relative URLs and whitespace tricks at the database level.
  href text not null check (
    href ~ '^/([A-Za-z0-9._~!$&''()*+,;=:@%/?#-]*)$' and href !~ '^//'
    or href ~ '^https://[A-Za-z0-9.-]+(:[0-9]+)?(/[A-Za-z0-9._~!$&''()*+,;=:@%/?#-]*)?$'
  ),
  open_in_new_tab boolean not null default false,
  display_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger navigation_items_touch before update on public.navigation_items
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- announcements (bilingual)
-- ---------------------------------------------------------------------------
create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  title_de text not null default '',
  title_en text not null default '',
  content_de text not null default '',
  content_en text not null default '',
  publish_at timestamptz not null default now(),
  expires_at timestamptz,
  active boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at is null or expires_at > publish_at)
);
create trigger announcements_touch before update on public.announcements
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- email templates (admin-editable subject/heading/intro per locale)
-- ---------------------------------------------------------------------------
create table public.email_templates (
  id uuid primary key default gen_random_uuid(),
  template_key text not null check (template_key in (
    'welcome', 'verify_email', 'password_reset', 'booking_confirmation', 'guest_booking_confirmation',
    'booking_updated', 'booking_cancelled', 'contact_confirmation', 'contact_admin_notification',
    'booking_admin_notification', 'booking_message')),
  locale text not null check (locale in ('de', 'en')),
  subject text not null,
  heading text not null default '',
  intro text not null default '',
  outro text not null default '',
  updated_at timestamptz not null default now(),
  unique (template_key, locale)
);
create trigger email_templates_touch before update on public.email_templates
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.site_settings enable row level security;
alter table public.private_settings enable row level security;
alter table public.pages enable row level security;
alter table public.page_translations enable row level security;
alter table public.page_sections enable row level security;
alter table public.page_section_translations enable row level security;
alter table public.navigation_items enable row level security;
alter table public.announcements enable row level security;
alter table public.email_templates enable row level security;

create policy "site_settings: public read" on public.site_settings for select to anon, authenticated using (true);
create policy "site_settings: admin update" on public.site_settings for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "private_settings: admin" on public.private_settings for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "pages: read published" on public.pages for select to anon, authenticated
  using (status = 'published' or (select public.is_admin()));
create policy "pages: admin write" on public.pages for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "page_tr: read published" on public.page_translations for select to anon, authenticated
  using (exists (select 1 from public.pages p where p.id = page_id and (p.status = 'published' or (select public.is_admin()))));
create policy "page_tr: admin write" on public.page_translations for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "sections: read published" on public.page_sections for select to anon, authenticated
  using ((active and exists (select 1 from public.pages p where p.id = page_id and p.status = 'published'))
         or (select public.is_admin()));
create policy "sections: admin write" on public.page_sections for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "section_tr: read published" on public.page_section_translations for select to anon, authenticated
  using (exists (
    select 1 from public.page_sections s join public.pages p on p.id = s.page_id
    where s.id = section_id and ((s.active and p.status = 'published') or (select public.is_admin()))));
create policy "section_tr: admin write" on public.page_section_translations for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "nav: read active" on public.navigation_items for select to anon, authenticated
  using (active or (select public.is_admin()));
create policy "nav: admin write" on public.navigation_items for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "announcements: members read current" on public.announcements for select to authenticated
  using ((active and publish_at <= now() and (expires_at is null or expires_at > now()))
         or (select public.is_admin()));
create policy "announcements: admin write" on public.announcements for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "email_templates: admin" on public.email_templates for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- Media usage lookup (used before deleting media)
-- ---------------------------------------------------------------------------
create or replace function public.media_usage(p_media_id uuid)
returns table (usage_type text, usage_id uuid, label text)
language sql
stable
security definer
set search_path = ''
as $$
  select 'workspace', w.id, w.name
    from public.workspace_images wi join public.workspaces w on w.id = wi.workspace_id
   where wi.media_id = p_media_id and public.is_admin()
  union all
  select 'room', r.id, r.name
    from public.room_images ri join public.rooms r on r.id = ri.room_id
   where ri.media_id = p_media_id and public.is_admin()
  union all
  select 'page', p.id, p.slug
    from public.page_sections s join public.pages p on p.id = s.page_id
   where public.is_admin()
     and (s.media_id = p_media_id or s.settings::text like '%' || p_media_id::text || '%')
  union all
  select 'page', p.id, p.slug
    from public.pages p where p.seo_image_id = p_media_id and public.is_admin()
  union all
  select 'settings', null::uuid, 'site_settings'
    from public.site_settings st
   where public.is_admin()
     and p_media_id in (st.logo_media_id, st.footer_logo_media_id, st.favicon_media_id, st.default_seo_image_id);
$$;
revoke all on function public.media_usage(uuid) from public, anon;
grant execute on function public.media_usage(uuid) to authenticated;

-- Usage counts for the media library list (admin only).
create or replace function public.media_usage_counts()
returns table (media_id uuid, usage_count bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id,
    (select count(*) from public.workspace_images wi where wi.media_id = m.id)
    + (select count(*) from public.room_images ri where ri.media_id = m.id)
    + (select count(*) from public.page_sections s
        where s.media_id = m.id or s.settings::text like '%' || m.id::text || '%')
    + (select count(*) from public.pages p where p.seo_image_id = m.id)
    + (select count(*) from public.site_settings st
        where m.id in (st.logo_media_id, st.footer_logo_media_id, st.favicon_media_id, st.default_seo_image_id))
  from public.media m
  where public.is_admin();
$$;
revoke all on function public.media_usage_counts() from public, anon;
grant execute on function public.media_usage_counts() to authenticated;
