import assert from 'node:assert/strict'
import test from 'node:test'

import { inspectCspCompatibleSource } from './csp-source-audit.mjs'

test('accepts ordinary React source without inline styles or HTML injection', () => {
  const source = `
    export function Button() {
      return <button className="primary">Salvar</button>
    }
  `
  assert.deepEqual(inspectCspCompatibleSource(source, 'Button.tsx'), [])
})

test('rejects JSX inline styles that would require unsafe-inline', () => {
  const findings = inspectCspCompatibleSource(
    `export function Bad() { return <div style={{ display: 'none' }}>x</div> }`,
    'Bad.tsx',
  )
  assert(findings.some((finding) => finding.includes('JSX inline style')))
})

test('rejects HTML injection sinks', () => {
  const cases = [
    ['dangerous.tsx', `<div dangerouslySetInnerHTML={{ __html: html }} />`],
    ['inner.ts', `element.innerHTML = html`],
    ['outer.ts', `element.outerHTML = html`],
    ['adjacent.ts', `element.insertAdjacentHTML('beforeend', html)`],
  ]

  for (const [filename, source] of cases) {
    assert(inspectCspCompatibleSource(source, filename).length > 0, `${filename} must be rejected`)
  }
})

test('rejects dynamic code execution primitives', () => {
  for (const source of ['eval(code)', 'window.eval(code)', 'new Function(code)']) {
    const findings = inspectCspCompatibleSource(source, 'runtime.ts')
    assert(findings.some((finding) => finding.includes('strict production CSP')))
  }
})
