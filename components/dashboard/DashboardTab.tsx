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
  Sparkles,
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
  periodType,
  handlePeriodTypeChange,
  monthOffset,
  handleMonthNavigate,
  dashboardAccountId,
  setDashboardAccountId,
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
    <section className="space-y-6 max-w-2xl mx-auto pb-12">
      {/* 1. SELETOR DE PERÍODO (Estilo minimalista "Outubro 2026 ▾") */}
      <div className="flex items-center justify-between">
        <MonthPicker
          monthOffset={monthOffset}
          onSelectMonthOffset={(offset) => {
            handleMonthNavigate(offset - monthOffset)
          }}
        />
      </div>

      {dashboardError && (
        <div className="border border-red-200 bg-red-50 text-red-700 rounded-2xl px-4 py-2.5 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
          <span>{dashboardError}</span>
        </div>
      )}

      {loadingDashboard && !dashboardData ? (
        <div className="text-center py-16 text-[#98A2B3] text-xs font-normal animate-pulse">
          Carregando finanças…
        </div>
      ) : !dashboardData ? (
        <div className="text-center py-16 text-[#98A2B3] text-xs font-normal">
          Nenhum dado encontrado para o período.
        </div>
      ) : (
        <>
          {/* 2. BLOCO PRINCIPAL DO PERÍODO (Saldo, Entradas e Gastos unificados) */}
          <div className="space-y-3">
            <div>
              <span className="text-xs font-normal text-[#667085] block">
                Saldo do período
              </span>
              <div className="text-4xl sm:text-5xl font-light tracking-tight text-[#0F172A] tabular-nums mt-1 -ml-0.5">
                {formatBRL(dashboardData.metrics?.balance ?? 0)}
              </div>
            </div>

            {/* Entradas e Gastos Lado a Lado integrados */}
            <div className="flex items-center gap-8 pt-2">
              <div
                onClick={() => handleOpenDrawer('income')}
                className="cursor-pointer group"
                title="Ver entradas do período"
              >
                <span className="text-[11px] font-normal text-[#667085] block">
                  Entradas
                </span>
                <span className="text-sm sm:text-base font-normal text-[#10B981] tabular-nums tracking-tight block mt-0.5">
                  {formatBRL(dashboardData.metrics?.totalIncome ?? 0)}
                </span>
              </div>

              <div className="h-6 w-px bg-slate-200" />

              <div
                onClick={() => handleOpenDrawer('expense')}
                className="cursor-pointer group"
                title="Ver gastos do período"
              >
                <span className="text-[11px] font-normal text-[#667085] block">
                  Gastos
                </span>
                <span className="text-sm sm:text-base font-normal text-[#F04438] tabular-nums tracking-tight block mt-0.5">
                  {formatBRL(dashboardData.metrics?.totalExpenses ?? dashboardData.metrics?.totalSpent ?? 0)}
                </span>
              </div>
            </div>
          </div>

          {/* 3. FILTRO RÁPIDO DO PERÍODO (Pills: Tudo, Cartão, PIX, Dinheiro) */}
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
            <button
              type="button"
              onClick={() => handleSelectQuickFilter('all')}
              className={`px-4 py-2 rounded-2xl text-xs font-medium transition-all shrink-0 cursor-pointer ${
                quickFilter === 'all'
                  ? 'bg-[#EBF2FF] text-[#2F68FE] font-semibold'
                  : 'bg-[#F2F4F7] text-[#667085] hover:text-[#0F172A]'
              }`}
            >
              Tudo
            </button>
            <button
              type="button"
              onClick={() => handleSelectQuickFilter('card')}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-2xl text-xs font-medium transition-all shrink-0 cursor-pointer ${
                quickFilter === 'card'
                  ? 'bg-[#EBF2FF] text-[#2F68FE] font-semibold'
                  : 'bg-[#F2F4F7] text-[#667085] hover:text-[#0F172A]'
              }`}
            >
              <CreditCard className="w-3.5 h-3.5 stroke-[1.8]" />
              <span>Cartão</span>
            </button>
            <button
              type="button"
              onClick={() => handleSelectQuickFilter('pix')}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-2xl text-xs font-medium transition-all shrink-0 cursor-pointer ${
                quickFilter === 'pix'
                  ? 'bg-[#EBF2FF] text-[#2F68FE] font-semibold'
                  : 'bg-[#F2F4F7] text-[#667085] hover:text-[#0F172A]'
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
              className={`flex items-center gap-1.5 px-4 py-2 rounded-2xl text-xs font-medium transition-all shrink-0 cursor-pointer ${
                quickFilter === 'cash'
                  ? 'bg-[#EBF2FF] text-[#2F68FE] font-semibold'
                  : 'bg-[#F2F4F7] text-[#667085] hover:text-[#0F172A]'
              }`}
            >
              <Banknote className="w-3.5 h-3.5 stroke-[1.8]" />
              <span>Dinheiro</span>
            </button>
          </div>

          {/* 4. ÚLTIMOS LANÇAMENTOS (Lista Leve e Limpa) */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-medium text-[#0F172A] tracking-tight">
                Últimos lançamentos
              </h2>
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
                className="inline-flex items-center gap-0.5 text-xs text-[#667085] hover:text-[#0F172A] transition-colors"
              >
                <span>Ver todos</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {recentTransactions.length === 0 ? (
              <div className="text-center py-6 text-[#98A2B3] text-xs">
                Nenhum lançamento recente encontrado.
              </div>
            ) : (
              <div className="space-y-1">
                {recentTransactions.slice(0, 5).map((tx: any) => {
                  const isIncome = tx.type === 'income'
                  const title = tx.canonical_vendors?.canonical_name || tx.vendor || (isIncome ? 'Receita' : 'Despesa')
                  const catName = tx.categories?.name || tx.category || 'Geral'
                  const paymentMethod = tx.accounts?.name || tx.payment_method || 'PIX'
                  const visual = getCategoryVisual(title + ' ' + catName)
                  const IconComp = visual.icon

                  // Formatar data discreta
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
                      className="flex items-center justify-between py-2.5 px-1 hover:bg-slate-100/60 rounded-2xl transition-colors cursor-pointer group active:scale-[0.99]"
                    >
                      {/* Lado Esquerdo: Ícone colorido em círculo pastel + Título + Categoria/Forma */}
                      <div className="flex items-center gap-3 min-w-0 pr-2">
                        <div
                          className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                          style={{ backgroundColor: visual.bg, color: visual.color }}
                        >
                          <IconComp className="w-4 h-4 stroke-[2]" />
                        </div>

                        <div className="min-w-0">
                          <h3 className="font-normal text-sm text-[#0F172A] group-hover:text-[#2F68FE] transition-colors truncate">
                            {title}
                          </h3>
                          <p className="text-[11px] text-[#667085] truncate font-normal mt-0.5">
                            {catName} • {paymentMethod}
                          </p>
                        </div>
                      </div>

                      {/* Lado Direito: Valor + Data discreta */}
                      <div className="text-right shrink-0">
                        <span
                          className={`text-sm font-normal tabular-nums block ${
                            isIncome ? 'text-[#10B981]' : 'text-[#0F172A]'
                          }`}
                        >
                          {isIncome ? '+ ' : '- '}
                          {formatBRL(Number(tx.total))}
                        </span>
                        {dateLabel && (
                          <span className="text-[10px] text-[#98A2B3] block font-light">
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

          {/* 5. ONDE VOCÊ GASTOU (Lista Compacta com Barras Finas e Cores Suaves) */}
          <div className="space-y-3 pt-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-medium text-[#0F172A] tracking-tight">
                Onde você gastou
              </h2>
              <button
                type="button"
                onClick={onNavigateToCategories}
                className="inline-flex items-center gap-0.5 text-xs text-[#667085] hover:text-[#0F172A] transition-colors cursor-pointer"
              >
                <span>Ver todos</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {(!dashboardData.topCategories || dashboardData.topCategories.length === 0) ? (
              <div className="text-center py-6 text-[#98A2B3] text-xs">
                Nenhuma categoria registrada no período.
              </div>
            ) : (
              <div className="space-y-3">
                {dashboardData.topCategories.slice(0, 5).map((cat, i) => {
                  const totalSpent = dashboardData.metrics.totalExpenses || 1
                  const pct = cat.percentage ?? Number(((cat.total / totalSpent) * 100).toFixed(1))
                  const visual = getCategoryVisual(cat.category)
                  const IconComp = visual.icon
                  const barColors = ['#3B82F6', '#0EA5E9', '#F59E0B', '#EC4899', '#8B5CF6']
                  const activeColor = barColors[i % barColors.length]

                  return (
                    <div
                      key={i}
                      onClick={() => handleOpenCategoryDetail(cat)}
                      className="py-1 cursor-pointer group"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div
                            className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                            style={{ backgroundColor: visual.bg, color: visual.color }}
                          >
                            <IconComp className="w-4 h-4 stroke-[2]" />
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2 mb-1.5">
                              <span className="text-sm font-normal text-[#0F172A] truncate">
                                {cat.category}
                              </span>
                              <div className="text-right shrink-0">
                                <span className="text-sm font-normal text-[#0F172A] tabular-nums block">
                                  {formatBRL(cat.total)}
                                </span>
                              </div>
                            </div>

                            {/* Barra fina horizontal proporcional */}
                            <div className="w-full h-1 bg-[#F2F4F7] rounded-full overflow-hidden flex items-center">
                              <div
                                className="h-full rounded-full transition-all duration-300"
                                style={{
                                  width: `${Math.min(100, Math.max(3, pct))}%`,
                                  backgroundColor: activeColor,
                                }}
                              />
                            </div>
                          </div>
                        </div>

                        <div className="text-[11px] text-[#98A2B3] font-light min-w-[36px] text-right">
                          {pct}%
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
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
