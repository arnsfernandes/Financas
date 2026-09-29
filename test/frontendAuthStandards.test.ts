import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildAuthenticatedFetch } from '../lib/useTelegramWebApp'

describe('Frontend API Auth Standardization & Error Handling (buildAuthenticatedFetch)', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('fetchWithAuth automatically injects Authorization Bearer and x-telegram-init-data headers', async () => {
    const mockInitData = 'query_id=AAHdF6IQAAAAAN0XohD_82gZ&user=%7B%22id%22%3A997305354%7D&auth_date=1727568000&hash=mockhash'

    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, categories: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )
    global.fetch = mockFetch

    const fetchWithAuth = buildAuthenticatedFetch(mockInitData)
    await fetchWithAuth('/api/categories?type=expense&activeOnly=true')

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe('/api/categories?type=expense&activeOnly=true')

    const headers = init.headers as Headers
    expect(headers.get('Authorization')).toBe(`Bearer ${mockInitData}`)
    expect(headers.get('x-telegram-init-data')).toBe(mockInitData)
  })

  it('preserves existing custom headers while adding authentication headers', async () => {
    const mockInitData = 'auth_data=123&hash=abc'

    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )
    global.fetch = mockFetch

    const fetchWithAuth = buildAuthenticatedFetch(mockInitData)
    await fetchWithAuth('/api/accounts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Custom-Tracking': 'unit-test',
      },
      body: JSON.stringify({ name: 'Cartão Teste' }),
    })

    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe('/api/accounts')
    expect(init.method).toBe('POST')

    const headers = init.headers as Headers
    expect(headers.get('Content-Type')).toBe('application/json')
    expect(headers.get('X-Custom-Tracking')).toBe('unit-test')
    expect(headers.get('Authorization')).toBe(`Bearer ${mockInitData}`)
    expect(headers.get('x-telegram-init-data')).toBe(mockInitData)
  })

  it('correctly handles 401 Unauthorized API responses from authGuard without throwing unhandled exceptions', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: false, error: 'Acesso não autorizado via Telegram Mini App.' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    )
    global.fetch = mockFetch

    const fetchWithAuth = buildAuthenticatedFetch('')
    const res = await fetchWithAuth('/api/accounts')
    expect(res.status).toBe(401)
    const data = await res.json()
    expect(data.ok).toBe(false)
    expect(data.error).toContain('não autorizado')
  })
})
