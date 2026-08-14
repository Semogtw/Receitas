alter table private.account_admin_actions
  add column replacement_auth_cleanup_pending boolean not null default false;

alter table private.account_admin_actions
  add constraint account_admin_replacement_cleanup_kind_check
  check (not replacement_auth_cleanup_pending or action_kind = 'replace_other');

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
    'auth_cleanup_pending', a.auth_cleanup_pending,
    'replacement_auth_cleanup_pending', a.replacement_auth_cleanup_pending
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
    'replacement_user_id', a.replacement_user_id,
    'status', a.status::text,
    'auth_cleanup_pending', a.auth_cleanup_pending,
    'replacement_auth_cleanup_pending', a.replacement_auth_cleanup_pending
  ) order by a.created_at desc), '[]'::jsonb)
    into cleanup_actions
    from private.account_admin_actions a
   where a.pair_id = p_pair_id
     and a.initiated_by = p_actor_user_id
     and (a.auth_cleanup_pending = true or a.replacement_auth_cleanup_pending = true);

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

create or replace function public.account_admin_cancel_replacement_v2(
  p_pair_id uuid,
  p_actor_user_id uuid,
  p_action_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  action private.account_admin_actions%rowtype;
  replacement_id uuid;
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

  replacement_id := action.replacement_user_id;
  update public.pair_members
     set removed_at = coalesce(removed_at, now())
   where pair_id = p_pair_id
     and user_id = replacement_id
     and activated_at is null;

  update private.account_admin_actions
     set status = 'cancelled',
         cancelled_at = now(),
         replacement_auth_cleanup_pending = true
   where id = action.id;

  return replacement_id;
end;
$$;

revoke all on function public.account_admin_cancel_replacement_v2(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.account_admin_cancel_replacement_v2(uuid, uuid, uuid) to service_role;

create or replace function public.account_admin_mark_replacement_auth_cleanup(
  p_action_id uuid,
  p_pending boolean
)
returns void
language sql
security definer
set search_path = ''
as $$
  update private.account_admin_actions
     set replacement_auth_cleanup_pending = p_pending
   where id = p_action_id
     and action_kind = 'replace_other';
$$;

revoke all on function public.account_admin_mark_replacement_auth_cleanup(uuid, boolean) from public, anon, authenticated;
grant execute on function public.account_admin_mark_replacement_auth_cleanup(uuid, boolean) to service_role;
