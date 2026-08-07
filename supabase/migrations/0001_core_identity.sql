create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create type public.pair_status as enum (
  'initializing',
  'open_for_second_member',
  'closed'
);

create table public.pairs (
  id uuid primary key default gen_random_uuid(),
  status public.pair_status not null default 'initializing',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table private.app_bootstrap_state (
  singleton boolean primary key default true check (singleton),
  consumed_at timestamptz,
  pair_id uuid unique references public.pairs(id) on delete restrict,
  check ((consumed_at is null) = (pair_id is null))
);

insert into private.app_bootstrap_state (singleton) values (true);

create table public.pair_members (
  pair_id uuid not null references public.pairs(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  joined_at timestamptz not null default now(),
  activated_at timestamptz,
  removed_at timestamptz,
  primary key (pair_id, user_id),
  check (activated_at is null or activated_at >= joined_at)
);

create unique index pair_members_current_user_idx
  on public.pair_members(user_id)
  where removed_at is null;

create index pair_members_pair_current_idx
  on public.pair_members(pair_id)
  where removed_at is null;

create table public.pair_invites (
  id uuid primary key default gen_random_uuid(),
  pair_id uuid not null references public.pairs(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid not null references auth.users(id) on delete restrict,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  invalidated_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at),
  check (consumed_at is null or invalidated_at is null)
);

create unique index pair_invites_one_unresolved_per_pair_idx
  on public.pair_invites(pair_id)
  where consumed_at is null and invalidated_at is null;

create or replace function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger pairs_touch_updated_at
before update on public.pairs
for each row execute function private.touch_updated_at();

create or replace function private.enforce_pair_member_capacity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  pair_state public.pair_status;
  seat_count integer;
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
    raise exception 'pair is closed' using errcode = 'P0001';
  end if;

  select count(*)::integer
    into seat_count
    from public.pair_members pm
   where pm.pair_id = new.pair_id
     and pm.removed_at is null;

  if seat_count >= 2 then
    raise exception 'pair already has two members' using errcode = 'P0001';
  end if;

  if seat_count = 0 then
    update public.pairs
       set status = 'open_for_second_member'
     where id = new.pair_id;
  elsif seat_count = 1 then
    update public.pairs
       set status = 'closed'
     where id = new.pair_id;
  end if;

  return new;
end;
$$;

create trigger pair_members_enforce_capacity
before insert or update of removed_at on public.pair_members
for each row execute function private.enforce_pair_member_capacity();

create or replace function public.is_pair_member(target_pair_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.pair_members pm
     where pm.pair_id = target_pair_id
       and pm.user_id = auth.uid()
       and pm.activated_at is not null
       and pm.removed_at is null
  );
$$;

create or replace function public.activate_current_pair_membership()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  current_pair_id uuid;
  verified_at timestamptz;
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

  select pm.pair_id
    into current_pair_id
    from public.pair_members pm
   where pm.user_id = current_user_id
     and pm.removed_at is null
   for update;

  if current_pair_id is null then
    raise exception 'pair membership not found' using errcode = 'P0001';
  end if;

  update public.pair_members
     set activated_at = coalesce(activated_at, now())
   where pair_id = current_pair_id
     and user_id = current_user_id
     and removed_at is null;

  return current_pair_id;
end;
$$;

create or replace function public.create_bootstrap_pair(invited_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  state_row private.app_bootstrap_state%rowtype;
  new_pair_id uuid := gen_random_uuid();
begin
  if not exists (select 1 from auth.users u where u.id = invited_user_id) then
    raise exception 'auth user does not exist' using errcode = '23503';
  end if;

  select *
    into state_row
    from private.app_bootstrap_state
   where singleton = true
   for update;

  if state_row.consumed_at is not null then
    raise exception 'bootstrap already consumed' using errcode = 'P0001';
  end if;

  insert into public.pairs (id) values (new_pair_id);
  insert into public.pair_members (pair_id, user_id)
  values (new_pair_id, invited_user_id);

  update private.app_bootstrap_state
     set consumed_at = now(), pair_id = new_pair_id
   where singleton = true;

  return new_pair_id;
end;
$$;

create or replace function public.create_pair_invite(
  target_pair_id uuid,
  creator_user_id uuid,
  invite_token_hash text,
  invite_expires_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_invite_id uuid := gen_random_uuid();
  pair_state public.pair_status;
  current_count integer;
begin
  if invite_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid invite token hash' using errcode = '22023';
  end if;

  if invite_expires_at <= now() then
    raise exception 'invite expiry must be in the future' using errcode = '22023';
  end if;

  select p.status into pair_state
    from public.pairs p
   where p.id = target_pair_id
   for update;

  if pair_state is distinct from 'open_for_second_member'::public.pair_status then
    raise exception 'pair is not accepting its second member' using errcode = 'P0001';
  end if;

  if not exists (
    select 1
      from public.pair_members pm
     where pm.pair_id = target_pair_id
       and pm.user_id = creator_user_id
       and pm.activated_at is not null
       and pm.removed_at is null
  ) then
    raise exception 'active pair member required' using errcode = '42501';
  end if;

  select count(*)::integer into current_count
    from public.pair_members pm
   where pm.pair_id = target_pair_id
     and pm.removed_at is null;

  if current_count <> 1 then
    raise exception 'pair must have exactly one current member' using errcode = 'P0001';
  end if;

  update public.pair_invites
     set invalidated_at = coalesce(invalidated_at, now())
   where pair_id = target_pair_id
     and consumed_at is null
     and invalidated_at is null;

  insert into public.pair_invites (
    id, pair_id, token_hash, created_by, expires_at
  ) values (
    new_invite_id, target_pair_id, invite_token_hash, creator_user_id, invite_expires_at
  );

  return new_invite_id;
end;
$$;

create or replace function public.consume_pair_invite(
  invite_token_hash text,
  invited_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  invite_row public.pair_invites%rowtype;
  pair_state public.pair_status;
  current_count integer;
begin
  if not exists (select 1 from auth.users u where u.id = invited_user_id) then
    raise exception 'auth user does not exist' using errcode = '23503';
  end if;

  select * into invite_row
    from public.pair_invites pi
   where pi.token_hash = invite_token_hash
   for update;

  if not found
     or invite_row.consumed_at is not null
     or invite_row.invalidated_at is not null
     or invite_row.expires_at <= now() then
    raise exception 'invite is invalid or expired' using errcode = 'P0001';
  end if;

  select p.status into pair_state
    from public.pairs p
   where p.id = invite_row.pair_id
   for update;

  if pair_state is distinct from 'open_for_second_member'::public.pair_status then
    raise exception 'pair is not accepting its second member' using errcode = 'P0001';
  end if;

  select count(*)::integer into current_count
    from public.pair_members pm
   where pm.pair_id = invite_row.pair_id
     and pm.removed_at is null;

  if current_count <> 1 then
    raise exception 'pair must have exactly one current member' using errcode = 'P0001';
  end if;

  insert into public.pair_members (pair_id, user_id)
  values (invite_row.pair_id, invited_user_id);

  update public.pair_invites
     set consumed_at = now()
   where id = invite_row.id;

  update public.pair_invites
     set invalidated_at = coalesce(invalidated_at, now())
   where pair_id = invite_row.pair_id
     and id <> invite_row.id
     and consumed_at is null
     and invalidated_at is null;

  return invite_row.pair_id;
end;
$$;

alter table public.pairs enable row level security;
alter table public.pair_members enable row level security;
alter table public.pair_invites enable row level security;
alter table private.app_bootstrap_state enable row level security;

create policy pairs_select_for_member
on public.pairs
for select
to authenticated
using (public.is_pair_member(id));

create policy pair_members_select_for_member
on public.pair_members
for select
to authenticated
using (public.is_pair_member(pair_id));

revoke all on table private.app_bootstrap_state from public, anon, authenticated;
revoke all on table public.pair_invites from anon, authenticated;
revoke insert, update, delete on table public.pairs from anon, authenticated;
revoke insert, update, delete on table public.pair_members from anon, authenticated;
grant select on table public.pairs, public.pair_members to authenticated;

revoke all on function public.is_pair_member(uuid) from public;
grant execute on function public.is_pair_member(uuid) to authenticated;

revoke all on function public.activate_current_pair_membership() from public;
grant execute on function public.activate_current_pair_membership() to authenticated;

revoke all on function public.create_bootstrap_pair(uuid) from public, anon, authenticated;
grant execute on function public.create_bootstrap_pair(uuid) to service_role;

revoke all on function public.create_pair_invite(uuid, uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.create_pair_invite(uuid, uuid, text, timestamptz) to service_role;

revoke all on function public.consume_pair_invite(text, uuid) from public, anon, authenticated;
grant execute on function public.consume_pair_invite(text, uuid) to service_role;
