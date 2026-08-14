create or replace function private.enforce_media_metadata_storage_path()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  media_extension text;
  owner_folder text;
  owner_id uuid;
  expected_normal_path text;
  restore_pattern text;
begin
  media_extension := case new.mime_type
    when 'image/webp' then 'webp'
    when 'image/jpeg' then 'jpg'
    else null
  end;

  if media_extension is null then
    raise exception 'unsupported media metadata mime type' using errcode = '23514';
  end if;

  if tg_table_name = 'recipe_photos' then
    owner_folder := 'recipes';
    owner_id := new.recipe_id;
  elsif tg_table_name = 'cooking_session_photos' then
    owner_folder := 'cooking-sessions';
    owner_id := new.cooking_session_id;
  else
    raise exception 'unsupported media metadata table' using errcode = '23514';
  end if;

  expected_normal_path :=
    'pairs/' || new.pair_id::text
    || '/' || owner_folder
    || '/' || owner_id::text
    || '/' || new.id::text
    || '.' || media_extension;

  if new.storage_path = expected_normal_path then
    return new;
  end if;

  if new.sha256 is null or new.sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'media metadata storage path is not canonical' using errcode = '23514';
  end if;

  restore_pattern :=
    '^' || new.pair_id::text
    || '/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'
    || '/restore/' || new.id::text
    || '-' || lower(new.sha256)
    || '\\.' || media_extension
    || '$';

  if new.storage_path ~ restore_pattern then
    return new;
  end if;

  raise exception 'media metadata storage path is not canonical' using errcode = '23514';
end;
$$;

revoke all on function private.enforce_media_metadata_storage_path() from public, anon, authenticated;

drop trigger if exists recipe_photos_storage_path_integrity on public.recipe_photos;
create trigger recipe_photos_storage_path_integrity
before insert or update on public.recipe_photos
for each row execute function private.enforce_media_metadata_storage_path();

drop trigger if exists cooking_session_photos_storage_path_integrity on public.cooking_session_photos;
create trigger cooking_session_photos_storage_path_integrity
before insert or update on public.cooking_session_photos
for each row execute function private.enforce_media_metadata_storage_path();
