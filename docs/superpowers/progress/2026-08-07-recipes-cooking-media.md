# Recipes, cooking and media implementation progress — 2026-08-07

Branch: `feat/recipes-cooking-media`

This note records implementation state while the current execution environment cannot run the normal package/toolchain gates. It is intentionally separate from the design/plan documents so those remain the source of intended behavior.

## Implemented in this branch

### Recipe domain and editing

- Exact rational quantities are preserved through parsing, persistence, display and serving scaling.
- Unit conversion is conservative: exact same-dimension conversions are automatic; mass/volume conversion requires an explicit density profile.
- Pair-specific density overrides take precedence over defaults.
- Recipe aggregates persist ingredients and preparation steps through semantic local-first mutations.
- Category membership is many-to-many and keeps stable assignment identities across restore/delete cycles.
- Recipe detail and editor are connected to the local PowerSync database.
- “Já fizemos” is derived from active cooking sessions rather than stored as a second boolean source of truth.

### Trash and irreversible deletion

- Soft delete remains the default behavior for recoverable entities.
- Restore support and allowlisted entity handling are implemented.
- Permanent delete is routed through the guarded backend RPC introduced by migration `0014_permanent_delete.sql`.

### Cooking history and ratings

- Each cooking session stores an immutable versioned snapshot of the recipe used for that preparation.
- Session finalization uses a stable preallocated session id and is retry-safe.
- Shared observations stay separate from per-user rating comments.
- Ratings are 0–10 in 0.5 increments; missing ratings are excluded from averages rather than treated as zero.
- Re-rating by the same user updates/restores the existing rating identity instead of creating a second active rating.
- History is reactive to local PowerSync changes and exposes the current user’s own rating for editing.

### Resumable cooking mode

- Exactly one active cooking draft is stored locally in `device_preferences`.
- The draft contains the immutable recipe snapshot, current step, serving multiplier, timers, start time and a stable finalization session id.
- Leaving cooking mode does not delete the draft.
- Starting another recipe while a different draft exists requires an explicit replace/resume decision.
- Timers use absolute deadlines while running so elapsed time remains correct across screen lock/suspension.
- Pause/resume/restart state is serializable and stored with the draft.

### Offline-first photos

- Source images are rejected before decode when empty, non-image or above 25 MiB.
- Images are resized without upscaling to a maximum 1600 px long edge and encoded WebP at 0.82 quality, with JPEG fallback when WebP encoding is unavailable.
- Prepared binary data is stored in Cache Storage (`receitas-media-v1`); binary blobs never enter the synchronized mutation outbox.
- Upload jobs are local-only JSON in `device_preferences`, with `pending`, `uploading` and `failed` states, retry count and recoverable errors.
- Jobs left in `uploading` after a crash/reload recover to `pending`.
- Queue identity is the photo id; enqueuing the same id is idempotent.
- Remote object paths are deterministic and pair-scoped, making upload retry idempotent.
- The upload worker validates cached MIME/byte size, uploads the blob first, publishes synchronized photo metadata second, and removes the local queue item only after both steps complete.
- Upload draining is serialized per runtime and automatically resumes on browser `online` events.
- Reads are cache-first; a remote cache miss is downloaded once and cached for subsequent offline viewing.
- Recipe photos and cooking-session photos share the same pipeline and differ only by owner/table metadata.
- Pending photos are visible immediately from local cache. Synced metadata with the same id replaces the pending presentation without duplication.
- Failed jobs expose retry; pending/failed local photos can be cancelled; synchronized photos use soft delete so restore remains possible.
- Migration `0015_media_storage.sql` provisions a private `recipe-media` bucket restricted to WebP/JPEG with pair-membership RLS on Storage objects.

## Verification status in the current environment

The current execution environment cannot complete dependency/tool downloads because outbound DNS/network resolution is unavailable. Therefore the following gates have **not** been executed here and must not be treated as passing:

- `pnpm install` / dependency resolution
- Vitest unit/component test suite
- TypeScript typecheck
- production build
- Playwright/browser end-to-end tests
- Supabase migration lint/apply validation
- PowerSync integration/synchronization tests

Development continues test-first at source level despite the unavailable runner. When a tool-capable environment is available, run the gates in that order and fix compile/test failures before merge.

## High-value verification targets when gates become available

1. Validate the exact local/remote columns for `recipe_photos` and `cooking_session_photos` against `PhotoMetadataPublisher`.
2. Validate `0015_media_storage.sql` against the installed Supabase Storage schema/policy parser.
3. Exercise create/edit/delete/restore recipes across two authenticated users and offline/online transitions.
4. Suspend/resume the browser during a running timer and verify deadline-based recovery.
5. Queue photos offline, reload, reconnect, interrupt between Storage upload and metadata publication, then retry and confirm no duplicate row/object identity.
6. Verify soft-deleted photo metadata remains restorable and that permanent media cleanup has an explicit Storage-object lifecycle before shipping hard-delete UI for photos.
