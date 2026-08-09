create or replace function private.restore_cleanup_eligible(
  p_status private.restore_job_status,
  p_updated_at timestamptz,
  p_expires_at timestamptz
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_expires_at <= now()
    or (p_status in ('completed', 'rejected') and p_updated_at <= now() - interval '15 minutes');
$$;

create or replace function public.read_restore_cleanup_candidates(p_limit integer default 2)
returns jsonb
language sql
security definer
stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(candidate.payload order by candidate.created_at), '[]'::jsonb)
  from (
    select
      j.created_at,
      jsonb_build_object(
        'id', j.id,
        'pair_id', j.pair_id,
        'status', j.status::text,
        'staged_media', coalesce((
          select jsonb_agg(jsonb_build_object(
            'storage_path', m.storage_path,
            'promoted_storage_path', m.promoted_storage_path
          ) order by m.path)
          from private.restore_staged_media m
          where m.job_id = j.id
        ), '[]'::jsonb)
      ) as payload
    from private.restore_jobs j
    where private.restore_cleanup_eligible(j.status, j.updated_at, j.expires_at)
      and not exists (
        select 1
        from private.restore_jobs parent
        where parent.safety_backup_id = j.id
          and not private.restore_cleanup_eligible(parent.status, parent.updated_at, parent.expires_at)
      )
    order by j.created_at
    limit greatest(1, least(coalesce(p_limit, 2), 10))
  ) candidate;
$$;

revoke all on function public.read_restore_cleanup_candidates(integer) from public, anon, authenticated;
grant execute on function public.read_restore_cleanup_candidates(integer) to service_role;

create or replace function public.delete_restore_cleanup_job(p_job_id uuid)
returns boolean
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
   for update;

  if not found then
    return false;
  end if;
  if not private.restore_cleanup_eligible(job.status, job.updated_at, job.expires_at) then
    raise exception 'restore job is not eligible for cleanup' using errcode = '22023';
  end if;
  if exists (
    select 1
    from private.restore_jobs parent
    where parent.safety_backup_id = p_job_id
      and not private.restore_cleanup_eligible(parent.status, parent.updated_at, parent.expires_at)
  ) then
    raise exception 'restore cleanup job is still referenced by a live replace job' using errcode = '55006';
  end if;

  update private.restore_jobs parent
     set safety_backup_id = null
   where parent.safety_backup_id = p_job_id
     and private.restore_cleanup_eligible(parent.status, parent.updated_at, parent.expires_at);

  delete from private.restore_jobs where id = p_job_id;
  return true;
end;
$$;

revoke all on function public.delete_restore_cleanup_job(uuid) from public, anon, authenticated;
grant execute on function public.delete_restore_cleanup_job(uuid) to service_role;
