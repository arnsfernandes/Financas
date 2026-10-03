import { NextRequest, NextResponse } from 'next/server'
import { requireFinancialAuth } from '@/lib/authGuard'
import { savePushSubscription, deletePushSubscription } from '@/lib/webPush'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY || ''
  return NextResponse.json({
    ok: true,
    publicKey,
  })
}

export async function POST(req: NextRequest) {
  const auth = requireFinancialAuth(req)
  if (!auth.authorized || !auth.userId) {
    return auth.response || NextResponse.json({ ok: false, error: 'Não autorizado.' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { subscription } = body

    if (!subscription || !subscription.endpoint || !subscription.keys) {
      return NextResponse.json(
        { ok: false, error: 'Dados da subscription inválidos.' },
        { status: 400 }
      )
    }

    const userAgent = req.headers.get('user-agent')

    const saved = await savePushSubscription({
      userId: auth.userId,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      userAgent,
    })

    if (!saved) {
      return NextResponse.json(
        { ok: false, error: 'Falha ao salvar a inscrição push no banco.' },
        { status: 500 }
      )
    }

    return NextResponse.json({ ok: true, message: 'Inscrição push salva com sucesso.' })
  } catch (error) {
    console.error('Error in /api/push/subscribe:', error)
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Erro ao processar inscrição push.' },
      { status: 500 }
    )
  }
}

export async function DELETE(req: NextRequest) {
  const auth = requireFinancialAuth(req)
  if (!auth.authorized) {
    return auth.response || NextResponse.json({ ok: false, error: 'Não autorizado.' }, { status: 401 })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const endpoint = body?.endpoint
    if (!endpoint) {
      return NextResponse.json({ ok: false, error: 'Endpoint não fornecido.' }, { status: 400 })
    }

    await deletePushSubscription(endpoint)
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error in DELETE /api/push/subscribe:', error)
    return NextResponse.json({ ok: false, error: 'Erro ao remover inscrição push.' }, { status: 500 })
  }
}
