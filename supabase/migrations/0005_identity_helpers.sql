create or replace function public.bootstrap_is_available()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select s.consumed_at is null
    from private.app_bootstrap_state s
   where s.singleton = true;
$$;

revoke all on function public.bootstrap_is_available() from public, anon, authenticated;
grant execute on function public.bootstrap_is_available() to service_role;
