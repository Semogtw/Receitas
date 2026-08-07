# Planning Shopping and Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement shared meal planning, multiple named shopping lists, conservative ingredient consolidation, recipe-to-shopping generation and fully local recipe search/filter/sort.

**Architecture:** Planner and shopping entities are synchronized domain data written through the repositories from plan 03. Shopping generation is deterministic pure domain logic that first applies serving scaling, then compatible unit normalization/consolidation. Search runs entirely against local data; any local index is disposable and rebuildable.

**Tech Stack:** React, TypeScript, PowerSync local repositories, Vitest, Testing Library, Playwright.

## Global Constraints

- Planner is shared but sends no meal reminders/notifications.
- Meal periods are user-created, not fixed enum values.
- Multiple named shopping lists are supported; at most one shared default list.
- Shopping works offline and both users can check/uncheck/edit items.
- Consolidation never invents mass↔volume equivalence.
- Recipe serving scaling happens before shopping consolidation.
- Search works offline over locally available data.
- Filters combine categories, Favoritos, Queremos fazer and Já fizemos.
- Sorts include recent, name, most prepared and best rated.
- Missing ratings are not interpreted as zero.

---

## File map

```text
src/features/planner/domain/types.ts
src/features/planner/data/planner-repository.ts
src/features/planner/components/PlannerView.tsx
src/features/planner/components/MealPeriodSettings.tsx
src/features/planner/components/MealPlanEditor.tsx
src/features/shopping/domain/types.ts
src/features/shopping/domain/consolidation.ts
src/features/shopping/domain/generate-items.ts
src/features/shopping/data/shopping-repository.ts
src/features/shopping/components/ShoppingLists.tsx
src/features/shopping/components/ShoppingListDetail.tsx
src/features/shopping/components/AddRecipesToShopping.tsx
src/features/search/domain/search.ts
src/features/search/data/search-index.ts
src/features/search/components/RecipeSearch.tsx
src/features/search/components/RecipeFilters.tsx
src/features/search/components/RecipeSort.tsx
tests/e2e/planner-shopping.spec.ts
tests/e2e/search.spec.ts
```

## Stable contracts

`Rational` and `IngredientAmount` are imported from the recipe domain created in plan 04.

```ts
export interface MealPeriod {
  id: string
  pairId: string
  name: string
  position: number
  revision: number
  deletedAt: string | null
}

export interface MealPlanEntryInput {
  recipeId: string
  date: string
  mealPeriodId: string
  time: string | null
  servings: Rational | null
  note: string | null
}

export interface MealPlanEntry extends MealPlanEntryInput {
  id: string
  pairId: string
  revision: number
  deletedAt: string | null
}

export interface ShoppingSource {
  kind: 'manual' | 'recipe' | 'planner'
  recipeId?: string
  mealPlanEntryId?: string
}

export interface ShoppingItemDraft {
  name: string
  normalizedName: string
  amount: IngredientAmount
  unit: string | null
  source: ShoppingSource
}

export interface ShoppingList {
  id: string
  pairId: string
  name: string
  isDefault: boolean
  revision: number
  deletedAt: string | null
}

export interface ShoppingItem extends ShoppingItemDraft {
  id: string
  listId: string
  pairId: string
  purchased: boolean
  revision: number
  deletedAt: string | null
}

export type ShoppingItemPatch = Partial<
  Pick<ShoppingItem, 'name' | 'normalizedName' | 'amount' | 'unit' | 'purchased'>
>

export interface RecipeSearchQuery {
  text: string
  categoryIds: string[]
  favorite: boolean | null
  wantToMake: boolean | null
  alreadyMade: boolean | null
  sort: 'recent' | 'name' | 'most_prepared' | 'best_rated'
}

export interface RecipeSearchResult {
  recipeId: string
  title: string
  coverPhotoId: string | null
  favorite: boolean
  wantToMake: boolean
  alreadyMade: boolean
  preparationCount: number
  averageRating: number | null
  updatedAt: string
}
```

---

### Task 1: Implement meal periods and planner repository

**Files:**
- Create: `src/features/planner/domain/types.ts`
- Create: `src/features/planner/data/planner-repository.ts`
- Create: `src/features/planner/data/planner-repository.test.ts`
- Verify: `supabase/migrations/0003_planning_domain.sql`
- Verify: `src/data/schema.ts`

**Interfaces:**
- Produces `PlannerRepository` methods for custom periods and dated meal entries.

- [ ] **Step 1: Write failing planner repository tests**

Cover create/rename/reorder meal periods, create/edit/delete/restore meal-plan entry, recipe/date/period/time/servings/note persistence, immediate offline visibility and versioned mutation writes.

- [ ] **Step 2: Implement repository methods**

```ts
listMealPeriods(): Promise<MealPeriod[]>
createMealPeriod(name: string): Promise<string>
renameMealPeriod(id: string, name: string): Promise<void>
reorderMealPeriods(ids: string[]): Promise<void>
listEntries(range: { start: string; end: string }): Promise<MealPlanEntry[]>
upsertEntry(input: MealPlanEntryInput & { id?: string }): Promise<string>
softDeleteEntry(id: string): Promise<void>
```

- [ ] **Step 3: Align date semantics**

Persist planner date as date-only value rather than deriving it from UTC timestamp. Optional time is separate local-time data. Timezone conversion must not shift a planned meal to another day.

- [ ] **Step 4: Run tests and commit**

```bash
pnpm vitest run src/features/planner/data/planner-repository.test.ts
git add src/features/planner supabase/migrations/0003_planning_domain.sql src/data/schema.ts
git commit -m "feat: add shared meal planner repository"
```

---

### Task 2: Build meal planner UI with custom periods

**Files:**
- Create: `src/features/planner/components/PlannerView.tsx`
- Create: `src/features/planner/components/MealPeriodSettings.tsx`
- Create: `src/features/planner/components/MealPlanEditor.tsx`
- Create: component tests
- Modify: `src/app/routes/PlannerRoute.tsx`

- [ ] **Step 1: Write interaction tests**

Test selecting date, adding recipe, choosing period, adjusting servings, editing/removing entry and editing custom meal periods.

- [ ] **Step 2: Implement mobile-first planner**

Use a meal agenda/list/calendar hybrid that remains readable on narrow screens. It should look like a meal planner, not a corporate scheduling calendar.

- [ ] **Step 3: Enforce visual-only planner behavior**

Do not request notification permission, register meal reminder jobs or add notification toggles.

- [ ] **Step 4: Use @Supericons where planner actions need icons**

Maintain the main icon family selected in plan 01.

- [ ] **Step 5: Rendered QA with @Build Web Apps**

Check dense week/day data, long recipe titles, empty state, dark theme and touch interactions.

- [ ] **Step 6: Commit**

```bash
git add src/features/planner/components src/app/routes/PlannerRoute.tsx
git commit -m "feat: add shared visual meal planner"
```

---

### Task 3: Implement shopping-list repository and default-list invariant

**Files:**
- Create: `src/features/shopping/domain/types.ts`
- Create: `src/features/shopping/data/shopping-repository.ts`
- Create: `src/features/shopping/data/shopping-repository.test.ts`
- Verify: `supabase/migrations/0003_planning_domain.sql`

**Interfaces:**
- Produces `ShoppingRepository` with multiple named lists and zero-or-one default list.

- [ ] **Step 1: Write failing repository tests**

Cover multiple named lists, atomic default switching, manual item add/edit/remove/check/uncheck, generated source metadata, conflict-safe writes and isolated soft deletion.

- [ ] **Step 2: Implement repository**

```ts
listShoppingLists(): Promise<ShoppingList[]>
createShoppingList(name: string, makeDefault?: boolean): Promise<string>
setDefaultList(id: string): Promise<void>
addItem(listId: string, item: ShoppingItemDraft): Promise<string>
updateItem(id: string, patch: ShoppingItemPatch): Promise<void>
setPurchased(id: string, purchased: boolean): Promise<void>
softDeleteItem(id: string): Promise<void>
```

- [ ] **Step 3: Verify server invariant**

The partial unique index from plan 02 enforces at most one active default list per pair under concurrent writes.

- [ ] **Step 4: Run tests and commit**

```bash
pnpm vitest run src/features/shopping/data/shopping-repository.test.ts
git add src/features/shopping/data supabase/migrations/0003_planning_domain.sql
git commit -m "feat: add multiple shared shopping lists"
```

---

### Task 4: Implement deterministic shopping generation and consolidation

**Files:**
- Create: `src/features/shopping/domain/generate-items.ts`
- Create: `src/features/shopping/domain/generate-items.test.ts`
- Create: `src/features/shopping/domain/consolidation.ts`
- Create: `src/features/shopping/domain/consolidation.test.ts`

**Interfaces:**
- Produces `generateShoppingItems` and `consolidateShoppingItems`.

- [ ] **Step 1: Write failing recipe-generation tests**

Test one/multiple recipes, requested servings, planner entries and manual text amounts. Scaling occurs before conversion/consolidation.

- [ ] **Step 2: Implement raw item generation**

Each recipe ingredient becomes a `ShoppingItemDraft` preserving origin; no consolidation in this function.

- [ ] **Step 3: Write failing consolidation tests**

Cover same normalized ingredient + compatible units, mL+L, g+kg, mass+volume only with known profile, unknown density staying separate, text amount staying human-readable and incompatible notes preventing merge when meaning would be lost.

- [ ] **Step 4: Implement conservative consolidation**

Use the plan-04 conversion engine and retain every source reference.

```ts
export interface ConsolidatedShoppingItem extends ShoppingItemDraft {
  sources: ShoppingSource[]
  approximate: boolean
}
```

- [ ] **Step 5: Run tests and commit**

```bash
pnpm vitest run src/features/shopping/domain
git add src/features/shopping/domain
git commit -m "feat: generate and consolidate shopping ingredients"
```

---

### Task 5: Build shopping list UI and recipe/planner generation flow

**Files:**
- Create: `src/features/shopping/components/ShoppingLists.tsx`
- Create: `src/features/shopping/components/ShoppingListDetail.tsx`
- Create: `src/features/shopping/components/AddRecipesToShopping.tsx`
- Create: component tests
- Modify: `src/app/routes/ShoppingRoute.tsx`

- [ ] **Step 1: Write interaction tests**

Test list switching/default marker, quick manual add, purchased toggle, editing amount/unit, remove, selected-recipes generation, planner-range generation and consolidated preview review.

- [ ] **Step 2: Implement market-friendly list detail**

Use large touch targets, quick check/uncheck, de-emphasized purchased items and origin on demand.

- [ ] **Step 3: Implement generation preview**

Show consolidated results before insertion and label approximate conversions; allow item edits/removal before confirming.

- [ ] **Step 4: Rendered QA with @Build Web Apps**

Test one-handed mobile use, long scrolling, offline state, dark theme and rapid toggles without layout jumps.

- [ ] **Step 5: Commit**

```bash
git add src/features/shopping/components src/app/routes/ShoppingRoute.tsx
git commit -m "feat: add shared shopping list experience"
```

---

### Task 6: Implement local recipe search/filter/sort engine

**Files:**
- Create: `src/features/search/domain/search.ts`
- Create: `src/features/search/domain/search.test.ts`
- Create: `src/features/search/data/search-index.ts`
- Create: `src/features/search/data/search-index.test.ts`

**Interfaces:**
- Produces `searchRecipes(query: RecipeSearchQuery): Promise<RecipeSearchResult[]>`.

- [ ] **Step 1: Write failing normalization/search tests**

Test Portuguese accent/case normalization, partial title, ingredient, category and description/note match without network.

- [ ] **Step 2: Implement normalization**

Use deterministic locale-aware lowercasing/diacritic normalization for search only; canonical text remains unchanged.

- [ ] **Step 3: Write failing filter tests**

Encode the category-combination rule from `SEARCH_FILTERS.md` explicitly. Combine favorite/want-to-make/already-made filters with text search.

- [ ] **Step 4: Write failing sort tests**

Recent uses relevant timestamps; name uses locale-aware comparison; most prepared derives non-deleted cooking sessions; best rated uses existing ratings only and places unrated after rated rather than as zero.

- [ ] **Step 5: Implement rebuildable local index**

Prefer local SQL queries/views first. If an auxiliary local-only index is measurably useful, implement exactly:

```ts
rebuildSearchIndex(): Promise<void>
updateSearchIndexForRecipe(recipeId: string): Promise<void>
clearSearchIndex(): Promise<void>
```

Deleting the index can never lose canonical recipe data.

- [ ] **Step 6: Run tests and commit**

```bash
pnpm vitest run src/features/search/domain src/features/search/data
git add src/features/search
git commit -m "feat: add offline recipe search filters and sorting"
```

---

### Task 7: Build search/filter/sort UI

**Files:**
- Create: `src/features/search/components/RecipeSearch.tsx`
- Create: `src/features/search/components/RecipeFilters.tsx`
- Create: `src/features/search/components/RecipeSort.tsx`
- Create: component tests
- Modify: `src/app/routes/RecipesRoute.tsx`

- [ ] **Step 1: Write UI tests**

Test text search, clearing, multi-category filtering, favorite/want-to-make/already-made toggles and sort changes.

- [ ] **Step 2: Implement compact controls**

Do not turn every filter into decorative pills. Use a compact mobile surface/sheet and keep active-state/result-count clarity.

- [ ] **Step 3: Preserve navigation state appropriately**

Search state may use URL query parameters for back-navigation; it is not synchronized product data.

- [ ] **Step 4: Rendered QA**

Use @Build Web Apps with zero/one/many/long-title results, mobile+desktop and dark theme.

- [ ] **Step 5: Commit**

```bash
git add src/features/search/components src/app/routes/RecipesRoute.tsx
git commit -m "feat: add recipe discovery controls"
```

---

### Task 8: Planner/shopping/search end-to-end acceptance

**Files:**
- Create: `tests/e2e/planner-shopping.spec.ts`
- Create: `tests/e2e/search.spec.ts`
- Modify: `docs/TESTING.md` only for verified notes

- [ ] **Step 1: Add planner→shopping E2E**

Create meal periods → plan recipes/servings → generate shopping for date range → review consolidation → check items offline → reconnect and verify shared state.

- [ ] **Step 2: Add multiple-list E2E**

Create Mercado/Atacado → set/switch default → add manual/generated items → verify only one default.

- [ ] **Step 3: Add local-search offline E2E**

Load data online → offline → search ingredient/category → filter already-made/favorite → sort most-prepared/best-rated → verify local results.

- [ ] **Step 4: Run cross-browser and rendered QA**

Chromium/WebKit critical flows plus @Build Web Apps visual checks.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e docs/TESTING.md
git commit -m "test: cover planner shopping and search journeys"
```

---

### Task 9: Subsystem hardening checkpoint

- [ ] **Step 1: Run full gates**

```bash
pnpm typecheck
pnpm test:run
pnpm build
pnpm test:e2e:smoke
```

- [ ] **Step 2: Verify no server-search dependency exists**

Recipe search/filter/sort must not require Supabase/remote search APIs.

- [ ] **Step 3: Verify no meal-notification path exists**

Planner may not request or schedule notifications.

- [ ] **Step 4: Verify consolidation never guesses density**

Inspect every mass↔volume call site for a required profile result.

- [ ] **Step 5: Commit fixes and mark plan complete**

```bash
git add src tests docs
git commit -m "test: harden planning shopping and search"
```
