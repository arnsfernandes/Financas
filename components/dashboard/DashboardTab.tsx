'use client'

import React, { useState } from 'react'
import {
  Wallet,
  ArrowDownLeft,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Store,
  CalendarDays,
  Repeat,
  CreditCard,
  AlertTriangle,
  X,
  Plus,
  Edit2,
  Trash2,
  ChevronDown,
} from 'lucide-react'
import type { Account } from '@/lib/schema'
import { formatBRL } from '@/lib/formatters'
import type { TransactionRecord } from '@/components/transactions/TransactionsTab'
import { EditTransactionModal } from '@/components/modals/EditTransactionModal'
import { InstitutionLogo } from '@/components/accounts/InstitutionLogo'
import { useTelegramWebApp } from '@/lib/useTelegramWebApp'

export interface DashboardTabProps {
  dashboardData: any
  loadingDashboard: boolean
  dashboardError?: string
  accounts: Account[]
  periodType: 'month' | 'year' | 'custom'
  handlePeriodTypeChange: (p: 'month' | 'year' | 'custom') => void
  monthOffset: number
  handleMonthNavigate: (delta: number) => void
  customStartDate: string
  setCustomStartDate: (v: string) => void
  customEndDate: string
  setCustomEndDate: (v: string) => void
  handleApplyCustomPeriod: (e: React.FormEvent) => void
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
  customStartDate,
  setCustomStartDate,
  customEndDate,
  setCustomEndDate,
  handleApplyCustomPeriod,
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

  // Abrir Drawer e Carregar Lançamentos do Período/Conta Atuais
  async function handleOpenDrawer(type: 'income' | 'expense') {
    setDrawerType(type)
    setLoadingDrawerTx(true)
    setDrawerError('')
    try {
      const params = new URLSearchParams()
      params.append('type', type)
      params.append('limit', '200')
      if (dashboardAccountId) params.append('accountId', dashboardAccountId)
      if (dashboardData?.period?.startDate) params.append('startDate', dashboardData.period.startDate)
      if (dashboardData?.period?.endDate) params.append('endDate', dashboardData.period.endDate)

      const res = await fetchWithAuth(`/api/transactions?${params.toString()}`)
      const data = await res.json()
      if (data.ok && Array.isArray(data.transactions)) {
        setDrawerTxList(data.transactions)
      } else {
        setDrawerError(data.error || 'Erro ao carregar lançamentos')
      }
    } catch {
      setDrawerError('Erro de conexão ao carregar lançamentos')
    } finally {
      setLoadingDrawerTx(false)
    }
  }

  // Recarregar lista do drawer quando atualizado/excluído
  async function reloadDrawerTxList() {
    if (!drawerType) return
    try {
      const params = new URLSearchParams()
      params.append('type', drawerType)
      params.append('limit', '200')
      if (dashboardAccountId) params.append('accountId', dashboardAccountId)
      if (dashboardData?.period?.startDate) params.append('startDate', dashboardData.period.startDate)
      if (dashboardData?.period?.endDate) params.append('endDate', dashboardData.period.endDate)

      const res = await fetchWithAuth(`/api/transactions?${params.toString()}`)
      const data = await res.json()
      if (data.ok && Array.isArray(data.transactions)) {
        setDrawerTxList(data.transactions)
      }
    } catch (e) {
      console.error(e)
    }
  }

  async function handleDeleteFromDrawer(e: React.MouseEvent, id: string, vendor?: string | null) {
    e.stopPropagation()
    const confirmMsg = vendor
      ? `Tem certeza que deseja excluir o lançamento de "${vendor}"?`
      : 'Tem certeza que deseja excluir este lançamento?'

    if (!window.confirm(confirmMsg)) return

    setDeletingTxId(id)
    try {
      if (onDeleteTransaction) {
        await onDeleteTransaction(id)
      } else {
        const res = await fetchWithAuth(`/api/transactions/${id}`, { method: 'DELETE' })
        const data = await res.json()
        if (!data.ok) {
          throw new Error(data.error || 'Erro ao excluir')
        }
        fetchDashboard()
      }
      setDrawerTxList((prev) => prev.filter((t) => t.id !== id))
    } catch (err: any) {
      alert(err.message || 'Erro ao excluir lançamento.')
    } finally {
      setDeletingTxId(null)
    }
  }

  async function handleDeleteCommitment(e: React.MouseEvent, id: string, title?: string | null) {
    e.stopPropagation()
    const confirmMsg = title
      ? `Tem certeza que deseja excluir o compromisso "${title}"?`
      : 'Tem certeza que deseja excluir este compromisso?'

    if (!window.confirm(confirmMsg)) return

    setDeletingCommitmentId(id)
    try {
      if (onDeleteTransaction) {
        await onDeleteTransaction(id)
      } else {
        const res = await fetchWithAuth(`/api/transactions/${id}`, { method: 'DELETE' })
        const data = await res.json()
        if (!data.ok) {
          throw new Error(data.error || 'Erro ao excluir')
        }
      }
      await fetchDashboard()
    } catch (err: any) {
      alert(err.message || 'Erro ao excluir compromisso.')
    } finally {
      setDeletingCommitmentId(null)
    }
  }
  return (
    <section className="space-y-6 pb-10">
      {/* 1. CABEÇALHO */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-2 border-b border-[#EBEEF2]">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#111827]">
            Visão Geral
          </h1>
        </div>

        {/* Controles de Período e Conta */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Seletor de Período */}
          <div className="flex items-center bg-[#F4F5F7] p-1 rounded-xl border border-[#E5E7EB]">
            {(
              [
                { id: 'month', label: 'Mês' },
                { id: 'year', label: 'Ano' },
                { id: 'custom', label: 'Personalizado' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                onClick={() => handlePeriodTypeChange(tab.id)}
                className={`px-3 py-1 text-xs font-medium transition-all ${
                  periodType === tab.id
                    ? 'bg-white text-[#111827] shadow-sm font-semibold rounded-lg'
                    : 'text-[#6B7280] hover:text-[#111827] rounded-lg'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Navegação de Mês */}
          {periodType === 'month' && (
            <div className="flex items-center gap-1 bg-[#F4F5F7] p-1 rounded-xl border border-[#E5E7EB]">
              <button
                onClick={() => handleMonthNavigate(-1)}
                disabled={loadingDashboard}
                className="p-1.5 rounded-lg hover:bg-white text-[#6B7280] hover:text-[#111827] transition-all disabled:opacity-40"
                title="Mês anterior"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span className="text-xs font-semibold px-2 text-[#111827] whitespace-nowrap min-w-[85px] text-center">
                {dashboardData?.period?.label || 'Este Mês'}
              </span>
              <button
                onClick={() => handleMonthNavigate(1)}
                disabled={loadingDashboard}
                className="p-1.5 rounded-lg hover:bg-white text-[#6B7280] hover:text-[#111827] transition-all disabled:opacity-40"
                title="Próximo mês"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Filtro de Conta */}
          <div className="relative">
            <select
              value={dashboardAccountId}
              onChange={(e) => {
                setDashboardAccountId(e.target.value)
                fetchDashboard(undefined, undefined, undefined, undefined, e.target.value)
              }}
              className="bg-white border border-[#E5E7EB] hover:border-[#D1D5DB] rounded-xl px-2.5 py-1.5 text-xs text-[#374151] font-medium focus:outline-none focus:ring-2 focus:ring-[#2F68FE]/20 focus:border-[#2F68FE] transition-all cursor-pointer shadow-sm pr-7"
            >
              <option value="">Todas as Contas</option>
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name} {acc.institution ? `(${acc.institution})` : ''}
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

      {/* Formulário de Período Personalizado (quando selecionado) */}
      {periodType === 'custom' && (
        <form onSubmit={handleApplyCustomPeriod} className="flex flex-wrap items-center gap-3 p-3 bg-[#F9FAFB] border border-[#EBEEF2] rounded-xl">
          <div className="flex items-center gap-2">
            <label className="text-xs text-[#6B7280] font-medium">De:</label>
            <input
              type="date"
              required
              value={customStartDate}
              onChange={(e) => setCustomStartDate(e.target.value)}
              className="bg-white border border-[#E5E7EB] rounded-lg px-2.5 py-1 text-xs text-[#111827] focus:outline-none focus:border-[#2F68FE]"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-[#6B7280] font-medium">Até:</label>
            <input
              type="date"
              required
              value={customEndDate}
              onChange={(e) => setCustomEndDate(e.target.value)}
              className="bg-white border border-[#E5E7EB] rounded-lg px-2.5 py-1 text-xs text-[#111827] focus:outline-none focus:border-[#2F68FE]"
            />
          </div>
          <button
            type="submit"
            disabled={loadingDashboard}
            className="px-3 py-1 rounded-lg bg-[#2F68FE] hover:bg-[#2557D6] text-white text-xs font-medium transition-colors shadow-sm"
          >
            Aplicar
          </button>
        </form>
      )}

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
            <div className="text-center py-6 border border-[#EBEEF2] rounded-2xl text-[#9CA3AF] text-xs bg-white mb-4">
              Nenhum dado encontrado para o período.
            </div>
          )}
          {/* 2. MÉTRICAS PRINCIPAIS (3 KPIS: SALDO, RECEITAS, DESPESAS) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
            {/* Saldo */}
            <div className="bg-white border border-[#EBEEF2] rounded-2xl p-5 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-[#6B7280]">
                    Saldo
                  </span>
                  <Wallet className="w-4 h-4 text-[#9CA3AF]" />
                </div>
                <div className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#111827]">
                  {formatBRL(dashboardData.metrics?.balance ?? 0)}
                </div>
              </div>
              <div className="mt-3 pt-2.5 border-t border-[#F4F5F7] flex items-center justify-between text-[11px] text-[#6B7280]">
                <span>{dashboardData.metrics?.incomeTransactionCount || 0} receitas</span>
                <span>•</span>
                <span>{dashboardData.metrics?.expenseTransactionCount || 0} despesas</span>
              </div>
            </div>

            {/* Receitas */}
            <div
              onClick={() => handleOpenDrawer('income')}
              className="cursor-pointer bg-white border border-[#EBEEF2] hover:border-[#10B981]/40 rounded-2xl p-5 shadow-sm flex flex-col justify-between transition-all hover:shadow-md group"
              title="Ver receitas do período no painel lateral"
            >
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-[#10B981]">
                    Receitas
                  </span>
                  <ArrowDownLeft className="w-4 h-4 text-[#10B981] group-hover:scale-110 transition-transform" />
                </div>
                <div className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#10B981]">
                  {formatBRL(dashboardData.metrics?.totalIncome ?? 0)}
                </div>
              </div>
              <div className="mt-3 pt-2.5 border-t border-[#F4F5F7] flex items-center justify-between text-[11px] text-[#6B7280]">
                <span>{dashboardData.metrics?.incomeTransactionCount || 0} lançamentos</span>
                <span className="text-[11px] text-[#10B981] font-medium flex items-center gap-0.5 group-hover:underline">
                  Ver extrato <ChevronRight className="w-3 h-3" />
                </span>
              </div>
            </div>

            {/* Despesas */}
            <div
              onClick={() => handleOpenDrawer('expense')}
              className="cursor-pointer bg-white border border-[#EBEEF2] hover:border-[#EF4444]/40 rounded-2xl p-5 shadow-sm flex flex-col justify-between transition-all hover:shadow-md group"
              title="Ver despesas do período no painel lateral"
            >
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-[#EF4444]">
                    Despesas
                  </span>
                  <ArrowUpRight className="w-4 h-4 text-[#EF4444] group-hover:scale-110 transition-transform" />
                </div>
                <div className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#EF4444]">
                  {formatBRL(dashboardData.metrics?.totalExpenses ?? dashboardData.metrics?.totalSpent ?? 0)}
                </div>
              </div>
              <div className="mt-3 pt-2.5 border-t border-[#F4F5F7] flex items-center justify-between text-[11px] text-[#6B7280]">
                <span>{dashboardData.metrics?.expenseTransactionCount || 0} lançamentos</span>
                <span className="text-[11px] text-[#EF4444] font-medium flex items-center gap-0.5 group-hover:underline">
                  Ver extrato <ChevronRight className="w-3 h-3" />
                </span>
              </div>
            </div>
          </div>

          {/* GRID PRINCIPAL: 2 COLUNAS (ESQUERDA: COMPOSIÇÃO DOS GASTOS | DIREITA: ESTABELECIMENTOS + PRÓXIMOS PAGAMENTOS) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
            
            {/* COLUNA ESQUERDA (LG: COL-SPAN-6 ou COL-SPAN-7): COMPOSIÇÃO DOS GASTOS */}
            <div className="lg:col-span-6 bg-white border border-[#EBEEF2] rounded-2xl p-5 shadow-sm flex flex-col h-full justify-between">
              <div>
                <div className="flex items-center justify-between gap-1.5 mb-3">
                  <div>
                    <h2 className="text-sm sm:text-base font-bold text-[#111827]">Composição dos Gastos</h2>
                    <p className="text-[11px] text-[#6B7280]">Distribuição por categoria</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {onNavigateToCategories && (
                      <button
                        type="button"
                        onClick={onNavigateToCategories}
                        className="text-[11px] font-semibold text-[#2F68FE] hover:text-[#1D52EB] hover:underline"
                      >
                        Gerenciar categorias
                      </button>
                    )}
                    {dashboardData.topCategories && dashboardData.topCategories.length > 0 && (
                      <span className="text-[11px] font-semibold text-[#6B7280] bg-[#F4F5F7] px-2 py-0.5 rounded-lg">
                        {dashboardData.topCategories.length} {dashboardData.topCategories.length > 1 ? 'categorias' : 'categoria'}
                      </span>
                    )}
                  </div>
                </div>

                {!dashboardData.topCategories || dashboardData.topCategories.length === 0 ? (
                  <div className="text-center py-12 text-[#9CA3AF] text-xs">
                    Nenhuma despesa categorizada neste período.
                  </div>
                ) : (
                  (() => {
                    const totalExp = dashboardData.metrics?.totalExpenses ?? dashboardData.metrics?.totalSpent ?? 0
                    const colors = [
                      '#2F68FE', // Azul Copilot
                      '#10B981', // Verde
                      '#F59E0B', // Âmbar
                      '#EC4899', // Rosa
                      '#8B5CF6', // Roxo suave
                      '#06B6D4', // Ciano
                      '#F97316', // Laranja
                      '#64748B', // Cinza azulado
                    ]

                    let cumulativeAngle = 0
                    const segments = dashboardData.topCategories.map((cat: any, i: number) => {
                      const pct = totalExp > 0 ? (cat.total / totalExp) * 100 : 0
                      const angle = (pct / 100) * 360
                      const start = cumulativeAngle
                      cumulativeAngle += angle
                      return {
                        ...cat,
                        color: cat.color || colors[i % colors.length],
                        percentage: Number(pct.toFixed(1)),
                        startAngle: start,
                        endAngle: cumulativeAngle,
                      }
                    })

                    // Gerar gradiente cônico SVG / CSS
                    const conicGradientParts = segments.map((seg: any) => `${seg.color} ${seg.startAngle}deg ${seg.endAngle}deg`)
                    const conicStyle = {
                      background: `conic-gradient(${conicGradientParts.join(', ')})`,
                    }

                    return (
                      <div className="flex flex-col sm:flex-row gap-4 items-center sm:items-start pt-1">
                        {/* Donut Chart Compacto com Total ao Centro */}
                        <div className="shrink-0 flex flex-col items-center justify-center pt-2">
                          <div className="relative w-36 h-36 rounded-full flex items-center justify-center p-2.5 shadow-inner" style={conicStyle}>
                            {/* Círculo interno branco para efeito Donut */}
                            <div className="w-24 h-24 bg-white rounded-full flex flex-col items-center justify-center p-1.5 text-center shadow-sm">
                              <span className="text-[9px] font-semibold uppercase tracking-wider text-[#6B7280]">
                                Total Gasto
                              </span>
                              <span className="text-sm font-extrabold text-[#111827] tracking-tight mt-0.5">
                                {formatBRL(totalExp)}
                              </span>
                              <span className="text-[9px] text-[#9CA3AF]">
                                {dashboardData.metrics?.expenseTransactionCount || 0} lançamentos
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Lista / Legenda das Categorias Compacta */}
                        <div className="w-full space-y-1">
                          <div className="text-[10px] text-[#9CA3AF] font-semibold pb-1 flex justify-between uppercase tracking-wider border-b border-[#F4F5F7]">
                            <span>Categoria</span>
                            <span>Total</span>
                          </div>
                          <div className="space-y-0.5 max-h-[220px] overflow-y-auto pr-1">
                            {segments.map((seg: any, i: number) => (
                              <button
                                key={i}
                                onClick={() => {
                                  setFilterType('expense')
                                  navigateToTransactionsFiltered({
                                    category: seg.rawCategory || seg.category,
                                    startDate: dashboardData.period?.startDate,
                                    endDate: dashboardData.period?.endDate,
                                  })
                                }}
                                className="w-full flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-[#F9FAFB] border border-transparent hover:border-[#EBEEF2] transition-all text-left group"
                                title={`Filtrar transações de ${seg.category}`}
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <span
                                    className="w-2 h-2 rounded-full shrink-0"
                                    style={{ backgroundColor: seg.color }}
                                  />
                                  <span className="text-xs font-medium text-[#111827] group-hover:text-[#2F68FE] transition-colors truncate">
                                    {seg.category}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2 shrink-0 text-xs">
                                  <span className="font-semibold text-[#111827]">
                                    {formatBRL(seg.total)}
                                  </span>
                                  <span className="text-[10px] font-medium text-[#6B7280] bg-[#F4F5F7] px-1.5 py-0.2 rounded min-w-[34px] text-right">
                                    {seg.percentage}%
                                  </span>
                                  <ChevronRight className="w-3 h-3 text-[#D1D5DB] group-hover:text-[#2F68FE] group-hover:translate-x-0.5 transition-all" />
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )
                  })()
                )}
              </div>
            </div>

            {/* COLUNA DIREITA (LG: COL-SPAN-6): TOP ESTABELECIMENTOS + PRÓXIMOS PAGAMENTOS EMPILHADOS */}
            <div className="lg:col-span-6 flex flex-col gap-4">
              
              {/* CARD: TOP ESTABELECIMENTOS */}
              <div className="bg-white border border-[#EBEEF2] rounded-2xl p-4 sm:p-5 shadow-sm">
                <div className="flex items-center justify-between mb-2.5">
                  <div>
                    <h2 className="text-sm sm:text-base font-bold text-[#111827] flex items-center gap-2">
                      <Store className="w-4 h-4 text-[#6B7280]" />
                      Top Estabelecimentos
                    </h2>
                    <p className="text-[11px] text-[#6B7280]">Onde você mais gastou neste período</p>
                  </div>
                  <button
                    onClick={() => {
                      setFilterType('expense')
                      navigateToTransactionsFiltered({
                        startDate: dashboardData.period?.startDate,
                        endDate: dashboardData.period?.endDate,
                      })
                    }}
                    className="text-xs font-semibold text-[#2F68FE] hover:underline"
                  >
                    Ver todos
                  </button>
                </div>

                {!dashboardData.topVendors || dashboardData.topVendors.length === 0 ? (
                  <div className="text-center py-4 text-[#9CA3AF] text-xs">
                    Nenhum estabelecimento registrado no período.
                  </div>
                ) : (
                  <div className="divide-y divide-[#F4F5F7] max-h-[140px] overflow-y-auto pr-1">
                    {dashboardData.topVendors.slice(0, 4).map((ven: any, i: number) => (
                      <div
                        key={i}
                        onClick={() => {
                          setFilterType('expense')
                          navigateToTransactionsFiltered({
                            vendor: ven.vendor,
                            startDate: dashboardData.period?.startDate,
                            endDate: dashboardData.period?.endDate,
                            category: null,
                            accountId: null,
                          })
                        }}
                        className="py-1.5 flex items-center justify-between gap-3 text-xs cursor-pointer hover:bg-[#F9FAFB] px-2 -mx-2 rounded-lg transition-all group"
                        title={`Filtrar gastos em ${ven.vendor}`}
                      >
                        <div className="min-w-0">
                          <span className="font-semibold text-[#111827] block truncate group-hover:text-[#2F68FE] transition-colors">
                            {ven.vendor}
                          </span>
                          <span className="text-[10px] text-[#6B7280]">
                            {ven.count} compra{ven.count > 1 ? 's' : ''}
                          </span>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="font-bold text-[#111827] block">
                            {formatBRL(ven.total)}
                          </span>
                          <span className="text-[10px] text-[#6B7280] font-medium">
                            {ven.percentage}% dos gastos
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* CARD: PRÓXIMOS PAGAMENTOS */}
              {(() => {
                const totalUpcoming = (dashboardData.allUpcoming?.length
                  ? dashboardData.allUpcoming.reduce((sum: number, it: any) => sum + (Number(it.amount) || 0), 0)
                  : (dashboardData.forecastTotal30Days || 0))

                return (
                  <div
                    onClick={() => setIsUpcomingModalOpen(true)}
                    className="cursor-pointer bg-white border border-[#EBEEF2] hover:border-[#2F68FE]/40 rounded-2xl p-5 shadow-sm transition-all hover:shadow-md group flex flex-col justify-between"
                    title="Ver detalhes dos próximos pagamentos"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-xl bg-[#F4F5F7] text-[#6B7280] group-hover:bg-[#EBF2FE] group-hover:text-[#2F68FE] flex items-center justify-center transition-colors">
                            <CalendarDays className="w-4 h-4" />
                          </div>
                          <div>
                            <span className="text-[11px] font-semibold uppercase tracking-wider text-[#6B7280]">
                              Próximos Pagamentos
                            </span>
                            <p className="text-[11px] text-[#9CA3AF]">Próximos 30 dias</p>
                          </div>
                        </div>
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center text-[#9CA3AF] group-hover:text-[#2F68FE] group-hover:bg-[#F4F5F7] transition-all">
                          <ChevronRight className="w-4 h-4" />
                        </div>
                      </div>

                      <div className="mt-3">
                        <div className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#111827]">
                          {formatBRL(totalUpcoming)}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-[#F4F5F7] flex items-center justify-end text-xs text-[#6B7280]">
                      <span className="text-[#2F68FE] font-medium group-hover:underline">
                        Ver detalhes →
                      </span>
                    </div>
                  </div>
                )
              })()}

            </div>
          </div>
        </>
      )}

      {/* DRAWER LATERAL GRANDE: RECEITAS / DESPESAS DA VISÃO GERAL */}
      {drawerType && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-[2px] transition-opacity"
          onClick={() => setDrawerType(null)}
        >
          <div
            className="w-full max-w-lg bg-white h-full shadow-2xl flex flex-col border-l border-[#EBEEF2] animate-in slide-in-from-right duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Cabeçalho do Drawer */}
            <div className="p-5 border-b border-[#EBEEF2] flex items-center justify-between bg-white sticky top-0 z-10">
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
                    drawerType === 'income'
                      ? 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                      : 'bg-red-50 text-red-600 border border-red-100'
                  }`}
                >
                  {drawerType === 'income' ? (
                    <ArrowDownLeft className="w-5 h-5" />
                  ) : (
                    <ArrowUpRight className="w-5 h-5" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-[#111827]">
                      {drawerType === 'income' ? 'Receitas' : 'Despesas'}
                    </h2>
                    <span className="text-[11px] font-semibold text-[#6B7280] bg-[#F4F5F7] px-2 py-0.5 rounded-lg">
                      {dashboardData?.period?.label || 'Período atual'}
                    </span>
                  </div>
                  <p className="text-[11px] text-[#6B7280]">
                    {drawerType === 'income'
                      ? 'Entradas registradas no período selecionado'
                      : 'Saídas registradas no período selecionado'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => setDrawerType(null)}
                  className="p-1.5 rounded-xl hover:bg-[#F4F5F7] text-[#9CA3AF] hover:text-[#111827] transition-colors"
                  title="Fechar"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Resumo no Topo do Drawer */}
            <div className="p-5 bg-[#F9FAFB] border-b border-[#EBEEF2] flex items-center justify-between">
              <div>
                <span className="text-[11px] font-semibold text-[#6B7280] uppercase tracking-wider block">
                  {drawerType === 'income' ? 'Total Recebido' : 'Total Gasto'}
                </span>
                <span
                  className={`text-2xl font-extrabold tracking-tight ${
                    drawerType === 'income' ? 'text-[#10B981]' : 'text-[#EF4444]'
                  }`}
                >
                  {formatBRL(
                    drawerType === 'income'
                      ? dashboardData?.metrics?.totalIncome ?? 0
                      : dashboardData?.metrics?.totalExpenses ?? dashboardData?.metrics?.totalSpent ?? 0
                  )}
                </span>
              </div>
              <div className="text-right">
                <span className="text-[11px] font-semibold text-[#6B7280] uppercase tracking-wider block">
                  Lançamentos
                </span>
                <span className="text-base font-bold text-[#111827]">
                  {loadingDrawerTx ? '...' : drawerTxList.length}
                </span>
              </div>
            </div>

            {/* Conteúdo da Lista de Lançamentos */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-2">
              {drawerError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                  <span>{drawerError}</span>
                </div>
              )}

              {loadingDrawerTx ? (
                <div className="text-center py-16 text-[#9CA3AF] text-xs font-medium animate-pulse">
                  Carregando lançamentos…
                </div>
              ) : drawerTxList.length === 0 ? (
                <div className="text-center py-16 px-4 border border-dashed border-[#E5E7EB] rounded-2xl bg-[#FAFAFA]">
                  <p className="text-xs font-semibold text-[#374151]">Nenhum lançamento encontrado</p>
                  <p className="text-[11px] text-[#9CA3AF] mt-1">
                    Não há {drawerType === 'income' ? 'receitas' : 'despesas'} cadastradas para o período e conta selecionados.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-[#F4F5F7] border border-[#EBEEF2] rounded-2xl bg-white overflow-hidden shadow-sm">
                  {drawerTxList.map((tx) => {
                    const isIncome = tx.type === 'income'
                    const isRecurring = tx.is_recurring
                    const isInstallment = tx.installment_total != null && tx.installment_total > 1

                    return (
                      <div
                        key={tx.id}
                        onClick={() => setEditingTx(tx)}
                        className="p-3.5 hover:bg-[#F9FAFB] cursor-pointer transition-colors flex items-center justify-between gap-3 group"
                        title="Clique para editar este lançamento"
                      >
                        {/* Lado Esquerdo: Identificação compacta */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-[#111827] group-hover:text-[#2F68FE] transition-colors truncate">
                              {tx.canonical_vendors?.canonical_name || tx.vendor || (isIncome ? 'Receita sem pagador' : 'Despesa sem local')}
                            </span>
                            {isRecurring && (
                              <span className="text-[9px] px-1.5 py-0.2 rounded font-medium bg-blue-50 text-blue-700 border border-blue-200 shrink-0">
                                Recorrente
                              </span>
                            )}
                            {isInstallment && (
                              <span className="text-[9px] px-1.5 py-0.2 rounded font-medium bg-amber-50 text-amber-700 border border-amber-200 shrink-0">
                                {tx.installment_current || 1}/{tx.installment_total}x
                              </span>
                            )}
                          </div>

                          {/* Metadados: Categoria • Data • Conta */}
                          <div className="flex items-center gap-1.5 text-[11px] text-[#6B7280] mt-1 flex-wrap">
                            <span className="font-medium text-[#374151]">
                              {tx.category || 'Geral'}
                            </span>
                            <span>•</span>
                            <span>
                              {tx.date
                                ? new Date(tx.date + 'T00:00:00').toLocaleDateString('pt-BR')
                                : new Date(tx.created_at).toLocaleDateString('pt-BR')}
                            </span>
                            {tx.accounts && (
                              <>
                                <span>•</span>
                                <span className="text-[#9CA3AF] truncate max-w-[120px]">
                                  {tx.accounts.name}
                                </span>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Lado Direito: Valor e Ações Rápidas */}
                        <div className="flex items-center gap-2.5 shrink-0">
                          <span
                            className={`text-xs sm:text-sm font-bold whitespace-nowrap ${
                              isIncome ? 'text-[#10B981]' : 'text-[#111827]'
                            }`}
                          >
                            {isIncome ? '+' : '-'} {formatBRL(tx.total)}
                          </span>

                          <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                setEditingTx(tx)
                              }}
                              className="p-1 rounded-lg hover:bg-white text-[#6B7280] hover:text-[#2F68FE] hover:shadow-sm border border-transparent hover:border-[#EBEEF2] transition-all"
                              title="Editar"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={(e) => handleDeleteFromDrawer(e, tx.id, tx.vendor)}
                              disabled={deletingTxId === tx.id}
                              className="p-1 rounded-lg hover:bg-red-50 text-[#9CA3AF] hover:text-red-600 transition-colors disabled:opacity-40"
                              title="Excluir"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Rodapé do Drawer com Botão Contextual de Novo Lançamento */}
            <div className="p-4 border-t border-[#EBEEF2] bg-[#F9FAFB] flex items-center justify-between gap-3">
              <button
                onClick={() => setDrawerType(null)}
                className="py-2 px-3.5 rounded-xl border border-[#E5E7EB] bg-white text-xs font-semibold text-[#374151] hover:bg-[#F3F4F6] transition-colors"
              >
                Fechar
              </button>

              <button
                onClick={() => {
                  const typeToAdd = drawerType
                  setDrawerType(null)
                  if (onOpenNewLaunch) {
                    onOpenNewLaunch(typeToAdd)
                  }
                }}
                className={`flex-1 py-2.5 px-4 rounded-xl text-white font-semibold text-xs transition-colors flex items-center justify-center gap-1.5 shadow-sm ${
                  drawerType === 'income'
                    ? 'bg-[#10B981] hover:bg-[#059669]'
                    : 'bg-[#2F68FE] hover:bg-[#2557D6]'
                }`}
              >
                <Plus className="w-4 h-4" />
                {drawerType === 'income' ? '+ Adicionar Receita' : '+ Adicionar Despesa'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DRAWER LATERAL: PRÓXIMOS PAGAMENTOS (COMPROMISSOS FUTUROS DETALHADOS) */}
      {isUpcomingModalOpen && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-[2px] transition-opacity"
          onClick={() => setIsUpcomingModalOpen(false)}
        >
          <div
            className="w-full max-w-lg bg-white h-full shadow-2xl flex flex-col border-l border-[#EBEEF2] animate-in slide-in-from-right duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Cabeçalho do Drawer */}
            <div className="p-5 border-b border-[#EBEEF2] flex items-center justify-between bg-white sticky top-0 z-10">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 bg-[#EBF2FE] text-[#2F68FE]">
                  <CalendarDays className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-base text-[#111827] truncate">
                    Próximos Pagamentos
                  </h3>
                  <p className="text-xs text-[#6B7280]">
                    Próximos 30 dias • Total:{' '}
                    {formatBRL(
                      dashboardData?.allUpcoming?.length
                        ? dashboardData.allUpcoming.reduce((sum: number, it: any) => sum + (Number(it.amount) || 0), 0)
                        : (dashboardData?.forecastTotal30Days || 0)
                    )}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsUpcomingModalOpen(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-[#6B7280] hover:text-[#111827] hover:bg-[#F3F4F6] transition-colors"
                title="Fechar painel"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Lista detalhada */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3">
              {(!dashboardData?.allUpcoming || dashboardData.allUpcoming.length === 0) ? (
                <div className="text-center py-16 text-[#9CA3AF] text-xs">
                  Nenhum pagamento previsto para os próximos 30 dias.
                </div>
              ) : (
                dashboardData.allUpcoming.map((item: any) => {
                  const isCardInvoice = item.kind === 'card_invoice'
                  const isInst = item.kind === 'installment'
                  const isRec = item.kind === 'recurring'
                  const isExpanded = Boolean(expandedInvoices[item.id])

                  // 1. FATURA CONSOLIDADA DE CARTÃO DE CRÉDITO
                  if (isCardInvoice) {
                    return (
                      <div
                        key={item.id}
                        className="bg-white border border-[#E5E7EB] rounded-xl overflow-hidden shadow-sm hover:border-[#D1D5DB] transition-all flex flex-col"
                      >
                        <div className="p-4 flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <InstitutionLogo
                              institution={item.accountName || item.title}
                              accountName={item.title}
                              accountType="credit_card"
                              size="md"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap mb-1">
                                <span className="font-semibold text-sm text-[#111827]">
                                  {item.title}
                                </span>
                              <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md bg-[#2F68FE]/10 text-[#2F68FE] font-medium border border-[#2F68FE]/20">
                                <CreditCard className="w-3 h-3" />
                                Fatura de Cartão
                              </span>
                              {item.dueDayLabel && (
                                <span className="inline-flex items-center text-[10px] px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200">
                                  {item.dueDayLabel}
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-2 text-xs text-[#6B7280] flex-wrap mt-0.5">
                              <span className="font-medium text-[#374151]">
                                Vencimento: {item.date ? new Date(item.date + 'T00:00:00').toLocaleDateString('pt-BR') : 'Data não informada'}
                              </span>
                              <span>•</span>
                              <span>{item.accountName || 'Cartão de Crédito'}</span>
                              <span>•</span>
                              <span>{item.invoiceItems?.length || 0} compras / parcelas</span>
                            </div>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                            <span className="font-bold text-base text-[#EF4444] block">
                              -{formatBRL(item.amount)}
                            </span>
                          </div>
                        </div>

                        {/* Botão para alternar detalhes da fatura */}
                        <div className="px-4 py-2 bg-[#F9FAFB] border-t border-[#EBEEF2] flex items-center justify-between text-xs">
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedInvoices((prev) => ({
                                ...prev,
                                [item.id]: !prev[item.id],
                              }))
                            }
                            className="text-[#2F68FE] hover:text-[#1D4ED8] font-medium flex items-center gap-1.5 transition-colors"
                          >
                            <span>{isExpanded ? 'Ocultar compras da fatura' : `Ver compras da fatura (${item.invoiceItems?.length || 0})`}</span>
                            <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                          </button>
                          <span className="text-[11px] text-[#9CA3AF]">
                            Consolidado na fatura
                          </span>
                        </div>

                        {/* Itens detalhados que compõem a fatura */}
                        {isExpanded && item.invoiceItems && item.invoiceItems.length > 0 && (
                          <div className="border-t border-[#EBEEF2] divide-y divide-[#F3F4F6] bg-white">
                            {item.invoiceItems.map((invItem: any) => (
                              <div
                                key={invItem.id}
                                className="px-4 py-2.5 flex items-center justify-between gap-3 text-xs hover:bg-[#F9FAFB] transition-colors"
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-medium text-[#111827] truncate">
                                      {invItem.vendor || 'Compra sem nome'}
                                    </span>
                                    {invItem.installmentInfo && (
                                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-50 text-amber-700 border border-amber-200 font-medium">
                                        {invItem.installmentInfo.current}/{invItem.installmentInfo.total}
                                      </span>
                                    )}
                                    <span className="text-[10px] text-[#6B7280]">
                                      {invItem.category || 'Geral'}
                                    </span>
                                  </div>
                                  <div className="text-[11px] text-[#9CA3AF] mt-0.5">
                                    Data da compra: {invItem.date ? new Date(invItem.date + 'T00:00:00').toLocaleDateString('pt-BR') : 'Data não informada'}
                                  </div>
                                </div>

                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="font-semibold text-[#111827]">
                                    {formatBRL(invItem.amount)}
                                  </span>
                                  {invItem.rawTx && (
                                    <button
                                      type="button"
                                      onClick={() => setEditingTx(invItem.rawTx)}
                                      className="p-1 text-[#6B7280] hover:text-[#2F68FE] hover:bg-[#EBF2FE] rounded transition-colors"
                                      title="Editar esta compra"
                                    >
                                      <Edit2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  }

                  // 2. DESPESAS FIXAS / RECORRENTES & COMPROMISSOS INDIVIDUAIS
                  return (
                    <div
                      key={item.id}
                      className="bg-white border border-[#EBEEF2] rounded-xl p-3.5 shadow-sm hover:border-[#D1D5DB] transition-all flex flex-col gap-2.5"
                    >
                      {/* Linha superior: Título, Tipo e Valor */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <InstitutionLogo
                            institution={item.accountName}
                            accountName={item.title || item.vendor}
                            accountType={item.accountType}
                            size="md"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <span className="font-semibold text-sm text-[#111827] truncate">
                                {item.title || item.vendor || 'Compromisso'}
                              </span>
                            {item.dueDayLabel && (
                              <span className="inline-flex items-center text-[10px] px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 font-semibold border border-blue-200">
                                {item.dueDayLabel}
                              </span>
                            )}
                            {isInst && item.installmentInfo && (
                              <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200 font-medium">
                                <CreditCard className="w-3 h-3" />
                                Parcela {item.installmentInfo.current}/{item.installmentInfo.total}
                              </span>
                            )}
                            {isRec && (
                              <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 border border-purple-200 font-medium">
                                <Repeat className="w-3 h-3" />
                                Recorrência
                              </span>
                            )}
                            {item.isEstimated && (
                              <span className="inline-flex items-center text-[10px] px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-300 font-medium">
                                Valor estimado
                              </span>
                            )}
                          </div>

                          {/* Detalhes: Data, Conta/Cartão, Categoria */}
                          <div className="flex items-center gap-2 text-xs text-[#6B7280] flex-wrap">
                            <span className="font-medium text-[#374151]">
                              Vencimento: {item.date ? new Date(item.date + 'T00:00:00').toLocaleDateString('pt-BR') : 'Data não informada'}
                            </span>
                            <span>•</span>
                            <span>{item.accountName || 'Conta não definida'}</span>
                            <span>•</span>
                            <span className="px-1.5 py-0.5 rounded bg-[#F4F5F7] text-[#4B5563] text-[11px]">
                              {item.category || 'Outros'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Valor */}
                        <div className="text-right shrink-0">
                          <span className="font-bold text-sm text-[#EF4444] block">
                            -{formatBRL(item.amount)}
                          </span>
                        </div>
                      </div>

                      {/* Ações: Visualizar / Editar e Excluir */}
                      <div className="pt-2 border-t border-[#F4F5F7] flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            const raw = item.rawTx || {
                              id: item.id,
                              type: 'expense',
                              vendor: item.vendor || item.title,
                              total: item.amount,
                              date: item.date,
                              category: item.category,
                              account_id: item.rawTx?.account_id,
                              installment_group_id: item.installmentInfo?.groupId,
                              installment_current: item.installmentInfo?.current,
                              installment_total: item.installmentInfo?.total,
                              is_recurring: isRec,
                              recurrence_frequency: item.frequency,
                            }
                            setEditingTx(raw)
                          }}
                          className="px-2.5 py-1 text-xs font-medium text-[#2F68FE] bg-[#EBF2FE] hover:bg-[#DDE9FD] rounded-lg transition-colors flex items-center gap-1.5"
                          title="Visualizar ou atualizar valor real"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                          {item.isEstimated ? 'Lançar valor real / Editar' : 'Visualizar / Editar'}
                        </button>

                        <button
                          type="button"
                          disabled={deletingCommitmentId === item.id}
                          onClick={(e) => handleDeleteCommitment(e, item.id, item.title || item.vendor)}
                          className="px-2.5 py-1 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50"
                          title="Excluir este compromisso"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          {deletingCommitmentId === item.id ? 'Excluindo…' : 'Excluir'}
                        </button>
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            {/* Rodapé do Drawer */}
            <div className="p-4 border-t border-[#EBEEF2] bg-[#F9FAFB] flex items-center justify-between gap-3">
              <button
                onClick={() => setIsUpcomingModalOpen(false)}
                className="py-2 px-4 rounded-xl border border-[#E5E7EB] bg-white text-xs font-semibold text-[#374151] hover:bg-[#F3F4F6] transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

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
