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

```ts
export interface MealPlanEntryInput {
  recipeId: string
  date: string // YYYY-MM-DD in product-local date semantics
  mealPeriodId: string
  time: string | null
  servings: Rational | null
  note: string | null
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

export interface RecipeSearchQuery {
  text: string
  categoryIds: string[]
  favorite: boolean | null
  wantToMake: boolean | null
  alreadyMade: boolean | null
  sort: 'recent' | 'name' | 'most_prepared' | 'best_rated'
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

Cover:
- create/rename/reorder meal periods;
- create/edit/delete/restore meal-plan entry;
- entry references recipe + date + meal period + optional time/servings/note;
- offline write appears immediately;
- planner mutation uses versioned local mutation path.

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

Persist planner date as date-only value rather than deriving it from UTC timestamp. Optional time is a separate local-time field. Do not let timezone conversion shift a planned meal to another day.

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

**Interfaces:**
- Consumes `PlannerRepository`.

- [ ] **Step 1: Write interaction tests**

Test selecting date, adding recipe, choosing period, adjusting servings, editing/removing entry and editing custom meal periods.

- [ ] **Step 2: Implement mobile-first planner**

Use a meal agenda/list/calendar hybrid that remains readable on narrow screens. It should look like a meal planner, not a corporate scheduling calendar.

- [ ] **Step 3: Ensure planner is visual-only**

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
- Produces `ShoppingRepository` with multiple named lists and exactly zero-or-one default list.

- [ ] **Step 1: Write failing repository tests**

Cover:
- create multiple named lists;
- set default atomically and unset previous default;
- manual item add/edit/remove/check/uncheck;
- generated item retains origin metadata;
- both users' updates use normal conflict-safe sync path;
- list soft-delete does not delete unrelated lists.

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

The partial unique index from plan 02 must enforce at most one active default list per pair even under concurrent writes.

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

Test one/multiple recipes, requested servings, planner entries and manual `a gosto` amounts. Scaling must occur before unit conversion/consolidation.

- [ ] **Step 2: Implement raw item generation**

Each recipe ingredient becomes a `ShoppingItemDraft` preserving origin. Do not consolidate yet.

- [ ] **Step 3: Write failing consolidation tests**

Cover:
- same normalized ingredient + compatible units sums;
- mL + L sums by direct conversion;
- g + kg sums;
- mass + volume only sums with known ingredient profile;
- unknown density remains separate;
- text amount such as `a gosto` remains a distinct human-readable item;
- incompatible notes may prevent automatic merge when merging would lose meaning.

- [ ] **Step 4: Implement conservative consolidation**

Use the conversion engine from plan 04. Consolidation output must retain a list of contributing source references for explanation.

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

**Interfaces:**
- Consumes repositories/generation/consolidation.

- [ ] **Step 1: Write interaction tests**

Test list switching/default marker, quick manual add, purchased toggle, editing amount/unit, remove, adding from selected recipes, adding from planner date range and reviewing consolidated preview before insertion.

- [ ] **Step 2: Implement market-friendly list detail**

Large touch targets, quick check/uncheck, purchased items visually de-emphasized but still recoverable, origin available on demand without cluttering every row.

- [ ] **Step 3: Implement generation preview**

Before adding generated items, show consolidated results and clearly mark approximate conversions. Allow user edits/removal before confirming.

- [ ] **Step 4: Rendered QA with @Build Web Apps**

Test one-handed mobile use, long list scrolling, offline state, dark theme and rapid check/uncheck without layout jumps.

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

Test accent/case normalization in Portuguese, partial title match, ingredient match, category match and description/note match. Querying must not require network.

- [ ] **Step 2: Implement normalization**

Use deterministic locale-aware lowercasing/diacritic normalization suitable for search without altering canonical stored content.

- [ ] **Step 3: Write failing filter tests**

Multiple selected categories combine according to the product rule chosen in `SEARCH_FILTERS.md`; encode that explicitly in tests. Favorite/want-to-make/already-made filters combine with text search.

- [ ] **Step 4: Write failing sort tests**

Recent uses recipe relevant update/create timestamp. Name uses locale-aware comparison. Most prepared derives count from non-deleted cooking sessions. Best rated derives existing ratings only; unrated recipes sort after rated recipes rather than as zero.

- [ ] **Step 5: Implement a rebuildable local index**

For the initial two-person dataset, prefer SQL views/queries or a compact local-only index. If an auxiliary index is created, implement:

```ts
rebuildSearchIndex(): Promise<void>
updateSearchIndexForRecipe(recipeId: string): Promise<void>
clearSearchIndex(): Promise<void>
```

Deleting the index must never lose canonical recipe data.

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

**Interfaces:**
- Adds search/discovery to the existing Recipes route.

- [ ] **Step 1: Write UI tests**

Test text search, clearing, multi-category filtering, favorite/want-to-make/already-made toggles and sort changes.

- [ ] **Step 2: Implement compact controls**

Do not turn each filter into decorative pills by default. Use a compact filter surface/sheet appropriate to mobile and preserve result count/active-state clarity.

- [ ] **Step 3: Preserve URL/local state appropriately**

Search state may be reflected in query parameters if it improves back-navigation; do not persist it as synchronized product data.

- [ ] **Step 4: Rendered QA**

Use @Build Web Apps with 0, 1, many and long-title results, mobile+desktop and dark theme.

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

Create meal periods → plan recipes with servings → generate shopping list for date range → review consolidated items → check items offline → reconnect and verify shared state.

- [ ] **Step 2: Add multiple-list E2E**

Create Mercado and Atacado → set one default → add manual/generated items → switch default → verify only one default remains.

- [ ] **Step 3: Add local-search offline E2E**

Load data online → go offline → search by ingredient/category → filter already-made/favorite → sort most-prepared/best-rated → expect correct local results.

- [ ] **Step 4: Run cross-browser and rendered QA**

Chromium and WebKit critical flows plus @Build Web Apps visual checks.

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

Search code for recipe search calls to Supabase/remote APIs. Search/filter/sort must function from local database state.

- [ ] **Step 3: Verify no notification path exists for meal planning**

Meal planner may not request or schedule notifications.

- [ ] **Step 4: Verify consolidation never guesses density**

Inspect all mass↔volume conversion call sites for required profile result.

- [ ] **Step 5: Commit fixes and mark plan complete**

```bash
git add src tests docs
git commit -m "test: harden planning shopping and search"
```
