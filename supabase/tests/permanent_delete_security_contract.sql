begin;

do $$
declare
  browser_role text;
  server_rpc text;
begin
  if to_regclass('private.media_delete_queue') is null then
    raise exception 'private.media_delete_queue is missing';
  end if;

  foreach browser_role in array array['anon', 'authenticated']
  loop
    if has_table_privilege(browser_role, 'private.media_delete_queue', 'SELECT')
       or has_table_privilege(browser_role, 'private.media_delete_queue', 'INSERT')
       or has_table_privilege(browser_role, 'private.media_delete_queue', 'UPDATE')
       or has_table_privilege(browser_role, 'private.media_delete_queue', 'DELETE') then
      raise exception '% must not access the media delete queue directly', browser_role;
    end if;

    if has_function_privilege(
      browser_role,
      'public.permanently_delete_entity(text,uuid,uuid)',
      'EXECUTE'
    ) then
      raise exception '% must not execute the retired browser hard-delete RPC', browser_role;
    end if;
  end loop;

  foreach server_rpc in array array[
    'public.permanently_delete_entity_server(uuid,text,uuid,uuid)',
    'public.read_media_delete_queue_server(uuid,integer)',
    'public.mark_media_delete_complete_server(uuid,text)',
    'public.mark_media_delete_failed_server(uuid,text,text)'
  ]
  loop
    if to_regprocedure(server_rpc) is null then
      raise exception 'required permanent-delete server RPC is missing: %', server_rpc;
    end if;

    foreach browser_role in array array['anon', 'authenticated']
    loop
      if has_function_privilege(browser_role, server_rpc, 'EXECUTE') then
        raise exception '% must not execute permanent-delete server RPC %', browser_role, server_rpc;
      end if;
    end loop;

    if not has_function_privilege('service_role', server_rpc, 'EXECUTE') then
      raise exception 'service_role must execute permanent-delete server RPC %', server_rpc;
    end if;
  end loop;
end;
$$;

rollback;
