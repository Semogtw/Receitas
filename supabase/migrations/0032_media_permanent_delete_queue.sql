create table private.media_delete_queue (
  storage_path text primary key,
  pair_id uuid not null references public.pairs(id) on delete cascade,
  entity_type text not null check (entity_type in ('recipe_photos', 'cooking_session_photos')),
  entity_id uuid not null,
  enqueued_at timestamptz not null default now(),
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  last_attempt_at timestamptz
);

revoke all on table private.media_delete_queue from public, anon, authenticated;

create or replace function public.permanently_delete_entity_server(
  p_actor_user_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_pair_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer := 0;
  v_storage_path text;
  v_allowed constant text[] := array[
    'recipes',
    'recipe_ingredients',
    'recipe_steps',
    'categories',
    'recipe_categories',
    'recipe_photos',
    'cooking_sessions',
    'cooking_session_ratings',
    'cooking_session_photos',
    'ingredient_conversion_profiles',
    'imports',
    'meal_periods',
    'meal_plan_entries',
    'shopping_lists',
    'shopping_items'
  ];
begin
  if p_actor_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_entity_type is null or not (p_entity_type = any(v_allowed)) then
    raise exception 'unsupported permanent delete entity type' using errcode = '22023';
  end if;

  if not exists (
    select 1
      from public.pair_members pm
     where pm.pair_id = p_pair_id
       and pm.user_id = p_actor_user_id
       and pm.activated_at is not null
       and pm.removed_at is null
  ) then
    raise exception 'active pair membership required' using errcode = '42501';
  end if;

  -- Recipe is a root aggregate. Soft delete historically marks only the recipe
  -- row, so a permanent purge must remove its dependent graph explicitly rather
  -- than relying on FK cascades that the canonical schema intentionally avoids.
  if p_entity_type = 'recipes' then
    perform 1
      from public.recipes r
     where r.id = p_entity_id
       and r.pair_id = p_pair_id
       and r.deleted_at is not null
     for update;
    if not found then
      raise exception 'entity must exist in this pair and already be soft deleted' using errcode = 'P0002';
    end if;

    insert into private.media_delete_queue (storage_path, pair_id, entity_type, entity_id)
    select rp.storage_path, p_pair_id, 'recipe_photos', rp.id
      from public.recipe_photos rp
     where rp.pair_id = p_pair_id
       and rp.recipe_id = p_entity_id
    on conflict (storage_path) do update set
      pair_id = excluded.pair_id,
      entity_type = excluded.entity_type,
      entity_id = excluded.entity_id,
      last_error = null;

    insert into private.media_delete_queue (storage_path, pair_id, entity_type, entity_id)
    select cp.storage_path, p_pair_id, 'cooking_session_photos', cp.id
      from public.cooking_session_photos cp
      join public.cooking_sessions cs
        on cs.id = cp.cooking_session_id
       and cs.pair_id = cp.pair_id
     where cs.pair_id = p_pair_id
       and cs.recipe_id = p_entity_id
    on conflict (storage_path) do update set
      pair_id = excluded.pair_id,
      entity_type = excluded.entity_type,
      entity_id = excluded.entity_id,
      last_error = null;

    delete from public.cooking_session_ratings csr
     using public.cooking_sessions cs
     where cs.id = csr.cooking_session_id
       and cs.pair_id = csr.pair_id
       and cs.pair_id = p_pair_id
       and cs.recipe_id = p_entity_id;

    delete from public.cooking_session_photos cp
     using public.cooking_sessions cs
     where cs.id = cp.cooking_session_id
       and cs.pair_id = cp.pair_id
       and cs.pair_id = p_pair_id
       and cs.recipe_id = p_entity_id;

    delete from public.cooking_sessions
     where pair_id = p_pair_id
       and recipe_id = p_entity_id;
    delete from public.meal_plan_entries
     where pair_id = p_pair_id
       and recipe_id = p_entity_id;
    delete from public.imports
     where pair_id = p_pair_id
       and saved_recipe_id = p_entity_id;
    delete from public.recipe_categories
     where pair_id = p_pair_id
       and recipe_id = p_entity_id;
    delete from public.recipe_photos
     where pair_id = p_pair_id
       and recipe_id = p_entity_id;
    delete from public.recipe_ingredients
     where pair_id = p_pair_id
       and recipe_id = p_entity_id;
    delete from public.recipe_steps
     where pair_id = p_pair_id
       and recipe_id = p_entity_id;
    delete from public.recipes
     where id = p_entity_id
       and pair_id = p_pair_id
       and deleted_at is not null;

    get diagnostics v_deleted = row_count;
    if v_deleted <> 1 then
      raise exception 'recipe permanent purge failed' using errcode = 'P0001';
    end if;
    return null;
  end if;

  -- Cooking history is another aggregate root with ratings/photos beneath it.
  if p_entity_type = 'cooking_sessions' then
    perform 1
      from public.cooking_sessions cs
     where cs.id = p_entity_id
       and cs.pair_id = p_pair_id
       and cs.deleted_at is not null
     for update;
    if not found then
      raise exception 'entity must exist in this pair and already be soft deleted' using errcode = 'P0002';
    end if;

    insert into private.media_delete_queue (storage_path, pair_id, entity_type, entity_id)
    select cp.storage_path, p_pair_id, 'cooking_session_photos', cp.id
      from public.cooking_session_photos cp
     where cp.pair_id = p_pair_id
       and cp.cooking_session_id = p_entity_id
    on conflict (storage_path) do update set
      pair_id = excluded.pair_id,
      entity_type = excluded.entity_type,
      entity_id = excluded.entity_id,
      last_error = null;

    delete from public.cooking_session_ratings
     where pair_id = p_pair_id
       and cooking_session_id = p_entity_id;
    delete from public.cooking_session_photos
     where pair_id = p_pair_id
       and cooking_session_id = p_entity_id;
    delete from public.cooking_sessions
     where id = p_entity_id
       and pair_id = p_pair_id
       and deleted_at is not null;

    get diagnostics v_deleted = row_count;
    if v_deleted <> 1 then
      raise exception 'cooking session permanent purge failed' using errcode = 'P0001';
    end if;
    return null;
  end if;

  -- Join/dependent rows must not make their aggregate parent impossible to purge.
  if p_entity_type = 'categories' then
    perform 1 from public.categories c
     where c.id = p_entity_id and c.pair_id = p_pair_id and c.deleted_at is not null
     for update;
    if not found then raise exception 'entity must exist in this pair and already be soft deleted' using errcode = 'P0002'; end if;
    delete from public.recipe_categories where pair_id = p_pair_id and category_id = p_entity_id;
  elsif p_entity_type = 'meal_periods' then
    perform 1 from public.meal_periods mp
     where mp.id = p_entity_id and mp.pair_id = p_pair_id and mp.deleted_at is not null
     for update;
    if not found then raise exception 'entity must exist in this pair and already be soft deleted' using errcode = 'P0002'; end if;
    update public.meal_plan_entries
       set meal_period_id = null,
           revision = revision + 1,
           updated_at = now()
     where pair_id = p_pair_id
       and meal_period_id = p_entity_id;
  elsif p_entity_type = 'shopping_lists' then
    perform 1 from public.shopping_lists sl
     where sl.id = p_entity_id and sl.pair_id = p_pair_id and sl.deleted_at is not null
     for update;
    if not found then raise exception 'entity must exist in this pair and already be soft deleted' using errcode = 'P0002'; end if;
    delete from public.shopping_items where pair_id = p_pair_id and shopping_list_id = p_entity_id;
  elsif p_entity_type = 'recipe_photos' then
    select rp.storage_path
      into v_storage_path
      from public.recipe_photos rp
     where rp.id = p_entity_id
       and rp.pair_id = p_pair_id
       and rp.deleted_at is not null
     for update;
  elsif p_entity_type = 'cooking_session_photos' then
    select cp.storage_path
      into v_storage_path
      from public.cooking_session_photos cp
     where cp.id = p_entity_id
       and cp.pair_id = p_pair_id
       and cp.deleted_at is not null
     for update;
  end if;

  if p_entity_type in ('recipe_photos', 'cooking_session_photos') and v_storage_path is null then
    raise exception 'media entity must exist in this pair and already be soft deleted' using errcode = 'P0002';
  end if;

  if v_storage_path is not null then
    insert into private.media_delete_queue (
      storage_path,
      pair_id,
      entity_type,
      entity_id
    ) values (
      v_storage_path,
      p_pair_id,
      p_entity_type,
      p_entity_id
    )
    on conflict (storage_path) do update set
      pair_id = excluded.pair_id,
      entity_type = excluded.entity_type,
      entity_id = excluded.entity_id,
      last_error = null;
  end if;

  execute format(
    'delete from public.%I where id = $1 and pair_id = $2 and deleted_at is not null',
    p_entity_type
  ) using p_entity_id, p_pair_id;

  get diagnostics v_deleted = row_count;
  if v_deleted <> 1 then
    raise exception 'entity must exist in this pair and already be soft deleted' using errcode = 'P0002';
  end if;

  return v_storage_path;
end;
$$;

-- The original browser-callable hard-delete RPC cannot coordinate Storage
-- cleanup and is deliberately retired. Keep the function for migration/history
-- compatibility but make it unreachable from browser roles.
revoke all on function public.permanently_delete_entity(text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.permanently_delete_entity_server(uuid, text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.permanently_delete_entity_server(uuid, text, uuid, uuid) to service_role;

create or replace function public.read_media_delete_queue_server(
  p_pair_id uuid,
  p_limit integer default 20
)
returns table(storage_path text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_limit < 1 or p_limit > 100 then
    raise exception 'invalid cleanup limit' using errcode = '22023';
  end if;

  return query
  select q.storage_path
    from private.media_delete_queue q
   where q.pair_id = p_pair_id
   order by q.enqueued_at asc
   limit p_limit;
end;
$$;

revoke all on function public.read_media_delete_queue_server(uuid, integer) from public, anon, authenticated;
grant execute on function public.read_media_delete_queue_server(uuid, integer) to service_role;

create or replace function public.mark_media_delete_complete_server(
  p_pair_id uuid,
  p_storage_path text
)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from private.media_delete_queue q
   where q.pair_id = p_pair_id
     and q.storage_path = p_storage_path;
$$;

revoke all on function public.mark_media_delete_complete_server(uuid, text) from public, anon, authenticated;
grant execute on function public.mark_media_delete_complete_server(uuid, text) to service_role;

create or replace function public.mark_media_delete_failed_server(
  p_pair_id uuid,
  p_storage_path text,
  p_error text
)
returns void
language sql
security definer
set search_path = ''
as $$
  update private.media_delete_queue q
     set attempts = q.attempts + 1,
         last_attempt_at = now(),
         last_error = left(coalesce(p_error, 'storage_delete_failed'), 200)
   where q.pair_id = p_pair_id
     and q.storage_path = p_storage_path;
$$;

revoke all on function public.mark_media_delete_failed_server(uuid, text, text) from public, anon, authenticated;
grant execute on function public.mark_media_delete_failed_server(uuid, text, text) to service_role;
