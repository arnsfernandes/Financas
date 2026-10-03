import { NextRequest, NextResponse } from 'next/server'
import { addReserveMovement } from '@/lib/reserves'
import { requireFinancialAuth } from '@/lib/authGuard'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = requireFinancialAuth(req)
  if (!auth.authorized) {
    return auth.response!
  }

  try {
    const id = params.id
    if (!id) {
      return NextResponse.json({ ok: false, error: 'ID da reserva é obrigatório' }, { status: 400 })
    }

    const body = await req.json()
    const { type, amount, date, notes, fromAccount } = body

    if (type !== 'deposit' && type !== 'withdrawal') {
      return NextResponse.json(
        { ok: false, error: 'Tipo de movimentação inválido. Use deposit (aporte) ou withdrawal (retirada).' },
        { status: 400 }
      )
    }

    const numAmount = Number(amount)
    if (!numAmount || numAmount <= 0) {
      return NextResponse.json({ ok: false, error: 'O valor deve ser maior que zero.' }, { status: 400 })
    }

    const result = await addReserveMovement(id, {
      userId: auth.userId,
      type,
      amount: numAmount,
      date,
      notes,
      fromAccount,
    })

    return NextResponse.json({ ok: true, ...result }, { status: 201 })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Falha ao processar movimentação na reserva'
    console.error('Error in POST /api/reserves/[id]/movements:', e)
    return NextResponse.json({ ok: false, error: message }, { status: 400 })
  }
}
