create type private.account_admin_action_kind as enum ('remove_other', 'replace_other');
create type private.account_admin_action_status as enum ('pending_activation', 'completed', 'cancelled');

create table private.account_admin_actions (
  id uuid primary key default gen_random_uuid(),
  pair_id uuid not null references public.pairs(id) on delete restrict,
  initiated_by uuid not null,
  target_user_id uuid not null,
  replacement_user_id uuid,
  action_kind private.account_admin_action_kind not null,
  status private.account_admin_action_status not null,
  safety_restore_job_id uuid not null references private.restore_jobs(id) on delete restrict,
  auth_cleanup_pending boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '48 hours'),
  completed_at timestamptz,
  cancelled_at timestamptz,
  check (initiated_by <> target_user_id),
  check (
    (action_kind = 'remove_other' and replacement_user_id is null and status = 'completed')
    or (action_kind = 'replace_other' and replacement_user_id is not null)
  ),
  check (
    (status = 'pending_activation' and completed_at is null and cancelled_at is null)
    or (status = 'completed' and completed_at is not null and cancelled_at is null)
    or (status = 'cancelled' and cancelled_at is not null and completed_at is null)
  ),
  check (expires_at > created_at)
);

create unique index account_admin_one_pending_replacement_pair_idx
  on private.account_admin_actions(pair_id)
  where action_kind = 'replace_other' and status = 'pending_activation';
create unique index account_admin_one_pending_replacement_user_idx
  on private.account_admin_actions(replacement_user_id)
  where action_kind = 'replace_other' and status = 'pending_activation';
create index account_admin_actions_pair_created_idx
  on private.account_admin_actions(pair_id, created_at desc);

revoke all on private.account_admin_actions from public, anon, authenticated;

create or replace function private.touch_account_admin_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger account_admin_actions_touch_updated_at
before update on private.account_admin_actions
for each row execute function private.touch_account_admin_updated_at();

create or replace function private.assert_account_admin_actor(
  p_pair_id uuid,
  p_actor_user_id uuid
)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.pair_members pm
    where pm.pair_id = p_pair_id
      and pm.user_id = p_actor_user_id
      and pm.activated_at is not null
      and pm.removed_at is null
  ) then
    raise exception 'active account-admin membership required' using errcode = '42501';
  end if;
end;
$$;

create or replace function private.assert_account_admin_safety(
  p_safety_job_id uuid,
  p_pair_id uuid,
  p_actor_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  job private.restore_jobs%rowtype;
begin
  select * into job
    from private.restore_jobs j
    where j.id = p_safety_job_id
      and j.pair_id = p_pair_id
    for update;

  if not found then
    raise exception 'account-admin safety backup not found' using errcode = 'P0002';
  end if;
  if job.created_by is distinct from p_actor_user_id
     or job.mode <> 'merge'
     or job.status <> 'ready_to_commit'
     or job.expires_at <= now()
     or job.created_at < now() - interval '15 minutes' then
    raise exception 'account-admin safety backup is not current' using errcode = '22023';
  end if;
  if not private.restore_safety_matches_current(job.id, p_pair_id) then
    raise exception 'account-admin safety backup does not match canonical state' using errcode = '40001';
  end if;

  update private.restore_jobs
     set is_safety_backup = true
   where id = job.id;
end;
$$;

create or replace function public.account_admin_remove_other(
  p_pair_id uuid,
  p_actor_user_id uuid,
  p_target_user_id uuid,
  p_safety_job_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  action_id uuid := gen_random_uuid();
  pair_state public.pair_status;
begin
  perform private.assert_account_admin_actor(p_pair_id, p_actor_user_id);
  if p_target_user_id = p_actor_user_id then
    raise exception 'account-admin cannot remove current actor' using errcode = '22023';
  end if;

  select p.status into pair_state
    from public.pairs p
    where p.id = p_pair_id
    for update;
  if not found or pair_state <> 'closed' then
    raise exception 'account-admin recovery requires a closed pair' using errcode = '22023';
  end if;

  perform 1
    from public.pair_members pm
    where pm.pair_id = p_pair_id
      and pm.user_id = p_target_user_id
      and pm.activated_at is not null
      and pm.removed_at is null
    for update;
  if not found then
    raise exception 'account-admin target is not the other active member' using errcode = '22023';
  end if;

  perform private.assert_account_admin_safety(p_safety_job_id, p_pair_id, p_actor_user_id);

  update public.pair_members
     set removed_at = now()
   where pair_id = p_pair_id
     and user_id = p_target_user_id
     and removed_at is null;

  insert into private.account_admin_actions (
    id, pair_id, initiated_by, target_user_id, action_kind, status,
    safety_restore_job_id, auth_cleanup_pending, completed_at
  ) values (
    action_id, p_pair_id, p_actor_user_id, p_target_user_id,
    'remove_other', 'completed', p_safety_job_id, true, now()
  );

  if (select status from public.pairs where id = p_pair_id) <> 'closed' then
    raise exception 'account-admin must not reopen pair' using errcode = 'P0001';
  end if;

  return action_id;
end;
$$;

revoke all on function public.account_admin_remove_other(uuid, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.account_admin_remove_other(uuid, uuid, uuid, uuid) to service_role;

create or replace function public.account_admin_begin_replacement(
  p_pair_id uuid,
  p_actor_user_id uuid,
  p_target_user_id uuid,
  p_replacement_user_id uuid,
  p_safety_job_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  action_id uuid := gen_random_uuid();
  pair_state public.pair_status;
begin
  perform private.assert_account_admin_actor(p_pair_id, p_actor_user_id);
  if p_target_user_id = p_actor_user_id
     or p_replacement_user_id in (p_actor_user_id, p_target_user_id) then
    raise exception 'account-admin replacement identities must be distinct' using errcode = '22023';
  end if;

  select p.status into pair_state
    from public.pairs p
    where p.id = p_pair_id
    for update;
  if not found or pair_state <> 'closed' then
    raise exception 'account-admin replacement requires a closed pair' using errcode = '22023';
  end if;

  perform 1
    from public.pair_members pm
    where pm.pair_id = p_pair_id
      and pm.user_id = p_target_user_id
      and pm.activated_at is not null
      and pm.removed_at is null
    for update;
  if not found then
    raise exception 'account-admin target is not the other active member' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.pair_members pm
    where pm.user_id = p_replacement_user_id
      and pm.removed_at is null
  ) then
    raise exception 'replacement identity already occupies a pair' using errcode = '23505';
  end if;

  perform private.assert_account_admin_safety(p_safety_job_id, p_pair_id, p_actor_user_id);

  insert into private.account_admin_actions (
    id, pair_id, initiated_by, target_user_id, replacement_user_id,
    action_kind, status, safety_restore_job_id, auth_cleanup_pending
  ) values (
    action_id, p_pair_id, p_actor_user_id, p_target_user_id, p_replacement_user_id,
    'replace_other', 'pending_activation', p_safety_job_id, true
  );

  update public.pair_members
     set removed_at = now()
   where pair_id = p_pair_id
     and user_id = p_target_user_id
     and removed_at is null;

  insert into public.pair_members (
    pair_id, user_id, joined_at, activated_at, removed_at, invite_id
  ) values (
    p_pair_id, p_replacement_user_id, now(), null, null, null
  );

  if (select status from public.pairs where id = p_pair_id) <> 'closed' then
    raise exception 'account-admin replacement must keep pair closed' using errcode = 'P0001';
  end if;

  return action_id;
end;
$$;

revoke all on function public.account_admin_begin_replacement(uuid, uuid, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.account_admin_begin_replacement(uuid, uuid, uuid, uuid, uuid) to service_role;

create or replace function public.account_admin_complete_replacement(p_replacement_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  action private.account_admin_actions%rowtype;
begin
  select * into action
    from private.account_admin_actions a
    where a.replacement_user_id = p_replacement_user_id
      and a.action_kind = 'replace_other'
      and a.status = 'pending_activation'
    for update;

  if not found then
    raise exception 'pending account replacement not found' using errcode = 'P0002';
  end if;
  if action.expires_at <= now() then
    raise exception 'account replacement expired' using errcode = '22023';
  end if;

  update public.pair_members
     set activated_at = coalesce(activated_at, now())
   where pair_id = action.pair_id
     and user_id = p_replacement_user_id
     and removed_at is null;
  if not found then
    raise exception 'pending replacement membership disappeared' using errcode = 'P0002';
  end if;

  update private.account_admin_actions
     set status = 'completed', completed_at = now()
   where id = action.id;

  if (select status from public.pairs where id = action.pair_id) <> 'closed' then
    raise exception 'replacement completion must keep pair closed' using errcode = 'P0001';
  end if;

  return action.pair_id;
end;
$$;

revoke all on function public.account_admin_complete_replacement(uuid) from public, anon, authenticated;
grant execute on function public.account_admin_complete_replacement(uuid) to service_role;

create or replace function public.account_admin_cancel_replacement(
  p_pair_id uuid,
  p_actor_user_id uuid,
  p_action_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  action private.account_admin_actions%rowtype;
begin
  perform private.assert_account_admin_actor(p_pair_id, p_actor_user_id);
  select * into action
    from private.account_admin_actions a
    where a.id = p_action_id
      and a.pair_id = p_pair_id
      and a.initiated_by = p_actor_user_id
      and a.action_kind = 'replace_other'
      and a.status = 'pending_activation'
    for update;
  if not found then
    raise exception 'pending replacement action not found' using errcode = 'P0002';
  end if;

  update public.pair_members
     set removed_at = coalesce(removed_at, now())
   where pair_id = p_pair_id
     and user_id = action.replacement_user_id
     and activated_at is null;

  update private.account_admin_actions
     set status = 'cancelled', cancelled_at = now()
   where id = action.id;
end;
$$;

revoke all on function public.account_admin_cancel_replacement(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.account_admin_cancel_replacement(uuid, uuid, uuid) to service_role;

create or replace function public.account_admin_mark_auth_cleanup(
  p_action_id uuid,
  p_pending boolean
)
returns void
language sql
security definer
set search_path = ''
as $$
  update private.account_admin_actions
     set auth_cleanup_pending = p_pending
   where id = p_action_id;
$$;

revoke all on function public.account_admin_mark_auth_cleanup(uuid, boolean) from public, anon, authenticated;
grant execute on function public.account_admin_mark_auth_cleanup(uuid, boolean) to service_role;

-- Closed pairs stay closed. The only exception to the capacity trigger is a
-- server-authorized replacement identity recorded in private.account_admin_actions.
create or replace function private.enforce_pair_member_capacity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  pair_state public.pair_status;
  seat_count integer;
  authorized_replacement boolean := false;
begin
  if new.removed_at is not null then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.removed_at is null then
    return new;
  end if;

  select p.status
    into pair_state
    from public.pairs p
   where p.id = new.pair_id
   for update;

  if not found then
    raise exception 'pair does not exist' using errcode = '23503';
  end if;

  if pair_state = 'closed' then
    select exists (
      select 1
      from private.account_admin_actions a
      where a.pair_id = new.pair_id
        and a.replacement_user_id = new.user_id
        and a.action_kind = 'replace_other'
        and a.status = 'pending_activation'
        and a.expires_at > now()
    ) into authorized_replacement;

    if not authorized_replacement then
      raise exception 'pair is closed' using errcode = 'P0001';
    end if;
  end if;

  select count(*)::integer
    into seat_count
    from public.pair_members pm
   where pm.pair_id = new.pair_id
     and pm.removed_at is null;

  if seat_count >= 2 then
    raise exception 'pair already has two members' using errcode = 'P0001';
  end if;

  if authorized_replacement then
    return new;
  end if;

  if seat_count = 0 and pair_state = 'initializing' then
    update public.pairs
       set status = 'open_for_second_member'
     where id = new.pair_id;
  end if;

  return new;
end;
$$;
