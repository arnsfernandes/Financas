import { NextRequest, NextResponse } from 'next/server'
import { requireFinancialAuth } from '@/lib/authGuard'
import { getSetting, setSetting, type SettingKey } from '@/lib/userSettings'

export const runtime = 'nodejs'

const KEYS: SettingKey[] = ['budgets', 'bank_ignore']

/** GET /api/settings?key=budgets → { ok, value, available } */
export async function GET(req: NextRequest) {
  const auth = requireFinancialAuth(req)
  if (!auth.authorized) return auth.response!
  const key = new URL(req.url).searchParams.get('key') as SettingKey
  if (!KEYS.includes(key)) return NextResponse.json({ ok: false, error: 'Chave inválida.' }, { status: 400 })
  const r = await getSetting(auth.userId!, key)
  return NextResponse.json({ ok: true, value: r.value, available: r.available })
}

/** POST /api/settings { key, value } */
export async function POST(req: NextRequest) {
  const auth = requireFinancialAuth(req)
  if (!auth.authorized) return auth.response!
  const body = await req.json().catch(() => ({}))
  if (!KEYS.includes(body.key)) return NextResponse.json({ ok: false, error: 'Chave inválida.' }, { status: 400 })
  if (body.key === 'budgets') {
    const clean: Record<string, number> = {}
    for (const [k, v] of Object.entries(body.value || {})) {
      const n = Number(v)
      if (k && Number.isFinite(n) && n > 0) clean[k] = Math.round(n * 100) / 100
    }
    body.value = clean
  }
  const r = await setSetting(auth.userId!, body.key, body.value)
  if (!r.ok) {
    return NextResponse.json(
      { ok: false, missingTable: r.missingTable, error: r.missingTable ? 'Ative as preferências aplicando a migração user_settings no Supabase.' : r.error },
      { status: r.missingTable ? 409 : 500 },
    )
  }
  return NextResponse.json({ ok: true })
}
