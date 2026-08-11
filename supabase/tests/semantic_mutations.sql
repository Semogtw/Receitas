begin;

create extension if not exists pgtap with schema extensions;
select plan(12);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '70000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'sync@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

select set_config('test.pair_id', public.create_bootstrap_pair('70000000-0000-4000-8000-000000000001')::text, true);
update public.pair_members
   set activated_at = now()
 where pair_id = current_setting('test.pair_id')::uuid
   and user_id = '70000000-0000-4000-8000-000000000001';

insert into public.pairs (id, status)
values ('73000000-0000-4000-8000-000000000001', 'open_for_second_member');

select set_config(
  'request.jwt.claims',
  json_build_object('sub', '70000000-0000-4000-8000-000000000001', 'role', 'authenticated')::text,
  true
);
set local role authenticated;

select is(
  (select result_status from public.apply_client_mutation(
    '71000000-0000-4000-8000-000000000001',
    current_setting('test.pair_id')::uuid,
    '70000000-0000-4000-8000-000000000001',
    'recipes',
    '72000000-0000-4000-8000-000000000001',
    'create',
    null,
    null,
    jsonb_build_object(
      'pair_id', current_setting('test.pair_id'),
      'revision', 0,
      'title', 'Bolo base',
      'favorite', 0,
      'want_to_make', 0,
      'source_kind', 'manual',
      'created_by', '70000000-0000-4000-8000-000000000001'
    )
  )),
  'applied',
  'create mutation is applied at revision zero'
);

select is(
  (select resulting_revision from public.apply_client_mutation(
    '71000000-0000-4000-8000-000000000001',
    current_setting('test.pair_id')::uuid,
    '70000000-0000-4000-8000-000000000001',
    'recipes',
    '72000000-0000-4000-8000-000000000001',
    'create',
    null,
    null,
    jsonb_build_object(
      'pair_id', current_setting('test.pair_id'),
      'revision', 0,
      'title', 'Bolo base',
      'favorite', 0,
      'want_to_make', 0,
      'source_kind', 'manual',
      'created_by', '70000000-0000-4000-8000-000000000001'
    )
  )),
  0::bigint,
  'retrying the same mutation id returns the original result'
);

select throws_ok(
  format(
    $$select * from public.apply_client_mutation(
      '71000000-0000-4000-8000-000000000001', %L::uuid,
      '70000000-0000-4000-8000-000000000001', 'recipes',
      '72000000-0000-4000-8000-000000000001', 'create', null, null,
      jsonb_build_object(
        'pair_id', %L, 'revision', 0, 'title', 'Payload diferente',
        'favorite', 0, 'want_to_make', 0, 'source_kind', 'manual',
        'created_by', '70000000-0000-4000-8000-000000000001'
      )
    )$$,
    current_setting('test.pair_id'), current_setting('test.pair_id')
  ),
  '22023', 'mutation id reused with different request',
  'mutation id cannot be reused for a different request'
);

select throws_ok(
  format(
    $$select * from public.apply_client_mutation(
      '71000000-0000-4000-8000-000000000099', %L::uuid,
      '70000000-0000-4000-8000-000000000099', 'recipes',
      '72000000-0000-4000-8000-000000000001', 'update', 0,
      jsonb_build_object('pair_id', %L, 'revision', 0, 'title', 'Bolo base', 'favorite', 0, 'created_by', '70000000-0000-4000-8000-000000000001'),
      jsonb_build_object('pair_id', %L, 'revision', 0, 'title', 'Bolo', 'favorite', 0, 'created_by', '70000000-0000-4000-8000-000000000001')
    )$$,
    current_setting('test.pair_id'), current_setting('test.pair_id'), current_setting('test.pair_id')
  ),
  '42501', 'actor mismatch',
  'mutation actor must equal the authenticated identity'
);

select throws_ok(
  $$select * from public.apply_client_mutation(
    '71000000-0000-4000-8000-000000000098',
    '73000000-0000-4000-8000-000000000001'::uuid,
    '70000000-0000-4000-8000-000000000001',
    'recipes',
    '72000000-0000-4000-8000-000000000098',
    'create',
    null,
    null,
    jsonb_build_object(
      'pair_id', '73000000-0000-4000-8000-000000000001',
      'revision', 0,
      'title', 'Receita de outro par',
      'favorite', 0,
      'want_to_make', 0,
      'source_kind', 'manual',
      'created_by', '70000000-0000-4000-8000-000000000001'
    )
  )$$,
  '42501', 'active pair membership required',
  'authenticated user cannot submit a semantic mutation for another pair'
);

select is(
  (select resulting_revision from public.apply_client_mutation(
    '71000000-0000-4000-8000-000000000002',
    current_setting('test.pair_id')::uuid,
    '70000000-0000-4000-8000-000000000001',
    'recipes',
    '72000000-0000-4000-8000-000000000001',
    'update',
    0,
    jsonb_build_object(
      'pair_id', current_setting('test.pair_id'), 'revision', 0,
      'title', 'Bolo base', 'favorite', 0,
      'created_by', '70000000-0000-4000-8000-000000000001'
    ),
    jsonb_build_object(
      'pair_id', current_setting('test.pair_id'), 'revision', 0,
      'title', 'Bolo com cobertura', 'favorite', 0,
      'created_by', '70000000-0000-4000-8000-000000000001'
    )
  )),
  1::bigint,
  'first update advances the remote revision'
);

select is(
  (select resulting_revision from public.apply_client_mutation(
    '71000000-0000-4000-8000-000000000003',
    current_setting('test.pair_id')::uuid,
    '70000000-0000-4000-8000-000000000001',
    'recipes',
    '72000000-0000-4000-8000-000000000001',
    'update',
    0,
    jsonb_build_object(
      'pair_id', current_setting('test.pair_id'), 'revision', 0,
      'title', 'Bolo base', 'favorite', 0,
      'created_by', '70000000-0000-4000-8000-000000000001'
    ),
    jsonb_build_object(
      'pair_id', current_setting('test.pair_id'), 'revision', 0,
      'title', 'Bolo base', 'favorite', 1,
      'created_by', '70000000-0000-4000-8000-000000000001'
    )
  )),
  2::bigint,
  'stale update on a disjoint field auto-merges and advances revision'
);

select is(
  (select title from public.recipes where id = '72000000-0000-4000-8000-000000000001'),
  'Bolo com cobertura',
  'safe merge preserves the concurrent remote title'
);

select is(
  (select favorite from public.recipes where id = '72000000-0000-4000-8000-000000000001'),
  true,
  'safe merge applies the independent favorite change'
);

select is(
  (select result_status from public.apply_client_mutation(
    '71000000-0000-4000-8000-000000000004',
    current_setting('test.pair_id')::uuid,
    '70000000-0000-4000-8000-000000000001',
    'recipes',
    '72000000-0000-4000-8000-000000000001',
    'update',
    0,
    jsonb_build_object(
      'pair_id', current_setting('test.pair_id'), 'revision', 0,
      'title', 'Bolo base', 'favorite', 0,
      'created_by', '70000000-0000-4000-8000-000000000001'
    ),
    jsonb_build_object(
      'pair_id', current_setting('test.pair_id'), 'revision', 0,
      'title', 'Bolo conflitante', 'favorite', 0,
      'created_by', '70000000-0000-4000-8000-000000000001'
    )
  )),
  'conflict_created',
  'stale overlapping field update creates an explicit conflict'
);

select is(
  (
    select jsonb_build_array(
      base_payload ->> 'title',
      local_payload ->> 'title',
      remote_payload ->> 'title'
    )
      from public.conflicts
     where entity_id = '72000000-0000-4000-8000-000000000001'
     order by created_at desc
     limit 1
  ),
  '["Bolo base", "Bolo conflitante", "Bolo com cobertura"]'::jsonb,
  'conflict preserves base local and remote versions'
);

select is(
  (select result_status from public.apply_client_mutation(
    '71000000-0000-4000-8000-000000000005',
    current_setting('test.pair_id')::uuid,
    '70000000-0000-4000-8000-000000000001',
    'recipes',
    '72000000-0000-4000-8000-000000000001',
    'soft_delete',
    0,
    jsonb_build_object(
      'pair_id', current_setting('test.pair_id'), 'revision', 0,
      'title', 'Bolo base', 'favorite', 0, 'deleted_at', null,
      'created_by', '70000000-0000-4000-8000-000000000001'
    ),
    jsonb_build_object(
      'pair_id', current_setting('test.pair_id'), 'revision', 0,
      'title', 'Bolo base', 'favorite', 0,
      'deleted_at', '2026-08-07T22:00:00.000Z',
      'created_by', '70000000-0000-4000-8000-000000000001'
    )
  )),
  'conflict_created',
  'stale delete against a concurrently edited row creates a conflict'
);

reset role;
select * from finish();
rollback;
