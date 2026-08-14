begin;

create extension if not exists pgtap with schema extensions;
select plan(7);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '91000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'admin-owner@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '91000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'old-member@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '91000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'replacement@example.test', '', null, '{"provider":"email","providers":["email"]}', '{}', now(), now());

insert into public.pairs (id, status)
values ('92000000-0000-4000-8000-000000000001', 'open_for_second_member');

insert into public.pair_members (pair_id, user_id, activated_at) values
  ('92000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001', now()),
  ('92000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000002', now());

update public.pairs
   set status = 'closed'
 where id = '92000000-0000-4000-8000-000000000001';

insert into private.restore_jobs (
  id, pair_id, created_by, mode, status, manifest_sha256, manifest,
  source_pair_export_id, expires_at
) values (
  '93000000-0000-4000-8000-000000000001',
  '92000000-0000-4000-8000-000000000001',
  '91000000-0000-4000-8000-000000000001',
  'merge', 'ready_to_commit', repeat('a', 64), '{}'::jsonb,
  'account-admin-verification-test', now() + interval '1 hour'
);

insert into private.account_admin_actions (
  id, pair_id, initiated_by, target_user_id, replacement_user_id,
  action_kind, status, safety_restore_job_id, auth_cleanup_pending, expires_at
) values (
  '94000000-0000-4000-8000-000000000001',
  '92000000-0000-4000-8000-000000000001',
  '91000000-0000-4000-8000-000000000001',
  '91000000-0000-4000-8000-000000000002',
  '91000000-0000-4000-8000-000000000003',
  'replace_other', 'pending_activation',
  '93000000-0000-4000-8000-000000000001', false,
  now() + interval '1 hour'
);

update public.pair_members
   set removed_at = now()
 where pair_id = '92000000-0000-4000-8000-000000000001'
   and user_id = '91000000-0000-4000-8000-000000000002';

insert into public.pair_members (pair_id, user_id, activated_at)
values (
  '92000000-0000-4000-8000-000000000001',
  '91000000-0000-4000-8000-000000000003',
  null
);

select throws_ok(
  $$select public.account_admin_complete_replacement('91000000-0000-4000-8000-000000000003')$$,
  'P0001',
  'verified email required',
  'unconfirmed replacement cannot activate membership'
);

select is(
  (select activated_at from public.pair_members
    where pair_id = '92000000-0000-4000-8000-000000000001'
      and user_id = '91000000-0000-4000-8000-000000000003'),
  null::timestamptz,
  'failed verification leaves replacement membership inactive'
);

select is(
  (select status::text from private.account_admin_actions
    where id = '94000000-0000-4000-8000-000000000001'),
  'pending_activation',
  'failed verification leaves replacement action pending'
);

update auth.users
   set email_confirmed_at = now()
 where id = '91000000-0000-4000-8000-000000000003';

select is(
  public.account_admin_complete_replacement('91000000-0000-4000-8000-000000000003'),
  '92000000-0000-4000-8000-000000000001'::uuid,
  'confirmed invited replacement activates membership'
);

select ok(
  (select activated_at is not null from public.pair_members
    where pair_id = '92000000-0000-4000-8000-000000000001'
      and user_id = '91000000-0000-4000-8000-000000000003'),
  'confirmed replacement membership becomes active'
);

select is(
  (select status::text from private.account_admin_actions
    where id = '94000000-0000-4000-8000-000000000001'),
  'completed',
  'successful verification completes the replacement action'
);

select is(
  (select status::text from public.pairs
    where id = '92000000-0000-4000-8000-000000000001'),
  'closed',
  'replacement completion keeps the private pair closed'
);

select * from finish();
rollback;
