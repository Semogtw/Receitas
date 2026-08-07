create table public.recipes (
  id uuid primary key,
  pair_id uuid not null references public.pairs(id) on delete restrict,
  title text not null check (length(btrim(title)) between 1 and 200),
  description text,
  base_yield_numerator bigint,
  base_yield_denominator bigint,
  base_yield_unit text,
  prep_time_seconds integer check (prep_time_seconds is null or prep_time_seconds >= 0),
  cook_time_seconds integer check (cook_time_seconds is null or cook_time_seconds >= 0),
  total_time_seconds integer check (total_time_seconds is null or total_time_seconds >= 0),
  favorite boolean not null default false,
  want_to_make boolean not null default false,
  source_kind text not null default 'manual' check (source_kind in ('manual', 'url', 'text', 'backup')),
  source_url text,
  created_by uuid not null,
  revision bigint not null default 0 check (revision >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, pair_id),
  foreign key (pair_id, created_by) references public.pair_members(pair_id, user_id) on delete restrict,
  check (
    (base_yield_numerator is null and base_yield_denominator is null)
    or (base_yield_numerator is not null and base_yield_denominator is not null and base_yield_denominator > 0)
  )
);

create index recipes_pair_active_idx on public.recipes(pair_id, updated_at desc) where deleted_at is null;
create index recipes_pair_favorite_idx on public.recipes(pair_id, favorite) where deleted_at is null;
create index recipes_pair_want_to_make_idx on public.recipes(pair_id, want_to_make) where deleted_at is null;

create table public.recipe_ingredients (
  id uuid primary key,
  pair_id uuid not null,
  recipe_id uuid not null,
  position integer not null check (position >= 0),
  quantity_numerator bigint,
  quantity_denominator bigint,
  quantity_text text,
  unit text,
  ingredient_name text not null check (length(btrim(ingredient_name)) > 0),
  normalized_name text not null check (length(btrim(normalized_name)) > 0),
  note text,
  is_approximate boolean not null default false,
  is_optional boolean not null default false,
  revision bigint not null default 0 check (revision >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, pair_id),
  foreign key (recipe_id, pair_id) references public.recipes(id, pair_id) on delete restrict,
  check (
    (quantity_numerator is null and quantity_denominator is null)
    or (quantity_numerator is not null and quantity_denominator is not null and quantity_denominator > 0)
  ),
  check (quantity_text is null or (quantity_numerator is null and quantity_denominator is null))
);

create index recipe_ingredients_recipe_position_idx
  on public.recipe_ingredients(recipe_id, position)
  where deleted_at is null;
create index recipe_ingredients_pair_normalized_idx
  on public.recipe_ingredients(pair_id, normalized_name)
  where deleted_at is null;

create table public.recipe_steps (
  id uuid primary key,
  pair_id uuid not null,
  recipe_id uuid not null,
  position integer not null check (position >= 0),
  instruction text not null check (length(btrim(instruction)) > 0),
  duration_seconds integer check (duration_seconds is null or duration_seconds > 0),
  observation text,
  revision bigint not null default 0 check (revision >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, pair_id),
  foreign key (recipe_id, pair_id) references public.recipes(id, pair_id) on delete restrict
);

create index recipe_steps_recipe_position_idx
  on public.recipe_steps(recipe_id, position)
  where deleted_at is null;

create table public.categories (
  id uuid primary key,
  pair_id uuid not null references public.pairs(id) on delete restrict,
  name text not null check (length(btrim(name)) between 1 and 80),
  revision bigint not null default 0 check (revision >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, pair_id)
);

create unique index categories_pair_active_name_idx
  on public.categories(pair_id, lower(btrim(name)))
  where deleted_at is null;

create table public.recipe_categories (
  id uuid primary key,
  pair_id uuid not null,
  recipe_id uuid not null,
  category_id uuid not null,
  revision bigint not null default 0 check (revision >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, pair_id),
  foreign key (recipe_id, pair_id) references public.recipes(id, pair_id) on delete restrict,
  foreign key (category_id, pair_id) references public.categories(id, pair_id) on delete restrict
);

create unique index recipe_categories_active_unique_idx
  on public.recipe_categories(recipe_id, category_id)
  where deleted_at is null;

create table public.recipe_photos (
  id uuid primary key,
  pair_id uuid not null,
  recipe_id uuid not null,
  storage_path text not null check (length(btrim(storage_path)) > 0),
  storage_state text not null default 'pending' check (storage_state in ('pending', 'uploaded')),
  mime_type text not null check (mime_type like 'image/%'),
  byte_size bigint check (byte_size is null or byte_size >= 0),
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  sha256 text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  position integer not null default 0 check (position >= 0),
  is_cover boolean not null default false,
  created_by uuid not null,
  revision bigint not null default 0 check (revision >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, pair_id),
  foreign key (recipe_id, pair_id) references public.recipes(id, pair_id) on delete restrict,
  foreign key (pair_id, created_by) references public.pair_members(pair_id, user_id) on delete restrict
);

create index recipe_photos_recipe_position_idx
  on public.recipe_photos(recipe_id, position)
  where deleted_at is null;
create unique index recipe_photos_one_active_cover_idx
  on public.recipe_photos(recipe_id)
  where deleted_at is null and is_cover = true;

create table public.cooking_sessions (
  id uuid primary key,
  pair_id uuid not null,
  recipe_id uuid not null,
  recorded_by uuid not null,
  started_at timestamptz,
  prepared_at timestamptz not null,
  prepared_yield_numerator bigint,
  prepared_yield_denominator bigint,
  shared_observation text,
  recipe_snapshot_version integer not null default 1 check (recipe_snapshot_version > 0),
  recipe_snapshot jsonb not null check (jsonb_typeof(recipe_snapshot) = 'object'),
  revision bigint not null default 0 check (revision >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, pair_id),
  foreign key (recipe_id, pair_id) references public.recipes(id, pair_id) on delete restrict,
  foreign key (pair_id, recorded_by) references public.pair_members(pair_id, user_id) on delete restrict,
  check (
    (prepared_yield_numerator is null and prepared_yield_denominator is null)
    or (prepared_yield_numerator is not null and prepared_yield_denominator is not null and prepared_yield_denominator > 0)
  )
);

create index cooking_sessions_recipe_prepared_idx
  on public.cooking_sessions(recipe_id, prepared_at desc)
  where deleted_at is null;
create index cooking_sessions_pair_prepared_idx
  on public.cooking_sessions(pair_id, prepared_at desc)
  where deleted_at is null;

create table public.cooking_session_ratings (
  id uuid primary key,
  pair_id uuid not null,
  cooking_session_id uuid not null,
  user_id uuid not null,
  score numeric(3,1) not null check (score >= 0 and score <= 10 and mod(score * 2, 1) = 0),
  comment text,
  revision bigint not null default 0 check (revision >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, pair_id),
  foreign key (cooking_session_id, pair_id) references public.cooking_sessions(id, pair_id) on delete restrict,
  foreign key (pair_id, user_id) references public.pair_members(pair_id, user_id) on delete restrict
);

create unique index cooking_session_ratings_active_user_idx
  on public.cooking_session_ratings(cooking_session_id, user_id)
  where deleted_at is null;

create table public.cooking_session_photos (
  id uuid primary key,
  pair_id uuid not null,
  cooking_session_id uuid not null,
  storage_path text not null check (length(btrim(storage_path)) > 0),
  storage_state text not null default 'pending' check (storage_state in ('pending', 'uploaded')),
  mime_type text not null check (mime_type like 'image/%'),
  byte_size bigint check (byte_size is null or byte_size >= 0),
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  sha256 text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  position integer not null default 0 check (position >= 0),
  created_by uuid not null,
  revision bigint not null default 0 check (revision >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, pair_id),
  foreign key (cooking_session_id, pair_id) references public.cooking_sessions(id, pair_id) on delete restrict,
  foreign key (pair_id, created_by) references public.pair_members(pair_id, user_id) on delete restrict
);

create index cooking_session_photos_session_position_idx
  on public.cooking_session_photos(cooking_session_id, position)
  where deleted_at is null;

create table public.ingredient_conversion_profiles (
  id uuid primary key,
  pair_id uuid not null references public.pairs(id) on delete restrict,
  ingredient_normalized_name text not null check (length(btrim(ingredient_normalized_name)) > 0),
  from_unit text not null check (length(btrim(from_unit)) > 0),
  to_unit text not null check (length(btrim(to_unit)) > 0),
  factor_numerator bigint not null check (factor_numerator > 0),
  factor_denominator bigint not null check (factor_denominator > 0),
  is_approximate boolean not null default true,
  source_note text,
  revision bigint not null default 0 check (revision >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, pair_id),
  check (lower(from_unit) <> lower(to_unit))
);

create unique index ingredient_conversion_profiles_active_key_idx
  on public.ingredient_conversion_profiles(
    pair_id,
    lower(ingredient_normalized_name),
    lower(from_unit),
    lower(to_unit)
  )
  where deleted_at is null;

create table public.imports (
  id uuid primary key,
  pair_id uuid not null references public.pairs(id) on delete restrict,
  created_by uuid not null,
  source_kind text not null check (source_kind in ('url', 'text')),
  source_url text,
  status text not null default 'draft' check (status in ('draft', 'ready_for_review', 'saved', 'failed')),
  parser_strategy text,
  extracted_payload jsonb not null default '{}'::jsonb check (jsonb_typeof(extracted_payload) = 'object'),
  extraction_errors jsonb not null default '[]'::jsonb check (jsonb_typeof(extraction_errors) = 'array'),
  saved_recipe_id uuid,
  revision bigint not null default 0 check (revision >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, pair_id),
  foreign key (pair_id, created_by) references public.pair_members(pair_id, user_id) on delete restrict,
  foreign key (saved_recipe_id, pair_id) references public.recipes(id, pair_id) on delete restrict,
  check ((source_kind = 'url' and source_url is not null) or source_kind = 'text')
);

create index imports_pair_created_idx on public.imports(pair_id, created_at desc) where deleted_at is null;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'recipes',
    'recipe_ingredients',
    'recipe_steps',
    'categories',
    'recipe_categories',
    'recipe_photos',
    'cooking_sessions',
    'cooking_session_photos',
    'ingredient_conversion_profiles',
    'imports'
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

alter table public.cooking_session_ratings enable row level security;
revoke all on table public.cooking_session_ratings from anon, authenticated;
grant select, insert, update on table public.cooking_session_ratings to authenticated;

create policy cooking_session_ratings_select_pair
on public.cooking_session_ratings
for select
to authenticated
using (public.is_pair_member(pair_id));

create policy cooking_session_ratings_insert_self
on public.cooking_session_ratings
for insert
to authenticated
with check (public.is_pair_member(pair_id) and user_id = auth.uid());

create policy cooking_session_ratings_update_self
on public.cooking_session_ratings
for update
to authenticated
using (public.is_pair_member(pair_id) and user_id = auth.uid())
with check (public.is_pair_member(pair_id) and user_id = auth.uid());
