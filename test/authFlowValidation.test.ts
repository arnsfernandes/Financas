import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { usernameToEmail, emailToUsername, validateUsername } from '../lib/supabaseAuth'
import {
  createWebSessionToken,
  verifyWebSessionToken,
  attachWebSessionCookie,
  clearWebSessionCookie,
  WEB_SESSION_COOKIE_NAME,
} from '../lib/webAuth'
import { requireFinancialAuth } from '../lib/authGuard'
import { NextRequest, NextResponse } from 'next/server'

describe('End-to-End Auth Standards & Requirements Suite', () => {
  const originalEnv = process.env
  const mockSecret = 'super-secret-test-key-for-hmac-sessions'

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      WEB_SESSION_SECRET: mockSecret,
      NODE_ENV: 'production',
    }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('adapts username to internal technical email format <username>@financas.local without exposing email to user', () => {
    expect(usernameToEmail('mariasilva')).toBe('mariasilva@financas.local')
    expect(usernameToEmail('  Joao_123  ')).toBe('joao_123@financas.local')
    expect(emailToUsername('mariasilva@financas.local')).toBe('mariasilva')
  })

  it('enforces username constraints: minimum 3 chars, alphanumeric with dots and underscores', () => {
    expect(validateUsername('usr').valid).toBe(true)
    expect(validateUsername('usuario.teste_123').valid).toBe(true)
    expect(validateUsername('').valid).toBe(false)
    expect(validateUsername('ab').valid).toBe(false)
    expect(validateUsername('user name with spaces').valid).toBe(false)
  })

  it('blocks unauthenticated requests to protected endpoints in production', () => {
    const unauthReq = new NextRequest('https://financas.example.com/api/dashboard')
    const authResult = requireFinancialAuth(unauthReq)

    expect(authResult.authorized).toBe(false)
    expect(authResult.response?.status).toBe(401)
  })

  it('allows access to protected endpoints when valid session cookie is present', () => {
    const token = createWebSessionToken(3600, mockSecret, {
      userId: 'test-user-id-uuid',
      username: 'usuario.valido',
      name: 'Usuário Válido',
    })

    const authReq = new NextRequest('https://financas.example.com/api/dashboard', {
      headers: {
        cookie: `${WEB_SESSION_COOKIE_NAME}=${token}`,
      },
    })

    const authResult = requireFinancialAuth(authReq)
    expect(authResult.authorized).toBe(true)
    expect(authResult.authType).toBe('web')
  })

  it('attaches and removes session cookies correctly on login and logout', () => {
    const loginRes = NextResponse.json({ ok: true })
    const token = createWebSessionToken(3600, mockSecret, { username: 'test' })
    attachWebSessionCookie(loginRes, token, 3600)

    const cookie = loginRes.cookies.get(WEB_SESSION_COOKIE_NAME)
    expect(cookie?.value).toBe(token)
    expect(cookie?.httpOnly).toBe(true)

    const logoutRes = NextResponse.json({ ok: true })
    clearWebSessionCookie(logoutRes)
    const clearedCookie = logoutRes.cookies.get(WEB_SESSION_COOKIE_NAME)
    expect(clearedCookie?.value).toBe('')
    expect(clearedCookie?.maxAge).toBe(0)
  })

  it('rejects expired or tampered session tokens', () => {
    const expiredToken = createWebSessionToken(-100, mockSecret, { username: 'test' })
    expect(verifyWebSessionToken(expiredToken, mockSecret).valid).toBe(false)

    const validToken = createWebSessionToken(3600, mockSecret, { username: 'test' })
    const tamperedToken = validToken + 'forged'
    expect(verifyWebSessionToken(tamperedToken, mockSecret).valid).toBe(false)
  })
})
