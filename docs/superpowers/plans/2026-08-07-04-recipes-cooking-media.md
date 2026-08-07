# Recipes Cooking and Media Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the core daily-use experience: recipe CRUD, structured ingredients/steps/categories, serving scaling and culinary conversion, preparation history/ratings, resumable cooking mode with local timers, private photos and synchronized trash.

**Architecture:** Domain logic is pure/testable TypeScript on top of repository interfaces from plan 03. UI writes to the local PowerSync database immediately. Cooking-in-progress and active timers are device-local state; only finalized cooking sessions enter shared history. Media uses a durable local attachment queue with Supabase private Storage as remote canonical media.

**Tech Stack:** React, TypeScript, PowerSync repositories, Supabase Storage, PowerSync attachments when compatible with current SDK, Vitest, Testing Library, Playwright.

## Global Constraints

- Recipe definition is separate from each cooking execution.
- “Já fizemos” is derived from valid cooking history; “Queremos fazer” and “Favorito” are manual.
- Ingredients and steps are stable-ID ordered entities, never position-as-identity.
- Scaling never mutates the source recipe.
- Mass↔volume conversion requires ingredient-specific profile; unknown conversion is never invented.
- Each person rates a cooking session independently on 0–10 in 0.5 increments.
- Opening cooking mode never creates history.
- Timers are local to a device and honestly communicate iOS/background limits.
- Newly selected media remains locally protected until remote upload is confirmed.
- “Disponibilizar offline” is a per-device recipe preference.
- Important deletes use recoverable soft delete.

---

## File map

```text
src/features/recipes/domain/types.ts
src/features/recipes/domain/amount.ts
src/features/recipes/domain/scaling.ts
src/features/recipes/domain/conversions.ts
src/features/recipes/domain/default-conversion-profiles.ts
src/features/recipes/data/recipe-repository.ts
src/features/recipes/data/category-repository.ts
src/features/recipes/components/RecipeEditor.tsx
src/features/recipes/components/IngredientEditor.tsx
src/features/recipes/components/StepEditor.tsx
src/features/recipes/components/RecipeDetail.tsx
src/features/recipes/components/ServingControl.tsx
src/features/recipes/components/UnitConversionControl.tsx
src/features/cooking/domain/cooking-session.ts
src/features/cooking/domain/timer.ts
src/features/cooking/data/cooking-repository.ts
src/features/cooking/data/cooking-draft-store.ts
src/features/cooking/components/CookingMode.tsx
src/features/cooking/components/TimerTray.tsx
src/features/cooking/components/FinishCooking.tsx
src/features/cooking/components/CookingHistory.tsx
src/features/media/attachments.ts
src/features/media/supabase-storage-adapter.ts
src/features/media/offline-media.ts
src/features/media/components/PhotoPicker.tsx
src/features/media/components/PhotoGallery.tsx
src/features/media/components/OfflineAvailability.tsx
src/features/trash/trash-repository.ts
src/features/trash/TrashScreen.tsx
tests/e2e/recipe-flow.spec.ts
tests/e2e/cooking-flow.spec.ts
tests/e2e/media-offline.spec.ts
```

## Stable domain contracts

`Rational` is exact within the project's invariant: numerator and denominator are finite JavaScript safe integers, denominator is positive, and every value is reduced by GCD. This is more than sufficient for culinary quantities while remaining natively JSON/SQLite/Postgres transportable.

```ts
export type Rational = { numerator: number; denominator: number }

export type IngredientAmount =
  | { kind: 'numeric'; value: Rational }
  | { kind: 'text'; text: string }
  | { kind: 'none' }

export interface RecipeIngredient {
  id: string
  recipeId: string
  position: number
  amount: IngredientAmount
  unit: string | null
  name: string
  normalizedName: string
  note: string | null
}

export interface RecipeStep {
  id: string
  recipeId: string
  position: number
  instruction: string
  durationSeconds: number | null
  note: string | null
}

export interface ConversionProfile {
  ingredientKey: string
  gramsPerMilliliter: number
  source: 'default' | 'pair_override'
}

export interface PersistedIngredientAmount {
  quantityNum: number | null
  quantityDen: number | null
  quantityText: string | null
}
```

Persistence maps numeric amounts to exact integer numerator/denominator columns; human expressions such as “a gosto” use the text column. Every amount entering a mutation envelope is therefore JSON-safe without losing fractional exactness.

---

### Task 1: Implement exact ingredient amounts, persistence mapping and serving scaling

**Files:**
- Create: `src/features/recipes/domain/types.ts`
- Create: `src/features/recipes/domain/amount.ts`
- Create: `src/features/recipes/domain/amount.test.ts`
- Create: `src/features/recipes/domain/scaling.ts`
- Create: `src/features/recipes/domain/scaling.test.ts`
- Verify/Modify: `supabase/migrations/0002_recipe_domain.sql`
- Modify: `src/data/schema.ts`

**Interfaces:**
- Produces `normalizeRational`, `parseAmount`, `formatAmount`, `serializeIngredientAmount`, `deserializeIngredientAmount`, `multiplyRational`, `scaleIngredient`, `scaleRecipeIngredients`.

- [ ] **Step 1: Write failing rational/format tests**

Cover:

```ts
expect(parseAmount('1/2')).toEqual({ kind: 'numeric', value: { numerator: 1, denominator: 2 } })
expect(parseAmount('1 1/2')).toEqual({ kind: 'numeric', value: { numerator: 3, denominator: 2 } })
expect(parseAmount('a gosto')).toEqual({ kind: 'text', text: 'a gosto' })
expect(formatAmount({ kind: 'numeric', value: { numerator: 3, denominator: 2 } })).toBe('1 1/2')
```

Also test denominator normalization, zero denominator rejection, `Number.isSafeInteger` enforcement and decimal input such as `0,5` in pt-BR.

- [ ] **Step 2: Verify RED**

Run the exact Vitest files.

- [ ] **Step 3: Implement exact rational helpers**

`normalizeRational` rejects non-safe-integers and denominator zero, forces a positive denominator and reduces by integer GCD. Decimal parsing converts the decimal string to an exact power-of-ten fraction before reduction; it never relies on a floating-point multiplication to create the canonical fraction.

- [ ] **Step 4: Write failing persistence mapping tests**

```ts
expect(serializeIngredientAmount({
  kind: 'numeric',
  value: { numerator: 3, denominator: 2 },
})).toEqual({ quantityNum: 3, quantityDen: 2, quantityText: null })

expect(deserializeIngredientAmount({
  quantityNum: null,
  quantityDen: null,
  quantityText: 'a gosto',
})).toEqual({ kind: 'text', text: 'a gosto' })
```

Reject invalid rows such as numerator without denominator or both numeric and text quantity simultaneously.

- [ ] **Step 5: Implement persistence mapping**

`serializeIngredientAmount` and `deserializeIngredientAmount` are the only boundary helpers used by repositories when moving between domain amounts and database/mutation payload columns.

- [ ] **Step 6: Write failing scaling tests**

Cover 0.5x, 1.5x, 2x, target servings and text quantities remaining unchanged.

- [ ] **Step 7: Implement scaling as pure derivation**

```ts
export function scaleIngredient(item: RecipeIngredient, multiplier: Rational): RecipeIngredient {
  if (item.amount.kind !== 'numeric') return item
  return {
    ...item,
    amount: { kind: 'numeric', value: multiplyRational(item.amount.value, multiplier) },
  }
}
```

Do not persist scaled values merely because the user changes the serving selector.

- [ ] **Step 8: Align persistence columns**

Ensure recipe ingredient schema contains nullable `quantity_num bigint`, `quantity_den bigint`, `quantity_text text` with checks that numeric numerator/denominator are both present together, denominator > 0, and numeric and text representations are mutually exclusive. Mirror these fields in PowerSync schema.

- [ ] **Step 9: Run gates and commit**

```bash
pnpm vitest run src/features/recipes/domain/amount.test.ts src/features/recipes/domain/scaling.test.ts
pnpm typecheck
git add src/features/recipes/domain src/data/schema.ts supabase/migrations/0002_recipe_domain.sql
git commit -m "feat: add exact recipe quantities and serving scaling"
```

---

### Task 2: Implement ingredient-specific culinary conversions

**Files:**
- Create: `src/features/recipes/domain/conversions.ts`
- Create: `src/features/recipes/domain/conversions.test.ts`
- Create: `src/features/recipes/domain/default-conversion-profiles.ts`
- Create: `src/features/recipes/data/conversion-profile-repository.ts`

**Interfaces:**
- Produces `convertAmount(input): ConversionResult` with explicit exact/approximate/unavailable state.

```ts
export type ConversionResult =
  | { status: 'converted'; amount: IngredientAmount; approximate: boolean }
  | { status: 'unavailable'; reason: 'unknown_ingredient_profile' | 'incompatible_units' | 'non_numeric_amount' }
```

- [ ] **Step 1: Write failing direct unit conversion tests**

Test mL↔L, tsp↔tbsp↔cup using one documented culinary unit system. Store rational factors exactly where possible.

- [ ] **Step 2: Write failing density conversion tests**

Test that pair override wins over default profile and unknown ingredient returns `unavailable` rather than guessing.

- [ ] **Step 3: Implement conversion engine**

Separate:
- volume↔volume exact factor conversions;
- mass↔mass exact metric conversions;
- mass↔volume conversions requiring `gramsPerMilliliter` profile.

Mark density conversions approximate.

- [ ] **Step 4: Seed only a small curated default profile map**

Include only common ingredients whose values are intentionally documented in code with source notes. Do not create a giant universal ingredient catalog. Pair overrides persist in `ingredient_conversion_profiles` and are synchronized.

- [ ] **Step 5: Run tests and commit**

```bash
pnpm vitest run src/features/recipes/domain/conversions.test.ts
git add src/features/recipes/domain src/features/recipes/data/conversion-profile-repository.ts
git commit -m "feat: add conservative culinary unit conversions"
```

---

### Task 3: Implement recipe/category repositories and soft-delete lifecycle

**Files:**
- Create: `src/features/recipes/data/recipe-repository.ts`
- Create: `src/features/recipes/data/recipe-repository.test.ts`
- Create: `src/features/recipes/data/category-repository.ts`
- Create: `src/features/recipes/data/category-repository.test.ts`
- Create: `src/features/trash/trash-repository.ts`
- Create: `src/features/trash/trash-repository.test.ts`

**Interfaces:**
- Produces `RecipeRepository`, `CategoryRepository`, `TrashRepository` with local-first writes through `writeLocalMutation`.

- [ ] **Step 1: Write failing recipe repository tests**

Cover create/edit, stable child IDs, reorder without ID replacement, manual `favorite`/`want_to_make`, derived `already_made` excluded from persisted recipe state, exact amount serialization through `serializeIngredientAmount`, and local soft delete.

- [ ] **Step 2: Implement recipe aggregate writes**

Create/edit operations update parent and child entities using stable UUIDs and versioned mutation envelopes. Reordering updates only position fields for existing IDs. Ingredient domain amounts always cross the persistence boundary through the Task-1 serializer so mutation payloads remain JSON-safe.

- [ ] **Step 3: Write category tests then implement**

Support create/rename/delete, many-to-many assignment and multiple simultaneous categories. Deleting a category removes/restores category links according to soft-delete policy but never deletes recipes.

- [ ] **Step 4: Implement trash operations**

Exact methods:

```ts
softDelete(entityType, entityId): Promise<void>
restore(entityType, entityId): Promise<void>
listTrash(): Promise<TrashEntry[]>
permanentlyDelete(entityType, entityId): Promise<void>
```

Permanent delete remains an explicit privileged flow where required; no automatic expiry.

- [ ] **Step 5: Run repository tests and commit**

```bash
pnpm vitest run src/features/recipes/data src/features/trash
git add src/features/recipes/data src/features/trash
git commit -m "feat: add local-first recipe category and trash repositories"
```

---

### Task 4: Build recipe editor and recipe detail UI

**Files:**
- Create: `src/features/recipes/components/RecipeEditor.tsx`
- Create: `src/features/recipes/components/IngredientEditor.tsx`
- Create: `src/features/recipes/components/StepEditor.tsx`
- Create: `src/features/recipes/components/RecipeDetail.tsx`
- Create: `src/features/recipes/components/ServingControl.tsx`
- Create: `src/features/recipes/components/UnitConversionControl.tsx`
- Create: corresponding component tests
- Modify: `src/app/routes/RecipesRoute.tsx`

**Interfaces:**
- Consumes recipe/category/conversion repositories.
- Produces create/edit/read recipe flows.

- [ ] **Step 1: Write interaction tests before UI**

Test add/remove/reorder ingredient, add/remove/reorder step, fraction entry, optional duration, categories, favorite/want-to-make, serving scaling and temporary unit conversion.

- [ ] **Step 2: Implement editor with accessible native controls**

Use semantic labels and real buttons. Reordering must have keyboard-accessible controls even if drag-and-drop is later added. Do not make drag the only interaction.

- [ ] **Step 3: Implement recipe detail hierarchy**

Order: photo/identity → servings/scaling/conversion → ingredients → preparation → history/photos → secondary actions. Avoid dashboard cards.

- [ ] **Step 4: Use @Supericons for recipe/editor actions**

Select/review one family and use accessible labels for non-obvious icon-only buttons. Reject metaphorically incorrect recommendations.

- [ ] **Step 5: Rendered QA with @Build Web Apps**

Check iPhone-sized viewport, desktop, long ingredient names, multiline steps, dark theme, focus-visible and virtual keyboard behavior where testable.

- [ ] **Step 6: Commit**

```bash
git add src/features/recipes/components src/app/routes/RecipesRoute.tsx
git commit -m "feat: add structured recipe editor and detail view"
```

---

### Task 5: Implement cooking session history and individual ratings

**Files:**
- Create: `src/features/cooking/domain/cooking-session.ts`
- Create: `src/features/cooking/domain/cooking-session.test.ts`
- Create: `src/features/cooking/data/cooking-repository.ts`
- Create: `src/features/cooking/data/cooking-repository.test.ts`
- Create: `src/features/cooking/components/CookingHistory.tsx`
- Create: `src/features/cooking/components/FinishCooking.tsx`
- Create: component tests

**Interfaces:**
- Produces `finalizeCookingDraft`, `rateCookingSession`, history aggregates.

- [ ] **Step 1: Write failing domain tests**

Cover:
- score must be 0–10 in 0.5 increments;
- at most one active rating per user/session;
- missing rating is excluded from averages, never treated as zero;
- shared observation is separate from personal rating comments;
- recipe snapshot remains unchanged after later recipe edit.

- [ ] **Step 2: Align DB constraints**

Ensure Postgres rating check enforces half-point increments and unique user/session rating. Mirror relevant local columns.

- [ ] **Step 3: Implement repository methods**

```ts
createCookingSession(input): Promise<CookingSessionId>
setMyRating(sessionId, score, comment): Promise<void>
setSharedObservation(sessionId, text): Promise<void>
listRecipeHistory(recipeId): Promise<CookingSessionSummary[]>
```

- [ ] **Step 4: Implement history UI**

Show date, session photos, each person's rating/comment separately, shared observation separately, and derived aggregates without hiding source ratings.

- [ ] **Step 5: Run tests/QA and commit**

```bash
pnpm vitest run src/features/cooking
git add src/features/cooking supabase/migrations/0002_recipe_domain.sql src/data/schema.ts
git commit -m "feat: add cooking history and individual ratings"
```

---

### Task 6: Implement resumable device-local cooking mode and timers

**Files:**
- Create: `src/features/cooking/data/cooking-draft-store.ts`
- Create: `src/features/cooking/data/cooking-draft-store.test.ts`
- Create: `src/features/cooking/domain/timer.ts`
- Create: `src/features/cooking/domain/timer.test.ts`
- Create: `src/features/cooking/components/CookingMode.tsx`
- Create: `src/features/cooking/components/TimerTray.tsx`
- Create: component tests

**Interfaces:**
- Produces device-local `CookingDraft` and `CookingTimer` models.

```ts
export interface CookingTimer {
  id: string
  recipeId: string
  stepId: string | null
  label: string
  deadlineAt: string
  pausedRemainingMs: number | null
  state: 'running' | 'paused' | 'finished' | 'cancelled'
}
```

- [ ] **Step 1: Write failing draft lifecycle tests**

Opening mode does not create a cooking session. Draft survives reload. “Encerrar sem registrar” deletes only draft/timer state. “Finalizar preparo” creates exactly one session even if submit is retried.

- [ ] **Step 2: Implement local draft persistence**

Store draft in local-only PowerSync table keyed by user/device/recipe draft ID. Do not sync active cooking position or active timers.

- [ ] **Step 3: Write timer state-machine tests**

Test start/pause/resume/adjust/cancel, multiple timers and recovery by `deadlineAt` after reload. Never rely on decrementing an in-memory counter as source of truth.

- [ ] **Step 4: Implement timer engine**

Use current timestamp to derive remaining time. Browser notifications are optional capability enhancement; visible/sound in-app completion remains supported.

- [ ] **Step 5: Implement cooking UI**

Large controls, high legibility, ingredients accessible, sequential steps, multiple-timer tray, “Finalizar preparo” and “Encerrar sem registrar”. Attempt Screen Wake Lock only when supported and gracefully degrade.

- [ ] **Step 6: Add explicit iOS/background limitation copy**

When notification/background reliability cannot be guaranteed, show concise factual guidance; never promise the timer will alert if the platform may suspend execution.

- [ ] **Step 7: Rendered/browser QA**

Use @Build Web Apps and Playwright reload tests. Test at least two simultaneous timers and draft resume.

- [ ] **Step 8: Commit**

```bash
git add src/features/cooking/data src/features/cooking/domain/timer* src/features/cooking/components
git commit -m "feat: add resumable cooking mode and local timers"
```

---

### Task 7: Implement durable private media upload/download queue

**Files:**
- Create: `src/features/media/attachments.ts`
- Create: `src/features/media/attachments.test.ts`
- Create: `src/features/media/supabase-storage-adapter.ts`
- Create: `src/features/media/supabase-storage-adapter.test.ts`
- Create: `src/features/media/components/PhotoPicker.tsx`
- Create: `src/features/media/components/PhotoGallery.tsx`
- Create: component tests
- Modify: `src/data/schema.ts`

**Interfaces:**
- Produces media actions `saveLocalPhoto`, `retryUpload`, `getPrivatePhotoUrl`, `deletePhoto`.

- [ ] **Step 1: Consult @Context7 for current PowerSync attachment queue API**

Prefer official `@powersync/attachments`/attachment queue support if stable for Web. If unsupported in the current SDK, implement the same durable queue semantics in local-only tables without weakening requirements.

- [ ] **Step 2: Write failing queue tests**

Cover:
- photo is locally durable before upload starts;
- metadata update and local attachment record are atomic where supported;
- failed upload retains only local copy and retry state;
- confirmed upload permits cache eviction but does not require it;
- cross-pair object paths are never generated;
- delete is not considered complete until remote/local semantics are reconciled.

- [ ] **Step 3: Implement Supabase private Storage adapter**

Generate object path from authenticated pair/domain IDs, not user-provided arbitrary path. Upload using current Supabase Storage API. Retrieve through authenticated download/signed URL mechanism appropriate to private buckets.

- [ ] **Step 4: Implement photo components**

Show immediate local preview. Show upload pending/error state without blocking recipe/session save. Retry is explicit and safe.

- [ ] **Step 5: Add image input validation**

Accept configured image MIME types only, reject unreasonable file sizes before expensive work, optionally compress/resize client-side without destroying the original before a valid local copy exists.

- [ ] **Step 6: Run unit/rendered tests and commit**

```bash
pnpm vitest run src/features/media
git add src/features/media src/data/schema.ts package.json pnpm-lock.yaml
git commit -m "feat: add durable private photo queue"
```

---

### Task 8: Implement per-device “Disponibilizar offline” media retention

**Files:**
- Create: `src/features/media/offline-media.ts`
- Create: `src/features/media/offline-media.test.ts`
- Create: `src/features/media/components/OfflineAvailability.tsx`
- Create: component tests
- Create: `tests/e2e/media-offline.spec.ts`

**Interfaces:**
- Produces `makeRecipeAvailableOffline`, `removeOfflinePreference`, `getOfflineMediaState`.

- [ ] **Step 1: Write failing retention tests**

Test statuses: `not_requested`, `downloading`, `available`, `partial`, `error`. Preference is local to the device.

- [ ] **Step 2: Implement download set calculation**

Include recipe structured data plus cover/gallery originals required by the documented policy. History media is included only when the product specification calls for that recipe's complete offline set; record exact behavior in `docs/MEDIA_STORAGE.md`.

- [ ] **Step 3: Implement safe cache eviction policy**

Priority order:
1. never evict unsynced only-local files;
2. retain explicitly offline-requested files as strongly as browser storage permits;
3. prefer recent covers/thumbnails;
4. evict remotely confirmed non-pinned originals first.

Browser eviction can still occur outside app control; surface that limitation honestly.

- [ ] **Step 4: Add offline E2E**

Load/pin recipe online, switch browser context offline, reload and verify structured recipe + selected media render from local storage.

- [ ] **Step 5: Commit**

```bash
git add src/features/media/offline-media* src/features/media/components/OfflineAvailability* tests/e2e/media-offline.spec.ts docs/MEDIA_STORAGE.md
git commit -m "feat: add per-device recipe offline availability"
```

---

### Task 9: Core recipe/cooking end-to-end acceptance

**Files:**
- Create: `tests/e2e/recipe-flow.spec.ts`
- Create: `tests/e2e/cooking-flow.spec.ts`
- Modify: `docs/TESTING.md` for verified platform notes only

**Interfaces:**
- Verifies all core feature contracts before planner/shopping work begins.

- [ ] **Step 1: Add complete recipe lifecycle E2E**

Flow: create recipe → fractions/ingredients/steps/categories → favorite/want-to-make → scale servings → temporary conversion → edit → reload → data persists.

- [ ] **Step 2: Add cooking lifecycle E2E**

Flow: start cooking → mark progress → start two timers → reload → resume → finalize → add two independent ratings via separate user fixtures → history derives “Já fizemos”.

- [ ] **Step 3: Add media safety E2E**

Simulate upload failure; recipe/session still saves and photo remains local/pending; reconnect/retry succeeds and gallery transitions to synced.

- [ ] **Step 4: Run cross-browser gates**

At minimum Chromium + WebKit/mobile Safari profile for critical flows. Real installed-iOS limitations remain a separate device gate.

- [ ] **Step 5: Run @Build Web Apps QA**

Check recipe detail/editor/cooking mode in light+dark, mobile+desktop, console health and one full interaction path.

- [ ] **Step 6: Commit**

```bash
git add tests/e2e docs/TESTING.md
git commit -m "test: cover recipe cooking and media journeys"
```

---

### Task 10: Core domain hardening checkpoint

**Files:**
- Modify documentation only for verified implementation details

- [ ] **Step 1: Run all available gates**

```bash
pnpm typecheck
pnpm test:run
pnpm build
pnpm test:e2e:smoke
```

Run relevant Supabase/Storage tests.

- [ ] **Step 2: Search for bypass writes**

No recipe/history/media metadata edit may bypass repository + versioned local mutation path.

- [ ] **Step 3: Run Codex Security on media and soft-delete boundaries**

Focus on object path authorization, MIME/path manipulation, signed/private URL handling, permanent deletion and client-secret exposure.

- [ ] **Step 4: Fix findings and commit**

```bash
git add src supabase tests docs
git commit -m "test: harden core recipe and media domain"
```

- [ ] **Step 5: Mark plan complete before plan 05**
