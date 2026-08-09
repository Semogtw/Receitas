import { sanitizeImportPayload } from './sanitize-payload.ts'

function assert(condition: unknown, message = 'Assertion failed'): asserts condition {
  if (!condition) throw new Error(message)
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}

Deno.test('sanitizeImportPayload extracts JSON-LD and returns only inert visible text from HTML', () => {
  const result = sanitizeImportPayload({
    body: `<!doctype html><html><head>
      <style>.secret{display:none}</style>
      <script>globalThis.pwned=true</script>
      <script type="application/ld+json">{"@type":"Recipe","name":"Bolo"}</script>
    </head><body><h1>Bolo &amp; café</h1><p>Receita <strong>simples</strong>.</p></body></html>`,
    contentType: 'text/html',
    finalUrl: 'https://example.com/bolo',
  })

  assertEquals(result.jsonLd, ['{"@type":"Recipe","name":"Bolo"}'])
  assert(result.text.includes('Bolo & café'))
  assert(result.text.includes('Receita simples.'))
  assert(!result.text.includes('globalThis.pwned'))
  assert(!result.text.includes('.secret'))
  assert(!('body' in result))
})

Deno.test('sanitizeImportPayload treats application/ld+json as inert JSON text only', () => {
  const result = sanitizeImportPayload({
    body: '{"@type":"Recipe","name":"Sopa"}',
    contentType: 'application/ld+json',
    finalUrl: 'https://example.com/sopa.jsonld',
  })

  assertEquals(result, {
    finalUrl: 'https://example.com/sopa.jsonld',
    jsonLd: ['{"@type":"Recipe","name":"Sopa"}'],
    text: '',
  })
})

Deno.test('sanitizeImportPayload ignores non-JSON-LD script tags regardless of attributes', () => {
  const result = sanitizeImportPayload({
    body: `<body>
      <script nonce="abc" type="text/javascript">alert(1)</script>
      <script data-x="1" TYPE='application/ld+json' nonce="x"> {"@type":"Recipe"} </script>
      Texto seguro
    </body>`,
    contentType: 'application/xhtml+xml',
    finalUrl: 'https://example.com/',
  })

  assertEquals(result.jsonLd, ['{"@type":"Recipe"}'])
  assertEquals(result.text, 'Texto seguro')
})
