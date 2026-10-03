-- Admin helpers: atomic gallery and amenity assignment for workspaces/rooms.

create or replace function public.admin_set_gallery(
  p_type text, p_resource_id uuid, p_media_ids uuid[], p_cover_id uuid
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  i integer;
  cover uuid;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  p_media_ids := coalesce(p_media_ids, '{}');
  -- The cover must be part of the gallery; default to the first image.
  cover := case when p_cover_id = any (p_media_ids) then p_cover_id else p_media_ids[1] end;

  if p_type = 'workspace' then
    perform 1 from public.workspaces where id = p_resource_id for update;
    if not found then raise exception 'resource_not_found'; end if;
    delete from public.workspace_images where workspace_id = p_resource_id;
    for i in 1 .. coalesce(array_length(p_media_ids, 1), 0) loop
      insert into public.workspace_images (workspace_id, media_id, display_order, is_cover)
      values (p_resource_id, p_media_ids[i], i - 1, p_media_ids[i] = cover)
      on conflict (workspace_id, media_id) do nothing;
    end loop;
    perform private.write_audit('WORKSPACE_UPDATED', 'workspace', p_resource_id,
      jsonb_build_object('gallery', coalesce(array_length(p_media_ids, 1), 0)));
  elsif p_type = 'room' then
    perform 1 from public.rooms where id = p_resource_id for update;
    if not found then raise exception 'resource_not_found'; end if;
    delete from public.room_images where room_id = p_resource_id;
    for i in 1 .. coalesce(array_length(p_media_ids, 1), 0) loop
      insert into public.room_images (room_id, media_id, display_order, is_cover)
      values (p_resource_id, p_media_ids[i], i - 1, p_media_ids[i] = cover)
      on conflict (room_id, media_id) do nothing;
    end loop;
    perform private.write_audit('ROOM_UPDATED', 'room', p_resource_id,
      jsonb_build_object('gallery', coalesce(array_length(p_media_ids, 1), 0)));
  else
    raise exception 'invalid_resource';
  end if;
end;
$$;
revoke all on function public.admin_set_gallery(text, uuid, uuid[], uuid) from public, anon;
grant execute on function public.admin_set_gallery(text, uuid, uuid[], uuid) to authenticated;

create or replace function public.admin_set_amenities(
  p_type text, p_resource_id uuid, p_amenity_ids uuid[]
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  p_amenity_ids := coalesce(p_amenity_ids, '{}');
  if p_type = 'workspace' then
    delete from public.workspace_amenities
     where workspace_id = p_resource_id and amenity_id <> all (p_amenity_ids);
    insert into public.workspace_amenities (workspace_id, amenity_id)
    select p_resource_id, a.id from public.amenities a where a.id = any (p_amenity_ids)
    on conflict do nothing;
  elsif p_type = 'room' then
    delete from public.room_amenities
     where room_id = p_resource_id and amenity_id <> all (p_amenity_ids);
    insert into public.room_amenities (room_id, amenity_id)
    select p_resource_id, a.id from public.amenities a where a.id = any (p_amenity_ids)
    on conflict do nothing;
  else
    raise exception 'invalid_resource';
  end if;
end;
$$;
revoke all on function public.admin_set_amenities(text, uuid, uuid[]) from public, anon;
grant execute on function public.admin_set_amenities(text, uuid, uuid[]) to authenticated;

-- Amenity usage counts for the admin list and delete warning.
create or replace function public.amenity_usage_counts()
returns table (amenity_id uuid, workspace_count bigint, room_count bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id,
    (select count(*) from public.workspace_amenities wa where wa.amenity_id = a.id),
    (select count(*) from public.room_amenities ra where ra.amenity_id = a.id)
  from public.amenities a
  where public.is_admin();
$$;
revoke all on function public.amenity_usage_counts() from public, anon;
grant execute on function public.amenity_usage_counts() to authenticated;
