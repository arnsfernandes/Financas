import { NextRequest, NextResponse } from 'next/server'
import { deleteTransaction, updateTransaction, getTransactionById, type UpdateTransactionInput } from '@/lib/queries'
import { requireFinancialAuth } from '@/lib/authGuard'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = requireFinancialAuth(req)
  if (!auth.authorized && auth.response) {
    return auth.response
  }

  try {
    const id = params.id
    if (!id || typeof id !== 'string') {
      return NextResponse.json({ ok: false, error: 'ID de transação inválido' }, { status: 400 })
    }

    const transaction = await getTransactionById(id)
    if (!transaction) {
      return NextResponse.json({ ok: false, error: 'Transação não encontrada' }, { status: 404 })
    }

    return NextResponse.json({ ok: true, transaction })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Falha ao buscar transação'
    console.error('Error in GET /api/transactions/[id]:', e)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = requireFinancialAuth(req)
  if (!auth.authorized && auth.response) {
    return auth.response
  }

  try {
    const id = params.id
    if (!id || typeof id !== 'string') {
      return NextResponse.json({ ok: false, error: 'ID de transação inválido' }, { status: 400 })
    }

    await deleteTransaction(id)
    return NextResponse.json({ ok: true, id })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Falha ao excluir transação'
    console.error('Error in DELETE /api/transactions/[id]:', e)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = requireFinancialAuth(req)
  if (!auth.authorized && auth.response) {
    return auth.response
  }

  try {
    const id = params.id
    if (!id || typeof id !== 'string') {
      return NextResponse.json({ ok: false, error: 'ID de transação inválido' }, { status: 400 })
    }

    const body: UpdateTransactionInput = await req.json()
    const updatedTransaction = await updateTransaction(id, body)

    return NextResponse.json({ ok: true, transaction: updatedTransaction })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Falha ao atualizar transação'
    console.error('Error in PATCH /api/transactions/[id]:', e)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}


