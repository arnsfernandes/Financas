import crypto from 'node:crypto'
import { NextRequest } from 'next/server'

export interface TelegramUserData {
  id: number
  first_name?: string
  last_name?: string
  username?: string
  language_code?: string
  is_premium?: boolean
  allows_write_to_pm?: boolean
}

export interface TelegramValidationResult {
  isValid: boolean
  user: TelegramUserData | null
  authDate: Date | null
  error?: string
}

/**
 * Validates Telegram Mini App initData HMAC-SHA256 signature and freshness.
 * Standard WebApp algorithm:
 * 1. secret_key = HMAC_SHA256("WebAppData", bot_token)
 * 2. data_check_string = sorted key=value pairs joined by \n (excluding 'hash')
 * 3. hash = HMAC_SHA256(data_check_string, secret_key) (hex)
 */
export function validateTelegramInitData(
  initData: string,
  botToken: string = process.env.TELEGRAM_BOT_TOKEN || '',
  maxAgeSeconds: number = 86400, // 24 hours
): TelegramValidationResult {
  if (!initData || typeof initData !== 'string') {
    return { isValid: false, user: null, authDate: null, error: 'initData ausente ou inválido' }
  }

  if (!botToken) {
    return { isValid: false, user: null, authDate: null, error: 'TELEGRAM_BOT_TOKEN não configurado no servidor' }
  }

  try {
    const params = new URLSearchParams(initData)
    const hash = params.get('hash')
    if (!hash) {
      return { isValid: false, user: null, authDate: null, error: 'Hash de assinatura ausente no initData' }
    }

    params.delete('hash')

    // Sort keys alphabetically and join with \n
    const keys = Array.from(params.keys()).sort()
    const dataCheckString = keys.map((k) => `${k}=${params.get(k)}`).join('\n')

    // 1. Generate secret key
    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest()

    // 2. Compute HMAC of dataCheckString with secretKey
    const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex')

    // Constant-time comparison to prevent timing attacks
    const hashBuffer = Buffer.from(hash, 'hex')
    const calcBuffer = Buffer.from(calculatedHash, 'hex')

    if (hashBuffer.length !== calcBuffer.length || !crypto.timingSafeEqual(hashBuffer, calcBuffer)) {
      return { isValid: false, user: null, authDate: null, error: 'Assinatura criptográfica do Telegram inválida' }
    }

    // 3. Validate auth_date freshness
    const authDateParam = params.get('auth_date')
    if (!authDateParam) {
      return { isValid: false, user: null, authDate: null, error: 'auth_date ausente' }
    }

    const authTimestamp = parseInt(authDateParam, 10)
    if (isNaN(authTimestamp)) {
      return { isValid: false, user: null, authDate: null, error: 'auth_date inválido' }
    }

    const nowSeconds = Math.floor(Date.now() / 1000)
    if (maxAgeSeconds > 0 && nowSeconds - authTimestamp > maxAgeSeconds) {
      return { isValid: false, user: null, authDate: null, error: 'Sessão do Telegram expirada (initData muito antigo)' }
    }

    // 4. Parse user object
    const userJson = params.get('user')
    let user: TelegramUserData | null = null
    if (userJson) {
      user = JSON.parse(userJson) as TelegramUserData
    }

    return {
      isValid: true,
      user,
      authDate: new Date(authTimestamp * 1000),
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro na validação do initData'
    return { isValid: false, user: null, authDate: null, error: message }
  }
}

/**
 * Validates Telegram authorization from an incoming Next.js API request.
 * Checks initData exclusively from headers (Authorization: Bearer <initData>, tma <initData>, or x-telegram-init-data).
 * Rejects any attempt to pass initData via query string / URL parameters.
 * Validates HMAC-SHA256 signature, freshness, and enforces TELEGRAM_ALLOWED_USER_ID.
 */
export function verifyTelegramAuth(
  req: NextRequest,
  allowedUserId: string = process.env.TELEGRAM_ALLOWED_USER_ID || '',
  botToken: string = process.env.TELEGRAM_BOT_TOKEN || '',
): { authorized: boolean; error?: string; user?: TelegramUserData | null } {
  // Extract initData exclusively from headers
  const authHeader = req.headers.get('authorization') || req.headers.get('x-telegram-init-data') || ''
  let initData = ''

  if (authHeader.startsWith('Bearer ') || authHeader.startsWith('tma ')) {
    initData = authHeader.slice(authHeader.indexOf(' ') + 1).trim()
  } else if (authHeader) {
    initData = authHeader.trim()
  }

  if (!initData) {
    return {
      authorized: false,
      error: 'Autenticação do Telegram obrigatória. Header Authorization ou x-telegram-init-data ausente.',
    }
  }

  const validation = validateTelegramInitData(initData, botToken)
  if (!validation.isValid || !validation.user) {
    return {
      authorized: false,
      error: validation.error || 'Credenciais do Telegram inválidas.',
    }
  }

  if (allowedUserId && String(validation.user.id) !== allowedUserId.trim()) {
    return {
      authorized: false,
      error: `Acesso não autorizado para o Telegram ID ${validation.user.id}.`,
      user: validation.user,
    }
  }

  return {
    authorized: true,
    user: validation.user,
  }
}
