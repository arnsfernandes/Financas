import { NextRequest, NextResponse } from 'next/server'
import { verifyWebSessionFromRequest } from '@/lib/webAuth'
import { getSupabaseServerClient } from '@/lib/supabaseAuth'
import { generateShortcutsToken } from '@/lib/shortcutsAuth'

/**
 * GET /api/shortcuts/token
 * Returns current user's shortcuts token information.
 */
export async function GET(req: NextRequest) {
  const session = verifyWebSessionFromRequest(req)
  if (!session.valid || !session.payload?.userId) {
    return NextResponse.json(
      { ok: false, error: 'Acesso não autorizado. Faça login para gerenciar o token.' },
      { status: 401 }
    )
  }

  const supabase = getSupabaseServerClient()
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: 'Servidor não configurado.' },
      { status: 500 }
    )
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id, shortcuts_token, shortcuts_token_created_at')
    .eq('id', session.payload.userId)
    .maybeSingle()

  if (error || !profile) {
    return NextResponse.json(
      { ok: false, error: 'Perfil do usuário não encontrado.' },
      { status: 404 }
    )
  }

  return NextResponse.json({
    ok: true,
    hasToken: Boolean(profile.shortcuts_token),
    token: profile.shortcuts_token || null,
    createdAt: profile.shortcuts_token_created_at || null,
  })
}

/**
 * POST /api/shortcuts/token
 * Generates a new secure Shortcuts token for the authenticated user.
 */
export async function POST(req: NextRequest) {
  const session = verifyWebSessionFromRequest(req)
  if (!session.valid || !session.payload?.userId) {
    return NextResponse.json(
      { ok: false, error: 'Acesso não autorizado. Faça login para gerar o token.' },
      { status: 401 }
    )
  }

  const supabase = getSupabaseServerClient()
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: 'Servidor não configurado.' },
      { status: 500 }
    )
  }

  const newToken = generateShortcutsToken()
  const now = new Date().toISOString()

  const { error } = await supabase
    .from('profiles')
    .update({
      shortcuts_token: newToken,
      shortcuts_token_created_at: now,
    })
    .eq('id', session.payload.userId)

  if (error) {
    console.error('[Shortcuts Token] Erro ao salvar token:', error)
    return NextResponse.json(
      { ok: false, error: 'Falha ao salvar novo token no banco de dados.' },
      { status: 500 }
    )
  }

  return NextResponse.json({
    ok: true,
    message: 'Token de Atalhos gerado com sucesso!',
    token: newToken,
    createdAt: now,
  })
}

/**
 * DELETE /api/shortcuts/token
 * Revokes the Shortcuts token for the authenticated user.
 */
export async function DELETE(req: NextRequest) {
  const session = verifyWebSessionFromRequest(req)
  if (!session.valid || !session.payload?.userId) {
    return NextResponse.json(
      { ok: false, error: 'Acesso não autorizado.' },
      { status: 401 }
    )
  }

  const supabase = getSupabaseServerClient()
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: 'Servidor não configurado.' },
      { status: 500 }
    )
  }

  const { error } = await supabase
    .from('profiles')
    .update({
      shortcuts_token: null,
      shortcuts_token_created_at: null,
    })
    .eq('id', session.payload.userId)

  if (error) {
    return NextResponse.json(
      { ok: false, error: 'Falha ao revogar token.' },
      { status: 500 }
    )
  }

  return NextResponse.json({
    ok: true,
    message: 'Token de Atalhos revogado com sucesso.',
  })
}
