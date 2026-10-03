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
} from 'lucide-react'
import type { Account, TransactionRecord } from '@/lib/schema'
import type { DashboardSummary } from '@/lib/queries'
import { formatBRL } from '@/lib/formatters'
import { EditTransactionModal } from '@/components/modals/EditTransactionModal'
import { MonthPicker } from '@/components/ui/MonthPicker'
import { useTelegramWebApp } from '@/lib/useTelegramWebApp'
import { CategoryDetailPanel } from './CategoryDetailPanel'
import { CashFlowDrawer } from './CashFlowDrawer'
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

  // Abrir Detalhe da Categoria
  async function handleOpenCategoryDetail(cat: any) {
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

  return (
    <section className="space-y-6 max-w-6xl mx-auto pb-12 font-sans">
      {/* 1. BARRA SUPERIOR: SELETOR DE PERÍODO & FILTROS RÁPIDOS */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-slate-200/80 rounded-2xl px-4 py-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="flex items-center gap-2">
          <MonthPicker
            monthOffset={monthOffset}
            onSelectMonthOffset={(offset) => {
              handleMonthNavigate(offset - monthOffset)
            }}
          />
        </div>

        {/* Filtros rápidos: Tudo, Cartão, PIX, Dinheiro */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
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
          {/* 2. CARD HERO PRINCIPAL (Saldo, Entradas e Gastos com alto contraste e profundidade) */}
          <div className="bg-white border border-slate-200/80 rounded-3xl p-6 sm:p-7 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.02)] transition-all">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
              {/* Saldo Principal */}
              <div className="space-y-1">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 block">
                  Saldo do período
                </span>
                <div className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-slate-900 tabular-nums">
                  {formatBRL(dashboardData.metrics?.balance ?? 0)}
                </div>
              </div>

              {/* Blocos de Entradas e Gastos com Cards Interativos */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 lg:min-w-[420px]">
                {/* Card Entradas */}
                <div
                  onClick={() => handleOpenDrawer('income')}
                  className="bg-emerald-50/70 hover:bg-emerald-50 border border-emerald-200/70 rounded-2xl p-4 transition-all group cursor-pointer shadow-2xs hover:shadow-xs flex items-center justify-between gap-3"
                  title="Clique para ver extrato de entradas"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                      <ArrowDownLeft className="w-5 h-5 stroke-[2.5]" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-xs font-semibold text-emerald-900/70 block">
                        Entradas
                      </span>
                      <span className="text-base sm:text-lg font-bold text-emerald-700 tabular-nums tracking-tight block">
                        {formatBRL(dashboardData.metrics?.totalIncome ?? 0)}
                      </span>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-emerald-500/60 group-hover:text-emerald-700 group-hover:translate-x-0.5 transition-all shrink-0" />
                </div>

                {/* Card Gastos */}
                <div
                  onClick={() => handleOpenDrawer('expense')}
                  className="bg-rose-50/70 hover:bg-rose-50 border border-rose-200/70 rounded-2xl p-4 transition-all group cursor-pointer shadow-2xs hover:shadow-xs flex items-center justify-between gap-3"
                  title="Clique para ver extrato de gastos"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-600 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                      <ArrowUpRight className="w-5 h-5 stroke-[2.5]" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-xs font-semibold text-rose-900/70 block">
                        Gastos
                      </span>
                      <span className="text-base sm:text-lg font-bold text-rose-700 tabular-nums tracking-tight block">
                        {formatBRL(dashboardData.metrics?.totalExpenses ?? dashboardData.metrics?.totalSpent ?? 0)}
                      </span>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-rose-500/60 group-hover:text-rose-700 group-hover:translate-x-0.5 transition-all shrink-0" />
                </div>
              </div>
            </div>
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

                      // Formatar data relativa clara
                      let dateLabel = ''
                      if (tx.date) {
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
                    onClick={onNavigateToCategories}
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
                              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 tabular-nums">
                                {pct}%
                              </span>
                            </div>
                          </div>

                          {/* Barra horizontal suave e moderna */}
                          <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-300"
                              style={{
                                width: `${Math.min(100, Math.max(3, pct))}%`,
                                backgroundColor: activeColor,
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
