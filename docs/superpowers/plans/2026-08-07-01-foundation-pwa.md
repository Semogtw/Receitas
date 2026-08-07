# Foundation PWA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the production-quality React/Vite application shell, design system foundations, test harness, routing and installable PWA lifecycle that every later Receitas feature builds on.

**Architecture:** The frontend is a static Vite SPA with feature-oriented source layout. It exposes no privileged secrets, uses a small shared visual foundation aligned with `docs/UX.md`/`docs/FRONTEND.md`, and separates PWA shell caching from future private domain data.

**Tech Stack:** Node 24 LTS, pnpm 10, React 19, TypeScript, Vite 8, vite-plugin-pwa, Vitest 4, Testing Library, Playwright 1.61, CSS custom properties.

## Global Constraints

- Exactly two people; no public signup and no generic multi-tenant architecture.
- PWA is private, mobile-first and local-first.
- The first version is the complete personal product, not an MVP.
- No ImageGen in the visual workflow without new explicit user authorization.
- Use @Build Web Apps for rendered frontend QA and @Context7 for current React/Vite/PWA APIs.
- Use @Supericons before locking new icon mappings.
- Recurring mandatory cost must remain US$ 0.
- Cloudflare Pages Free is the target static host.
- Commit frequently in small logical milestones.

---

## File map

```text
package.json                         # scripts and pinned dependency graph
pnpm-lock.yaml                       # reproducible dependency lock
vite.config.ts                       # Vite + PWA configuration
vitest.config.ts                     # unit/component test configuration
playwright.config.ts                 # browser/mobile projects
src/main.tsx                         # application bootstrap only
src/app/App.tsx                      # top-level composition
src/app/router.tsx                   # route table
src/app/AppShell.tsx                 # authenticated/private shell frame
src/app/PwaLifecycle.tsx             # offline-ready/update UX
src/app/routes/*.tsx                 # meaningful route-level empty states
src/components/navigation/BottomNav.tsx
src/components/feedback/EmptyState.tsx
src/components/feedback/StatusMessage.tsx
src/lib/env.ts                       # typed public env parsing
src/styles/tokens.css                # color/type/spacing/radius/z-index tokens
src/styles/base.css                  # reset/base typography/focus rules
src/styles/themes.css                # light/dark semantic tokens
src/test/setup.ts                    # Testing Library setup
src/test/render.tsx                  # shared render helper
public/manifest.webmanifest          # install metadata if not generated inline
public/icons/*                       # final PWA icons/assets
src/**/*.test.tsx                    # unit/component tests
src/**/*.test.ts
tests/e2e/app-shell.spec.ts          # rendered smoke/mobile tests
```

### Stable interfaces produced by this plan

```ts
export type AppRoute =
  | '/recipes'
  | '/planner'
  | '/shopping'
  | '/history'
  | '/settings'

export interface AppNavItem {
  route: AppRoute
  label: string
  icon: React.ComponentType<{ 'aria-hidden'?: boolean; size?: number }>
}

export interface PublicEnv {
  supabaseUrl: string
  supabaseAnonKey: string
  powersyncUrl: string
}
```

Later plans may add authenticated route guards, but they must not rewrite the shell contract.

---

### Task 1: Scaffold the Vite/React/TypeScript project and test harness

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsconfig.app.json`
- Create: `vite.config.ts`
- Create: `vitest.config.ts`
- Create: `src/main.tsx`
- Create: `src/app/App.tsx`
- Create: `src/test/setup.ts`
- Create: `src/app/App.test.tsx`
- Create: `.gitignore`

**Interfaces:**
- Produces: `App` root component and standard scripts `dev`, `build`, `typecheck`, `test`, `test:run`, `lint`.

- [ ] **Step 1: Consult current framework docs and pin the toolchain**

Use @Context7 for React 19, Vite 8 and Vitest 4 before writing config. Then initialize with pnpm and commit the exact versions to `pnpm-lock.yaml`.

Run:

```bash
corepack enable
pnpm init
pnpm add react@^19 react-dom@^19
pnpm add -D vite@^8 typescript@^5 @vitejs/plugin-react vitest@^4 jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event eslint @eslint/js typescript-eslint eslint-plugin-react-hooks eslint-plugin-react-refresh
```

Expected: dependency installation succeeds and `pnpm-lock.yaml` is created.

- [ ] **Step 2: Write the failing root render test**

Create `src/app/App.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { App } from './App'

describe('App', () => {
  it('renders the private application shell entry point', () => {
    render(<App />)
    expect(screen.getByRole('main')).toBeInTheDocument()
    expect(screen.getByText('Receitas')).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run:

```bash
pnpm vitest run src/app/App.test.tsx
```

Expected: FAIL because `App` and/or test setup do not exist yet.

- [ ] **Step 4: Implement minimal root/bootstrap configuration**

Create `src/test/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest'
```

Create `src/app/App.tsx`:

```tsx
export function App() {
  return (
    <main>
      <h1>Receitas</h1>
    </main>
  )
}
```

Create `src/main.tsx`:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import './styles/tokens.css'
import './styles/themes.css'
import './styles/base.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

Configure Vitest with `environment: 'jsdom'`, `setupFiles: ['./src/test/setup.ts']`, `clearMocks: true`, and `restoreMocks: true`.

- [ ] **Step 5: Run unit, type and build gates**

Run:

```bash
pnpm test:run
pnpm typecheck
pnpm build
```

Expected: all commands PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml tsconfig*.json vite.config.ts vitest.config.ts src .gitignore
git commit -m "chore: scaffold React PWA frontend"
```

---

### Task 2: Add typed public environment configuration

**Files:**
- Create: `src/lib/env.ts`
- Create: `src/lib/env.test.ts`
- Create: `src/vite-env.d.ts`
- Create: `.env.example`

**Interfaces:**
- Produces: `readPublicEnv(source?: ImportMetaEnv): PublicEnv`.
- Later plans consume `PublicEnv` for Supabase and PowerSync clients.

- [ ] **Step 1: Write failing validation tests**

```ts
import { describe, expect, it } from 'vitest'
import { readPublicEnv } from './env'

describe('readPublicEnv', () => {
  it('returns the three required public endpoints/keys', () => {
    expect(readPublicEnv({
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'public-anon-key',
      VITE_POWERSYNC_URL: 'https://sync.example.test',
    } as ImportMetaEnv)).toEqual({
      supabaseUrl: 'https://example.supabase.co',
      supabaseAnonKey: 'public-anon-key',
      powersyncUrl: 'https://sync.example.test',
    })
  })

  it('throws a sanitized error when a required variable is missing', () => {
    expect(() => readPublicEnv({} as ImportMetaEnv)).toThrow('Missing required public environment configuration')
  })
})
```

- [ ] **Step 2: Verify RED**

Run `pnpm vitest run src/lib/env.test.ts`.

Expected: FAIL because `readPublicEnv` is undefined.

- [ ] **Step 3: Implement strict parsing**

```ts
export interface PublicEnv {
  supabaseUrl: string
  supabaseAnonKey: string
  powersyncUrl: string
}

export function readPublicEnv(source: ImportMetaEnv = import.meta.env): PublicEnv {
  const supabaseUrl = source.VITE_SUPABASE_URL
  const supabaseAnonKey = source.VITE_SUPABASE_ANON_KEY
  const powersyncUrl = source.VITE_POWERSYNC_URL

  if (!supabaseUrl || !supabaseAnonKey || !powersyncUrl) {
    throw new Error('Missing required public environment configuration')
  }

  return { supabaseUrl, supabaseAnonKey, powersyncUrl }
}
```

Declare only those three `VITE_*` keys in `src/vite-env.d.ts`. `.env.example` contains dummy values only; never commit real secrets.

- [ ] **Step 4: Verify GREEN**

Run:

```bash
pnpm vitest run src/lib/env.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/env.ts src/lib/env.test.ts src/vite-env.d.ts .env.example
git commit -m "chore: validate public frontend environment"
```

---

### Task 3: Establish visual tokens, themes and accessible base styles

**Files:**
- Create: `src/styles/tokens.css`
- Create: `src/styles/themes.css`
- Create: `src/styles/base.css`
- Create: `src/components/feedback/StatusMessage.tsx`
- Create: `src/components/feedback/StatusMessage.test.tsx`

**Interfaces:**
- Produces: semantic CSS variables (`--color-bg`, `--color-surface`, `--color-text`, `--color-muted`, `--color-accent`, `--color-danger`, `--color-warning`, `--color-success`) and stable spacing/radius/z-index scales.

- [ ] **Step 1: Use @Build Web Apps + `docs/UX.md`/`docs/FRONTEND.md` to define tokens**

Do not use ImageGen. Use natural warm neutrals and one dominant culinary accent per surface. Define both `:root` and `[data-theme='dark']` values.

- [ ] **Step 2: Write an accessible status component test**

```tsx
it('announces errors without relying on color alone', () => {
  render(<StatusMessage tone="error">Falha ao sincronizar</StatusMessage>)
  expect(screen.getByRole('alert')).toHaveTextContent('Falha ao sincronizar')
})
```

- [ ] **Step 3: Verify RED**

Run `pnpm vitest run src/components/feedback/StatusMessage.test.tsx`.

- [ ] **Step 4: Implement base CSS and `StatusMessage`**

Use semantic HTML, visible `:focus-visible`, `color-scheme`, readable line heights, touch-friendly controls, `min-height: 100dvh`, and `prefers-reduced-motion` handling. Do not create glassmorphism, global pill styling or card-by-default primitives.

- [ ] **Step 5: Verify tests and rendered CSS**

Run `pnpm test:run && pnpm build`. Start `pnpm dev --host 127.0.0.1` and inspect one mobile and one desktop viewport with @Build Web Apps.

Expected: no clipping, readable contrast, visible focus, no framework overlay.

- [ ] **Step 6: Commit**

```bash
git add src/styles src/components/feedback
git commit -m "feat: add culinary design tokens and base styles"
```

---

### Task 4: Add routing and the mobile-first application shell

**Files:**
- Create: `src/app/router.tsx`
- Create: `src/app/AppShell.tsx`
- Create: `src/components/navigation/BottomNav.tsx`
- Create: `src/components/navigation/BottomNav.test.tsx`
- Create: `src/app/routes/RecipesRoute.tsx`
- Create: `src/app/routes/PlannerRoute.tsx`
- Create: `src/app/routes/ShoppingRoute.tsx`
- Create: `src/app/routes/HistoryRoute.tsx`
- Create: `src/app/routes/SettingsRoute.tsx`
- Modify: `src/app/App.tsx`

**Interfaces:**
- Produces: stable routes `/recipes`, `/planner`, `/shopping`, `/history`, `/settings`.

- [ ] **Step 1: Install and verify current routing API via @Context7**

Use the current stable `react-router` package/API and pin it in the lockfile.

- [ ] **Step 2: Use @Supericons to review the main navigation set**

Required semantics: Receitas, Planejar, Compras, Histórico, Configurações. Prefer one family. If Lucide remains the strongest coherent family after review, use `BookOpen`, `CalendarDays`, `ShoppingBasket`, `History`, `Settings`. Reject semantically wrong automatic suggestions.

- [ ] **Step 3: Write the failing navigation test**

```tsx
it('exposes the five stable primary destinations with text labels', () => {
  render(<BottomNav currentPath="/recipes" />)
  for (const label of ['Receitas', 'Planejar', 'Compras', 'Histórico', 'Configurações']) {
    expect(screen.getByRole('link', { name: label })).toBeInTheDocument()
  }
})
```

- [ ] **Step 4: Verify RED then implement the shell**

Bottom navigation is mobile-first, safe-area aware and near the thumb. Desktop may move navigation without changing route labels. Route screens must render truthful empty-state copy rather than lorem ipsum or fake metrics.

Example `RecipesRoute` initial copy:

```tsx
export function RecipesRoute() {
  return (
    <section aria-labelledby="recipes-title">
      <h1 id="recipes-title">Receitas</h1>
      <p>Suas receitas aparecem aqui quando forem cadastradas ou importadas.</p>
    </section>
  )
}
```

- [ ] **Step 5: Verify unit + browser routing**

Run:

```bash
pnpm test:run
pnpm build
```

Then use @Build Web Apps to click every primary navigation item on mobile and desktop and verify URL/title/content changes.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml src/app src/components/navigation
git commit -m "feat: add application shell and primary navigation"
```

---

### Task 5: Add PWA install metadata and explicit update lifecycle

**Files:**
- Modify: `vite.config.ts`
- Create: `src/app/PwaLifecycle.tsx`
- Create: `src/app/PwaLifecycle.test.tsx`
- Create: `public/icons/icon-192.png`
- Create: `public/icons/icon-512.png`
- Modify or Generate: `public/manifest.webmanifest`
- Modify: `src/app/App.tsx`

**Interfaces:**
- Produces: user-visible states `offlineReady` and `needRefresh` from `virtual:pwa-register/react`.

- [ ] **Step 1: Verify vite-plugin-pwa API with @Context7**

Use the current React integration and an explicit prompt-based update flow. Do not configure runtime caching for authenticated API responses or private media in this foundation task.

- [ ] **Step 2: Write failing update-prompt component tests**

Test that:
- offline-ready copy can be dismissed;
- update-available copy provides an explicit reload/update button;
- hidden state renders nothing.

- [ ] **Step 3: Implement PWA configuration**

Precache only the static application shell/assets needed to load the SPA. Include manifest metadata with `name: "Receitas"`, `display: "standalone"`, suitable theme/background colors, and icons.

Use a `PwaLifecycle` component that calls `updateServiceWorker(true)` only after the user accepts the update.

- [ ] **Step 4: Verify service worker build output**

Run `pnpm build`.

Expected: Vite PWA plugin emits manifest/service worker assets without caching arbitrary Supabase/PowerSync responses.

- [ ] **Step 5: Browser-test update/offline shell behavior**

Use Playwright or @Build Web Apps against a production preview. Confirm app shell reloads offline after one online load. Do not claim domain data offline support yet.

- [ ] **Step 6: Commit**

```bash
git add vite.config.ts src/app/PwaLifecycle* src/app/App.tsx public
git commit -m "feat: add installable PWA lifecycle"
```

---

### Task 6: Establish Playwright desktop/mobile smoke gates

**Files:**
- Create: `playwright.config.ts`
- Create: `tests/e2e/app-shell.spec.ts`
- Modify: `package.json`

**Interfaces:**
- Produces scripts `test:e2e` and `test:e2e:smoke`.

- [ ] **Step 1: Verify current Playwright config via @Context7**

Use Chromium, WebKit, a Mobile Safari/iPhone profile and Mobile Chrome where useful. Configure `webServer` to run the production preview, not the dev server, for release-like smoke tests.

- [ ] **Step 2: Write smoke tests**

```ts
import { expect, test } from '@playwright/test'

test('primary shell routes are reachable', async ({ page }) => {
  await page.goto('/recipes')
  await expect(page.getByRole('heading', { name: 'Receitas' })).toBeVisible()
  await page.getByRole('link', { name: 'Planejar' }).click()
  await expect(page).toHaveURL(/\/planner$/)
  await expect(page.getByRole('heading', { name: 'Planejar' })).toBeVisible()
})
```

Add an offline shell test that loads once online, switches the context offline, reloads and expects the shell to render.

- [ ] **Step 3: Run and verify failures first if config is incomplete**

Run `pnpm test:e2e:smoke` before completing config and capture the expected config/server failure.

- [ ] **Step 4: Complete config and rerun**

Run:

```bash
pnpm build
pnpm test:e2e:smoke
```

Expected: PASS on Chromium and WebKit/mobile projects selected for smoke.

- [ ] **Step 5: Perform rendered QA with @Build Web Apps**

Check mobile + desktop screenshots, console health, no clipping, safe-area behavior and primary interaction proof. Record any untestable installed-iOS behavior in `docs/TESTING.md` rather than pretending desktop WebKit proves it.

- [ ] **Step 6: Commit**

```bash
git add playwright.config.ts tests/e2e package.json pnpm-lock.yaml docs/TESTING.md
git commit -m "test: add cross-browser app shell smoke tests"
```

---

### Task 7: Foundation verification checkpoint

**Files:**
- Modify: `README.md` only if startup commands changed
- Modify: `docs/TESTING.md` only for verified environment notes

**Interfaces:**
- Consumes all outputs from Tasks 1–6.
- Produces the stable frontend shell required by plan 02.

- [ ] **Step 1: Run the complete foundation gate**

```bash
pnpm typecheck
pnpm test:run
pnpm build
pnpm test:e2e:smoke
```

Expected: all executable gates PASS.

- [ ] **Step 2: Inspect production bundle and environment exposure**

Confirm no real secret, bootstrap secret, `service_role`, test credential or private data fixture is in `dist/`.

Run a text search for known secret variable names and ensure only public `VITE_*` configuration is referenced.

- [ ] **Step 3: Final rendered QA**

Use @Build Web Apps. Flow under test: `/recipes` → each primary nav destination → PWA status surface → back to `/recipes`. Check mobile and desktop.

- [ ] **Step 4: Commit any verification/documentation fixes**

```bash
git add README.md docs/TESTING.md src tests public vite.config.ts
# commit only if files changed
git commit -m "docs: record foundation verification"
```

- [ ] **Step 5: Mark this plan complete before starting plan 02**

Do not start backend/auth work while foundation tests are knowingly red unless the blocker is environmental and explicitly documented.
