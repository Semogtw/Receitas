begin;

create extension if not exists pgtap with schema extensions;
select plan(13);

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

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '81000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'storage-owner@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '81000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'storage-peer@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

insert into public.pairs (id, status) values
  ('82000000-0000-4000-8000-000000000001', 'open_for_second_member'),
  ('82000000-0000-4000-8000-000000000002', 'open_for_second_member');

insert into public.pair_members (pair_id, user_id, activated_at) values
  ('82000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000001', now()),
  ('82000000-0000-4000-8000-000000000002', '81000000-0000-4000-8000-000000000002', now());

insert into storage.objects (bucket_id, name) values
  ('recipe-media', 'pairs/82000000-0000-4000-8000-000000000001/recipes/83000000-0000-4000-8000-000000000001/84000000-0000-4000-8000-000000000001.webp'),
  ('recipe-media', 'pairs/82000000-0000-4000-8000-000000000002/recipes/83000000-0000-4000-8000-000000000002/84000000-0000-4000-8000-000000000002.webp'),
  ('recipe-media', '82000000-0000-4000-8000-000000000001/81000000-0000-4000-8000-000000000001/restore/85000000-0000-4000-8000-000000000001-a.webp'),
  ('recipe-media', '82000000-0000-4000-8000-000000000002/81000000-0000-4000-8000-000000000002/restore/85000000-0000-4000-8000-000000000002-b.webp');

select set_config(
  'request.jwt.claims',
  json_build_object('sub', '81000000-0000-4000-8000-000000000001', 'role', 'authenticated')::text,
  true
);
set local role authenticated;

select is(
  (select count(*)::integer
     from storage.objects
    where bucket_id = 'recipe-media'
      and name = 'pairs/82000000-0000-4000-8000-000000000001/recipes/83000000-0000-4000-8000-000000000001/84000000-0000-4000-8000-000000000001.webp'),
  1,
  'active member can read media from its own pair namespace'
);

select is(
  (select count(*)::integer
     from storage.objects
    where bucket_id = 'recipe-media'
      and name = 'pairs/82000000-0000-4000-8000-000000000002/recipes/83000000-0000-4000-8000-000000000002/84000000-0000-4000-8000-000000000002.webp'),
  0,
  'active member cannot read media from another pair namespace'
);

select is(
  (select count(*)::integer
     from storage.objects
    where bucket_id = 'recipe-media'
      and name = '82000000-0000-4000-8000-000000000001/81000000-0000-4000-8000-000000000001/restore/85000000-0000-4000-8000-000000000001-a.webp'),
  1,
  'active member can read content-addressed media restored into its own pair'
);

select is(
  (select count(*)::integer
     from storage.objects
    where bucket_id = 'recipe-media'
      and name = '82000000-0000-4000-8000-000000000002/81000000-0000-4000-8000-000000000002/restore/85000000-0000-4000-8000-000000000002-b.webp'),
  0,
  'active member cannot read restored media from another pair'
);

select lives_ok(
  $$insert into storage.objects (bucket_id, name) values (
    'recipe-media',
    'pairs/82000000-0000-4000-8000-000000000001/recipes/83000000-0000-4000-8000-000000000001/84000000-0000-4000-8000-000000000003.webp'
  )$$,
  'active member can upload a new immutable object inside its own canonical namespace'
);

select throws_ok(
  $$insert into storage.objects (bucket_id, name) values (
    'recipe-media',
    'pairs/82000000-0000-4000-8000-000000000002/recipes/83000000-0000-4000-8000-000000000002/84000000-0000-4000-8000-000000000004.webp'
  )$$,
  '42501',
  null,
  'active member cannot upload media into another pair namespace'
);

reset role;
select * from finish();
rollback;
