begin;

create extension if not exists pgtap with schema extensions;
select plan(6);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', 'b1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'media-owner@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

insert into public.pairs (id, status)
values ('b2000000-0000-4000-8000-000000000001', 'open_for_second_member');

insert into public.pair_members (pair_id, user_id, activated_at)
values ('b2000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', now());

insert into public.recipes (id, pair_id, title, created_by) values
  ('b3000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001', 'Receita A', 'b1000000-0000-4000-8000-000000000001'),
  ('b3000000-0000-4000-8000-000000000002', 'b2000000-0000-4000-8000-000000000001', 'Receita B', 'b1000000-0000-4000-8000-000000000001');

insert into public.cooking_sessions (
  id, pair_id, recipe_id, recorded_by, prepared_at, recipe_snapshot
) values (
  'b4000000-0000-4000-8000-000000000001',
  'b2000000-0000-4000-8000-000000000001',
  'b3000000-0000-4000-8000-000000000001',
  'b1000000-0000-4000-8000-000000000001',
  now(),
  '{}'::jsonb
);

select lives_ok(
  $$insert into public.recipe_photos (
      id, pair_id, recipe_id, storage_path, storage_state, mime_type,
      byte_size, width, height, sha256, created_by
    ) values (
      'b5000000-0000-4000-8000-000000000001',
      'b2000000-0000-4000-8000-000000000001',
      'b3000000-0000-4000-8000-000000000001',
      'pairs/b2000000-0000-4000-8000-000000000001/recipes/b3000000-0000-4000-8000-000000000001/b5000000-0000-4000-8000-000000000001.webp',
      'uploaded', 'image/webp', 100, 10, 10, repeat('a', 64),
      'b1000000-0000-4000-8000-000000000001'
    )$$,
  'normal recipe photo path is accepted when it matches pair, recipe, photo and MIME'
);

select lives_ok(
  $$insert into public.cooking_session_photos (
      id, pair_id, cooking_session_id, storage_path, storage_state, mime_type,
      byte_size, width, height, sha256, created_by
    ) values (
      'b5000000-0000-4000-8000-000000000002',
      'b2000000-0000-4000-8000-000000000001',
      'b4000000-0000-4000-8000-000000000001',
      'pairs/b2000000-0000-4000-8000-000000000001/cooking-sessions/b4000000-0000-4000-8000-000000000001/b5000000-0000-4000-8000-000000000002.jpg',
      'uploaded', 'image/jpeg', 100, 10, 10, repeat('b', 64),
      'b1000000-0000-4000-8000-000000000001'
    )$$,
  'normal cooking photo path is accepted when it matches session and MIME'
);

select throws_ok(
  $$insert into public.recipe_photos (
      id, pair_id, recipe_id, storage_path, storage_state, mime_type, created_by
    ) values (
      'b5000000-0000-4000-8000-000000000003',
      'b2000000-0000-4000-8000-000000000001',
      'b3000000-0000-4000-8000-000000000001',
      'pairs/c2000000-0000-4000-8000-000000000099/recipes/b3000000-0000-4000-8000-000000000001/b5000000-0000-4000-8000-000000000003.webp',
      'uploaded', 'image/webp',
      'b1000000-0000-4000-8000-000000000001'
    )$$,
  '23514',
  'media metadata storage path is not canonical',
  'metadata cannot point at another pair namespace'
);

select throws_ok(
  $$insert into public.recipe_photos (
      id, pair_id, recipe_id, storage_path, storage_state, mime_type, created_by
    ) values (
      'b5000000-0000-4000-8000-000000000004',
      'b2000000-0000-4000-8000-000000000001',
      'b3000000-0000-4000-8000-000000000001',
      'pairs/b2000000-0000-4000-8000-000000000001/recipes/b3000000-0000-4000-8000-000000000002/b5000000-0000-4000-8000-000000000004.webp',
      'uploaded', 'image/webp',
      'b1000000-0000-4000-8000-000000000001'
    )$$,
  '23514',
  'media metadata storage path is not canonical',
  'metadata cannot point at a different parent entity'
);

select lives_ok(
  $$insert into public.recipe_photos (
      id, pair_id, recipe_id, storage_path, storage_state, mime_type,
      sha256, created_by
    ) values (
      'b5000000-0000-4000-8000-000000000005',
      'b2000000-0000-4000-8000-000000000001',
      'b3000000-0000-4000-8000-000000000001',
      'b2000000-0000-4000-8000-000000000001/b1000000-0000-4000-8000-000000000001/restore/b5000000-0000-4000-8000-000000000005-cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc.webp',
      'uploaded', 'image/webp', repeat('c', 64),
      'b1000000-0000-4000-8000-000000000001'
    )$$,
  'content-addressed restore path is accepted when pair, actor, photo, checksum and MIME agree'
);

select throws_ok(
  $$insert into public.recipe_photos (
      id, pair_id, recipe_id, storage_path, storage_state, mime_type,
      sha256, created_by
    ) values (
      'b5000000-0000-4000-8000-000000000006',
      'b2000000-0000-4000-8000-000000000001',
      'b3000000-0000-4000-8000-000000000001',
      'b2000000-0000-4000-8000-000000000001/b1000000-0000-4000-8000-000000000001/restore/b5000000-0000-4000-8000-000000000006-dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd.webp',
      'uploaded', 'image/webp', repeat('e', 64),
      'b1000000-0000-4000-8000-000000000001'
    )$$,
  '23514',
  'media metadata storage path is not canonical',
  'restore metadata path must carry the row checksum'
);

select * from finish();
rollback;
