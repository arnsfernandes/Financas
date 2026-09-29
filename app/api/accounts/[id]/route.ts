import { NextRequest, NextResponse } from 'next/server'
import { updateAccount, getAccountDetailsWithStats } from '@/lib/queries'
import { accountTypeSchema } from '@/lib/schema'
import { requireFinancialAuth } from '@/lib/authGuard'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = requireFinancialAuth(req)
  if (!auth.authorized) {
    return auth.response!
  }

  try {
    const id = params.id
    if (!id || typeof id !== 'string') {
      return NextResponse.json({ ok: false, error: 'ID de conta inválido' }, { status: 400 })
    }

    const account = await getAccountDetailsWithStats(id)
    if (!account) {
      return NextResponse.json({ ok: false, error: 'Conta não encontrada' }, { status: 404 })
    }

    return NextResponse.json({
      ok: true,
      account,
      transactions: account.transactions,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Falha ao buscar detalhes da conta'
    console.error('Error in GET /api/accounts/[id]:', e)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

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
    if (!id || typeof id !== 'string') {
      return NextResponse.json({ ok: false, error: 'ID de conta inválido' }, { status: 400 })
    }

    const body = await req.json()
    const updateData: Parameters<typeof updateAccount>[1] = {}

    if (body.name !== undefined) {
      if (typeof body.name !== 'string' || !body.name.trim()) {
        return NextResponse.json({ ok: false, error: 'Nome da conta não pode ser vazio' }, { status: 400 })
      }
      updateData.name = body.name.trim()
    }

    if (body.type !== undefined) {
      const typeParse = accountTypeSchema.safeParse(body.type)
      if (!typeParse.success) {
        return NextResponse.json({ ok: false, error: 'Tipo de conta inválido' }, { status: 400 })
      }
      updateData.type = typeParse.data
    }

    if (body.institution !== undefined) {
      updateData.institution = typeof body.institution === 'string' ? body.institution.trim() : null
    }

    if (body.active !== undefined) {
      updateData.active = Boolean(body.active)
    }

    if (body.closing_day !== undefined) {
      if (body.closing_day === null) {
        updateData.closing_day = null
      } else {
        const cd = parseInt(String(body.closing_day), 10)
        if (!isNaN(cd) && cd >= 1 && cd <= 31) {
          updateData.closing_day = cd
        }
      }
    }

    if (body.due_day !== undefined) {
      if (body.due_day === null) {
        updateData.due_day = null
      } else {
        const dd = parseInt(String(body.due_day), 10)
        if (!isNaN(dd) && dd >= 1 && dd <= 31) {
          updateData.due_day = dd
        }
      }
    }

    if (body.custom_logo !== undefined) {
      (updateData as any).custom_logo =
        typeof body.custom_logo === 'string' && body.custom_logo.trim() ? body.custom_logo.trim() : null
    }

    if (body.color !== undefined) {
      (updateData as any).color =
        typeof body.color === 'string' && body.color.trim() ? body.color.trim() : null
    }

    if (body.skin !== undefined) {
      (updateData as any).skin =
        typeof body.skin === 'string' && body.skin.trim() ? body.skin.trim() : null
    }

    const updated = await updateAccount(id, updateData)
    return NextResponse.json({ ok: true, account: updated })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Falha ao atualizar conta'
    console.error('Error in PATCH /api/accounts/[id]:', e)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
