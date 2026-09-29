import { NextRequest, NextResponse } from 'next/server'
import { updateReserve, deleteReserve } from '@/lib/reserves'
import { requireFinancialAuth } from '@/lib/authGuard'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function PATCH(
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
    const updated = await updateReserve(id, {
      name: body.name,
      targetAmount: body.targetAmount !== undefined ? (body.targetAmount ? Number(body.targetAmount) : null) : undefined,
    })

    return NextResponse.json({ ok: true, reserve: updated })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Falha ao atualizar reserva'
    console.error('Error in PATCH /api/reserves/[id]:', e)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

export async function DELETE(
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

    const success = await deleteReserve(id)
    return NextResponse.json({ ok: success })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Falha ao excluir reserva'
    console.error('Error in DELETE /api/reserves/[id]:', e)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
