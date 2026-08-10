begin;

do $$
declare
  v_pair uuid := '71000000-0000-4000-8000-000000000001';
  v_user uuid := '71000000-0000-4000-8000-000000000002';
  v_recipe uuid := '71000000-0000-4000-8000-000000000003';
  v_ingredient uuid := '71000000-0000-4000-8000-000000000004';
  v_step uuid := '71000000-0000-4000-8000-000000000005';
  v_recipe_photo uuid := '71000000-0000-4000-8000-000000000006';
  v_session uuid := '71000000-0000-4000-8000-000000000007';
  v_session_photo uuid := '71000000-0000-4000-8000-000000000008';
  v_rating uuid := '71000000-0000-4000-8000-000000000009';
  v_category uuid := '71000000-0000-4000-8000-000000000010';
  v_recipe_category uuid := '71000000-0000-4000-8000-000000000011';
  v_plan uuid := '71000000-0000-4000-8000-000000000012';
  v_import uuid := '71000000-0000-4000-8000-000000000013';
  v_count integer;
begin
  insert into public.pairs (id, status) values (v_pair, 'initializing');
  insert into public.pair_members (pair_id, user_id, activated_at)
  values (v_pair, v_user, now());

  insert into public.recipes (
    id, pair_id, title, created_by, deleted_at
  ) values (
    v_recipe, v_pair, 'Permanent delete graph fixture', v_user, now()
  );

  insert into public.recipe_ingredients (
    id, pair_id, recipe_id, position, ingredient_name, normalized_name
  ) values (
    v_ingredient, v_pair, v_recipe, 0, 'Farinha', 'farinha'
  );

  insert into public.recipe_steps (
    id, pair_id, recipe_id, position, instruction
  ) values (
    v_step, v_pair, v_recipe, 0, 'Misture.'
  );

  insert into public.recipe_photos (
    id, pair_id, recipe_id, storage_path, storage_state, mime_type, created_by
  ) values (
    v_recipe_photo,
    v_pair,
    v_recipe,
    'pairs/71000000-0000-4000-8000-000000000001/recipes/71000000-0000-4000-8000-000000000003/recipe.webp',
    'uploaded',
    'image/webp',
    v_user
  );

  insert into public.cooking_sessions (
    id, pair_id, recipe_id, recorded_by, prepared_at, recipe_snapshot
  ) values (
    v_session, v_pair, v_recipe, v_user, now(), '{}'::jsonb
  );

  insert into public.cooking_session_photos (
    id, pair_id, cooking_session_id, storage_path, storage_state, mime_type, created_by
  ) values (
    v_session_photo,
    v_pair,
    v_session,
    'pairs/71000000-0000-4000-8000-000000000001/cooking-sessions/71000000-0000-4000-8000-000000000007/session.webp',
    'uploaded',
    'image/webp',
    v_user
  );

  insert into public.cooking_session_ratings (
    id, pair_id, cooking_session_id, user_id, score
  ) values (
    v_rating, v_pair, v_session, v_user, 8.0
  );

  insert into public.categories (id, pair_id, name)
  values (v_category, v_pair, 'Fixture category');
  insert into public.recipe_categories (id, pair_id, recipe_id, category_id)
  values (v_recipe_category, v_pair, v_recipe, v_category);

  insert into public.meal_plan_entries (
    id, pair_id, recipe_id, planned_date
  ) values (
    v_plan, v_pair, v_recipe, current_date
  );

  insert into public.imports (
    id, pair_id, created_by, source_kind, status, saved_recipe_id
  ) values (
    v_import, v_pair, v_user, 'text', 'saved', v_recipe
  );

  perform public.permanently_delete_entity_server(
    v_user,
    'recipes',
    v_recipe,
    v_pair
  );

  if exists (select 1 from public.recipes where id = v_recipe) then
    raise exception 'recipe survived permanent purge';
  end if;
  if exists (select 1 from public.recipe_ingredients where recipe_id = v_recipe)
     or exists (select 1 from public.recipe_steps where recipe_id = v_recipe)
     or exists (select 1 from public.recipe_photos where recipe_id = v_recipe)
     or exists (select 1 from public.cooking_sessions where recipe_id = v_recipe)
     or exists (select 1 from public.meal_plan_entries where recipe_id = v_recipe)
     or exists (select 1 from public.imports where saved_recipe_id = v_recipe)
     or exists (select 1 from public.recipe_categories where recipe_id = v_recipe) then
    raise exception 'recipe dependency graph survived permanent purge';
  end if;

  if not exists (select 1 from public.categories where id = v_category) then
    raise exception 'shared category was incorrectly deleted with recipe';
  end if;

  select count(*)::integer
    into v_count
    from private.media_delete_queue q
   where q.pair_id = v_pair;
  if v_count <> 2 then
    raise exception 'expected two media cleanup entries, found %', v_count;
  end if;

  if not exists (
    select 1 from private.media_delete_queue q
     where q.entity_type = 'recipe_photos' and q.entity_id = v_recipe_photo
  ) then
    raise exception 'recipe photo cleanup entry is missing';
  end if;
  if not exists (
    select 1 from private.media_delete_queue q
     where q.entity_type = 'cooking_session_photos' and q.entity_id = v_session_photo
  ) then
    raise exception 'cooking history photo cleanup entry is missing';
  end if;
end;
$$;

rollback;
