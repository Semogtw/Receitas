begin;

create extension if not exists pgtap with schema extensions;
select plan(12);

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
  'unverified pending member is not authorized by RLS helper'
);

select throws_ok(
  $$select public.activate_current_pair_membership()$$,
  'P0001',
  'verified email required',
  'unverified identity cannot activate membership'
);

reset role;
update auth.users
   set email_confirmed_at = now()
 where id = '10000000-0000-0000-0000-000000000001';

set local role authenticated;
select is(
  public.activate_current_pair_membership(),
  current_setting('test.pair_id')::uuid,
  'verified identity activates its reserved membership'
);

select is(
  (select count(*)::integer from public.pairs),
  1,
  'activated member can read its pair through RLS'
);

select throws_ok(
  $$insert into public.pair_members (pair_id, user_id)
    values (current_setting('test.pair_id')::uuid, '10000000-0000-0000-0000-000000000003')$$,
  '42501',
  'permission denied for table pair_members',
  'authenticated client cannot write pair membership directly'
);

reset role;

insert into public.pair_members (pair_id, user_id)
select id, '10000000-0000-0000-0000-000000000002' from public.pairs limit 1;

select is(
  (select status::text from public.pairs limit 1),
  'closed',
  'reserving the second seat closes the pair'
);

select throws_ok(
  $$insert into public.pair_members (pair_id, user_id)
    select id, '10000000-0000-0000-0000-000000000003' from public.pairs limit 1$$,
  'P0001',
  'pair is closed',
  'third membership is rejected even by privileged direct insert'
);

update public.pair_members
   set removed_at = now()
 where user_id = '10000000-0000-0000-0000-000000000002';

select is(
  (select status::text from public.pairs limit 1),
  'closed',
  'removing a member never reopens a closed pair'
);

select set_config(
  'request.jwt.claims',
  json_build_object('sub', '10000000-0000-0000-0000-000000000003', 'role', 'authenticated')::text,
  true
);
set local role authenticated;

select is(
  (select count(*)::integer from public.pairs),
  0,
  'authenticated outsider cannot read another pair'
);

reset role;
select * from finish();
rollback;
