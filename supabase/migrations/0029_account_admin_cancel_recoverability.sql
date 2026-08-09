create or replace function private.account_admin_recoverable_target(
  p_pair_id uuid,
  p_actor_user_id uuid
)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select a.target_user_id
  from private.account_admin_actions a
  join public.pair_members pm
    on pm.pair_id = a.pair_id
   and pm.user_id = a.target_user_id
  where a.pair_id = p_pair_id
    and a.initiated_by = p_actor_user_id
    and pm.removed_at is not null
    and (
      (a.action_kind = 'remove_other' and a.status = 'completed')
      or (a.action_kind = 'replace_other' and a.status = 'cancelled')
    )
    and not exists (
      select 1
      from public.pair_members active_other
      where active_other.pair_id = p_pair_id
        and active_other.user_id <> p_actor_user_id
        and active_other.removed_at is null
    )
  order by coalesce(a.completed_at, a.cancelled_at, a.updated_at) desc
  limit 1;
$$;

create or replace function public.read_account_admin_status_server(
  p_pair_id uuid,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  other_user_id uuid;
  recoverable_target_user_id uuid;
  pending_action jsonb;
  cleanup_actions jsonb;
begin
  perform private.assert_account_admin_actor(p_pair_id, p_actor_user_id);

  select pm.user_id into other_user_id
    from public.pair_members pm
   where pm.pair_id = p_pair_id
     and pm.user_id <> p_actor_user_id
     and pm.activated_at is not null
     and pm.removed_at is null
   order by pm.joined_at
   limit 1;

  if other_user_id is null then
    recoverable_target_user_id := private.account_admin_recoverable_target(p_pair_id, p_actor_user_id);
  end if;

  select jsonb_build_object(
    'id', a.id,
    'target_user_id', a.target_user_id,
    'replacement_user_id', a.replacement_user_id,
    'status', a.status::text,
    'expires_at', a.expires_at,
    'auth_cleanup_pending', a.auth_cleanup_pending
  ) into pending_action
    from private.account_admin_actions a
   where a.pair_id = p_pair_id
     and a.initiated_by = p_actor_user_id
     and a.action_kind = 'replace_other'
     and a.status = 'pending_activation'
   order by a.created_at desc
   limit 1;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', a.id,
    'target_user_id', a.target_user_id,
    'status', a.status::text,
    'auth_cleanup_pending', a.auth_cleanup_pending
  ) order by a.created_at desc), '[]'::jsonb)
    into cleanup_actions
    from private.account_admin_actions a
   where a.pair_id = p_pair_id
     and a.initiated_by = p_actor_user_id
     and a.auth_cleanup_pending = true;

  return jsonb_build_object(
    'other_user_id', other_user_id,
    'recoverable_target_user_id', recoverable_target_user_id,
    'pending_replacement', pending_action,
    'auth_cleanup_actions', cleanup_actions
  );
end;
$$;

revoke all on function public.read_account_admin_status_server(uuid, uuid) from public, anon, authenticated;
grant execute on function public.read_account_admin_status_server(uuid, uuid) to service_role;

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
  target_is_active boolean := false;
  recoverable_target uuid;
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

  select exists (
    select 1
    from public.pair_members pm
    where pm.pair_id = p_pair_id
      and pm.user_id = p_target_user_id
      and pm.activated_at is not null
      and pm.removed_at is null
  ) into target_is_active;

  if not target_is_active then
    recoverable_target := private.account_admin_recoverable_target(p_pair_id, p_actor_user_id);
    if recoverable_target is distinct from p_target_user_id then
      raise exception 'account-admin target is not replaceable' using errcode = '22023';
    end if;
  end if;

  if exists (
    select 1
    from public.pair_members pm
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
    'replace_other', 'pending_activation', p_safety_job_id, target_is_active
  );

  if target_is_active then
    update public.pair_members
       set removed_at = now()
     where pair_id = p_pair_id
       and user_id = p_target_user_id
       and removed_at is null;
  end if;

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
