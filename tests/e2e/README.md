# E2E acceptance environment

The authenticated acceptance specs are intentionally isolated from production.

Required for authenticated specs:

- `E2E_EMAIL`: dedicated staging pair identity;
- `E2E_PASSWORD`: password for that staging-only identity;
- the staging pair must contain representative structured data;
- the staging pair must contain at least one uploaded photo for the corrupt-final-media case.

URL import fixtures:

- `E2E_IMPORT_JSONLD_URL` and `E2E_IMPORT_JSONLD_TITLE`;
- `E2E_IMPORT_HTML_URL` and `E2E_IMPORT_HTML_TITLE`;
- `E2E_IMPORT_OVERSIZED_URL`.

The fixture hosts must be disposable public test endpoints and must not contain user/private recipe data. The loopback SSRF case is intrinsic to the test and needs no external fixture.

Destructive restore acceptance additionally requires:

- `E2E_DESTRUCTIVE_RESTORE=1`.

That opt-in is required because the spec intentionally performs `replace_all` twice on the dedicated staging pair to prove safety-backup round-tripping. Never point these variables at a production pair or personal account.

These specs are **written acceptance gates**, not evidence that the gates passed. They require a deployed staging Supabase/Storage/PowerSync environment with the current migrations and Edge Functions.
