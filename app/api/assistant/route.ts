import { NextRequest, NextResponse } from 'next/server'
import { requireFinancialAuth } from '@/lib/authGuard'
import { executeAssistantQuery } from '@/lib/assistant'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const auth = requireFinancialAuth(req)
  if (!auth.authorized && auth.response) {
    return auth.response
  }

  try {
    const body = await req.json()
    const message = body?.message || body?.text
    const context = body?.context || null

    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { ok: false, error: 'Mensagem não fornecida ou inválida.' },
        { status: 400 }
      )
    }

    const reply = await executeAssistantQuery(message, context)

    return NextResponse.json({
      ok: true,
      reply,
    })
  } catch (error) {
    console.error('Error in /api/assistant:', error)
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Falha ao processar mensagem do assistente.',
      },
      { status: 500 }
    )
  }
}
