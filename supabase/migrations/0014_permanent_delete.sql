create or replace function public.permanently_delete_entity(
  p_entity_type text,
  p_entity_id uuid,
  p_pair_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_deleted integer := 0;
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
  if v_actor is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if p_entity_type is null or not (p_entity_type = any(v_allowed)) then
    raise exception 'unsupported permanent delete entity type' using errcode = '22023';
  end if;

  if not exists (
    select 1
      from public.pair_members pm
     where pm.pair_id = p_pair_id
       and pm.user_id = v_actor
       and pm.activated_at is not null
       and pm.removed_at is null
  ) then
    raise exception 'active pair membership required' using errcode = '42501';
  end if;

  execute format(
    'delete from public.%I where id = $1 and pair_id = $2 and deleted_at is not null',
    p_entity_type
  ) using p_entity_id, p_pair_id;

  get diagnostics v_deleted = row_count;
  if v_deleted <> 1 then
    raise exception 'entity must exist in this pair and already be soft deleted' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.permanently_delete_entity(text, uuid, uuid) from public;
grant execute on function public.permanently_delete_entity(text, uuid, uuid) to authenticated;

comment on function public.permanently_delete_entity(text, uuid, uuid) is
  'Privileged explicit hard-delete flow. Requires an active member of the target pair and an already soft-deleted allowlisted row. Foreign-key restrictions intentionally prevent unsafe parent deletion order.';
