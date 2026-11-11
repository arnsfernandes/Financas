'use client'

/**
 * Importação de fatura de cartão em uma tela só:
 *  1. cards com o gasto real do mês, o cobrado e os estornos;
 *  2. um selo dizendo se a leitura bate com o resumo impresso pelo banco;
 *  3. categorias que abrem e mostram as despesas (com caixa para desmarcar e seletor de categoria);
 *  4. botão fixo no rodapé para registrar.
 * O resto (conferência detalhada, estornos, cartões, linhas ignoradas, IA) fica em "Detalhes".
 */
import React, { useEffect, useMemo, useState } from 'react'
import { AlertCircle, CheckCircle2, ChevronDown, FileText, Loader2, Lock, Sparkles, X } from 'lucide-react'
import { formatBRL } from '@/lib/formatters'
import { useTelegramWebApp } from '@/lib/useTelegramWebApp'
import { BankStatementPanel } from './BankStatementPanel'

type Action =
  | 'import' | 'refunded' | 'duplicate' | 'installment_exists' | 'same_purchase'
  | 'payment' | 'refund' | 'refund_existing' | 'refund_applied' | 'credit' | 'adjustment'
  | 'card_credit' | 'credit_exists'

interface PreviewLine {
  index: number
  date: string
  description: string
  vendor: string
  amount: number
  isCredit: boolean
  kind: 'purchase' | 'payment' | 'credit' | 'fee'
  card: string | null
  installmentCurrent: number | null
  installmentTotal: number | null
  action: Action
  reason: string
  category: string | null
  purchaseOf?: number
  presentInstallments?: number[]
  purchaseTotal?: number
  refunded?: number
  netAmount?: number
  target?: { vendor: string | null; date: string | null; currentTotal: number }
  refundedEarlier?: boolean
  refundedBy?: number
  paymentDue?: string | null
  paymentRegistered?: boolean
}

interface PreviewResponse {
  ok: boolean
  error?: string
  statement: {
    dueDate: string | null
    issuer: string
    issuerName: string | null
    source: 'pdf' | 'ocr' | 'ofx' | 'csv' | 'text' | 'ai'
    warnings: string[]
    statedTotal: number | null
    printed: { expenses: number | null; advanced: number | null; due: number | null } | null
    totalMatches: boolean | null
    aiAvailable: boolean
    filename: string
  }
  parsed?: unknown
  accountId: string | null
  cards: Array<{ id: string; name: string; institution: string | null }>
  categories: string[]
  lines: PreviewLine[]
}

const SKIP_LABEL: Partial<Record<Action, string>> = {
  duplicate: 'Já lançado',
  installment_exists: 'Já lançado',
  same_purchase: 'Mesma compra',
  payment: 'Pagamento',
  refund: 'Estorno',
  refund_existing: 'Estorno',
  refund_applied: 'Estorno já aplicado',
  credit: 'Crédito',
}

const SOURCE_LABEL: Record<PreviewResponse['statement']['source'], string> = {
  pdf: 'Lido por código, sem IA',
  ocr: 'Lido com OCR da Apple, sem IA',
  ofx: 'Lido por código, sem IA (OFX)',
  csv: 'Lido por código, sem IA (CSV)',
  text: 'Lido por código, sem IA',
  ai: 'Lido com IA',
}

const fdate = (iso: string | null) => (iso ? iso.split('-').reverse().join('/') : '—')
const short = (iso: string) => fdate(iso).slice(0, 5)
const near = (a: number, b: number) => Math.abs(a - b) < 0.02

function Card({ label, value, hint, tone, className = '' }: { label: string; value: string; hint?: string; tone?: 'primary' | 'good'; className?: string }) {
  return (
    <div className={`rounded-xl p-3 border min-w-0 ${tone === 'primary' ? 'bg-[#2F68FE] border-[#2F68FE] text-white' : 'bg-[#F9FAFB] border-[#EBEEF2]'} ${className}`}>
      <p className={`text-[11px] ${tone === 'primary' ? 'text-white/80' : 'text-[#667085]'}`}>{label}</p>
      <p className={`text-base sm:text-lg font-semibold tabular-nums whitespace-nowrap ${tone === 'good' ? 'text-emerald-700' : tone === 'primary' ? '' : 'text-[#0F172A]'}`}>
        {value}
      </p>
      {hint && <p className={`text-[10px] ${tone === 'primary' ? 'text-white/70' : 'text-[#98A2B3]'}`}>{hint}</p>}
    </div>
  )
}

export function StatementImportPanel({
  file,
  onClose,
  onImported,
}: {
  file: File
  onClose: () => void
  onImported?: (message: string) => void | Promise<void>
}) {
  const { fetchWithAuth } = useTelegramWebApp()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState<PreviewResponse | null>(null)
  const [accountId, setAccountId] = useState('')
  const [excluded, setExcluded] = useState<Set<number>>(new Set())
  const [overrides, setOverrides] = useState<Record<number, string>>({})
  const [openCategory, setOpenCategory] = useState<string | null>(null)
  const [showDetails, setShowDetails] = useState(false)
  const [useAi, setUseAi] = useState(false)
  // Senha do PDF protegido: fica só na memória desta tela, para abrir o arquivo na leitura e na confirmação.
  const [password, setPassword] = useState('')
  const [passwordInput, setPasswordInput] = useState('')
  const [passwordPrompt, setPasswordPrompt] = useState<null | { wrong: boolean }>(null)
  // O PDF é extrato da conta (e não fatura): a importação de extrato assume.
  const [bankMode, setBankMode] = useState(false)

  async function load(forAccount?: string, ai = useAi, pwd = password) {
    setLoading(true)
    setError('')
    setPasswordPrompt(null)
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('mode', 'preview')
      if (forAccount) form.append('accountId', forAccount)
      if (ai) form.append('ai', '1')
      if (pwd) form.append('password', pwd)
      const res = await fetchWithAuth('/api/statements/import', { method: 'POST', body: form })
      const data = (await res.json()) as PreviewResponse & { needsPassword?: boolean; wrongPassword?: boolean }
      if (data.needsPassword) {
        setPreview(null)
        setPasswordPrompt({ wrong: Boolean(data.wrongPassword) })
        return
      }
      if ((data as { kind?: string }).kind === 'bank') {
        setBankMode(true)
        return
      }
      if (!res.ok || !data.ok) throw new Error(data.error || 'Falha ao ler a fatura.')
      setPreview(data)
      setAccountId(data.accountId || '')
      setExcluded(new Set())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao ler a fatura.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setUseAi(false)
    setOverrides({})
    setOpenCategory(null)
    setShowDetails(false)
    setPassword('')
    setPasswordInput('')
    setBankMode(false)
    load(undefined, false, '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file])

  const view = useMemo(() => {
    const lines = preview?.lines ?? []
    // Igual ao banco: toda cobrança é despesa pelo valor cobrado; todo crédito é crédito no cartão.
    const ownerOf = (l: PreviewLine) => (l.action === 'same_purchase' && l.purchaseOf !== undefined ? lines[l.purchaseOf] : l)
    const spend = lines.filter((l) => !l.isCredit)
    const credits = lines.filter((l) => l.isCredit && l.kind !== 'payment')
    const payments = lines.filter((l) => l.kind === 'payment')
    const charged = spend.reduce((s, l) => s + l.amount, 0)
    const refunds = credits.reduce((s, l) => s + l.amount, 0)
    const advances = payments
      .filter((l) => l.paymentDue && preview?.statement.dueDate && l.paymentDue === preview.statement.dueDate)
      .reduce((s, l) => s + l.amount, 0)

    const monthOf = new Map<number, number>()
    for (const l of spend) {
      const o = ownerOf(l)
      monthOf.set(o.index, (monthOf.get(o.index) || 0) + l.amount)
    }
    const categoryOf = (l: PreviewLine) => overrides[l.index] || l.category || 'Outros'
    const groups = new Map<string, PreviewLine[]>()
    for (const l of spend) {
      if (l.action === 'same_purchase') continue
      const k = categoryOf(l)
      groups.set(k, [...(groups.get(k) || []), l])
    }
    const categories = Array.from(groups.entries())
      .map(([name, items]) => ({
        name,
        items: items.sort((a, b) => a.date.localeCompare(b.date)),
        total: items.reduce((s, l) => s + (monthOf.get(l.index) || 0), 0),
      }))
      .sort((a, b) => b.total - a.total)

    const importable = lines.filter((l) => l.action === 'import')
    const chosen = importable.filter((l) => !excluded.has(l.index))
    const chosenTotal = chosen.reduce((s, l) => s + (monthOf.get(l.index) || 0), 0)
    const newCredits = lines.filter((l) => l.action === 'card_credit')
    const pendingPayments = payments.filter((l) => !l.paymentRegistered && l.paymentDue)

    // Créditos repetidos (um por parcela) agrupados pela compra a que pertencem.
    const refundGroups = new Map<string, { label: string; count: number; total: number; status: string }>()
    for (const l of credits) {
      const owner = l.purchaseOf !== undefined ? lines[l.purchaseOf] : null
      const key = owner ? `p${owner.index}` : /cred|parc/i.test(l.description) ? `d${l.description}${l.amount}` : `c${l.index}`
      const label = owner
        ? `${owner.vendor}${owner.installmentTotal ? ` ${owner.installmentTotal}×` : ''} · ${fdate(owner.date)}`
        : `${l.vendor} · ${fdate(l.date)}`
      const status = l.action === 'credit_exists' ? 'já registrado' : owner ? 'estorno da compra' : l.reason
      const g = refundGroups.get(key) || { label, count: 0, total: 0, status }
      g.count++
      g.total += l.amount
      refundGroups.set(key, g)
    }

    const byCard = new Map<string, number>()
    for (const l of spend) {
      const k = l.card ? `final ${l.card.slice(-4)}` : 'sem cartão'
      byCard.set(k, (byCard.get(k) || 0) + l.amount)
    }

    // Conferência com o resumo impresso e "Fatura a pagar" (igual ao banco).
    const printed = preview?.statement.printed
    const toPay = printed?.due ?? Math.max(0, charged - refunds - advances)
    let check: { ok: boolean; text: string } | null = null
    if (printed && (printed.expenses != null || printed.due != null)) {
      const expensesOk = printed.expenses == null || near(printed.expenses, charged)
      const dueOk = printed.due == null || printed.advanced == null || near(printed.due, Math.max(0, charged - printed.advanced))
      check = expensesOk && dueOk
        ? { ok: true, text: `Bate com a fatura${preview?.statement.issuerName ? ` do ${preview.statement.issuerName}` : ''}` }
        : { ok: false, text: 'Não bate com o resumo impresso: confira os detalhes' }
    } else if (preview?.statement.totalMatches) {
      check = { ok: true, text: 'Soma confere com o total impresso' }
    }

    return {
      lines, charged, refunds, advances, toPay, payments, categories, monthOf, real: charged,
      importable, chosen, chosenTotal, newCredits, markers: [] as PreviewLine[], fixes: [] as PreviewLine[],
      pendingPayments, check, printed, adjustments: 0, adjustmentDebits: 0, canceled: 0,
      refundGroups: Array.from(refundGroups.values()),
      cards: Array.from(byCard.entries()).sort((a, b) => b[1] - a[1]),
      skipped: [] as PreviewLine[],
    }
  }, [preview, overrides, excluded])
  const hasWork = view.chosen.length > 0 || view.newCredits.length > 0 || view.pendingPayments.length > 0

  async function confirm() {
    if (!accountId || !hasWork || saving) return
    setSaving(true)
    setError('')
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('mode', 'confirm')
      form.append('accountId', accountId)
      form.append('selected', JSON.stringify(view.chosen.map((l) => l.index)))
      form.append('categories', JSON.stringify(overrides))
      if (password) form.append('password', password)
      if (preview?.parsed) form.append('statement', JSON.stringify(preview.parsed))
      const res = await fetchWithAuth('/api/statements/import', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error(data.error || 'Falha ao registrar.')
      const extra = [
        data.creditsRegistered ? `${data.creditsRegistered} crédito(s) · ${formatBRL(data.creditsAmount)}` : '',
        data.paymentsRegistered ? `${data.paymentsRegistered} pagamento(s) de fatura` : '',
      ].filter(Boolean)
      await onImported?.(
        `${data.imported} despesa(s) registrada(s) · ${formatBRL(data.importedAmount)}` +
          (extra.length ? ` · ${extra.join(' · ')}` : ''),
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao registrar.')
    } finally {
      setSaving(false)
    }
  }

  const st = preview?.statement
  const statusOf = (l: PreviewLine): [string, string] | null =>
    l.action === 'duplicate' || l.action === 'installment_exists' ? ['já lançada', 'text-[#667085] bg-[#F2F4F7]']
    : l.refundedBy ? [`estornada · crédito ${formatBRL(l.refundedBy)}`, 'text-emerald-700 bg-emerald-50']
    : null

  if (bankMode) {
    return <BankStatementPanel file={file} password={password || undefined} onClose={onClose} onImported={onImported} />
  }

  return (
    <div className="max-w-2xl mx-auto bg-white border border-[#EBEEF2] rounded-2xl shadow-2xs overflow-hidden">
      {/* Cabeçalho: banco, arquivo, vencimento, como foi lido, cartão de destino */}
      <div className="p-4 border-b border-[#EBEEF2] space-y-2.5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[#EBF2FF] text-[#2F68FE] flex items-center justify-center shrink-0">
              <FileText className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[#0F172A]">
                Fatura {st?.issuerName || 'do cartão'}
                {st?.dueDate ? ` · vence ${fdate(st.dueDate)}` : ''}
              </p>
              <p className="text-xs text-[#667085] truncate">{file.name}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1 text-[#98A2B3] hover:text-[#0F172A]" aria-label="Fechar">
            <X className="w-4 h-4" />
          </button>
        </div>
        {st && (
          <div className="flex flex-wrap items-center gap-2">
            <span className={`text-[11px] font-medium rounded-full px-2 py-0.5 ${st.source === 'ai' ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-700'}`}>
              {SOURCE_LABEL[st.source]}
            </span>
            {view.check && (
              <button
                type="button"
                onClick={() => setShowDetails(true)}
                className={`text-[11px] font-medium rounded-full px-2 py-0.5 ${view.check.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}
              >
                {view.check.ok ? '✓' : '⚠'} {view.check.text}
              </button>
            )}
            {preview && preview.cards.length > 0 && (
              <label className="ml-auto flex items-center gap-1.5 text-[11px] text-[#667085]">
                Registrar no
                <select
                  value={accountId}
                  onChange={(e) => {
                    setAccountId(e.target.value)
                    if (e.target.value) load(e.target.value)
                  }}
                  className="bg-[#F2F4F7] rounded-lg px-2 py-1 text-[11px] font-medium text-[#0F172A] focus:outline-none"
                >
                  <option value="">Escolha o cartão…</option>
                  {preview.cards.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </label>
            )}
          </div>
        )}
      </div>

      {loading && (
        <div className="flex items-center justify-center gap-2 py-12 text-xs text-[#667085]">
          <Loader2 className="w-4 h-4 animate-spin" /> Lendo a fatura…
        </div>
      )}

      {!loading && passwordPrompt && (
        <form
          className="p-5 space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (!passwordInput) return
            setPassword(passwordInput)
            load(undefined, useAi, passwordInput)
          }}
        >
          <div className="flex items-center gap-2 text-sm font-semibold text-[#0F172A]">
            <Lock className="w-4 h-4 text-[#2F68FE]" /> Esta fatura tem senha
          </div>
          <p className="text-xs text-[#667085]">
            Digite a senha do PDF, a mesma que o banco pede para abrir o arquivo. Ela é usada só para abrir a fatura agora e
            não fica guardada.
          </p>
          <input
            type="password"
            autoFocus
            autoComplete="off"
            value={passwordInput}
            onChange={(e) => setPasswordInput(e.target.value)}
            placeholder="Senha do PDF"
            className="w-full bg-[#F2F4F7] border border-transparent focus:border-[#2F68FE] focus:bg-white rounded-xl p-3 text-sm focus:outline-none"
          />
          {passwordPrompt.wrong && <p className="text-xs text-red-700">Senha incorreta. Confira e tente de novo.</p>}
          <button
            type="submit"
            disabled={!passwordInput}
            className="w-full bg-[#2F68FE] hover:bg-[#2557D6] disabled:opacity-50 text-white text-sm font-semibold rounded-xl px-4 py-3"
          >
            Abrir fatura
          </button>
        </form>
      )}

      {error && (
        <div className="m-4 bg-red-50 border border-red-200 text-red-800 rounded-xl px-3 py-2.5 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {!loading && preview && st && (
        <>
          <div className="p-4 space-y-4">
            {st.warnings.map((w) => (
              <div key={w} className={`rounded-xl px-3 py-2 text-xs border ${w.startsWith('⚠') ? 'bg-red-50 border-red-200 text-red-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
                {w}
              </div>
            ))}
            {preview.cards.length === 0 && (
              <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl px-3 py-2 text-xs">
                Cadastre um cartão de crédito em Contas e Cartões para registrar esta fatura.
              </div>
            )}

            {/* Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <Card label="Fatura a pagar" value={formatBRL(view.toPay)} hint="igual ao app do banco" tone="primary" className="col-span-2 sm:col-span-1" />
              <Card label="Despesas da fatura" value={formatBRL(view.charged)} hint="tudo que foi cobrado" />
              <Card label="Créditos e estornos" value={`− ${formatBRL(view.refunds)}`} hint="valores devolvidos" tone="good" />
            </div>
            {view.advances > 0 && (
              <p className="text-[11px] text-[#667085] -mt-2">
                Adiantamentos pagos para esta fatura: {formatBRL(view.advances)}
                {view.printed?.advanced != null && view.printed.advanced - view.refunds - view.advances > 0.009
                  ? ` · crédito da fatura anterior: ${formatBRL(view.printed.advanced - view.refunds - view.advances)}`
                  : ''}
              </p>
            )}

            {/* Categorias */}
            <div>
              <p className="text-xs font-semibold text-[#0F172A] mb-1.5">Gastos por categoria</p>
              <ul className="border border-[#EBEEF2] rounded-xl divide-y divide-[#EBEEF2] overflow-hidden">
                {view.categories.map((cat) => {
                  const open = openCategory === cat.name
                  const pct = view.real > 0 ? Math.round((cat.total / view.real) * 100) : 0
                  return (
                    <li key={cat.name}>
                      <button
                        type="button"
                        onClick={() => setOpenCategory(open ? null : cat.name)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-[#F9FAFB] text-left"
                        aria-expanded={open}
                      >
                        <ChevronDown className={`w-4 h-4 text-[#98A2B3] shrink-0 transition-transform ${open ? '' : '-rotate-90'}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="text-sm font-medium text-[#0F172A] truncate">
                              {cat.name} <span className="text-xs font-normal text-[#98A2B3]">{cat.items.length}</span>
                            </span>
                            <span className="text-sm font-semibold tabular-nums text-[#0F172A]">{formatBRL(cat.total)}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <div className="h-1.5 flex-1 rounded-full bg-[#F2F4F7] overflow-hidden">
                              <div className="h-full rounded-full bg-[#2F68FE]" style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
                            </div>
                            <span className="text-[10px] text-[#98A2B3] tabular-nums w-8 text-right">{pct}%</span>
                          </div>
                        </div>
                      </button>
                      {open && (
                        <ul className="bg-[#FCFCFD] border-t border-[#EBEEF2] divide-y divide-[#F2F4F7]">
                          {cat.items.map((l) => {
                            const isNew = l.action === 'import'
                            const status = statusOf(l)
                            const value = view.monthOf.get(l.index) || 0
                            const off = isNew && excluded.has(l.index)
                            return (
                              <li key={l.index} className={`flex flex-wrap items-center gap-x-2.5 gap-y-1 pl-3 sm:pl-10 pr-3 py-2 ${off ? 'opacity-50' : ''}`}>
                                {isNew ? (
                                  <input
                                    type="checkbox"
                                    checked={!off}
                                    onChange={() =>
                                      setExcluded((prev) => {
                                        const next = new Set(prev)
                                        if (next.has(l.index)) next.delete(l.index)
                                        else next.add(l.index)
                                        return next
                                      })
                                    }
                                    className="w-4 h-4 accent-[#2F68FE] shrink-0"
                                    aria-label={`Registrar ${l.vendor}`}
                                  />
                                ) : (
                                  <span className="w-4 shrink-0" />
                                )}
                                <span className="text-[11px] text-[#98A2B3] tabular-nums w-10 shrink-0">{short(l.date)}</span>
                                <span className="flex-1 min-w-[8rem] text-xs text-[#0F172A] truncate" title={l.description}>
                                  {l.vendor}
                                  {l.installmentTotal ? (
                                    <span className="ml-1.5 text-[10px] font-semibold text-[#2F68FE] bg-[#EBF2FF] rounded-full px-1.5 py-0.5">
                                      {(l.presentInstallments?.length ?? 0) > 1
                                        ? `${Math.min(...l.presentInstallments!)}–${Math.max(...l.presentInstallments!)}/${l.installmentTotal}`
                                        : `${l.installmentCurrent}/${l.installmentTotal}`}
                                    </span>
                                  ) : null}
                                  {status && (
                                    <span className={`ml-1.5 text-[10px] font-medium rounded-full px-1.5 py-0.5 ${status[1]}`}>{status[0]}</span>
                                  )}
                                </span>
                                {isNew && preview.categories.length > 0 && (
                                  <select
                                    value={overrides[l.index] || l.category || 'Outros'}
                                    onChange={(e) => setOverrides((prev) => ({ ...prev, [l.index]: e.target.value }))}
                                    className="bg-[#F2F4F7] rounded-lg px-1.5 py-1 text-[11px] text-[#475467] focus:outline-none max-w-[9rem]"
                                    aria-label={`Categoria de ${l.vendor}`}
                                  >
                                    {Array.from(new Set([...preview.categories, l.category || 'Outros'])).map((c) => (
                                      <option key={c} value={c}>{c}</option>
                                    ))}
                                  </select>
                                )}
                                <span className="text-xs font-semibold tabular-nums text-[#0F172A] whitespace-nowrap text-right min-w-[4.5rem]">
                                  {value !== l.amount && (l.presentInstallments?.length ?? 1) <= 1 && (
                                    <span className="block text-[10px] font-normal text-[#98A2B3] line-through">{formatBRL(l.amount)}</span>
                                  )}
                                  {formatBRL(value)}
                                </span>
                              </li>
                            )
                          })}
                        </ul>
                      )}
                    </li>
                  )
                })}
              </ul>
              {view.importable.some((l) => l.installmentTotal) && (
                <p className="text-[11px] text-[#98A2B3] mt-1.5">
                  Compras parceladas: o app lança todas as parcelas, as anteriores e as futuras, cada uma no seu mês.
                </p>
              )}
            </div>

            {/* Detalhes */}
            <div className="border border-[#EBEEF2] rounded-xl">
              <button
                type="button"
                onClick={() => setShowDetails((v) => !v)}
                className="w-full flex items-center justify-between px-3 py-2.5 text-xs font-medium text-[#475467]"
                aria-expanded={showDetails}
              >
                Detalhes da fatura
                <ChevronDown className={`w-4 h-4 transition-transform ${showDetails ? '' : '-rotate-90'}`} />
              </button>
              {showDetails && (
                <div className="px-3 pb-3 space-y-4 text-xs text-[#475467]">
                  {view.printed && (
                    <section className="space-y-1">
                      <p className="font-semibold text-[#0F172A]">Conferência com o resumo do banco</p>
                      {view.printed.expenses != null && (
                        <Row label="Despesas do mês" value={view.printed.expenses} ok={near(view.printed.expenses, view.charged)} />
                      )}
                      {view.printed.advanced != null && (() => {
                        // O "valor antecipado" do banco = estornos + adiantamentos pagos para esta fatura + crédito
                        // que sobrou da fatura anterior.
                        const advances = view.payments
                          .filter((l) => l.paymentDue && st.dueDate && l.paymentDue === st.dueDate)
                          .reduce((sum, l) => sum + l.amount, 0)
                        const carried = view.printed.advanced - view.refunds - advances
                        return (
                          <>
                            <Row label="Estornos desta fatura" value={-view.refunds} />
                            {advances > 0.009 && <Row label="Adiantamentos pagos para esta fatura" value={-advances} />}
                            {carried > 0.009 && <Row label="Crédito que sobrou da fatura anterior" value={-carried} />}
                          </>
                        )
                      })()}
                      {view.printed.due != null && view.printed.advanced != null && (
                        <Row label="Fatura a pagar" value={view.printed.due} bold
                          ok={near(view.printed.due, Math.max(0, view.charged - view.printed.advanced))} />
                      )}
                      {view.printed.advanced != null && view.printed.advanced > view.charged + 0.009 && (
                        <p className="text-[11px] text-[#98A2B3]">
                          Sobram {formatBRL(view.printed.advanced - view.charged)} de crédito para a próxima fatura.
                        </p>
                      )}
                    </section>
                  )}

                  {view.payments.length > 0 && (
                    <section className="space-y-1">
                      <p className="font-semibold text-[#0F172A]">Pagamentos e adiantamentos</p>
                      {view.payments.map((l) => (
                        <div key={l.index} className="flex justify-between gap-2">
                          <span>
                            {fdate(l.date)} ·{' '}
                            {l.paymentRegistered
                              ? 'já registrado'
                              : l.paymentDue === st.dueDate
                                ? 'adiantamento desta fatura'
                                : `pagamento da fatura de ${fdate(l.paymentDue ?? null)}`}
                          </span>
                          <span className="tabular-nums">{formatBRL(l.amount)}</span>
                        </div>
                      ))}
                      <p className="text-[11px] text-[#98A2B3]">Não é gasto: fica registrado como pagamento da fatura do cartão.</p>
                    </section>
                  )}

                  {view.refundGroups.length > 0 && (
                    <section className="space-y-1">
                      <p className="font-semibold text-[#0F172A]">Estornos recebidos ({formatBRL(view.refunds)})</p>
                      {view.refundGroups.map((g) => (
                        <div key={g.label} className="flex justify-between gap-2">
                          <span className="min-w-0">
                            {g.label}
                            <span className="block text-[11px] text-[#98A2B3]">
                              {g.count > 1 ? `${g.count} créditos repetidos` : '1 crédito'} · {g.status}
                            </span>
                          </span>
                          <span className="tabular-nums whitespace-nowrap text-emerald-700">− {formatBRL(g.total)}</span>
                        </div>
                      ))}
                      <p className="text-[11px] text-[#98A2B3]">
                        Cada crédito é registrado no cartão como na fatura; a compra continua como despesa pelo valor cobrado.
                      </p>
                    </section>
                  )}

                  {view.adjustments > 0 && (
                    <section className="space-y-1">
                      <p className="font-semibold text-[#0F172A]">Ajustes do banco que se anulam</p>
                      <p>
                        {view.adjustments / 2} crédito(s) e {view.adjustments / 2} reversão(ões) de crédito de mesmo valor
                        ({formatBRL(view.adjustmentDebits)} cada lado). Somam zero: não contam como gasto nem como estorno.
                      </p>
                    </section>
                  )}

                  {view.cards.length > 1 && (
                    <section className="space-y-1">
                      <p className="font-semibold text-[#0F172A]">Gasto real por cartão</p>
                      {view.cards.map(([card, value]) => (
                        <div key={card} className="flex justify-between">
                          <span>Cartão {card}</span>
                          <span className="tabular-nums">{formatBRL(value)}</span>
                        </div>
                      ))}
                    </section>
                  )}

                  {view.skipped.length > 0 && (
                    <section className="space-y-1">
                      <p className="font-semibold text-[#0F172A]">Créditos sem compra correspondente ({view.skipped.length})</p>
                      <ul className="max-h-48 overflow-y-auto space-y-1">
                        {view.skipped.map((l) => (
                          <li key={l.index} className="flex items-center gap-2 text-[11px]">
                            <span className="shrink-0 rounded-full bg-[#F2F4F7] px-1.5 py-0.5 font-medium">{SKIP_LABEL[l.action] || '—'}</span>
                            <span className="truncate flex-1" title={l.reason}>{short(l.date)} {l.vendor}</span>
                            <span className="tabular-nums whitespace-nowrap">{l.isCredit ? '+ ' : ''}{formatBRL(l.amount)}</span>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}

                  {st.aiAvailable && st.source !== 'ai' && (
                    <button
                      type="button"
                      onClick={() => {
                        setUseAi(true)
                        load(accountId || undefined, true)
                      }}
                      className="inline-flex items-center gap-1.5 text-[11px] text-[#667085] hover:text-[#0F172A]"
                    >
                      <Sparkles className="w-3.5 h-3.5" /> Algo foi lido errado? Ler com IA (envia a fatura para a OpenAI)
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Rodapé fixo */}
          <div className="sticky bottom-0 bg-white border-t border-[#EBEEF2] p-3 sm:p-4 space-y-1.5">
            <button
              type="button"
              onClick={confirm}
              disabled={!hasWork || !accountId || saving}
              className="w-full inline-flex items-center justify-center gap-2 bg-[#2F68FE] hover:bg-[#2557D6] disabled:opacity-50 text-white text-sm font-semibold rounded-xl px-4 py-3"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              {!hasWork
                ? 'Tudo desta fatura já está registrado'
                : view.chosen.length > 0
                  ? `Registrar ${view.chosen.length} despesa${view.chosen.length > 1 ? 's' : ''} · ${formatBRL(view.chosenTotal)}`
                  : 'Registrar créditos e pagamentos'}
            </button>
            {hasWork && (
              <p className="text-[11px] text-center text-[#98A2B3]">
                {[
                  view.newCredits.length ? `+ ${view.newCredits.length} crédito(s) · ${formatBRL(view.newCredits.reduce((s, l) => s + l.amount, 0))}` : '',
                  view.pendingPayments.length ? `+ ${view.pendingPayments.length} pagamento(s) de fatura` : '',
                  !accountId ? 'escolha o cartão no topo' : '',
                ].filter(Boolean).join(' · ') || 'Você pode desmarcar ou mudar a categoria de cada despesa nas categorias acima.'}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function Row({ label, value, ok, bold }: { label: string; value: number; ok?: boolean; bold?: boolean }) {
  return (
    <div className={`flex justify-between gap-2 ${bold ? 'font-medium text-[#0F172A] pt-1 border-t border-[#F2F4F7]' : ''}`}>
      <span>{label}</span>
      <span className="tabular-nums">
        {value < 0 ? `− ${formatBRL(-value)}` : formatBRL(value)}
        {ok !== undefined && (ok ? <span className="text-emerald-700"> ✓</span> : <span className="text-amber-700"> ≠ lido</span>)}
      </span>
    </div>
  )
}
