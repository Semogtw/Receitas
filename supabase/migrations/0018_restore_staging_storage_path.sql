create or replace function public.stage_restore_media_entry(
  p_job_id uuid,
  p_pair_id uuid,
  p_actor_user_id uuid,
  p_path text,
  p_sha256 text,
  p_byte_size bigint,
  p_media_type text,
  p_storage_path text
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
   where j.id = p_job_id and j.pair_id = p_pair_id
   for update;

  if not found then
    raise exception 'restore job not found' using errcode = 'P0002';
  end if;
  if job.created_by is distinct from p_actor_user_id then
    raise exception 'restore actor mismatch' using errcode = '42501';
  end if;
  if job.status <> 'uploading' then
    raise exception 'restore job no longer accepts staged media' using errcode = '22023';
  end if;
  if job.expires_at <= now() then
    raise exception 'restore job expired' using errcode = '22023';
  end if;

  -- p_storage_path is an object path inside the restore-staging bucket, so the
  -- bucket name itself must not be duplicated in the object key.
  if p_storage_path not like (p_pair_id::text || '/' || p_job_id::text || '/%') then
    raise exception 'restore media storage path escapes the job namespace' using errcode = '42501';
  end if;

  insert into private.restore_staged_media (
    job_id, path, sha256, byte_size, media_type, storage_path
  ) values (
    p_job_id, p_path, p_sha256, p_byte_size, p_media_type, p_storage_path
  )
  on conflict (job_id, path) do update
     set sha256 = excluded.sha256,
         byte_size = excluded.byte_size,
         media_type = excluded.media_type,
         storage_path = excluded.storage_path,
         staged_at = now();
end;
$$;

revoke all on function public.stage_restore_media_entry(uuid, uuid, uuid, text, text, bigint, text, text) from public, anon, authenticated;
grant execute on function public.stage_restore_media_entry(uuid, uuid, uuid, text, text, bigint, text, text) to service_role;
