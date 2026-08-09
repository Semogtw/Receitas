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
  media_sha256 text;
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

    media_sha256 := lower(coalesce(result ->> 'sha256', ''));
    if media_sha256 !~ '^[0-9a-f]{64}$' then
      raise exception 'restore photo checksum is required' using errcode = '22023';
    end if;

    result := jsonb_set(
      result,
      '{storage_path}',
      to_jsonb(
        p_target_pair_id::text
        || '/' || p_restore_actor::text
        || '/restore/' || p_entity_id::text
        || '-' || media_sha256
        || '.' || media_extension
      ),
      true
    );
    result := jsonb_set(result, '{storage_state}', to_jsonb('uploaded'::text), true);
  end if;

  return result;
end;
$$;
