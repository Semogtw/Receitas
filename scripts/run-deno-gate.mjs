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

console.log(`Deno ${mode} gate: ${files.length} file(s) discovered explicitly.`)
for (const file of files) console.log(`  - ${file}`)

const result = spawnSync('deno', [mode, ...files], {
  cwd: process.cwd(),
  stdio: 'inherit',
  shell: false,
})

if (result.error) {
  console.error(`Unable to start Deno ${mode}:`, result.error.message)
  process.exit(1)
}

process.exit(result.status ?? 1)
