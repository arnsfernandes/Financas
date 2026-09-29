import { NextRequest, NextResponse } from 'next/server'
import { verifyWebPassword, createWebSessionToken, attachWebSessionCookie } from '@/lib/webAuth'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const { password } = body

    if (!password || typeof password !== 'string') {
      return NextResponse.json(
        { ok: false, error: 'Senha não informada.' },
        { status: 400 }
      )
    }

    if (!process.env.WEB_ACCESS_PASSWORD || !process.env.WEB_SESSION_SECRET) {
      console.error('[WebAuth] WEB_ACCESS_PASSWORD ou WEB_SESSION_SECRET não configuradas no servidor.')
      return NextResponse.json(
        { ok: false, error: 'Autenticação web não configurada no servidor.' },
        { status: 500 }
      )
    }

    const isValid = verifyWebPassword(password)
    if (!isValid) {
      return NextResponse.json(
        { ok: false, error: 'Senha incorreta.' },
        { status: 401 }
      )
    }

    const token = createWebSessionToken()
    const response = NextResponse.json({
      ok: true,
      message: 'Login realizado com sucesso.',
    })

    attachWebSessionCookie(response, token)
    return response
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error.message || 'Erro interno ao processar login.' },
      { status: 500 }
    )
  }
}
