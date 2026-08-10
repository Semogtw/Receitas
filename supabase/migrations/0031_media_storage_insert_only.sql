-- Align the canonical recipe-media bucket with the current client contract:
-- browser clients may read pair media and create new immutable objects, but may
-- not overwrite or physically delete existing objects. Retries verify an exact
-- existing object client-side instead of requiring UPDATE permission.

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'recipe-media',
  'recipe-media',
  false,
  20971520,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Remove the original broad pair policies from 0015 before installing the
-- immutable-object policy set.
drop policy if exists "recipe media active pair read" on storage.objects;
drop policy if exists "recipe media active pair insert" on storage.objects;
drop policy if exists "recipe media active pair update" on storage.objects;
drop policy if exists "recipe media active pair delete" on storage.objects;

drop policy if exists recipe_media_select_pair on storage.objects;
create policy recipe_media_select_pair
on storage.objects
for select
to authenticated
using (
  bucket_id = 'recipe-media'
  and (storage.foldername(name))[1] = 'pairs'
  and exists (
    select 1
      from public.pair_members pm
     where pm.pair_id::text = (storage.foldername(name))[2]
       and pm.user_id = (select auth.uid())
       and pm.activated_at is not null
       and pm.removed_at is null
  )
);

drop policy if exists recipe_media_insert_member_namespace on storage.objects;
create policy recipe_media_insert_member_namespace
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'recipe-media'
  and array_length(storage.foldername(name), 1) = 4
  and (storage.foldername(name))[1] = 'pairs'
  and (storage.foldername(name))[3] in ('recipes', 'cooking-sessions')
  and exists (
    select 1
      from public.pair_members pm
     where pm.pair_id::text = (storage.foldername(name))[2]
       and pm.user_id = (select auth.uid())
       and pm.activated_at is not null
       and pm.removed_at is null
  )
);

-- Defense in depth: browser roles must not receive any UPDATE/DELETE policy for
-- recipe-media. Physical cleanup is a privileged server operation after the
-- canonical metadata lifecycle says the object is safe to remove.
