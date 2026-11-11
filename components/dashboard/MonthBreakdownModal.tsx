'use client'

/**
 * Pop-up do mês selecionado na Visão Geral:
 *  - modo "categorias": todas as categorias com despesa no mês; cada uma abre as despesas que a compõem;
 *  - modo "lançamentos": todos os lançamentos do mês, agrupados por dia.
 * Usa exatamente os lançamentos do resumo do mês (no cartão, pela fatura), então os totais batem com a tela.
 */
import React, { useEffect, useMemo, useState } from 'react'
import { ChevronDown, X } from 'lucide-react'
import { formatBRL } from '@/lib/formatters'

interface CategoryItem {
  category: string
  total: number
  percentage?: number
  count?: number
  differencePercentage?: number | null
}

type Visual = { icon: React.ComponentType<{ className?: string }>; color: string; bg: string }

export function MonthBreakdownModal({
  mode,
  onClose,
  periodLabel,
  rangeLabel,
  transactions,
  categories,
  totalExpenses,
  initialCategory,
  getVisual,
  onSelectTx,
  budgets,
  onSaveBudgets,
  onReviewCategories,
}: {
  budgets?: { available: boolean; values: Record<string, number> }
  onSaveBudgets?: (values: Record<string, number>) => Promise<string | null>
  onReviewCategories?: () => void
  mode: 'categories' | 'transactions' | null
  onClose: () => void
  periodLabel: string
  rangeLabel?: string | null
  transactions: any[]
  categories: CategoryItem[]
  totalExpenses: number
  initialCategory?: string | null
  getVisual: (text: string) => Visual
  onSelectTx: (tx: any) => void
}) {
  const [open, setOpen] = useState<string | null>(initialCategory ?? null)
  const [editingBudget, setEditingBudget] = useState<string | null>(null)
  const [budgetInput, setBudgetInput] = useState('')
  const [budgetError, setBudgetError] = useState('')
  useEffect(() => setOpen(initialCategory ?? null), [initialCategory, mode])

  useEffect(() => {
    if (!mode) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mode, onClose])

  // Parcelas aparecem na data da compra, como no app do banco (e não na data prevista da parcela).
  const shownDate = (t: any): string =>
    (Number(t.installment_total) > 1 && t.original_extracted_data?.date) || t.date || ''
  const sorted = useMemo(
    () => [...transactions].sort((a, b) => shownDate(b).localeCompare(shownDate(a))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [transactions],
  )
  const expenses = useMemo(() => sorted.filter((t) => t.type !== 'income'), [sorted])
  const income = useMemo(() => sorted.filter((t) => t.type === 'income').reduce((s, t) => s + Number(t.total || 0), 0), [sorted])
  const byDay = useMemo(() => {
    const map = new Map<string, any[]>()
    for (const t of sorted) map.set(shownDate(t), [...(map.get(shownDate(t)) || []), t])
    return Array.from(map.entries())
  }, [sorted])

  if (!mode) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/40 p-0 sm:p-6" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={mode === 'categories' ? 'Categorias do mês' : 'Lançamentos do mês'}
        onClick={(e) => e.stopPropagation()}
        className="bg-white w-full sm:max-w-2xl max-h-[88vh] rounded-t-3xl sm:rounded-3xl shadow-xl flex flex-col overflow-hidden"
      >
        <div className="flex items-start justify-between gap-3 px-5 sm:px-6 pt-5 pb-4 border-b border-slate-100">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-slate-900">
              {mode === 'categories' ? 'Categorias' : 'Lançamentos'} · {periodLabel}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {rangeLabel ? `Fatura do cartão: ${rangeLabel} · ` : ''}
              {mode === 'categories'
                ? `${categories.length} categoria(s) · ${formatBRL(totalExpenses)}`
                : `${sorted.length} lançamento(s) · gastos ${formatBRL(totalExpenses)}${income > 0 ? ` · entradas ${formatBRL(income)}` : ''}`}
            </p>
          </div>
          <div className="flex items-center gap-1">
            {mode === 'categories' && onReviewCategories && (
              <button type="button" onClick={onReviewCategories} className="text-xs font-semibold text-[#2F68FE] hover:bg-[#EBF2FF] px-2.5 py-1 rounded-lg">
                Revisar lojas
              </button>
            )}
            <button type="button" onClick={onClose} aria-label="Fechar" className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        {mode === 'categories' && budgets && !budgets.available && (
          <p className="mx-5 sm:mx-6 mt-3 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
            Para definir orçamentos por categoria, ative as preferências: aplique a migração <code>user_settings</code> no Supabase (uma vez).
          </p>
        )}
        {budgetError && <p className="mx-5 sm:mx-6 mt-3 text-[11px] text-red-700">{budgetError}</p>}

        <div className="overflow-y-auto px-3 sm:px-4 py-2">
          {mode === 'categories' &&
            (categories.length === 0 ? (
              <p className="text-center text-xs text-slate-400 py-10">Nenhuma despesa neste mês.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {categories.map((cat) => {
                  const isOpen = open === cat.category
                  const items = expenses.filter((t) => (t.category || 'Outros') === cat.category)
                  const pct = cat.percentage ?? (totalExpenses > 0 ? (cat.total / totalExpenses) * 100 : 0)
                  const budget = budgets?.values?.[cat.category]
                  const used = budget ? (cat.total / budget) * 100 : null
                  const barPct = used ?? pct
                  const barColor = used === null ? '#2F68FE' : used >= 100 ? '#E24B4A' : used >= 80 ? '#EF9F27' : '#639922'
                  const diff = cat.differencePercentage
                  const visual = getVisual(cat.category)
                  const Icon = visual.icon
                  return (
                    <li key={cat.category}>
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        onClick={() => setOpen(isOpen ? null : cat.category)}
                        className="w-full flex items-center gap-3 px-2 py-3 text-left hover:bg-slate-50 rounded-xl"
                      >
                        <span className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: visual.bg, color: visual.color }}>
                          <Icon className="w-3.5 h-3.5" />
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="flex items-baseline justify-between gap-2">
                            <span className="text-sm font-semibold text-slate-900 truncate">
                              {cat.category} <span className="text-xs font-normal text-slate-400">{items.length}</span>
                              {diff !== null && diff !== undefined && Math.abs(diff) >= 5 && (
                                <span className={`ml-1.5 text-[10px] font-semibold ${diff > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                                  {diff > 0 ? '+' : ''}{Math.round(diff)}%
                                </span>
                              )}
                            </span>
                            <span className="text-sm font-bold text-slate-900 tabular-nums">{formatBRL(cat.total)}</span>
                          </span>
                          <span className="flex items-center gap-2 mt-1.5">
                            <span className="h-1.5 flex-1 rounded-full bg-slate-100 overflow-hidden">
                              <span className="block h-full rounded-full" style={{ width: `${Math.min(100, Math.max(2, barPct))}%`, backgroundColor: barColor }} />
                            </span>
                            <span className="text-[11px] text-slate-500 tabular-nums w-24 text-right">
                              {budget ? `de ${formatBRL(budget)}` : `${pct.toFixed(1)}%`}
                            </span>
                          </span>
                        </span>
                        <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${isOpen ? '' : '-rotate-90'}`} />
                      </button>
                      {isOpen && budgets?.available && onSaveBudgets && (
                        <div className="ml-11 mb-1 flex items-center gap-2 text-[11px] text-slate-500">
                          {editingBudget === cat.category ? (
                            <form
                              className="flex items-center gap-1.5"
                              onSubmit={async (e) => {
                                e.preventDefault()
                                const value = Number(budgetInput.replace(/\./g, '').replace(',', '.'))
                                const next = { ...(budgets.values || {}) }
                                if (value > 0) next[cat.category] = value
                                else delete next[cat.category]
                                const err = await onSaveBudgets(next)
                                setBudgetError(err || '')
                                if (!err) setEditingBudget(null)
                              }}
                            >
                              Orçamento por mês R$
                              <input autoFocus inputMode="decimal" value={budgetInput} onChange={(e) => setBudgetInput(e.target.value)}
                                className="w-24 rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-900" aria-label={`Orçamento de ${cat.category}`} />
                              <button type="submit" className="font-semibold text-[#2F68FE]">Salvar</button>
                            </form>
                          ) : (
                            <button type="button" className="font-semibold text-[#2F68FE]"
                              onClick={() => { setEditingBudget(cat.category); setBudgetInput(budget ? String(budget).replace('.', ',') : '') }}>
                              {budget ? `Orçamento ${formatBRL(budget)} · alterar` : 'Definir orçamento mensal'}
                            </button>
                          )}
                        </div>
                      )}
                      {isOpen && (
                        <ul className="ml-11 mb-2 border-l border-slate-100">
                          {items.map((t) => (
                            <TxRow key={t.id} tx={t} onSelect={onSelectTx} />
                          ))}
                        </ul>
                      )}
                    </li>
                  )
                })}
              </ul>
            ))}

          {mode === 'transactions' &&
            (byDay.length === 0 ? (
              <p className="text-center text-xs text-slate-400 py-10">Nenhum lançamento neste mês.</p>
            ) : (
              byDay.map(([day, items]) => (
                <section key={day} className="py-1">
                  <p className="px-2 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    {day ? new Date(day + 'T00:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' }) : 'Sem data'}
                  </p>
                  <ul>
                    {items.map((t) => (
                      <TxRow key={t.id} tx={t} onSelect={onSelectTx} showCategory />
                    ))}
                  </ul>
                </section>
              ))
            ))}
        </div>
      </div>
    </div>
  )
}

function TxRow({ tx, onSelect, showCategory }: { tx: any; onSelect: (tx: any) => void; showCategory?: boolean }) {
  const isIncome = tx.type === 'income'
  const parcel = Number(tx.installment_total) > 1
  const purchase: string | null = tx.original_extracted_data?.date || null
  const short = (iso?: string | null) => (iso ? iso.split('-').reverse().slice(0, 2).join('/') : '')
  return (
    <li>
      <button type="button" onClick={() => onSelect(tx)} className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-slate-50 rounded-xl">
        <span className="flex-1 min-w-0">
          <span className="block text-sm text-slate-900 truncate">
            {tx.vendor || (isIncome ? 'Entrada' : 'Despesa')}
            {parcel && (
              <span className="ml-1.5 text-[10px] font-semibold text-[#2F68FE] bg-[#EBF2FF] rounded-full px-1.5 py-0.5">
                {tx.installment_current}/{tx.installment_total}
              </span>
            )}
          </span>
          <span className="block text-[11px] text-slate-400 truncate">
            {[showCategory ? tx.category : null, showCategory ? null : parcel && purchase ? `compra ${short(purchase)}` : short(tx.date), tx.accounts?.name]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </span>
        <span className={`text-sm font-semibold tabular-nums whitespace-nowrap ${isIncome ? 'text-emerald-600' : 'text-slate-900'}`}>
          {isIncome ? '+ ' : '− '}
          {formatBRL(Number(tx.total || 0))}
        </span>
      </button>
    </li>
  )
}
