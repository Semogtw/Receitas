begin;

create extension if not exists pgtap with schema extensions;
select plan(6);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', 'a1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'cleanup-owner@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a1000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'cleanup-old@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a1000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'cleanup-replacement@example.test', '', null, '{"provider":"email","providers":["email"]}', '{}', now(), now());

insert into public.pairs (id, status)
values ('a2000000-0000-4000-8000-000000000001', 'open_for_second_member');

insert into public.pair_members (pair_id, user_id, activated_at) values
  ('a2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', now()),
  ('a2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000002', now());

update public.pairs
   set status = 'closed'
 where id = 'a2000000-0000-4000-8000-000000000001';

insert into private.restore_jobs (
  id, pair_id, created_by, mode, status, manifest_sha256, manifest,
  source_pair_export_id, expires_at
) values (
  'a3000000-0000-4000-8000-000000000001',
  'a2000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000001',
  'merge', 'ready_to_commit', repeat('b', 64), '{}'::jsonb,
  'account-admin-cancel-cleanup-test', now() + interval '1 hour'
);

insert into private.account_admin_actions (
  id, pair_id, initiated_by, target_user_id, replacement_user_id,
  action_kind, status, safety_restore_job_id, auth_cleanup_pending, expires_at
) values (
  'a4000000-0000-4000-8000-000000000001',
  'a2000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000002',
  'a1000000-0000-4000-8000-000000000003',
  'replace_other', 'pending_activation',
  'a3000000-0000-4000-8000-000000000001', false,
  now() + interval '1 hour'
);

update public.pair_members
   set removed_at = now()
 where pair_id = 'a2000000-0000-4000-8000-000000000001'
   and user_id = 'a1000000-0000-4000-8000-000000000002';

insert into public.pair_members (pair_id, user_id, activated_at)
values (
  'a2000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000003',
  null
);

select is(
  public.account_admin_cancel_replacement_v2(
    'a2000000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000001',
    'a4000000-0000-4000-8000-000000000001'
  ),
  'a1000000-0000-4000-8000-000000000003'::uuid,
  'cancel returns queued replacement identity'
);

select ok(
  (select removed_at is not null
     from public.pair_members
    where pair_id = 'a2000000-0000-4000-8000-000000000001'
      and user_id = 'a1000000-0000-4000-8000-000000000003'),
  'cancel removes unactivated replacement membership before external auth cleanup'
);

select is(
  (select status::text
     from private.account_admin_actions
    where id = 'a4000000-0000-4000-8000-000000000001'),
  'cancelled',
  'cancel commits the replacement action before external auth cleanup'
);

select is(
  (select replacement_auth_cleanup_pending
     from private.account_admin_actions
    where id = 'a4000000-0000-4000-8000-000000000001'),
  true,
  'cancel records replacement auth cleanup before leaving database transaction'
);

select public.account_admin_mark_replacement_auth_cleanup(
  'a4000000-0000-4000-8000-000000000001',
  false
);

select is(
  (select replacement_auth_cleanup_pending
     from private.account_admin_actions
    where id = 'a4000000-0000-4000-8000-000000000001'),
  false,
  'server cleanup acknowledgement clears replacement auth cleanup queue'
);

select is(
  (select status::text
     from public.pairs
    where id = 'a2000000-0000-4000-8000-000000000001'),
  'closed',
  'cancelled replacement keeps the private pair closed'
);

select * from finish();
rollback;
