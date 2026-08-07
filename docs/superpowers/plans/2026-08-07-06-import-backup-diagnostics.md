# Import Backup and Diagnostics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add secure recipe import, complete open-format backup/export, validated merge/replace restoration, exceptional account administration and privacy-preserving diagnostics without paid APIs.

**Architecture:** Recipe import and privileged restore/account operations run behind authenticated server-side boundaries. Backup ZIP assembly happens on the client from synchronized local structured data plus authenticated private-media downloads, avoiding heavy compression work inside the strict CPU budget of free Edge Functions. Restore is two-phase: the client validates and stages an archive/media set, server endpoints revalidate every staged batch and cross-reference, and only a final commit operation mutates canonical rows.

**Tech Stack:** Supabase Edge Functions/Postgres/Storage, TypeScript, deterministic HTML/JSON-LD parsing, `@zip.js/zip.js`, OPFS when available with bounded Blob fallback, Vitest, Playwright, Codex Security.

## Global Constraints

- Import does not depend on paid AI/API services.
- URL import tries Schema.org Recipe/JSON-LD first, then deterministic HTML fallback, then user can use paste-text import.
- Every import ends in manual review before canonical save.
- URL fetching requires SSRF/redirect/size/content-type/sanitization protections.
- Backup format is open and includes structured domain data plus media.
- Restore validates the complete archive before changing canonical product state.
- Restore supports `merge` and `replace_all`.
- `replace_all` requires a newly generated and validated safety backup first.
- Backups never contain passwords, sessions, bootstrap secret, service-role key or provider credentials.
- Diagnostics contain technical metadata only, not personal recipe/photo content.
- Exceptional account removal/replacement never becomes public signup or automatic seat reopening.
- Free-tier runtime limits are architectural constraints, not reasons to drop safety requirements.

---

## File map

```text
src/features/imports/domain/schema-org.ts
src/features/imports/domain/text-parser.ts
src/features/imports/domain/normalize-import.ts
src/features/imports/data/import-service.ts
src/features/imports/components/ImportRecipe.tsx
src/features/imports/components/ImportReview.tsx
supabase/functions/import-recipe/index.ts
supabase/functions/import-recipe/safe-fetch.ts
supabase/functions/import-recipe/parse-html.ts
supabase/functions/import-recipe/*.test.ts
src/features/backups/domain/format.ts
src/features/backups/domain/validation.ts
src/features/backups/data/archive-writer.ts
src/features/backups/data/backup-service.ts
src/features/backups/data/restore-staging-service.ts
src/features/backups/components/BackupExport.tsx
src/features/backups/components/BackupRestore.tsx
supabase/functions/backup-restore/index.ts
supabase/functions/backup-restore/staging.ts
supabase/functions/backup-restore/validation.ts
supabase/functions/backup-restore/*.test.ts
supabase/migrations/0007_restore_staging.sql
supabase/functions/account-admin/index.ts
supabase/functions/account-admin/index.test.ts
src/features/diagnostics/events.ts
src/features/diagnostics/store.ts
src/features/diagnostics/export.ts
src/features/diagnostics/components/DiagnosticsScreen.tsx
tests/e2e/import.spec.ts
tests/e2e/backup-restore.spec.ts
tests/e2e/diagnostics.spec.ts
```

## Stable contracts

`IngredientAmount` is imported from the recipe domain created in plan 04.

```ts
export interface ImportedIngredientDraft {
  raw: string
  parsed?: {
    amount: IngredientAmount
    unit: string | null
    name: string
    note: string | null
  }
}

export interface ImportedRecipeDraft {
  title: string | null
  description: string | null
  sourceUrl: string | null
  servings: string | null
  prepTimeMinutes: number | null
  cookTimeMinutes: number | null
  ingredients: ImportedIngredientDraft[]
  steps: Array<{ instruction: string }>
  imageUrl: string | null
  warnings: string[]
}

export interface BackupManifest {
  format: 'receitas-backup'
  version: 1
  createdAt: string
  appVersion: string
  pairExportId: string
  dataFiles: Array<{ path: string; sha256: string; bytes: number }>
  mediaFiles: Array<{ path: string; sha256: string; bytes: number; mediaType: string }>
}

export interface BackupArtifact {
  manifest: BackupManifest
  filename: string
  bytes: number
  sha256: string
  file: File
}

export type RestoreMode = 'merge' | 'replace_all'
export type RestoreJobStatus = 'uploading' | 'validating' | 'ready_to_commit' | 'committing' | 'completed' | 'rejected'

export interface RestoreJobSummary {
  id: string
  pairId: string
  mode: RestoreMode
  status: RestoreJobStatus
  manifestSha256: string
  safetyBackupId: string | null
}
```

---

### Task 1: Implement deterministic recipe parsing from JSON-LD and pasted text

**Files:**
- Create: `src/features/imports/domain/schema-org.ts`
- Create: `src/features/imports/domain/schema-org.test.ts`
- Create: `src/features/imports/domain/text-parser.ts`
- Create: `src/features/imports/domain/text-parser.test.ts`
- Create: `src/features/imports/domain/normalize-import.ts`

**Interfaces:**
- Produces pure parsers returning `ImportedRecipeDraft`.

- [ ] **Step 1: Write failing Schema.org Recipe tests**

Fixtures cover direct `Recipe`, `@graph`, ingredient arrays, string/`HowToStep` instructions, ISO-8601 durations, missing optional fields and malformed JSON-LD. Malformed script content is data only and never executes.

- [ ] **Step 2: Implement safe JSON-LD extraction**

Read only known Recipe fields from already-extracted inert JSON values.

- [ ] **Step 3: Write failing paste-text tests**

Use deterministic section heuristics for title, ingredients and preparation lines. Partial parsing returns warnings and preserves raw lines instead of inventing structure.

- [ ] **Step 4: Implement text parser and normalization**

Attempt the ingredient amount parser from plan 04; keep unparseable lines raw for review.

- [ ] **Step 5: Run tests and commit**

```bash
pnpm vitest run src/features/imports/domain
git add src/features/imports/domain
git commit -m "feat: add deterministic recipe import parsers"
```

---

### Task 2: Implement SSRF-resistant server fetch and HTML extraction

**Files:**
- Create: `supabase/functions/import-recipe/safe-fetch.ts`
- Create: `supabase/functions/import-recipe/safe-fetch.test.ts`
- Create: `supabase/functions/import-recipe/parse-html.ts`
- Create: `supabase/functions/import-recipe/parse-html.test.ts`
- Create: `supabase/functions/import-recipe/index.ts`
- Create: `supabase/functions/import-recipe/index.test.ts`

**Interfaces:**
- Produces authenticated `import-recipe` function `{ url } -> ImportedRecipeDraft`.

- [ ] **Step 1: Verify current Supabase Edge runtime network/DNS APIs with @Context7**

Implement `resolveHost(hostname): Promise<string[]>` behind an injected interface. Use the runtime's documented direct DNS resolver when supported. If that API is unavailable, use a documented public DNS-over-HTTPS JSON endpoint with explicit request timeout and response-size limit; both branches feed the same IP classification and redirect validation code.

- [ ] **Step 2: Write failing URL policy tests**

Reject non-http(s), URL credentials, localhost, literal private/link-local/loopback/multicast/reserved IPv4/IPv6, hostname resolving to forbidden address, redirect to forbidden address and excessive redirects.

- [ ] **Step 3: Implement explicit IP classification**

Pure `isPublicAddress(ip)` covers all blocked IPv4 and IPv6 classes with table-driven tests.

- [ ] **Step 4: Implement manual-redirect safe fetch**

For every hop: parse → validate → resolve → reject forbidden addresses → fetch with `redirect:'manual'` → revalidate redirect → enforce timeout/body-byte ceiling/content type. Never forward browser cookies or arbitrary authorization headers to target sites.

- [ ] **Step 5: Implement inert HTML extraction**

Extract JSON-LD/meta/title/visible recipe-like text with a parser; never render remote HTML or execute scripts.

- [ ] **Step 6: Implement authenticated orchestration**

Verify pair membership, apply abuse/rate controls, parse JSON-LD first then fallback and return a review draft only.

- [ ] **Step 7: Run tests + focused Codex Security review**

Fix validated SSRF/resource-exhaustion issues before completion.

- [ ] **Step 8: Commit**

```bash
git add supabase/functions/import-recipe
git commit -m "feat: add secure server-side recipe import"
```

---

### Task 3: Build import and mandatory review UI

**Files:**
- Create: `src/features/imports/data/import-service.ts`
- Create: `src/features/imports/components/ImportRecipe.tsx`
- Create: `src/features/imports/components/ImportReview.tsx`
- Create: component tests
- Modify: `src/app/routes/RecipesRoute.tsx`

- [ ] **Step 1: Write UI tests**

Cover URL submission, partial warnings, paste-text fallback, editable review and cancel without save.

- [ ] **Step 2: Implement import entry**

Offer URL and paste-text modes; do not claim universal site support.

- [ ] **Step 3: Implement review surface**

All extracted content is editable/removable. Canonical save happens only after explicit confirmation through the normal recipe repository.

- [ ] **Step 4: Rendered QA and commit**

Use @Build Web Apps for loading/partial/error/review mobile+desktop.

```bash
git add src/features/imports src/app/routes/RecipesRoute.tsx
git commit -m "feat: add reviewed recipe import flow"
```

---

### Task 4: Define the versioned backup format and Zip.js streaming archive writer

**Files:**
- Create: `src/features/backups/domain/format.ts`
- Create: `src/features/backups/domain/format.test.ts`
- Create: `src/features/backups/data/archive-writer.ts`
- Create: `src/features/backups/data/archive-writer.test.ts`
- Create: `src/features/backups/data/backup-service.ts`
- Create: `src/features/backups/data/backup-service.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces `createCompleteBackup(): Promise<BackupArtifact>` and version-1 `receitas-backup` ZIP.

- [ ] **Step 1: Install and pin Zip.js**

```bash
pnpm add @zip.js/zip.js
```

Use `ZipWriter`/`ZipWriterStream` and `ZipReader`/`ZipReaderStream` APIs confirmed through @Context7. Photos are already compressed, so media entries use store/no-compression mode; small JSON entries may use normal compression.

- [ ] **Step 2: Write failing manifest tests**

Require exact format/version, deterministic paths, SHA-256/byte count for every entry and absence of auth/session/secret fields.

- [ ] **Step 3: Define canonical archive layout**

```text
manifest.json
data/pair.json
data/recipes.json
data/recipe-ingredients.json
data/recipe-steps.json
data/categories.json
data/recipe-categories.json
data/cooking-sessions.json
data/cooking-session-ratings.json
data/meal-periods.json
data/meal-plan-entries.json
data/shopping-lists.json
data/shopping-items.json
data/conversion-profiles.json
data/photo-metadata.json
media/<stable-photo-id>.<ext>
```

Provider credentials and active session data are forbidden.

- [ ] **Step 4: Implement structured-data export from a synchronized local snapshot**

Before backup begins, require the local sync queue to be drained. If it is not drained, return an explicit `backup_requires_sync` error and offer retry after synchronization; never export an archive labeled complete while known mutations are pending. Read structured rows from one consistent local snapshot where the current database API supports it.

- [ ] **Step 5: Implement authenticated media streaming**

For each canonical photo metadata row, use the private Storage adapter to download/stream the original. Reuse the SHA-256 persisted at successful upload; if legacy metadata lacks it, compute client-side while streaming and update metadata for future exports.

- [ ] **Step 6: Implement OPFS-first output**

When `navigator.storage.getDirectory()`/OPFS writable files are supported, stream ZIP output to an OPFS file, then obtain a `File` handle/result for user download/share. When OPFS is unavailable, use Zip.js `BlobWriter` only if estimated backup size is below a tested conservative `MAX_BLOB_BACKUP_BYTES`; larger backup attempts fail with a clear capability error instead of omitting media or exhausting memory.

- [ ] **Step 7: Run unit tests and commit**

```bash
pnpm vitest run src/features/backups/domain/format.test.ts src/features/backups/data/archive-writer.test.ts src/features/backups/data/backup-service.test.ts
git add package.json pnpm-lock.yaml src/features/backups
git commit -m "feat: generate complete client-side backups"
```

---

### Task 5: Implement complete archive preflight and private restore staging

**Files:**
- Create: `src/features/backups/domain/validation.ts`
- Create: `src/features/backups/domain/validation.test.ts`
- Create: `src/features/backups/data/restore-staging-service.ts`
- Create: `src/features/backups/data/restore-staging-service.test.ts`
- Create: `supabase/migrations/0007_restore_staging.sql`
- Create: `supabase/functions/backup-restore/validation.ts`
- Create: `supabase/functions/backup-restore/staging.ts`
- Create: tests

**Interfaces:**
- Produces staged `RestoreJobSummary` state transitions `uploading -> validating -> ready_to_commit | rejected`.

- [ ] **Step 1: Write failing local archive validation tests**

Reject wrong format/version, duplicate/absolute/`..` paths, symlink-like entries, excessive file count/size/compression ratio, checksum mismatch, unexpected media types, malformed JSON and broken domain cross-references.

- [ ] **Step 2: Implement central safety limits**

Keep constants in one source file, with tested ceilings derived from current product quotas/runtime limits. They prevent ZIP-bomb/resource exhaustion while allowing a legitimate backup within the supported storage envelope.

- [ ] **Step 3: Implement private staging schema/storage**

`restore_jobs` stores authenticated pair, mode, status, manifest hash and validation progress. Parsed structured batches live in staging records/tables; media goes under private `restore-staging/<job-id>/...`. Staging is never read as canonical product state.

- [ ] **Step 4: Stage in bounded batches**

Client uses Zip.js streaming reader, validates entries locally, uploads verified media/data batches and sends checksums/metadata. Each server staging call rechecks active pair ownership, declared hash/size and schema. Batch limits keep each Edge request well below current free CPU/wall-clock ceilings.

- [ ] **Step 5: Implement server final-preflight**

Before setting `ready_to_commit`, verify every manifest entry exists in staging, hashes/sizes match, domain cross-references are valid and no payload can create/replace Auth identities or open membership capacity.

- [ ] **Step 6: Prove complete preflight**

A corrupt final entry/missing staged object leaves the job `rejected` and canonical tables untouched.

- [ ] **Step 7: Commit**

```bash
git add src/features/backups/domain/validation* src/features/backups/data/restore-staging-service* supabase/migrations/0007_restore_staging.sql supabase/functions/backup-restore
git commit -m "feat: validate and stage backup restores safely"
```

---

### Task 6: Implement merge and replace-all restore commit

**Files:**
- Create: `supabase/functions/backup-restore/index.ts`
- Create: `supabase/functions/backup-restore/index.test.ts`
- Create: `src/features/backups/components/BackupExport.tsx`
- Create: `src/features/backups/components/BackupRestore.tsx`
- Create: component tests
- Modify: `src/features/backups/data/backup-service.ts`

**Interfaces:**
- Produces restore modes `merge` and `replace_all` using only jobs in `ready_to_commit` state.

- [ ] **Step 1: Write failing merge tests**

Missing stable IDs insert; identical rows no-op; incompatible same-ID data creates normal conflict; divergent soft delete is not silently resurrected; matching media checksum deduplicates.

- [ ] **Step 2: Implement merge commit through normal domain conflict semantics**

Map all data into the current pair authorization boundary. Historical attribution may be preserved as inert backup metadata; source Auth IDs never become new members.

- [ ] **Step 3: Write failing replace-all safety tests**

A replace commit requires `safety_backup_id` whose archive was generated from the current synchronized state, uploaded to a private safety-backup path and passed the same validation pipeline. Missing/invalid safety backup aborts replacement.

- [ ] **Step 4: Automate safety backup generation in the restore UI**

On `replace_all` confirmation, automatically run `createCompleteBackup()`, make the artifact available to the user, upload the same archive to private safety-backup staging, wait for server validation, then enable destructive commit.

- [ ] **Step 5: Implement staged media + transactional structured commit**

Promote/copy validated staged media to safe final object keys before structured DB commit; orphan media from a later DB failure remains unreferenced and is cleaned by restore-job cleanup. Apply structured replacement in a Postgres transaction so canonical rows never become half-replaced.

- [ ] **Step 6: Implement restore UI**

Clearly distinguish Mesclar/Substituir tudo, show validation progress, safety-backup outcome and final result. Corrupt/incompatible archive fails before commit.

- [ ] **Step 7: Run tests + security review and commit**

```bash
git add supabase/functions/backup-restore src/features/backups
git commit -m "feat: restore backups with merge and safe replace modes"
```

---

### Task 7: Implement exceptional account administration

**Files:**
- Create: `supabase/functions/account-admin/index.ts`
- Create: `supabase/functions/account-admin/index.test.ts`
- Create: `src/features/auth/AccountAdminScreen.tsx`
- Create: `src/features/auth/AccountAdminScreen.test.tsx`

- [ ] **Step 1: Write failing lifecycle tests**

Normal user cannot casually remove the other identity; destructive operation requires the current provider's strongest practical recent-auth confirmation; shared data does not cascade-delete; pair remains closed; replacement uses a distinct administrative recovery flow; previous authorship remains historical.

- [ ] **Step 2: Require safety backup**

Before identity removal, require a successful current backup artifact validated by the same backup validator.

- [ ] **Step 3: Implement controlled replacement**

Only account-admin logic can occupy a vacant active membership after explicit recovery authorization. Normal invite remains closed.

- [ ] **Step 4: Build buried settings UI, security-review and commit**

```bash
git add supabase/functions/account-admin src/features/auth/AccountAdminScreen*
git commit -m "feat: add controlled account lifecycle administration"
```

---

### Task 8: Implement sanitized diagnostics store/export

**Files:**
- Create: `src/features/diagnostics/events.ts`
- Create: `src/features/diagnostics/events.test.ts`
- Create: `src/features/diagnostics/store.ts`
- Create: `src/features/diagnostics/store.test.ts`
- Create: `src/features/diagnostics/export.ts`
- Create: `src/features/diagnostics/export.test.ts`
- Create: `src/features/diagnostics/components/DiagnosticsScreen.tsx`
- Create: component tests

**Interfaces:**

```ts
export interface DiagnosticEvent {
  id: string
  timestamp: string
  area: 'sync' | 'media' | 'auth' | 'import' | 'backup' | 'pwa'
  code: string
  severity: 'info' | 'warning' | 'error'
  technicalContext: Record<string, string | number | boolean | null>
}
```

- [ ] **Step 1: Write failing sanitizer tests**

Reject/remove token, Authorization, password, bootstrap secret, recipe text, e-mail, arbitrary body/payload and image data.

- [ ] **Step 2: Implement bounded local store**

Fixed maximum count/size; oldest events roll off; no analytics transport.

- [ ] **Step 3: Implement export**

Include app version/build, browser/platform summary, sync queue counts/status and sanitized recent events only.

- [ ] **Step 4: Implement time-bounded verbose mode**

Device-local and still sanitized.

- [ ] **Step 5: Build diagnostics UI and commit**

```bash
git add src/features/diagnostics
git commit -m "feat: add private sanitized diagnostics export"
```

---

### Task 9: Integration acceptance for import/backup/diagnostics

**Files:**
- Create: `tests/e2e/import.spec.ts`
- Create: `tests/e2e/backup-restore.spec.ts`
- Create: `tests/e2e/diagnostics.spec.ts`

- [ ] **Step 1: Import E2E**

Controlled fixtures: JSON-LD, HTML fallback, oversized response, forbidden redirect/address; verify manual review before save.

- [ ] **Step 2: Backup round-trip E2E**

Create representative structured data + media → sync → export → validate → mutate → merge restore → verify expected inserts/conflicts.

- [ ] **Step 3: Replace-all safety E2E**

State A → incoming B → automatic safety backup A → server validates A → replace with B → restore A from safety backup.

- [ ] **Step 4: Corrupt-final-entry E2E**

Archive with corrupt final media/checksum leaves canonical state unchanged.

- [ ] **Step 5: Diagnostics privacy E2E**

Trigger errors with sensitive fixture strings; exported diagnostics must not contain them.

- [ ] **Step 6: Commit**

```bash
git add tests/e2e
git commit -m "test: cover import backup restore and diagnostics"
```

---

### Task 10: Security and documentation checkpoint

- [ ] **Step 1: Run all gates**

```bash
pnpm typecheck
pnpm test:run
pnpm build
pnpm test:e2e:smoke
```

Run Supabase function/SQL tests.

- [ ] **Step 2: Run Codex Security focused scans**

Scan import SSRF/parser, archive parsing/staging/restore, account admin and diagnostic sanitization. Fix validated high/critical findings and any medium issue that violates explicit invariants.

- [ ] **Step 3: Verify backup/diagnostic outputs contain no credentials**

Search generated fixtures for known tokens/passwords/e-mails; expected none.

- [ ] **Step 4: Update normative docs with verified implementation specifics**

Touch `IMPORTING.md`, `BACKUP_RESTORE.md`, `ACCOUNT_LIFECYCLE.md`, `OBSERVABILITY.md` when runtime/package facts require exact documentation.

- [ ] **Step 5: Commit and mark plan complete**

```bash
git add src supabase tests docs
git commit -m "test: harden import backup and diagnostics"
```
