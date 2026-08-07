revoke all on function public.accept_pair_invite(text) from public, anon, authenticated;
drop function public.accept_pair_invite(text);

create or replace function public.accept_pair_invite()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  invite_row public.pair_invites%rowtype;
  verified_at timestamptz;
  membership_activated_at timestamptz;
begin
  if current_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  select u.email_confirmed_at
    into verified_at
    from auth.users u
   where u.id = current_user_id;

  if verified_at is null then
    raise exception 'verified email required' using errcode = 'P0001';
  end if;

  select * into invite_row
    from public.pair_invites pi
   where pi.invited_user_id = current_user_id
     and pi.invalidated_at is null
   order by pi.created_at desc
   limit 1
   for update;

  if not found then
    raise exception 'pair invite not found' using errcode = 'P0001';
  end if;

  select pm.activated_at
    into membership_activated_at
    from public.pair_members pm
   where pm.pair_id = invite_row.pair_id
     and pm.user_id = current_user_id
     and pm.invite_id = invite_row.id
     and pm.removed_at is null;

  if invite_row.consumed_at is not null then
    if membership_activated_at is not null then
      return invite_row.pair_id;
    end if;
    raise exception 'pair invite is no longer usable' using errcode = 'P0001';
  end if;

  if invite_row.expires_at <= now() then
    raise exception 'pair invite is expired' using errcode = 'P0001';
  end if;

  perform 1
    from public.pairs p
   where p.id = invite_row.pair_id
     and p.status = 'open_for_second_member'
   for update;

  if not found then
    raise exception 'pair is not accepting its second member' using errcode = 'P0001';
  end if;

  if membership_activated_at is null and not exists (
    select 1
      from public.pair_members pm
     where pm.pair_id = invite_row.pair_id
       and pm.user_id = current_user_id
       and pm.invite_id = invite_row.id
       and pm.removed_at is null
  ) then
    raise exception 'reserved pair membership not found' using errcode = 'P0001';
  end if;

  update public.pair_invites
     set consumed_at = now()
   where id = invite_row.id
     and consumed_at is null;

  update public.pair_members
     set activated_at = coalesce(activated_at, now())
   where pair_id = invite_row.pair_id
     and user_id = current_user_id
     and invite_id = invite_row.id
     and removed_at is null;

  return invite_row.pair_id;
end;
$$;

revoke all on function public.accept_pair_invite() from public;
grant execute on function public.accept_pair_invite() to authenticated;
