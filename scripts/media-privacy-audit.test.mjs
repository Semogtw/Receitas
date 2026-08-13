import assert from 'node:assert/strict'
import test from 'node:test'

import { inspectFrontendMediaPrivacySource } from './media-privacy-audit.mjs'

test('accepts authenticated downloads from the private media bucket', () => {
  assert.deepEqual(
    inspectFrontendMediaPrivacySource(`
      const { data, error } = await client.storage.from(bucket).download(path)
      if (error) throw error
      return data
    `, 'src/features/media/data/supabase-media-download.ts'),
    [],
  )
})

test('rejects Supabase getPublicUrl for recipe media', () => {
  const findings = inspectFrontendMediaPrivacySource(`
    return client.storage.from('recipe-media').getPublicUrl(path).data.publicUrl
  `, 'src/features/media/data/public-media.ts')

  assert(findings.some((finding) => finding.includes('getPublicUrl()')))
})

test('rejects hard-coded public Supabase Storage object URLs', () => {
  const findings = inspectFrontendMediaPrivacySource(`
    const url = 'https://project.supabase.co/storage/v1/object/public/recipe-media/photo.webp'
  `, 'src/features/media/data/public-media.ts')

  assert(findings.some((finding) => finding.includes('public Supabase Storage object URL')))
})

test('ignores getPublicUrl examples that exist only in comments or strings', () => {
  assert.deepEqual(
    inspectFrontendMediaPrivacySource(`
      // client.storage.from(bucket).getPublicUrl(path)
      const note = 'getPublicUrl(path) is forbidden'
      return client.storage.from(bucket).download(path)
    `, 'src/features/media/data/supabase-media-download.ts'),
    [],
  )
})
