import { readdir, readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'

const RAW_REQUEST_BODY_METHODS = ['json', 'text', 'arrayBuffer', 'blob', 'formData']

function executableSource(content) {
  const output = []
  const templateExpressionDepth = []
  let state = 'code'

  const mask = (character) => output.push(character === '\n' ? '\n' : ' ')

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index]
    const next = content[index + 1]

    if (state === 'line-comment') {
      mask(character)
      if (character === '\n') state = 'code'
      continue
    }

    if (state === 'block-comment') {
      mask(character)
      if (character === '*' && next === '/') {
        mask(next)
        index += 1
        state = 'code'
      }
      continue
    }

    if (state === 'single-quote' || state === 'double-quote') {
      mask(character)
      if (character === '\\' && next !== undefined) {
        mask(next)
        index += 1
        continue
      }
      if ((state === 'single-quote' && character === "'") || (state === 'double-quote' && character === '"')) {
        state = 'code'
      }
      continue
    }

    if (state === 'template') {
      mask(character)
      if (character === '\\' && next !== undefined) {
        mask(next)
        index += 1
        continue
      }
      if (character === '`') {
        state = 'code'
        continue
      }
      if (character === '$' && next === '{') {
        output.push('{')
        index += 1
        templateExpressionDepth.push(1)
        state = 'code'
      }
      continue
    }

    if (character === '/' && next === '/') {
      mask(character)
      mask(next)
      index += 1
      state = 'line-comment'
      continue
    }
    if (character === '/' && next === '*') {
      mask(character)
      mask(next)
      index += 1
      state = 'block-comment'
      continue
    }
    if (character === "'") {
      mask(character)
      state = 'single-quote'
      continue
    }
    if (character === '"') {
      mask(character)
      state = 'double-quote'
      continue
    }
    if (character === '`') {
      mask(character)
      state = 'template'
      continue
    }

    if (templateExpressionDepth.length > 0) {
      const current = templateExpressionDepth.length - 1
      if (character === '{') templateExpressionDepth[current] += 1
      if (character === '}') {
        templateExpressionDepth[current] -= 1
        if (templateExpressionDepth[current] === 0) {
          templateExpressionDepth.pop()
          output.push(character)
          state = 'template'
          continue
        }
      }
    }

    output.push(character)
  }

  return output.join('')
}

/**
 * Edge entrypoints must use the shared bounded JSON reader. Reading directly
 * from Request makes it too easy for a new handler to buffer an attacker-sized
 * body before enforcing its endpoint-specific limit.
 */
export function inspectEdgeRequestBodySource(content, filename = 'index.ts') {
  const findings = []
  const source = executableSource(content)

  for (const method of RAW_REQUEST_BODY_METHODS) {
    const pattern = new RegExp(`\\brequest\\s*\\.\\s*${method}\\s*\\(`, 'g')
    if (pattern.test(source)) {
      findings.push(`${filename}: Edge entrypoints must not call request.${method}(); use shared readJsonObject() with a byte limit`)
    }
  }

  if (/\brequest\s*\.\s*body\b/g.test(source)) {
    findings.push(`${filename}: Edge entrypoints must not consume request.body directly; use shared readJsonObject() with a byte limit`)
  }

  return findings
}

async function edgeEntrypoints(root) {
  const functionsDir = join(root, 'supabase', 'functions')
  const entries = await readdir(functionsDir, { withFileTypes: true })
  const paths = []

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === '_shared') continue
    const path = join(functionsDir, entry.name, 'index.ts')
    const content = await readFile(path, 'utf8').catch(() => null)
    if (content !== null) paths.push({ path, content })
  }

  return paths.sort((a, b) => a.path.localeCompare(b.path))
}

export async function auditEdgeRequestBodies(root = process.cwd()) {
  const findings = []
  for (const { path, content } of await edgeEntrypoints(root)) {
    findings.push(...inspectEdgeRequestBodySource(content, relative(root, path)))
  }
  return [...new Set(findings)].sort()
}

export async function runEdgeRequestBodyAudit(root = process.cwd()) {
  const findings = await auditEdgeRequestBodies(root)
  if (findings.length > 0) {
    throw new Error(`Edge request body audit failed:\n- ${findings.join('\n- ')}`)
  }
  return { ok: true }
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (invokedDirectly) {
  runEdgeRequestBodyAudit()
    .then(() => console.log('Edge request body audit passed.'))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error))
      process.exitCode = 1
    })
}
