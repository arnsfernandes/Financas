/**
 * Grava uma fatura importada no modo "igual ao banco" (usado pela tela e pela reimportação):
 * despesas como cobradas (com parcelamentos completos), créditos no cartão, pagamentos de fatura e
 * acerto dos centavos das parcelas.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { saveBatch } from '../persist'
import {
  antecipatedDates, buildCreditRows, buildPersistInputs, existingParcelFixes, newPlanParcelAmounts,
  type PreviewLine,
} from './importStatement'
import type { ParsedStatement } from './interPdf'
import { normalizeVendor } from '../duplicate'

export interface CommitResult {
  imported: number
  importedAmount: number
  creditsRegistered: number
  creditsAmount: number
  paymentsRegistered: number
  parcelsAdjusted: number
}

export async function commitStatementImport(opts: {
  supabase: SupabaseClient
  lines: PreviewLine[]
  statement: ParsedStatement
  userId: string
  accountId: string
  filename: string | null
  selected?: Set<number>
  categoryIdOf: (name: string | null) => string | null
  creditCategoryId?: string | null
}): Promise<CommitResult> {
  const { supabase, lines, statement, userId, accountId, selected } = opts
  const ctx = { userId, accountId, statement, filename: opts.filename }

  // 1. Despesas (compras e parcelamentos completos)
  const inputs = buildPersistInputs(lines, ctx, selected)
  for (const input of inputs) input.receipt.category_id = opts.categoryIdOf(input.receipt.category ?? null)
  const saved = inputs.length ? await saveBatch(inputs) : []

  // 2. Parcelas antecipadas na data desta fatura e centavos de cada parcela como o banco cobrou
  const dateFixes = antecipatedDates(lines, selected)
  const amountFixes = newPlanParcelAmounts(lines, selected)
  let parcelsAdjusted = 0
  for (let i = 0; i < saved.length; i++) {
    const groupId = saved[i]?.installment_group_id
    if (!groupId) continue
    const fix = dateFixes[i]
    if (fix) {
      const { error } = await supabase.from('transactions').update({ date: fix.date })
        .eq('installment_group_id', groupId).eq('user_id', userId).in('installment_current', fix.installments)
      if (error) throw new Error(`Falha ao ajustar datas das parcelas: ${error.message}`)
    }
    const amounts = amountFixes[i]
    if (!amounts) continue
    if (amounts.futureAmount != null) {
      const { error } = await supabase.from('transactions')
        .update({ total: amounts.futureAmount, installment_amount: amounts.futureAmount })
        .eq('installment_group_id', groupId).eq('user_id', userId).gt('installment_current', amounts.after)
      if (error) throw new Error(`Falha ao ajustar parcelas futuras: ${error.message}`)
    }
    for (const [current, value] of Object.entries(amounts.amounts)) {
      const { error } = await supabase.from('transactions').update({ total: value, installment_amount: value })
        .eq('installment_group_id', groupId).eq('user_id', userId).eq('installment_current', Number(current))
      if (error) throw new Error(`Falha ao ajustar parcela: ${error.message}`)
      parcelsAdjusted++
    }
  }
  for (const fix of existingParcelFixes(lines)) {
    const { error } = await supabase.from('transactions').update({ total: fix.total, installment_amount: fix.total })
      .eq('id', fix.id).eq('user_id', userId)
    if (error) throw new Error(`Falha ao acertar parcela existente: ${error.message}`)
    parcelsAdjusted++
  }

  // 2b. Próxima fatura: o banco já informa o valor exato das próximas parcelas. Acerta essas parcelas
  //     (e as seguintes do mesmo parcelamento) para os centavos baterem com o banco.
  if (statement.upcoming?.length) {
    const { data: rows, error } = await supabase.from('transactions')
      .select('id, vendor, raw_text, total, installment_group_id, installment_current, installment_total')
      .eq('user_id', userId).eq('account_id', accountId).eq('type', 'expense').not('installment_group_id', 'is', null)
      .limit(5000)
    if (error) throw new Error(`Falha ao consultar parcelas: ${error.message}`)
    const usedGroups = new Set<string>()
    for (const u of statement.upcoming) {
      const key = normalizeVendor(u.vendor)
      const rawKey = normalizeVendor(u.description)
      const candidates = (rows || []).filter((r: any) =>
        r.installment_total === u.total && r.installment_current === u.current && !usedGroups.has(r.installment_group_id) &&
        (normalizeVendor(r.vendor) === key || normalizeVendor(r.raw_text).includes(rawKey) || rawKey.includes(normalizeVendor(r.raw_text))))
      // Mesmo estabelecimento e parcela: escolhe o de valor mais próximo (ex.: duas compras Techdate).
      candidates.sort((a: any, b: any) => Math.abs(Number(a.total) - u.amount) - Math.abs(Number(b.total) - u.amount))
      const row = candidates[0]
      if (!row || Math.abs(Number(row.total) - u.amount) > Math.max(0.5, u.amount * 0.02)) continue
      usedGroups.add(row.installment_group_id)
      if (Math.abs(Number(row.total) - u.amount) < 0.005) continue
      const { error: upErr } = await supabase.from('transactions').update({ total: u.amount, installment_amount: u.amount })
        .eq('installment_group_id', row.installment_group_id).eq('user_id', userId).gte('installment_current', u.current)
      if (upErr) throw new Error(`Falha ao acertar próxima parcela: ${upErr.message}`)
      parcelsAdjusted++
    }
  }

  // 3. Créditos no cartão (estornos, créditos de parcela, ajustes)
  const credits = buildCreditRows(lines, ctx).map((c) => ({ ...c, category_id: opts.creditCategoryId ?? null }))
  if (credits.length) {
    const { error } = await supabase.from('transactions').insert(credits)
    if (error) throw new Error(`Falha ao registrar créditos: ${error.message}`)
  }

  // 4. Pagamentos e adiantamentos de fatura
  const { registerInvoicePayment } = await import('../invoices')
  let paymentsRegistered = 0
  for (const l of lines) {
    if (l.action !== 'payment' || l.paymentRegistered || !l.paymentDue) continue
    const res = await registerInvoicePayment({
      accountId, dueDate: l.paymentDue, amount: l.amount, paymentDate: l.date, paymentMethod: 'Pagamento on-line',
      notes: `Importado da fatura ${statement.issuerName || 'do cartão'} (venc. ${statement.dueDate ? statement.dueDate.split('-').reverse().join('/') : '—'}): ${l.description}`,
    })
    if (!res.ok) throw new Error(`Falha ao registrar pagamento da fatura: ${res.error}`)
    paymentsRegistered++
  }

  const chosen = lines.filter((l) => l.action === 'import' && (!selected || selected.has(l.index)))
  return {
    imported: saved.length,
    importedAmount: Number(chosen.reduce((s, l) => s + l.amount, 0).toFixed(2)),
    creditsRegistered: credits.length,
    creditsAmount: Number(credits.reduce((s, c) => s + c.total, 0).toFixed(2)),
    paymentsRegistered,
    parcelsAdjusted,
  }
}
