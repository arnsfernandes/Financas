import { NextRequest, NextResponse } from 'next/server'
import { verifyTelegramAuth } from './telegramAuth'
import { verifyWebSessionFromRequest } from './webAuth'

/**
 * Checks if the request is genuinely originating from a local machine loopback
 * without traversing a reverse proxy, public host, or tunnel.
 */
export function isTrulyLocalRequest(req: NextRequest): boolean {
  // If NODE_ENV is production, never treat as local fallback
  if (process.env.NODE_ENV === 'production') {
    return false
  }

  // 1. Check for proxy headers that indicate traffic from tunnels or remote reverse proxies
  // (e.g. ngrok, cloudflare tunnels, caddy, nginx with remote IPs)
  const forwardedFor = req.headers.get('x-forwarded-for')
  const forwardedHost = req.headers.get('x-forwarded-host')
  const forwardedProto = req.headers.get('x-forwarded-proto')
  const cfConnectingIp = req.headers.get('cf-connecting-ip')
  const cfRay = req.headers.get('cf-ray')
  const ngrokTrace = req.headers.get('ngrok-trace-id') || req.headers.get('x-ngrok-skip-browser-warning')

  if (cfConnectingIp || cfRay || ngrokTrace) {
    return false
  }

  if (forwardedFor) {
    const clientIp = forwardedFor.split(',')[0].trim()
    const isLoopbackIp =
      clientIp === '127.0.0.1' ||
      clientIp === '::1' ||
      clientIp === '::ffff:127.0.0.1' ||
      clientIp === 'localhost'
    if (!isLoopbackIp) {
      return false
    }
  }

  // 2. Check Host header
  const host = (req.headers.get('host') || '').toLowerCase().split(':')[0]
  const isLocalHost = host === 'localhost' || host === '127.0.0.1' || host === '::1'

  if (!isLocalHost) {
    return false
  }

  // If forwardedHost is present, it must also be localhost
  if (forwardedHost) {
    const fHost = forwardedHost.toLowerCase().split(':')[0]
    if (fHost !== 'localhost' && fHost !== '127.0.0.1' && fHost !== '::1') {
      return false
    }
  }

  // If forwardedProto is https from outside, verify host
  return true
}

/**
 * Universal authentication guard for financial API endpoints.
 *
 * Security Requirements:
 * 1. Accepts Telegram initData via Authorization header ('Bearer <initData>' or 'tma <initData>') or 'x-telegram-init-data'.
 *    Strictly validates HMAC-SHA256 signature against TELEGRAM_BOT_TOKEN and checks TELEGRAM_ALLOWED_USER_ID.
 * 2. Accepts valid Web Session Cookie signed with WEB_SESSION_SECRET / WEB_ACCESS_PASSWORD for direct browser access.
 * 3. Fallback is ONLY allowed when the request is purely local (localhost / 127.0.0.1 in non-production).
 * 4. Returns 401 for any unauthorized, invalid or missing credentials.
 */
export function requireFinancialAuth(req: NextRequest): {
  authorized: boolean
  response?: NextResponse
  user?: { id?: string; userId?: string; username?: string; name?: string; isWebUser?: boolean }
  authType?: 'telegram' | 'web' | 'local'
  userId?: string
} {
  const authHeader = req.headers.get('authorization') || req.headers.get('x-telegram-init-data')

  // 1. If Telegram credentials are provided in headers, strictly validate HMAC and User ID
  if (authHeader) {
    const auth = verifyTelegramAuth(req)
    if (!auth.authorized) {
      return {
        authorized: false,
        response: NextResponse.json(
          { ok: false, error: auth.error || 'Acesso não autorizado via Telegram.' },
          { status: 401 }
        ),
      }
    }
    // For Telegram, map to default owner user ID
    const defaultOwnerId = 'bc5a76de-8865-4ec3-b7d5-5dfbfb8123a6'
    return {
      authorized: true,
      user: { ...(auth.user as any), telegramId: auth.user?.id, userId: defaultOwnerId },
      authType: 'telegram',
      userId: defaultOwnerId,
    }
  }

  // 2. Check for Web session cookie (independent direct browser login)
  const webAuth = verifyWebSessionFromRequest(req)
  if (webAuth.valid && webAuth.payload) {
    const userId = webAuth.payload.userId || 'bc5a76de-8865-4ec3-b7d5-5dfbfb8123a6'
    return {
      authorized: true,
      user: {
        id: userId,
        userId: userId,
        username: webAuth.payload.username,
        name: webAuth.payload.name,
        isWebUser: true,
      },
      authType: 'web',
      userId,
    }
  }

  // 3. In local development without proxies, allow loopback access
  if (isTrulyLocalRequest(req)) {
    const defaultOwnerId = 'bc5a76de-8865-4ec3-b7d5-5dfbfb8123a6'
    return {
      authorized: true,
      user: { id: defaultOwnerId, userId: defaultOwnerId, username: 'local_dev' },
      authType: 'local',
      userId: defaultOwnerId,
    }
  }

  // 4. Any remote, proxy, tunnel, public host or production request without valid Telegram or Web auth is rejected
  const detailedError = webAuth.error && webAuth.error !== 'Cookie de sessão não encontrado'
    ? `Autenticação inválida: ${webAuth.error}`
    : 'Autenticação obrigatória. Acesso bloqueado para requisições externas sem credencial válida.'

  return {
    authorized: false,
    response: NextResponse.json(
      {
        ok: false,
        error: detailedError,
      },
      { status: 401 }
    ),
  }
}

