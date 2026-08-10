import { expect, test } from '@playwright/test'

function deployedOrigin(): URL | null {
  const raw = process.env.E2E_DEPLOYED_URL?.trim()
  if (!raw) return null

  const url = new URL(raw)
  if (url.protocol !== 'https:') throw new Error('E2E_DEPLOYED_URL must use HTTPS')
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('E2E_DEPLOYED_URL must be an HTTPS origin without credentials, path, query or fragment')
  }
  return url
}

const origin = deployedOrigin()

test.describe('deployed origin security', () => {
  test.skip(!origin, 'E2E_DEPLOYED_URL is required for deployed Cloudflare Pages acceptance')

  test('serves restrictive security headers on the application document', async ({ request }) => {
    const response = await request.get(origin!.toString())
    expect(response.status()).toBe(200)

    const headers = response.headers()
    expect(headers['x-content-type-options']).toBe('nosniff')
    expect(headers['referrer-policy']).toBe('no-referrer')
    expect(headers['x-frame-options']).toBe('DENY')
    expect(headers['x-robots-tag']).toBe('noindex, nofollow')
    expect(headers['permissions-policy']).toContain('microphone=()')
    expect(headers['permissions-policy']).toContain('geolocation=()')
    expect(headers['permissions-policy']).toContain('payment=()')

    const csp = headers['content-security-policy'] ?? ''
    expect(csp).toContain("default-src 'self'")
    expect(csp).toContain("script-src 'self'")
    expect(csp).toContain("object-src 'none'")
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain("connect-src 'self'")
    expect(csp).not.toContain('https://*')
    expect(csp).not.toContain('wss://*')
    expect(csp.length).toBeLessThanOrEqual(2_000)
  })

  test('serves SPA deep links without redirecting to a public marketing/error page', async ({ request }) => {
    for (const path of ['/recipes', '/recipes/import', '/settings', '/auth/finish-replacement']) {
      const response = await request.get(new URL(path, origin!).toString(), { maxRedirects: 0 })
      expect(response.status(), `${path} must resolve through the Pages SPA fallback`).toBe(200)
      expect(response.headers()['content-type'] ?? '').toContain('text/html')
      const body = await response.text()
      expect(body).toContain('<div id="root"></div>')
    }
  })

  test('keeps the personal app out of crawler discovery surfaces', async ({ request }) => {
    const robots = await request.get(new URL('/robots.txt', origin!).toString())
    expect(robots.status()).toBe(200)
    expect(await robots.text()).toMatch(/User-agent:\s*\*\s*[\s\S]*Disallow:\s*\//i)

    const document = await request.get(origin!.toString())
    const html = await document.text()
    expect(html).toMatch(/<meta[^>]+name=["']robots["'][^>]+content=["'][^"']*noindex[^"']*nofollow/i)
  })
})
