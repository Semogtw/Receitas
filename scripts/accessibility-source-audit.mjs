import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

function hexToRgb(value) {
  const match = /^#([0-9a-f]{6})$/i.exec(value.trim())
  if (!match) return null
  const raw = match[1]
  return [0, 2, 4].map((index) => Number.parseInt(raw.slice(index, index + 2), 16) / 255)
}

function relativeLuminance(value) {
  const rgb = hexToRgb(value)
  if (!rgb) return null
  const linear = rgb.map((channel) => channel <= 0.04045
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4)
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]
}

export function contrastRatio(foreground, background) {
  const first = relativeLuminance(foreground)
  const second = relativeLuminance(background)
  if (first === null || second === null) return null
  const [lighter, darker] = first >= second ? [first, second] : [second, first]
  return (lighter + 0.05) / (darker + 0.05)
}

function themeBlock(source, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return source.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\}`, 'm'))?.[1] ?? ''
}

function cssVars(block) {
  return Object.fromEntries([...block.matchAll(/--([a-z0-9-]+)\s*:\s*(#[0-9a-f]{6})\s*;/gi)].map((match) => [match[1], match[2]]))
}

function atRuleBlock(source, pattern) {
  const match = pattern.exec(source)
  if (!match) return ''
  const open = source.indexOf('{', match.index)
  if (open < 0) return ''

  let depth = 0
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1
    if (source[index] === '}') {
      depth -= 1
      if (depth === 0) return source.slice(open + 1, index)
    }
  }
  return ''
}

function cssDurationToMilliseconds(value) {
  const match = /^([\d.]+)(ms|s)$/i.exec(value.trim())
  if (!match) return Number.NaN
  const amount = Number(match[1])
  return match[2].toLowerCase() === 's' ? amount * 1000 : amount
}

function reducedMotionFindings(base) {
  const findings = []
  const block = atRuleBlock(base, /@media\s*\(prefers-reduced-motion:\s*reduce\)/g)
  if (!block) return ['reduced-motion preference must remain supported']

  if (!/\*\s*,\s*\*::before\s*,\s*\*::after\s*\{/.test(block)) {
    findings.push('reduced-motion override must cover elements and pseudo-elements')
  }
  if (!/scroll-behavior\s*:\s*auto\s*!important\s*;/.test(block)) {
    findings.push('reduced-motion override must disable smooth scrolling')
  }
  if (!/animation-iteration-count\s*:\s*1\s*!important\s*;/.test(block)) {
    findings.push('reduced-motion override must prevent repeated animation loops')
  }

  for (const [property, label] of [
    ['animation-duration', 'animation duration'],
    ['transition-duration', 'transition duration'],
  ]) {
    const match = block.match(new RegExp(`${property}\\s*:\\s*([\\d.]+(?:ms|s))\\s*!important\\s*;`, 'i'))
    const durationMs = match ? cssDurationToMilliseconds(match[1]) : Number.NaN
    if (!Number.isFinite(durationMs) || durationMs > 0.01) {
      findings.push(`reduced-motion ${label} must remain at or below 0.01ms with !important`)
    }
  }

  return findings
}

export function inspectAccessibilitySources({ tokens, themes, base, dialogs }) {
  const findings = []

  const tapMatch = tokens.match(/--tap-min\s*:\s*([\d.]+)rem/)
  const tapRem = tapMatch ? Number(tapMatch[1]) : Number.NaN
  if (!Number.isFinite(tapRem) || tapRem < 2.75) findings.push('tap target token must remain at least 2.75rem (44px at the root default)')

  if (!/:focus-visible\s*\{[\s\S]*?outline\s*:\s*(?!0\b|none\b)/m.test(base)) {
    findings.push('keyboard focus must keep a visible non-zero outline')
  }
  findings.push(...reducedMotionFindings(base))

  const light = cssVars(themeBlock(themes, ':root,\n[data-theme=\'light\']') || themeBlock(themes, "[data-theme='light']"))
  const dark = cssVars(themeBlock(themes, "[data-theme='dark']"))
  const checks = [
    ['light text/background', light.text, light.bg],
    ['light muted/background', light.muted, light.bg],
    ['light accent/background', light.accent, light.bg],
    ['light accent contrast', light['accent-contrast'], light.accent],
    ['dark text/background', dark.text, dark.bg],
    ['dark muted/background', dark.muted, dark.bg],
    ['dark accent/background', dark.accent, dark.bg],
    ['dark accent contrast', dark['accent-contrast'], dark.accent],
  ]
  for (const [label, foreground, background] of checks) {
    const ratio = foreground && background ? contrastRatio(foreground, background) : null
    if (ratio === null || ratio < 4.5) findings.push(`${label} contrast must remain at least 4.5:1`)
  }

  for (const [name, source] of Object.entries(dialogs)) {
    if (!source.includes('role="dialog"') || !source.includes('aria-modal="true"')) {
      findings.push(`${name} must remain a modal dialog with role=dialog and aria-modal=true`)
    }
    if (!source.includes('aria-labelledby=') && !source.includes('aria-label=')) {
      findings.push(`${name} dialog must remain programmatically labelled`)
    }
    if (!source.includes('useModalDialog<') || !source.includes('tabIndex={-1}')) {
      findings.push(`${name} must keep keyboard focus entry, Escape close and focus restoration through useModalDialog`)
    }
  }

  return findings
}

export async function auditAccessibilitySources(root = process.cwd()) {
  const dialogPaths = {
    MealPlanEditor: ['src', 'features', 'planner', 'components', 'MealPlanEditor.tsx'],
    MealPeriodSettings: ['src', 'features', 'planner', 'components', 'MealPeriodSettings.tsx'],
    AddRecipesToShopping: ['src', 'features', 'shopping', 'components', 'AddRecipesToShopping.tsx'],
  }
  const [tokens, themes, base, ...dialogEntries] = await Promise.all([
    readFile(join(root, 'src', 'styles', 'tokens.css'), 'utf8'),
    readFile(join(root, 'src', 'styles', 'themes.css'), 'utf8'),
    readFile(join(root, 'src', 'styles', 'base.css'), 'utf8'),
    ...Object.entries(dialogPaths).map(async ([name, parts]) => [name, await readFile(join(root, ...parts), 'utf8')]),
  ])

  return inspectAccessibilitySources({ tokens, themes, base, dialogs: Object.fromEntries(dialogEntries) })
}

export async function runAccessibilitySourceAudit(root = process.cwd()) {
  const findings = await auditAccessibilitySources(root)
  if (findings.length > 0) throw new Error(`Accessibility source audit failed:\n- ${findings.join('\n- ')}`)
  return { ok: true }
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (invokedDirectly) {
  runAccessibilitySourceAudit()
    .then(() => console.log('Accessibility source audit passed.'))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error))
      process.exitCode = 1
    })
}
