# Local-First Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Receitas domain local-first: all normal UI reads/writes use a persistent PowerSync database, offline mutations survive reloads, remote synchronization is retryable/idempotent, and incompatible concurrent edits preserve both versions as explicit conflicts.

**Architecture:** PowerSync owns synced local tables and its upload queue; application repositories wrap every editable write in a local transaction that also records a local-only `mutation_outbox` envelope containing base revision/base payload. `uploadData` sends those envelopes to an explicit allowlisted `sync-mutation` Edge Function, which performs revision checks, safe merge rules and conflict creation before acknowledging the PowerSync CRUD transaction.

**Tech Stack:** `@powersync/web`, Supabase Auth/Postgres/Edge Functions, TypeScript, Vitest, Playwright.

## Global Constraints

- UI reads primarily from local data.
- Valid local edits appear immediately without waiting for network.
- Client-created syncable entities receive stable UUIDs before remote write.
- No silent last-write-wins for incompatible edits.
- Safe auto-merge only when deterministic and semantically independent.
- Delete-vs-edit creates a conflict.
- Failed network upload retries; it does not discard the local mutation.
- Logout never destroys the only copy of pending mutations or unsynced media.
- Recurring mandatory cost remains US$ 0.
- Use @Context7 for the current PowerSync Web API before implementation.

---

## File map

```text
src/data/schema.ts                         # PowerSync schema, including local-only tables
src/data/database.ts                       # browser database singleton/lifecycle
src/data/PowerSyncProvider.tsx             # React context
src/data/connector/PowerSyncConnector.ts   # credentials + uploadData
src/data/mutations/types.ts                # MutationEnvelope contract
src/data/mutations/writeLocalMutation.ts   # atomic row + outbox writer
src/data/mutations/outbox.ts               # lookup/cleanup/retry metadata
src/data/sync/sync-state.ts                # normalized status model
src/data/sync/useSyncState.ts              # UI subscription hook
src/data/repositories/*.ts                 # domain repositories introduced incrementally
src/features/conflicts/ConflictCenter.tsx
src/features/conflicts/ConflictDetail.tsx
src/features/conflicts/conflict-resolution.ts
supabase/functions/sync-mutation/index.ts
supabase/functions/sync-mutation/entity-policies.ts
supabase/functions/sync-mutation/apply-mutation.ts
supabase/functions/sync-mutation/index.test.ts
supabase/migrations/0006_sync_mutations.sql
supabase/tests/sync_mutations.sql
tests/e2e/offline-sync.spec.ts
tests/e2e/conflicts.spec.ts
```

## Stable contracts

```ts
export type MutationOperation = 'insert' | 'update' | 'soft_delete' | 'restore'

export interface MutationEnvelope<T = Record<string, unknown>> {
  mutationId: string
  pairId: string
  actorUserId: string
  entityType: string
  entityId: string
  operation: MutationOperation
  baseRevision: number | null
  basePayload: T | null
  localPayload: T
  createdAt: string
}

export type MutationApplyResult =
  | { status: 'applied'; revision: number }
  | { status: 'already_applied'; revision: number }
  | { status: 'merged'; revision: number }
  | { status: 'conflict'; conflictId: string }

export interface LocalMutationWrite<T> {
  pairId: string
  actorUserId: string
  entityType: string
  entityId: string
  operation: MutationOperation
  baseRevision: number | null
  basePayload: T | null
  localPayload: T
  sql: string
  parameters: unknown[]
}
```

Payloads in the mutation envelope are persistence-safe JSON values. Domain-only types that use `bigint`, `Blob`, `File`, DOM objects or other non-JSON values must be mapped to database/transport representations before entering `localPayload`/`basePayload`.

---

### Task 1: Define the PowerSync schema and persistent browser database

**Files:**
- Create: `src/data/schema.ts`
- Create: `src/data/database.ts`
- Create: `src/data/database.test.ts`
- Create: `src/data/PowerSyncProvider.tsx`
- Modify: `package.json`

**Interfaces:**
- Produces `AppSchema`, `AppDatabase`, `getDatabase()` and React `useDatabase()`.

- [ ] **Step 1: Consult @Context7 for current PowerSync Web schema/database initialization**

Confirm current package names, browser persistence adapter, `Schema`/`Table`, local-only table options and connect lifecycle.

- [ ] **Step 2: Install/pin the Web SDK**

```bash
pnpm add @powersync/web
```

Add any official browser persistence companion required by the current SDK. Do not invent a custom IndexedDB database when PowerSync provides the supported persistence path.

- [ ] **Step 3: Write a failing local persistence/schema test**

Test that `recipes`, `recipe_ingredients`, `conflicts` and local-only `mutation_outbox` exist and that writing an outbox row does not itself become a synced CRUD entry.

- [ ] **Step 4: Define synced and local-only tables**

Mirror remote shared columns needed by the UI, including `revision`, timestamps and `deleted_at`. Define local-only tables at minimum:

```ts
const mutation_outbox = new Table({
  pair_id: column.text,
  actor_user_id: column.text,
  entity_type: column.text,
  entity_id: column.text,
  operation: column.text,
  base_revision: column.integer,
  base_payload_json: column.text,
  local_payload_json: column.text,
  created_at: column.text,
  attempt_count: column.integer,
  last_error_code: column.text,
}, { localOnly: true })
```

Also define a local-only `device_preferences` table for per-device preferences such as theme/offline-media selections; do not sync those accidentally.

- [ ] **Step 5: Implement database singleton/provider**

Initialization happens once per browser context and must not reconnect on every render. The provider exposes the database instance but feature components should use repositories/hooks rather than ad-hoc SQL.

- [ ] **Step 6: Run unit/type gates**

```bash
pnpm vitest run src/data/database.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-lock.yaml src/data/schema.ts src/data/database* src/data/PowerSyncProvider.tsx
git commit -m "feat: add persistent PowerSync local database"
```

---

### Task 2: Implement atomic local writes with mutation envelopes

**Files:**
- Create: `src/data/mutations/types.ts`
- Create: `src/data/mutations/writeLocalMutation.ts`
- Create: `src/data/mutations/writeLocalMutation.test.ts`
- Create: `src/data/mutations/outbox.ts`

**Interfaces:**
- Produces `writeLocalMutation<T>(db, input): Promise<MutationEnvelope<T>>`.

- [ ] **Step 1: Write failing tests for atomicity**

Cover:
- entity row and outbox row are written in one local transaction;
- stable mutation UUID is generated once;
- `basePayload` and `baseRevision` reflect the version the user edited;
- pair/actor identity comes from explicit trusted repository inputs, not from guessed payload fields;
- failed row SQL rolls back the outbox insert;
- retry metadata does not alter the semantic mutation payload;
- non-JSON domain values are rejected/mapped before envelope persistence.

- [ ] **Step 2: Verify RED**

Run `pnpm vitest run src/data/mutations/writeLocalMutation.test.ts`.

- [ ] **Step 3: Implement the helper**

Core behavior:

```ts
export async function writeLocalMutation<T>(db: AppDatabase, input: LocalMutationWrite<T>) {
  const mutationId = crypto.randomUUID()
  const envelope: MutationEnvelope<T> = {
    mutationId,
    pairId: input.pairId,
    actorUserId: input.actorUserId,
    entityType: input.entityType,
    entityId: input.entityId,
    operation: input.operation,
    baseRevision: input.baseRevision,
    basePayload: input.basePayload,
    localPayload: input.localPayload,
    createdAt: new Date().toISOString(),
  }

  const basePayloadJson = input.basePayload === null ? null : JSON.stringify(input.basePayload)
  const localPayloadJson = JSON.stringify(input.localPayload)

  await db.writeTransaction(async (tx) => {
    await tx.execute(input.sql, input.parameters)
    await tx.execute(
      `insert into mutation_outbox (
        id, pair_id, actor_user_id, entity_type, entity_id, operation,
        base_revision, base_payload_json, local_payload_json,
        created_at, attempt_count
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      [
        mutationId,
        input.pairId,
        input.actorUserId,
        input.entityType,
        input.entityId,
        input.operation,
        input.baseRevision,
        basePayloadJson,
        localPayloadJson,
        envelope.createdAt,
      ],
    )
  })

  return envelope
}
```

If actual PowerSync transaction method names differ, use the current official API confirmed through @Context7 while preserving this contract.

- [ ] **Step 4: Add outbox lookup/cleanup APIs**

Implement exact functions:

```ts
getPendingMutationForEntity(db, entityType, entityId): Promise<MutationEnvelope | null>
markMutationAttempt(db, mutationId, errorCode): Promise<void>
removeMutationEnvelope(db, mutationId): Promise<void>
countPendingMutations(db): Promise<number>
```

- [ ] **Step 5: Run tests**

Expected: PASS including rollback and JSON-safety cases.

- [ ] **Step 6: Commit**

```bash
git add src/data/mutations
git commit -m "feat: record versioned local mutation envelopes"
```

---

### Task 3: Add PowerSync credentials and normalized sync status

**Files:**
- Create: `src/data/connector/PowerSyncConnector.ts`
- Create: `src/data/connector/PowerSyncConnector.test.ts`
- Create: `src/data/sync/sync-state.ts`
- Create: `src/data/sync/useSyncState.ts`
- Create: `src/data/sync/sync-state.test.ts`
- Modify: `src/data/PowerSyncProvider.tsx`

**Interfaces:**
- Produces connector `fetchCredentials()` using the current Supabase Auth JWT and hook `useSyncState(): SyncState`.

- [ ] **Step 1: Write failing credential tests**

Cover:
- signed-out session returns no reusable credential / throws a controlled auth-needed error;
- signed-in session returns PowerSync endpoint plus current JWT;
- logs/errors never include the JWT.

- [ ] **Step 2: Implement `fetchCredentials`**

Use current Supabase session APIs and PowerSync connector contract confirmed by @Context7:

```ts
return {
  endpoint: readPublicEnv().powersyncUrl,
  token: session.access_token,
}
```

Do not use development tokens in production code.

- [ ] **Step 3: Normalize status**

Map PowerSync connectivity/upload queue state to only:

```ts
'synced' | 'pending' | 'syncing' | 'error' | 'conflict'
```

`conflict` wins when one or more open conflict records exist; otherwise pending queue with no active upload is `pending`.

- [ ] **Step 4: Wire connection lifecycle to auth readiness**

Connect only when Auth state is `ready`. Disconnect/stop remote sync on logout while preserving local pending state according to account-lifecycle rules.

- [ ] **Step 5: Run tests**

```bash
pnpm vitest run src/data/connector src/data/sync
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/data/connector src/data/sync src/data/PowerSyncProvider.tsx
git commit -m "feat: connect PowerSync with Supabase sessions"
```

---

### Task 4: Build the idempotent server-side mutation dispatcher

**Files:**
- Create: `supabase/migrations/0006_sync_mutations.sql`
- Create: `supabase/functions/sync-mutation/index.ts`
- Create: `supabase/functions/sync-mutation/entity-policies.ts`
- Create: `supabase/functions/sync-mutation/apply-mutation.ts`
- Create: `supabase/functions/sync-mutation/index.test.ts`
- Create: `supabase/tests/sync_mutations.sql`

**Interfaces:**
- Produces `POST sync-mutation` accepting one `MutationEnvelope` and returning one `MutationApplyResult`.

```ts
export type SyncEntityType =
  | 'recipes'
  | 'recipe_ingredients'
  | 'recipe_steps'
  | 'categories'
  | 'recipe_categories'
  | 'recipe_photos'
  | 'cooking_sessions'
  | 'cooking_session_ratings'
  | 'cooking_session_photos'
  | 'meal_periods'
  | 'meal_plan_entries'
  | 'shopping_lists'
  | 'shopping_items'
  | 'ingredient_conversion_profiles'
  | 'imports'

export interface MutationEntityPolicy {
  table: SyncEntityType
  softDelete: boolean
  mergeMode: 'fieldwise' | 'independent_child'
}

export type EntityPolicyMap = Record<SyncEntityType, MutationEntityPolicy>

export function applyMutationWithPolicy(
  userId: string,
  envelope: MutationEnvelope<Record<string, unknown>>,
  policy: MutationEntityPolicy,
): Promise<MutationApplyResult>
```

- [ ] **Step 1: Write failing idempotency/revision tests**

Cover:
- same `mutationId` applied twice returns `already_applied` and changes row once;
- matching `baseRevision` applies and increments revision;
- stale base with incompatible same-field change creates conflict;
- stale base with provably independent fields can merge;
- delete vs edit creates conflict;
- caller cannot mutate another pair;
- unknown `entityType` is rejected before any SQL identifier is selected.

- [ ] **Step 2: Add applied-mutation ledger**

Migration:

```sql
create table public.applied_mutations (
  mutation_id uuid primary key,
  pair_id uuid not null references public.pairs(id),
  entity_type text not null,
  entity_id uuid not null,
  result jsonb not null,
  applied_at timestamptz not null default now()
);
```

RLS does not expose this as a normal editable client table. Access occurs through privileged function logic after verifying caller identity/pair.

- [ ] **Step 3: Implement the complete entity policy allowlist**

Create exactly this exhaustive map in `entity-policies.ts` and make TypeScript fail compilation if a `SyncEntityType` is omitted:

```ts
export const ENTITY_POLICIES: EntityPolicyMap = {
  recipes: { table: 'recipes', softDelete: true, mergeMode: 'fieldwise' },
  recipe_ingredients: { table: 'recipe_ingredients', softDelete: true, mergeMode: 'fieldwise' },
  recipe_steps: { table: 'recipe_steps', softDelete: true, mergeMode: 'fieldwise' },
  categories: { table: 'categories', softDelete: true, mergeMode: 'fieldwise' },
  recipe_categories: { table: 'recipe_categories', softDelete: true, mergeMode: 'independent_child' },
  recipe_photos: { table: 'recipe_photos', softDelete: true, mergeMode: 'independent_child' },
  cooking_sessions: { table: 'cooking_sessions', softDelete: true, mergeMode: 'fieldwise' },
  cooking_session_ratings: { table: 'cooking_session_ratings', softDelete: true, mergeMode: 'independent_child' },
  cooking_session_photos: { table: 'cooking_session_photos', softDelete: true, mergeMode: 'independent_child' },
  meal_periods: { table: 'meal_periods', softDelete: true, mergeMode: 'fieldwise' },
  meal_plan_entries: { table: 'meal_plan_entries', softDelete: true, mergeMode: 'fieldwise' },
  shopping_lists: { table: 'shopping_lists', softDelete: true, mergeMode: 'fieldwise' },
  shopping_items: { table: 'shopping_items', softDelete: true, mergeMode: 'fieldwise' },
  ingredient_conversion_profiles: { table: 'ingredient_conversion_profiles', softDelete: true, mergeMode: 'fieldwise' },
  imports: { table: 'imports', softDelete: true, mergeMode: 'fieldwise' },
}
```

`pairs`, `pair_members`, `pair_invites`, `conflicts` and `applied_mutations` are intentionally absent: normal clients never mutate those through this dispatcher.

- [ ] **Step 4: Implement safe table dispatch without interpolating untrusted entity names**

First parse `entityType` by own-property lookup against `ENTITY_POLICIES`. Then dispatch to a prepared/static query implementation selected by `policy.table`. Do not use `from(envelope.entityType)` or string-built SQL. `applyMutationWithPolicy` contains an exhaustive `switch(policy.table)` (or an equivalently typed map of static query functions) so each database table name is a literal present in source code.

- [ ] **Step 5: Implement deterministic three-way comparison**

For updates, compare `basePayload`, current remote payload and `localPayload` field by field. Auto-merge only when changed-field sets do not overlap and structural invariants remain valid. Ordered-list reorder changes are treated as overlapping unless a dedicated policy proves compatibility.

`independent_child` means independent child rows can coexist; it does **not** mean two incompatible edits to the same child row are silently merged.

- [ ] **Step 6: Create conflicts before acknowledging incompatible mutation**

Persist safe domain snapshots (no secrets) to `conflicts`. Return `{ status: 'conflict', conflictId }`. The canonical row remains readable and the local version survives in the conflict record.

- [ ] **Step 7: Run SQL/function tests**

Expected: all idempotency, cross-pair, exhaustive-policy and conflict cases PASS.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/0006_sync_mutations.sql supabase/functions/sync-mutation supabase/tests/sync_mutations.sql
git commit -m "feat: add idempotent revision-aware mutation server"
```

---

### Task 5: Implement PowerSync `uploadData` without losing conflicts

**Files:**
- Modify: `src/data/connector/PowerSyncConnector.ts`
- Extend: `src/data/connector/PowerSyncConnector.test.ts`
- Create: `src/data/mutations/upload.ts`
- Create: `src/data/mutations/upload.test.ts`

**Interfaces:**
- Produces `uploadCrudTransaction(db, crudTransaction): Promise<void>`.

- [ ] **Step 1: Write failing upload tests**

Cover:
- CRUD entry finds matching semantic outbox envelope;
- successful apply removes envelope and completes CRUD transaction;
- `already_applied` behaves as success;
- `conflict` removes envelope only after server confirms durable conflict record;
- network error increments attempt metadata but does not complete transaction or delete envelope;
- missing envelope is treated as integrity error, not silently uploaded as last-write-wins.

- [ ] **Step 2: Implement upload loop using current PowerSync CRUD transaction API**

For each PowerSync CRUD entry, resolve `{table,id}` to the matching local outbox envelope and invoke `sync-mutation` with the authenticated Supabase client.

The logical flow is:

```ts
const transaction = await db.getNextCrudTransaction()
if (!transaction) return

for (const entry of transaction.crud) {
  const envelope = await requireEnvelope(entry.table, entry.id)
  const result = await invokeSyncMutation(envelope)
  await handleApplyResult(result, envelope)
}

await transaction.complete()
```

Use exact current SDK method/property names confirmed by @Context7 at execution time; preserve the ordering and completion semantics shown here.

- [ ] **Step 3: Preserve retry semantics**

Only complete the PowerSync transaction after every entry in it has a durable server result. On transient failure, throw/return without completion so PowerSync retries later.

- [ ] **Step 4: Run upload tests**

Expected: PASS, especially the network failure and conflict preservation cases.

- [ ] **Step 5: Commit**

```bash
git add src/data/connector/PowerSyncConnector.ts src/data/mutations/upload*
git commit -m "feat: upload local mutations with conflict preservation"
```

---

### Task 6: Implement conflict center and resolution mutation

**Files:**
- Create: `src/features/conflicts/conflict-resolution.ts`
- Create: `src/features/conflicts/conflict-resolution.test.ts`
- Create: `src/features/conflicts/ConflictCenter.tsx`
- Create: `src/features/conflicts/ConflictDetail.tsx`
- Create: `src/features/conflicts/ConflictDetail.test.tsx`
- Extend: `supabase/functions/sync-mutation/index.ts`

**Interfaces:**
- Produces resolution choices `keep_local`, `keep_remote`, `manual_merge` and a new versioned mutation based on current canonical revision.

- [ ] **Step 1: Write failing resolution tests**

Test that:
- choosing remote closes conflict without rewriting canonical row;
- choosing local creates a new mutation against current canonical revision;
- manual merge requires an explicit merged payload;
- original base/local/remote snapshots remain recorded after resolution;
- resolving one conflict does not block unrelated sync.

- [ ] **Step 2: Implement resolution domain function**

```ts
export type ConflictResolution<T> =
  | { kind: 'keep_remote' }
  | { kind: 'keep_local' }
  | { kind: 'manual_merge'; payload: T }
```

`keep_local` and `manual_merge` create a fresh mutation; they do not mutate history in place.

- [ ] **Step 3: Build conflict UI**

Use clear labels: “Versão neste dispositivo”, “Versão sincronizada”, “Mesclar”. Explain that neither version is lost. Allow closing the screen and resolving later.

Do not use red emergency styling for every conflict.

- [ ] **Step 4: Rendered QA with @Build Web Apps**

Test mobile comparison, long recipe text, scroll behavior and keyboard focus.

- [ ] **Step 5: Commit**

```bash
git add src/features/conflicts supabase/functions/sync-mutation
git commit -m "feat: add explicit conflict resolution flow"
```

---

### Task 7: Protect logout and reconnect behavior

**Files:**
- Create: `src/data/session/local-session-policy.ts`
- Create: `src/data/session/local-session-policy.test.ts`
- Modify: `src/features/auth/AuthProvider.tsx`
- Create: `tests/e2e/offline-sync.spec.ts`
- Create: `tests/e2e/conflicts.spec.ts`

**Interfaces:**
- Produces `prepareLocalStateForLogout(db): Promise<'safe' | 'pending_data_preserved'>`.

- [ ] **Step 1: Write failing logout-policy tests**

Cover:
- zero pending mutations can close active DB/session normally;
- pending mutation rows are not deleted by logout;
- local data is scoped by user/pair and not surfaced to a different login;
- pending media marker is also considered protected even though actual media queue is completed in plan 04.

- [ ] **Step 2: Implement identity-scoped local storage strategy**

Use separate database/storage namespace per authenticated user+pair where the PowerSync Web SDK supports this cleanly; otherwise enforce a local ownership gate before exposing rows. Do not solve privacy by deleting unsynced data.

- [ ] **Step 3: Add offline/reconnect E2E scenario**

Flow:

```text
login fixture -> open recipe fixture -> go offline -> edit title -> reload -> title still edited -> go online -> upload -> remote fixture receives mutation -> status synced
```

Use Playwright context offline emulation for browser behavior and mocked/local backend integration if live services are unavailable.

- [ ] **Step 4: Add concurrent-edit conflict E2E**

Two isolated browser contexts edit the same recipe title from the same base; sync both; expect conflict center to show both values and canonical recipe to remain readable.

- [ ] **Step 5: Run browser gates**

Expected: offline persistence and explicit conflict flow PASS on Chromium and WebKit projects where supported.

- [ ] **Step 6: Commit**

```bash
git add src/data/session src/features/auth/AuthProvider.tsx tests/e2e/offline-sync.spec.ts tests/e2e/conflicts.spec.ts
git commit -m "test: verify offline reconnect and conflict safety"
```

---

### Task 8: Sync subsystem hardening checkpoint

**Files:**
- Modify: `docs/SYNC.md` only for verified implementation details
- Modify: `docs/OBSERVABILITY.md` only for sanitized sync error codes

**Interfaces:**
- Consumes all sync/auth/data contracts.
- Produces stable repository/sync foundation for feature plans.

- [ ] **Step 1: Run complete gates**

```bash
pnpm typecheck
pnpm test:run
pnpm build
pnpm test:e2e:smoke
```

Run Supabase SQL/function tests as available.

- [ ] **Step 2: Run Codex Security on sync mutation boundary**

Review the Edge Function dispatcher, RLS, pair checks, payload validation, idempotency ledger and conflict storage. Fix validated authorization/injection/data-loss findings.

- [ ] **Step 3: Verify no silent overwrite path remains**

Search repositories and upload code for direct remote `update/upsert` calls that bypass `sync-mutation`. Domain-edit writes must flow through local DB + mutation envelope.

- [ ] **Step 4: Verify retry logging is sanitized**

Logs may contain mutation ID/entity type/error code but not recipe content, tokens or full personal payloads.

- [ ] **Step 5: Commit fixes/docs**

```bash
git add src/data src/features/conflicts supabase docs/SYNC.md docs/OBSERVABILITY.md tests/e2e
git commit -m "test: harden local-first sync guarantees"
```

- [ ] **Step 6: Mark plan complete before feature implementation**
