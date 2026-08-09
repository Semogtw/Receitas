create or replace function public.restore_media_path_is_referenced(p_storage_path text)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select
    exists (
      select 1
      from public.recipe_photos p
      where p.storage_path = p_storage_path
    )
    or exists (
      select 1
      from public.cooking_session_photos p
      where p.storage_path = p_storage_path
    )
    or exists (
      select 1
      from public.conflicts c
      where c.status = 'open'
        and c.entity_type in ('recipe_photos', 'cooking_session_photos')
        and (
          c.base_payload ->> 'storage_path' = p_storage_path
          or c.local_payload ->> 'storage_path' = p_storage_path
          or c.remote_payload ->> 'storage_path' = p_storage_path
        )
    );
$$;

revoke all on function public.restore_media_path_is_referenced(text) from public, anon, authenticated;
grant execute on function public.restore_media_path_is_referenced(text) to service_role;
