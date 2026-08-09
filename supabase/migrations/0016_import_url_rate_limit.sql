create table private.import_url_rate_limits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now()
);

revoke all on private.import_url_rate_limits from public, anon, authenticated;

create or replace function public.consume_import_url_rate_limit(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  allowed boolean;
begin
  if p_user_id is null then
    return false;
  end if;

  insert into private.import_url_rate_limits as limiter (
    user_id,
    window_started_at,
    request_count,
    updated_at
  ) values (
    p_user_id,
    now(),
    1,
    now()
  )
  on conflict (user_id) do update
     set request_count = case
           when limiter.window_started_at <= now() - interval '1 minute' then 1
           else limiter.request_count + 1
         end,
         window_started_at = case
           when limiter.window_started_at <= now() - interval '1 minute' then now()
           else limiter.window_started_at
         end,
         updated_at = now()
  returning request_count <= 8 into allowed;

  return coalesce(allowed, false);
end;
$$;

revoke all on function public.consume_import_url_rate_limit(uuid) from public, anon, authenticated;
grant execute on function public.consume_import_url_rate_limit(uuid) to service_role;

comment on function public.consume_import_url_rate_limit(uuid) is
  'Server-only fixed-window limiter for import-url: at most 8 attempts per user per minute.';
