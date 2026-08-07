begin;

create extension if not exists pgtap with schema extensions;
select plan(7);

select is(
  (select public from storage.buckets where id = 'recipe-media'),
  false,
  'recipe media bucket is private'
);

select is(
  (select file_size_limit from storage.buckets where id = 'recipe-media'),
  20971520::bigint,
  'recipe media bucket caps objects at 20 MiB'
);

select ok(
  (select allowed_mime_types @> array['image/jpeg','image/png','image/webp']::text[] from storage.buckets where id = 'recipe-media'),
  'bucket allowlist contains the primary web image MIME types'
);

select is(
  (select count(*)::integer from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'recipe_media_select_pair'),
  1,
  'pair-scoped read policy exists'
);

select is(
  (select count(*)::integer from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'recipe_media_insert_member_namespace'),
  1,
  'member-scoped upload policy exists'
);

select is(
  (select count(*)::integer from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'recipe_media_%' and cmd = 'UPDATE'),
  0,
  'browser receives no overwrite policy for media objects'
);

select is(
  (select count(*)::integer from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'recipe_media_%' and cmd = 'DELETE'),
  0,
  'browser receives no physical delete policy for media objects'
);

select * from finish();
rollback;
