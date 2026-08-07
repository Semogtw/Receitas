begin;

create extension if not exists pgtap with schema extensions;
select plan(4);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '50000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'first-idempotent@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '50000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'second-idempotent@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

select set_config('test.pair_id', public.create_bootstrap_pair('50000000-0000-0000-0000-000000000001')::text, true);

select set_config(
  'request.jwt.claims',
  json_build_object('sub', '50000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text,
  true
);
set local role authenticated;

select is(
  public.activate_current_pair_membership(),
  current_setting('test.pair_id')::uuid,
  'bootstrap membership activates normally'
);

select is(
  public.activate_current_pair_membership(),
  current_setting('test.pair_id')::uuid,
  'repeating bootstrap activation returns the same pair without error'
);

reset role;
select ok(
  public.reserve_pair_invite(
    current_setting('test.pair_id')::uuid,
    '50000000-0000-0000-0000-000000000001',
    '50000000-0000-0000-0000-000000000002',
    repeat('c', 64),
    now() + interval '1 hour'
  ) is not null,
  'second-member invite is reserved'
);

select set_config(
  'request.jwt.claims',
  json_build_object('sub', '50000000-0000-0000-0000-000000000002', 'role', 'authenticated')::text,
  true
);
set local role authenticated;

select is(
  public.accept_pair_invite(repeat('c', 64)),
  current_setting('test.pair_id')::uuid,
  'repeating pair invite acceptance after success is idempotent'
)
from (select public.accept_pair_invite(repeat('c', 64)) as first_accept) accepted;

reset role;
select * from finish();
rollback;
