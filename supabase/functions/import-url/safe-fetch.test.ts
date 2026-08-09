import {
  assertPublicImportUrl,
  isPublicIpAddress,
  safeFetchImportPayload,
  type HostResolver,
} from './safe-fetch.ts'

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

Deno.test('isPublicIpAddress rejects private, loopback and reserved IPv4 ranges', () => {
  for (const value of [
    '0.0.0.0',
    '10.0.0.1',
    '100.64.0.1',
    '127.0.0.1',
    '169.254.169.254',
    '172.16.1.1',
    '192.168.1.1',
    '192.0.2.1',
    '198.18.0.1',
    '203.0.113.8',
    '224.0.0.1',
  ]) assert(!isPublicIpAddress(value), `${value} must be blocked`)

  assert(isPublicIpAddress('1.1.1.1'))
  assert(isPublicIpAddress('8.8.8.8'))
})

Deno.test('isPublicIpAddress rejects local and transition IPv6 ranges', () => {
  for (const value of [
    '::',
    '::1',
    '::ffff:127.0.0.1',
    'fc00::1',
    'fd12:3456::1',
    'fe80::1',
    'ff02::1',
    '2001:db8::1',
    '2002:7f00:1::',
  ]) assert(!isPublicIpAddress(value), `${value} must be blocked`)

  assert(isPublicIpAddress('2606:4700:4700::1111'))
  assert(isPublicIpAddress('2001:4860:4860::8888'))
})

Deno.test('assertPublicImportUrl rejects schemes, credentials, non-standard ports and local hostnames', async () => {
  const resolver: HostResolver = async () => ['1.1.1.1']

  await assertRejects(() => assertPublicImportUrl('file:///etc/passwd', resolver), 'http_or_https_required')
  await assertRejects(() => assertPublicImportUrl('https://user:pass@example.com/', resolver), 'credentials_not_allowed')
  await assertRejects(() => assertPublicImportUrl('https://example.com:8443/', resolver), 'port_not_allowed')
  await assertRejects(() => assertPublicImportUrl('http://localhost/', resolver), 'hostname_not_allowed')
  await assertRejects(() => assertPublicImportUrl('http://printer.local/', resolver), 'hostname_not_allowed')
})

Deno.test('assertPublicImportUrl rejects DNS answers when any resolved address is non-public', async () => {
  const mixedResolver: HostResolver = async () => ['93.184.216.34', '10.0.0.2']
  await assertRejects(
    () => assertPublicImportUrl('https://example.com/recipe', mixedResolver),
    'resolved_address_not_public',
  )
})

Deno.test('safeFetchImportPayload revalidates every redirect target before fetching it', async () => {
  const resolved: string[] = []
  const resolver: HostResolver = async (hostname) => {
    resolved.push(hostname)
    return hostname === 'example.com' ? ['93.184.216.34'] : ['10.0.0.2']
  }
  let fetchCount = 0
  const fetchImpl: typeof fetch = async () => {
    fetchCount += 1
    return new Response(null, {
      status: 302,
      headers: { location: 'http://internal.example/recipe' },
    })
  }

  await assertRejects(
    () => safeFetchImportPayload('https://example.com/start', { resolver, fetchImpl }),
    'resolved_address_not_public',
  )
  assertEquals(fetchCount, 1)
  assertEquals(resolved, ['example.com', 'internal.example'])
})

Deno.test('safeFetchImportPayload rejects HTTPS downgrade redirects', async () => {
  const resolver: HostResolver = async () => ['93.184.216.34']
  const fetchImpl: typeof fetch = async () => new Response(null, {
    status: 301,
    headers: { location: 'http://example.com/recipe' },
  })

  await assertRejects(
    () => safeFetchImportPayload('https://example.com/start', { resolver, fetchImpl }),
    'https_downgrade_not_allowed',
  )
})

Deno.test('safeFetchImportPayload accepts bounded HTML and reports the final URL', async () => {
  const resolver: HostResolver = async () => ['93.184.216.34']
  const fetchImpl: typeof fetch = async () => new Response('<html><body>Receita</body></html>', {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  })

  const result = await safeFetchImportPayload('https://example.com/recipe', { resolver, fetchImpl })
  assertEquals(result, {
    body: '<html><body>Receita</body></html>',
    contentType: 'text/html',
    finalUrl: 'https://example.com/recipe',
  })
})

Deno.test('safeFetchImportPayload rejects disallowed content types and oversized responses', async () => {
  const resolver: HostResolver = async () => ['93.184.216.34']
  const pdfFetch: typeof fetch = async () => new Response('pdf', {
    status: 200,
    headers: { 'content-type': 'application/pdf' },
  })
  await assertRejects(
    () => safeFetchImportPayload('https://example.com/file', { resolver, fetchImpl: pdfFetch }),
    'content_type_not_allowed',
  )

  const oversizedFetch: typeof fetch = async () => new Response('x'.repeat(33), {
    status: 200,
    headers: { 'content-type': 'text/html', 'content-length': '33' },
  })
  await assertRejects(
    () => safeFetchImportPayload('https://example.com/file', {
      resolver,
      fetchImpl: oversizedFetch,
      maxBytes: 32,
    }),
    'response_too_large',
  )
})

Deno.test('safeFetchImportPayload accepts JSON-LD but not arbitrary JSON media types', async () => {
  const resolver: HostResolver = async () => ['93.184.216.34']
  const jsonLdFetch: typeof fetch = async () => new Response('{"@type":"Recipe"}', {
    status: 200,
    headers: { 'content-type': 'application/ld+json' },
  })
  const result = await safeFetchImportPayload('https://example.com/recipe', { resolver, fetchImpl: jsonLdFetch })
  assertEquals(result.contentType, 'application/ld+json')

  const jsonFetch: typeof fetch = async () => new Response('{}', {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
  await assertRejects(
    () => safeFetchImportPayload('https://example.com/data', { resolver, fetchImpl: jsonFetch }),
    'content_type_not_allowed',
  )
})
