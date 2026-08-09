create or replace function private.restore_file_payload(p_job_id uuid, p_path text)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  result jsonb;
begin
  if p_path = 'data/pair.json' then
    select d.payload into result
      from private.restore_staged_data d
     where d.job_id = p_job_id
       and d.path = p_path
       and d.batch_index = 0;
    return result;
  end if;

  select coalesce(jsonb_agg(item.value order by d.batch_index, item.ordinality), '[]'::jsonb)
    into result
    from private.restore_staged_data d
    cross join lateral jsonb_array_elements(d.payload) with ordinality as item(value, ordinality)
   where d.job_id = p_job_id
     and d.path = p_path;
  return result;
end;
$$;

create or replace function private.restore_actor_for_pair(
  p_pair_id uuid,
  p_source_actor text,
  p_fallback_actor uuid
)
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  candidate uuid;
begin
  begin
    candidate := nullif(btrim(coalesce(p_source_actor, '')), '')::uuid;
  exception when others then
    candidate := null;
  end;

  if candidate is not null and exists (
    select 1
      from public.pair_members pm
     where pm.pair_id = p_pair_id
       and pm.user_id = candidate
  ) then
    return candidate;
  end if;

  return p_fallback_actor;
end;
$$;

create or replace function private.restore_media_extension(p_mime_type text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case lower(p_mime_type)
    when 'image/jpeg' then 'jpg'
    when 'image/png' then 'png'
    when 'image/webp' then 'webp'
    when 'image/heic' then 'heic'
    when 'image/heif' then 'heif'
    else null
  end;
$$;

create or replace function private.restore_supported_entity(p_entity_type text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_entity_type = any(array[
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
    'meal_periods',
    'meal_plan_entries',
    'shopping_lists',
    'shopping_items'
  ]::text[]);
$$;

create or replace function private.restore_normalize_client_payload(
  p_entity_type text,
  p_entity_id uuid,
  p_source jsonb,
  p_target_pair_id uuid,
  p_restore_actor uuid,
  p_current jsonb default null
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  result jsonb := coalesce(p_source, '{}'::jsonb) - 'ownerType';
  actor_field text;
  actor_value uuid;
  media_extension text;
begin
  if not private.restore_supported_entity(p_entity_type) then
    raise exception 'unsupported restore entity type: %', p_entity_type using errcode = '22023';
  end if;
  if jsonb_typeof(result) <> 'object' then
    raise exception 'restore row must be an object' using errcode = '22023';
  end if;
  if result ->> 'id' is distinct from p_entity_id::text then
    raise exception 'restore row id mismatch' using errcode = '22023';
  end if;

  result := jsonb_set(result, '{pair_id}', to_jsonb(p_target_pair_id::text), true);
  result := jsonb_set(
    result,
    '{revision}',
    to_jsonb(coalesce(case when p_current is null then null else (p_current ->> 'revision')::bigint end, 0)),
    true
  );

  if p_current is not null then
    if p_current ? 'created_at' then result := jsonb_set(result, '{created_at}', p_current -> 'created_at', true); end if;
    if p_current ? 'updated_at' then result := jsonb_set(result, '{updated_at}', p_current -> 'updated_at', true); end if;
  end if;

  actor_field := case p_entity_type
    when 'recipes' then 'created_by'
    when 'recipe_photos' then 'created_by'
    when 'cooking_sessions' then 'recorded_by'
    when 'cooking_session_photos' then 'created_by'
    when 'cooking_session_ratings' then 'user_id'
    else null
  end;

  if actor_field is not null then
    if p_current is not null and p_current ? actor_field then
      result := jsonb_set(result, array[actor_field], p_current -> actor_field, true);
    else
      actor_value := private.restore_actor_for_pair(
        p_target_pair_id,
        result ->> actor_field,
        p_restore_actor
      );
      result := jsonb_set(result, array[actor_field], to_jsonb(actor_value::text), true);
    end if;
  end if;

  if p_entity_type in ('recipe_photos', 'cooking_session_photos') then
    media_extension := private.restore_media_extension(result ->> 'mime_type');
    if media_extension is null then
      raise exception 'unsupported restore media type' using errcode = '22023';
    end if;
    result := jsonb_set(
      result,
      '{storage_path}',
      to_jsonb(
        p_target_pair_id::text || '/' || p_restore_actor::text || '/restore/' || p_entity_id::text || '.' || media_extension
      ),
      true
    );
    result := jsonb_set(result, '{storage_state}', to_jsonb('uploaded'::text), true);
  end if;

  return result;
end;
$$;

create or replace function private.restore_comparable_payload(p_entity_type text, p_payload jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case
    when p_entity_type in ('recipe_photos', 'cooking_session_photos') then
      coalesce(p_payload, '{}'::jsonb)
        - 'revision' - 'created_at' - 'updated_at' - 'storage_path' - 'storage_state'
    else
      coalesce(p_payload, '{}'::jsonb)
        - 'revision' - 'created_at' - 'updated_at'
  end;
$$;

create or replace function private.restore_insert_client_row(
  p_entity_type text,
  p_entity_id uuid,
  p_pair_id uuid,
  p_client_payload jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  remote_payload jsonb := private.to_remote_mutation_payload(
    p_entity_type,
    p_client_payload - 'id' - 'pair_id' - 'revision'
  );
  column_list text;
  value_list text;
  sql_text text;
begin
  if not private.restore_supported_entity(p_entity_type) then
    raise exception 'unsupported restore entity type' using errcode = '22023';
  end if;
  perform private.assert_payload_columns(p_entity_type, remote_payload);

  select
    string_agg(format('%I', key), ', ' order by key),
    string_agg(format('src.%I', key), ', ' order by key)
    into column_list, value_list
    from jsonb_object_keys(remote_payload) as keys(key);

  sql_text := format(
    'insert into public.%1$I (id, pair_id, revision%2$s) '
    || 'select $1, $2, 0%3$s from jsonb_populate_record(null::public.%1$I, $3) as src',
    p_entity_type,
    case when column_list is null then '' else ', ' || column_list end,
    case when value_list is null then '' else ', ' || value_list end
  );

  execute sql_text using p_entity_id, p_pair_id, remote_payload;
end;
$$;

create or replace function private.restore_merge_row(
  p_pair_id uuid,
  p_actor_user_id uuid,
  p_entity_type text,
  p_source jsonb
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  entity_id uuid;
  any_pair_id uuid;
  current_payload jsonb;
  incoming_payload jsonb;
  current_revision bigint;
  open_conflict_id uuid;
begin
  if not private.restore_supported_entity(p_entity_type) then
    raise exception 'unsupported restore entity type' using errcode = '22023';
  end if;

  begin
    entity_id := (p_source ->> 'id')::uuid;
  exception when others then
    raise exception 'invalid restore entity id' using errcode = '22023';
  end;

  execute format('select t.pair_id from public.%I t where t.id = $1', p_entity_type)
    into any_pair_id
    using entity_id;

  if any_pair_id is not null and any_pair_id is distinct from p_pair_id then
    raise exception 'restore stable id collides with another pair' using errcode = '23505';
  end if;

  execute format(
    'select private.to_client_mutation_payload($3, to_jsonb(t)) '
    || 'from public.%I t where t.id = $1 and t.pair_id = $2',
    p_entity_type
  ) into current_payload using entity_id, p_pair_id, p_entity_type;

  incoming_payload := private.restore_normalize_client_payload(
    p_entity_type,
    entity_id,
    p_source,
    p_pair_id,
    p_actor_user_id,
    current_payload
  );

  if current_payload is null then
    begin
      perform private.restore_insert_client_row(p_entity_type, entity_id, p_pair_id, incoming_payload);
    exception when unique_violation then
      raise exception 'restore natural-key collision for % %', p_entity_type, entity_id using errcode = '23505';
    end;
    return 'inserted';
  end if;

  if private.restore_comparable_payload(p_entity_type, current_payload)
     = private.restore_comparable_payload(p_entity_type, incoming_payload) then
    return 'noop';
  end if;

  select c.id into open_conflict_id
    from public.conflicts c
   where c.pair_id = p_pair_id
     and c.entity_type = p_entity_type
     and c.entity_id = entity_id
     and c.status = 'open'
   order by c.created_at desc
   limit 1;

  if open_conflict_id is not null then
    return 'conflict_existing';
  end if;

  current_revision := (current_payload ->> 'revision')::bigint;
  perform private.create_mutation_conflict(
    p_pair_id,
    p_entity_type,
    entity_id,
    current_revision,
    current_payload,
    incoming_payload,
    current_payload
  );
  return 'conflict_created';
end;
$$;

create or replace function private.restore_merge_file(
  p_job_id uuid,
  p_pair_id uuid,
  p_actor_user_id uuid,
  p_path text,
  p_entity_type text
)
returns table (inserted integer, noops integer, conflicts integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_payload jsonb;
  action text;
  inserted_count integer := 0;
  noop_count integer := 0;
  conflict_count integer := 0;
begin
  for row_payload in
    select value from jsonb_array_elements(private.restore_file_payload(p_job_id, p_path))
  loop
    action := private.restore_merge_row(p_pair_id, p_actor_user_id, p_entity_type, row_payload);
    if action = 'inserted' then inserted_count := inserted_count + 1;
    elsif action = 'noop' then noop_count := noop_count + 1;
    else conflict_count := conflict_count + 1;
    end if;
  end loop;

  return query select inserted_count, noop_count, conflict_count;
end;
$$;

create or replace function public.commit_restore_merge(
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
  counters record;
  total_inserted integer := 0;
  total_noops integer := 0;
  total_conflicts integer := 0;
  photo_payload jsonb;
  entity_type text;
begin
  select * into job
    from private.restore_jobs j
   where j.id = p_job_id
     and j.pair_id = p_pair_id
   for update;

  if not found then
    raise exception 'restore job not found' using errcode = 'P0002';
  end if;
  if job.created_by is distinct from p_actor_user_id then
    raise exception 'restore actor mismatch' using errcode = '42501';
  end if;
  if job.mode <> 'merge' then
    raise exception 'restore job is not a merge job' using errcode = '22023';
  end if;
  if job.status <> 'ready_to_commit' then
    raise exception 'restore job is not ready to commit' using errcode = '22023';
  end if;
  if job.expires_at <= now() then
    raise exception 'restore job expired' using errcode = '22023';
  end if;
  if not exists (
    select 1
      from public.pair_members pm
     where pm.pair_id = p_pair_id
       and pm.user_id = p_actor_user_id
       and pm.activated_at is not null
       and pm.removed_at is null
  ) then
    raise exception 'active restore membership required' using errcode = '42501';
  end if;

  update private.restore_jobs set status = 'committing' where id = p_job_id;

  for counters in
    select * from private.restore_merge_file(p_job_id, p_pair_id, p_actor_user_id, 'data/recipes.json', 'recipes')
  loop total_inserted := total_inserted + counters.inserted; total_noops := total_noops + counters.noops; total_conflicts := total_conflicts + counters.conflicts; end loop;
  for counters in
    select * from private.restore_merge_file(p_job_id, p_pair_id, p_actor_user_id, 'data/categories.json', 'categories')
  loop total_inserted := total_inserted + counters.inserted; total_noops := total_noops + counters.noops; total_conflicts := total_conflicts + counters.conflicts; end loop;
  for counters in
    select * from private.restore_merge_file(p_job_id, p_pair_id, p_actor_user_id, 'data/meal-periods.json', 'meal_periods')
  loop total_inserted := total_inserted + counters.inserted; total_noops := total_noops + counters.noops; total_conflicts := total_conflicts + counters.conflicts; end loop;
  for counters in
    select * from private.restore_merge_file(p_job_id, p_pair_id, p_actor_user_id, 'data/shopping-lists.json', 'shopping_lists')
  loop total_inserted := total_inserted + counters.inserted; total_noops := total_noops + counters.noops; total_conflicts := total_conflicts + counters.conflicts; end loop;
  for counters in
    select * from private.restore_merge_file(p_job_id, p_pair_id, p_actor_user_id, 'data/conversion-profiles.json', 'ingredient_conversion_profiles')
  loop total_inserted := total_inserted + counters.inserted; total_noops := total_noops + counters.noops; total_conflicts := total_conflicts + counters.conflicts; end loop;

  for counters in
    select * from private.restore_merge_file(p_job_id, p_pair_id, p_actor_user_id, 'data/recipe-ingredients.json', 'recipe_ingredients')
  loop total_inserted := total_inserted + counters.inserted; total_noops := total_noops + counters.noops; total_conflicts := total_conflicts + counters.conflicts; end loop;
  for counters in
    select * from private.restore_merge_file(p_job_id, p_pair_id, p_actor_user_id, 'data/recipe-steps.json', 'recipe_steps')
  loop total_inserted := total_inserted + counters.inserted; total_noops := total_noops + counters.noops; total_conflicts := total_conflicts + counters.conflicts; end loop;
  for counters in
    select * from private.restore_merge_file(p_job_id, p_pair_id, p_actor_user_id, 'data/recipe-categories.json', 'recipe_categories')
  loop total_inserted := total_inserted + counters.inserted; total_noops := total_noops + counters.noops; total_conflicts := total_conflicts + counters.conflicts; end loop;
  for counters in
    select * from private.restore_merge_file(p_job_id, p_pair_id, p_actor_user_id, 'data/cooking-sessions.json', 'cooking_sessions')
  loop total_inserted := total_inserted + counters.inserted; total_noops := total_noops + counters.noops; total_conflicts := total_conflicts + counters.conflicts; end loop;
  for counters in
    select * from private.restore_merge_file(p_job_id, p_pair_id, p_actor_user_id, 'data/cooking-session-ratings.json', 'cooking_session_ratings')
  loop total_inserted := total_inserted + counters.inserted; total_noops := total_noops + counters.noops; total_conflicts := total_conflicts + counters.conflicts; end loop;
  for counters in
    select * from private.restore_merge_file(p_job_id, p_pair_id, p_actor_user_id, 'data/meal-plan-entries.json', 'meal_plan_entries')
  loop total_inserted := total_inserted + counters.inserted; total_noops := total_noops + counters.noops; total_conflicts := total_conflicts + counters.conflicts; end loop;
  for counters in
    select * from private.restore_merge_file(p_job_id, p_pair_id, p_actor_user_id, 'data/shopping-items.json', 'shopping_items')
  loop total_inserted := total_inserted + counters.inserted; total_noops := total_noops + counters.noops; total_conflicts := total_conflicts + counters.conflicts; end loop;

  for photo_payload in
    select value from jsonb_array_elements(private.restore_file_payload(p_job_id, 'data/photo-metadata.json'))
  loop
    entity_type := case photo_payload ->> 'ownerType'
      when 'recipe' then 'recipe_photos'
      when 'cooking_session' then 'cooking_session_photos'
      else null
    end;
    if entity_type is null then
      raise exception 'unsupported restore photo owner type' using errcode = '22023';
    end if;

    case private.restore_merge_row(p_pair_id, p_actor_user_id, entity_type, photo_payload)
      when 'inserted' then total_inserted := total_inserted + 1;
      when 'noop' then total_noops := total_noops + 1;
      else total_conflicts := total_conflicts + 1;
    end case;
  end loop;

  update private.restore_jobs
     set status = 'completed',
         committed_at = now()
   where id = p_job_id;

  return query select total_inserted, total_noops, total_conflicts;
end;
$$;

revoke all on function public.commit_restore_merge(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.commit_restore_merge(uuid, uuid, uuid) to service_role;
