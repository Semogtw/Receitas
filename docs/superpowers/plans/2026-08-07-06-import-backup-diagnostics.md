# Import Backup and Diagnostics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add secure recipe import, complete open-format backup/export, validated merge/replace restoration, exceptional account administration and privacy-preserving diagnostics without paid APIs.

**Architecture:** Recipe import and privileged restore/account operations run behind authenticated server-side boundaries. Backups use a versioned ZIP container with JSON manifest/domain data and media; restore is staged and fully validated before canonical data changes. Diagnostics are generated locally from sanitized technical events and contain no recipe content, tokens or photos.

**Tech Stack:** Supabase Edge Functions/Postgres/Storage, TypeScript, deterministic HTML/JSON-LD parsing, streaming ZIP library selected from current maintained free OSS packages, Vitest, Playwright, Codex Security.

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
src/features/backups/data/backup-service.ts
src/features/backups/components/BackupExport.tsx
src/features/backups/components/BackupRestore.tsx
supabase/functions/backup-export/index.ts
supabase/functions/backup-restore/index.ts
supabase/functions/backup-restore/staging.ts
supabase/functions/backup-restore/validation.ts
supabase/functions/backup-restore/*.test.ts
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

```ts
export interface ImportedRecipeDraft {
  title: string | null
  description: string | null
  sourceUrl: string | null
  servings: string | null
  prepTimeMinutes: number | null
  cookTimeMinutes: number | null
  ingredients: Array<{ raw: string; parsed?: RecipeIngredientInput }>
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

export type RestoreMode = 'merge' | 'replace_all'
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

Fixtures must cover:
- direct `Recipe` object;
- `@graph` containing Recipe;
- `recipeIngredient` string array;
- `recipeInstructions` as strings and `HowToStep` objects;
- ISO-8601 duration parsing;
- missing optional fields;
- malformed JSON-LD ignored without executing HTML/script.

- [ ] **Step 2: Implement safe JSON-LD extraction**

Parser accepts already-extracted JSON strings/objects, never evaluates script code and only reads known Recipe fields.

- [ ] **Step 3: Write failing paste-text tests**

Use deterministic section heuristics for title, ingredients and preparation lines. Partial parsing returns warnings and preserves raw lines instead of hallucinating structure.

- [ ] **Step 4: Implement text parser and normalization**

Attempt existing ingredient amount parser from plan 04; if a line cannot be safely structured, keep raw text for review.

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

Confirm whether the runtime exposes DNS resolution sufficient to validate A/AAAA addresses before fetch. Use the runtime's supported resolver if available. If it does not, implement the resolver through a documented public DNS-over-HTTPS endpoint and keep DNS resolution behind the injected `resolveHost(hostname)` interface so integration behavior is testable; do not omit IP-range validation.

- [ ] **Step 2: Write failing URL policy tests**

Reject:
- schemes other than http/https;
- URL credentials;
- localhost names;
- literal private/link-local/loopback/multicast/reserved IPv4/IPv6;
- hostname resolving to a forbidden address;
- redirect to forbidden host/address;
- excessive redirects.

- [ ] **Step 3: Implement explicit IP classification**

Write pure `isPublicAddress(ip)` covering IPv4 and IPv6 reserved/private ranges. Test every class used by the policy.

- [ ] **Step 4: Implement manual-redirect fetch**

For each hop:
1. parse URL;
2. validate scheme/credentials/hostname;
3. resolve and reject forbidden addresses;
4. issue fetch with `redirect: 'manual'`;
5. re-run checks on next location;
6. enforce timeout;
7. enforce response body byte ceiling while streaming;
8. accept only configured HTML/text content types.

Do not forward browser cookies or arbitrary authorization headers to target sites.

- [ ] **Step 5: Implement inert HTML parsing**

Extract JSON-LD, title/meta content and visible recipe-like text using an HTML parser; never inject fetched HTML into the app and never execute scripts.

- [ ] **Step 6: Implement authenticated function orchestration**

Verify caller is active pair member, apply rate limits/abuse controls, call `safeFetch`, parse JSON-LD first then HTML fallback, preserve original URL and return a draft only.

- [ ] **Step 7: Run tests + Codex Security focused review**

Security scope: URL validation, DNS/IP checks, redirects, body limits, parsing and logs. Fix validated SSRF/resource-exhaustion findings.

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

**Interfaces:**
- Consumes `ImportedRecipeDraft`; canonical save uses recipe repository only after explicit review confirmation.

- [ ] **Step 1: Write UI tests**

Cover URL submission, partial extraction warnings, paste-text fallback, editable review fields and cancel without save.

- [ ] **Step 2: Implement import entry surface**

Provide URL import and paste-text import. Do not claim every site is supported.

- [ ] **Step 3: Implement review surface**

All extracted title/ingredients/steps/image/source are editable/removable before save. Save action maps reviewed data into normal recipe-create repository calls.

- [ ] **Step 4: Rendered QA**

Use @Build Web Apps for loading, partial, error and review states on mobile/desktop.

- [ ] **Step 5: Commit**

```bash
git add src/features/imports src/app/routes/RecipesRoute.tsx
git commit -m "feat: add reviewed recipe import flow"
```

---

### Task 4: Define and generate the open backup format

**Files:**
- Create: `src/features/backups/domain/format.ts`
- Create: `src/features/backups/domain/format.test.ts`
- Create: `supabase/functions/backup-export/index.ts`
- Create: `supabase/functions/backup-export/index.test.ts`
- Create: `src/features/backups/data/backup-service.ts`

**Interfaces:**
- Produces version-1 `receitas-backup` ZIP with manifest, JSON data files and media.

- [ ] **Step 1: Select and verify a maintained free streaming ZIP library**

Use @Context7/current package docs. Prefer streaming ZIP output that works in Supabase Edge/Deno so a backup does not require holding all media bytes in memory. Pin the chosen OSS package/version in function import configuration.

- [ ] **Step 2: Write failing manifest tests**

Require:
- exact format/version;
- deterministic data file paths;
- SHA-256 + byte count for each entry;
- no auth/session/secret records;
- pair export identifier is a backup-domain identifier, not authorization data to import literally.

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

Conflicts may be exported as diagnostic/history data if the backup spec requires them, but provider credentials never are.

- [ ] **Step 4: Implement authenticated streaming export**

Function verifies active pair membership, queries only that pair, serializes stable open JSON and streams private media into the ZIP while computing checksums.

- [ ] **Step 5: Add client download action**

`backup-service.ts` requests export with current session and saves the returned archive through standard browser download/share capability. No provider admin key enters client.

- [ ] **Step 6: Run tests and commit**

```bash
pnpm vitest run src/features/backups/domain/format.test.ts
# run edge function tests
git add src/features/backups supabase/functions/backup-export
git commit -m "feat: export complete open-format backups"
```

---

### Task 5: Implement complete preflight backup validation and staging

**Files:**
- Create: `src/features/backups/domain/validation.ts`
- Create: `src/features/backups/domain/validation.test.ts`
- Create: `supabase/functions/backup-restore/validation.ts`
- Create: `supabase/functions/backup-restore/staging.ts`
- Create: tests

**Interfaces:**
- Produces `validateBackupManifest` client helper and server `validateAndStageBackup`.

- [ ] **Step 1: Write failing archive validation tests**

Reject:
- wrong format/version;
- duplicate paths;
- absolute paths;
- `..` path traversal/zip-slip;
- symlink-like entries if library exposes them;
- too many files;
- total declared/uncompressed size over configured ceiling;
- entry compression ratio over configured ZIP-bomb ceiling;
- checksum/byte mismatch;
- unexpected executable/content types;
- malformed JSON schema;
- cross-reference integrity failures;
- auth/user IDs attempting to create a third member.

- [ ] **Step 2: Implement central limits as named constants**

Keep limits in one file and document rationale. Set ceilings above the maximum expected by the project's current free Storage quota but below runtime-dangerous values where necessary. If Edge runtime limits are lower than full backup size, use private Storage staging plus chunked/streamed validation rather than weakening validation.

- [ ] **Step 3: Implement staging**

Incoming restore archive is uploaded to a private temporary restore path. Validation streams every archive entry and may stage verified media under a temporary restore ID. No canonical DB row or final media path changes during this phase.

- [ ] **Step 4: Verify complete preflight property**

Tests must prove a corrupt last entry results in zero canonical mutations.

- [ ] **Step 5: Commit**

```bash
git add src/features/backups/domain/validation* supabase/functions/backup-restore
git commit -m "feat: validate and stage backup archives safely"
```

---

### Task 6: Implement merge and replace-all restore modes

**Files:**
- Create: `supabase/functions/backup-restore/index.ts`
- Create: `supabase/functions/backup-restore/index.test.ts`
- Create: `src/features/backups/components/BackupExport.tsx`
- Create: `src/features/backups/components/BackupRestore.tsx`
- Create: component tests
- Modify: `src/features/backups/data/backup-service.ts`

**Interfaces:**
- Produces restore modes `merge` and `replace_all`.

- [ ] **Step 1: Write failing merge tests**

Stable IDs:
- missing entity inserts;
- identical entity no-ops;
- same stable ID with incompatible revision creates normal `conflicts` record;
- soft-deleted divergent entities are not silently resurrected;
- media checksum can deduplicate identical object content.

- [ ] **Step 2: Implement merge through normal conflict semantics**

Map imported data into current pair authorization boundary. Do not import source backup's Auth user IDs as new identities. Preserve historical attribution as backup-domain metadata where needed.

- [ ] **Step 3: Write failing replace-all safety tests**

Require:
1. current-state safety backup export succeeds;
2. safety backup itself validates;
3. incoming backup already passed full preflight;
4. only then canonical replacement transaction begins.

If safety backup generation/validation fails, replacement aborts.

- [ ] **Step 4: Implement staged media + transactional structured replace**

Use a restore job ID. Stage/copy media to safe target objects before committing structured DB references. Apply structured replacement in a DB transaction. Orphan staged/final media from a failed DB transaction are cleanup candidates and must not become referenced canonical product data.

- [ ] **Step 5: Implement restore UI**

Clearly distinguish “Mesclar” vs “Substituir tudo”. Replace-all uses explicit destructive confirmation and states that an automatic safety backup is created first.

- [ ] **Step 6: Add recovery result**

After replace-all, return the safety-backup identifier/download metadata so the user can recover if necessary. Do not silently delete it immediately.

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

**Interfaces:**
- Produces privileged operations for explicit member removal and controlled replacement without reopening public signup.

- [ ] **Step 1: Write failing lifecycle tests**

Cover:
- normal user cannot remove the other identity casually;
- operation requires recent authentication/explicit destructive confirmation according to current provider capabilities;
- removing identity does not cascade-delete shared recipes/history/media;
- pair remains closed;
- replacement requires a separate high-entropy one-time administrative recovery token/flow, not normal invite route;
- previous authorship/historical user reference is preserved.

- [ ] **Step 2: Implement server authorization and backup precondition**

Before destructive identity removal, require a successful recent backup or explicit verified safety-backup generation. Never expose provider admin APIs to the browser.

- [ ] **Step 3: Implement controlled replacement path**

Replacement can occupy the vacant active membership only through account-admin logic that explicitly verifies the closed pair's recovery state. It must not make generic invite creation available after pair closure.

- [ ] **Step 4: Build deliberately buried settings UI**

This is not a common action. Use clear destructive copy and show backup outcome before final confirmation.

- [ ] **Step 5: Run Codex Security review and commit**

```bash
git add supabase/functions/account-admin src/features/auth/AccountAdminScreen*
git commit -m "feat: add controlled account lifecycle administration"
```

---

### Task 8: Implement sanitized diagnostics event store/export

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
- Produces structured `DiagnosticEvent` and `exportDiagnostics()`.

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

Ensure context rejects/removes keys or values representing tokens, Authorization headers, passwords, bootstrap secret, recipe text, e-mail address, arbitrary payload/body and image data.

- [ ] **Step 2: Implement bounded local event store**

Keep a short fixed maximum count/size. Oldest events roll off. No analytics transport is added.

- [ ] **Step 3: Implement diagnostic export**

Output JSON containing app version/build, browser/platform summary, sync queue counts/status and sanitized recent events. Do not include full database rows.

- [ ] **Step 4: Implement temporary verbose logging switch**

Device-local and time-bounded. Even verbose mode obeys sanitizer and never permits secrets/content payloads.

- [ ] **Step 5: Build diagnostics settings UI and tests**

Actions: view technical status, export diagnostic file, temporarily enable detailed technical logging. No tracking consent/analytics screen because analytics are absent by default.

- [ ] **Step 6: Commit**

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

Use controlled HTTP fixtures: JSON-LD recipe, HTML fallback, oversized response, bad redirect, forbidden-address fixture/mocked resolver. Verify review before save.

- [ ] **Step 2: Backup round-trip E2E**

Create representative pair data + media → export → validate archive → mutate current state → merge restore → verify conflicts where expected.

- [ ] **Step 3: Replace-all safety E2E**

Create state A → export incoming B → invoke replace → verify safety backup A exists and validates → verify B becomes canonical → restore A from safety backup to prove rollback path.

- [ ] **Step 4: Corrupt-last-entry E2E**

Provide archive whose final media/checksum is corrupt. Assert canonical state unchanged.

- [ ] **Step 5: Diagnostics privacy E2E**

Trigger representative errors containing sensitive fixture strings internally; exported diagnostics must not contain those sensitive strings.

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

Scan import SSRF/parser, ZIP extraction/restore, account admin and diagnostic sanitization. Fix validated high/critical findings and any medium issue that violates explicit project invariants.

- [ ] **Step 3: Verify archive and logs contain no credentials**

Search generated test backup/diagnostic outputs for known fixture tokens/passwords/e-mails. Expected: none.

- [ ] **Step 4: Update normative docs only with verified implementation specifics**

Touch `IMPORTING.md`, `BACKUP_RESTORE.md`, `ACCOUNT_LIFECYCLE.md`, `OBSERVABILITY.md` if runtime/package realities required exact documented behavior.

- [ ] **Step 5: Commit and mark plan complete**

```bash
git add src supabase tests docs
git commit -m "test: harden import backup and diagnostics"
```
