alter table public.pair_members
  drop constraint if exists pair_members_user_id_fkey;

alter table public.pair_invites
  drop constraint if exists pair_invites_created_by_fkey;

alter table public.pair_invites
  add constraint pair_invites_creator_member_fkey
  foreign key (pair_id, created_by)
  references public.pair_members(pair_id, user_id)
  on delete restrict;

-- `pair_members.user_id` intentionally remains a stable historical UUID even if
-- the corresponding Supabase Auth identity is later deleted. Privileged
-- membership-creation functions validate that a matching auth.users row exists
-- at creation time, while domain authorship keeps referencing the stable UUID.
