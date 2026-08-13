import {
  canonicalJsonBytes,
  manifestSha256,
  parseRestoreManifest,
  rebuildAndValidateDataFiles,
  sha256Hex,
  validateDataBatchInput,
  validateStagedMedia,
  type RestoreDataBatch,
  type RestoreManifest,
} from './validation.ts'

function assert(condition: unknown, message = 'Assertion failed'): asserts condition {
  if (!condition) throw new Error(message)
}

function assertEquals(actual: unknown, expected: unknown, message = 'Values differ'): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}

async function assertRejects(action: () => Promise<unknown>, contains: string): Promise<void> {
  try {
    await action()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    assert(message.includes(contains), `Expected error containing ${contains}, got ${message}`)
    return
  }
  throw new Error(`Expected rejection containing ${contains}`)
}

function assertThrows(action: () => unknown, contains: string): void {
  try {
    action()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    assert(message.includes(contains), `Expected error containing ${contains}, got ${message}`)
    return
  }
  throw new Error(`Expected throw containing ${contains}`)
}

const pairId = '20000000-0000-4000-8000-000000000002'
const requiredPaths = [
  'data/pair.json',
  'data/recipes.json',
  'data/recipe-ingredients.json',
  'data/recipe-steps.json',
  'data/categories.json',
  'data/recipe-categories.json',
  'data/cooking-sessions.json',
  'data/cooking-session-ratings.json',
  'data/meal-periods.json',
  'data/meal-plan-entries.json',
  'data/shopping-lists.json',
  'data/shopping-items.json',
  'data/conversion-profiles.json',
  'data/photo-metadata.json',
] as const

function values(): Map<string, unknown> {
  return new Map<string, unknown>([
    ['data/pair.json', { sourcePairId: pairId, exportedAt: '2026-08-09T10:00:00.000Z' }],
    ['data/recipes.json', [{ id: 'recipe-1', pair_id: pairId }]],
    ['data/recipe-ingredients.json', [{ id: 'ingredient-1', pair_id: pairId, recipe_id: 'recipe-1' }]],
    ['data/recipe-steps.json', [{ id: 'step-1', pair_id: pairId, recipe_id: 'recipe-1' }]],
    ['data/categories.json', [{ id: 'category-1', pair_id: pairId }]],
    ['data/recipe-categories.json', [{ id: 'join-1', pair_id: pairId, recipe_id: 'recipe-1', category_id: 'category-1' }]],
    ['data/cooking-sessions.json', [{ id: 'session-1', pair_id: pairId, recipe_id: 'recipe-1' }]],
    ['data/cooking-session-ratings.json', [{ id: 'rating-1', pair_id: pairId, cooking_session_id: 'session-1' }]],
    ['data/meal-periods.json', [{ id: 'period-1', pair_id: pairId }]],
    ['data/meal-plan-entries.json', [{ id: 'meal-1', pair_id: pairId, recipe_id: 'recipe-1', meal_period_id: 'period-1' }]],
    ['data/shopping-lists.json', [{ id: 'list-1', pair_id: pairId }]],
    ['data/shopping-items.json', [{ id: 'item-1', pair_id: pairId, shopping_list_id: 'list-1' }]],
    ['data/conversion-profiles.json', [{ id: 'conversion-1', pair_id: pairId }]],
    ['data/photo-metadata.json', [{ id: 'photo-1', pair_id: pairId, ownerType: 'recipe', recipe_id: 'recipe-1' }]],
  ])
}

async function fixture(): Promise<{ manifest: RestoreManifest; batches: RestoreDataBatch[] }> {
  const source = values()
  const dataFiles = await Promise.all(requiredPaths.map(async (path) => {
    const bytes = canonicalJsonBytes(source.get(path))
    return { path, bytes: bytes.byteLength, sha256: await sha256Hex(bytes) }
  }))
  const mediaBytes = new TextEncoder().encode('media')
  const manifest = parseRestoreManifest({
    format: 'receitas-backup',
    version: 1,
    createdAt: '2026-08-09T10:00:00.000Z',
    appVersion: '0.0.0-test',
    pairExportId: 'export-1',
    dataFiles,
    mediaFiles: [{ path: 'media/photo-1.webp', sha256: await sha256Hex(mediaBytes), bytes: mediaBytes.byteLength, mediaType: 'image/webp' }],
  })
  const batches = manifest.dataFiles.map((descriptor) => {
    const payload = source.get(descriptor.path)
    const bytes = canonicalJsonBytes(payload)
    return {
      path: descriptor.path,
      batchIndex: 0,
      fileSha256: descriptor.sha256,
      fileByteSize: descriptor.bytes,
      payload,
      payloadByteSize: bytes.byteLength,
    }
  })
  return { manifest, batches }
}

Deno.test('server manifest parsing is strict and canonical hash is stable', async () => {
  const { manifest } = await fixture()
  assert((await manifestSha256(manifest)).match(/^[0-9a-f]{64}$/))
  assertThrows(() => parseRestoreManifest({ ...manifest, access_token: 'secret' }), 'manifest_field_not_allowed')
  assertThrows(() => parseRestoreManifest({ ...manifest, dataFiles: manifest.dataFiles.slice(1) }), 'manifest_missing_data')
})

Deno.test('restore manifest cannot introduce identity or membership datasets', async () => {
  const { manifest } = await fixture()
  for (const path of ['data/users.json', 'data/pair-members.json']) {
    assertThrows(() => parseRestoreManifest({
      ...manifest,
      dataFiles: [
        ...manifest.dataFiles,
        { path, bytes: 2, sha256: '0'.repeat(64) },
      ],
    }), 'manifest_unknown_data_file')
  }
})

Deno.test('data staging only accepts declared descriptors and bounded canonical batches', async () => {
  const { manifest } = await fixture()
  const descriptor = manifest.dataFiles.find((entry) => entry.path === 'data/recipes.json')!
  const accepted = validateDataBatchInput({
    manifest,
    path: descriptor.path,
    batchIndex: 0,
    fileSha256: descriptor.sha256,
    fileByteSize: descriptor.bytes,
    payload: [{ id: 'recipe-1', pair_id: pairId }],
  })
  assertEquals(accepted.path, 'data/recipes.json')
  assertThrows(() => validateDataBatchInput({
    manifest,
    path: descriptor.path,
    batchIndex: 0,
    fileSha256: '0'.repeat(64),
    fileByteSize: descriptor.bytes,
    payload: [],
  }), 'restore_data_descriptor_mismatch')
  assertThrows(() => validateDataBatchInput({
    manifest,
    path: descriptor.path,
    batchIndex: 0,
    fileSha256: descriptor.sha256,
    fileByteSize: descriptor.bytes,
    payload: [{ password: 'must-not-enter-staging' }],
  }), 'forbidden_restore_field')
})

Deno.test('final server validation rejects missing, gapped and adulterated batches', async () => {
  const { manifest, batches } = await fixture()
  await assertRejects(
    () => rebuildAndValidateDataFiles(manifest, batches.filter((batch) => batch.path !== 'data/recipes.json')),
    'restore_staged_file_missing',
  )

  const recipes = batches.find((batch) => batch.path === 'data/recipes.json')!
  await assertRejects(
    () => rebuildAndValidateDataFiles(manifest, [
      ...batches.filter((batch) => batch.path !== recipes.path),
      { ...recipes, batchIndex: 1 },
    ]),
    'restore_batch_gap',
  )

  await assertRejects(
    () => rebuildAndValidateDataFiles(manifest, batches.map((batch) => batch.path === 'data/recipes.json'
      ? { ...batch, payload: [{ id: 'recipe-2', pair_id: pairId }] }
      : batch)),
    'restore_file_checksum_mismatch',
  )
})

Deno.test('final server validation rebuilds complete graph and rejects broken references', async () => {
  const { manifest, batches } = await fixture()
  const rebuilt = await rebuildAndValidateDataFiles(manifest, batches)
  assertEquals(rebuilt.sourcePairId, pairId)

  const steps = batches.find((batch) => batch.path === 'data/recipe-steps.json')!
  const badPayload = [{ id: 'step-1', pair_id: pairId, recipe_id: 'missing' }]
  const badBytes = canonicalJsonBytes(badPayload)
  const badSha = await sha256Hex(badBytes)
  const badManifest: RestoreManifest = {
    ...manifest,
    dataFiles: manifest.dataFiles.map((descriptor) => descriptor.path === steps.path
      ? { ...descriptor, bytes: badBytes.byteLength, sha256: badSha }
      : descriptor),
  }
  const badBatches = batches.map((batch) => batch.path === steps.path
    ? { ...batch, payload: badPayload, payloadByteSize: badBytes.byteLength, fileByteSize: badBytes.byteLength, fileSha256: badSha }
    : batch)
  await assertRejects(() => rebuildAndValidateDataFiles(badManifest, badBatches), 'restore_reference_missing')
})

Deno.test('staged media must exactly match every manifest descriptor', async () => {
  const { manifest } = await fixture()
  const descriptor = manifest.mediaFiles[0]!
  validateStagedMedia(manifest, [{
    path: descriptor.path,
    sha256: descriptor.sha256,
    byteSize: descriptor.bytes,
    mediaType: descriptor.mediaType,
    storagePath: `${pairId}/job-1/photo-1.webp`,
  }])
  assertThrows(() => validateStagedMedia(manifest, []), 'count_mismatch')
  assertThrows(() => validateStagedMedia(manifest, [{
    path: descriptor.path,
    sha256: '0'.repeat(64),
    byteSize: descriptor.bytes,
    mediaType: descriptor.mediaType,
    storagePath: `${pairId}/job-1/photo-1.webp`,
  }]), 'descriptor_mismatch')
})
