import { NextRequest, NextResponse } from 'next/server'
import { requireFinancialAuth } from '@/lib/authGuard'

export const runtime = 'nodejs'

/**
 * Revisão de categorias por loja.
 * GET: cada loja uma vez, com a categoria atual, quantidade e total (parcelas contam como uma compra).
 * POST { vendor, category }: aplica a categoria a todos os lançamentos dessa loja e lembra para o futuro.
 */
export async function GET(req: NextRequest) {
  const auth = requireFinancialAuth(req)
  if (!auth.authorized) return auth.response!
  const { getSupabaseClient } = await import('@/lib/persist')
  const { normalizeVendor } = await import('@/lib/duplicate')
  const { listCategories } = await import('@/lib/queries')
  const supabase = getSupabaseClient()
  if (!supabase) return NextResponse.json({ ok: false, error: 'Banco indisponível.' }, { status: 500 })
  const rows: any[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('transactions')
      .select('vendor, category, total, date, installment_current, payment_method')
      .eq('user_id', auth.userId!).eq('type', 'expense').gt('total', 0).range(from, from + 999)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    rows.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  const groups = new Map<string, { vendor: string; categories: Map<string, number>; count: number; total: number; lastDate: string; methods: Set<string> }>()
  for (const r of rows) {
    if (Number(r.installment_current) > 1) continue
    const key = normalizeVendor(r.vendor)
    if (!key) continue
    const g = groups.get(key) || { vendor: r.vendor, categories: new Map(), count: 0, total: 0, lastDate: '', methods: new Set<string>() }
    g.count++
    g.total += Number(r.total) || 0
    g.categories.set(r.category || 'Outros', (g.categories.get(r.category || 'Outros') || 0) + 1)
    if (String(r.date) > g.lastDate) g.lastDate = String(r.date)
    if (r.payment_method) g.methods.add(r.payment_method)
    groups.set(key, g)
  }
  const vendors = Array.from(groups.values())
    .map((g) => ({
      vendor: g.vendor,
      category: Array.from(g.categories.entries()).sort((a, b) => b[1] - a[1])[0][0],
      mixed: g.categories.size > 1,
      count: g.count,
      total: Math.round(g.total * 100) / 100,
      lastDate: g.lastDate,
      methods: Array.from(g.methods),
    }))
    .sort((a, b) => (a.category === 'Outros' ? -1 : 0) - (b.category === 'Outros' ? -1 : 0) || b.total - a.total)
  const categories = (await listCategories({ type: 'expense', activeOnly: true, userId: auth.userId })).map((c) => c.name)
  return NextResponse.json({ ok: true, vendors, categories })
}

export async function POST(req: NextRequest) {
  const auth = requireFinancialAuth(req)
  if (!auth.authorized) return auth.response!
  const body = await req.json().catch(() => ({}))
  const vendor = String(body.vendor || '').trim()
  const category = String(body.category || '').trim()
  if (!vendor || !category) return NextResponse.json({ ok: false, error: 'Informe a loja e a categoria.' }, { status: 400 })
  const { getSupabaseClient } = await import('@/lib/persist')
  const { normalizeVendor } = await import('@/lib/duplicate')
  const { listCategories, normalizeCategoryName } = await import('@/lib/queries')
  const supabase = getSupabaseClient()
  if (!supabase) return NextResponse.json({ ok: false, error: 'Banco indisponível.' }, { status: 500 })
  const cats = await listCategories({ type: 'expense', activeOnly: true, userId: auth.userId })
  const cat = cats.find((c) => normalizeCategoryName(c.name) === normalizeCategoryName(category))
  if (!cat) return NextResponse.json({ ok: false, error: 'Categoria não encontrada.' }, { status: 400 })
  const key = normalizeVendor(vendor)
  const { data } = await supabase.from('transactions').select('id, vendor').eq('user_id', auth.userId!).eq('type', 'expense')
  const ids = (data || []).filter((t: any) => normalizeVendor(t.vendor) === key).map((t: any) => t.id)
  for (let i = 0; i < ids.length; i += 200) {
    const { error } = await supabase.from('transactions').update({ category: cat.name, category_id: cat.id }).in('id', ids.slice(i, i + 200))
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
  const { learnCategoryPreference } = await import('@/lib/categoryLearning')
  await learnCategoryPreference({ userId: auth.userId, vendor, categoryName: cat.name, categoryId: cat.id, transactionType: 'expense', source: 'user_correction' }).catch(() => null)
  return NextResponse.json({ ok: true, updated: ids.length })
}
