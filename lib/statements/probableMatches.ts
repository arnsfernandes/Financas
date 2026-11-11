/**
 * "Talvez já lançado": compra da fatura com o mesmo valor de um lançamento feito à mão poucos dias
 * antes ou depois, mas com outro nome ou em outra conta (ex.: "mercado" × "SUPERMERCADOS BH LTDA").
 * O app não decide sozinho: a prévia pergunta se é a mesma compra. Se for, o lançamento manual é
 * atualizado com os dados da fatura (nome, data, cartão) e mantém categoria e observações.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ParsedStatement } from './interPdf'
import type { PreviewLine } from './importStatement'

export const PROBABLE_MAX_DAYS = 3
const STATEMENT_SOURCES = new Set(['inter_statement_pdf', 'inter_bank_statement'])

export interface ProbableMatch {
  id: string
  vendor: string | null
  date: string | null
  total: number
  accountId: string | null
  accountName: string | null
  category: string | null
}

export interface ProbableCandidate {
  id: string
  date: string | null
  vendor: string | null
  total: number | string | null
  account_id: string | null
  category?: string | null
  notes?: string | null
  installment_total?: number | null
  original_extracted_data?: Record<string, any> | null
}

const days = (a: string, b: string) =>
  Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000

/** Marca em cada compra nova o lançamento manual que talvez seja a mesma compra (no máximo um por compra). */
export function markProbableMatches(
  lines: PreviewLine[],
  candidates: ProbableCandidate[],
  accountNames: Map<string, string> = new Map(),
): PreviewLine[] {
  const used = new Set(lines.map((l) => l.duplicateOf).filter(Boolean) as string[])
  const pool = candidates.filter(
    (c) =>
      c.date &&
      !c.installment_total &&
      Number(c.total) > 0 &&
      !STATEMENT_SOURCES.has(c.original_extracted_data?.source) &&
      !c.original_extracted_data?.statement_match,
  )
  for (const line of lines) {
    if (line.action !== 'import' || line.isCredit || line.installmentTotal || line.kind !== 'purchase') continue
    const amount = line.netAmount ?? line.amount
    const best = pool
      .filter((c) => !used.has(c.id) && Math.abs(Number(c.total) - amount) <= 0.01 && days(c.date!, line.date) <= PROBABLE_MAX_DAYS)
      .sort((a, b) => days(a.date!, line.date) - days(b.date!, line.date))[0]
    if (!best) continue
    used.add(best.id)
    line.probable = {
      id: best.id,
      vendor: best.vendor,
      date: best.date,
      total: Number(best.total),
      accountId: best.account_id,
      accountName: best.account_id ? accountNames.get(best.account_id) ?? null : null,
      category: best.category ?? null,
    }
  }
  return lines
}

/** Lançamentos à vista do usuário, em qualquer conta, perto das datas das compras da fatura. */
export async function loadProbableCandidates(
  supabase: SupabaseClient,
  statement: ParsedStatement,
  userId: string,
): Promise<ProbableCandidate[]> {
  const dates = statement.lines.filter((l) => !l.isCredit && !l.installmentTotal).map((l) => l.date).sort()
  if (!dates.length) return []
  const shift = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
  const { data, error } = await supabase
    .from('transactions')
    .select('id, date, vendor, total, account_id, category, notes, installment_total, original_extracted_data')
    .eq('user_id', userId)
    .eq('type', 'expense')
    .is('installment_total', null)
    .gte('date', shift(dates[0], -PROBABLE_MAX_DAYS))
    .lte('date', shift(dates[dates.length - 1], PROBABLE_MAX_DAYS))
    .limit(5000)
  if (error) throw new Error(`Falha ao consultar lançamentos parecidos: ${error.message}`)
  return (data || []) as ProbableCandidate[]
}

/** Alterações no lançamento manual quando o usuário confirma que é a mesma compra da fatura. */
export function mergePatch(
  line: PreviewLine,
  existing: { vendor: string | null; date: string | null; notes?: string | null; original_extracted_data?: Record<string, any> | null },
  ctx: { accountId: string; statement: ParsedStatement },
) {
  const due = ctx.statement.dueDate ? ctx.statement.dueDate.split('-').reverse().join('/') : '—'
  const note = `Conferido com a fatura ${ctx.statement.issuerName || 'do cartão'} (venc. ${due})`
  return {
    vendor: line.vendor,
    date: line.date,
    account_id: ctx.accountId,
    total: line.netAmount ?? line.amount,
    payment_method: 'Cartão de Crédito',
    raw_text: line.description,
    notes: existing.notes ? `${existing.notes} · ${note}` : note,
    original_extracted_data: {
      ...(existing.original_extracted_data || {}),
      statement_match: {
        statement_sha256: ctx.statement.sha256,
        statement_due_date: ctx.statement.dueDate,
        line_index: line.index,
        description: line.description,
        card: line.card,
        manual_vendor: existing.vendor,
        manual_date: existing.date,
      },
    },
  }
}
