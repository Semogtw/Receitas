import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { readdir } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const mode = process.argv[2]
if (mode !== 'test' && mode !== 'check') {
  console.error('Usage: node scripts/run-deno-gate.mjs <test|check>')
  process.exit(2)
}

const root = path.join(process.cwd(), 'supabase', 'functions')

async function collectTypeScriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...await collectTypeScriptFiles(fullPath))
      continue
    }
    if (entry.isFile() && /\.tsx?$/.test(entry.name)) files.push(fullPath)
  }

  return files
}

function runDeno(args, label) {
  console.log(`\n[Deno gate] ${label}`)
  const result = spawnSync('deno', args, {
    cwd: process.cwd(),
    stdio: 'inherit',
    shell: false,
  })

  if (result.error) {
    console.error(`Unable to start Deno for ${label}:`, result.error.message)
    process.exit(1)
  }
  if (result.status !== 0) {
    console.error(`[Deno gate] FAILED: ${label}`)
    process.exit(result.status ?? 1)
  }
  console.log(`[Deno gate] PASS: ${label}`)
}

const allFiles = (await collectTypeScriptFiles(root))
  .map((file) => path.relative(process.cwd(), file))
  .sort((left, right) => left.localeCompare(right))

const files = mode === 'test'
  ? allFiles.filter((file) => /(?:\.test|_test)\.tsx?$/.test(file))
  : allFiles

if (files.length === 0) {
  console.error(`Deno ${mode} gate found no matching TypeScript files under supabase/functions.`)
  process.exit(1)
}

const manifest = files.join('\n')
const manifestSha256 = createHash('sha256').update(manifest).digest('hex')
console.log(`Deno ${mode} gate: ${files.length} file(s) discovered explicitly.`)
console.log(`Deno ${mode} manifest sha256: ${manifestSha256}`)
for (const file of files) console.log(`  - ${file}`)

if (mode === 'test') {
  for (const file of files) {
    // Typecheck the exact test module first so missing/renamed exports cannot be
    // masked by test discovery behavior, then execute that same module alone.
    runDeno(['check', file], `check test module ${file}`)
    runDeno(['test', file], `execute test module ${file}`)
  }
} else {
  for (const file of files) {
    runDeno(['check', file], `check module ${file}`)
  }
}

console.log(`\nDeno ${mode} gate completed: ${files.length}/${files.length} file(s) passed.`)
