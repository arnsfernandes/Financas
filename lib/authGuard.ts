import { NextRequest, NextResponse } from 'next/server'
import { verifyTelegramAuth } from './telegramAuth'

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
 * 1. Only accepts Telegram initData via Authorization header ('Bearer <initData>' or 'tma <initData>') or 'x-telegram-init-data'.
 *    NEVER accepts initData via query string / URL parameters.
 * 2. Strictly validates HMAC-SHA256 signature against TELEGRAM_BOT_TOKEN.
 * 3. Enforces session freshness (auth_date maximum age).
 * 4. Strictly enforces that the parsed user ID matches TELEGRAM_ALLOWED_USER_ID.
 * 5. Returns 401 (or 403) for any request missing signature, with invalid signature, expired date, or unauthorized user ID.
 * 6. Fallback is ONLY allowed when the request is purely local (localhost / 127.0.0.1 in non-production).
 */
export function requireFinancialAuth(req: NextRequest): { authorized: boolean; response?: NextResponse; user?: any } {
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
    return { authorized: true, user: auth.user }
  }

  // 2. If no Telegram credentials, check if the request is TRULY local in development
  if (isTrulyLocalRequest(req)) {
    return { authorized: true }
  }

  // 3. Any remote, proxy, tunnel, public host or production request without valid Telegram auth is rejected
  return {
    authorized: false,
    response: NextResponse.json(
      {
        ok: false,
        error: 'Autenticação do Telegram obrigatória. Acesso bloqueado para requisições externas sem assinatura válida.',
      },
      { status: 401 }
    ),
  }
}
