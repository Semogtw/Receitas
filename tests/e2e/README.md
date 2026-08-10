# E2E acceptance environment

The authenticated acceptance specs are intentionally isolated from production.

## Authenticated staging specs

Required:

- `E2E_EMAIL`: dedicated staging pair identity;
- `E2E_PASSWORD`: password for that staging-only identity;
- the staging pair must contain representative structured data;
- the staging pair must contain at least one uploaded photo for the corrupt-final-media case.

Never point these variables at a production pair or personal account.

### Offline recovery

`offline-recovery.spec.ts` creates its own uniquely named recipe fixture. The flow:

1. authenticates while online;
2. switches the first browser context offline;
3. creates the recipe through the real UI/local PowerSync database;
4. reloads the full document while offline and confirms the recipe is still present;
5. reconnects;
6. opens a fresh browser context with a distinct local database;
7. waits for the same recipe to arrive through the remote sync path;
8. moves only that generated fixture to the staging trash.

No destructive-restore opt-in is required for this fixture-local cleanup. If cleanup fails, the spec fails visibly instead of hiding staging residue.

## URL import fixtures

Required for URL-import acceptance:

- `E2E_IMPORT_JSONLD_URL` and `E2E_IMPORT_JSONLD_TITLE`;
- `E2E_IMPORT_HTML_URL` and `E2E_IMPORT_HTML_TITLE`;
- `E2E_IMPORT_OVERSIZED_URL`.

The fixture hosts must be disposable public test endpoints and must not contain user/private recipe data. The loopback SSRF case is intrinsic to the test and needs no external fixture.

## Destructive restore acceptance

Additionally requires:

- `E2E_DESTRUCTIVE_RESTORE=1`.

That opt-in is required because the spec intentionally performs `replace_all` twice on the dedicated staging pair to prove safety-backup round-tripping.

## Deployed-origin security acceptance

`deployed-security.spec.ts` is separate from local Vite preview because `_headers` behavior belongs to Cloudflare Pages, not Vite.

Required:

- `E2E_DEPLOYED_URL`: exact HTTPS origin of the deployed Receitas preview/staging site, for example `https://example.pages.dev` with **no path/query/credentials**.

The spec checks the real HTTP responses for:

- CSP and security/privacy headers;
- absence of broad `https://*`/`wss://*` CSP sources;
- Cloudflare's 2,000-character per-header value budget for the generated CSP;
- SPA deep-link fallback for private and replacement callback routes;
- `robots.txt` and HTML `noindex,nofollow` metadata.

Run it with:

```text
pnpm test:e2e:deployed
```

Without `E2E_DEPLOYED_URL`, those tests skip rather than pretending local preview proves host-level headers.

## Commands

```text
pnpm test:e2e:smoke
pnpm test:e2e:release
pnpm test:e2e:deployed
```

The first two use the normal Playwright web server/preview configuration. The deployed-origin spec uses an absolute HTTPS URL supplied by `E2E_DEPLOYED_URL`.

These specs are **written acceptance gates**, not evidence that the staging/deployed gates passed. They require the actual Receitas Supabase/Storage/PowerSync/Cloudflare environment with current migrations and Edge Functions before their results can be marked green.
