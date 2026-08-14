create or replace function public.account_admin_complete_replacement(p_replacement_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  action private.account_admin_actions%rowtype;
  replacement_verified_at timestamptz;
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

  -- Keep administrative recovery aligned with normal membership activation:
  -- an invited identity must prove ownership of its email before it can receive
  -- access to the private pair. inviteUserByEmail creates an unconfirmed user;
  -- the invitation link is what confirms that address.
  select u.email_confirmed_at
    into replacement_verified_at
    from auth.users u
   where u.id = p_replacement_user_id;

  if replacement_verified_at is null then
    raise exception 'verified email required' using errcode = 'P0001';
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
