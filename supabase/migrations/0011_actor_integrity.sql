create or replace function private.enforce_immutable_uuid_field()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  field_name text := tg_argv[0];
  old_value text;
  new_value text;
begin
  old_value := to_jsonb(old) ->> field_name;
  new_value := to_jsonb(new) ->> field_name;

  if new_value is distinct from old_value then
    raise exception 'actor attribution is immutable' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

-- Replace the broad FOR ALL policies on records that carry historical actor
-- attribution. Both members may continue editing shared content, while insert
-- attribution must be the current authenticated identity.

drop policy if exists recipes_pair_member_all on public.recipes;
create policy recipes_select_pair on public.recipes for select to authenticated
  using (public.is_pair_member(pair_id));
create policy recipes_insert_self_actor on public.recipes for insert to authenticated
  with check (public.is_pair_member(pair_id) and created_by = auth.uid());
create policy recipes_update_pair on public.recipes for update to authenticated
  using (public.is_pair_member(pair_id))
  with check (public.is_pair_member(pair_id));

create trigger recipes_actor_immutable
before update of created_by on public.recipes
for each row execute function private.enforce_immutable_uuid_field('created_by');

drop policy if exists recipe_photos_pair_member_all on public.recipe_photos;
create policy recipe_photos_select_pair on public.recipe_photos for select to authenticated
  using (public.is_pair_member(pair_id));
create policy recipe_photos_insert_self_actor on public.recipe_photos for insert to authenticated
  with check (public.is_pair_member(pair_id) and created_by = auth.uid());
create policy recipe_photos_update_pair on public.recipe_photos for update to authenticated
  using (public.is_pair_member(pair_id))
  with check (public.is_pair_member(pair_id));

create trigger recipe_photos_actor_immutable
before update of created_by on public.recipe_photos
for each row execute function private.enforce_immutable_uuid_field('created_by');

drop policy if exists cooking_sessions_pair_member_all on public.cooking_sessions;
create policy cooking_sessions_select_pair on public.cooking_sessions for select to authenticated
  using (public.is_pair_member(pair_id));
create policy cooking_sessions_insert_self_actor on public.cooking_sessions for insert to authenticated
  with check (public.is_pair_member(pair_id) and recorded_by = auth.uid());
create policy cooking_sessions_update_pair on public.cooking_sessions for update to authenticated
  using (public.is_pair_member(pair_id))
  with check (public.is_pair_member(pair_id));

create trigger cooking_sessions_actor_immutable
before update of recorded_by on public.cooking_sessions
for each row execute function private.enforce_immutable_uuid_field('recorded_by');

drop policy if exists cooking_session_photos_pair_member_all on public.cooking_session_photos;
create policy cooking_session_photos_select_pair on public.cooking_session_photos for select to authenticated
  using (public.is_pair_member(pair_id));
create policy cooking_session_photos_insert_self_actor on public.cooking_session_photos for insert to authenticated
  with check (public.is_pair_member(pair_id) and created_by = auth.uid());
create policy cooking_session_photos_update_pair on public.cooking_session_photos for update to authenticated
  using (public.is_pair_member(pair_id))
  with check (public.is_pair_member(pair_id));

create trigger cooking_session_photos_actor_immutable
before update of created_by on public.cooking_session_photos
for each row execute function private.enforce_immutable_uuid_field('created_by');

drop policy if exists imports_pair_member_all on public.imports;
create policy imports_select_pair on public.imports for select to authenticated
  using (public.is_pair_member(pair_id));
create policy imports_insert_self_actor on public.imports for insert to authenticated
  with check (public.is_pair_member(pair_id) and created_by = auth.uid());
create policy imports_update_pair on public.imports for update to authenticated
  using (public.is_pair_member(pair_id))
  with check (public.is_pair_member(pair_id));

create trigger imports_actor_immutable
before update of created_by on public.imports
for each row execute function private.enforce_immutable_uuid_field('created_by');
