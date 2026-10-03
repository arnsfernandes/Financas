import { NextRequest, NextResponse } from 'next/server'
import { listAccountsWithStats, createAccount } from '@/lib/queries'
import { accountTypeSchema } from '@/lib/schema'
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
    const activeOnly = searchParams.get('active') === 'true'
    const accounts = await listAccountsWithStats({ activeOnly, userId: auth.userId })
    return NextResponse.json({ ok: true, accounts })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to fetch accounts'
    console.error('Error in GET /api/accounts:', e)
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
      return NextResponse.json({ ok: false, error: 'Nome da conta é obrigatório' }, { status: 400 })
    }

    const typeParse = accountTypeSchema.safeParse(body.type)
    if (!typeParse.success) {
      return NextResponse.json(
        { ok: false, error: 'Tipo de conta inválido. Use bank_account, cash, credit_card, debit_card, digital_wallet ou other' },
        { status: 400 }
      )
    }

    let closing_day: number | undefined = undefined
    let due_day: number | undefined = undefined
    if (body.closing_day !== undefined && body.closing_day !== null) {
      const cd = parseInt(String(body.closing_day), 10)
      if (!isNaN(cd) && cd >= 1 && cd <= 31) closing_day = cd
    }
    if (body.due_day !== undefined && body.due_day !== null) {
      const dd = parseInt(String(body.due_day), 10)
      if (!isNaN(dd) && dd >= 1 && dd <= 31) due_day = dd
    }

    const custom_logo = typeof body.custom_logo === 'string' && body.custom_logo.trim() ? body.custom_logo.trim() : null
    const color = typeof body.color === 'string' && body.color.trim() ? body.color.trim() : null
    const skin = typeof body.skin === 'string' && body.skin.trim() ? body.skin.trim() : null

    const account = await createAccount({
      userId: auth.userId,
      name: body.name.trim(),
      type: typeParse.data,
      institution: typeof body.institution === 'string' ? body.institution.trim() : null,
      active: body.active !== undefined ? Boolean(body.active) : true,
      closing_day,
      due_day,
      custom_logo,
      color,
      skin,
    })

    return NextResponse.json({ ok: true, account }, { status: 201 })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to create account'
    console.error('Error in POST /api/accounts:', e)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
