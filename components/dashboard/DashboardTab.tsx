'use client'

import React, { useState } from 'react'
import {
  CreditCard,
  ChevronRight,
  AlertTriangle,
  Zap,
  ShoppingBag,
  Home as HomeIcon,
  Car,
  Utensils,
  Receipt,
  Smartphone,
  Banknote,
  ReceiptText,
  PieChart,
  ArrowDownLeft,
  ArrowUpRight,
  Info,
  Search,
  Bell,
  Repeat,
} from 'lucide-react'
import type { Account, TransactionRecord } from '@/lib/schema'
import type { DashboardSummary } from '@/lib/queries'
import { formatBRL } from '@/lib/formatters'
import { EditTransactionModal } from '@/components/modals/EditTransactionModal'
import { MonthPicker } from '@/components/ui/MonthPicker'
import { useTelegramWebApp } from '@/lib/useTelegramWebApp'
import { CategoryDetailPanel } from './CategoryDetailPanel'
import { CashFlowDrawer } from './CashFlowDrawer'
import { MonthBreakdownModal } from './MonthBreakdownModal'
import { CategoryReviewModal } from './CategoryReviewModal'
import { TransactionDetailModal } from '@/components/transactions/TransactionDetailModal'

export interface DashboardTabProps {
  dashboardData: DashboardSummary | null
  loadingDashboard: boolean
  dashboardError?: string
  accounts: Account[]
  periodType: 'month' | 'year' | 'custom'
  handlePeriodTypeChange: (p: 'month' | 'year') => void
  monthOffset: number
  handleMonthNavigate: (delta: number) => void
  customStartDate?: string
  setCustomStartDate?: (v: string) => void
  customEndDate?: string
  setCustomEndDate?: (v: string) => void
  handleApplyCustomPeriod?: (e: React.FormEvent) => void
  dashboardAccountId: string
  setDashboardAccountId: (v: string) => void
  fetchDashboard: (
    overridePeriod?: 'month' | 'year' | 'custom',
    overrideOffset?: number,
    overrideStart?: string,
    overrideEnd?: string,
    overrideAccountId?: string,
    overridePaymentMethod?: string
  ) => Promise<void>
  setFilterType: (v: 'all' | 'expense' | 'income') => void
  navigateToTransactionsFiltered: (filters: {
    startDate?: string | null
    endDate?: string | null
    vendor?: string | null
    category?: string | null
    accountId?: string | null
    paymentMethod?: string | null
    isRecurring?: boolean
    recurrenceStatus?: 'active' | 'ended'
    isInstallment?: boolean
  }) => void
  onOpenNewLaunch?: (type: 'expense' | 'income') => void
  onNavigateToCategories?: () => void
  onTransactionUpdated?: (updatedTx: TransactionRecord) => void
  onDeleteTransaction?: (id: string) => Promise<void>
}

export function DashboardTab({
  dashboardData,
  loadingDashboard,
  dashboardError,
  accounts,
  monthOffset,
  handleMonthNavigate,
  dashboardAccountId,
  fetchDashboard,
  setFilterType,
  navigateToTransactionsFiltered,
  onOpenNewLaunch,
  onNavigateToCategories,
  onTransactionUpdated,
  onDeleteTransaction,
}: DashboardTabProps) {
  const { fetchWithAuth } = useTelegramWebApp()

  // Drawer de Entradas/Saídas (Receitas / Despesas)
  const [drawerType, setDrawerType] = useState<'income' | 'expense' | null>(null)
  const [drawerTxList, setDrawerTxList] = useState<TransactionRecord[]>([])
  const [loadingDrawerTx, setLoadingDrawerTx] = useState(false)
  const [drawerError, setDrawerError] = useState('')

  // Painel de Detalhes da Categoria
  const [selectedCategoryDetail, setSelectedCategoryDetail] = useState<any | null>(null)
  const [categoryTxList, setCategoryTxList] = useState<TransactionRecord[]>([])
  const [loadingCategoryTx, setLoadingCategoryTx] = useState(false)
  const [categoryTxError, setCategoryTxError] = useState('')

  // Modal de Detalhes de Lançamento selecionado na Home
  const [selectedHomeTx, setSelectedHomeTx] = useState<TransactionRecord | null>(null)

  // Modal de Edição Completa dentro da Visão Geral
  const [editingTx, setEditingTx] = useState<TransactionRecord | null>(null)
  const [deletingTxId, setDeletingTxId] = useState<string | null>(null)

  // Filtro rápido de forma/tipo (Tudo | Cartão | PIX | Dinheiro)
  const [quickFilter, setQuickFilter] = useState<'all' | 'card' | 'pix' | 'cash'>('all')

  function handleSelectQuickFilter(filter: 'all' | 'card' | 'pix' | 'cash') {
    setQuickFilter(filter)
    const pmParam = filter === 'card' ? 'card' : filter === 'pix' ? 'PIX' : filter === 'cash' ? 'Dinheiro' : ''
    fetchDashboard(undefined, undefined, undefined, undefined, undefined, pmParam)
  }

  // Helper de ícone e cor por categoria/estabelecimento
  function getCategoryVisual(name?: string) {
    const n = (name || '').toLowerCase()
    if (n.includes('mercado') || n.includes('compra') || n.includes('shopee') || n.includes('amazon')) {
      return { icon: ShoppingBag, color: '#10B981', bg: '#E8FDF3' }
    }
    if (n.includes('energia') || n.includes('luz') || n.includes('eletric')) {
      return { icon: Zap, color: '#F59E0B', bg: '#FEF6E7' }
    }
    if (n.includes('tel') || n.includes('tim') || n.includes('vivo') || n.includes('claro') || n.includes('assina')) {
      return { icon: Smartphone, color: '#6366F1', bg: '#EEF0FF' }
    }
    if (n.includes('food') || n.includes('ifood') || n.includes('alimenta') || n.includes('restaurante') || n.includes('refeic')) {
      return { icon: Utensils, color: '#EC4899', bg: '#FDF0F6' }
    }
    if (n.includes('uber') || n.includes('transporte') || n.includes('combust') || n.includes('gasolina') || n.includes('99')) {
      return { icon: Car, color: '#0EA5E9', bg: '#EBF6FE' }
    }
    if (n.includes('mora') || n.includes('casa') || n.includes('aluguel')) {
      return { icon: HomeIcon, color: '#3B82F6', bg: '#EFF5FF' }
    }
    return { icon: Receipt, color: '#64748B', bg: '#F1F5F9' }
  }

  // Lançamentos recentes
  const recentTransactions = dashboardData?.recentTransactions || []
  // Todos os lançamentos do mês exibido (cartão pela fatura): base do pop-up, dos painéis e do drawer.
  const periodTx: any[] | null = (dashboardData as any)?.periodTransactions ?? null
  const [monthModal, setMonthModal] = useState<'categories' | 'transactions' | null>(null)
  const [monthModalCategory, setMonthModalCategory] = useState<string | null>(null)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [showAllSubs, setShowAllSubs] = useState(false)
  const budgets = (dashboardData as any)?.budgets as { available: boolean; values: Record<string, number> } | undefined
  const history = ((dashboardData as any)?.monthlyHistory || []) as Array<{ month: string; label: string; total: number }>
  const subscriptions = ((dashboardData as any)?.subscriptions || { items: [], monthlyTotal: 0 }) as { items: any[]; monthlyTotal: number }
  const totalBudget = budgets?.values ? Object.values(budgets.values).reduce((s, v) => s + v, 0) : 0
  const selectedMonthKey = dashboardData?.period?.startDate?.slice(0, 7)

  async function saveBudgets(values: Record<string, number>): Promise<string | null> {
    try {
      const res = await fetchWithAuth('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'budgets', value: values }),
      })
      const d = await res.json()
      if (!d.ok) return d.error || 'Falha ao salvar orçamento.'
      fetchDashboard()
      return null
    } catch {
      return 'Falha de conexão ao salvar orçamento.'
    }
  }

  // Abrir Detalhe da Categoria
  async function handleOpenCategoryDetail(cat: any) {
    // Mês selecionado: abre o pop-up do mês já com a categoria aberta (mesmos lançamentos dos totais).
    if (periodTx) {
      setMonthModalCategory(cat.category)
      setMonthModal('categories')
      return
    }
    setSelectedCategoryDetail(cat)
    setLoadingCategoryTx(true)
    setCategoryTxError('')
    try {
      const params = new URLSearchParams()
      params.append('type', 'expense')
      params.append('category', cat.rawCategory || cat.category)
      params.append('limit', '100')
      if (quickFilter === 'card') {
        params.append('paymentMethod', 'credit_card')
      } else if (quickFilter === 'pix') {
        params.append('paymentMethod', 'PIX')
      } else if (quickFilter === 'cash') {
        params.append('paymentMethod', 'Dinheiro')
      } else if (dashboardAccountId === 'pix') {
        params.append('paymentMethod', 'PIX')
      } else if (dashboardAccountId) {
        params.append('accountId', dashboardAccountId)
      }
      if (dashboardData?.period?.startDate) params.append('startDate', dashboardData.period.startDate)
      if (dashboardData?.period?.endDate) params.append('endDate', dashboardData.period.endDate)

      const res = await fetchWithAuth(`/api/transactions?${params.toString()}`)
      const data = await res.json()
      if (data.ok && Array.isArray(data.transactions)) {
        setCategoryTxList(data.transactions)
      } else {
        setCategoryTxError(data.error || 'Erro ao carregar transações da categoria')
      }
    } catch {
      setCategoryTxError('Erro de conexão ao carregar transações da categoria')
    } finally {
      setLoadingCategoryTx(false)
    }
  }

  // Abrir Drawer de Entradas ou Saídas
  async function handleOpenDrawer(type: 'income' | 'expense') {
    if (periodTx) {
      setDrawerType(type)
      setDrawerError('')
      setDrawerTxList(
        periodTx
          .filter((t) => (type === 'income' ? t.type === 'income' : t.type !== 'income'))
          .sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))),
      )
      return
    }
    setDrawerType(type)
    setLoadingDrawerTx(true)
    setDrawerError('')
    try {
      const params = new URLSearchParams()
      params.append('type', type)
      params.append('limit', '150')
      if (quickFilter === 'card') {
        params.append('paymentMethod', 'credit_card')
      } else if (quickFilter === 'pix') {
        params.append('paymentMethod', 'PIX')
      } else if (quickFilter === 'cash') {
        params.append('paymentMethod', 'Dinheiro')
      } else if (dashboardAccountId === 'pix') {
        params.append('paymentMethod', 'PIX')
      } else if (dashboardAccountId) {
        params.append('accountId', dashboardAccountId)
      }
      if (dashboardData?.period?.startDate) params.append('startDate', dashboardData.period.startDate)
      if (dashboardData?.period?.endDate) params.append('endDate', dashboardData.period.endDate)

      const res = await fetchWithAuth(`/api/transactions?${params.toString()}`)
      const data = await res.json()
      if (data.ok && Array.isArray(data.transactions)) {
        setDrawerTxList(data.transactions)
      } else {
        setDrawerError(data.error || 'Erro ao carregar transações')
      }
    } catch {
      setDrawerError('Erro de conexão ao carregar lançamentos')
    } finally {
      setLoadingDrawerTx(false)
    }
  }

  async function handleDeleteTransactionInDrawer(e: React.MouseEvent, id: string) {
    e.stopPropagation()
    if (!confirm('Deseja realmente excluir este lançamento?')) return
    setDeletingTxId(id)
    try {
      if (onDeleteTransaction) {
        await onDeleteTransaction(id)
      } else {
        await fetchWithAuth(`/api/transactions/${id}`, { method: 'DELETE' })
      }
      setDrawerTxList((prev) => prev.filter((tx) => tx.id !== id))
      fetchDashboard()
    } catch {
      alert('Erro ao excluir lançamento')
    } finally {
      setDeletingTxId(null)
    }
  }

  // Fatura do cartão do mês exibido (some nos filtros Pix e Dinheiro).
  const cardInvoice: any =
    quickFilter === 'pix' || quickFilter === 'cash' ? null : (dashboardData?.cardInvoices || [])[0] || null

  return (
    <section className="space-y-6 max-w-6xl mx-auto pb-12 font-sans">
      {/* 1. BARRA SUPERIOR: SELETOR DE PERÍODO & FILTROS RÁPIDOS */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-slate-200/80 rounded-2xl px-4 py-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="flex items-center gap-2 shrink-0 whitespace-nowrap">
          <MonthPicker
            monthOffset={monthOffset}
            onSelectMonthOffset={(offset) => {
              handleMonthNavigate(offset - monthOffset)
            }}
          />
          {cardInvoice && (
            <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-500 bg-slate-50 border border-slate-200/70 rounded-lg px-2 py-1 whitespace-nowrap shrink-0">
              {shortDate(cardInvoice.cycleStart)} a {shortDate(cardInvoice.cycleEnd)}
              <span
                tabIndex={0}
                className="text-slate-400 hover:text-slate-600 cursor-help"
                title="No cartão, o mês segue a fatura: entram as compras desse período, como no app do banco. Pix, dinheiro e entradas seguem a data do lançamento."
                aria-label="Como o período é calculado"
              >
                <Info className="w-3.5 h-3.5" />
              </span>
            </span>
          )}
        </div>

        {/* Filtros rápidos: Tudo, Cartão, PIX, Dinheiro */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (searchText.trim()) navigateToTransactionsFiltered({ search: searchText.trim() } as any)
            }}
            className="hidden xl:flex items-center gap-1.5 bg-slate-50 border border-slate-200/60 rounded-xl px-2.5 py-1.5 mr-1 shrink-0"
          >
            <Search className="w-3.5 h-3.5 text-slate-400" />
            <input
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder='Buscar ("Shopee", "mercado"…)'
              aria-label="Buscar lançamentos"
              className="bg-transparent text-xs w-40 focus:outline-none text-slate-700"
            />
          </form>
          <button
            type="button"
            onClick={() => handleSelectQuickFilter('all')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-medium transition-all shrink-0 cursor-pointer ${
              quickFilter === 'all'
                ? 'bg-[#2F68FE] text-white font-semibold shadow-xs'
                : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200/60'
            }`}
          >
            Tudo
          </button>
          <button
            type="button"
            onClick={() => handleSelectQuickFilter('card')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-medium transition-all shrink-0 cursor-pointer ${
              quickFilter === 'card'
                ? 'bg-[#2F68FE] text-white font-semibold shadow-xs'
                : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200/60'
            }`}
          >
            <CreditCard className="w-3.5 h-3.5 stroke-[1.8]" />
            <span>Cartão</span>
          </button>
          <button
            type="button"
            onClick={() => handleSelectQuickFilter('pix')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-medium transition-all shrink-0 cursor-pointer ${
              quickFilter === 'pix'
                ? 'bg-[#2F68FE] text-white font-semibold shadow-xs'
                : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200/60'
            }`}
          >
            <svg className="w-3.5 h-3.5 stroke-[1.8]" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M12 2L2 12l10 10 10-10L12 2z" />
              <path d="M12 6l-6 6 6 6 6-6-6-6z" />
            </svg>
            <span>PIX</span>
          </button>
          <button
            type="button"
            onClick={() => handleSelectQuickFilter('cash')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-medium transition-all shrink-0 cursor-pointer ${
              quickFilter === 'cash'
                ? 'bg-[#2F68FE] text-white font-semibold shadow-xs'
                : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200/60'
            }`}
          >
            <Banknote className="w-3.5 h-3.5 stroke-[1.8]" />
            <span>Dinheiro</span>
          </button>
        </div>
      </div>

      {dashboardError && (
        <div className="border border-red-200 bg-red-50 text-red-700 rounded-2xl px-4 py-3 text-xs flex items-center gap-2.5 shadow-xs">
          <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
          <span className="font-medium">{dashboardError}</span>
        </div>
      )}

      {loadingDashboard && !dashboardData ? (
        <div className="bg-white border border-slate-200/80 rounded-3xl p-12 text-center text-slate-400 text-sm font-medium animate-pulse shadow-xs">
          Carregando informações financeiras…
        </div>
      ) : !dashboardData ? (
        <div className="bg-white border border-slate-200/80 rounded-3xl p-12 text-center text-slate-400 text-sm font-medium shadow-xs">
          Nenhum dado encontrado para o período.
        </div>
      ) : (
        <>
          {cardInvoice?.missingStatements?.length > 0 && (
            <div className="flex items-center gap-3 bg-[#EBF2FF] text-[#2F68FE] rounded-2xl px-4 py-3 text-sm">
              <Bell className="w-4 h-4 shrink-0" />
              <span className="flex-1">
                {cardInvoice.missingStatements.length === 1
                  ? `A fatura que venceu em ${shortDate(cardInvoice.missingStatements[0])} ainda não foi importada.`
                  : `${cardInvoice.missingStatements.length} faturas ainda não foram importadas (${cardInvoice.missingStatements.map((d: string) => shortDate(d)).join(', ')}).`}{' '}
                <span className="text-[#2F68FE]/70">Leva 1 minuto.</span>
              </span>
              {onOpenNewLaunch && (
                <button type="button" onClick={() => onOpenNewLaunch('expense')} className="font-semibold whitespace-nowrap hover:underline">
                  Importar fatura →
                </button>
              )}
            </div>
          )}

          {/* 2. CARDS PRINCIPAIS: gastos do mês + fatura do cartão (como no app do banco) */}
          <div className={`grid grid-cols-1 gap-4 ${cardInvoice ? 'md:grid-cols-2' : ''}`}>
            {(() => {
              const expenses = dashboardData.metrics?.totalExpenses ?? dashboardData.metrics?.totalSpent ?? 0
              const income = dashboardData.metrics?.totalIncome ?? 0
              const diff = dashboardData.metrics?.comparison?.differencePercentage
              return (
                <div
                  onClick={() => handleOpenDrawer('expense')}
                  className="bg-white border border-slate-200/80 rounded-3xl p-5 sm:p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] cursor-pointer hover:border-slate-300 transition-colors flex flex-col"
                  title="Ver todos os gastos do mês"
                >
                  <span className="text-xs font-medium text-slate-500">Gastos do mês</span>
                  <span className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 tabular-nums mt-1">
                    {formatBRL(expenses)}
                  </span>
                  {diff !== null && diff !== undefined && Number.isFinite(diff) && (
                    <span className={`text-xs font-medium mt-1 inline-flex items-center gap-1 ${diff > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                      {diff > 0 ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownLeft className="w-3.5 h-3.5" />}
                      {Math.abs(Math.round(diff))}% vs {dashboardData.period?.previousLabel?.split(' de ')[0]?.toLowerCase() || 'mês anterior'}
                    </span>
                  )}
                  {history.length > 1 && (
                    <MonthBars
                      history={history}
                      budget={totalBudget}
                      current={selectedMonthKey}
                      onSelect={(index) => {
                        const from = history.findIndex((h) => h.month === selectedMonthKey)
                        if (from >= 0 && index !== from) handleMonthNavigate(index - from)
                      }}
                    />
                  )}
                  <div className="mt-auto pt-4">
                    <div className="border-t border-slate-100 pt-3 space-y-1.5 text-sm">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleOpenDrawer('income')
                        }}
                        className="w-full flex justify-between items-center text-left cursor-pointer"
                      >
                        <span className="text-slate-500">Entradas</span>
                        <span className="font-semibold text-emerald-600 tabular-nums">{formatBRL(income)}</span>
                      </button>
                      {income > 0 && (
                        <div className="flex justify-between items-center">
                          <span className="text-slate-500">Saldo</span>
                          <span className="font-semibold text-slate-900 tabular-nums">{formatBRL(income - expenses)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })()}

            {cardInvoice && (
              <div className="bg-white border border-slate-200/80 rounded-3xl p-5 sm:p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] flex flex-col">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-slate-500 inline-flex items-center gap-1.5">
                    <CreditCard className="w-4 h-4" /> Fatura {cardInvoice.accountName.replace(/^cart[aã]o\s+/i, '')}
                  </span>
                  <span
                    className={`text-[11px] font-medium rounded-lg px-2 py-0.5 ${
                      !cardInvoice.closed
                        ? 'bg-amber-50 text-amber-800'
                        : cardInvoice.toPay <= 0.009
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-rose-50 text-rose-700'
                    }`}
                  >
                    {!cardInvoice.closed ? 'Aberta' : cardInvoice.toPay <= 0.009 ? 'Paga' : 'Fechada'} · vence {shortDate(cardInvoice.dueDate)}
                  </span>
                </div>
                <span className="text-xs text-slate-500 mt-3">A pagar</span>
                <span className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 tabular-nums">
                  {formatBRL(cardInvoice.toPay)}
                </span>
                <div className="mt-auto pt-4">
                  <div className="border-t border-slate-100 pt-3 space-y-1.5 text-sm">
                    <InvoiceRow label="Despesas" value={cardInvoice.expenses} />
                    {cardInvoice.credits > 0.009 && <InvoiceRow label="Créditos e estornos" value={-cardInvoice.credits} />}
                    {cardInvoice.payments > 0.009 && <InvoiceRow label="Pagamentos" value={-cardInvoice.payments} />}
                    {cardInvoice.carriedCredit > 0.009 && <InvoiceRow label="Já pago (sobra anterior)" value={-cardInvoice.carriedCredit} />}
                  </div>
                  {(cardInvoice.upcoming || []).some((u: any) => u.expenses > 0) && (
                    <p className="text-[11px] text-slate-500 mt-2" title="Parcelas já contratadas que entram nas próximas faturas">
                      Próximas:{' '}
                      {(cardInvoice.upcoming || []).map((u: any, i: number) => (
                        <span key={u.dueDate} className={i === 0 ? 'font-semibold text-slate-700' : ''}>
                          {i > 0 ? ' · ' : ''}
                          {new Date(u.dueDate + 'T00:00:00').toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')} {formatBRL(u.expenses)}
                        </span>
                      ))}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      navigateToTransactionsFiltered({
                        accountId: cardInvoice.accountId,
                        paymentMethod: '',
                        competence: { key: selectedMonthKey || '', label: `Fatura ${cardInvoice.accountName.replace(/^cart[aã]o\s+/i, '')} · vence ${shortDate(cardInvoice.dueDate)}` },
                      } as any)
                    }
                    className="mt-3 ml-auto flex items-center gap-1 text-xs font-semibold text-[#2F68FE] hover:bg-[#EBF2FF] px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
                  >
                    Ver fatura <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* 3. GRID DESKTOP EM 2 COLUNAS: ÚLTIMOS LANÇAMENTOS + ONDE VOCÊ GASTOU */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* COLUNA 1 (7 Colunas no Desktop): ÚLTIMOS LANÇAMENTOS */}
            <div className="lg:col-span-7 bg-white border border-slate-200/80 rounded-3xl p-5 sm:p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.02)] flex flex-col justify-between">
              <div>
                {/* Cabeçalho do Card */}
                <div className="flex items-center justify-between gap-2 mb-4 pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-[#EBF2FF] text-[#2F68FE] flex items-center justify-center shrink-0">
                      <ReceiptText className="w-4 h-4 stroke-[2.2]" />
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-slate-900 tracking-tight">
                        Últimos lançamentos
                      </h2>
                      <p className="text-[11px] font-normal text-slate-500">
                        Atividades recentes deste período
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      if (periodTx) {
                        setMonthModal('transactions')
                        return
                      }
                      setFilterType('all')
                      navigateToTransactionsFiltered({
                        startDate: dashboardData.period.startDate,
                        endDate: dashboardData.period.endDate,
                        paymentMethod: quickFilter === 'card' ? 'credit_card' : quickFilter === 'pix' ? 'PIX' : quickFilter === 'cash' ? 'Dinheiro' : undefined,
                      })
                    }}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-[#2F68FE] hover:bg-[#EBF2FF] px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
                  >
                    <span>Ver todos</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Lista de Transações Recentes */}
                {recentTransactions.length === 0 ? (
                  <div className="text-center py-10 text-slate-400 text-xs font-medium">
                    Nenhum lançamento registrado no período.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {recentTransactions.slice(0, 6).map((tx: any) => {
                      const isIncome = tx.type === 'income'
                      const title = tx.canonical_vendors?.canonical_name || tx.vendor || (isIncome ? 'Receita' : 'Despesa')
                      const catName = tx.categories?.name || tx.category || 'Geral'
                      const paymentMethod = tx.accounts?.name || tx.payment_method || 'PIX'
                      const visual = getCategoryVisual(title + ' ' + catName)
                      const IconComp = visual.icon

                      // Parcela: mostra o selo e a data da compra, como no app do banco.
                      const isParcel = Number(tx.installment_total) > 1
                      const purchaseDate: string | null = tx.original_extracted_data?.date || null
                      // Formatar data relativa clara
                      let dateLabel = ''
                      if (isParcel && purchaseDate) {
                        dateLabel = `compra ${shortDate(purchaseDate)}`
                      } else if (tx.date) {
                        const txDate = new Date(tx.date + 'T00:00:00')
                        const today = new Date()
                        const yesterday = new Date(today)
                        yesterday.setDate(yesterday.getDate() - 1)

                        if (txDate.toDateString() === today.toDateString()) {
                          dateLabel = 'Hoje'
                        } else if (txDate.toDateString() === yesterday.toDateString()) {
                          dateLabel = 'Ontem'
                        } else {
                          dateLabel = txDate.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })
                        }
                      }

                      return (
                        <div
                          key={tx.id}
                          onClick={() => setSelectedHomeTx(tx)}
                          className="flex items-center justify-between py-3 px-2.5 -mx-2.5 hover:bg-slate-50/90 rounded-2xl transition-all cursor-pointer group active:scale-[0.99]"
                        >
                          {/* Lado Esquerdo: Ícone + Título + Categoria/Conta */}
                          <div className="flex items-center gap-3.5 min-w-0 pr-3">
                            <div
                              className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 shadow-2xs group-hover:scale-105 transition-transform"
                              style={{ backgroundColor: visual.bg, color: visual.color }}
                            >
                              <IconComp className="w-4 h-4 stroke-[2]" />
                            </div>

                            <div className="min-w-0">
                              <h3 className="font-semibold text-sm text-slate-900 group-hover:text-[#2F68FE] transition-colors truncate">
                                {title}
                                {isParcel && (
                                  <span className="ml-1.5 align-middle text-[10px] font-semibold text-[#2F68FE] bg-[#EBF2FF] rounded-full px-1.5 py-0.5">
                                    {tx.installment_current}/{tx.installment_total}
                                  </span>
                                )}
                              </h3>
                              <p className="text-xs text-slate-500 font-medium truncate mt-0.5 flex items-center gap-1.5">
                                <span>{catName}</span>
                                <span className="text-slate-300">•</span>
                                <span className="text-slate-400">{paymentMethod}</span>
                              </p>
                            </div>
                          </div>

                          {/* Lado Direito: Valor + Data */}
                          <div className="text-right shrink-0">
                            <span
                              className={`text-sm sm:text-base font-bold tabular-nums tracking-tight block ${
                                isIncome ? 'text-emerald-600' : 'text-slate-900'
                              }`}
                            >
                              {isIncome ? '+ ' : '- '}
                              {formatBRL(Number(tx.total))}
                            </span>
                            {dateLabel && (
                              <span className="text-xs text-slate-400 block font-medium mt-0.5">
                                {dateLabel}
                              </span>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* COLUNA 2 (5 Colunas no Desktop): ONDE VOCÊ GASTOU */}
            <div className="lg:col-span-5 bg-white border border-slate-200/80 rounded-3xl p-5 sm:p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.02)] flex flex-col justify-between">
              <div>
                {/* Cabeçalho do Card */}
                <div className="flex items-center justify-between gap-2 mb-4 pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                      <PieChart className="w-4 h-4 stroke-[2.2]" />
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-slate-900 tracking-tight">
                        Onde você gastou
                      </h2>
                      <p className="text-[11px] font-normal text-slate-500">
                        Distribuição por categoria
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      if (periodTx) {
                        setMonthModalCategory(null)
                        setMonthModal('categories')
                      } else onNavigateToCategories?.()
                    }}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-[#2F68FE] hover:bg-[#EBF2FF] px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
                  >
                    <span>Categorias</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Lista de Categorias */}
                {(!dashboardData.topCategories || dashboardData.topCategories.length === 0) ? (
                  <div className="text-center py-10 text-slate-400 text-xs font-medium">
                    Nenhuma despesa registrada no período.
                  </div>
                ) : (
                  <div className="space-y-3.5">
                    {dashboardData.topCategories.slice(0, 5).map((cat, i) => {
                      const totalSpent = dashboardData.metrics.totalExpenses || 1
                      const pct = cat.percentage ?? Number(((cat.total / totalSpent) * 100).toFixed(1))
                      const catBudget = budgets?.values?.[cat.category]
                      const used = catBudget ? (cat.total / catBudget) * 100 : null
                      const visual = getCategoryVisual(cat.category)
                      const IconComp = visual.icon
                      const barColors = ['#2F68FE', '#0EA5E9', '#F59E0B', '#EC4899', '#8B5CF6']
                      const activeColor = barColors[i % barColors.length]

                      return (
                        <div
                          key={i}
                          onClick={() => handleOpenCategoryDetail(cat)}
                          className="py-2.5 px-3 -mx-3 hover:bg-slate-50/90 rounded-2xl transition-all cursor-pointer group active:scale-[0.99]"
                        >
                          <div className="flex items-center justify-between gap-3 mb-2">
                            <div className="flex items-center gap-2.5 min-w-0 flex-1">
                              <div
                                className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 shadow-2xs"
                                style={{ backgroundColor: visual.bg, color: visual.color }}
                              >
                                <IconComp className="w-3.5 h-3.5 stroke-[2]" />
                              </div>
                              <span className="text-sm font-semibold text-slate-900 group-hover:text-[#2F68FE] transition-colors truncate">
                                {cat.category}
                              </span>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-sm font-bold text-slate-900 tabular-nums">
                                {formatBRL(cat.total)}
                              </span>
                              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full tabular-nums ${
                                used === null ? 'bg-slate-100 text-slate-600' : used >= 100 ? 'bg-rose-50 text-rose-700' : used >= 80 ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-700'}`}
                                title={catBudget ? `Orçamento ${formatBRL(catBudget)}` : undefined}>
                                {used === null ? `${pct}%` : `${Math.round(used)}% do orç.`}
                              </span>
                            </div>
                          </div>

                          {/* Barra horizontal suave e moderna */}
                          <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-300"
                              style={{
                                width: `${Math.min(100, Math.max(3, used ?? pct))}%`,
                                backgroundColor: used === null ? activeColor : used >= 100 ? '#E24B4A' : used >= 80 ? '#EF9F27' : '#639922',
                              }}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {dashboardData && subscriptions.items.length > 0 && quickFilter !== 'cash' && (
        <div className="bg-white border border-slate-200/80 rounded-3xl p-5 sm:p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center shrink-0">
                <Repeat className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900 tracking-tight">Assinaturas e contas fixas</h2>
                <p className="text-[11px] text-slate-500">
                  {formatBRL(subscriptions.monthlyTotal)} por mês · {formatBRL(subscriptions.monthlyTotal * 12)} por ano
                </p>
              </div>
            </div>
            {subscriptions.items.length > 6 && (
              <button type="button" onClick={() => setShowAllSubs((v) => !v)} className="text-xs font-semibold text-[#2F68FE] hover:bg-[#EBF2FF] px-2.5 py-1 rounded-lg">
                {showAllSubs ? 'Mostrar menos' : `Ver todas (${subscriptions.items.length})`}
              </button>
            )}
          </div>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 divide-y sm:divide-y-0 divide-slate-100">
            {(showAllSubs ? subscriptions.items : subscriptions.items.slice(0, 6)).map((sub: any) => (
              <li key={sub.vendor} className="flex items-center justify-between gap-2 py-2 text-sm">
                <span className="min-w-0 truncate text-slate-900">
                  {sub.vendor}
                  {sub.increased && (
                    <span className="ml-1.5 text-[10px] font-semibold rounded-full px-1.5 py-0.5 bg-amber-50 text-amber-800"
                      title={sub.previousAmount ? `Antes: ${formatBRL(sub.previousAmount)}` : undefined}>subiu</span>
                  )}
                  <span className="block text-[11px] text-slate-400">{sub.category || 'Sem categoria'} · {sub.months} meses · {sub.paymentMethod || ''}</span>
                </span>
                <span className="font-semibold tabular-nums text-slate-900 whitespace-nowrap">{formatBRL(sub.amount)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <CategoryReviewModal open={reviewOpen} onClose={() => setReviewOpen(false)} onChanged={() => fetchDashboard()} />

      {/* Pop-up do mês: categorias (com as despesas de cada uma) e todos os lançamentos */}
      {dashboardData && (
        <MonthBreakdownModal
          mode={monthModal}
          onClose={() => setMonthModal(null)}
          periodLabel={dashboardData.period?.label || ''}
          rangeLabel={cardInvoice ? `${shortDate(cardInvoice.cycleStart)} a ${shortDate(cardInvoice.cycleEnd)}` : null}
          transactions={periodTx || []}
          categories={dashboardData.topCategories || []}
          totalExpenses={dashboardData.metrics?.totalExpenses ?? 0}
          initialCategory={monthModalCategory}
          getVisual={getCategoryVisual}
          budgets={budgets}
          onSaveBudgets={saveBudgets}
          onReviewCategories={() => {
            setMonthModal(null)
            setReviewOpen(true)
          }}
          onSelectTx={(tx) => {
            setMonthModal(null)
            setSelectedHomeTx(tx)
          }}
        />
      )}

      {/* Painel Lateral de Detalhes da Categoria */}
      <CategoryDetailPanel
        category={selectedCategoryDetail}
        loadingCategoryTx={loadingCategoryTx}
        categoryTxError={categoryTxError}
        categoryTxList={categoryTxList}
        onClose={() => setSelectedCategoryDetail(null)}
        onEditTx={(tx) => setEditingTx(tx)}
      />

      {/* Drawer Lateral de Lançamentos de Receitas ou Despesas */}
      <CashFlowDrawer
        drawerType={drawerType}
        loadingDrawerTx={loadingDrawerTx}
        drawerError={drawerError}
        drawerTxList={drawerTxList}
        dashboardData={dashboardData}
        deletingTxId={deletingTxId}
        onClose={() => setDrawerType(null)}
        onOpenNewLaunch={onOpenNewLaunch}
        onEditTx={(tx) => setEditingTx(tx)}
        onDeleteTx={handleDeleteTransactionInDrawer}
      />

      {/* Modal de Detalhes do Lançamento da Home */}
      <TransactionDetailModal
        selectedDrawerTx={selectedHomeTx}
        deletingTxId={deletingTxId}
        deletingGroupId={null}
        onClose={() => setSelectedHomeTx(null)}
        onStartEditing={(_e, tx) => {
          setSelectedHomeTx(null)
          setEditingTx(tx)
        }}
        onDeleteTx={async (_e, id) => {
          if (!confirm('Deseja realmente excluir este lançamento?')) return
          setDeletingTxId(id)
          try {
            if (onDeleteTransaction) {
              await onDeleteTransaction(id)
            } else {
              await fetchWithAuth(`/api/transactions/${id}`, { method: 'DELETE' })
            }
            setSelectedHomeTx(null)
            fetchDashboard()
          } catch {
            alert('Erro ao excluir lançamento')
          } finally {
            setDeletingTxId(null)
          }
        }}
        onDeleteGroup={async () => {}}
      />

      {/* Modal de Edição Completa */}
      {editingTx && (
        <EditTransactionModal
          transaction={editingTx}
          accounts={accounts}
          onClose={() => setEditingTx(null)}
          onSaveSuccess={(updatedTx) => {
            if (onTransactionUpdated) {
              onTransactionUpdated(updatedTx)
            }
            if (selectedHomeTx?.id === updatedTx.id) {
              setSelectedHomeTx(updatedTx)
            }
            if (selectedCategoryDetail) {
              setCategoryTxList((prev) =>
                prev.map((t) => (t.id === updatedTx.id ? updatedTx : t))
              )
            }
            fetchDashboard()
            setEditingTx(null)
          }}
        />
      )}
    </section>
  )
}


function shortDate(iso?: string | null): string {
  return iso ? iso.split('-').reverse().slice(0, 2).join('/') : ''
}

function InvoiceRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-slate-500">{label}</span>
      <span className={`font-semibold tabular-nums ${value < 0 ? 'text-emerald-600' : 'text-slate-900'}`}>
        {value < 0 ? `− ${formatBRL(-value)}` : formatBRL(value)}
      </span>
    </div>
  )
}


/**
 * Barras dos últimos meses com a linha do orçamento mensal (soma dos orçamentos das categorias).
 * Passar o mouse (ou focar com o teclado / tocar) mostra a bolha com o valor; clicar abre o mês.
 */
function MonthBars({
  history,
  budget,
  current,
  onSelect,
}: {
  history: Array<{ month: string; label: string; total: number }>
  budget: number
  current?: string
  onSelect?: (index: number) => void
}) {
  const [active, setActive] = useState<number | null>(null)
  const max = Math.max(1, budget, ...history.map((h) => h.total))
  const monthName = (key: string) => {
    const t = new Date(`${key}-01T00:00:00`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
    return t.charAt(0).toUpperCase() + t.slice(1)
  }
  return (
    <div className="mt-4" aria-label="Gastos dos últimos meses">
      <div className="relative flex items-end gap-2 h-24" onMouseLeave={() => setActive(null)}>
        {budget > 0 && (
          <div className="absolute left-0 right-0 border-t border-dashed border-slate-300 pointer-events-none" style={{ bottom: `${(budget / max) * 100}%` }}>
            <span className="absolute right-0 -top-4 text-[10px] text-slate-400">orçamento {formatBRL(budget)}</span>
          </div>
        )}
        {history.map((h, i) => {
          const over = budget > 0 && h.total > budget
          const isCurrent = h.month === current
          const prev = i > 0 ? history[i - 1].total : null
          const diff = prev && prev > 0 ? ((h.total - prev) / prev) * 100 : null
          const isActive = active === i
          return (
            <button
              key={h.month}
              type="button"
              onMouseEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
              onClick={(e) => {
                e.stopPropagation()
                if (!isCurrent) onSelect?.(i)
              }}
              aria-label={`${monthName(h.month)}: ${formatBRL(h.total)}${isCurrent ? '' : '. Clique para abrir o mês'}`}
              className={`relative flex-1 flex flex-col items-center justify-end h-full focus:outline-none ${isCurrent ? 'cursor-default' : 'cursor-pointer'}`}
            >
              {isActive && (
                <span
                  role="tooltip"
                  className={`absolute bottom-full mb-2 z-10 whitespace-nowrap rounded-xl bg-slate-900 text-white px-2.5 py-1.5 text-[11px] shadow-lg pointer-events-none ${
                    i === 0 ? 'left-0' : i === history.length - 1 ? 'right-0' : 'left-1/2 -translate-x-1/2'
                  }`}
                >
                  <span className="block font-semibold">{monthName(h.month)}</span>
                  <span className="block tabular-nums text-sm font-bold">{formatBRL(h.total)}</span>
                  {diff !== null && (
                    <span className={`block ${diff > 0 ? 'text-rose-300' : 'text-emerald-300'}`}>
                      {diff > 0 ? '+' : ''}{Math.round(diff)}% vs mês anterior
                    </span>
                  )}
                  {budget > 0 && (
                    <span className={`block ${over ? 'text-rose-300' : 'text-slate-300'}`}>
                      {over ? `${formatBRL(h.total - budget)} acima do orçamento` : `${Math.round((h.total / budget) * 100)}% do orçamento`}
                    </span>
                  )}
                  {!isCurrent && <span className="block text-slate-400 mt-0.5">Clique para abrir</span>}
                </span>
              )}
              <span
                className={`block w-full rounded-t-md transition-opacity ${active !== null && !isActive ? 'opacity-50' : ''}`}
                style={{
                  height: `${Math.max(2, (h.total / max) * 100)}%`,
                  backgroundColor: over ? '#F09595' : isCurrent ? '#2F68FE' : isActive ? '#85B7EB' : '#B5D4F4',
                }}
              />
            </button>
          )
        })}
      </div>
      <div className="flex gap-2 mt-1">
        {history.map((h) => (
          <span key={h.month} className={`flex-1 text-center text-[10px] ${h.month === current ? 'font-semibold text-slate-700' : 'text-slate-400'}`}>{h.label}</span>
        ))}
      </div>
    </div>
  )
}
