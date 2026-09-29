import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  createWebSessionToken,
  verifyWebSessionToken,
  verifyWebPassword,
  verifyWebSessionFromRequest,
  attachWebSessionCookie,
  clearWebSessionCookie,
  WEB_SESSION_COOKIE_NAME,
} from './webAuth'
import { requireFinancialAuth } from './authGuard'
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'node:crypto'

describe('Web Authentication Suite (lib/webAuth.ts & Dual Auth in lib/authGuard.ts)', () => {
  const originalEnv = process.env
  const mockPassword = 'minha-senha-secreta-de-teste'
  const mockSessionSecret = 'segredo-hmac-longo-para-sessoes-web-12345'
  const mockBotToken = '123456789:ABCdefGHIjklMNOpqrsTUVwxyz'
  const allowedUserId = '997305354'

  function generateValidTelegramInitData(
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

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      WEB_ACCESS_PASSWORD: mockPassword,
      WEB_SESSION_SECRET: mockSessionSecret,
      TELEGRAM_BOT_TOKEN: mockBotToken,
      TELEGRAM_ALLOWED_USER_ID: allowedUserId,
      NODE_ENV: 'production', // Test production security constraints by default
    }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe('Password Verification', () => {
    it('validates correct password', () => {
      expect(verifyWebPassword('minha-senha-secreta-de-teste')).toBe(true)
    })

    it('rejects incorrect password', () => {
      expect(verifyWebPassword('senha-errada')).toBe(false)
      expect(verifyWebPassword('')).toBe(false)
      expect(verifyWebPassword('minha-senha-secreta-de-teste-extra')).toBe(false)
    })

    it('returns false if WEB_ACCESS_PASSWORD is not configured', () => {
      delete process.env.WEB_ACCESS_PASSWORD
      expect(verifyWebPassword('qualquer-coisa')).toBe(false)
    })
  })

  describe('Web Session Token Generation & Verification', () => {
    it('creates and verifies a valid web session token', () => {
      const token = createWebSessionToken(3600, mockSessionSecret)
      const res = verifyWebSessionToken(token, mockSessionSecret)

      expect(res.valid).toBe(true)
      expect(res.payload?.authenticated).toBe(true)
      expect(res.payload?.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000))
    })

    it('rejects tampered session token (modified payload or signature)', () => {
      const token = createWebSessionToken(3600, mockSessionSecret)
      const [payload, signature] = token.split('.')

      // Tamper signature
      const tamperedSignature = signature.slice(0, -4) + 'abcd'
      const res1 = verifyWebSessionToken(`${payload}.${tamperedSignature}`, mockSessionSecret)
      expect(res1.valid).toBe(false)
      expect(res1.error).toContain('Assinatura de sessão inválida')

      // Tamper payload
      const tamperedPayload = Buffer.from(JSON.stringify({ authenticated: true, expiresAt: 9999999999 })).toString('base64url')
      const res2 = verifyWebSessionToken(`${tamperedPayload}.${signature}`, mockSessionSecret)
      expect(res2.valid).toBe(false)
      expect(res2.error).toContain('Assinatura de sessão inválida')
    })

    it('rejects session token signed with a different secret', () => {
      const token = createWebSessionToken(3600, 'outro-segredo')
      const res = verifyWebSessionToken(token, mockSessionSecret)

      expect(res.valid).toBe(false)
      expect(res.error).toContain('Assinatura de sessão inválida')
    })

    it('rejects expired session token', () => {
      // Create a token expired 10 seconds ago
      const token = createWebSessionToken(-10, mockSessionSecret)
      const res = verifyWebSessionToken(token, mockSessionSecret)

      expect(res.valid).toBe(false)
      expect(res.error).toContain('Sessão expirada')
    })

    it('rejects null, empty or malformed token strings', () => {
      expect(verifyWebSessionToken('', mockSessionSecret).valid).toBe(false)
      expect(verifyWebSessionToken('token-sem-ponto', mockSessionSecret).valid).toBe(false)
      expect(verifyWebSessionToken('ponto.no.lugar.errado', mockSessionSecret).valid).toBe(false)
    })
  })

  describe('Cookie Attachment and Clearing', () => {
    it('attaches HttpOnly, SameSite=Lax, and Secure cookie in production', () => {
      process.env.NODE_ENV = 'production'
      const response = NextResponse.json({ ok: true })
      attachWebSessionCookie(response, 'test-token', 3600)

      const cookie = response.cookies.get(WEB_SESSION_COOKIE_NAME)
      expect(cookie).toBeDefined()
      expect(cookie?.value).toBe('test-token')
      expect(cookie?.httpOnly).toBe(true)
      expect(cookie?.secure).toBe(true)
      expect(cookie?.sameSite).toBe('lax')
      expect(cookie?.maxAge).toBe(3600)
    })

    it('clears web session cookie', () => {
      const response = NextResponse.json({ ok: true })
      clearWebSessionCookie(response)

      const cookie = response.cookies.get(WEB_SESSION_COOKIE_NAME)
      expect(cookie).toBeDefined()
      expect(cookie?.value).toBe('')
      expect(cookie?.maxAge).toBe(0)
    })
  })

  describe('Dual Authentication in requireFinancialAuth (Web & Telegram)', () => {
    it('authorizes request when valid Web Session Cookie is present', () => {
      const token = createWebSessionToken(3600, mockSessionSecret)
      const req = new NextRequest('https://financas.example.com/api/dashboard', {
        headers: {
          cookie: `${WEB_SESSION_COOKIE_NAME}=${token}`,
        },
      })

      const guardRes = requireFinancialAuth(req)
      expect(guardRes.authorized).toBe(true)
      expect(guardRes.authType).toBe('web')
      expect(guardRes.user?.isWebUser).toBe(true)
    })

    it('authorizes request when valid Telegram initData is present in Authorization header', () => {
      const validTelegramInitData = generateValidTelegramInitData(997305354)
      const req = new NextRequest('https://financas.example.com/api/dashboard', {
        headers: {
          authorization: `Bearer ${validTelegramInitData}`,
        },
      })

      const guardRes = requireFinancialAuth(req)
      expect(guardRes.authorized).toBe(true)
      expect(guardRes.authType).toBe('telegram')
      expect(guardRes.user?.id).toBe(997305354)
    })

    it('rejects request with 401 when web session cookie is tampered or invalid', () => {
      const req = new NextRequest('https://financas.example.com/api/transactions', {
        headers: {
          cookie: `${WEB_SESSION_COOKIE_NAME}=token_invalido_adulterado.12345`,
        },
      })

      const guardRes = requireFinancialAuth(req)
      expect(guardRes.authorized).toBe(false)
      expect(guardRes.response?.status).toBe(401)
    })

    it('rejects request with 401 when web session cookie is expired', () => {
      const expiredToken = createWebSessionToken(-100, mockSessionSecret)
      const req = new NextRequest('https://financas.example.com/api/accounts', {
        headers: {
          cookie: `${WEB_SESSION_COOKIE_NAME}=${expiredToken}`,
        },
      })

      const guardRes = requireFinancialAuth(req)
      expect(guardRes.authorized).toBe(false)
      expect(guardRes.response?.status).toBe(401)
    })

    it('rejects request with 401 when both Web cookie and Telegram auth are absent in production', () => {
      const req = new NextRequest('https://financas.example.com/api/categories')

      const guardRes = requireFinancialAuth(req)
      expect(guardRes.authorized).toBe(false)
      expect(guardRes.response?.status).toBe(401)
    })

    it('fails safely without fallback when WEB_SESSION_SECRET is missing even if WEB_ACCESS_PASSWORD is present', () => {
      delete process.env.WEB_SESSION_SECRET
      const token = createWebSessionToken(3600, mockSessionSecret)
      const req = new NextRequest('https://financas.example.com/api/dashboard', {
        headers: {
          cookie: `${WEB_SESSION_COOKIE_NAME}=${token}`,
        },
      })

      const guardRes = requireFinancialAuth(req)
      expect(guardRes.authorized).toBe(false)
      expect(guardRes.response?.status).toBe(401)
      expect(verifyWebSessionFromRequest(req).valid).toBe(false)
      expect(verifyWebSessionFromRequest(req).error).toContain('Segredo de sessão não configurado')
    })

    it('fails createWebSessionToken when WEB_SESSION_SECRET is empty', () => {
      delete process.env.WEB_SESSION_SECRET
      expect(() => createWebSessionToken()).toThrow('WEB_SESSION_SECRET não configurado no servidor')
    })
  })
})
