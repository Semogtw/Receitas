-- Defense in depth for every private helper. The private schema was already
-- closed in 0001, but PostgreSQL grants EXECUTE on newly created functions to
-- PUBLIC by default. Keep both barriers explicit so a future schema-USAGE change
-- cannot accidentally expose SECURITY DEFINER helpers.
revoke all on schema private from public, anon, authenticated;

-- Make future private functions created by the migration owner non-executable
-- by PUBLIC unless a later migration deliberately grants a narrower role.
alter default privileges in schema private
  revoke execute on functions from public;

-- Remove the default PUBLIC/direct browser-role EXECUTE privilege from every
-- private function that already exists at this point in the migration chain.
do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as signature
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'private'
  loop
    execute format(
      'revoke all on function %s from public, anon, authenticated',
      fn.signature
    );
  end loop;
end;
$$;

-- Public RPCs remain the only intentional server entry points and continue to
-- receive their explicit service_role grants in the migrations that define them.
