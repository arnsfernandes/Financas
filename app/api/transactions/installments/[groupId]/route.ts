import { NextRequest, NextResponse } from 'next/server'
import { deleteInstallmentGroup } from '@/lib/queries'
import { requireFinancialAuth } from '@/lib/authGuard'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function DELETE(
  req: NextRequest,
  { params }: { params: { groupId: string } },
) {
  const auth = requireFinancialAuth(req)
  if (!auth.authorized && auth.response) {
    return auth.response
  }

  try {
    const groupId = params.groupId
    if (!groupId || typeof groupId !== 'string') {
      return NextResponse.json({ ok: false, error: 'ID do parcelamento inválido' }, { status: 400 })
    }

    await deleteInstallmentGroup(groupId)
    return NextResponse.json({ ok: true, groupId })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Falha ao excluir grupo de parcelamento'
    console.error('Error in DELETE /api/transactions/installments/[groupId]:', e)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
