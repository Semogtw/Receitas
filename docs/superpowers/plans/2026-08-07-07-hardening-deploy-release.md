# Hardening Deployment and Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the completed Receitas implementation into a secure, reproducible, zero-cost release with verified PWA behavior, complete quality gates, operational runbooks and Cloudflare Pages deployment.

**Architecture:** The static Vite build is deployed to Cloudflare Pages Free; Supabase Free provides database/Auth/Storage/Edge Functions; PowerSync Cloud Free provides sync. Release hardening adds generated static security headers, SPA fallback, end-to-end acceptance, full security scan, backup/restore drill and explicit procedures for free-tier hibernation/deprovisioning.

**Tech Stack:** Cloudflare Pages, Supabase Free, PowerSync Cloud Free, pnpm, Vitest, Playwright, @Build Web Apps, Codex Security.

## Global Constraints

- Recurring mandatory cost must remain US$ 0.
- Cloudflare Pages Free is the static frontend host.
- Supabase Free and PowerSync Cloud Free are the backend/sync services.
- Do not add keep-alive traffic whose purpose is to evade provider inactivity policies.
- Static frontend requests must not invoke unnecessary paid/serverless functions.
- Production PWA must preserve local edits across updates/reloads.
- Security headers and service-worker behavior must be verified on the deployed origin.
- High/critical validated security findings block release.
- Release is not complete until backup restore has been drilled successfully.

---

## Current free-tier operational facts to re-verify before execution

As verified on 2026-08-07 from provider documentation:

- Cloudflare Pages Free: 500 builds/month, one concurrent build, 20,000 files/site, 25 MiB max static asset file, static asset requests free/unlimited.
- Cloudflare Pages supports `_headers` and `_redirects`; specific Node/pnpm versions can be pinned using `.node-version` and package-manager configuration/environment.
- Supabase Free: 500 MB database, 1 GB file storage, 5 GB egress, 50,000 MAU; inactive free projects can pause after about one week and can be resumed from the Dashboard within the documented restore window.
- Supabase hosted Edge Functions Free currently have 256 MB memory and 150 s wall-clock/request-idle limits with 2 s CPU time per request.
- PowerSync Cloud Free: 2 GB data synced/month, 500 MB hosted data, 50 peak concurrent connections, two service instances; instances with no deploys or client connections for over seven days are deprovisioned and can be restarted by redeploying Sync Streams/Rules, causing clients to re-sync.

These values are operational assumptions, not permanent product contracts. Re-check official docs before first real deployment and whenever a provider changes its free plan.

---

## File map

```text
.node-version
public/_redirects
scripts/generate-pages-headers.mjs
scripts/validate-build-secrets.mjs
scripts/verify-zero-cost-config.mjs
package.json
playwright.config.ts
tests/e2e/release-acceptance.spec.ts
tests/e2e/pwa-update.spec.ts
tests/e2e/security-headers.spec.ts
docs/DEPLOYMENT_OPERATIONS.md
docs/TESTING.md
docs/RELEASE_CHECKLIST.md
docs/runbooks/supabase-resume.md
docs/runbooks/powersync-redeploy.md
docs/runbooks/backup-restore-drill.md
docs/runbooks/incident-data-preservation.md
```

---

### Task 1: Pin the production build runtime and deterministic scripts

**Files:**
- Create: `.node-version`
- Modify: `package.json`
- Create: `scripts/verify-zero-cost-config.mjs`
- Create: `scripts/verify-zero-cost-config.test.ts` or equivalent unit test

**Interfaces:**
- Produces `pnpm verify:cost`, `pnpm verify`, `pnpm build:pages`.

- [ ] **Step 1: Pin Node and package manager**

Set `.node-version` to the Node 24 LTS major/minor chosen and already validated by local development. Set `packageManager` in `package.json` to the exact pnpm 10 version captured by Corepack/lockfile at implementation time.

- [ ] **Step 2: Write a failing zero-cost configuration test**

The checker fails if repository deployment config introduces known paid-only infrastructure dependencies or environment flags indicating paid tiers.

Example expected rule shape:

```ts
const forbidden = [
  /SUPABASE_PLAN\s*=\s*pro/i,
  /POWERSYNC_PLAN\s*=\s*pro/i,
  /VERCEL_PRO/i,
]
```

The script is a guardrail, not proof of billing; the release checklist also requires Dashboard verification.

- [ ] **Step 3: Implement composite verification scripts**

`package.json`:

```json
{
  "scripts": {
    "verify:cost": "node scripts/verify-zero-cost-config.mjs",
    "verify": "pnpm typecheck && pnpm test:run && pnpm build && pnpm test:e2e:smoke && pnpm verify:cost",
    "build:pages": "vite build && node scripts/generate-pages-headers.mjs && node scripts/validate-build-secrets.mjs"
  }
}
```

Preserve existing lint script if configured and include it before typecheck in `verify`.

- [ ] **Step 4: Run scripts**

```bash
pnpm verify:cost
pnpm build:pages
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add .node-version package.json scripts/verify-zero-cost-config*
git commit -m "chore: pin zero-cost production build runtime"
```

---

### Task 2: Generate exact Cloudflare Pages security headers and SPA fallback

**Files:**
- Create: `public/_redirects`
- Create: `scripts/generate-pages-headers.mjs`
- Create: `scripts/generate-pages-headers.test.ts`
- Create: `scripts/validate-build-secrets.mjs`
- Create: tests

**Interfaces:**
- Produces `dist/_headers` containing a CSP with exact configured Supabase and PowerSync origins.

- [ ] **Step 1: Write failing CSP generator tests**

Given:

```text
VITE_SUPABASE_URL=https://abc.supabase.co
VITE_POWERSYNC_URL=https://example.powersync.journeyapps.com
```

expect `dist/_headers` to include exact HTTPS origins in `connect-src`, the corresponding secure WebSocket origin if required by the current SDK, and no wildcard `https://*` source.

- [ ] **Step 2: Implement SPA fallback**

`public/_redirects`:

```text
/* /index.html 200
```

Verify this is still the supported Cloudflare Pages proxy/rewrite syntax before deployment.

- [ ] **Step 3: Generate strict headers after Vite build**

Generate a rule for `/*` including at minimum:

```text
Content-Security-Policy: default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self'; style-src 'self'; font-src 'self' data:; img-src 'self' data: blob: <EXACT_SUPABASE_ORIGIN>; connect-src 'self' <EXACT_SUPABASE_ORIGIN> <EXACT_POWERSYNC_ORIGIN> <REQUIRED_WSS_ORIGINS>; worker-src 'self' blob:; manifest-src 'self'
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
Permissions-Policy: camera=(self), microphone=(), geolocation=(), payment=(), usb=()
X-Frame-Options: DENY
X-Robots-Tag: noindex, nofollow
```

Only permit camera if the implemented photo flow actually uses direct camera capture. Tighten any source that proves unnecessary in deployed testing.

- [ ] **Step 4: Implement build secret scanner**

`validate-build-secrets.mjs` scans emitted text assets for known forbidden variable names and configured test secret values. It must fail on `service_role`, `BOOTSTRAP_SECRET`, raw test passwords/tokens and other privileged secret fixtures.

- [ ] **Step 5: Run tests/build and commit**

```bash
pnpm vitest run scripts
pnpm build:pages
git add public/_redirects scripts/generate-pages-headers* scripts/validate-build-secrets*
git commit -m "security: add Pages CSP headers and SPA fallback"
```

---

### Task 3: Complete release-level automated browser acceptance

**Files:**
- Create: `tests/e2e/release-acceptance.spec.ts`
- Create: `tests/e2e/pwa-update.spec.ts`
- Create: `tests/e2e/security-headers.spec.ts`
- Modify: `playwright.config.ts`

**Interfaces:**
- Produces a release browser suite covering the final design acceptance criteria.

- [ ] **Step 1: Add release journey tests**

Cover at least:

```text
authenticated pair -> create recipe offline -> reconnect -> second user sees recipe
recipe -> cook -> finalize -> two ratings -> already-made derived
planner -> shopping generation -> offline checking -> sync
URL import -> review -> save
backup -> merge restore
backup -> replace-all -> safety backup verified
trash -> restore
real concurrent edit -> conflict -> resolve
```

Use deterministic local integration fixtures/services, not production user data.

- [ ] **Step 2: Add PWA update safety test**

Create pending local mutation, trigger/load a new app build/service worker version, accept update, reload and assert pending mutation/data still exist.

- [ ] **Step 3: Add deployed-header test**

Against preview/deployed Pages origin, assert CSP, no-sniff, referrer, framing and robots headers. Attempt a known disallowed external fetch/script in a controlled test and verify CSP blocks it without breaking Supabase/PowerSync connections.

- [ ] **Step 4: Expand browser projects for release**

Run critical suite on Chromium + WebKit and mobile Safari profile. Run Firefox/mobile Chrome where practical for non-iOS-specific behavior.

- [ ] **Step 5: Run suite**

```bash
pnpm build:pages
pnpm test:e2e
```

Expected: PASS for all supported configured projects; installed-iOS-only behavior remains a device gate.

- [ ] **Step 6: Commit**

```bash
git add tests/e2e playwright.config.ts
git commit -m "test: add full release browser acceptance suite"
```

---

### Task 4: Run accessibility and visual QA across final surfaces

**Files:**
- Modify source only when fixing discovered defects
- Modify: `docs/TESTING.md` with verified evidence/limitations

**Interfaces:**
- Validates the full frontend against `UX.md`/`FRONTEND.md`.

- [ ] **Step 1: Use @Build Web Apps for the primary flows**

For each of Recipes, Recipe Detail, Editor, Cooking Mode, Planner, Shopping, History, Import Review, Backup/Restore, Conflicts and Settings:
- confirm page identity;
- no blank/framework overlay;
- console errors/warnings reviewed;
- exercise the primary interaction;
- capture screenshot evidence;
- check mobile and desktop.

- [ ] **Step 2: Check dark/light themes**

Verify contrast, food-photo treatment, disabled/focus/error states and no simple color inversion defects.

- [ ] **Step 3: Check keyboard/accessibility semantics**

Every interactive control must be reachable/operable by keyboard where meaningful. Icon-only buttons have accessible names. Errors use semantic announcements. Reordering has non-drag controls.

- [ ] **Step 4: Check reduced motion**

Emulate `prefers-reduced-motion: reduce` and ensure nonessential motion is removed/reduced without hiding state changes.

- [ ] **Step 5: Fix, rerun and commit**

```bash
git add src docs/TESTING.md
git commit -m "fix: resolve final accessibility and visual QA issues"
```

Create the commit only when fixes/evidence changed files.

---

### Task 5: Run complete security review and threat-focused tests

**Files:**
- Modify affected code/tests/docs based on validated findings

**Interfaces:**
- Release blocker gate.

- [ ] **Step 1: Run standard full-repository Codex Security scan**

Review current source only. Include Auth/RLS, bootstrap/invite, sync-mutation, Storage, import SSRF, ZIP restore, account admin, diagnostics, service worker and frontend secret exposure.

- [ ] **Step 2: Triage every reported finding**

Validate source-to-sink reachability. Fix every validated critical/high finding. Fix medium findings that violate an explicit project invariant; document any accepted low residual risk with source evidence.

- [ ] **Step 3: Run focused authorization tests after fixes**

Explicitly attempt:
- cross-pair row access;
- cross-pair media access;
- third membership creation;
- bootstrap reuse;
- invite reuse/concurrent accept;
- account-admin bypass;
- sync mutation with another `pair_id`;
- restore archive attempting to create identity/membership.

Expected: all denied.

- [ ] **Step 4: Re-run security-sensitive test suites**

SQL/RLS, Edge Functions and browser security tests must PASS.

- [ ] **Step 5: Commit fixes**

```bash
git add src supabase tests docs
git commit -m "security: close release security findings"
```

---

### Task 6: Provision zero-cost production services and deploy

**Files:**
- Modify: `docs/DEPLOYMENT_OPERATIONS.md`
- Create: `docs/RELEASE_CHECKLIST.md`

**Interfaces:**
- Produces the first real production deployment on free tiers.

- [ ] **Step 1: Re-verify free plans from official provider docs**

Confirm Cloudflare Pages, Supabase and PowerSync remain US$ 0 for the selected configuration and that current quotas exceed this two-person app's expected use. If a selected service has become paid-only, choose the best current free compatible alternative before provisioning.

- [ ] **Step 2: Create/link Supabase Free project**

Apply migrations/functions/Storage policies through Supabase tooling. Configure only server-side secrets in Supabase secret storage. Configure Auth site URL and allowed redirect origins to the actual Pages production/preview origins required by login verification/recovery.

- [ ] **Step 3: Create PowerSync Cloud Free instance**

Connect it to the Supabase Postgres source, deploy Sync Streams/Rules that only sync rows for the authenticated user's pair, and validate JWT/Auth integration. Do not sync all pairs globally even though the product currently has one pair.

- [ ] **Step 4: Create Cloudflare Pages Free project**

Connect GitHub `main`. Configure:
- build command: `pnpm build:pages`;
- output: `dist`;
- Node version pinned from `.node-version`;
- pnpm version matching package manager pin;
- only the public client environment variables required by the browser.

Do not create Pages Functions for the static app.

- [ ] **Step 5: Deploy and run smoke tests on the production origin**

Check deep-link fallback, PWA manifest/service worker, headers, login, Supabase/PowerSync connectivity and one offline edit/reconnect.

- [ ] **Step 6: Verify dashboards show free-tier configuration**

Record plan names and current quota snapshots in `docs/DEPLOYMENT_OPERATIONS.md`; never store billing credentials or secrets.

- [ ] **Step 7: Commit operations docs**

```bash
git add docs/DEPLOYMENT_OPERATIONS.md docs/RELEASE_CHECKLIST.md
git commit -m "docs: record zero-cost production deployment"
```

---

### Task 7: Create inactivity and data-preservation runbooks

**Files:**
- Create: `docs/runbooks/supabase-resume.md`
- Create: `docs/runbooks/powersync-redeploy.md`
- Create: `docs/runbooks/incident-data-preservation.md`
- Modify: `docs/DEPLOYMENT_OPERATIONS.md`

**Interfaces:**
- Produces exact operator procedures for free-tier interruptions.

- [ ] **Step 1: Write Supabase pause/resume runbook**

Include symptoms, Dashboard resume steps, verification query, Auth/Storage check, PowerSync source reconnection check and client queue-drain verification. State the current documented restore window and require re-verification if provider policy changes.

- [ ] **Step 2: Write PowerSync deprovision/redeploy runbook**

Include symptoms, redeploy Sync Streams/Rules from the version-controlled config, reprocessing expectation, client re-sync behavior and verification that local pending mutations remain preserved while the instance is unavailable.

- [ ] **Step 3: Write local-data incident runbook**

Before clearing browser data/reinstalling PWA/resetting a device:
1. inspect sync/upload queue;
2. export diagnostics;
3. protect/export any only-local media/data if possible;
4. restore backend service;
5. wait for queue drain;
6. only then clear local state if still necessary.

- [ ] **Step 4: Commit**

```bash
git add docs/runbooks docs/DEPLOYMENT_OPERATIONS.md
git commit -m "docs: add free-tier recovery runbooks"
```

---

### Task 8: Perform backup/restore disaster-recovery drill

**Files:**
- Create: `docs/runbooks/backup-restore-drill.md`
- Modify code/tests only if drill exposes defects

**Interfaces:**
- Proves portability and recovery before release acceptance.

- [ ] **Step 1: Seed representative non-production test data**

Include recipes, categories, fractions, conversion override, photos, cooking history/ratings, planner, multiple shopping lists, soft deletes and at least one resolved/open conflict if supported by backup format.

- [ ] **Step 2: Export and validate backup**

Keep checksum/manifest evidence; verify no secrets/auth sessions are present.

- [ ] **Step 3: Perform merge restore drill**

Create deliberate divergence, restore merge, verify safe inserts/no-ops and expected conflicts.

- [ ] **Step 4: Perform replace-all drill**

Verify automatic safety backup is generated and valid first, then replace. Use the safety backup to restore the pre-replace state.

- [ ] **Step 5: Record measured outcomes**

Document archive size, runtime, any free-tier/runtime constraints encountered and exact successful recovery steps. Do not include personal production content.

- [ ] **Step 6: Fix defects, rerun and commit**

```bash
git add docs/runbooks/backup-restore-drill.md src supabase tests
git commit -m "test: complete backup and restore recovery drill"
```

---

### Task 9: Perform real-device iOS PWA gate when a device is available

**Files:**
- Modify: `docs/TESTING.md`
- Modify code only for verified defects

**Interfaces:**
- Validates the platform the design prioritizes without requiring a Mac or App Store.

- [ ] **Step 1: Install from Safari to Home Screen**

Verify standalone launch, app icon/name, safe areas and deep-link behavior.

- [ ] **Step 2: Test cooking mode and timers**

Test screen awake request where supported, foreground timers, app switch/background behavior and limitation copy. Record actual iOS behavior rather than inferring from desktop WebKit.

- [ ] **Step 3: Test media and offline**

Take/select photo, interrupt upload, recover/retry, mark recipe available offline, disconnect network and reopen installed PWA.

- [ ] **Step 4: Test update lifecycle**

Deploy a harmless new version, reopen app, accept update and verify local pending state remains.

- [ ] **Step 5: Record results**

If a real device is unavailable in the execution environment, mark this exact gate as not executed and do not block code-resolvable work. Do not claim desktop WebKit substitutes for it.

- [ ] **Step 6: Commit verified fixes/notes**

```bash
git add docs/TESTING.md src
git commit -m "test: record iOS PWA device verification"
```

Only create the commit when files changed.

---

### Task 10: Final acceptance and release checkpoint

**Files:**
- Modify: `docs/RELEASE_CHECKLIST.md`
- Modify: `README.md` with final run/deploy status

**Interfaces:**
- Final completion gate for the full roadmap.

- [ ] **Step 1: Run complete local verification**

```bash
pnpm verify
pnpm test:e2e
pnpm build:pages
```

Run all Supabase SQL/Edge Function tests and any PowerSync integration tests available.

- [ ] **Step 2: Verify all final design acceptance criteria**

Check every numbered criterion in `docs/superpowers/specs/2026-08-07-receitas-design.md` section 31 and link each to a passing automated/manual gate in `docs/RELEASE_CHECKLIST.md`.

- [ ] **Step 3: Verify zero-cost status**

Cloudflare Pages, Supabase and PowerSync dashboards/configuration must all remain on Free plans. No required custom domain, paid API, paid monitoring or paid CI is allowed.

- [ ] **Step 4: Verify documentation consistency**

Search for stale architecture names, old file references, superseded behavior and unresolved implementation notes. Update docs to match the actual shipped code.

- [ ] **Step 5: Use superpowers:verification-before-completion**

Before claiming completion, execute the required verification workflow and base the completion statement on current command output/evidence.

- [ ] **Step 6: Final commit**

```bash
git add README.md docs src supabase tests package.json pnpm-lock.yaml public scripts
git commit -m "release: complete Receitas personal PWA"
git push
```

- [ ] **Step 7: Mark every roadmap plan complete**

Do not call the product complete if a required acceptance criterion is unverified; record environmental/manual-only gates explicitly rather than silently skipping them.
