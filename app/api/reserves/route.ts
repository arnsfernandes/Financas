import { NextRequest, NextResponse } from 'next/server'
import { getReserves, createReserve } from '@/lib/reserves'
import { requireFinancialAuth } from '@/lib/authGuard'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = requireFinancialAuth(req)
  if (!auth.authorized && auth.response) {
    return auth.response
  }

  try {
    const reserves = await getReserves(auth.userId)
    const totalSaved = reserves.reduce((acc, r) => acc + (Number(r.currentBalance) || 0), 0)
    return NextResponse.json({ ok: true, reserves, totalSaved })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Falha ao buscar reservas'
    console.error('Error in GET /api/reserves:', e)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const auth = requireFinancialAuth(req)
  if (!auth.authorized && auth.response) {
    return auth.response
  }

  try {
    const body = await req.json()
    if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
      return NextResponse.json({ ok: false, error: 'Nome da reserva é obrigatório' }, { status: 400 })
    }

    const reserve = await createReserve({
      userId: auth.userId,
      name: body.name.trim(),
      initialBalance: body.initialBalance !== undefined ? Number(body.initialBalance) : 0,
      targetAmount: body.targetAmount ? Number(body.targetAmount) : null,
      notes: body.notes,
      fromAccount: body.fromAccount,
    })

    return NextResponse.json({ ok: true, reserve }, { status: 201 })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Falha ao criar reserva'
    console.error('Error in POST /api/reserves:', e)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
