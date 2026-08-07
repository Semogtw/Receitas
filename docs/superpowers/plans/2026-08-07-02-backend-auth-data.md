# Backend Auth and Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Supabase schema, exactly-two-user authentication lifecycle, RLS authorization boundary, private media policies and typed client contracts required by the Receitas domain.

**Architecture:** Supabase Postgres is the remote canonical shared copy; Supabase Auth identifies users, while authorization is enforced by membership in exactly one closed `pair`. Privileged account/bootstrap/invite actions run in Edge Functions and never expose administrative secrets to the PWA.

**Tech Stack:** Supabase Postgres/Auth/Storage/Edge Functions, SQL migrations/tests, TypeScript, `@supabase/supabase-js`, React auth UI from plan 01.

## Global Constraints

- Exactly two authorized identities; no public signup.
- Both accounts require verified e-mail before being fully configured.
- Bootstrap secret and `service_role` never enter the frontend.
- RLS is mandatory for shared rows.
- Removing one member does not automatically reopen a seat.
- Password recovery preserves the same identity and pair membership.
- Private media stays in private Storage buckets.
- Recurring mandatory cost remains US$ 0.
- Use @Context7 for current Supabase APIs and Codex Security for auth/RLS review.

---

## File map

```text
supabase/config.toml
supabase/migrations/0001_core_identity.sql
supabase/migrations/0002_recipe_domain.sql
supabase/migrations/0003_planning_domain.sql
supabase/migrations/0004_sync_conflicts.sql
supabase/migrations/0005_storage_policies.sql
supabase/functions/_shared/auth.ts
supabase/functions/_shared/http.ts
supabase/functions/bootstrap/index.ts
supabase/functions/pair-invite/index.ts
supabase/functions/account-admin/index.ts
supabase/tests/identity_rls.sql
supabase/tests/domain_rls.sql
src/lib/supabase/client.ts
src/lib/supabase/types.ts
src/features/auth/AuthProvider.tsx
src/features/auth/LoginScreen.tsx
src/features/auth/VerifyEmailScreen.tsx
src/features/auth/PasswordRecoveryScreen.tsx
src/features/auth/auth-state.ts
src/features/auth/*.test.tsx
```

## Stable data contracts produced by this plan

```ts
export type PairStatus = 'initializing' | 'open_for_second_member' | 'closed'

export interface PairMembership {
  pairId: string
  userId: string
  role: 'member'
  joinedAt: string
  removedAt: string | null
}

export interface AuthSessionState {
  status: 'loading' | 'signed_out' | 'needs_email_verification' | 'ready'
  userId: string | null
  pairId: string | null
}
```

All shared domain rows either carry `pair_id` directly or are reachable through an unambiguous parent that does.

---

### Task 1: Initialize Supabase project files and browser client

**Files:**
- Create: `supabase/config.toml`
- Create: `src/lib/supabase/client.ts`
- Create: `src/lib/supabase/client.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `getSupabaseClient(): SupabaseClient` using only public browser configuration.
- Task 8 later replaces the unparameterized client type with the generated `Database` type after migrations exist.

- [ ] **Step 1: Verify current Supabase JS and CLI APIs with @Context7**

Confirm browser client creation, Auth session events, Edge Function invocation and local CLI migration/test commands before coding.

- [ ] **Step 2: Install/pin the public client dependency**

```bash
pnpm add @supabase/supabase-js
```

Use Supabase CLI through a local dev dependency or documented executable appropriate to the environment; do not require a paid service.

- [ ] **Step 3: Write failing singleton/client configuration test**

Test that `getSupabaseClient` consumes `readPublicEnv()` and never accepts or exposes a service-role key.

- [ ] **Step 4: Implement the browser client without inventing schema types**

```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { readPublicEnv } from '../env'

let client: SupabaseClient | undefined

export function getSupabaseClient(): SupabaseClient {
  if (!client) {
    const env = readPublicEnv()
    client = createClient(env.supabaseUrl, env.supabaseAnonKey)
  }
  return client
}
```

Do not create handwritten domain database types before migrations. Task 8 generates `src/lib/supabase/types.ts` from the real schema and then parameterizes this client.

- [ ] **Step 5: Run tests/typecheck**

```bash
pnpm vitest run src/lib/supabase/client.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml supabase/config.toml src/lib/supabase/client*
git commit -m "chore: initialize Supabase browser client"
```

---

### Task 2: Create pair/member/invite schema and hard invariants

**Files:**
- Create: `supabase/migrations/0001_core_identity.sql`
- Create: `supabase/tests/identity_rls.sql`

**Interfaces:**
- Produces tables: `pairs`, `pair_members`, `pair_invites`, plus helper SQL functions used by later RLS policies.

- [ ] **Step 1: Write failing SQL invariant tests first**

Tests must cover:
- pair cannot exceed two active members;
- one user cannot create arbitrary membership through direct client SQL;
- closed pair rejects additional active member;
- consumed/expired invite cannot be used as active authorization data;
- removing a member does not change `pairs.status` back to open automatically.

Use transaction-wrapped SQL tests so each case rolls back.

- [ ] **Step 2: Run the tests and verify RED**

Run the repository's documented local Supabase test command. If Docker/local Supabase is unavailable, run SQL syntax validation available in the environment, document the blocked full integration test, and continue writing migrations.

- [ ] **Step 3: Implement schema and constraints**

Core shape:

```sql
create type public.pair_status as enum ('initializing', 'open_for_second_member', 'closed');

create table public.pairs (
  id uuid primary key,
  status public.pair_status not null default 'initializing',
  bootstrap_consumed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.pair_members (
  pair_id uuid not null references public.pairs(id),
  user_id uuid not null references auth.users(id),
  joined_at timestamptz not null default now(),
  removed_at timestamptz,
  primary key (pair_id, user_id)
);

create unique index pair_members_active_user_idx
  on public.pair_members(user_id)
  where removed_at is null;
```

Implement active-member-count enforcement in a transaction-safe function/trigger that locks the pair row before allowing a new active membership. Do not rely on frontend counts.

`pair_invites` must store a hash of the token, not the raw token, plus `pair_id`, expiry, creator, consumed timestamp and created timestamp.

- [ ] **Step 4: Add helper authorization function**

```sql
create or replace function public.is_pair_member(target_pair_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.pair_members pm
    where pm.pair_id = target_pair_id
      and pm.user_id = auth.uid()
      and pm.removed_at is null
  );
$$;
```

Restrict execution appropriately and ensure the function cannot be abused to write data.

- [ ] **Step 5: Rerun identity tests**

Expected: invariant tests PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0001_core_identity.sql supabase/tests/identity_rls.sql
git commit -m "feat: enforce closed two-member pair model"
```

---

### Task 3: Create complete domain schema with stable IDs and soft delete

**Files:**
- Create: `supabase/migrations/0002_recipe_domain.sql`
- Create: `supabase/migrations/0003_planning_domain.sql`
- Create: `supabase/migrations/0004_sync_conflicts.sql`
- Create: `supabase/tests/domain_rls.sql`

**Interfaces:**
- Produces all domain tables named in `docs/DATA_MODEL.md` and final spec.

- [ ] **Step 1: Write failing schema/ownership tests**

Cover at minimum:
- non-member cannot select/insert/update/delete another pair's recipe;
- member can access own pair rows;
- rating uniqueness on `(cooking_session_id, user_id)` while active;
- recipe-category many-to-many integrity;
- soft-deleted rows remain identifiable by stable ID;
- shopping list default uniqueness per pair where applicable;
- conflicts preserve base/local/remote payloads.

- [ ] **Step 2: Implement recipe/history schema**

Create:
- `recipes`
- `recipe_ingredients`
- `recipe_steps`
- `categories`
- `recipe_categories`
- `recipe_photos`
- `cooking_sessions`
- `cooking_session_ratings`
- `cooking_session_photos`
- `ingredient_conversion_profiles`
- `imports`

Every syncable table uses UUID primary keys supplied by the client. Use `revision bigint not null default 0`, timestamps and `deleted_at` where soft delete applies.

For recipe ingredients, reserve exact quantity columns that plan 04 consumes: nullable integer numerator/denominator plus nullable free-text quantity, with a check that numerator/denominator appear together and denominator is positive. Steps include nullable `duration_seconds integer`.

For ratings, enforce score 0–10 and half-point increments at the database boundary in addition to application validation.

- [ ] **Step 3: Implement planner/shopping schema**

Create:
- `meal_periods`
- `meal_plan_entries`
- `shopping_lists`
- `shopping_items`

Ensure multiple named lists and at most one active default list per pair using a partial unique index.

- [ ] **Step 4: Implement conflict records**

Create `conflicts` with:

```sql
id uuid primary key,
pair_id uuid not null,
entity_type text not null,
entity_id uuid not null,
base_revision bigint,
base_payload jsonb,
local_payload jsonb not null,
remote_payload jsonb not null,
status text not null check (status in ('open','resolved')),
resolution_payload jsonb,
created_at timestamptz not null default now(),
resolved_at timestamptz
```

Do not store auth tokens or secrets in conflict payloads.

- [ ] **Step 5: Add RLS to every shared table**

Enable RLS on each table and write explicit policies based on `public.is_pair_member(pair_id)` or an equivalent parent-derived check for child rows. No table should be left relying on frontend filtering.

- [ ] **Step 6: Run SQL/RLS tests**

Expected: all membership and cross-pair denial tests PASS.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0002_recipe_domain.sql supabase/migrations/0003_planning_domain.sql supabase/migrations/0004_sync_conflicts.sql supabase/tests/domain_rls.sql
git commit -m "feat: add recipe planning and conflict schema"
```

---

### Task 4: Implement one-time bootstrap Edge Function

**Files:**
- Create: `supabase/functions/_shared/http.ts`
- Create: `supabase/functions/_shared/auth.ts`
- Create: `supabase/functions/bootstrap/index.ts`
- Create: `supabase/functions/bootstrap/index.test.ts`

**Interfaces:**
- Produces `POST /functions/v1/bootstrap` accepting `{ email, password, bootstrapSecret }` and returning a sanitized success/error body.

- [ ] **Step 1: Write failing function tests**

Cover:
- wrong bootstrap secret rejected;
- already-consumed bootstrap rejected;
- successful bootstrap creates exactly one user + pair + membership atomically from the product perspective;
- returned payload never includes service-role/bootstrap secret;
- created pair transitions to `open_for_second_member` only after first identity is correctly established.

- [ ] **Step 2: Verify RED**

Run Deno/Supabase function tests supported by the current tooling.

- [ ] **Step 3: Implement server-only bootstrap logic**

Read `BOOTSTRAP_SECRET` and `SUPABASE_SERVICE_ROLE_KEY` from server function environment only. Compare the supplied bootstrap secret in constant-time where practical. Query/lock bootstrap state before creating membership.

Pseudocode shape:

```ts
if (!validBootstrapSecret(body.bootstrapSecret)) return forbidden()
if (await bootstrapAlreadyConsumed()) return conflict('Bootstrap already closed')
const user = await createAuthUser(body.email, body.password)
await createFirstPairMembership(user.id)
return ok({ requiresEmailVerification: true })
```

If Auth user creation cannot participate in the same DB transaction, explicitly implement compensation/repair semantics and test that a partial failure cannot leave an authorized orphan membership. Document the exact provider limitation in `docs/AUTH_SECURITY.md` if encountered.

- [ ] **Step 4: Add rate-limit hook points and generic public errors**

Do not disclose sensitive internal state beyond what the legitimate bootstrap operator needs. Never log raw password or bootstrap secret.

- [ ] **Step 5: Run function + SQL invariant tests**

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/_shared supabase/functions/bootstrap docs/AUTH_SECURITY.md
git commit -m "feat: add protected one-time bootstrap"
```

---

### Task 5: Implement second-member invite creation/acceptance

**Files:**
- Create: `supabase/functions/pair-invite/index.ts`
- Create: `supabase/functions/pair-invite/index.test.ts`
- Create: `src/features/auth/InviteAcceptScreen.tsx`
- Create: `src/features/auth/InviteAcceptScreen.test.tsx`

**Interfaces:**
- Produces actions `create` and `accept` with one-time expiring token semantics.

- [ ] **Step 1: Write failing backend tests**

Cover:
- only current active member of the one-member pair can create invite;
- raw invite token is returned once and only its hash is stored;
- expired/consumed token rejected;
- two concurrent accepts cannot produce a third active member;
- accepting the valid second member closes the pair and invalidates other pending invites.

- [ ] **Step 2: Implement token creation and hashing**

Generate cryptographically random bytes using the platform crypto API. Persist SHA-256 or stronger non-reversible digest with expiry. Do not place personal data in the token.

- [ ] **Step 3: Implement acceptance flow**

Acceptance creates/links the second Auth identity through privileged server logic, verifies pair capacity under row lock, consumes invite and closes the pair. Ensure error response is safe if token is invalid.

- [ ] **Step 4: Implement invite acceptance UI**

UI collects only required credentials and communicates verification requirement. It must not expose a general signup route.

- [ ] **Step 5: Run backend/UI tests and concurrent acceptance test**

Expected: PASS with exactly two active members maximum.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/pair-invite src/features/auth/InviteAcceptScreen*
git commit -m "feat: add one-time second-member invite"
```

---

### Task 6: Implement auth state, login, verification and password recovery UI

**Files:**
- Create: `src/features/auth/auth-state.ts`
- Create: `src/features/auth/AuthProvider.tsx`
- Create: `src/features/auth/LoginScreen.tsx`
- Create: `src/features/auth/VerifyEmailScreen.tsx`
- Create: `src/features/auth/PasswordRecoveryScreen.tsx`
- Create: `src/features/auth/*.test.tsx`
- Modify: `src/app/App.tsx`

**Interfaces:**
- Produces: `useAuth(): AuthSessionState & auth actions`.

- [ ] **Step 1: Write reducer/state-machine tests**

Test transitions:

```text
loading -> signed_out
loading -> needs_email_verification
loading -> ready
signed_out -> loading (login attempt)
ready -> signed_out (logout)
```

A user with unverified e-mail must never enter `ready`.

- [ ] **Step 2: Implement auth provider using current Supabase APIs**

Use @Context7 to confirm `getSession`, `onAuthStateChange`, password reset and resend verification methods. The provider resolves membership only after identifying the Auth user.

- [ ] **Step 3: Implement screens**

Login: e-mail + password only.  
Verification: explain that access requires verified e-mail and provide resend action with non-spammy cooldown UI.  
Recovery: request reset without creating users and use generic response copy where practical.

- [ ] **Step 4: Protect the app shell**

`App` renders:
- loading state while resolving session;
- login when signed out;
- verification surface for unverified account;
- private `AppShell` only when `ready`.

- [ ] **Step 5: Test logout local-data handoff contract**

For now emit a `beforeLogout` hook/event that plan 03 will implement to protect unsynced local data. Do not clear local databases directly in this plan.

- [ ] **Step 6: Run unit/rendered auth QA**

Use @Build Web Apps for login/verification/recovery responsive states and console health.

- [ ] **Step 7: Commit**

```bash
git add src/features/auth src/app/App.tsx
git commit -m "feat: add closed authentication UI state machine"
```

---

### Task 7: Add private Storage buckets and policies

**Files:**
- Create: `supabase/migrations/0005_storage_policies.sql`
- Extend: `supabase/tests/domain_rls.sql`

**Interfaces:**
- Produces private logical buckets for recipe/preparation media with object paths scoped by pair.

- [ ] **Step 1: Write failing Storage authorization tests**

Cover member upload/read/delete inside own pair path and denial for another pair path.

- [ ] **Step 2: Create private bucket metadata and policies**

Use object keys shaped like:

```text
pairs/<pair_id>/recipes/<recipe_id>/<photo_id>/original.<ext>
pairs/<pair_id>/cooking/<session_id>/<photo_id>/original.<ext>
```

Do not create public buckets or permanent public URLs.

- [ ] **Step 3: Add MIME/size guard strategy**

Document and enforce supported image MIME types and practical size limits at upload boundary where provider policy allows; client compression is convenience, not the sole validation.

- [ ] **Step 4: Run Storage/RLS tests**

Expected: cross-pair access denied.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0005_storage_policies.sql supabase/tests/domain_rls.sql
git commit -m "feat: protect private recipe media storage"
```

---

### Task 8: Generate typed database contracts and perform security review

**Files:**
- Create: `src/lib/supabase/types.ts` from the real migration schema
- Modify: `src/lib/supabase/client.ts`
- Modify: `docs/AUTH_SECURITY.md` only for verified implementation details
- Modify: `docs/DATA_MODEL.md` only if implementation exposed a necessary exact constraint

**Interfaces:**
- Produces stable generated `Database` types consumed by plans 03–06 and upgrades `getSupabaseClient()` to `SupabaseClient<Database>`.

- [ ] **Step 1: Generate Supabase TypeScript types from the implemented schema**

Use the current CLI command confirmed via @Context7. Commit generated types; do not hand-maintain a second incompatible schema type model.

- [ ] **Step 2: Parameterize the browser client with generated types**

```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './types'

let client: SupabaseClient<Database> | undefined
```

Keep the same singleton/environment behavior from Task 1.

- [ ] **Step 3: Run full backend gates**

Run all available:

```bash
pnpm typecheck
pnpm test:run
# supabase local SQL tests
# edge-function tests
```

Expected: PASS or environmental blockers explicitly documented.

- [ ] **Step 4: Run Codex Security on auth/RLS/functions scope**

Scope at minimum:
- `supabase/migrations/`
- `supabase/functions/bootstrap/`
- `supabase/functions/pair-invite/`
- `src/features/auth/`

Fix all validated high/critical findings before completing the plan. Medium findings that affect the approved security invariants must also be fixed.

- [ ] **Step 5: Verify frontend bundle contains no privileged secret**

Build and search `dist/` for bootstrap/service-role variable names and any test secrets. Expected: none.

- [ ] **Step 6: Commit generated types/security fixes**

```bash
git add src/lib/supabase supabase src/features/auth docs/AUTH_SECURITY.md docs/DATA_MODEL.md
git commit -m "test: harden auth RLS and backend contracts"
```

- [ ] **Step 7: Mark plan complete**

Do not start PowerSync integration until schema, auth state and RLS contracts are stable enough for plan 03 to consume.
