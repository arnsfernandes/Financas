import { NextRequest } from 'next/server'
import crypto from 'node:crypto'
import { getSupabaseServerClient } from './supabaseAuth'

export interface ShortcutsAuthResult {
  authorized: boolean
  user?: {
    id: string
    username: string
    name: string
  }
  error?: string
}

/**
 * Generates a secure random Shortcuts token.
 * Format: fnc_st_<hex_string>
 */
export function generateShortcutsToken(): string {
  const random = crypto.randomBytes(24).toString('hex')
  return `fnc_st_${random}`
}

/**
 * Verifies Shortcuts Bearer token from incoming NextRequest.
 * Enforces Authorization: Bearer <token> or x-shortcuts-token.
 */
export async function verifyShortcutsAuth(req: NextRequest): Promise<ShortcutsAuthResult> {
  const authHeader = req.headers.get('authorization') || req.headers.get('x-shortcuts-token')

  if (!authHeader) {
    return {
      authorized: false,
      error: 'Token de autorização não fornecido. Envie o cabeçalho Authorization: Bearer <seu_token>.',
    }
  }

  let token = authHeader.trim()
  if (token.toLowerCase().startsWith('bearer ')) {
    token = token.slice(7).trim()
  }

  if (!token) {
    return {
      authorized: false,
      error: 'Token de autorização vazio.',
    }
  }

  const supabase = getSupabaseServerClient()
  if (!supabase) {
    return {
      authorized: false,
      error: 'Serviço de autenticação não configurado no servidor.',
    }
  }

  try {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('id, username, name, shortcuts_token')
      .eq('shortcuts_token', token)
      .maybeSingle()

    if (error || !profile) {
      return {
        authorized: false,
        error: 'Token de Atalhos inválido ou revogado. Gere um novo token no painel do Finanças.',
      }
    }

    return {
      authorized: true,
      user: {
        id: profile.id,
        username: profile.username,
        name: profile.name,
      },
    }
  } catch (err: any) {
    return {
      authorized: false,
      error: err?.message || 'Erro ao validar token de Atalhos.',
    }
  }
}
