/**
 * Texto da notificação do atalho do iPhone. Sempre no mesmo formato, curto e fácil de ler:
 *   ✓ Mercado · R$ 45,90
 *   Cartão Inter · Mercado
 *   Novembro: R$ 3.533,00 em gastos
 * Em caso de erro: "⚠️ Não lançado" + o motivo + um exemplo de como escrever.
 */
import { formatBRL } from './formatters'

const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

export interface ShortcutSaved {
  type: 'expense' | 'income' | string
  total: number
  vendor?: string | null
  category?: string | null
  date?: string | null
  installment_total?: number | null
  installment_current?: number | null
  installment_amount?: number | null
}

export function shortcutSuccessMessage(
  t: ShortcutSaved,
  opts: { accountName?: string | null; today: string; monthTotal?: { month: string; total: number } | null },
): string {
  const income = t.type === 'income'
  const name = (t.vendor || '').trim() || (income ? 'Entrada' : 'Gasto')
  const parcels = Number(t.installment_total) > 1 ? Number(t.installment_total) : 0
  const amount = parcels
    ? `${parcels}x de ${formatBRL(Number(t.installment_amount) || Number(t.total) / parcels)}`
    : `${income ? '+ ' : ''}${formatBRL(Number(t.total))}`
  const lines = [`✓ ${name} · ${amount}`]

  const details = [opts.accountName, t.category && t.category !== name ? t.category : null]
  if (t.date && t.date !== opts.today) details.push(`dia ${t.date.slice(8, 10)}/${t.date.slice(5, 7)}`)
  const second = details.filter(Boolean).join(' · ')
  if (second) lines.push(second)

  if (!income && opts.monthTotal) {
    const m = MONTHS[Number(opts.monthTotal.month.slice(5, 7)) - 1]
    lines.push(`${m}: ${formatBRL(opts.monthTotal.total)} em gastos`)
  }
  return lines.join('\n')
}

export function shortcutErrorMessage(error: string): string {
  const reason = error.replace(/^⚠️\s*/, '').trim()
  const needsExample = /valor|escrito|texto|identific|incomplet|categoria|conta|cart[aã]o/i.test(reason) && !/ex[.:]|exemplo/i.test(reason)
  return ['⚠️ Não lançado', reason, needsExample ? 'Ex.: "mercado 45,90" ou "recebi 500 freela"' : null].filter(Boolean).join('\n')
}
