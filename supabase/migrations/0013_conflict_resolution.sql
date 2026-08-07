create or replace function public.resolve_conflict(
  p_conflict_id uuid,
  p_strategy text,
  p_resolution_payload jsonb default null
)
returns table (
  result_status text,
  resulting_revision bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  conflict_row public.conflicts%rowtype;
  current_remote jsonb;
  current_revision bigint;
  stored_remote_revision bigint;
  desired jsonb;
  resolution_operation text;
  mutation_result record;
begin
  if current_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  if p_strategy not in ('choose_local', 'choose_remote', 'merge') then
    raise exception 'unsupported conflict resolution strategy' using errcode = '22023';
  end if;

  select * into conflict_row
    from public.conflicts c
   where c.id = p_conflict_id
   for update;

  if not found then
    raise exception 'conflict not found' using errcode = 'P0001';
  end if;

  if not public.is_pair_member(conflict_row.pair_id) then
    raise exception 'active pair membership required' using errcode = '42501';
  end if;

  execute format(
    'select t.revision, private.to_client_mutation_payload($3, to_jsonb(t)) '
    || 'from public.%I t where t.id = $1 and t.pair_id = $2 for update',
    conflict_row.entity_type
  ) into current_revision, current_remote
    using conflict_row.entity_id, conflict_row.pair_id, conflict_row.entity_type;

  if conflict_row.status = 'resolved' then
    return query select 'resolved'::text, current_revision;
    return;
  end if;

  if current_remote is null then
    current_remote := jsonb_build_object(
      '_state', 'missing',
      'id', conflict_row.entity_id::text,
      'pair_id', conflict_row.pair_id::text
    );
    current_revision := null;
  end if;

  begin
    stored_remote_revision := (conflict_row.remote_payload ->> 'revision')::bigint;
  exception when others then
    stored_remote_revision := null;
  end;

  if current_remote is distinct from conflict_row.remote_payload then
    update public.conflicts
       set remote_payload = current_remote
     where id = conflict_row.id;

    return query select 'refreshed'::text, current_revision;
    return;
  end if;

  if p_strategy = 'choose_remote' then
    update public.conflicts
       set status = 'resolved',
           resolution_strategy = p_strategy,
           resolution_payload = current_remote,
           resolved_by = current_user_id,
           resolved_at = now()
     where id = conflict_row.id;

    return query select 'resolved'::text, current_revision;
    return;
  end if;

  if current_revision is null or current_remote ->> '_state' = 'missing' then
    raise exception 'local or merged resolution requires an existing remote row' using errcode = 'P0001';
  end if;

  if conflict_row.base_payload is null then
    raise exception 'create collision can only keep the existing remote row' using errcode = 'P0001';
  end if;

  if p_strategy = 'choose_local' then
    desired := conflict_row.local_payload;
  else
    if p_resolution_payload is null or jsonb_typeof(p_resolution_payload) <> 'object' then
      raise exception 'merge resolution payload must be an object' using errcode = '22023';
    end if;
    desired := p_resolution_payload;
  end if;

  desired := desired
    || jsonb_build_object(
      'pair_id', conflict_row.pair_id::text,
      'revision', current_revision,
      'created_at', current_remote -> 'created_at',
      'updated_at', current_remote -> 'updated_at'
    );

  resolution_operation := case
    when coalesce(desired -> 'deleted_at', 'null'::jsonb) <> 'null'::jsonb then 'soft_delete'
    else 'update'
  end;

  select * into mutation_result
    from public.apply_client_mutation(
      gen_random_uuid(),
      conflict_row.pair_id,
      current_user_id,
      conflict_row.entity_type,
      conflict_row.entity_id,
      resolution_operation,
      current_revision,
      current_remote,
      desired
    );

  if mutation_result.result_status is distinct from 'applied' then
    raise exception 'conflict resolution could not be applied safely' using errcode = 'P0001';
  end if;

  update public.conflicts
     set status = 'resolved',
         resolution_strategy = p_strategy,
         resolution_payload = desired,
         resolved_by = current_user_id,
         resolved_at = now()
   where id = conflict_row.id;

  return query select 'resolved'::text, mutation_result.resulting_revision::bigint;
end;
$$;

revoke all on function public.resolve_conflict(uuid, text, jsonb) from public, anon;
grant execute on function public.resolve_conflict(uuid, text, jsonb) to authenticated;
