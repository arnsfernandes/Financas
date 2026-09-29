import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import crypto from 'node:crypto'
import { validateTelegramInitData, verifyTelegramAuth } from './telegramAuth'
import { requireFinancialAuth, isTrulyLocalRequest } from './authGuard'
import { NextRequest } from 'next/server'

describe('Telegram Mini App Security & Guard Suite (lib/telegramAuth.ts & lib/authGuard.ts)', () => {
  const mockBotToken = '123456789:ABCdefGHIjklMNOpqrsTUVwxyz'
  const allowedUserId = '997305354'

  function generateValidInitData(
    userId: number,
    authDateSeconds = Math.floor(Date.now() / 1000),
    token = mockBotToken
  ) {
    const userJson = JSON.stringify({ id: userId, first_name: 'Arnaldo', username: 'arnaldo' })
    const params = new URLSearchParams()
    params.set('auth_date', String(authDateSeconds))
    params.set('query_id', 'AAHdF6IQAAAAAN0XohD_82gZ')
    params.set('user', userJson)

    const keys = Array.from(params.keys()).sort()
    const dataCheckString = keys.map((k) => `${k}=${params.get(k)}`).join('\n')

    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(token).digest()
    const hash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex')

    params.set('hash', hash)
    return params.toString()
  }

  const originalEnv = process.env

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      TELEGRAM_BOT_TOKEN: mockBotToken,
      TELEGRAM_ALLOWED_USER_ID: allowedUserId,
    }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe('HMAC Signature & Freshness Validation', () => {
    it('validates a correctly signed initData for authorized user', () => {
      const initData = generateValidInitData(997305354)
      const result = validateTelegramInitData(initData, mockBotToken)

      expect(result.isValid).toBe(true)
      expect(result.user?.id).toBe(997305354)
      expect(result.user?.first_name).toBe('Arnaldo')
      expect(result.authDate).toBeInstanceOf(Date)
    })

    it('rejects initData signed with a different bot token', () => {
      const initData = generateValidInitData(997305354, undefined, 'DIFFERENT_TOKEN')
      const result = validateTelegramInitData(initData, mockBotToken)

      expect(result.isValid).toBe(false)
      expect(result.error).toContain('Assinatura criptográfica do Telegram inválida')
    })

    it('rejects tampered user payload in initData', () => {
      const valid = generateValidInitData(997305354)
      const tampered = valid.replace('997305354', '111222333')
      const result = validateTelegramInitData(tampered, mockBotToken)

      expect(result.isValid).toBe(false)
      expect(result.error).toContain('Assinatura criptográfica do Telegram inválida')
    })

    it('rejects expired initData older than maxAgeSeconds', () => {
      const twoDaysAgo = Math.floor(Date.now() / 1000) - 172800
      const expiredInitData = generateValidInitData(997305354, twoDaysAgo)
      const result = validateTelegramInitData(expiredInitData, mockBotToken, 86400)

      expect(result.isValid).toBe(false)
      expect(result.error).toContain('Sessão do Telegram expirada')
    })

    it('strictly rejects initData passed via query string parameter in verifyTelegramAuth', () => {
      const validInitData = generateValidInitData(997305354)
      const req = new NextRequest(`http://localhost:3000/api/dashboard?initData=${encodeURIComponent(validInitData)}`)

      const authRes = verifyTelegramAuth(req, allowedUserId, mockBotToken)
      expect(authRes.authorized).toBe(false)
      expect(authRes.error).toContain('Header Authorization ou x-telegram-init-data ausente')
    })
  })

  describe('Financial Auth Guard (requireFinancialAuth & isTrulyLocalRequest)', () => {
    it('authorizes requests with valid Authorization Bearer header', () => {
      const validInitData = generateValidInitData(997305354)
      const req = new NextRequest('https://financas.example.com/api/dashboard', {
        headers: {
          authorization: `Bearer ${validInitData}`,
        },
      })

      const guardRes = requireFinancialAuth(req)
      expect(guardRes.authorized).toBe(true)
      expect(guardRes.user?.id).toBe(997305354)
    })

    it('authorizes requests with valid x-telegram-init-data header', () => {
      const validInitData = generateValidInitData(997305354)
      const req = new NextRequest('https://financas.example.com/api/transactions', {
        headers: {
          'x-telegram-init-data': validInitData,
        },
      })

      const guardRes = requireFinancialAuth(req)
      expect(guardRes.authorized).toBe(true)
    })

    it('returns 401 when unauthorized Telegram user tries to access API', () => {
      const untrustedInitData = generateValidInitData(88888888)
      const req = new NextRequest('https://financas.example.com/api/dashboard', {
        headers: {
          authorization: `Bearer ${untrustedInitData}`,
        },
      })

      const guardRes = requireFinancialAuth(req)
      expect(guardRes.authorized).toBe(false)
      expect(guardRes.response?.status).toBe(401)
    })

    it('returns 401 when request arrives via public domain / host without Telegram auth', () => {
      const req = new NextRequest('https://financas.example.com/api/accounts', {
        headers: {
          host: 'financas.example.com',
        },
      })

      const guardRes = requireFinancialAuth(req)
      expect(guardRes.authorized).toBe(false)
      expect(guardRes.response?.status).toBe(401)
    })

    it('returns 401 when request arrives through ngrok / cloudflare tunnel without Telegram auth', () => {
      // Simulation of a public tunnel proxying to localhost
      const req = new NextRequest('http://localhost:3000/api/dashboard', {
        headers: {
          host: 'localhost:3000',
          'cf-connecting-ip': '203.0.113.195',
          'x-forwarded-proto': 'https',
        },
      })

      expect(isTrulyLocalRequest(req)).toBe(false)
      const guardRes = requireFinancialAuth(req)
      expect(guardRes.authorized).toBe(false)
      expect(guardRes.response?.status).toBe(401)
    })

    it('returns 401 when request has remote x-forwarded-for header', () => {
      const req = new NextRequest('http://localhost:3000/api/dashboard', {
        headers: {
          host: 'localhost:3000',
          'x-forwarded-for': '187.54.12.33, 127.0.0.1',
        },
      })

      expect(isTrulyLocalRequest(req)).toBe(false)
      const guardRes = requireFinancialAuth(req)
      expect(guardRes.authorized).toBe(false)
      expect(guardRes.response?.status).toBe(401)
    })

    it('returns 401 in production NODE_ENV even for localhost without auth', () => {
      process.env.NODE_ENV = 'production'
      const req = new NextRequest('http://localhost:3000/api/dashboard', {
        headers: {
          host: 'localhost:3000',
        },
      })

      expect(isTrulyLocalRequest(req)).toBe(false)
      const guardRes = requireFinancialAuth(req)
      expect(guardRes.authorized).toBe(false)
      expect(guardRes.response?.status).toBe(401)
    })

    it('allows genuine local dev loopback request without proxy headers', () => {
      process.env.NODE_ENV = 'development'
      const req = new NextRequest('http://localhost:3000/api/dashboard', {
        headers: {
          host: 'localhost:3000',
        },
      })

      expect(isTrulyLocalRequest(req)).toBe(true)
      const guardRes = requireFinancialAuth(req)
      expect(guardRes.authorized).toBe(true)
    })
  })
})
