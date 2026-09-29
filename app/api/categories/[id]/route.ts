import { NextRequest, NextResponse } from 'next/server'
import { updateCategory } from '@/lib/queries'
import { requireFinancialAuth } from '@/lib/authGuard'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = requireFinancialAuth(req)
  if (!auth.authorized) {
    return auth.response!
  }

  try {
    const id = params.id
    if (!id || typeof id !== 'string') {
      return NextResponse.json({ ok: false, error: 'ID de categoria inválido' }, { status: 400 })
    }

    const body = await req.json()
    const { name, icon, color, active, sortOrder } = body

    const updated = await updateCategory(id, {
      name,
      icon,
      color,
      active,
      sortOrder,
    })

    return NextResponse.json({ ok: true, category: updated })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Falha ao atualizar categoria'
    console.error('Error in PATCH /api/categories/[id]:', e)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
