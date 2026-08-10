import assert from 'node:assert/strict'
import test from 'node:test'

import { contrastRatio, inspectAccessibilitySources } from './accessibility-source-audit.mjs'

const TOKENS = ':root { --tap-min: 2.75rem; }'
const THEMES = `
:root,
[data-theme='light'] {
  --color-bg: #f7f1e7;
  --color-text: #28231f;
  --color-muted: #6c6258;
  --color-accent: #a5472d;
  --color-accent-contrast: #fffaf2;
}
[data-theme='dark'] {
  --color-bg: #1c1916;
  --color-text: #f2e9dd;
  --color-muted: #b8aa9b;
  --color-accent: #e17e5d;
  --color-accent-contrast: #211713;
}
`
const BASE = `
:focus-visible { outline: 0.1875rem solid currentColor; }
@media (prefers-reduced-motion: reduce) { * { animation-duration: 0.01ms; } }
`
const DIALOG = '<div role="dialog" aria-modal="true" aria-labelledby="title"><h2 id="title">Dialog</h2></div>'

function safeInput() {
  return {
    tokens: TOKENS,
    themes: THEMES,
    base: BASE,
    dialogs: { ExampleDialog: DIALOG },
  }
}

test('computes WCAG contrast ratio for hex colors', () => {
  assert(Math.abs(contrastRatio('#000000', '#ffffff') - 21) < 0.001)
})

test('accepts current minimum touch, focus, motion, contrast and dialog invariants', () => {
  assert.deepEqual(inspectAccessibilitySources(safeInput()), [])
})

test('rejects undersized tap target and invisible keyboard focus', () => {
  const findings = inspectAccessibilitySources({
    ...safeInput(),
    tokens: ':root { --tap-min: 2rem; }',
    base: ':focus-visible { outline: none; }',
  })
  assert(findings.some((finding) => finding.includes('44px')))
  assert(findings.some((finding) => finding.includes('keyboard focus')))
  assert(findings.some((finding) => finding.includes('reduced-motion')))
})

test('rejects insufficient text contrast in either theme', () => {
  const findings = inspectAccessibilitySources({
    ...safeInput(),
    themes: THEMES.replace('--color-muted: #6c6258;', '--color-muted: #cfc8bf;'),
  })
  assert(findings.some((finding) => finding.includes('light muted/background')))
})

test('requires modal dialogs to remain labelled', () => {
  const findings = inspectAccessibilitySources({
    ...safeInput(),
    dialogs: { Broken: '<div role="dialog">Unlabelled</div>' },
  })
  assert(findings.some((finding) => finding.includes('aria-modal=true')))
  assert(findings.some((finding) => finding.includes('programmatically labelled')))
})
