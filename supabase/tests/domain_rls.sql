begin;

create extension if not exists pgtap with schema extensions;
select plan(13);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '20000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'a1@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '20000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'a2@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '20000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'b1@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

select set_config('test.pair_a', public.create_bootstrap_pair('20000000-0000-0000-0000-000000000001')::text, true);
update public.pair_members set activated_at = now()
 where pair_id = current_setting('test.pair_a')::uuid;

insert into public.pair_members (pair_id, user_id, activated_at)
values (
  current_setting('test.pair_a')::uuid,
  '20000000-0000-0000-0000-000000000002',
  now()
);

insert into public.pairs (id)
values ('30000000-0000-0000-0000-000000000002');
insert into public.pair_members (pair_id, user_id, activated_at)
values (
  '30000000-0000-0000-0000-000000000002',
  '20000000-0000-0000-0000-000000000003',
  now()
);
select set_config('test.pair_b', '30000000-0000-0000-0000-000000000002', true);

select set_config(
  'request.jwt.claims',
  json_build_object('sub', '20000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text,
  true
);
set local role authenticated;

select lives_ok(
  format(
    $$insert into public.recipes (
      id, pair_id, title, created_by
    ) values (
      '40000000-0000-0000-0000-000000000001', %L::uuid, 'Bolo de teste',
      '20000000-0000-0000-0000-000000000001'
    )$$,
    current_setting('test.pair_a')
  ),
  'member can create a recipe in its pair'
);

select is(
  (select count(*)::integer from public.recipes where id = '40000000-0000-0000-0000-000000000001'),
  1,
  'member can read its own pair recipe'
);

reset role;
insert into public.recipes (id, pair_id, title, created_by)
values (
  '40000000-0000-0000-0000-000000000002',
  current_setting('test.pair_b')::uuid,
  'Receita de outro par',
  '20000000-0000-0000-0000-000000000003'
);

select set_config(
  'request.jwt.claims',
  json_build_object('sub', '20000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text,
  true
);
set local role authenticated;
select is(
  (select count(*)::integer from public.recipes where id = '40000000-0000-0000-0000-000000000002'),
  0,
  'member cannot read another pair recipe'
);
reset role;

insert into public.categories (id, pair_id, name)
values
  ('41000000-0000-0000-0000-000000000001', current_setting('test.pair_a')::uuid, 'Sobremesa'),
  ('41000000-0000-0000-0000-000000000002', current_setting('test.pair_b')::uuid, 'Outro par');

insert into public.recipe_categories (id, pair_id, recipe_id, category_id)
values (
  '42000000-0000-0000-0000-000000000001',
  current_setting('test.pair_a')::uuid,
  '40000000-0000-0000-0000-000000000001',
  '41000000-0000-0000-0000-000000000001'
);

select throws_ok(
  format(
    $$insert into public.recipe_categories (id, pair_id, recipe_id, category_id)
      values (
        '42000000-0000-0000-0000-000000000002', %L::uuid,
        '40000000-0000-0000-0000-000000000001',
        '41000000-0000-0000-0000-000000000002'
      )$$,
    current_setting('test.pair_a')
  ),
  '23503',
  null,
  'cross-pair recipe/category association is rejected'
);

insert into public.cooking_sessions (
  id, pair_id, recipe_id, recorded_by, prepared_at, recipe_snapshot
) values (
  '43000000-0000-0000-0000-000000000001',
  current_setting('test.pair_a')::uuid,
  '40000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  now(),
  '{"title":"Bolo de teste","ingredients":[],"steps":[]}'::jsonb
);

select set_config(
  'request.jwt.claims',
  json_build_object('sub', '20000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text,
  true
);
set local role authenticated;

select lives_ok(
  format(
    $$insert into public.cooking_session_ratings (
      id, pair_id, cooking_session_id, user_id, score, comment
    ) values (
      '44000000-0000-0000-0000-000000000001', %L::uuid,
      '43000000-0000-0000-0000-000000000001',
      '20000000-0000-0000-0000-000000000001', 8.5, 'Faria de novo'
    )$$,
    current_setting('test.pair_a')
  ),
  'member can create its own half-point rating'
);

select throws_ok(
  format(
    $$insert into public.cooking_session_ratings (
      id, pair_id, cooking_session_id, user_id, score
    ) values (
      '44000000-0000-0000-0000-000000000002', %L::uuid,
      '43000000-0000-0000-0000-000000000001',
      '20000000-0000-0000-0000-000000000001', 9.0
    )$$,
    current_setting('test.pair_a')
  ),
  '23505',
  null,
  'only one active rating per user and cooking session is allowed'
);

select throws_ok(
  format(
    $$insert into public.cooking_session_ratings (
      id, pair_id, cooking_session_id, user_id, score
    ) values (
      '44000000-0000-0000-0000-000000000003', %L::uuid,
      '43000000-0000-0000-0000-000000000001',
      '20000000-0000-0000-0000-000000000001', 8.3
    )$$,
    current_setting('test.pair_a')
  ),
  '23514',
  null,
  'rating score must use half-point increments'
);

select throws_ok(
  format(
    $$insert into public.cooking_session_ratings (
      id, pair_id, cooking_session_id, user_id, score
    ) values (
      '44000000-0000-0000-0000-000000000004', %L::uuid,
      '43000000-0000-0000-0000-000000000001',
      '20000000-0000-0000-0000-000000000002', 9.0
    )$$,
    current_setting('test.pair_a')
  ),
  '42501',
  null,
  'member cannot create or overwrite the other member rating'
);

update public.recipes
   set deleted_at = now()
 where id = '40000000-0000-0000-0000-000000000001';

select is(
  (select count(*)::integer from public.recipes where id = '40000000-0000-0000-0000-000000000001'),
  1,
  'soft-deleted recipe keeps its stable row and id'
);

insert into public.shopping_lists (id, pair_id, name, is_default)
values (
  '45000000-0000-0000-0000-000000000001',
  current_setting('test.pair_a')::uuid,
  'Mercado',
  true
);

select throws_ok(
  format(
    $$insert into public.shopping_lists (id, pair_id, name, is_default)
      values ('45000000-0000-0000-0000-000000000002', %L::uuid, 'Atacado', true)$$,
    current_setting('test.pair_a')
  ),
  '23505',
  null,
  'pair can have at most one active default shopping list'
);

reset role;
insert into public.conflicts (
  id, pair_id, entity_type, entity_id, base_revision,
  base_payload, local_payload, remote_payload
) values (
  '46000000-0000-0000-0000-000000000001',
  current_setting('test.pair_a')::uuid,
  'recipes',
  '40000000-0000-0000-0000-000000000001',
  0,
  '{"title":"Bolo"}',
  '{"title":"Bolo A"}',
  '{"title":"Bolo B"}'
);

set local role authenticated;
select is(
  (select local_payload ->> 'title' from public.conflicts where id = '46000000-0000-0000-0000-000000000001'),
  'Bolo A',
  'pair member can read preserved conflict versions'
);

select throws_ok(
  format(
    $$insert into public.conflicts (
      id, pair_id, entity_type, entity_id, local_payload, remote_payload
    ) values (
      '46000000-0000-0000-0000-000000000002', %L::uuid, 'recipes',
      '40000000-0000-0000-0000-000000000001', '{}'::jsonb, '{}'::jsonb
    )$$,
    current_setting('test.pair_a')
  ),
  '42501',
  null,
  'client cannot manufacture conflict records directly'
);
reset role;

select ok(
  not exists (
    select 1
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relname = any(array[
         'recipes', 'recipe_ingredients', 'recipe_steps', 'categories', 'recipe_categories',
         'recipe_photos', 'cooking_sessions', 'cooking_session_ratings', 'cooking_session_photos',
         'ingredient_conversion_profiles', 'imports', 'meal_periods', 'meal_plan_entries',
         'shopping_lists', 'shopping_items', 'conflicts'
       ])
       and c.relrowsecurity = false
  ),
  'RLS is enabled on every shared domain and conflict table'
);

select * from finish();
rollback;
