insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
) values (
  'recipe-media',
  'recipe-media',
  false,
  20971520,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif'
  ]::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy recipe_media_select_pair
on storage.objects
for select
to authenticated
using (
  bucket_id = 'recipe-media'
  and array_length(storage.foldername(name), 1) >= 2
  and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and public.is_pair_member(((storage.foldername(name))[1])::uuid)
);

create policy recipe_media_insert_member_namespace
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'recipe-media'
  and array_length(storage.foldername(name), 1) >= 2
  and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and public.is_pair_member(((storage.foldername(name))[1])::uuid)
  and (storage.foldername(name))[2] = auth.uid()::text
);

-- Object content is immutable from the browser. A replacement receives a new
-- photo id/path; permanent object deletion is a privileged cleanup operation.
-- Therefore no authenticated UPDATE or DELETE policy is intentionally created.
