# Receitas Implementation Roadmap

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this roadmap plan-by-plan. Every referenced plan uses checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the complete private, local-first recipe PWA described in `docs/superpowers/specs/2026-08-07-receitas-design.md` without reducing the approved product scope.

**Architecture:** Build a React + TypeScript + Vite PWA whose UI reads from a local PowerSync-backed database, synchronizes with Supabase Postgres, stores private media in Supabase Storage, delegates privileged operations to Supabase Edge Functions, and creates portable backup archives client-side from a synchronized local snapshot plus authenticated media streams. Ship the static frontend on Cloudflare Pages Free and preserve the project-wide recurring-cost requirement of US$ 0.

**Tech Stack:** React, TypeScript, Vite, pnpm, PowerSync, Supabase Postgres/Auth/Storage/Edge Functions, Zip.js, Vitest, Testing Library, Playwright, Cloudflare Pages.

## Global Constraints

- Exactly two people; no public signup and no generic multi-tenant architecture.
- PWA is private, mobile-first and local-first.
- The first version is the complete personal product, not an MVP.
- No silent last-write-wins for real conflicts.
- No ImageGen in the visual workflow without new explicit user authorization.
- Use @Build Web Apps where it materially improves frontend implementation or rendered QA.
- Use @Context7 whenever implementation depends on current library/framework/SDK APIs.
- Use @Supericons whenever iconography is created, replaced or reviewed.
- Use Codex Security on security-sensitive surfaces and before final release hardening.
- Recurring mandatory cost must remain US$ 0.
- Technical choices may be made without additional approval when they preserve approved behavior, security/privacy and the zero-cost constraint.
- Commit frequently in small logical milestones and keep documentation synchronized.

---

## Why this is split into subsystem plans

The approved design spans multiple independently reviewable systems. A single implementation plan would be too large to execute safely in one context. The plans below deliberately create stable interfaces between subsystems and each one ends in software that can be tested independently.

## Planned repository structure

```text
.
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
├── vite.config.ts
├── vitest.config.ts
├── playwright.config.ts
├── index.html
├── public/
│   ├── logo.svg
│   └── generated PWA icons/assets
├── src/
│   ├── app/                 # shell, providers, routing, bootstrap de UI
│   ├── components/          # shared accessible primitives only after proven reuse
│   ├── data/                # PowerSync database, schema, repositories, outbox/sync state
│   ├── features/
│   │   ├── auth/
│   │   ├── recipes/
│   │   ├── cooking/
│   │   ├── media/
│   │   ├── shopping/
│   │   ├── planner/
│   │   ├── search/
│   │   ├── conflicts/
│   │   ├── imports/
│   │   ├── backups/        # Zip.js export, validation and restore staging client
│   │   └── diagnostics/
│   ├── lib/                 # narrowly scoped clients/helpers
│   ├── styles/              # tokens, themes, base CSS
│   └── test/                # shared test setup
├── supabase/
│   ├── migrations/
│   ├── functions/
│   │   ├── bootstrap/
│   │   ├── pair-invite/
│   │   ├── sync-mutation/
│   │   ├── import-recipe/
│   │   ├── backup-restore/ # bounded staging/preflight/commit, not ZIP assembly
│   │   └── account-admin/
│   └── tests/               # SQL/RLS/invariant tests
├── tests/
│   └── e2e/                 # Playwright flows
└── docs/
    └── superpowers/
        ├── specs/
        └── plans/
```

## Plan order and dependencies

1. **`2026-08-07-01-foundation-pwa.md`**  
   Produces the installable application shell, routing, design tokens, test harness and PWA lifecycle. No backend dependency.

2. **`2026-08-07-02-backend-auth-data.md`**  
   Produces Supabase schema, RLS, exactly-two-user bootstrap/invite/auth lifecycle, private Storage policies and typed backend contracts. Depends on plan 01 only for the auth UI shell.

3. **`2026-08-07-03-local-first-sync.md`**  
   Produces the PowerSync local database, repository interfaces, offline writes, outbox, sync status, conflict capture and retry semantics. Depends on plan 02 schema/contracts.

4. **`2026-08-07-04-recipes-cooking-media.md`**  
   Produces recipe CRUD, ingredients, steps, scaling/conversion, categories, history, ratings/comments, cooking mode, timers and local-first media. Depends on plans 01–03.

5. **`2026-08-07-05-planning-shopping-search.md`**  
   Produces meal planner, multiple named shopping lists, conservative ingredient consolidation, local search/filter/sort and derived recipe states. Depends on plans 03–04.

6. **`2026-08-07-06-import-backup-diagnostics.md`**  
   Produces secure recipe import, client-side streaming backup export, fully validated staged merge/replace restoration, diagnostics export and privacy-preserving error handling. Depends on plans 02–05.

7. **`2026-08-07-07-hardening-deploy-release.md`**  
   Produces complete regression gates, security review, accessibility/PWA verification, Cloudflare Pages deployment, Supabase/PowerSync operational runbooks and release acceptance. Depends on all prior plans.

## Cross-plan interface contracts

The following names are stable across plans so agents do not invent incompatible variants:

```ts
export type EntityId = string
export type PairId = EntityId
export type UserId = EntityId
export type RecipeId = EntityId
export type CookingSessionId = EntityId
export type MutationId = EntityId

export type SyncState =
  | 'synced'
  | 'pending'
  | 'syncing'
  | 'error'
  | 'conflict'

export interface MutationMeta {
  mutationId: MutationId
  entityType: string
  entityId: EntityId
  baseRevision: number | null
  createdAt: string
  actorUserId: UserId
}

export interface ConflictRecord<T = unknown> {
  id: EntityId
  pairId: PairId
  entityType: string
  entityId: EntityId
  base: T | null
  local: T
  remote: T
  status: 'open' | 'resolved'
  createdAt: string
  resolvedAt: string | null
}
```

All timestamps crossing persistence boundaries are ISO-8601 UTC strings. Client-created syncable entities use stable UUIDs before first remote write. Mutation payloads are JSON-safe persistence representations; domain-only values are converted at repository boundaries.

## Execution policy

- Execute plans in order unless a later plan explicitly says a task can be safely parallelized.
- At execution time, create an isolated worktree using `superpowers:using-git-worktrees` if the environment supports it.
- Use TDD for domain logic and backend invariants.
- Use rendered browser QA for non-trivial UI changes; a passing build is not enough.
- If a required external service cannot be provisioned in the execution environment, implement and test everything possible with local/test doubles, document the blocked integration gate, commit, and continue to the next code-resolvable task.
- Do not use GitHub Actions as the primary local test runner; use them only when needed for a deployment/repository gate.
- Before implementing a plan, re-read `docs/superpowers/STATUS.md`, `docs/DEVELOPMENT_WORKFLOW.md`, `docs/TOOLS_AND_PLUGINS.md`, this roadmap and the active plan.

## Completion gate

The roadmap is complete only when all seven plans are checked off, the acceptance criteria in the final design spec are satisfied, the security review has no unresolved high/critical findings, the backup/restore disaster-recovery drill succeeds, and the zero-cost deployment/runbook is documented and reproducible.
