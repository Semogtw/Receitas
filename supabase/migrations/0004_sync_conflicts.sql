create table public.conflicts (
  id uuid primary key,
  pair_id uuid not null references public.pairs(id) on delete restrict,
  entity_type text not null check (length(btrim(entity_type)) > 0),
  entity_id uuid not null,
  base_revision bigint check (base_revision is null or base_revision >= 0),
  base_payload jsonb,
  local_payload jsonb not null,
  remote_payload jsonb not null,
  status text not null default 'open' check (status in ('open', 'resolved')),
  resolution_strategy text check (resolution_strategy is null or resolution_strategy in ('choose_local', 'choose_remote', 'merge')),
  resolution_payload jsonb,
  resolved_by uuid,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  foreign key (pair_id, resolved_by) references public.pair_members(pair_id, user_id) on delete restrict,
  check (
    (status = 'open' and resolved_at is null and resolution_payload is null and resolution_strategy is null)
    or (status = 'resolved' and resolved_at is not null and resolution_payload is not null and resolution_strategy is not null and resolved_by is not null)
  )
);

create index conflicts_pair_open_idx
  on public.conflicts(pair_id, created_at desc)
  where status = 'open';
create index conflicts_entity_idx
  on public.conflicts(pair_id, entity_type, entity_id, created_at desc);

alter table public.conflicts enable row level security;
revoke all on table public.conflicts from anon, authenticated;
grant select on table public.conflicts to authenticated;

create policy conflicts_select_pair
on public.conflicts
for select
to authenticated
using (public.is_pair_member(pair_id));
