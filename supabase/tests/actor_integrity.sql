begin;

create extension if not exists pgtap with schema extensions;
select plan(7);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '60000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'actor-one@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '60000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'actor-two@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

select set_config('test.pair_id', public.create_bootstrap_pair('60000000-0000-0000-0000-000000000001')::text, true);
update public.pair_members set activated_at = now()
 where pair_id = current_setting('test.pair_id')::uuid
   and user_id = '60000000-0000-0000-0000-000000000001';
insert into public.pair_members (pair_id, user_id, activated_at)
values (current_setting('test.pair_id')::uuid, '60000000-0000-0000-0000-000000000002', now());

select set_config(
  'request.jwt.claims',
  json_build_object('sub', '60000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text,
  true
);
set local role authenticated;

select throws_ok(
  format(
    $$insert into public.recipes (id, pair_id, title, created_by)
      values ('61000000-0000-0000-0000-000000000001', %L::uuid, 'Autoria forjada', '60000000-0000-0000-0000-000000000002')$$,
    current_setting('test.pair_id')
  ),
  '42501', null,
  'recipe insert cannot attribute creation to the other member'
);

select lives_ok(
  format(
    $$insert into public.recipes (id, pair_id, title, created_by)
      values ('61000000-0000-0000-0000-000000000001', %L::uuid, 'Autoria correta', '60000000-0000-0000-0000-000000000001')$$,
    current_setting('test.pair_id')
  ),
  'member can create recipe attributed to self'
);

select throws_ok(
  $$update public.recipes
       set created_by = '60000000-0000-0000-0000-000000000002'
     where id = '61000000-0000-0000-0000-000000000001'$$,
  'P0001', 'actor attribution is immutable',
  'recipe actor attribution cannot be rewritten later'
);

select throws_ok(
  format(
    $$insert into public.recipe_photos (
      id, pair_id, recipe_id, storage_path, mime_type, created_by
    ) values (
      '62000000-0000-0000-0000-000000000001', %L::uuid,
      '61000000-0000-0000-0000-000000000001', 'pair/user/photo.jpg', 'image/jpeg',
      '60000000-0000-0000-0000-000000000002'
    )$$,
    current_setting('test.pair_id')
  ),
  '42501', null,
  'recipe photo insert cannot forge creator'
);

select throws_ok(
  format(
    $$insert into public.cooking_sessions (
      id, pair_id, recipe_id, recorded_by, prepared_at, recipe_snapshot
    ) values (
      '63000000-0000-0000-0000-000000000001', %L::uuid,
      '61000000-0000-0000-0000-000000000001',
      '60000000-0000-0000-0000-000000000002', now(),
      '{"title":"Autoria correta","ingredients":[],"steps":[]}'::jsonb
    )$$,
    current_setting('test.pair_id')
  ),
  '42501', null,
  'cooking session cannot forge recorded_by'
);

select lives_ok(
  format(
    $$insert into public.cooking_sessions (
      id, pair_id, recipe_id, recorded_by, prepared_at, recipe_snapshot
    ) values (
      '63000000-0000-0000-0000-000000000001', %L::uuid,
      '61000000-0000-0000-0000-000000000001',
      '60000000-0000-0000-0000-000000000001', now(),
      '{"title":"Autoria correta","ingredients":[],"steps":[]}'::jsonb
    )$$,
    current_setting('test.pair_id')
  ),
  'member can create cooking session attributed to self'
);

select throws_ok(
  format(
    $$insert into public.imports (
      id, pair_id, created_by, source_kind, status
    ) values (
      '64000000-0000-0000-0000-000000000001', %L::uuid,
      '60000000-0000-0000-0000-000000000002', 'text', 'draft'
    )$$,
    current_setting('test.pair_id')
  ),
  '42501', null,
  'import insert cannot forge creator'
);

reset role;
select * from finish();
rollback;
