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
  Repeat,
  Wallet,
} from 'lucide-react'
import { Sheet, SheetCloseButton } from '@/components/ui/Sheet'
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
  const [openCard, setOpenCard] = useState<'spend' | 'invoice' | 'subs' | null>(null)
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
          {/* 2. CARDS EM GRADE (estilo apps da Apple): cada card mostra o essencial; tocar abre os detalhes. */}
          {(() => {
            const expenses = dashboardData.metrics?.totalExpenses ?? dashboardData.metrics?.totalSpent ?? 0
            const income = dashboardData.metrics?.totalIncome ?? 0
            const diff = dashboardData.metrics?.comparison?.differencePercentage
            const prevLabel = dashboardData.period?.previousLabel?.split(' de ')[0]?.toLowerCase() || 'mês anterior'
            const showSubs = subscriptions.items.length > 0 && quickFilter !== 'cash'
            const cardShort = cardInvoice ? cardInvoice.accountName.replace(/^cart[aã]o\s+/i, '') : ''
            const invoiceStatus = cardInvoice
              ? !cardInvoice.closed
                ? { text: 'Aberta', cls: 'bg-amber-50 text-amber-800' }
                : cardInvoice.toPay <= 0.009
                  ? { text: 'Paga', cls: 'bg-emerald-50 text-emerald-700' }
                  : { text: 'Fechada', cls: 'bg-rose-50 text-rose-700' }
              : null
            const subsUp = subscriptions.items.filter((s: any) => s.increased).length
            const cats = dashboardData.topCategories || []
            const totalSpent = dashboardData.metrics.totalExpenses || 1
            const barColors = ['#2F68FE', '#0EA5E9', '#F59E0B', '#EC4899', '#8B5CF6']
            const diffBadge = diff !== null && diff !== undefined && Number.isFinite(diff) && (
              <span className={`text-xs font-medium inline-flex items-center gap-1 ${diff > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                {diff > 0 ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownLeft className="w-3.5 h-3.5" />}
                {Math.abs(Math.round(diff))}% vs {prevLabel}
              </span>
            )
            const bars = history.length > 1 && (
              <MonthBars
                history={history}
                budget={totalBudget}
                current={selectedMonthKey}
                onSelect={(index) => {
                  const from = history.findIndex((h) => h.month === selectedMonthKey)
                  if (from >= 0 && index !== from) handleMonthNavigate(index - from)
                }}
              />
            )
            const openCategories = () => {
              if (periodTx) {
                setMonthModalCategory(null)
                setMonthModal('categories')
              } else onNavigateToCategories?.()
            }
            const openTransactions = () => {
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
            }

            return (
              <>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                  {/* Gastos do mês (largo) */}
                  <Tile className="col-span-2" icon={<Wallet className="w-3.5 h-3.5" />} iconCls="bg-[#EBF2FF] text-[#2F68FE]" label="Gastos do mês" onOpen={() => setOpenCard('spend')}>
                    <span className="block text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 tabular-nums mt-1">{formatBRL(expenses)}</span>
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1">
                      {diffBadge}
                      {income > 0 && <span className="text-xs text-slate-500">entradas <span className="font-semibold text-emerald-600 tabular-nums">{formatBRL(income)}</span></span>}
                    </span>
                    {bars}
                  </Tile>

                  {/* Fatura do cartão (quadrado) */}
                  {cardInvoice && invoiceStatus && (
                    <Tile className={showSubs ? 'col-span-1' : 'col-span-2'} icon={<CreditCard className="w-3.5 h-3.5" />} iconCls="bg-orange-50 text-orange-600" label={`Fatura ${cardShort}`} onOpen={() => setOpenCard('invoice')}>
                      <span className={`self-start inline-block text-[10px] font-semibold rounded-md px-1.5 py-0.5 mt-1 ${invoiceStatus.cls}`}>{invoiceStatus.text}</span>
                      <span className="block text-[11px] text-slate-500 mt-2">A pagar</span>
                      <span className="block text-xl sm:text-2xl font-bold tracking-tight text-slate-900 tabular-nums leading-tight">{formatBRL(cardInvoice.toPay)}</span>
                      <span className="block text-[11px] text-slate-400 mt-auto pt-2">vence {shortDate(cardInvoice.dueDate)}</span>
                    </Tile>
                  )}

                  {/* Assinaturas (quadrado) */}
                  {showSubs && (
                    <Tile className={cardInvoice ? 'col-span-1' : 'col-span-2'} icon={<Repeat className="w-3.5 h-3.5" />} iconCls="bg-violet-50 text-violet-600" label="Assinaturas" onOpen={() => setOpenCard('subs')}>
                      <span className="block text-[11px] text-slate-500 mt-[1.6rem]">Por mês</span>
                      <span className="block text-xl sm:text-2xl font-bold tracking-tight text-slate-900 tabular-nums leading-tight">{formatBRL(subscriptions.monthlyTotal)}</span>
                      <span className="block text-[11px] mt-auto pt-2">
                        <span className="text-slate-400">{subscriptions.items.length} ativas</span>
                        {subsUp > 0 && <span className="text-amber-700"> · {subsUp} subiu</span>}
                      </span>
                    </Tile>
                  )}

                  {/* Onde você gastou (largo) */}
                  <Tile className="col-span-2" icon={<PieChart className="w-3.5 h-3.5" />} iconCls="bg-purple-50 text-purple-600" label="Onde você gastou" onOpen={openCategories}>
                    {cats.length === 0 ? (
                      <p className="text-xs text-slate-400 py-6 text-center">Nenhuma despesa no período.</p>
                    ) : (
                      <div className="space-y-2.5 mt-3">
                        {cats.slice(0, 4).map((cat, i) => {
                          const pct = cat.percentage ?? Number(((cat.total / totalSpent) * 100).toFixed(1))
                          const catBudget = budgets?.values?.[cat.category]
                          const used = catBudget ? (cat.total / catBudget) * 100 : null
                          return (
                            <div key={cat.category}>
                              <div className="flex items-center justify-between gap-3 text-sm">
                                <span className="truncate text-slate-800">{cat.category}</span>
                                <span className="shrink-0 tabular-nums font-semibold text-slate-900">
                                  {formatBRL(cat.total)}
                                  <span className={`ml-1.5 text-[10px] font-medium ${used === null ? 'text-slate-400' : used >= 100 ? 'text-rose-600' : used >= 80 ? 'text-amber-700' : 'text-emerald-600'}`}>
                                    {used === null ? `${Math.round(pct)}%` : `${Math.round(used)}% orç.`}
                                  </span>
                                </span>
                              </div>
                              <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden mt-1">
                                <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.max(3, used ?? pct))}%`, backgroundColor: used === null ? barColors[i % barColors.length] : used >= 100 ? '#E24B4A' : used >= 80 ? '#EF9F27' : '#639922' }} />
                              </div>
                            </div>
                          )
                        })}
                        {cats.length > 4 && <p className="text-[11px] text-slate-400">+ {cats.length - 4} categorias</p>}
                      </div>
                    )}
                  </Tile>

                  {/* Últimos lançamentos (largo) */}
                  <Tile className="col-span-2" icon={<ReceiptText className="w-3.5 h-3.5" />} iconCls="bg-slate-100 text-slate-600" label="Últimos lançamentos" onOpen={openTransactions}>
                    {recentTransactions.length === 0 ? (
                      <p className="text-xs text-slate-400 py-6 text-center">Nenhum lançamento no período.</p>
                    ) : (
                      <div className="divide-y divide-slate-100 mt-1">
                        {recentTransactions.slice(0, 4).map((tx: any) => {
                          const isIncome = tx.type === 'income'
                          const title = tx.canonical_vendors?.canonical_name || tx.vendor || (isIncome ? 'Receita' : 'Despesa')
                          const catName = tx.categories?.name || tx.category || 'Geral'
                          const visual = getCategoryVisual(title + ' ' + catName)
                          const IconComp = visual.icon
                          const isParcel = Number(tx.installment_total) > 1
                          const purchaseDate: string | null = tx.original_extracted_data?.date || null
                          return (
                            <button
                              key={tx.id}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                setSelectedHomeTx(tx)
                              }}
                              className="w-full flex items-center gap-3 py-2 text-left rounded-xl hover:bg-slate-50 -mx-1 px-1"
                            >
                              <span className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: visual.bg, color: visual.color }}>
                                <IconComp className="w-3.5 h-3.5" />
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block text-sm font-medium text-slate-900 truncate">
                                  {title}
                                  {isParcel && <span className="ml-1 text-[10px] font-semibold text-[#2F68FE]">{tx.installment_current}/{tx.installment_total}</span>}
                                </span>
                                <span className="block text-[11px] text-slate-400 truncate">
                                  {catName} · {isParcel && purchaseDate ? `compra ${shortDate(purchaseDate)}` : shortDate(tx.date)}
                                </span>
                              </span>
                              <span className={`text-sm font-semibold tabular-nums whitespace-nowrap ${isIncome ? 'text-emerald-600' : 'text-slate-900'}`}>
                                {isIncome ? '+ ' : '− '}
                                {formatBRL(Number(tx.total))}
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </Tile>
                </div>

                {/* Detalhes de "Gastos do mês" */}
                <Sheet open={openCard === 'spend'} onClose={() => setOpenCard(null)} label="Gastos do mês">
                  <SheetHeader icon={<Wallet className="w-4 h-4" />} iconCls="bg-[#EBF2FF] text-[#2F68FE]" title="Gastos do mês" subtitle={dashboardData.period?.label} />
                  <div className="overflow-y-auto px-5 sm:px-6 pb-6">
                    <span className="block text-4xl font-bold tracking-tight text-slate-900 tabular-nums">{formatBRL(expenses)}</span>
                    <span className="block mt-1">{diffBadge}</span>
                    {bars}
                    <div className="border-t border-slate-100 mt-5 pt-3 space-y-2 text-sm">
                      <div className="flex justify-between"><span className="text-slate-500">Gastos</span><span className="font-semibold tabular-nums">{formatBRL(expenses)}</span></div>
                      <div className="flex justify-between"><span className="text-slate-500">Entradas</span><span className="font-semibold text-emerald-600 tabular-nums">{formatBRL(income)}</span></div>
                      {income > 0 && <div className="flex justify-between"><span className="text-slate-500">Saldo</span><span className="font-semibold tabular-nums">{formatBRL(income - expenses)}</span></div>}
                      {totalBudget > 0 && <div className="flex justify-between"><span className="text-slate-500">Orçamento do mês</span><span className="font-semibold tabular-nums">{formatBRL(totalBudget)}</span></div>}
                    </div>
                    <div className="grid grid-cols-2 gap-2 mt-5">
                      <button type="button" onClick={() => { setOpenCard(null); handleOpenDrawer('expense') }} className="rounded-2xl bg-slate-100 hover:bg-slate-200 text-sm font-semibold text-slate-800 py-3">Ver gastos</button>
                      <button type="button" onClick={() => { setOpenCard(null); handleOpenDrawer('income') }} className="rounded-2xl bg-slate-100 hover:bg-slate-200 text-sm font-semibold text-slate-800 py-3">Ver entradas</button>
                    </div>
                  </div>
                </Sheet>

                {/* Detalhes da fatura */}
                {cardInvoice && invoiceStatus && (
                  <Sheet open={openCard === 'invoice'} onClose={() => setOpenCard(null)} label={`Fatura ${cardShort}`}>
                    <SheetHeader icon={<CreditCard className="w-4 h-4" />} iconCls="bg-orange-50 text-orange-600" title={`Fatura ${cardShort}`}
                      subtitle={`${shortDate(cardInvoice.cycleStart)} a ${shortDate(cardInvoice.cycleEnd)} · vence ${shortDate(cardInvoice.dueDate)}`} />
                    <div className="overflow-y-auto px-5 sm:px-6 pb-6">
                      <span className={`inline-block text-[11px] font-semibold rounded-md px-2 py-0.5 ${invoiceStatus.cls}`}>{invoiceStatus.text}</span>
                      <span className="block text-xs text-slate-500 mt-3">A pagar</span>
                      <span className="block text-4xl font-bold tracking-tight text-slate-900 tabular-nums">{formatBRL(cardInvoice.toPay)}</span>
                      <div className="border-t border-slate-100 mt-5 pt-3 space-y-2 text-sm">
                        <InvoiceRow label="Despesas" value={cardInvoice.expenses} />
                        {cardInvoice.credits > 0.009 && <InvoiceRow label="Créditos e estornos" value={-cardInvoice.credits} />}
                        {cardInvoice.payments > 0.009 && <InvoiceRow label="Pagamentos" value={-cardInvoice.payments} />}
                        {cardInvoice.carriedCredit > 0.009 && <InvoiceRow label="Já pago (sobra anterior)" value={-cardInvoice.carriedCredit} />}
                      </div>
                      {(cardInvoice.upcoming || []).some((u: any) => u.expenses > 0) && (
                        <div className="mt-5">
                          <p className="text-xs font-semibold text-slate-500 mb-2">Próximas faturas (parcelas já contratadas)</p>
                          <div className="grid grid-cols-3 gap-2">
                            {(cardInvoice.upcoming || []).map((u: any) => (
                              <div key={u.dueDate} className="rounded-2xl bg-slate-50 px-3 py-2.5">
                                <span className="block text-[11px] text-slate-500">{new Date(u.dueDate + 'T00:00:00').toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}</span>
                                <span className="block text-sm font-semibold tabular-nums text-slate-900">{formatBRL(u.expenses)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setOpenCard(null)
                          navigateToTransactionsFiltered({
                            accountId: cardInvoice.accountId,
                            paymentMethod: '',
                            competence: { key: selectedMonthKey || '', label: `Fatura ${cardShort} · vence ${shortDate(cardInvoice.dueDate)}` },
                          } as any)
                        }}
                        className="w-full mt-5 rounded-2xl bg-[#2F68FE] hover:bg-[#2557d6] text-sm font-semibold text-white py-3"
                      >
                        Ver lançamentos da fatura
                      </button>
                    </div>
                  </Sheet>
                )}

                {/* Detalhes das assinaturas */}
                {showSubs && (
                  <Sheet open={openCard === 'subs'} onClose={() => setOpenCard(null)} label="Assinaturas e contas fixas">
                    <SheetHeader icon={<Repeat className="w-4 h-4" />} iconCls="bg-violet-50 text-violet-600" title="Assinaturas e contas fixas"
                      subtitle={`${formatBRL(subscriptions.monthlyTotal)} por mês · ${formatBRL(subscriptions.monthlyTotal * 12)} por ano`} />
                    <ul className="overflow-y-auto px-5 sm:px-6 pb-6 divide-y divide-slate-100">
                      {subscriptions.items.map((sub: any) => (
                        <li key={sub.vendor} className="flex items-center justify-between gap-3 py-3 text-sm">
                          <span className="min-w-0">
                            <span className="block truncate text-slate-900 font-medium">
                              {sub.vendor}
                              {sub.increased && (
                                <span className="ml-1.5 text-[10px] font-semibold rounded-full px-1.5 py-0.5 bg-amber-50 text-amber-800">
                                  subiu{sub.previousAmount ? ` (antes ${formatBRL(sub.previousAmount)})` : ''}
                                </span>
                              )}
                            </span>
                            <span className="block text-[11px] text-slate-400">{sub.category || 'Sem categoria'} · {sub.months} meses{sub.paymentMethod ? ` · ${sub.paymentMethod}` : ''}</span>
                          </span>
                          <span className="font-semibold tabular-nums text-slate-900 whitespace-nowrap">{formatBRL(sub.amount)}</span>
                        </li>
                      ))}
                    </ul>
                  </Sheet>
                )}
              </>
            )
          })()}
        </>
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

/** Card da grade: mostra o essencial; tocar (ou Enter) abre os detalhes. */
function Tile({
  className = '',
  icon,
  iconCls,
  label,
  onOpen,
  children,
}: {
  className?: string
  icon: React.ReactNode
  iconCls: string
  label: string
  onOpen: () => void
  children: React.ReactNode
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Abrir ${label}`}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          onOpen()
        }
      }}
      className={`group bg-white border border-slate-200/80 rounded-[26px] p-4 sm:p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] flex flex-col min-w-0 cursor-pointer select-none transition-all duration-150 hover:border-slate-300 hover:shadow-[0_4px_16px_rgba(15,23,42,0.06)] active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2F68FE]/40 ${className}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 min-w-0">
          <span className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${iconCls}`}>{icon}</span>
          <span className="text-xs font-semibold text-slate-600 truncate">{label}</span>
        </span>
        <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 shrink-0 transition-colors" />
      </div>
      {children}
    </div>
  )
}

function SheetHeader({ icon, iconCls, title, subtitle }: { icon: React.ReactNode; iconCls: string; title: string; subtitle?: string }) {
  return (
    <div className="flex items-start justify-between gap-3 px-5 sm:px-6 pt-7 sm:pt-6 pb-4">
      <div className="flex items-center gap-3 min-w-0">
        <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${iconCls}`}>{icon}</span>
        <div className="min-w-0">
          <h2 className="text-base font-bold text-slate-900 truncate">{title}</h2>
          {subtitle && <p className="text-xs text-slate-500 truncate">{subtitle}</p>}
        </div>
      </div>
      <SheetCloseButton />
    </div>
  )
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
