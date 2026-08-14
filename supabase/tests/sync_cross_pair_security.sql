begin;

create extension if not exists pgtap with schema extensions;
select plan(2);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '81000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'pair-a@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '81000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'pair-b@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

insert into public.pairs (id, status) values
  ('82000000-0000-4000-8000-000000000001', 'open_for_second_member'),
  ('82000000-0000-4000-8000-000000000002', 'open_for_second_member');

insert into public.pair_members (pair_id, user_id, activated_at) values
  ('82000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000001', now()),
  ('82000000-0000-4000-8000-000000000002', '81000000-0000-4000-8000-000000000002', now());

select set_config(
  'request.jwt.claims',
  json_build_object('sub', '81000000-0000-4000-8000-000000000001', 'role', 'authenticated')::text,
  true
);
set local role authenticated;

select throws_ok(
  $$select * from public.apply_client_mutation(
    '83000000-0000-4000-8000-000000000001',
    '82000000-0000-4000-8000-000000000002',
    '81000000-0000-4000-8000-000000000001',
    'recipes',
    '84000000-0000-4000-8000-000000000001',
    'create',
    null,
    null,
    jsonb_build_object(
      'pair_id', '82000000-0000-4000-8000-000000000002',
      'revision', 0,
      'title', 'Tentativa cross-pair',
      'favorite', 0,
      'want_to_make', 0,
      'source_kind', 'manual',
      'created_by', '81000000-0000-4000-8000-000000000001'
    )
  )$$,
  '42501',
  'active pair membership required',
  'semantic mutation cannot target a pair the authenticated user does not belong to'
);

select throws_ok(
  $$select * from public.apply_client_mutation(
    '83000000-0000-4000-8000-000000000002',
    '82000000-0000-4000-8000-000000000001',
    '81000000-0000-4000-8000-000000000001',
    'recipes',
    '84000000-0000-4000-8000-000000000002',
    'create',
    null,
    null,
    jsonb_build_object(
      'pair_id', '82000000-0000-4000-8000-000000000002',
      'revision', 0,
      'title', 'Payload cross-pair',
      'favorite', 0,
      'want_to_make', 0,
      'source_kind', 'manual',
      'created_by', '81000000-0000-4000-8000-000000000001'
    )
  )$$,
  '42501',
  'payload pair mismatch',
  'semantic mutation cannot smuggle another pair id through the payload'
);

reset role;
select * from finish();
rollback;
