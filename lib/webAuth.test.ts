import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  usernameToEmail,
  emailToUsername,
  validateUsername,
  SUPABASE_EMAIL_DOMAIN,
} from './supabaseAuth'
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

describe('Supabase Auth & Web Auth Helpers Suite', () => {
  const originalEnv = process.env
  const mockPassword = 'minha-senha-secreta-de-teste'
  const mockSessionSecret = 'segredo-hmac-longo-para-sessoes-web-12345'
  const mockBotToken = '123456789:ABCdefGHIjklMNOpqrsTUVwxyz'
  const allowedUserId = '997305354'

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      WEB_ACCESS_PASSWORD: mockPassword,
      WEB_SESSION_SECRET: mockSessionSecret,
      TELEGRAM_BOT_TOKEN: mockBotToken,
      TELEGRAM_ALLOWED_USER_ID: allowedUserId,
      NODE_ENV: 'production',
    }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe('Supabase Username to Email translation', () => {
    it('correctly adapts username to <username>@financas.local technical email format', () => {
      expect(usernameToEmail('arnaldo')).toBe(`arnaldo@${SUPABASE_EMAIL_DOMAIN}`)
      expect(usernameToEmail('Arnaldo.Fernandes')).toBe(`arnaldo.fernandes@${SUPABASE_EMAIL_DOMAIN}`)
      expect(usernameToEmail('  user_123  ')).toBe(`user_123@${SUPABASE_EMAIL_DOMAIN}`)
    })

    it('reverses technical email to username', () => {
      expect(emailToUsername(`arnaldo@${SUPABASE_EMAIL_DOMAIN}`)).toBe('arnaldo')
      expect(emailToUsername('outro@externo.com')).toBe('outro@externo.com')
    })

    it('validates username restrictions', () => {
      expect(validateUsername('arnaldo').valid).toBe(true)
      expect(validateUsername('user-123').valid).toBe(true)
      expect(validateUsername('user.name').valid).toBe(true)
      expect(validateUsername('ab').valid).toBe(false) // too short (< 3)
      expect(validateUsername('').valid).toBe(false)
      expect(validateUsername('invalid user!').valid).toBe(false) // spaces / symbols
    })
  })

  describe('Web Session Token with User Identity Payload', () => {
    it('creates and verifies token with user payload', () => {
      const token = createWebSessionToken(3600, mockSessionSecret, {
        userId: 'uuid-1234',
        username: 'arnaldo',
        name: 'Arnaldo Fernandes',
      })
      const res = verifyWebSessionToken(token, mockSessionSecret)

      expect(res.valid).toBe(true)
      expect(res.payload?.authenticated).toBe(true)
      expect(res.payload?.userId).toBe('uuid-1234')
      expect(res.payload?.username).toBe('arnaldo')
      expect(res.payload?.name).toBe('Arnaldo Fernandes')
    })

    it('rejects tampered token', () => {
      const token = createWebSessionToken(3600, mockSessionSecret)
      const [payload, signature] = token.split('.')
      const tampered = `${payload}.${signature}abc`
      expect(verifyWebSessionToken(tampered, mockSessionSecret).valid).toBe(false)
    })

    it('rejects expired token', () => {
      const token = createWebSessionToken(-10, mockSessionSecret)
      expect(verifyWebSessionToken(token, mockSessionSecret).valid).toBe(false)
    })
  })

  describe('Cookie Attachment & Dual Auth Guard', () => {
    it('attaches and clears cookie properly', () => {
      const res = NextResponse.json({ ok: true })
      attachWebSessionCookie(res, 'test-val', 3600)
      const cookie = res.cookies.get(WEB_SESSION_COOKIE_NAME)
      expect(cookie?.value).toBe('test-val')
      expect(cookie?.httpOnly).toBe(true)

      clearWebSessionCookie(res)
      expect(res.cookies.get(WEB_SESSION_COOKIE_NAME)?.value).toBe('')
    })

    it('authorizes request when valid cookie is present', () => {
      const token = createWebSessionToken(3600, mockSessionSecret, {
        username: 'arnaldo',
      })
      const req = new NextRequest('https://financas.example.com/api/dashboard', {
        headers: {
          cookie: `${WEB_SESSION_COOKIE_NAME}=${token}`,
        },
      })
      const guardRes = requireFinancialAuth(req)
      expect(guardRes.authorized).toBe(true)
      expect(guardRes.authType).toBe('web')
    })
  })
})
