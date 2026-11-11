'use client'

/**
 * Importação do extrato da conta: mostra os gastos em estabelecimentos (Pix, boleto, débito) por
 * categoria para registrar, e deixa de fora pagamento de fatura, transferências próprias,
 * investimentos e entradas. Destinos que o usuário desmarca ficam lembrados neste navegador.
 */
import React, { useEffect, useMemo, useState } from 'react'
import { AlertCircle, CheckCircle2, ChevronDown, Landmark, Loader2, X } from 'lucide-react'
import { formatBRL } from '@/lib/formatters'
import { useTelegramWebApp } from '@/lib/useTelegramWebApp'

type Kind = 'gasto' | 'pessoa' | 'entrada' | 'transferencia' | 'fatura' | 'investimento' | 'estorno_pix'
interface Line {
  index: number
  date: string
  type: string
  name: string
  vendor: string
  amount: number
  kind: Kind
  category: string | null
  paymentMethod: string
  registered: boolean
  learned: boolean
  paymentDue?: string
}
interface Preview {
  ok: boolean
  error?: string
  needsPassword?: boolean
  wrongPassword?: boolean
  statement: { holder: string; from: string | null; to: string | null; filename: string }
  accountId: string | null
  accounts: Array<{ id: string; name: string; type: string }>
  cardName: string | null
  categories: string[]
  lines: Line[]
  ignored?: number[]
}

const IGNORE_KEY = 'bank-statement-ignored'
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim()
const fdate = (iso: string | null) => (iso ? iso.split('-').reverse().join('/') : '')
const short = (iso: string) => fdate(iso).slice(0, 5)

function readIgnored(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(IGNORE_KEY) || '[]'))
  } catch {
    return new Set()
  }
}

export function BankStatementPanel({
  file,
  password,
  onClose,
  onImported,
}: {
  file: File
  password?: string
  onClose: () => void
  onImported?: (message: string) => void | Promise<void>
}) {
  const { fetchWithAuth } = useTelegramWebApp()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [data, setData] = useState<Preview | null>(null)
  const [accountId, setAccountId] = useState('')
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [overrides, setOverrides] = useState<Record<number, string>>({})
  const [open, setOpen] = useState<string | null>(null)
  const [showOthers, setShowOthers] = useState(false)
  const [registerPayments, setRegisterPayments] = useState(true)

  async function load(forAccount?: string) {
    setLoading(true)
    setError('')
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('mode', 'preview')
      if (password) form.append('password', password)
      if (forAccount) form.append('accountId', forAccount)
      const res = await fetchWithAuth('/api/statements/bank', { method: 'POST', body: form })
      const json = (await res.json()) as Preview
      if (!res.ok || !json.ok) throw new Error(json.error || 'Falha ao ler o extrato.')
      setData(json)
      setAccountId(json.accountId || '')
      // Marcados por padrão: gastos com categoria; destinos que você já desmarcou antes ficam desmarcados.
      const ignored = readIgnored()
      const ignoredOnServer = new Set(json.ignored || [])
      setSelected(new Set(json.lines
        .filter((l) => !l.registered && l.amount < 0 && (l.kind === 'gasto' || l.kind === 'pessoa'))
        .filter((l) => (l.category || l.learned) && !ignored.has(norm(l.name)) && !ignoredOnServer.has(l.index))
        .map((l) => l.index)))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao ler o extrato.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file])

  const view = useMemo(() => {
    const lines = data?.lines ?? []
    const candidates = lines.filter((l) => l.amount < 0 && (l.kind === 'gasto' || l.kind === 'pessoa'))
    const catOf = (l: Line) => overrides[l.index] || l.category || 'Sem categoria'
    const groups = new Map<string, Line[]>()
    for (const l of candidates) groups.set(catOf(l), [...(groups.get(catOf(l)) || []), l])
    const categories = Array.from(groups.entries())
      .map(([name, items]) => ({
        name,
        items: items.sort((a, b) => a.date.localeCompare(b.date)),
        total: items.filter((l) => selected.has(l.index) || l.registered).reduce((s, l) => s - l.amount, 0),
      }))
      .sort((a, b) => (a.name === 'Sem categoria' ? 1 : b.name === 'Sem categoria' ? -1 : b.total - a.total))
    const chosen = candidates.filter((l) => selected.has(l.index) && !l.registered)
    const spent = candidates.filter((l) => selected.has(l.index) || l.registered).reduce((s, l) => s - l.amount, 0)
    const income = lines.filter((l) => l.kind === 'entrada').reduce((s, l) => s + l.amount, 0)
    const sum = (k: Kind) => lines.filter((l) => l.kind === k).reduce((s, l) => s + Math.abs(l.amount), 0)
    const payments = lines.filter((l) => l.kind === 'fatura')
    return {
      lines, categories, chosen, spent, income, payments,
      chosenTotal: chosen.reduce((s, l) => s - l.amount, 0),
      pendingPayments: payments.filter((l) => !l.registered),
      notSpending: [
        { label: `Pagamentos da fatura${data?.cardName ? ` (${data.cardName})` : ''}`, value: sum('fatura'), n: payments.length },
        { label: 'Transferências entre contas suas', value: sum('transferencia'), n: lines.filter((l) => l.kind === 'transferencia').length },
        { label: 'Aplicações e resgates', value: sum('investimento'), n: lines.filter((l) => l.kind === 'investimento').length },
        { label: 'Pix enviados e devolvidos', value: 0, n: lines.filter((l) => l.kind === 'estorno_pix').length },
      ],
      incomeLines: lines.filter((l) => l.kind === 'entrada'),
    }
  }, [data, overrides, selected])

  function toggle(index: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  async function confirm() {
    if (!accountId || saving) return
    setSaving(true)
    setError('')
    try {
      // Lembra o que você deixou de fora (ex.: Pix que não foi gasto seu) para os próximos extratos.
      try {
        const ignored = readIgnored()
        for (const l of view.lines)
          if (l.amount < 0 && (l.kind === 'gasto' || l.kind === 'pessoa') && !l.registered) {
            if (selected.has(l.index)) ignored.delete(norm(l.name))
            else ignored.add(norm(l.name))
          }
        localStorage.setItem(IGNORE_KEY, JSON.stringify(Array.from(ignored)))
      } catch {
        /* navegador sem armazenamento: segue sem lembrar */
      }
      const form = new FormData()
      form.append('file', file)
      form.append('mode', 'confirm')
      form.append('accountId', accountId)
      if (password) form.append('password', password)
      form.append('selected', JSON.stringify(view.chosen.map((l) => l.index)))
      form.append('categories', JSON.stringify(overrides))
      if (registerPayments) form.append('payments', '1')
      const res = await fetchWithAuth('/api/statements/bank', { method: 'POST', body: form })
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.error || 'Falha ao registrar.')
      await onImported?.(
        `${json.imported} gasto(s) do extrato registrado(s) · ${formatBRL(json.importedAmount)}` +
          (json.paymentsRegistered ? ` · ${json.paymentsRegistered} pagamento(s) de fatura` : ''),
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao registrar.')
    } finally {
      setSaving(false)
    }
  }

  const st = data?.statement
  const hasWork = view.chosen.length > 0 || (registerPayments && view.pendingPayments.length > 0)

  return (
    <div className="max-w-2xl mx-auto bg-white border border-[#EBEEF2] rounded-2xl shadow-2xs overflow-hidden">
      <div className="p-4 border-b border-[#EBEEF2] space-y-2.5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[#EBF2FF] text-[#2F68FE] flex items-center justify-center shrink-0">
              <Landmark className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[#0F172A]">
                Extrato da conta{st?.from ? ` · ${fdate(st.from)} a ${fdate(st.to)}` : ''}
              </p>
              <p className="text-xs text-[#667085] truncate">{file.name}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1 text-[#98A2B3] hover:text-[#0F172A]" aria-label="Fechar">
            <X className="w-4 h-4" />
          </button>
        </div>
        {data && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-medium rounded-full px-2 py-0.5 bg-emerald-50 text-emerald-700">Lido por código, sem IA</span>
            <label className="ml-auto flex items-center gap-1.5 text-[11px] text-[#667085]">
              Registrar na conta
              <select
                value={accountId}
                onChange={(e) => {
                  setAccountId(e.target.value)
                  if (e.target.value) load(e.target.value)
                }}
                className="bg-[#F2F4F7] rounded-lg px-2 py-1 text-[11px] font-medium text-[#0F172A] focus:outline-none"
              >
                <option value="">Escolha…</option>
                {data.accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </label>
          </div>
        )}
      </div>

      {loading && (
        <div className="flex items-center justify-center gap-2 py-12 text-xs text-[#667085]">
          <Loader2 className="w-4 h-4 animate-spin" /> Lendo o extrato…
        </div>
      )}
      {error && (
        <div className="m-4 bg-red-50 border border-red-200 text-red-800 rounded-xl px-3 py-2.5 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {!loading && data && (
        <>
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <div className="col-span-2 sm:col-span-1 rounded-xl p-3 bg-[#2F68FE] text-white">
                <p className="text-[11px] text-white/80">Gastos em estabelecimentos</p>
                <p className="text-lg font-semibold tabular-nums">{formatBRL(view.spent)}</p>
                <p className="text-[10px] text-white/70">Pix, boletos e débito</p>
              </div>
              <div className="rounded-xl p-3 bg-[#F9FAFB] border border-[#EBEEF2]">
                <p className="text-[11px] text-[#667085]">Entradas</p>
                <p className="text-lg font-semibold tabular-nums text-emerald-700">{formatBRL(view.income)}</p>
                <p className="text-[10px] text-[#98A2B3]">não serão registradas</p>
              </div>
              <div className="rounded-xl p-3 bg-[#F9FAFB] border border-[#EBEEF2]">
                <p className="text-[11px] text-[#667085]">Não são gastos</p>
                <p className="text-lg font-semibold tabular-nums text-[#0F172A]">{view.notSpending.reduce((s, x) => s + x.n, 0)} linhas</p>
                <p className="text-[10px] text-[#98A2B3]">fatura, transferências, investimentos</p>
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-[#0F172A] mb-1.5">Gastos por categoria</p>
              <ul className="border border-[#EBEEF2] rounded-xl divide-y divide-[#EBEEF2] overflow-hidden">
                {view.categories.map((cat) => {
                  const isOpen = open === cat.name
                  return (
                    <li key={cat.name}>
                      <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : cat.name)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-[#F9FAFB] text-left">
                        <ChevronDown className={`w-4 h-4 text-[#98A2B3] shrink-0 transition-transform ${isOpen ? '' : '-rotate-90'}`} />
                        <span className="flex-1 text-sm font-medium text-[#0F172A]">
                          {cat.name} <span className="text-xs font-normal text-[#98A2B3]">{cat.items.length}</span>
                          {cat.name === 'Sem categoria' && <span className="ml-1.5 text-[11px] font-normal text-amber-700">marque o que foi gasto seu</span>}
                        </span>
                        <span className="text-sm font-semibold tabular-nums text-[#0F172A]">{formatBRL(cat.total)}</span>
                      </button>
                      {isOpen && (
                        <ul className="bg-[#FCFCFD] border-t border-[#EBEEF2] divide-y divide-[#F2F4F7]">
                          {cat.items.map((l) => {
                            const off = !l.registered && !selected.has(l.index)
                            return (
                              <li key={l.index} className={`flex flex-wrap items-center gap-x-2.5 gap-y-1 pl-3 sm:pl-10 pr-3 py-2 ${off ? 'opacity-50' : ''}`}>
                                {l.registered ? <span className="w-4 shrink-0" /> : (
                                  <input type="checkbox" checked={!off} onChange={() => toggle(l.index)}
                                    className="w-4 h-4 accent-[#2F68FE] shrink-0" aria-label={`Registrar ${l.vendor}`} />
                                )}
                                <span className="text-[11px] text-[#98A2B3] tabular-nums w-10 shrink-0">{short(l.date)}</span>
                                <span className="flex-1 min-w-[8rem] text-xs text-[#0F172A] truncate" title={l.name}>
                                  {l.vendor}
                                  <span className="ml-1.5 text-[10px] text-[#98A2B3]">{l.paymentMethod}</span>
                                  {l.kind === 'pessoa' && <span className="ml-1.5 text-[10px] font-medium rounded-full px-1.5 py-0.5 bg-amber-50 text-amber-800">pessoa</span>}
                                  {l.registered && <span className="ml-1.5 text-[10px] font-medium rounded-full px-1.5 py-0.5 bg-[#F2F4F7] text-[#667085]">já registrado</span>}
                                </span>
                                {!l.registered && (
                                  <select value={overrides[l.index] || l.category || 'Outros'}
                                    onChange={(e) => setOverrides((p) => ({ ...p, [l.index]: e.target.value }))}
                                    className="bg-[#F2F4F7] rounded-lg px-1.5 py-1 text-[11px] text-[#475467] focus:outline-none max-w-[9rem]"
                                    aria-label={`Categoria de ${l.vendor}`}>
                                    {Array.from(new Set([...data.categories, l.category || 'Outros'])).map((c) => <option key={c} value={c}>{c}</option>)}
                                  </select>
                                )}
                                <span className="text-xs font-semibold tabular-nums text-[#0F172A] whitespace-nowrap min-w-[4.5rem] text-right">{formatBRL(-l.amount)}</span>
                              </li>
                            )
                          })}
                        </ul>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>

            <div className="border border-[#EBEEF2] rounded-xl">
              <button type="button" onClick={() => setShowOthers((v) => !v)} aria-expanded={showOthers}
                className="w-full flex items-center justify-between px-3 py-2.5 text-xs font-medium text-[#475467]">
                O que não é gasto
                <ChevronDown className={`w-4 h-4 transition-transform ${showOthers ? '' : '-rotate-90'}`} />
              </button>
              {showOthers && (
                <div className="px-3 pb-3 space-y-3 text-xs text-[#475467]">
                  {view.notSpending.filter((x) => x.n).map((x) => (
                    <div key={x.label} className="flex justify-between"><span>{x.label} · {x.n}</span><span className="tabular-nums">{x.value ? formatBRL(x.value) : '—'}</span></div>
                  ))}
                  {view.payments.length > 0 && (
                    <label className="flex items-start gap-2 pt-1">
                      <input type="checkbox" checked={registerPayments} onChange={(e) => setRegisterPayments(e.target.checked)} className="mt-0.5 accent-[#2F68FE]" />
                      <span>
                        Registrar os pagamentos de fatura que ainda não estão no app ({view.pendingPayments.length}): eles abatem o “A pagar” da fatura, sem contar como gasto.
                      </span>
                    </label>
                  )}
                  {view.incomeLines.length > 0 && (
                    <p className="text-[11px] text-[#98A2B3]">Entradas ({view.incomeLines.length}) não são registradas: são Pix recebidos de terceiros.</p>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="sticky bottom-0 bg-white border-t border-[#EBEEF2] p-3 sm:p-4 space-y-1.5">
            <button type="button" onClick={confirm} disabled={!hasWork || !accountId || saving}
              className="w-full inline-flex items-center justify-center gap-2 bg-[#2F68FE] hover:bg-[#2557D6] disabled:opacity-50 text-white text-sm font-semibold rounded-xl px-4 py-3">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              {view.chosen.length > 0
                ? `Registrar ${view.chosen.length} gasto${view.chosen.length > 1 ? 's' : ''} · ${formatBRL(view.chosenTotal)}`
                : hasWork ? 'Registrar pagamentos de fatura' : 'Tudo deste extrato já está registrado'}
            </button>
            <p className="text-[11px] text-center text-[#98A2B3]">
              {registerPayments && view.pendingPayments.length ? `+ ${view.pendingPayments.length} pagamento(s) de fatura · ` : ''}
              Desmarque o que não foi gasto seu: o app lembra nos próximos extratos.
            </p>
          </div>
        </>
      )}
    </div>
  )
}
