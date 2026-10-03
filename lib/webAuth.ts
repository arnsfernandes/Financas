import crypto from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'

export const WEB_SESSION_COOKIE_NAME = 'financas_web_session'
export const DEFAULT_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30 // 30 days

export interface WebSessionPayload {
  authenticated: true
  userId?: string
  username?: string
  name?: string
  issuedAt: number // timestamp in seconds
  expiresAt: number // timestamp in seconds
}

/**
 * Gets the session signing secret strictly from WEB_SESSION_SECRET.
 * Fallback to a derived secret or warning if not configured in development.
 */
export function getWebSessionSecret(): string {
  const secret = process.env.WEB_SESSION_SECRET?.trim() || ''
  return secret
}

/**
 * Creates a signed web session token: base64(payload).signature
 */
export function createWebSessionToken(
  maxAgeSeconds: number = DEFAULT_SESSION_MAX_AGE_SECONDS,
  secret: string = getWebSessionSecret(),
  userData?: { userId?: string; username?: string; name?: string }
): string {
  if (!secret) {
    throw new Error('WEB_SESSION_SECRET não configurado no servidor')
  }

  const now = Math.floor(Date.now() / 1000)
  const payload: WebSessionPayload = {
    authenticated: true,
    userId: userData?.userId,
    username: userData?.username,
    name: userData?.name,
    issuedAt: now,
    expiresAt: now + maxAgeSeconds,
  }

  const payloadStr = JSON.stringify(payload)
  const payloadBase64 = Buffer.from(payloadStr, 'utf-8').toString('base64url')
  const signature = crypto.createHmac('sha256', secret).update(payloadBase64).digest('base64url')

  return `${payloadBase64}.${signature}`
}

/**
 * Validates a signed web session token.
 */
export function verifyWebSessionToken(
  token: string | undefined | null,
  secret: string = getWebSessionSecret()
): { valid: boolean; payload?: WebSessionPayload; error?: string } {
  if (!token || typeof token !== 'string') {
    return { valid: false, error: 'Token de sessão ausente' }
  }

  if (!secret) {
    return { valid: false, error: 'Segredo de sessão não configurado no servidor' }
  }

  const parts = token.split('.')
  if (parts.length !== 2) {
    return { valid: false, error: 'Formato de token inválido' }
  }

  const [payloadBase64, providedSignature] = parts

  // 1. Verify HMAC signature using constant-time comparison
  const expectedSignature = crypto.createHmac('sha256', secret).update(payloadBase64).digest('base64url')
  const providedBuffer = Buffer.from(providedSignature, 'utf-8')
  const expectedBuffer = Buffer.from(expectedSignature, 'utf-8')

  if (providedBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(providedBuffer, expectedBuffer)) {
    return { valid: false, error: 'Assinatura de sessão inválida ou adulterada' }
  }

  // 2. Parse payload
  try {
    const payloadStr = Buffer.from(payloadBase64, 'base64url').toString('utf-8')
    const payload = JSON.parse(payloadStr) as WebSessionPayload

    if (!payload || !payload.authenticated || typeof payload.expiresAt !== 'number') {
      return { valid: false, error: 'Conteúdo de sessão inválido' }
    }

    const now = Math.floor(Date.now() / 1000)
    if (payload.expiresAt < now) {
      return { valid: false, error: 'Sessão expirada' }
    }

    return { valid: true, payload }
  } catch {
    return { valid: false, error: 'Falha ao decodificar sessão' }
  }
}

/**
 * Validates password against WEB_ACCESS_PASSWORD using constant-time comparison (legacy/fallback).
 */
export function verifyWebPassword(inputPassword: string): boolean {
  const configuredPassword = process.env.WEB_ACCESS_PASSWORD?.trim() || ''
  if (!configuredPassword || !inputPassword) {
    return false
  }

  const inputBuffer = Buffer.from(inputPassword.trim(), 'utf-8')
  const configuredBuffer = Buffer.from(configuredPassword, 'utf-8')

  if (inputBuffer.length !== configuredBuffer.length) {
    return false
  }

  return crypto.timingSafeEqual(inputBuffer, configuredBuffer)
}

/**
 * Extracts and verifies web session from request cookies.
 */
export function verifyWebSessionFromRequest(
  req: NextRequest,
  secret: string = getWebSessionSecret()
): { valid: boolean; payload?: WebSessionPayload; error?: string } {
  const cookieToken = req.cookies.get(WEB_SESSION_COOKIE_NAME)?.value
  if (!cookieToken) {
    return { valid: false, error: 'Cookie de sessão não encontrado' }
  }

  return verifyWebSessionToken(cookieToken, secret)
}

/**
 * Attaches the web session cookie to a NextResponse.
 */
export function attachWebSessionCookie(
  response: NextResponse,
  token: string,
  maxAgeSeconds: number = DEFAULT_SESSION_MAX_AGE_SECONDS
): void {
  const isProduction = process.env.NODE_ENV === 'production'
  response.cookies.set({
    name: WEB_SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: maxAgeSeconds,
  })
}

/**
 * Clears the web session cookie from a NextResponse.
 */
export function clearWebSessionCookie(response: NextResponse): void {
  const isProduction = process.env.NODE_ENV === 'production'
  response.cookies.set({
    name: WEB_SESSION_COOKIE_NAME,
    value: '',
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
}
