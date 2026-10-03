-- Business Village: media library, amenities, workspaces, meeting rooms

-- ---------------------------------------------------------------------------
-- media
-- ---------------------------------------------------------------------------
create table public.media (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  file_url text not null,
  storage_path text not null unique,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/avif')),
  file_size integer not null check (file_size > 0),
  width integer,
  height integer,
  alt_text_de text not null default '',
  alt_text_en text not null default '',
  title text not null default '',
  uploaded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index media_created_idx on public.media (created_at desc);
create trigger media_touch before update on public.media
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- amenities (+ translations)
-- ---------------------------------------------------------------------------
create table public.amenities (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  icon text not null default 'check' check (icon ~ '^[a-z0-9-]{1,40}$'),
  amenity_type text not null check (amenity_type in ('workspace', 'room', 'general')),
  active boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger amenities_touch before update on public.amenities
  for each row execute function private.touch_updated_at();

create table public.amenity_translations (
  amenity_id uuid not null references public.amenities (id) on delete cascade,
  locale text not null check (locale in ('de', 'en')),
  name text not null,
  description text not null default '',
  primary key (amenity_id, locale)
);

-- ---------------------------------------------------------------------------
-- workspaces / desks
-- ---------------------------------------------------------------------------
create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  desk_number text,
  floor text not null default '',
  zone text not null default '',
  short_description_de text not null default '',
  short_description_en text not null default '',
  full_description_de text not null default '',
  full_description_en text not null default '',
  status text not null default 'available' check (status in ('available', 'maintenance', 'disabled')),
  capacity integer not null default 1 check (capacity between 1 and 500),
  display_order integer not null default 0,
  featured boolean not null default false,
  public_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger workspaces_touch before update on public.workspaces
  for each row execute function private.touch_updated_at();

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  floor text not null default '',
  capacity integer not null default 1 check (capacity between 1 and 500),
  short_description_de text not null default '',
  short_description_en text not null default '',
  full_description_de text not null default '',
  full_description_en text not null default '',
  status text not null default 'available' check (status in ('available', 'maintenance', 'disabled')),
  featured boolean not null default false,
  public_visible boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger rooms_touch before update on public.rooms
  for each row execute function private.touch_updated_at();

create table public.workspace_amenities (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  amenity_id uuid not null references public.amenities (id) on delete cascade,
  primary key (workspace_id, amenity_id)
);
create index workspace_amenities_amenity_idx on public.workspace_amenities (amenity_id);

create table public.room_amenities (
  room_id uuid not null references public.rooms (id) on delete cascade,
  amenity_id uuid not null references public.amenities (id) on delete cascade,
  primary key (room_id, amenity_id)
);
create index room_amenities_amenity_idx on public.room_amenities (amenity_id);

-- Images: media rows cannot be deleted while a gallery still uses them.
create table public.workspace_images (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  media_id uuid not null references public.media (id) on delete restrict,
  display_order integer not null default 0,
  is_cover boolean not null default false,
  created_at timestamptz not null default now(),
  unique (workspace_id, media_id)
);
create unique index workspace_images_one_cover on public.workspace_images (workspace_id) where is_cover;
create index workspace_images_media_idx on public.workspace_images (media_id);

create table public.room_images (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  media_id uuid not null references public.media (id) on delete restrict,
  display_order integer not null default 0,
  is_cover boolean not null default false,
  created_at timestamptz not null default now(),
  unique (room_id, media_id)
);
create unique index room_images_one_cover on public.room_images (room_id) where is_cover;
create index room_images_media_idx on public.room_images (media_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.media enable row level security;
alter table public.amenities enable row level security;
alter table public.amenity_translations enable row level security;
alter table public.workspaces enable row level security;
alter table public.rooms enable row level security;
alter table public.workspace_amenities enable row level security;
alter table public.room_amenities enable row level security;
alter table public.workspace_images enable row level security;
alter table public.room_images enable row level security;

-- media: everything in the library is served from a public bucket anyway
create policy "media: public read" on public.media for select to anon, authenticated using (true);
create policy "media: admin write" on public.media for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "amenities: read active" on public.amenities for select to anon, authenticated
  using (active or (select public.is_admin()));
create policy "amenities: admin write" on public.amenities for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "amenity_tr: read active" on public.amenity_translations for select to anon, authenticated
  using (exists (select 1 from public.amenities a where a.id = amenity_id and (a.active or (select public.is_admin()))));
create policy "amenity_tr: admin write" on public.amenity_translations for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "workspaces: read public" on public.workspaces for select to anon, authenticated
  using ((public_visible and status <> 'disabled') or (select public.is_admin()));
create policy "workspaces: admin write" on public.workspaces for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "rooms: read public" on public.rooms for select to anon, authenticated
  using ((public_visible and status <> 'disabled') or (select public.is_admin()));
create policy "rooms: admin write" on public.rooms for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "ws_amenities: read" on public.workspace_amenities for select to anon, authenticated using (true);
create policy "ws_amenities: admin write" on public.workspace_amenities for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "room_amenities: read" on public.room_amenities for select to anon, authenticated using (true);
create policy "room_amenities: admin write" on public.room_amenities for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "ws_images: read" on public.workspace_images for select to anon, authenticated using (true);
create policy "ws_images: admin write" on public.workspace_images for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "room_images: read" on public.room_images for select to anon, authenticated using (true);
create policy "room_images: admin write" on public.room_images for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- Activity logging for resource tables
-- ---------------------------------------------------------------------------
create or replace function private.audit_resource_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  prefix text := tg_argv[0];
  rec_id uuid;
  label text;
begin
  if tg_op = 'DELETE' then
    rec_id := old.id;
    label := coalesce(to_jsonb(old) ->> 'name', to_jsonb(old) ->> 'slug', to_jsonb(old) ->> 'file_name');
  else
    rec_id := new.id;
    label := coalesce(to_jsonb(new) ->> 'name', to_jsonb(new) ->> 'slug', to_jsonb(new) ->> 'file_name');
  end if;

  perform private.write_audit(
    prefix || '_' || case tg_op when 'INSERT' then (case when prefix = 'MEDIA' then 'UPLOADED' else 'CREATED' end)
                                when 'UPDATE' then 'UPDATED' else 'DELETED' end,
    lower(prefix), rec_id, jsonb_build_object('label', label));
  return null;
end;
$$;

create trigger workspaces_audit after insert or update or delete on public.workspaces
  for each row execute function private.audit_resource_change('WORKSPACE');
create trigger rooms_audit after insert or update or delete on public.rooms
  for each row execute function private.audit_resource_change('ROOM');
create trigger amenities_audit after insert or update or delete on public.amenities
  for each row execute function private.audit_resource_change('AMENITY');
create trigger media_audit after insert or delete on public.media
  for each row execute function private.audit_resource_change('MEDIA');

-- ---------------------------------------------------------------------------
-- Storage bucket for all CMS / resource images
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "media bucket: admin insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and (select public.is_admin()));
create policy "media bucket: admin update" on storage.objects for update to authenticated
  using (bucket_id = 'media' and (select public.is_admin()))
  with check (bucket_id = 'media' and (select public.is_admin()));
create policy "media bucket: admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (select public.is_admin()));
