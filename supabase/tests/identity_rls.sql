begin;

create extension if not exists pgtap with schema extensions;
select plan(19);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'first@example.test', '', null, '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'second@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'third@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

select ok(
  public.create_bootstrap_pair('10000000-0000-0000-0000-000000000001') is not null,
  'bootstrap creates the initial pair exactly once'
);

select throws_ok(
  $$select public.create_bootstrap_pair('10000000-0000-0000-0000-000000000003')$$,
  'P0001',
  'bootstrap already consumed',
  'second bootstrap attempt is rejected'
);

select set_config('test.pair_id', (select id::text from public.pairs limit 1), true);

select is(
  (select status::text from public.pairs where id = current_setting('test.pair_id')::uuid),
  'open_for_second_member',
  'first reserved seat opens only the second-member flow'
);

select set_config(
  'request.jwt.claims',
  json_build_object('sub', '10000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text,
  true
);
set local role authenticated;

select is(
  public.is_pair_member(current_setting('test.pair_id')::uuid),
  false,
  'unverified bootstrap member is not authorized by RLS helper'
);

select throws_ok(
  $$select public.activate_current_pair_membership()$$,
  'P0001',
  'verified email required',
  'unverified bootstrap identity cannot activate membership'
);

reset role;
update auth.users
   set email_confirmed_at = now()
 where id = '10000000-0000-0000-0000-000000000001';

set local role authenticated;
select is(
  public.activate_current_pair_membership(),
  current_setting('test.pair_id')::uuid,
  'verified bootstrap identity activates its membership'
);

select is(
  (select count(*)::integer from public.pairs),
  1,
  'activated bootstrap member can read its pair through RLS'
);

select throws_ok(
  $$insert into public.pair_members (pair_id, user_id)
    values (current_setting('test.pair_id')::uuid, '10000000-0000-0000-0000-000000000003')$$,
  '42501',
  null,
  'authenticated client cannot write pair membership directly'
);

reset role;

select is(
  public.revoke_pending_pair_invite(
    current_setting('test.pair_id')::uuid,
    '10000000-0000-0000-0000-000000000001'
  ),
  null::uuid,
  'revoking when no second-member invite exists is idempotent'
);

select ok(
  public.reserve_pair_invite(
    current_setting('test.pair_id')::uuid,
    '10000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000002',
    repeat('a', 64),
    now() + interval '1 hour'
  ) is not null,
  'reserving an invite occupies the second seat'
);

select is(
  (select status::text from public.pairs where id = current_setting('test.pair_id')::uuid),
  'open_for_second_member',
  'pending unverified second member does not close the pair yet'
);

select is(
  (select count(*)::integer from public.pair_members where pair_id = current_setting('test.pair_id')::uuid and removed_at is null),
  2,
  'pending invite still reserves the second seat against races'
);

select throws_ok(
  $$insert into public.pair_members (pair_id, user_id)
    values (current_setting('test.pair_id')::uuid, '10000000-0000-0000-0000-000000000003')$$,
  'P0001',
  'pair already has two members',
  'third pending/current seat cannot be inserted while invite is pending'
);

select set_config(
  'request.jwt.claims',
  json_build_object('sub', '10000000-0000-0000-0000-000000000003', 'role', 'authenticated')::text,
  true
);
set local role authenticated;

select throws_ok(
  $$select public.accept_pair_invite()$$,
  'P0001',
  'pair invite not found',
  'an unrelated verified identity cannot consume the reserved second seat'
);

reset role;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '10000000-0000-0000-0000-000000000002', 'role', 'authenticated')::text,
  true
);
set local role authenticated;

select throws_ok(
  $$select public.activate_current_pair_membership()$$,
  'P0001',
  'pair invite acceptance required',
  'second member cannot bypass reserved invite completion'
);

select is(
  public.accept_pair_invite(),
  current_setting('test.pair_id')::uuid,
  'verified invited identity consumes its own reserved pair invite'
);

select is(
  (select status::text from public.pairs),
  'closed',
  'pair closes only after the second verified member accepts'
);

reset role;
select throws_ok(
  $$insert into public.pair_members (pair_id, user_id)
    values (current_setting('test.pair_id')::uuid, '10000000-0000-0000-0000-000000000003')$$,
  'P0001',
  'pair is closed',
  'closed pair rejects any third member'
);

update public.pair_members
   set removed_at = now()
 where user_id = '10000000-0000-0000-0000-000000000002';

select is(
  (select status::text from public.pairs),
  'closed',
  'removing a member never reopens a closed pair'
);

select * from finish();
rollback;
