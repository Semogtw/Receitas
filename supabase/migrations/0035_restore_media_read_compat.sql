-- Restore promotion predates the canonical browser-upload namespace and stores
-- immutable content-addressed objects as:
--   {pair_id}/{restore_actor_id}/restore/{photo_id}-{sha256}.{ext}
-- Normal browser uploads use:
--   pairs/{pair_id}/{recipes|cooking-sessions}/{owner_id}/{media_id}.{ext}
--
-- Both forms are pair-scoped private media. Keep browser INSERT restricted to
-- the modern namespace from 0031, but let active pair members read either
-- canonical form so restored photos are not made inaccessible after commit.

drop policy if exists recipe_media_select_pair on storage.objects;
create policy recipe_media_select_pair
on storage.objects
for select
to authenticated
using (
  bucket_id = 'recipe-media'
  and exists (
    select 1
      from public.pair_members pm
     where pm.user_id = (select auth.uid())
       and pm.activated_at is not null
       and pm.removed_at is null
       and (
         (
           (storage.foldername(name))[1] = 'pairs'
           and pm.pair_id::text = (storage.foldername(name))[2]
         )
         or (
           array_length(storage.foldername(name), 1) = 3
           and (storage.foldername(name))[3] = 'restore'
           and pm.pair_id::text = (storage.foldername(name))[1]
         )
       )
  )
);
