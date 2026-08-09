create type private.restore_mode as enum ('merge', 'replace_all');
create type private.restore_job_status as enum (
  'uploading',
  'validating',
  'ready_to_commit',
  'committing',
  'completed',
  'rejected'
);

create table private.restore_jobs (
  id uuid primary key default gen_random_uuid(),
  pair_id uuid not null references public.pairs(id) on delete restrict,
  created_by uuid not null,
  mode private.restore_mode not null,
  status private.restore_job_status not null default 'uploading',
  manifest_sha256 text not null check (manifest_sha256 ~ '^[0-9a-f]{64}$'),
  manifest jsonb not null check (jsonb_typeof(manifest) = 'object'),
  source_pair_export_id text not null check (length(btrim(source_pair_export_id)) between 1 and 200),
  safety_backup_id uuid references private.restore_jobs(id) on delete restrict,
  rejection_code text,
  rejection_detail text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  validated_at timestamptz,
  committed_at timestamptz,
  expires_at timestamptz not null default (now() + interval '24 hours'),
  unique (id, pair_id),
  foreign key (pair_id, created_by) references public.pair_members(pair_id, user_id) on delete restrict,
  check (expires_at > created_at),
  check ((status = 'rejected') = (rejection_code is not null)),
  check (rejection_detail is null or length(rejection_detail) <= 1000),
  check (mode <> 'replace_all' or safety_backup_id is null or safety_backup_id <> id)
);

create index restore_jobs_pair_created_idx
  on private.restore_jobs(pair_id, created_at desc);
create index restore_jobs_expiry_idx
  on private.restore_jobs(expires_at)
  where status not in ('completed', 'rejected');

create table private.restore_staged_data (
  job_id uuid not null references private.restore_jobs(id) on delete cascade,
  path text not null,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  byte_size bigint not null check (byte_size >= 0),
  payload jsonb not null,
  staged_at timestamptz not null default now(),
  primary key (job_id, path),
  check (path like 'data/%' and path !~ '(^|/)\.\.?(/|$)'),
  check (byte_size <= 67108864)
);

create table private.restore_staged_media (
  job_id uuid not null references private.restore_jobs(id) on delete cascade,
  path text not null,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  byte_size bigint not null check (byte_size between 0 and 26214400),
  media_type text not null check (media_type in ('image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif')),
  storage_path text not null check (length(btrim(storage_path)) > 0),
  staged_at timestamptz not null default now(),
  primary key (job_id, path),
  unique (storage_path),
  check (path like 'media/%' and path !~ '(^|/)\.\.?(/|$)')
);

revoke all on private.restore_jobs from public, anon, authenticated;
revoke all on private.restore_staged_data from public, anon, authenticated;
revoke all on private.restore_staged_media from public, anon, authenticated;

create or replace function private.touch_restore_job_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger restore_jobs_touch_updated_at
before update on private.restore_jobs
for each row execute function private.touch_restore_job_updated_at();

create or replace function private.assert_restore_job_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = new.status then
    return new;
  end if;

  if old.status = 'uploading' and new.status in ('validating', 'rejected') then
    return new;
  end if;
  if old.status = 'validating' and new.status in ('ready_to_commit', 'rejected') then
    return new;
  end if;
  if old.status = 'ready_to_commit' and new.status in ('committing', 'rejected') then
    return new;
  end if;
  if old.status = 'committing' and new.status in ('completed', 'rejected') then
    return new;
  end if;

  raise exception 'invalid restore job status transition: % -> %', old.status, new.status
    using errcode = '22023';
end;
$$;

create trigger restore_jobs_enforce_transition
before update of status on private.restore_jobs
for each row execute function private.assert_restore_job_transition();

create or replace function public.create_restore_job(
  p_pair_id uuid,
  p_created_by uuid,
  p_mode text,
  p_manifest_sha256 text,
  p_manifest jsonb,
  p_source_pair_export_id text
)
returns table (
  id uuid,
  pair_id uuid,
  mode text,
  status text,
  manifest_sha256 text,
  safety_backup_id uuid,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  created private.restore_jobs%rowtype;
begin
  if p_mode not in ('merge', 'replace_all') then
    raise exception 'unsupported restore mode' using errcode = '22023';
  end if;
  if p_manifest is null or jsonb_typeof(p_manifest) <> 'object' then
    raise exception 'restore manifest must be an object' using errcode = '22023';
  end if;

  insert into private.restore_jobs (
    pair_id,
    created_by,
    mode,
    manifest_sha256,
    manifest,
    source_pair_export_id
  ) values (
    p_pair_id,
    p_created_by,
    p_mode::private.restore_mode,
    p_manifest_sha256,
    p_manifest,
    p_source_pair_export_id
  ) returning * into created;

  return query select
    created.id,
    created.pair_id,
    created.mode::text,
    created.status::text,
    created.manifest_sha256,
    created.safety_backup_id,
    created.expires_at;
end;
$$;

revoke all on function public.create_restore_job(uuid, uuid, text, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.create_restore_job(uuid, uuid, text, text, jsonb, text) to service_role;

create or replace function public.stage_restore_data_entry(
  p_job_id uuid,
  p_pair_id uuid,
  p_actor_user_id uuid,
  p_path text,
  p_sha256 text,
  p_byte_size bigint,
  p_payload jsonb
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
    raise exception 'restore job no longer accepts staged data' using errcode = '22023';
  end if;
  if job.expires_at <= now() then
    raise exception 'restore job expired' using errcode = '22023';
  end if;

  insert into private.restore_staged_data (job_id, path, sha256, byte_size, payload)
  values (p_job_id, p_path, p_sha256, p_byte_size, p_payload)
  on conflict (job_id, path) do update
     set sha256 = excluded.sha256,
         byte_size = excluded.byte_size,
         payload = excluded.payload,
         staged_at = now();
end;
$$;

revoke all on function public.stage_restore_data_entry(uuid, uuid, uuid, text, text, bigint, jsonb) from public, anon, authenticated;
grant execute on function public.stage_restore_data_entry(uuid, uuid, uuid, text, text, bigint, jsonb) to service_role;

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
  if p_storage_path not like ('restore-staging/' || p_pair_id::text || '/' || p_job_id::text || '/%') then
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

create or replace function public.begin_restore_validation(
  p_job_id uuid,
  p_pair_id uuid,
  p_actor_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update private.restore_jobs
     set status = 'validating'
   where id = p_job_id
     and pair_id = p_pair_id
     and created_by = p_actor_user_id
     and status = 'uploading'
     and expires_at > now();

  if not found then
    raise exception 'restore job is not ready for validation' using errcode = '22023';
  end if;
end;
$$;

revoke all on function public.begin_restore_validation(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.begin_restore_validation(uuid, uuid, uuid) to service_role;

create or replace function public.finish_restore_validation(
  p_job_id uuid,
  p_pair_id uuid,
  p_actor_user_id uuid,
  p_valid boolean,
  p_rejection_code text default null,
  p_rejection_detail text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_valid then
    update private.restore_jobs
       set status = 'ready_to_commit',
           validated_at = now(),
           rejection_code = null,
           rejection_detail = null
     where id = p_job_id
       and pair_id = p_pair_id
       and created_by = p_actor_user_id
       and status = 'validating';
  else
    if p_rejection_code is null or length(btrim(p_rejection_code)) = 0 then
      raise exception 'restore rejection code is required' using errcode = '22023';
    end if;
    update private.restore_jobs
       set status = 'rejected',
           rejection_code = left(p_rejection_code, 120),
           rejection_detail = left(p_rejection_detail, 1000)
     where id = p_job_id
       and pair_id = p_pair_id
       and created_by = p_actor_user_id
       and status in ('uploading', 'validating', 'ready_to_commit', 'committing');
  end if;

  if not found then
    raise exception 'restore job validation state changed unexpectedly' using errcode = '22023';
  end if;
end;
$$;

revoke all on function public.finish_restore_validation(uuid, uuid, uuid, boolean, text, text) from public, anon, authenticated;
grant execute on function public.finish_restore_validation(uuid, uuid, uuid, boolean, text, text) to service_role;

create or replace function public.read_restore_job_server(
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
  select jsonb_build_object(
    'id', j.id,
    'pair_id', j.pair_id,
    'created_by', j.created_by,
    'mode', j.mode::text,
    'status', j.status::text,
    'manifest_sha256', j.manifest_sha256,
    'manifest', j.manifest,
    'source_pair_export_id', j.source_pair_export_id,
    'safety_backup_id', j.safety_backup_id,
    'rejection_code', j.rejection_code,
    'rejection_detail', j.rejection_detail,
    'created_at', j.created_at,
    'updated_at', j.updated_at,
    'validated_at', j.validated_at,
    'committed_at', j.committed_at,
    'expires_at', j.expires_at,
    'data_entries', coalesce((
      select jsonb_agg(jsonb_build_object(
        'path', d.path,
        'sha256', d.sha256,
        'byte_size', d.byte_size,
        'payload', d.payload
      ) order by d.path)
      from private.restore_staged_data d
      where d.job_id = j.id
    ), '[]'::jsonb),
    'media_entries', coalesce((
      select jsonb_agg(jsonb_build_object(
        'path', m.path,
        'sha256', m.sha256,
        'byte_size', m.byte_size,
        'media_type', m.media_type,
        'storage_path', m.storage_path
      ) order by m.path)
      from private.restore_staged_media m
      where m.job_id = j.id
    ), '[]'::jsonb)
  )
  from private.restore_jobs j
  where j.id = p_job_id
    and j.pair_id = p_pair_id
    and j.created_by = p_actor_user_id;
$$;

revoke all on function public.read_restore_job_server(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.read_restore_job_server(uuid, uuid, uuid) to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'restore-staging',
  'restore-staging',
  false,
  26214400,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update
   set public = false,
       file_size_limit = excluded.file_size_limit,
       allowed_mime_types = excluded.allowed_mime_types;

-- Browser roles receive no Storage policy for restore-staging. Only server-side
-- service-role operations may create/read/delete temporary restore objects.
