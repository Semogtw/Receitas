create table public.meal_periods (
  id uuid primary key,
  pair_id uuid not null references public.pairs(id) on delete restrict,
  name text not null check (length(btrim(name)) between 1 and 80),
  position integer not null default 0 check (position >= 0),
  revision bigint not null default 0 check (revision >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, pair_id)
);

create unique index meal_periods_pair_active_name_idx
  on public.meal_periods(pair_id, lower(btrim(name)))
  where deleted_at is null;

create table public.meal_plan_entries (
  id uuid primary key,
  pair_id uuid not null references public.pairs(id) on delete restrict,
  recipe_id uuid not null,
  meal_period_id uuid,
  planned_date date not null,
  planned_time time,
  servings_numerator bigint,
  servings_denominator bigint,
  note text,
  revision bigint not null default 0 check (revision >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, pair_id),
  foreign key (recipe_id, pair_id) references public.recipes(id, pair_id) on delete restrict,
  foreign key (meal_period_id, pair_id) references public.meal_periods(id, pair_id) on delete restrict,
  check (
    (servings_numerator is null and servings_denominator is null)
    or (servings_numerator is not null and servings_denominator is not null and servings_denominator > 0)
  )
);

create index meal_plan_entries_pair_date_idx
  on public.meal_plan_entries(pair_id, planned_date, planned_time)
  where deleted_at is null;

create table public.shopping_lists (
  id uuid primary key,
  pair_id uuid not null references public.pairs(id) on delete restrict,
  name text not null check (length(btrim(name)) between 1 and 120),
  is_default boolean not null default false,
  completed_at timestamptz,
  revision bigint not null default 0 check (revision >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, pair_id)
);

create unique index shopping_lists_one_default_idx
  on public.shopping_lists(pair_id)
  where is_default = true and deleted_at is null;

create index shopping_lists_pair_active_idx
  on public.shopping_lists(pair_id, updated_at desc)
  where deleted_at is null;

create table public.shopping_items (
  id uuid primary key,
  pair_id uuid not null,
  shopping_list_id uuid not null,
  item_name text not null check (length(btrim(item_name)) > 0),
  normalized_name text not null check (length(btrim(normalized_name)) > 0),
  quantity_numerator bigint,
  quantity_denominator bigint,
  quantity_text text,
  unit text,
  checked boolean not null default false,
  source_kind text not null default 'manual' check (source_kind in ('manual', 'recipe', 'planner', 'mixed')),
  source_refs jsonb not null default '[]'::jsonb check (jsonb_typeof(source_refs) = 'array'),
  position integer not null default 0 check (position >= 0),
  revision bigint not null default 0 check (revision >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, pair_id),
  foreign key (shopping_list_id, pair_id) references public.shopping_lists(id, pair_id) on delete restrict,
  check (
    (quantity_numerator is null and quantity_denominator is null)
    or (quantity_numerator is not null and quantity_denominator is not null and quantity_denominator > 0)
  ),
  check (quantity_text is null or (quantity_numerator is null and quantity_denominator is null))
);

create index shopping_items_list_position_idx
  on public.shopping_items(shopping_list_id, checked, position)
  where deleted_at is null;
create index shopping_items_pair_normalized_idx
  on public.shopping_items(pair_id, normalized_name)
  where deleted_at is null;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'meal_periods',
    'meal_plan_entries',
    'shopping_lists',
    'shopping_items'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from anon, authenticated', table_name);
    execute format('grant select, insert, update on table public.%I to authenticated', table_name);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.is_pair_member(pair_id)) with check (public.is_pair_member(pair_id))',
      table_name || '_pair_member_all',
      table_name
    );
  end loop;
end;
$$;
