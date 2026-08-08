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
  10485760,
  array['image/webp', 'image/jpeg']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "recipe media active pair read" on storage.objects;
create policy "recipe media active pair read"
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
       and pm.user_id = auth.uid()
       and pm.activated_at is not null
       and pm.removed_at is null
  )
);

drop policy if exists "recipe media active pair insert" on storage.objects;
create policy "recipe media active pair insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'recipe-media'
  and (storage.foldername(name))[1] = 'pairs'
  and exists (
    select 1
      from public.pair_members pm
     where pm.pair_id::text = (storage.foldername(name))[2]
       and pm.user_id = auth.uid()
       and pm.activated_at is not null
       and pm.removed_at is null
  )
);

drop policy if exists "recipe media active pair update" on storage.objects;
create policy "recipe media active pair update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'recipe-media'
  and (storage.foldername(name))[1] = 'pairs'
  and exists (
    select 1
      from public.pair_members pm
     where pm.pair_id::text = (storage.foldername(name))[2]
       and pm.user_id = auth.uid()
       and pm.activated_at is not null
       and pm.removed_at is null
  )
)
with check (
  bucket_id = 'recipe-media'
  and (storage.foldername(name))[1] = 'pairs'
  and exists (
    select 1
      from public.pair_members pm
     where pm.pair_id::text = (storage.foldername(name))[2]
       and pm.user_id = auth.uid()
       and pm.activated_at is not null
       and pm.removed_at is null
  )
);

drop policy if exists "recipe media active pair delete" on storage.objects;
create policy "recipe media active pair delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'recipe-media'
  and (storage.foldername(name))[1] = 'pairs'
  and exists (
    select 1
      from public.pair_members pm
     where pm.pair_id::text = (storage.foldername(name))[2]
       and pm.user_id = auth.uid()
       and pm.activated_at is not null
       and pm.removed_at is null
  )
);
