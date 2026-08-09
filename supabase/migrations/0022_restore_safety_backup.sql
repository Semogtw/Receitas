alter table private.restore_jobs
  add column is_safety_backup boolean not null default false;

create or replace function private.restore_safety_file_matches_current(
  p_job_id uuid,
  p_pair_id uuid,
  p_path text,
  p_entity_type text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  staged jsonb := private.restore_file_payload(p_job_id, p_path);
  staged_count integer;
  current_count integer;
  source_row jsonb;
  entity_id uuid;
  current_payload jsonb;
begin
  if not private.restore_supported_entity(p_entity_type) then
    raise exception 'unsupported safety backup entity type' using errcode = '22023';
  end if;
  if staged is null or jsonb_typeof(staged) <> 'array' then
    return false;
  end if;

  staged_count := jsonb_array_length(staged);
  execute format('select count(*)::integer from public.%I t where t.pair_id = $1', p_entity_type)
    into current_count
    using p_pair_id;
  if current_count is distinct from staged_count then
    return false;
  end if;

  for source_row in select value from jsonb_array_elements(staged)
  loop
    begin
      entity_id := (source_row ->> 'id')::uuid;
    exception when others then
      return false;
    end;

    if source_row ->> 'pair_id' is distinct from p_pair_id::text then
      return false;
    end if;

    execute format(
      'select private.to_client_mutation_payload($3, to_jsonb(t)) '
      || 'from public.%I t where t.id = $1 and t.pair_id = $2',
      p_entity_type
    ) into current_payload using entity_id, p_pair_id, p_entity_type;

    if current_payload is null or current_payload is distinct from source_row then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

create or replace function private.restore_safety_photos_match_current(
  p_job_id uuid,
  p_pair_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  staged jsonb := private.restore_file_payload(p_job_id, 'data/photo-metadata.json');
  staged_count integer;
  current_count integer;
  source_row jsonb;
  entity_type text;
  entity_id uuid;
  current_payload jsonb;
begin
  if staged is null or jsonb_typeof(staged) <> 'array' then
    return false;
  end if;

  staged_count := jsonb_array_length(staged);
  select (
    (select count(*) from public.recipe_photos where pair_id = p_pair_id)
    + (select count(*) from public.cooking_session_photos where pair_id = p_pair_id)
  )::integer into current_count;
  if current_count is distinct from staged_count then
    return false;
  end if;

  for source_row in select value from jsonb_array_elements(staged)
  loop
    entity_type := case source_row ->> 'ownerType'
      when 'recipe' then 'recipe_photos'
      when 'cooking_session' then 'cooking_session_photos'
      else null
    end;
    if entity_type is null then return false; end if;

    begin
      entity_id := (source_row ->> 'id')::uuid;
    exception when others then
      return false;
    end;
    if source_row ->> 'pair_id' is distinct from p_pair_id::text then return false; end if;

    execute format(
      'select private.to_client_mutation_payload($3, to_jsonb(t)) '
      || 'from public.%I t where t.id = $1 and t.pair_id = $2',
      entity_type
    ) into current_payload using entity_id, p_pair_id, entity_type;

    if current_payload is null
       or current_payload is distinct from (source_row - 'ownerType') then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

create or replace function private.restore_safety_matches_current(
  p_job_id uuid,
  p_pair_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  pair_payload jsonb;
begin
  pair_payload := private.restore_file_payload(p_job_id, 'data/pair.json');
  if pair_payload is null
     or pair_payload ->> 'sourcePairId' is distinct from p_pair_id::text then
    return false;
  end if;

  return
    private.restore_safety_file_matches_current(p_job_id, p_pair_id, 'data/recipes.json', 'recipes')
    and private.restore_safety_file_matches_current(p_job_id, p_pair_id, 'data/recipe-ingredients.json', 'recipe_ingredients')
    and private.restore_safety_file_matches_current(p_job_id, p_pair_id, 'data/recipe-steps.json', 'recipe_steps')
    and private.restore_safety_file_matches_current(p_job_id, p_pair_id, 'data/categories.json', 'categories')
    and private.restore_safety_file_matches_current(p_job_id, p_pair_id, 'data/recipe-categories.json', 'recipe_categories')
    and private.restore_safety_file_matches_current(p_job_id, p_pair_id, 'data/cooking-sessions.json', 'cooking_sessions')
    and private.restore_safety_file_matches_current(p_job_id, p_pair_id, 'data/cooking-session-ratings.json', 'cooking_session_ratings')
    and private.restore_safety_file_matches_current(p_job_id, p_pair_id, 'data/meal-periods.json', 'meal_periods')
    and private.restore_safety_file_matches_current(p_job_id, p_pair_id, 'data/meal-plan-entries.json', 'meal_plan_entries')
    and private.restore_safety_file_matches_current(p_job_id, p_pair_id, 'data/shopping-lists.json', 'shopping_lists')
    and private.restore_safety_file_matches_current(p_job_id, p_pair_id, 'data/shopping-items.json', 'shopping_items')
    and private.restore_safety_file_matches_current(p_job_id, p_pair_id, 'data/conversion-profiles.json', 'ingredient_conversion_profiles')
    and private.restore_safety_photos_match_current(p_job_id, p_pair_id);
end;
$$;

create or replace function public.attach_restore_safety_backup(
  p_replace_job_id uuid,
  p_safety_job_id uuid,
  p_pair_id uuid,
  p_actor_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  replace_job private.restore_jobs%rowtype;
  safety_job private.restore_jobs%rowtype;
begin
  if p_replace_job_id = p_safety_job_id then
    raise exception 'safety backup job must be distinct' using errcode = '22023';
  end if;

  select * into replace_job
    from private.restore_jobs j
   where j.id = p_replace_job_id
     and j.pair_id = p_pair_id
   for update;
  if not found then raise exception 'replace restore job not found' using errcode = 'P0002'; end if;

  select * into safety_job
    from private.restore_jobs j
   where j.id = p_safety_job_id
     and j.pair_id = p_pair_id
   for update;
  if not found then raise exception 'safety restore job not found' using errcode = 'P0002'; end if;

  if replace_job.created_by is distinct from p_actor_user_id
     or safety_job.created_by is distinct from p_actor_user_id then
    raise exception 'restore safety actor mismatch' using errcode = '42501';
  end if;
  if replace_job.mode <> 'replace_all' or replace_job.status <> 'ready_to_commit' then
    raise exception 'replace restore job is not ready' using errcode = '22023';
  end if;
  if safety_job.mode <> 'merge' or safety_job.status <> 'ready_to_commit' then
    raise exception 'safety backup staging is not ready' using errcode = '22023';
  end if;
  if safety_job.created_at < replace_job.created_at then
    raise exception 'safety backup must be created after replace staging begins' using errcode = '22023';
  end if;
  if safety_job.expires_at <= now() or replace_job.expires_at <= now() then
    raise exception 'restore safety job expired' using errcode = '22023';
  end if;
  if not private.restore_safety_matches_current(p_safety_job_id, p_pair_id) then
    raise exception 'safety backup does not match current canonical state' using errcode = '40001';
  end if;

  update private.restore_jobs
     set is_safety_backup = true
   where id = p_safety_job_id;

  update private.restore_jobs
     set safety_backup_id = p_safety_job_id
   where id = p_replace_job_id;
end;
$$;

revoke all on function public.attach_restore_safety_backup(uuid, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.attach_restore_safety_backup(uuid, uuid, uuid, uuid) to service_role;

create or replace function public.commit_restore_merge_checked(
  p_job_id uuid,
  p_pair_id uuid,
  p_actor_user_id uuid
)
returns table (
  inserted_count integer,
  noop_count integer,
  conflict_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  job private.restore_jobs%rowtype;
  expected_media integer;
  staged_media integer;
  promoted_media integer;
begin
  select * into job
    from private.restore_jobs j
   where j.id = p_job_id
     and j.pair_id = p_pair_id
   for update;

  if not found then raise exception 'restore job not found' using errcode = 'P0002'; end if;
  if job.created_by is distinct from p_actor_user_id then raise exception 'restore actor mismatch' using errcode = '42501'; end if;
  if job.is_safety_backup then raise exception 'safety backup job cannot be committed as a merge' using errcode = '22023'; end if;
  if job.mode <> 'merge' or job.status <> 'ready_to_commit' then
    raise exception 'restore merge is not ready to commit' using errcode = '22023';
  end if;

  expected_media := jsonb_array_length(coalesce(job.manifest -> 'mediaFiles', '[]'::jsonb));
  select count(*)::integer,
         count(*) filter (where m.promoted_at is not null and m.promoted_storage_path is not null)::integer
    into staged_media, promoted_media
    from private.restore_staged_media m
   where m.job_id = p_job_id;

  if staged_media <> expected_media or promoted_media <> expected_media then
    raise exception 'all restore media must be promoted before merge commit' using errcode = '22023';
  end if;

  return query select * from public.commit_restore_merge(p_job_id, p_pair_id, p_actor_user_id);
end;
$$;

revoke all on function public.commit_restore_merge_checked(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.commit_restore_merge_checked(uuid, uuid, uuid) to service_role;
