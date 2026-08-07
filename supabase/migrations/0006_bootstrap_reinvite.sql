alter table private.app_bootstrap_state
  add column reinvite_attempt_id uuid,
  add column reinvite_email text,
  add column reinvite_old_user_id uuid,
  add column reinvite_started_at timestamptz,
  add constraint app_bootstrap_reinvite_state_consistent check (
    (reinvite_attempt_id is null and reinvite_email is null and reinvite_old_user_id is null and reinvite_started_at is null)
    or
    (reinvite_attempt_id is not null and reinvite_email is not null and reinvite_old_user_id is not null and reinvite_started_at is not null)
  );

create or replace function public.find_auth_user_by_email(target_email text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select u.id
    from auth.users u
   where lower(btrim(u.email)) = lower(btrim(target_email))
   order by u.created_at desc
   limit 1;
$$;

create or replace function public.begin_bootstrap_reinvite(target_email text)
returns table (
  attempt_id uuid,
  pair_id uuid,
  old_user_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  state_row private.app_bootstrap_state%rowtype;
  pending_user_id uuid;
  pending_email text;
  new_attempt_id uuid;
begin
  if target_email is null or length(btrim(target_email)) = 0 then
    raise exception 'email required' using errcode = '22023';
  end if;

  select * into state_row
    from private.app_bootstrap_state
   where singleton = true
   for update;

  if state_row.consumed_at is null or state_row.pair_id is null then
    raise exception 'bootstrap has not been consumed' using errcode = 'P0001';
  end if;

  if state_row.reinvite_attempt_id is not null then
    if lower(state_row.reinvite_email) <> lower(btrim(target_email)) then
      raise exception 'bootstrap reinvite email mismatch' using errcode = '42501';
    end if;

    return query
    select state_row.reinvite_attempt_id, state_row.pair_id, state_row.reinvite_old_user_id;
    return;
  end if;

  select pm.user_id, u.email
    into pending_user_id, pending_email
    from public.pair_members pm
    join auth.users u on u.id = pm.user_id
   where pm.pair_id = state_row.pair_id
     and pm.invite_id is null
     and pm.activated_at is null
     and pm.removed_at is null
   for update of pm;

  if pending_user_id is null then
    raise exception 'pending bootstrap identity not found' using errcode = 'P0001';
  end if;

  if lower(btrim(pending_email)) <> lower(btrim(target_email)) then
    raise exception 'bootstrap reinvite email mismatch' using errcode = '42501';
  end if;

  new_attempt_id := gen_random_uuid();

  delete from public.pair_members
   where pair_id = state_row.pair_id
     and user_id = pending_user_id
     and activated_at is null
     and invite_id is null;

  update private.app_bootstrap_state
     set reinvite_attempt_id = new_attempt_id,
         reinvite_email = lower(btrim(target_email)),
         reinvite_old_user_id = pending_user_id,
         reinvite_started_at = now()
   where singleton = true;

  return query select new_attempt_id, state_row.pair_id, pending_user_id;
end;
$$;

create or replace function public.abort_bootstrap_reinvite(target_attempt_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  state_row private.app_bootstrap_state%rowtype;
begin
  select * into state_row
    from private.app_bootstrap_state
   where singleton = true
   for update;

  if state_row.reinvite_attempt_id is distinct from target_attempt_id then
    raise exception 'bootstrap reinvite attempt mismatch' using errcode = 'P0001';
  end if;

  if not exists (select 1 from auth.users u where u.id = state_row.reinvite_old_user_id) then
    raise exception 'old bootstrap identity no longer exists' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.pair_members pm
     where pm.pair_id = state_row.pair_id
       and pm.removed_at is null
  ) then
    insert into public.pair_members (pair_id, user_id)
    values (state_row.pair_id, state_row.reinvite_old_user_id);
  end if;

  update private.app_bootstrap_state
     set reinvite_attempt_id = null,
         reinvite_email = null,
         reinvite_old_user_id = null,
         reinvite_started_at = null
   where singleton = true;

  return state_row.pair_id;
end;
$$;

create or replace function public.finish_bootstrap_reinvite(
  target_attempt_id uuid,
  new_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  state_row private.app_bootstrap_state%rowtype;
  new_user_email text;
  existing_user_id uuid;
begin
  select * into state_row
    from private.app_bootstrap_state
   where singleton = true
   for update;

  if state_row.reinvite_attempt_id is null then
    select pm.user_id into existing_user_id
      from public.pair_members pm
     where pm.pair_id = state_row.pair_id
       and pm.invite_id is null
       and pm.activated_at is null
       and pm.removed_at is null;

    if existing_user_id = new_user_id then
      return state_row.pair_id;
    end if;

    raise exception 'bootstrap reinvite is not active' using errcode = 'P0001';
  end if;

  if state_row.reinvite_attempt_id is distinct from target_attempt_id then
    raise exception 'bootstrap reinvite attempt mismatch' using errcode = 'P0001';
  end if;

  select u.email into new_user_email
    from auth.users u
   where u.id = new_user_id;

  if new_user_email is null then
    raise exception 'new bootstrap identity not found' using errcode = '23503';
  end if;

  if lower(btrim(new_user_email)) <> state_row.reinvite_email then
    raise exception 'new bootstrap identity email mismatch' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.pair_members pm
     where pm.pair_id = state_row.pair_id
       and pm.removed_at is null
  ) then
    raise exception 'bootstrap pair already has a current membership' using errcode = 'P0001';
  end if;

  insert into public.pair_members (pair_id, user_id)
  values (state_row.pair_id, new_user_id);

  update private.app_bootstrap_state
     set reinvite_attempt_id = null,
         reinvite_email = null,
         reinvite_old_user_id = null,
         reinvite_started_at = null
   where singleton = true;

  return state_row.pair_id;
end;
$$;

revoke all on function public.find_auth_user_by_email(text) from public, anon, authenticated;
grant execute on function public.find_auth_user_by_email(text) to service_role;

revoke all on function public.begin_bootstrap_reinvite(text) from public, anon, authenticated;
grant execute on function public.begin_bootstrap_reinvite(text) to service_role;

revoke all on function public.abort_bootstrap_reinvite(uuid) from public, anon, authenticated;
grant execute on function public.abort_bootstrap_reinvite(uuid) to service_role;

revoke all on function public.finish_bootstrap_reinvite(uuid, uuid) from public, anon, authenticated;
grant execute on function public.finish_bootstrap_reinvite(uuid, uuid) to service_role;
