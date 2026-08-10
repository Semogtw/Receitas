begin;

do $$
declare
  signature text;
  browser_role text;
  service_rpc text;
  bucket_public boolean;
  unchecked_service_execute boolean;
begin
  if has_schema_privilege('authenticated', 'private', 'USAGE')
     or has_schema_privilege('anon', 'private', 'USAGE') then
    raise exception 'browser roles must not have USAGE on private schema';
  end if;

  foreach signature in array array[
    'private.restore_insert_client_row(text,uuid,uuid,jsonb)',
    'private.restore_merge_row(uuid,uuid,text,jsonb)',
    'private.restore_merge_file(uuid,uuid,uuid,text,text)',
    'private.restore_safety_matches_current(uuid,uuid)',
    'private.restore_replace_row(uuid,uuid,text,jsonb)',
    'private.restore_replace_file(uuid,uuid,uuid,text,text)',
    'private.restore_soft_delete_current_state(uuid)',
    'private.restore_close_open_conflicts(uuid,uuid,uuid)',
    'private.restore_cleanup_eligible(private.restore_job_status,timestamp with time zone,timestamp with time zone)'
  ]
  loop
    if to_regprocedure(signature) is null then
      raise exception 'required private restore helper is missing: %', signature;
    end if;
    foreach browser_role in array array['anon', 'authenticated']
    loop
      if has_function_privilege(browser_role, signature, 'EXECUTE') then
        raise exception '% must not execute private restore helper %', browser_role, signature;
      end if;
    end loop;
  end loop;

  foreach service_rpc in array array[
    'public.create_restore_job(uuid,uuid,text,text,jsonb,text)',
    'public.stage_restore_data_batch(uuid,uuid,uuid,text,integer,text,bigint,jsonb,integer)',
    'public.stage_restore_media_entry(uuid,uuid,uuid,text,text,bigint,text,text)',
    'public.begin_restore_validation(uuid,uuid,uuid)',
    'public.finish_restore_validation(uuid,uuid,uuid,boolean,text,text)',
    'public.read_restore_job_server(uuid,uuid,uuid)',
    'public.mark_restore_media_promoted(uuid,uuid,uuid,text,text)',
    'public.read_restore_media_promotion_server(uuid,uuid,uuid)',
    'public.commit_restore_merge_checked(uuid,uuid,uuid)',
    'public.attach_restore_safety_backup(uuid,uuid,uuid,uuid)',
    'public.commit_restore_replace_all_checked(uuid,uuid,uuid)',
    'public.read_restore_cleanup_candidates(integer)',
    'public.delete_restore_cleanup_job(uuid)',
    'public.restore_media_path_is_referenced(text)'
  ]
  loop
    if to_regprocedure(service_rpc) is null then
      raise exception 'required restore RPC is missing: %', service_rpc;
    end if;

    foreach browser_role in array array['anon', 'authenticated']
    loop
      if has_function_privilege(browser_role, service_rpc, 'EXECUTE') then
        raise exception '% must not execute restore RPC % directly', browser_role, service_rpc;
      end if;
    end loop;

    if not has_function_privilege('service_role', service_rpc, 'EXECUTE') then
      raise exception 'service_role must execute checked restore RPC %', service_rpc;
    end if;
  end loop;

  if to_regprocedure('public.commit_restore_merge(uuid,uuid,uuid)') is null then
    raise exception 'unchecked commit_restore_merge helper is missing';
  end if;
  select has_function_privilege(
    'service_role',
    'public.commit_restore_merge(uuid,uuid,uuid)',
    'EXECUTE'
  ) into unchecked_service_execute;
  if unchecked_service_execute then
    raise exception 'service_role must not bypass media checks via commit_restore_merge';
  end if;

  if has_table_privilege('authenticated', 'private.restore_jobs', 'SELECT')
     or has_table_privilege('authenticated', 'private.restore_staged_data', 'SELECT')
     or has_table_privilege('authenticated', 'private.restore_staged_media', 'SELECT') then
    raise exception 'authenticated must not read private restore tables directly';
  end if;

  select b.public into bucket_public
    from storage.buckets b
   where b.id = 'restore-staging';
  if not found then
    raise exception 'restore-staging bucket is missing';
  end if;
  if bucket_public then
    raise exception 'restore-staging bucket must remain private';
  end if;
end;
$$;

rollback;
