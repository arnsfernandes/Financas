import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export const SUPABASE_EMAIL_DOMAIN = 'financas.local'

/**
 * Converts a plain username into an internal technical Supabase auth email.
 * e.g. "arnaldo" -> "arnaldo@financas.local"
 */
export function usernameToEmail(username: string): string {
  const sanitized = username.trim().toLowerCase()
  return `${sanitized}@${SUPABASE_EMAIL_DOMAIN}`
}

/**
 * Extracts username from technical email if matching domain.
 * e.g. "arnaldo@financas.local" -> "arnaldo"
 */
export function emailToUsername(email: string): string {
  if (!email) return ''
  const [user, domain] = email.toLowerCase().split('@')
  if (domain === SUPABASE_EMAIL_DOMAIN) {
    return user
  }
  return email
}

/**
 * Validates a username format.
 * Must be 3-30 characters, alphanumeric, underscores, hyphens, or dots.
 */
export function validateUsername(username: string): { valid: boolean; error?: string } {
  const trimmed = username.trim()
  if (!trimmed) {
    return { valid: false, error: 'O nome de usuário é obrigatório.' }
  }
  if (trimmed.length < 3) {
    return { valid: false, error: 'O nome de usuário deve ter pelo menos 3 caracteres.' }
  }
  if (trimmed.length > 30) {
    return { valid: false, error: 'O nome de usuário deve ter no máximo 30 caracteres.' }
  }
  if (!/^[a-zA-Z0-9._-]+$/.test(trimmed)) {
    return { valid: false, error: 'O nome de usuário pode conter apenas letras, números, pontos, hífens e sublinhados.' }
  }
  return { valid: true }
}

let serverClient: SupabaseClient | null = null

/**
 * Supabase client for Server / API routes using SERVICE_ROLE_KEY (bypasses RLS / admin tasks)
 * or ANON_KEY.
 */
export function getSupabaseServerClient(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    return null
  }

  if (!serverClient) {
    serverClient = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      global: {
        fetch: (input, init) => {
          return fetch(input, {
            ...init,
            cache: 'no-store',
          })
        },
      },
    })
  }

  return serverClient
}
