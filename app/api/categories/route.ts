import { NextRequest, NextResponse } from 'next/server'
import { listCategories, createCategory } from '@/lib/queries'
import { requireFinancialAuth } from '@/lib/authGuard'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = requireFinancialAuth(req)
  if (!auth.authorized && auth.response) {
    return auth.response
  }

  try {
    const { searchParams } = new URL(req.url)
    const typeParam = searchParams.get('type')
    const type = typeParam === 'expense' || typeParam === 'income' || typeParam === 'all' ? typeParam : undefined
    const activeOnly = searchParams.get('activeOnly') === 'true' || searchParams.get('active_only') === 'true'

    const categories = await listCategories({ type, activeOnly })
    return NextResponse.json({ ok: true, categories })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Falha ao listar categorias'
    console.error('Error in GET /api/categories:', e)
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
    const { name, type, icon, color, sortOrder } = body

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ ok: false, error: 'O nome da categoria é obrigatório.' }, { status: 400 })
    }

    if (type !== 'expense' && type !== 'income') {
      return NextResponse.json({ ok: false, error: 'O tipo deve ser "expense" ou "income".' }, { status: 400 })
    }

    const category = await createCategory({
      name,
      type,
      icon,
      color,
      sortOrder,
    })

    return NextResponse.json({ ok: true, category }, { status: 201 })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Falha ao criar categoria'
    console.error('Error in POST /api/categories:', e)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
