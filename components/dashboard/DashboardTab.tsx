'use client'

import React, { useState } from 'react'
import {
  Wallet,
  ArrowDownLeft,
  ArrowUpRight,
  ChevronRight,
  AlertTriangle,
} from 'lucide-react'
import type { Account, TransactionRecord } from '@/lib/schema'
import type { DashboardSummary } from '@/lib/queries'
import { formatBRL } from '@/lib/formatters'
import { EditTransactionModal } from '@/components/modals/EditTransactionModal'
import { MonthPicker } from '@/components/ui/MonthPicker'
import { useTelegramWebApp } from '@/lib/useTelegramWebApp'
import { CategoryDetailPanel } from './CategoryDetailPanel'
import { SpendingCompositionCard } from './SpendingCompositionCard'
import { TopVendorsCard, UpcomingCommitmentsCard } from './TopVendorsAndUpcoming'
import { CashFlowDrawer } from './CashFlowDrawer'
import { UpcomingDrawer } from './UpcomingDrawer'

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
    overrideAccountId?: string
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

  // Painel de Detalhes da Categoria (In-Page Drawer)
  const [selectedCategoryDetail, setSelectedCategoryDetail] = useState<any | null>(null)
  const [categoryTxList, setCategoryTxList] = useState<TransactionRecord[]>([])
  const [loadingCategoryTx, setLoadingCategoryTx] = useState(false)
  const [categoryTxError, setCategoryTxError] = useState('')

  // Modal de Edição Completa dentro da Visão Geral
  const [editingTx, setEditingTx] = useState<TransactionRecord | null>(null)
  const [deletingTxId, setDeletingTxId] = useState<string | null>(null)
  const [isUpcomingModalOpen, setIsUpcomingModalOpen] = useState(false)
  const [deletingCommitmentId, setDeletingCommitmentId] = useState<string | null>(null)
  const [expandedInvoices, setExpandedInvoices] = useState<Record<string, boolean>>({})

  // Garante carregamento dos dados caso o componente seja montado sem dashboardData
  React.useEffect(() => {
    if (!dashboardData && !loadingDashboard && fetchDashboard) {
      fetchDashboard(periodType, monthOffset ?? 0)
    }
  }, [dashboardData, loadingDashboard, fetchDashboard, periodType, monthOffset])

  // Abrir Detalhe da Categoria e Buscar Transações
  async function handleOpenCategoryDetail(cat: any) {
    setSelectedCategoryDetail(cat)
    setLoadingCategoryTx(true)
    setCategoryTxError('')
    try {
      const params = new URLSearchParams()
      params.append('type', 'expense')
      params.append('category', cat.rawCategory || cat.category)
      params.append('limit', '100')
      if (dashboardAccountId === 'pix') {
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

  // Abrir Drawer e Carregar Lançamentos do Período/Conta Atuais
  async function handleOpenDrawer(type: 'income' | 'expense') {
    setDrawerType(type)
    setLoadingDrawerTx(true)
    setDrawerError('')
    try {
      const params = new URLSearchParams()
      params.append('type', type)
      params.append('limit', '150')
      if (dashboardAccountId === 'pix') {
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

  // Recarrega lista do drawer após edição/exclusão
  async function reloadDrawerTxList() {
    if (!drawerType) return
    try {
      const params = new URLSearchParams()
      params.append('type', drawerType)
      params.append('limit', '150')
      if (dashboardAccountId === 'pix') {
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
      }
    } catch {
      // Falha silenciosa de recarregamento
    }
  }

  // Excluir Transação dentro do Drawer
  async function handleDeleteTransactionInDrawer(e: React.MouseEvent, id: string) {
    e.stopPropagation()
    if (!confirm('Deseja realmente excluir este lançamento? Esta ação não pode ser desfeita.')) return
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

  // Excluir Compromisso / Recorrência / Parcela nos Próximos 30 dias
  async function handleDeleteCommitment(e: React.MouseEvent, id: string, title?: string) {
    e.stopPropagation()
    if (!confirm(`Deseja excluir o compromisso "${title || 'Sem título'}"?`)) return
    setDeletingCommitmentId(id)
    try {
      if (onDeleteTransaction) {
        await onDeleteTransaction(id)
      } else {
        await fetchWithAuth(`/api/transactions/${id}`, { method: 'DELETE' })
      }
      fetchDashboard()
    } catch {
      alert('Erro ao excluir compromisso')
    } finally {
      setDeletingCommitmentId(null)
    }
  }

  return (
    <section className="space-y-4 max-w-5xl mx-auto pb-12">
      {/* 1. SELETOR DE MÊS / ANO / CONTA + CONTROLE PRINCIPAL */}
      <div className="bg-white border border-[#EBEEF2] rounded-2xl p-3 sm:p-4 shadow-sm flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Navegador de Mês */}
        <div className="flex items-center gap-2">
          <MonthPicker
            monthOffset={monthOffset}
            onSelectMonthOffset={(offset) => {
              handleMonthNavigate(offset - monthOffset)
            }}
          />
        </div>

        {/* Filtro por Conta / Cartão */}
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          <div className="relative inline-flex items-center">
            <select
              value={dashboardAccountId}
              onChange={(e) => {
                setDashboardAccountId(e.target.value)
                fetchDashboard(undefined, undefined, undefined, undefined, e.target.value)
              }}
              className="bg-white border border-[#E5E7EB] hover:border-[#D1D5DB] rounded-xl px-2.5 py-1.5 text-xs text-[#374151] font-medium focus:outline-none focus:ring-2 focus:ring-[#2F68FE]/20 focus:border-[#2F68FE] transition-all cursor-pointer shadow-sm pr-7"
            >
              <option value="">Tudo</option>
              <option value="pix">PIX</option>
              {accounts
                .filter((a) => a.name?.trim().toLowerCase() !== 'pix')
                .map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name}
                  </option>
                ))}
            </select>
          </div>

          {/* Botão de Atualizar sutil */}
          <button
            onClick={() => fetchDashboard()}
            disabled={loadingDashboard}
            className="p-1.5 rounded-xl border border-[#E5E7EB] bg-white text-[#6B7280] hover:text-[#111827] hover:border-[#D1D5DB] transition-all shadow-sm disabled:opacity-40"
            title="Atualizar dados"
          >
            <span className={`inline-block text-xs ${loadingDashboard ? 'animate-spin' : ''}`}>↻</span>
          </button>
        </div>
      </div>

      {dashboardError && (
        <div className="border border-red-200 bg-red-50 text-red-700 rounded-xl px-4 py-2.5 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
          <span>{dashboardError}</span>
        </div>
      )}

      {loadingDashboard && !dashboardData ? (
        <div className="text-center py-16 text-[#9CA3AF] text-xs font-medium animate-pulse">
          Carregando visão geral…
        </div>
      ) : !dashboardData ? (
        <div className="text-center py-16 text-[#9CA3AF] text-xs font-medium animate-pulse">
          Carregando visão geral…
        </div>
      ) : (
        <>
          {/* Alerta caso o período esteja vazio */}
          {(dashboardData.metrics?.transactionCount === 0 && (!dashboardData.allUpcoming || dashboardData.allUpcoming.length === 0)) && (
            <div className="text-center py-6 border border-[#EBEEF2] rounded-2xl text-[#4B5563] text-xs bg-white mb-4">
              Nenhum dado encontrado para o período.
            </div>
          )}

          {/* 2. MÉTRICAS PRINCIPAIS (3 KPIS: SALDO, RECEITAS, DESPESAS) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
            {/* Saldo */}
            <div className="bg-white border border-[#EBEEF2] rounded-2xl p-5 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-[#4B5563]">
                  Saldo
                </span>
                <Wallet className="w-4 h-4 text-[#6B7280]" />
              </div>
              <div className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#111827]">
                {formatBRL(dashboardData.metrics?.balance ?? 0)}
              </div>
            </div>

            {/* Receitas */}
            <div
              onClick={() => handleOpenDrawer('income')}
              className="cursor-pointer bg-white border border-[#EBEEF2] hover:border-[#10B981]/40 rounded-2xl p-5 shadow-sm flex flex-col justify-between transition-all hover:shadow-md group"
              title="Ver receitas do período no painel lateral"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-[#059669]">
                  Receitas
                </span>
                <ArrowDownLeft className="w-4 h-4 text-[#059669] group-hover:scale-110 transition-transform" />
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <div className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#059669]">
                  {formatBRL(dashboardData.metrics?.totalIncome ?? 0)}
                </div>
                <span className="text-[11px] text-[#059669] font-bold flex items-center gap-0.5 group-hover:underline">
                  Ver extrato <ChevronRight className="w-3 h-3 stroke-[2.5]" />
                </span>
              </div>
            </div>

            {/* Despesas */}
            <div
              onClick={() => handleOpenDrawer('expense')}
              className="cursor-pointer bg-white border border-[#EBEEF2] hover:border-[#EF4444]/40 rounded-2xl p-5 shadow-sm flex flex-col justify-between transition-all hover:shadow-md group"
              title="Ver despesas do período no painel lateral"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-[#DC2626]">
                  Despesas
                </span>
                <ArrowUpRight className="w-4 h-4 text-[#DC2626] group-hover:scale-110 transition-transform" />
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <div className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#DC2626]">
                  {formatBRL(dashboardData.metrics?.totalExpenses ?? dashboardData.metrics?.totalSpent ?? 0)}
                </div>
                <span className="text-[11px] text-[#DC2626] font-bold flex items-center gap-0.5 group-hover:underline">
                  Ver extrato <ChevronRight className="w-3 h-3 stroke-[2.5]" />
                </span>
              </div>
            </div>
          </div>

          {/* GRID PRINCIPAL: 2 COLUNAS (ESQUERDA: COMPOSIÇÃO DOS GASTOS | DIREITA: ESTABELECIMENTOS + PRÓXIMOS PAGAMENTOS) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
            {/* COLUNA ESQUERDA: COMPOSIÇÃO DOS GASTOS */}
            <SpendingCompositionCard
              topCategories={dashboardData.topCategories}
              totalExpenses={dashboardData.metrics.totalExpenses}
              expenseTransactionCount={dashboardData.metrics.expenseTransactionCount}
              onOpenCategoryDetail={handleOpenCategoryDetail}
            />

            {/* COLUNA DIREITA: TOP ESTABELECIMENTOS + PRÓXIMOS PAGAMENTOS */}
            <div className="lg:col-span-6 flex flex-col gap-4">
              <TopVendorsCard
                topVendors={dashboardData.topVendors}
                dashboardAccountId={dashboardAccountId}
                onOpenVendorFiltered={(vendor) => {
                  setFilterType('expense')
                  navigateToTransactionsFiltered({
                    startDate: dashboardData.period.startDate,
                    endDate: dashboardData.period.endDate,
                    vendor: vendor,
                    accountId: dashboardAccountId || undefined,
                  })
                }}
                onOpenAllVendors={() => {
                  setFilterType('expense')
                  navigateToTransactionsFiltered({
                    startDate: dashboardData.period.startDate,
                    endDate: dashboardData.period.endDate,
                    accountId: dashboardAccountId || undefined,
                  })
                }}
              />

              <UpcomingCommitmentsCard
                totalUpcoming={dashboardData.upcomingCommitments?.forecastTotal30Days || dashboardData.forecastTotal30Days || 0}
                onOpenUpcomingModal={() => setIsUpcomingModalOpen(true)}
              />
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

      {/* Drawer Lateral / Modal de Próximos Pagamentos */}
      <UpcomingDrawer
        isOpen={isUpcomingModalOpen}
        dashboardData={dashboardData}
        deletingCommitmentId={deletingCommitmentId}
        onClose={() => setIsUpcomingModalOpen(false)}
        onEditTx={(tx) => setEditingTx(tx)}
        onDeleteCommitment={handleDeleteCommitment}
      />

      {/* Modal de Edição Completa Integrado na Visão Geral */}
      {editingTx && (
        <EditTransactionModal
          transaction={editingTx}
          accounts={accounts}
          onClose={() => setEditingTx(null)}
          onSaveSuccess={(updatedTx) => {
            if (onTransactionUpdated) {
              onTransactionUpdated(updatedTx)
            }
            fetchDashboard()
            reloadDrawerTxList()
            setEditingTx(null)
          }}
        />
      )}
    </section>
  )
}
