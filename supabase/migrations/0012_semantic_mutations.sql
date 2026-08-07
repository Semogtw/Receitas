create table private.applied_mutations (
  mutation_id uuid primary key,
  pair_id uuid not null references public.pairs(id) on delete restrict,
  actor_user_id uuid not null,
  entity_type text not null,
  entity_id uuid not null,
  operation text not null check (operation in ('create', 'update', 'soft_delete')),
  base_revision bigint,
  base_payload jsonb,
  next_payload jsonb not null,
  result_status text not null check (result_status in ('applied', 'conflict_created')),
  resulting_revision bigint,
  conflict_id uuid references public.conflicts(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (
    (result_status = 'applied' and resulting_revision is not null and conflict_id is null)
    or (result_status = 'conflict_created' and conflict_id is not null)
  )
);

create index applied_mutations_pair_created_idx
  on private.applied_mutations(pair_id, created_at desc);

create or replace function private.valid_sync_entity(entity_type text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select entity_type = any(array[
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
  ]::text[]);
$$;

create or replace function private.to_client_mutation_payload(entity_type text, payload jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  result jsonb := coalesce(payload, '{}'::jsonb);
  field_name text;
  boolean_fields text[] := case entity_type
    when 'recipes' then array['favorite', 'want_to_make']
    when 'recipe_ingredients' then array['is_approximate', 'is_optional']
    when 'recipe_photos' then array['is_cover']
    when 'ingredient_conversion_profiles' then array['is_approximate']
    when 'shopping_lists' then array['is_default']
    when 'shopping_items' then array['checked']
    else array[]::text[]
  end;
  json_text_fields text[] := case entity_type
    when 'cooking_sessions' then array['recipe_snapshot']
    when 'imports' then array['extracted_payload', 'extraction_errors']
    when 'shopping_items' then array['source_refs']
    else array[]::text[]
  end;
begin
  foreach field_name in array boolean_fields loop
    if result ? field_name and jsonb_typeof(result -> field_name) = 'boolean' then
      result := jsonb_set(
        result,
        array[field_name],
        to_jsonb(case when (result ->> field_name)::boolean then 1 else 0 end),
        true
      );
    end if;
  end loop;

  foreach field_name in array json_text_fields loop
    if result ? field_name
       and result -> field_name <> 'null'::jsonb
       and jsonb_typeof(result -> field_name) <> 'string' then
      result := jsonb_set(result, array[field_name], to_jsonb((result -> field_name)::text), true);
    end if;
  end loop;

  return result;
end;
$$;

create or replace function private.to_remote_mutation_payload(entity_type text, payload jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  result jsonb := coalesce(payload, '{}'::jsonb);
  field_name text;
  boolean_value integer;
  boolean_fields text[] := case entity_type
    when 'recipes' then array['favorite', 'want_to_make']
    when 'recipe_ingredients' then array['is_approximate', 'is_optional']
    when 'recipe_photos' then array['is_cover']
    when 'ingredient_conversion_profiles' then array['is_approximate']
    when 'shopping_lists' then array['is_default']
    when 'shopping_items' then array['checked']
    else array[]::text[]
  end;
  json_text_fields text[] := case entity_type
    when 'cooking_sessions' then array['recipe_snapshot']
    when 'imports' then array['extracted_payload', 'extraction_errors']
    when 'shopping_items' then array['source_refs']
    else array[]::text[]
  end;
begin
  foreach field_name in array boolean_fields loop
    if result ? field_name and result -> field_name <> 'null'::jsonb then
      begin
        boolean_value := (result ->> field_name)::integer;
      exception when others then
        raise exception 'invalid boolean representation for %', field_name using errcode = '22023';
      end;
      if boolean_value not in (0, 1) then
        raise exception 'invalid boolean representation for %', field_name using errcode = '22023';
      end if;
      result := jsonb_set(result, array[field_name], to_jsonb(boolean_value = 1), true);
    end if;
  end loop;

  foreach field_name in array json_text_fields loop
    if result ? field_name and result -> field_name <> 'null'::jsonb then
      if jsonb_typeof(result -> field_name) <> 'string' then
        raise exception 'JSON field % must use canonical text representation', field_name using errcode = '22023';
      end if;
      begin
        result := jsonb_set(result, array[field_name], (result ->> field_name)::jsonb, true);
      exception when others then
        raise exception 'invalid JSON text for %', field_name using errcode = '22023';
      end;
    end if;
  end loop;

  return result;
end;
$$;

create or replace function private.jsonb_changed_keys(base_payload jsonb, candidate_payload jsonb)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(array_agg(key order by key), array[]::text[])
  from (
    select distinct key
    from jsonb_object_keys(coalesce(base_payload, '{}'::jsonb) || coalesce(candidate_payload, '{}'::jsonb)) as keys(key)
    where key not in ('id', 'pair_id', 'revision', 'created_at', 'updated_at')
      and coalesce(base_payload -> key, 'null'::jsonb)
          is distinct from coalesce(candidate_payload -> key, 'null'::jsonb)
  ) changed;
$$;

create or replace function private.jsonb_pick(payload jsonb, keys text[])
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(key, coalesce(payload -> key, 'null'::jsonb)), '{}'::jsonb)
  from unnest(keys) as selected(key);
$$;

create or replace function private.assert_payload_columns(entity_type text, payload jsonb)
returns void
language plpgsql
stable
set search_path = ''
as $$
declare
  bad_column text;
begin
  select key into bad_column
    from jsonb_object_keys(coalesce(payload, '{}'::jsonb)) as keys(key)
   where key in ('id', 'pair_id', 'revision')
      or not exists (
        select 1
          from information_schema.columns c
         where c.table_schema = 'public'
           and c.table_name = entity_type
           and c.column_name = key
      )
   limit 1;

  if bad_column is not null then
    raise exception 'unsupported mutation column: %', bad_column using errcode = '22023';
  end if;
end;
$$;

create or replace function private.insert_client_payload(
  entity_type text,
  entity_id uuid,
  pair_id uuid,
  client_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  remote_payload jsonb := private.to_remote_mutation_payload(entity_type, client_payload - 'id' - 'pair_id' - 'revision');
  column_list text;
  value_list text;
  sql_text text;
  inserted jsonb;
begin
  perform private.assert_payload_columns(entity_type, remote_payload);

  select
    string_agg(format('%I', key), ', ' order by key),
    string_agg(format('src.%I', key), ', ' order by key)
    into column_list, value_list
    from jsonb_object_keys(remote_payload) as keys(key);

  sql_text := format(
    'insert into public.%1$I as target (id, pair_id, revision%2$s) '
    || 'select $1, $2, 0%3$s from jsonb_populate_record(null::public.%1$I, $3) as src '
    || 'returning to_jsonb(target)',
    entity_type,
    case when column_list is null then '' else ', ' || column_list end,
    case when value_list is null then '' else ', ' || value_list end
  );

  execute sql_text into inserted using entity_id, pair_id, remote_payload;
  return private.to_client_mutation_payload(entity_type, inserted);
end;
$$;

create or replace function private.patch_client_payload(
  entity_type text,
  entity_id uuid,
  pair_id uuid,
  client_patch jsonb,
  new_revision bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  remote_patch jsonb := private.to_remote_mutation_payload(entity_type, client_patch - 'id' - 'pair_id' - 'revision' - 'created_at' - 'updated_at');
  assignments text;
  sql_text text;
  updated jsonb;
begin
  perform private.assert_payload_columns(entity_type, remote_patch);

  select string_agg(format('%1$I = src.%1$I', key), ', ' order by key)
    into assignments
    from jsonb_object_keys(remote_patch) as keys(key);

  assignments := concat_ws(', ', assignments, format('revision = %s', new_revision), 'updated_at = now()');

  sql_text := format(
    'update public.%1$I as target set %2$s '
    || 'from jsonb_populate_record(null::public.%1$I, $2) as src '
    || 'where target.id = $1 and target.pair_id = $3 '
    || 'returning to_jsonb(target)',
    entity_type,
    assignments
  );

  execute sql_text into updated using entity_id, remote_patch, pair_id;
  if updated is null then
    raise exception 'mutation target disappeared during update' using errcode = 'P0001';
  end if;
  return private.to_client_mutation_payload(entity_type, updated);
end;
$$;

create or replace function private.create_mutation_conflict(
  pair_id uuid,
  entity_type text,
  entity_id uuid,
  base_revision bigint,
  base_payload jsonb,
  local_payload jsonb,
  remote_payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  conflict_id uuid := gen_random_uuid();
begin
  insert into public.conflicts (
    id, pair_id, entity_type, entity_id, base_revision,
    base_payload, local_payload, remote_payload
  ) values (
    conflict_id, pair_id, entity_type, entity_id, base_revision,
    base_payload, local_payload, remote_payload
  );
  return conflict_id;
end;
$$;

create or replace function public.apply_client_mutation(
  p_mutation_id uuid,
  p_pair_id uuid,
  p_actor_user_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_operation text,
  p_base_revision bigint,
  p_base_payload jsonb,
  p_next_payload jsonb
)
returns table (
  result_status text,
  resulting_revision bigint,
  conflict_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  prior private.applied_mutations%rowtype;
  remote_payload jsonb;
  remote_revision bigint;
  next_revision bigint;
  base_revision_from_payload bigint;
  local_changes text[];
  remote_changes text[];
  local_delete boolean;
  remote_delete boolean;
  patch_payload jsonb;
  created_conflict_id uuid;
  actor_field text;
begin
  if current_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if p_actor_user_id is distinct from current_user_id then
    raise exception 'actor mismatch' using errcode = '42501';
  end if;
  if not public.is_pair_member(p_pair_id) then
    raise exception 'active pair membership required' using errcode = '42501';
  end if;
  if not private.valid_sync_entity(p_entity_type) then
    raise exception 'unsupported mutation entity type' using errcode = '22023';
  end if;
  if p_operation not in ('create', 'update', 'soft_delete') then
    raise exception 'unsupported mutation operation' using errcode = '22023';
  end if;
  if p_next_payload is null or jsonb_typeof(p_next_payload) <> 'object' then
    raise exception 'next payload must be an object' using errcode = '22023';
  end if;
  if p_next_payload ->> 'pair_id' is distinct from p_pair_id::text then
    raise exception 'payload pair mismatch' using errcode = '42501';
  end if;
  if not (p_next_payload ? 'revision') then
    raise exception 'payload revision required' using errcode = '22023';
  end if;

  begin
    next_revision := (p_next_payload ->> 'revision')::bigint;
  exception when others then
    raise exception 'invalid payload revision' using errcode = '22023';
  end;

  if next_revision is distinct from coalesce(p_base_revision, 0) then
    raise exception 'client payload revision must remain at base revision' using errcode = '22023';
  end if;

  if p_operation = 'create' then
    if p_base_revision is not null or p_base_payload is not null then
      raise exception 'create mutation cannot have a remote base' using errcode = '22023';
    end if;
  else
    if p_base_revision is null or p_base_payload is null or jsonb_typeof(p_base_payload) <> 'object' then
      raise exception 'existing entity mutation requires a base payload' using errcode = '22023';
    end if;
    if p_base_payload ->> 'pair_id' is distinct from p_pair_id::text then
      raise exception 'base pair mismatch' using errcode = '42501';
    end if;
    begin
      base_revision_from_payload := (p_base_payload ->> 'revision')::bigint;
    exception when others then
      raise exception 'invalid base payload revision' using errcode = '22023';
    end;
    if base_revision_from_payload is distinct from p_base_revision then
      raise exception 'base payload revision mismatch' using errcode = '22023';
    end if;
    if coalesce(p_base_payload -> 'created_at', 'null'::jsonb)
       is distinct from coalesce(p_next_payload -> 'created_at', 'null'::jsonb) then
      raise exception 'created_at is immutable' using errcode = '22023';
    end if;
  end if;

  if p_operation = 'soft_delete' and coalesce(p_next_payload -> 'deleted_at', 'null'::jsonb) = 'null'::jsonb then
    raise exception 'soft delete requires deleted_at' using errcode = '22023';
  end if;
  if p_operation = 'update'
     and coalesce(p_base_payload -> 'deleted_at', 'null'::jsonb)
         is distinct from coalesce(p_next_payload -> 'deleted_at', 'null'::jsonb) then
    raise exception 'deleted_at change requires soft_delete operation' using errcode = '22023';
  end if;

  actor_field := case p_entity_type
    when 'recipes' then 'created_by'
    when 'recipe_photos' then 'created_by'
    when 'cooking_sessions' then 'recorded_by'
    when 'cooking_session_photos' then 'created_by'
    when 'imports' then 'created_by'
    else null
  end;

  if p_entity_type = 'cooking_session_ratings' and p_next_payload ->> 'user_id' is distinct from current_user_id::text then
    raise exception 'rating user mismatch' using errcode = '42501';
  end if;
  if actor_field is not null then
    if p_operation = 'create' and p_next_payload ->> actor_field is distinct from current_user_id::text then
      raise exception 'create actor mismatch' using errcode = '42501';
    end if;
    if p_operation <> 'create'
       and coalesce(p_base_payload -> actor_field, 'null'::jsonb)
           is distinct from coalesce(p_next_payload -> actor_field, 'null'::jsonb) then
      raise exception 'historical actor is immutable' using errcode = '22023';
    end if;
  end if;

  select * into prior
    from private.applied_mutations am
   where am.mutation_id = p_mutation_id;

  if found then
    if prior.pair_id is distinct from p_pair_id
       or prior.actor_user_id is distinct from current_user_id
       or prior.entity_type is distinct from p_entity_type
       or prior.entity_id is distinct from p_entity_id
       or prior.operation is distinct from p_operation
       or prior.base_revision is distinct from p_base_revision
       or prior.base_payload is distinct from p_base_payload
       or prior.next_payload is distinct from p_next_payload then
      raise exception 'mutation id reused with different request' using errcode = '22023';
    end if;

    return query select prior.result_status, prior.resulting_revision, prior.conflict_id;
    return;
  end if;

  execute format(
    'select t.revision, private.to_client_mutation_payload($3, to_jsonb(t)) '
    || 'from public.%I t where t.id = $1 and t.pair_id = $2 for update',
    p_entity_type
  ) into remote_revision, remote_payload using p_entity_id, p_pair_id, p_entity_type;

  if p_operation = 'create' then
    if remote_payload is not null then
      created_conflict_id := private.create_mutation_conflict(
        p_pair_id, p_entity_type, p_entity_id, null, null, p_next_payload, remote_payload
      );
      insert into private.applied_mutations values (
        p_mutation_id, p_pair_id, current_user_id, p_entity_type, p_entity_id, p_operation,
        p_base_revision, p_base_payload, p_next_payload, 'conflict_created', null, created_conflict_id, now()
      );
      return query select 'conflict_created'::text, null::bigint, created_conflict_id;
      return;
    end if;

    remote_payload := private.insert_client_payload(p_entity_type, p_entity_id, p_pair_id, p_next_payload);
    remote_revision := 0;
    insert into private.applied_mutations values (
      p_mutation_id, p_pair_id, current_user_id, p_entity_type, p_entity_id, p_operation,
      p_base_revision, p_base_payload, p_next_payload, 'applied', remote_revision, null, now()
    );
    return query select 'applied'::text, remote_revision, null::uuid;
    return;
  end if;

  if remote_payload is null then
    created_conflict_id := private.create_mutation_conflict(
      p_pair_id,
      p_entity_type,
      p_entity_id,
      p_base_revision,
      p_base_payload,
      p_next_payload,
      jsonb_build_object('_state', 'missing', 'id', p_entity_id::text, 'pair_id', p_pair_id::text)
    );
    insert into private.applied_mutations values (
      p_mutation_id, p_pair_id, current_user_id, p_entity_type, p_entity_id, p_operation,
      p_base_revision, p_base_payload, p_next_payload, 'conflict_created', null, created_conflict_id, now()
    );
    return query select 'conflict_created'::text, null::bigint, created_conflict_id;
    return;
  end if;

  local_changes := private.jsonb_changed_keys(p_base_payload, p_next_payload);

  if remote_revision is distinct from p_base_revision then
    remote_changes := private.jsonb_changed_keys(p_base_payload, remote_payload);
    local_delete := 'deleted_at' = any(local_changes)
      and coalesce(p_next_payload -> 'deleted_at', 'null'::jsonb) <> 'null'::jsonb;
    remote_delete := 'deleted_at' = any(remote_changes)
      and coalesce(remote_payload -> 'deleted_at', 'null'::jsonb) <> 'null'::jsonb;

    if local_delete or remote_delete then
      if local_delete and remote_delete
         and local_changes <@ array['deleted_at']::text[]
         and remote_changes <@ array['deleted_at']::text[] then
        insert into private.applied_mutations values (
          p_mutation_id, p_pair_id, current_user_id, p_entity_type, p_entity_id, p_operation,
          p_base_revision, p_base_payload, p_next_payload, 'applied', remote_revision, null, now()
        );
        return query select 'applied'::text, remote_revision, null::uuid;
        return;
      end if;

      created_conflict_id := private.create_mutation_conflict(
        p_pair_id, p_entity_type, p_entity_id, p_base_revision, p_base_payload, p_next_payload, remote_payload
      );
      insert into private.applied_mutations values (
        p_mutation_id, p_pair_id, current_user_id, p_entity_type, p_entity_id, p_operation,
        p_base_revision, p_base_payload, p_next_payload, 'conflict_created', null, created_conflict_id, now()
      );
      return query select 'conflict_created'::text, null::bigint, created_conflict_id;
      return;
    end if;

    if local_changes && remote_changes then
      created_conflict_id := private.create_mutation_conflict(
        p_pair_id, p_entity_type, p_entity_id, p_base_revision, p_base_payload, p_next_payload, remote_payload
      );
      insert into private.applied_mutations values (
        p_mutation_id, p_pair_id, current_user_id, p_entity_type, p_entity_id, p_operation,
        p_base_revision, p_base_payload, p_next_payload, 'conflict_created', null, created_conflict_id, now()
      );
      return query select 'conflict_created'::text, null::bigint, created_conflict_id;
      return;
    end if;
  end if;

  if coalesce(array_length(local_changes, 1), 0) = 0 then
    insert into private.applied_mutations values (
      p_mutation_id, p_pair_id, current_user_id, p_entity_type, p_entity_id, p_operation,
      p_base_revision, p_base_payload, p_next_payload, 'applied', remote_revision, null, now()
    );
    return query select 'applied'::text, remote_revision, null::uuid;
    return;
  end if;

  patch_payload := private.jsonb_pick(p_next_payload, local_changes);
  remote_revision := remote_revision + 1;
  remote_payload := private.patch_client_payload(
    p_entity_type, p_entity_id, p_pair_id, patch_payload, remote_revision
  );

  insert into private.applied_mutations values (
    p_mutation_id, p_pair_id, current_user_id, p_entity_type, p_entity_id, p_operation,
    p_base_revision, p_base_payload, p_next_payload, 'applied', remote_revision, null, now()
  );
  return query select 'applied'::text, remote_revision, null::uuid;
end;
$$;

revoke all on function public.apply_client_mutation(uuid, uuid, uuid, text, uuid, text, bigint, jsonb, jsonb) from public, anon;
grant execute on function public.apply_client_mutation(uuid, uuid, uuid, text, uuid, text, bigint, jsonb, jsonb) to authenticated;

-- Once semantic mutation upload exists, direct authenticated writes would bypass
-- revision/conflict checks. Keep client read access but route all remote writes
-- through apply_client_mutation().
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
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
  ]
  loop
    execute format('revoke insert, update, delete on table public.%I from authenticated', table_name);
    execute format('grant select on table public.%I to authenticated', table_name);
  end loop;
end;
$$;
