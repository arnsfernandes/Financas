/**
 * Cálculos extras da Visão Geral:
 *  - histórico de gastos dos últimos 6 meses (cartão pela fatura, demais pela data);
 *  - assinaturas e contas recorrentes (detectadas pelos lançamentos, sem IA);
 * Tudo a partir dos lançamentos do usuário, com as mesmas regras de competência do painel.
 */
import { cardCompetenceMonth } from '../invoiceCompetence'
import { addMonthsToDate } from '../dateUtils'
import { normalizeVendor } from '../duplicate'

type AccountsMap = Record<string, { id: string; name: string; type: string; closing_day?: number | null; due_day?: number | null }>

const MONTH_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

/** Mês de competência de um lançamento: cartão pela fatura (corte real do banco), demais pela data. */
export function makeCompetence(accountsMap: AccountsMap, rows: any[]) {
  const cutoffClosing = new Map<string, number>()
  for (const t of rows) {
    const cut = t.original_extracted_data?.statement_printed?.nextCutoff
    if (cut && t.account_id && !cutoffClosing.has(t.account_id)) cutoffClosing.set(t.account_id, Math.max(1, Number(cut.slice(8, 10)) - 1))
  }
  return (t: any): string => {
    const acc = t.account_id ? accountsMap[t.account_id] : null
    if (acc?.type === 'credit_card' && (t.type !== 'income' || t.original_extracted_data?.card_credit)) {
      return cardCompetenceMonth(t, cutoffClosing.get(t.account_id) ?? (acc.closing_day || 5), acc.due_day || 15)
    }
    return String(t.date || t.created_at || '').slice(0, 7)
  }
}

export interface MonthTotal {
  month: string // YYYY-MM
  label: string
  total: number
}

export async function computeMonthlyHistory(
  supabase: any,
  accountsMap: AccountsMap,
  monthKey: string,
  opts: { userId?: string; accountId?: string; pix?: boolean; card?: boolean; months?: number },
): Promise<MonthTotal[]> {
  const n = opts.months ?? 6
  const keys: string[] = []
  for (let i = n - 1; i >= 0; i--) keys.push(addMonthsToDate(`${monthKey}-01`, -i).slice(0, 7))
  const from = addMonthsToDate(`${keys[0]}-01`, -2)
  const to = addMonthsToDate(`${monthKey}-01`, 2)
  let q = supabase.from('transactions')
    .select('type, account_id, total, date, created_at, installment_current, payment_method, original_extracted_data')
    .eq('type', 'expense').gte('date', from).lte('date', to)
  if (opts.userId) q = q.eq('user_id', opts.userId)
  if (opts.accountId) q = q.eq('account_id', opts.accountId)
  if (opts.pix) q = q.ilike('payment_method', '%pix%')
  const { data } = await q
  let rows = (data || []) as any[]
  if (opts.card) rows = rows.filter((t) => accountsMap[t.account_id]?.type === 'credit_card')
  const competence = makeCompetence(accountsMap, rows)
  const totals = new Map<string, number>(keys.map((k) => [k, 0]))
  for (const t of rows) {
    const k = competence(t)
    if (totals.has(k)) totals.set(k, totals.get(k)! + (Number(t.total) || 0))
  }
  return keys.map((k) => ({ month: k, label: MONTH_SHORT[Number(k.slice(5, 7)) - 1], total: Math.round((totals.get(k) || 0) * 100) / 100 }))
}

export interface SubscriptionItem {
  vendor: string
  category: string | null
  amount: number // valor do último mês
  previousAmount: number | null
  increased: boolean
  months: number // em quantos meses apareceu
  lastDate: string
  paymentMethod: string | null
}

const RECURRING_CATEGORIES = /assinatura|servi[cç]o|moradia|educa[cç][aã]o/i

/**
 * Assinaturas e contas fixas: mesma loja em 2+ meses diferentes, à vista, e
 *  - categoria de assinatura/serviço/moradia/educação, ou
 *  - valor praticamente igual todo mês (variação até 5%) em 3+ meses.
 */
export async function computeSubscriptions(supabase: any, monthKey: string, userId?: string): Promise<{ items: SubscriptionItem[]; monthlyTotal: number }> {
  const from = addMonthsToDate(`${monthKey}-01`, -12)
  let q = supabase.from('transactions')
    .select('vendor, category, total, date, payment_method, installment_total, categories(name)')
    .eq('type', 'expense').gte('date', from).is('installment_total', null).gt('total', 0)
  if (userId) q = q.eq('user_id', userId)
  const { data } = await q
  const groups = new Map<string, any[]>()
  for (const t of (data || []) as any[]) {
    const key = normalizeVendor(t.vendor)
    if (!key) continue
    groups.set(key, [...(groups.get(key) || []), t])
  }
  const items: SubscriptionItem[] = []
  for (const rows of Array.from(groups.values())) {
    const byMonth = new Map<string, number>()
    for (const r of rows) byMonth.set(String(r.date).slice(0, 7), (byMonth.get(String(r.date).slice(0, 7)) || 0) + Number(r.total))
    if (byMonth.size < 2) continue
    const months = Array.from(byMonth.keys()).sort()
    const amounts = months.map((m) => byMonth.get(m)!)
    const last = rows.sort((a: any, b: any) => String(b.date).localeCompare(String(a.date)))[0]
    const category = last.categories?.name || last.category || null
    const min = Math.min(...amounts)
    const max = Math.max(...amounts)
    const stable = months.length >= 3 && max - min <= Math.max(1, min * 0.05)
    if (!(category && RECURRING_CATEGORIES.test(category)) && !stable) continue
    // Só conta como ativa se apareceu nos últimos 2 meses.
    if (months[months.length - 1] < addMonthsToDate(`${monthKey}-01`, -2).slice(0, 7)) continue
    const lastAmount = amounts[amounts.length - 1]
    const prev = amounts.length > 1 ? amounts[amounts.length - 2] : null
    items.push({
      vendor: last.vendor,
      category,
      amount: Math.round(lastAmount * 100) / 100,
      previousAmount: prev,
      increased: prev !== null && lastAmount > prev * 1.02,
      months: months.length,
      lastDate: last.date,
      paymentMethod: last.payment_method || null,
    })
  }
  items.sort((a, b) => b.amount - a.amount)
  return { items, monthlyTotal: Math.round(items.reduce((s, i) => s + i.amount, 0) * 100) / 100 }
}
