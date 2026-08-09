begin;

do $$
declare
  capacity_def text;
  recovery_def text;
  status_def text;
begin
  if to_regprocedure('public.account_admin_remove_other(uuid,uuid,uuid,uuid)') is null then
    raise exception 'account_admin_remove_other is missing';
  end if;
  if to_regprocedure('public.account_admin_begin_replacement(uuid,uuid,uuid,uuid,uuid)') is null then
    raise exception 'account_admin_begin_replacement is missing';
  end if;
  if to_regprocedure('public.account_admin_complete_replacement(uuid)') is null then
    raise exception 'account_admin_complete_replacement is missing';
  end if;
  if to_regprocedure('private.account_admin_recoverable_target(uuid,uuid)') is null then
    raise exception 'account_admin_recoverable_target is missing';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.account_admin_remove_other(uuid,uuid,uuid,uuid)',
    'EXECUTE'
  ) then
    raise exception 'authenticated must not execute account_admin_remove_other directly';
  end if;
  if has_function_privilege(
    'authenticated',
    'public.account_admin_begin_replacement(uuid,uuid,uuid,uuid,uuid)',
    'EXECUTE'
  ) then
    raise exception 'authenticated must not execute account_admin_begin_replacement directly';
  end if;
  if not has_function_privilege(
    'service_role',
    'public.account_admin_begin_replacement(uuid,uuid,uuid,uuid,uuid)',
    'EXECUTE'
  ) then
    raise exception 'service_role must execute account_admin_begin_replacement';
  end if;

  select pg_get_functiondef('private.enforce_pair_member_capacity()'::regprocedure)
    into capacity_def;
  if position('private.account_admin_actions' in capacity_def) = 0
     or position('pair is closed' in capacity_def) = 0
     or position('pair already has two members' in capacity_def) = 0 then
    raise exception 'closed-pair capacity trigger lost the private replacement gate';
  end if;

  select pg_get_functiondef('private.account_admin_recoverable_target(uuid,uuid)'::regprocedure)
    into recovery_def;
  if position('remove_other' in recovery_def) = 0
     or position('replace_other' in recovery_def) = 0
     or position('cancelled' in recovery_def) = 0
     or position('active_other.removed_at is null' in lower(recovery_def)) = 0 then
    raise exception 'recoverable-target helper no longer proves a private administrative vacancy';
  end if;

  select pg_get_functiondef('public.read_account_admin_status_server(uuid,uuid)'::regprocedure)
    into status_def;
  if position('recoverable_target_user_id' in status_def) = 0
     or position('private.account_admin_recoverable_target' in status_def) = 0 then
    raise exception 'service-only account-admin status lost recoverability metadata';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.read_account_admin_status_server(uuid,uuid)',
    'EXECUTE'
  ) then
    raise exception 'authenticated must not read private recovery target status directly';
  end if;
end;
$$;

rollback;
