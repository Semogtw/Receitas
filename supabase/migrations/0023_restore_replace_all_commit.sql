create or replace function private.restore_replace_patch_client_row(
  p_entity_type text,
  p_entity_id uuid,
  p_pair_id uuid,
  p_client_payload jsonb,
  p_new_revision bigint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  remote_patch jsonb := private.to_remote_mutation_payload(
    p_entity_type,
    p_client_payload - 'id' - 'pair_id' - 'revision' - 'created_at' - 'updated_at'
  );
  assignments text;
  sql_text text;
begin
  if not private.restore_supported_entity(p_entity_type) then
    raise exception 'unsupported replace restore entity type' using errcode = '22023';
  end if;
  perform private.assert_payload_columns(p_entity_type, remote_patch);

  select string_agg(format('%1$I = src.%1$I', key), ', ' order by key)
    into assignments
    from jsonb_object_keys(remote_patch) as keys(key);

  assignments := concat_ws(', ', assignments, format('revision = %s', p_new_revision), 'updated_at = now()');
  sql_text := format(
    'update public.%1$I as target set %2$s '
    || 'from jsonb_populate_record(null::public.%1$I, $2) as src '
    || 'where target.id = $1 and target.pair_id = $3',
    p_entity_type,
    assignments
  );
  execute sql_text using p_entity_id, remote_patch, p_pair_id;
  if not found then
    raise exception 'replace restore target disappeared' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function private.restore_replace_row(
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
begin
  if not private.restore_supported_entity(p_entity_type) then
    raise exception 'unsupported replace restore entity type' using errcode = '22023';
  end if;
  begin
    entity_id := (p_source ->> 'id')::uuid;
  exception when others then
    raise exception 'invalid replace restore entity id' using errcode = '22023';
  end;

  execute format('select t.pair_id from public.%I t where t.id = $1', p_entity_type)
    into any_pair_id using entity_id;
  if any_pair_id is not null and any_pair_id is distinct from p_pair_id then
    raise exception 'replace restore stable id collides with another pair' using errcode = '23505';
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
      raise exception 'replace restore natural-key collision for % %', p_entity_type, entity_id using errcode = '23505';
    end;
    return 'inserted';
  end if;

  current_revision := (current_payload ->> 'revision')::bigint;
  perform private.restore_replace_patch_client_row(
    p_entity_type,
    entity_id,
    p_pair_id,
    incoming_payload,
    current_revision + 1
  );
  return 'updated';
end;
$$;

create or replace function private.restore_replace_file(
  p_job_id uuid,
  p_pair_id uuid,
  p_actor_user_id uuid,
  p_path text,
  p_entity_type text
)
returns table (inserted integer, updated integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_payload jsonb;
  action text;
  inserted_count integer := 0;
  updated_count integer := 0;
begin
  for row_payload in
    select value from jsonb_array_elements(private.restore_file_payload(p_job_id, p_path))
  loop
    action := private.restore_replace_row(p_pair_id, p_actor_user_id, p_entity_type, row_payload);
    if action = 'inserted' then inserted_count := inserted_count + 1;
    else updated_count := updated_count + 1;
    end if;
  end loop;
  return query select inserted_count, updated_count;
end;
$$;

create or replace function private.restore_soft_delete_current_state(p_pair_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'recipe_categories',
    'cooking_session_ratings',
    'recipe_photos',
    'cooking_session_photos',
    'recipe_ingredients',
    'recipe_steps',
    'meal_plan_entries',
    'shopping_items',
    'cooking_sessions',
    'ingredient_conversion_profiles',
    'meal_periods',
    'shopping_lists',
    'categories',
    'recipes',
    'imports'
  ]
  loop
    execute format(
      'update public.%I set deleted_at = now(), updated_at = now(), revision = revision + 1 '
      || 'where pair_id = $1 and deleted_at is null',
      table_name
    ) using p_pair_id;
  end loop;
end;
$$;

create or replace function private.restore_close_open_conflicts(
  p_pair_id uuid,
  p_actor_user_id uuid,
  p_replace_job_id uuid
)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.conflicts
     set status = 'resolved',
         resolution = 'merged',
         resolved_payload = jsonb_build_object(
           '_state', 'superseded_by_replace_all',
           'restore_job_id', p_replace_job_id::text
         ),
         resolved_at = now(),
         resolved_by = p_actor_user_id
   where pair_id = p_pair_id
     and status = 'open';
$$;

create or replace function public.mark_restore_media_promoted(
  p_job_id uuid,
  p_pair_id uuid,
  p_actor_user_id uuid,
  p_path text,
  p_promoted_storage_path text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  job private.restore_jobs%rowtype;
begin
  select * into job
    from private.restore_jobs j
   where j.id = p_job_id and j.pair_id = p_pair_id
   for update;
  if not found then raise exception 'restore job not found' using errcode = 'P0002'; end if;
  if job.created_by is distinct from p_actor_user_id then raise exception 'restore actor mismatch' using errcode = '42501'; end if;
  if job.status <> 'ready_to_commit' then raise exception 'restore job is not ready for media promotion' using errcode = '22023'; end if;
  if job.mode = 'replace_all' and job.safety_backup_id is null then
    raise exception 'replace restore requires attached safety backup before media promotion' using errcode = '22023';
  end if;
  if job.mode not in ('merge', 'replace_all') then raise exception 'restore mode does not support media promotion' using errcode = '22023'; end if;
  if p_promoted_storage_path not like (p_pair_id::text || '/' || p_actor_user_id::text || '/restore/%') then
    raise exception 'promoted media path escapes restore namespace' using errcode = '42501';
  end if;

  update private.restore_staged_media
     set promoted_storage_path = p_promoted_storage_path,
         promoted_at = now()
   where job_id = p_job_id and path = p_path;
  if not found then raise exception 'staged restore media not found' using errcode = 'P0002'; end if;
end;
$$;

revoke all on function public.mark_restore_media_promoted(uuid, uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.mark_restore_media_promoted(uuid, uuid, uuid, text, text) to service_role;

create or replace function public.commit_restore_replace_all_checked(
  p_job_id uuid,
  p_pair_id uuid,
  p_actor_user_id uuid
)
returns table (
  inserted_count integer,
  updated_count integer,
  replaced_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  job private.restore_jobs%rowtype;
  safety_job private.restore_jobs%rowtype;
  expected_media integer;
  staged_media integer;
  promoted_media integer;
  before_active integer;
  counters record;
  total_inserted integer := 0;
  total_updated integer := 0;
  photo_payload jsonb;
  entity_type text;
begin
  select * into job
    from private.restore_jobs j
   where j.id = p_job_id and j.pair_id = p_pair_id
   for update;
  if not found then raise exception 'replace restore job not found' using errcode = 'P0002'; end if;
  if job.created_by is distinct from p_actor_user_id then raise exception 'restore actor mismatch' using errcode = '42501'; end if;
  if job.mode <> 'replace_all' or job.status <> 'ready_to_commit' then
    raise exception 'replace restore job is not ready to commit' using errcode = '22023';
  end if;
  if job.safety_backup_id is null then raise exception 'replace restore requires safety backup' using errcode = '22023'; end if;
  if job.expires_at <= now() then raise exception 'replace restore job expired' using errcode = '22023'; end if;

  select * into safety_job
    from private.restore_jobs j
   where j.id = job.safety_backup_id and j.pair_id = p_pair_id
   for update;
  if not found
     or not safety_job.is_safety_backup
     or safety_job.status <> 'ready_to_commit'
     or safety_job.created_by is distinct from p_actor_user_id
     or safety_job.expires_at <= now() then
    raise exception 'attached safety backup is not valid' using errcode = '22023';
  end if;

  if not private.restore_safety_matches_current(safety_job.id, p_pair_id) then
    raise exception 'canonical state changed after safety backup validation' using errcode = '40001';
  end if;
  if not exists (
    select 1 from public.pair_members pm
     where pm.pair_id = p_pair_id
       and pm.user_id = p_actor_user_id
       and pm.activated_at is not null
       and pm.removed_at is null
  ) then
    raise exception 'active restore membership required' using errcode = '42501';
  end if;

  expected_media := jsonb_array_length(coalesce(job.manifest -> 'mediaFiles', '[]'::jsonb));
  select count(*)::integer,
         count(*) filter (where promoted_at is not null and promoted_storage_path is not null)::integer
    into staged_media, promoted_media
    from private.restore_staged_media
   where job_id = p_job_id;
  if staged_media <> expected_media or promoted_media <> expected_media then
    raise exception 'all replace restore media must be promoted before commit' using errcode = '22023';
  end if;

  select (
    (select count(*) from public.recipes where pair_id = p_pair_id and deleted_at is null)
    + (select count(*) from public.categories where pair_id = p_pair_id and deleted_at is null)
    + (select count(*) from public.cooking_sessions where pair_id = p_pair_id and deleted_at is null)
    + (select count(*) from public.meal_plan_entries where pair_id = p_pair_id and deleted_at is null)
    + (select count(*) from public.shopping_lists where pair_id = p_pair_id and deleted_at is null)
    + (select count(*) from public.shopping_items where pair_id = p_pair_id and deleted_at is null)
  )::integer into before_active;

  update private.restore_jobs set status = 'committing' where id = p_job_id;
  perform private.restore_soft_delete_current_state(p_pair_id);

  for counters in select * from private.restore_replace_file(p_job_id,p_pair_id,p_actor_user_id,'data/recipes.json','recipes')
  loop total_inserted:=total_inserted+counters.inserted; total_updated:=total_updated+counters.updated; end loop;
  for counters in select * from private.restore_replace_file(p_job_id,p_pair_id,p_actor_user_id,'data/categories.json','categories')
  loop total_inserted:=total_inserted+counters.inserted; total_updated:=total_updated+counters.updated; end loop;
  for counters in select * from private.restore_replace_file(p_job_id,p_pair_id,p_actor_user_id,'data/meal-periods.json','meal_periods')
  loop total_inserted:=total_inserted+counters.inserted; total_updated:=total_updated+counters.updated; end loop;
  for counters in select * from private.restore_replace_file(p_job_id,p_pair_id,p_actor_user_id,'data/shopping-lists.json','shopping_lists')
  loop total_inserted:=total_inserted+counters.inserted; total_updated:=total_updated+counters.updated; end loop;
  for counters in select * from private.restore_replace_file(p_job_id,p_pair_id,p_actor_user_id,'data/conversion-profiles.json','ingredient_conversion_profiles')
  loop total_inserted:=total_inserted+counters.inserted; total_updated:=total_updated+counters.updated; end loop;
  for counters in select * from private.restore_replace_file(p_job_id,p_pair_id,p_actor_user_id,'data/recipe-ingredients.json','recipe_ingredients')
  loop total_inserted:=total_inserted+counters.inserted; total_updated:=total_updated+counters.updated; end loop;
  for counters in select * from private.restore_replace_file(p_job_id,p_pair_id,p_actor_user_id,'data/recipe-steps.json','recipe_steps')
  loop total_inserted:=total_inserted+counters.inserted; total_updated:=total_updated+counters.updated; end loop;
  for counters in select * from private.restore_replace_file(p_job_id,p_pair_id,p_actor_user_id,'data/recipe-categories.json','recipe_categories')
  loop total_inserted:=total_inserted+counters.inserted; total_updated:=total_updated+counters.updated; end loop;
  for counters in select * from private.restore_replace_file(p_job_id,p_pair_id,p_actor_user_id,'data/cooking-sessions.json','cooking_sessions')
  loop total_inserted:=total_inserted+counters.inserted; total_updated:=total_updated+counters.updated; end loop;
  for counters in select * from private.restore_replace_file(p_job_id,p_pair_id,p_actor_user_id,'data/cooking-session-ratings.json','cooking_session_ratings')
  loop total_inserted:=total_inserted+counters.inserted; total_updated:=total_updated+counters.updated; end loop;
  for counters in select * from private.restore_replace_file(p_job_id,p_pair_id,p_actor_user_id,'data/meal-plan-entries.json','meal_plan_entries')
  loop total_inserted:=total_inserted+counters.inserted; total_updated:=total_updated+counters.updated; end loop;
  for counters in select * from private.restore_replace_file(p_job_id,p_pair_id,p_actor_user_id,'data/shopping-items.json','shopping_items')
  loop total_inserted:=total_inserted+counters.inserted; total_updated:=total_updated+counters.updated; end loop;

  for photo_payload in select value from jsonb_array_elements(private.restore_file_payload(p_job_id,'data/photo-metadata.json'))
  loop
    entity_type := case photo_payload ->> 'ownerType'
      when 'recipe' then 'recipe_photos'
      when 'cooking_session' then 'cooking_session_photos'
      else null
    end;
    if entity_type is null then raise exception 'unsupported replace photo owner type' using errcode = '22023'; end if;
    if private.restore_replace_row(p_pair_id,p_actor_user_id,entity_type,photo_payload) = 'inserted'
      then total_inserted:=total_inserted+1; else total_updated:=total_updated+1; end if;
  end loop;

  perform private.restore_close_open_conflicts(p_pair_id, p_actor_user_id, p_job_id);
  update private.restore_jobs set status='completed', committed_at=now() where id=p_job_id;

  return query select total_inserted, total_updated, before_active;
end;
$$;

revoke all on function public.commit_restore_replace_all_checked(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.commit_restore_replace_all_checked(uuid, uuid, uuid) to service_role;
