alter table private.restore_staged_media
  add column promoted_storage_path text,
  add column promoted_at timestamptz,
  add constraint restore_staged_media_promotion_pair
    check ((promoted_storage_path is null) = (promoted_at is null));

create or replace function public.mark_restore_media_promoted(
  p_job_id uuid,
  p_pair_id uuid,
  p_actor_user_id uuid,
  p_path text,
  p_promoted_storage_path text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  job private.restore_jobs%rowtype;
begin
  select * into job
    from private.restore_jobs j
   where j.id = p_job_id
     and j.pair_id = p_pair_id
   for update;

  if not found then
    raise exception 'restore job not found' using errcode = 'P0002';
  end if;
  if job.created_by is distinct from p_actor_user_id then
    raise exception 'restore actor mismatch' using errcode = '42501';
  end if;
  if job.mode <> 'merge' or job.status <> 'ready_to_commit' then
    raise exception 'restore job is not ready for media promotion' using errcode = '22023';
  end if;
  if p_promoted_storage_path not like (
    p_pair_id::text || '/' || p_actor_user_id::text || '/restore/%'
  ) then
    raise exception 'promoted media path escapes restore namespace' using errcode = '42501';
  end if;

  update private.restore_staged_media
     set promoted_storage_path = p_promoted_storage_path,
         promoted_at = now()
   where job_id = p_job_id
     and path = p_path;

  if not found then
    raise exception 'staged restore media not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.mark_restore_media_promoted(uuid, uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.mark_restore_media_promoted(uuid, uuid, uuid, text, text) to service_role;

create or replace function public.read_restore_media_promotion_server(
  p_job_id uuid,
  p_pair_id uuid,
  p_actor_user_id uuid
)
returns jsonb
language sql
security definer
stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'path', m.path,
    'sha256', m.sha256,
    'byte_size', m.byte_size,
    'media_type', m.media_type,
    'storage_path', m.storage_path,
    'promoted_storage_path', m.promoted_storage_path,
    'promoted_at', m.promoted_at
  ) order by m.path), '[]'::jsonb)
  from private.restore_staged_media m
  join private.restore_jobs j on j.id = m.job_id
  where j.id = p_job_id
    and j.pair_id = p_pair_id
    and j.created_by = p_actor_user_id;
$$;

revoke all on function public.read_restore_media_promotion_server(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.read_restore_media_promotion_server(uuid, uuid, uuid) to service_role;

create or replace function public.commit_restore_merge_checked(
  p_job_id uuid,
  p_pair_id uuid,
  p_actor_user_id uuid
)
returns table (
  inserted_count integer,
  noop_count integer,
  conflict_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  job private.restore_jobs%rowtype;
  expected_media integer;
  staged_media integer;
  promoted_media integer;
begin
  select * into job
    from private.restore_jobs j
   where j.id = p_job_id
     and j.pair_id = p_pair_id
   for update;

  if not found then
    raise exception 'restore job not found' using errcode = 'P0002';
  end if;
  if job.created_by is distinct from p_actor_user_id then
    raise exception 'restore actor mismatch' using errcode = '42501';
  end if;
  if job.mode <> 'merge' or job.status <> 'ready_to_commit' then
    raise exception 'restore merge is not ready to commit' using errcode = '22023';
  end if;

  expected_media := jsonb_array_length(coalesce(job.manifest -> 'mediaFiles', '[]'::jsonb));
  select count(*)::integer,
         count(*) filter (where m.promoted_at is not null and m.promoted_storage_path is not null)::integer
    into staged_media, promoted_media
    from private.restore_staged_media m
   where m.job_id = p_job_id;

  if staged_media <> expected_media or promoted_media <> expected_media then
    raise exception 'all restore media must be promoted before merge commit' using errcode = '22023';
  end if;

  return query
    select * from public.commit_restore_merge(p_job_id, p_pair_id, p_actor_user_id);
end;
$$;

-- The unchecked helper remains callable by database owner/internal SQL only.
revoke execute on function public.commit_restore_merge(uuid, uuid, uuid) from service_role;
revoke all on function public.commit_restore_merge_checked(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.commit_restore_merge_checked(uuid, uuid, uuid) to service_role;
