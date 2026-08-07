begin;

create extension if not exists pgtap with schema extensions;
select plan(6);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  '80000000-0000-4000-8000-000000000001',
  'authenticated', 'authenticated', 'resolver@example.test', '', now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now()
);

select set_config('test.pair_id', public.create_bootstrap_pair('80000000-0000-4000-8000-000000000001')::text, true);
update public.pair_members set activated_at = now()
 where pair_id = current_setting('test.pair_id')::uuid;

insert into public.recipes (
  id, pair_id, title, favorite, want_to_make, source_kind, created_by, revision
) values (
  '81000000-0000-4000-8000-000000000001',
  current_setting('test.pair_id')::uuid,
  'Remoto atual', false, false, 'manual',
  '80000000-0000-4000-8000-000000000001', 0
);

insert into public.conflicts (
  id, pair_id, entity_type, entity_id, base_revision,
  base_payload, local_payload, remote_payload
) values (
  '82000000-0000-4000-8000-000000000001',
  current_setting('test.pair_id')::uuid,
  'recipes', '81000000-0000-4000-8000-000000000001', 0,
  jsonb_build_object(
    'id', '81000000-0000-4000-8000-000000000001',
    'pair_id', current_setting('test.pair_id'), 'revision', 0,
    'title', 'Base', 'favorite', 0, 'want_to_make', 0,
    'source_kind', 'manual', 'created_by', '80000000-0000-4000-8000-000000000001'
  ),
  jsonb_build_object(
    'pair_id', current_setting('test.pair_id'), 'revision', 0,
    'title', 'Local escolhido', 'favorite', 0, 'want_to_make', 0,
    'source_kind', 'manual', 'created_by', '80000000-0000-4000-8000-000000000001'
  ),
  private.to_client_mutation_payload(
    'recipes',
    (select to_jsonb(r) from public.recipes r where r.id = '81000000-0000-4000-8000-000000000001')
  )
);

select set_config(
  'request.jwt.claims',
  json_build_object('sub', '80000000-0000-4000-8000-000000000001', 'role', 'authenticated')::text,
  true
);
set local role authenticated;

select is(
  (select result_status from public.resolve_conflict(
    '82000000-0000-4000-8000-000000000001', 'choose_local', null
  )),
  'resolved',
  'choose_local resolves only against the still-current remote version'
);

select is(
  (select title from public.recipes where id = '81000000-0000-4000-8000-000000000001'),
  'Local escolhido',
  'choose_local applies the local field values'
);

select is(
  (select status from public.conflicts where id = '82000000-0000-4000-8000-000000000001'),
  'resolved',
  'resolved conflict is marked explicitly'
);

reset role;

insert into public.conflicts (
  id, pair_id, entity_type, entity_id, base_revision,
  base_payload, local_payload, remote_payload
) values (
  '82000000-0000-4000-8000-000000000002',
  current_setting('test.pair_id')::uuid,
  'recipes', '81000000-0000-4000-8000-000000000001', 1,
  private.to_client_mutation_payload('recipes', (select to_jsonb(r) from public.recipes r where r.id = '81000000-0000-4000-8000-000000000001')),
  jsonb_build_object(
    'pair_id', current_setting('test.pair_id'), 'revision', 1,
    'title', 'Outro local', 'favorite', 0, 'want_to_make', 0,
    'source_kind', 'manual', 'created_by', '80000000-0000-4000-8000-000000000001'
  ),
  private.to_client_mutation_payload('recipes', (select to_jsonb(r) from public.recipes r where r.id = '81000000-0000-4000-8000-000000000001'))
);

update public.recipes
   set favorite = true, revision = revision + 1, updated_at = now()
 where id = '81000000-0000-4000-8000-000000000001';

set local role authenticated;

select is(
  (select result_status from public.resolve_conflict(
    '82000000-0000-4000-8000-000000000002', 'choose_remote', null
  )),
  'refreshed',
  'resolution refreshes instead of applying against a newer remote row'
);

select is(
  (select (remote_payload ->> 'favorite')::integer from public.conflicts where id = '82000000-0000-4000-8000-000000000002'),
  1,
  'refreshed conflict stores the newest canonical remote payload'
);

select is(
  (select status from public.conflicts where id = '82000000-0000-4000-8000-000000000002'),
  'open',
  'refreshed conflict remains open for a new explicit decision'
);

reset role;
select * from finish();
rollback;
