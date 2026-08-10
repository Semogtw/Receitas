-- Defense in depth for account-administration helpers. The private schema was
-- already closed in 0001, but function EXECUTE is granted to PUBLIC by default
-- in PostgreSQL. Keep both barriers explicit so a future schema-USAGE change
-- cannot accidentally expose SECURITY DEFINER helpers.
revoke all on schema private from public, anon, authenticated;

revoke all on function private.touch_account_admin_updated_at() from public, anon, authenticated;
revoke all on function private.assert_account_admin_actor(uuid, uuid) from public, anon, authenticated;
revoke all on function private.assert_account_admin_safety(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function private.account_admin_recoverable_target(uuid, uuid) from public, anon, authenticated;
revoke all on function private.enforce_pair_member_capacity() from public, anon, authenticated;

-- Public RPCs remain the only server entry points and continue to be executable
-- exclusively by service_role as established in 0026-0029.
