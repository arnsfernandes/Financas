'use client'

import { useState, useEffect, useCallback, FormEvent } from 'react'
import type { Account } from '@/lib/schema'
import type { DashboardSummary } from '@/lib/queries'
import { Sidebar } from '@/components/layout/Sidebar'
import { MobileHeader } from '@/components/layout/MobileHeader'
import { TelegramMiniAppNav } from '@/components/layout/TelegramMiniAppNav'
import { useTelegramWebApp } from '@/lib/useTelegramWebApp'
import { WebLoginScreen } from '@/components/auth/WebLoginScreen'
import { DashboardTab } from '@/components/dashboard/DashboardTab'
import { NewLaunchTab } from '@/components/launch/NewLaunchTab'
import {
  TransactionsTab,
  type TransactionRecord,
} from '@/components/transactions/TransactionsTab'
import { AccountsTab } from '@/components/accounts/AccountsTab'
import { CategoriesTab } from '@/components/categories/CategoriesTab'
import { AssistantFloatingWidget } from '@/components/ui/AssistantFloatingWidget'
import { ShortcutsTokenModal } from '@/components/modals/ShortcutsTokenModal'
import { usePwaPushPrompt } from '@/lib/usePwaPush'

export type TabType = 'dashboard' | 'transactions' | 'accounts' | 'categories' | 'new'

const TAB_TITLES: Record<TabType, string> = {
  dashboard: 'Visão Geral',
  transactions: 'Extrato de Lançamentos',
  accounts: 'Contas e Cartões',
  categories: 'Categorias',
  new: 'Novo Lançamento',
}

export default function Home() {
  const { isReady, isTelegram, fetchWithAuth, user: telegramUser, logoutWeb } = useTelegramWebApp()
  const [isWebAuthenticated, setIsWebAuthenticated] = useState<boolean | null>(null)
  const [activeTab, setActiveTab] = useState<TabType>('dashboard')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [shortcutsModalOpen, setShortcutsModalOpen] = useState(false)
  const [initialCardId, setInitialCardId] = useState<string | null>(null)
  const [initialDueDate, setInitialDueDate] = useState<string | null>(null)

  // Hook Web Push notification prompt (solicitação única por gesto do usuário após abrir o PWA)
  usePwaPushPrompt(Boolean(isWebAuthenticated))

  // Checa URL search params para atalhos e deep links de notificações PWA
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      const tabParam = params.get('tab') as TabType | null
      const cardIdParam = params.get('cardId')
      const dueDateParam = params.get('dueDate')
      const txIdParam = params.get('txId')

      if (tabParam && ['dashboard', 'transactions', 'accounts', 'categories', 'new'].includes(tabParam)) {
        setActiveTab(tabParam)
      } else if (cardIdParam) {
        setActiveTab('accounts')
      } else if (txIdParam) {
        setActiveTab('transactions')
      }

      if (cardIdParam) {
        setInitialCardId(cardIdParam)
        if (dueDateParam) setInitialDueDate(dueDateParam)
      }

      if (txIdParam) {
        // Tenta buscar a transação diretamente para abrir o detalhe
        fetchWithAuth(`/api/transactions/${txIdParam}`)
          .then((res) => res.json())
          .then((data) => {
            if (data.ok && data.transaction) {
              setSelectedDrawerTx(data.transaction)
            }
          })
          .catch(() => {
            // Fallback: se a transação foi excluída ou não existe mais, permanece na listagem de transações
          })
      }
    }
  }, [fetchWithAuth])

  // Checa autenticação inicial para navegação web direta
  useEffect(() => {
    async function checkAuth() {
      if (!isReady) return
      if (isTelegram) {
        setIsWebAuthenticated(true)
        return
      }
      try {
        const res = await fetch('/api/auth/me')
        const data = await res.json()
        if (data.ok && data.authenticated) {
          setIsWebAuthenticated(true)
        } else {
          // Se for ambiente de desenvolvimento local, testar se a rota passa
          const testRes = await fetch('/api/dashboard?period=month')
          if (testRes.status === 401) {
            setIsWebAuthenticated(false)
          } else {
            setIsWebAuthenticated(true)
          }
        }
      } catch {
        setIsWebAuthenticated(false)
      }
    }
    checkAuth()
  }, [isReady, isTelegram])

  // Dashboard / Period State (compartilhado com Contas, Relatórios e Exportação)
  const [dashboardData, setDashboardData] = useState<DashboardSummary | null>(null)
  const [loadingDashboard, setLoadingDashboard] = useState(false)
  const [dashboardError, setDashboardError] = useState('')
  const [periodType, setPeriodType] = useState<'month' | 'year' | 'custom'>('month')
  const [dashboardAccountId, setDashboardAccountId] = useState<string>('')
  const [monthOffset, setMonthOffset] = useState<number>(0)
  const [customStartDate, setCustomStartDate] = useState<string>('')
  const [customEndDate, setCustomEndDate] = useState<string>('')

  const fetchDashboard = useCallback(async (
    overridePeriod?: 'month' | 'year' | 'custom',
    overrideOffset?: number,
    overrideStart?: string,
    overrideEnd?: string,
    overrideAccountId?: string,
    overridePaymentMethod?: string
  ) => {
    setLoadingDashboard(true)
    setDashboardError('')
    try {
      const pType = overridePeriod !== undefined ? overridePeriod : periodType
      const mOffset = overrideOffset !== undefined ? overrideOffset : monthOffset
      const sDate = overrideStart !== undefined ? overrideStart : customStartDate
      const eDate = overrideEnd !== undefined ? overrideEnd : customEndDate
      const aId = overrideAccountId !== undefined ? overrideAccountId : dashboardAccountId

      const params = new URLSearchParams()
      params.append('period', pType)
      params.append('monthOffset', String(mOffset))
      if (overridePaymentMethod) {
        params.append('paymentMethod', overridePaymentMethod)
      } else if (aId === 'pix') {
        params.append('paymentMethod', 'PIX')
      } else if (aId) {
        params.append('accountId', aId)
      }
      if (sDate) params.append('startDate', sDate)
      if (eDate) params.append('endDate', eDate)
      params.append('_t', String(Date.now()))

      const res = await fetchWithAuth(`/api/dashboard?${params.toString()}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
      })
      const data = await res.json()
      if (data.ok) {
        setDashboardData(data.summary)
      } else {
        setDashboardError(data.error || 'Erro ao carregar resumo do painel')
      }
    } catch {
      setDashboardError('Erro de conexão ao carregar painel')
    } finally {
      setLoadingDashboard(false)
    }
  }, [fetchWithAuth, periodType, monthOffset, customStartDate, customEndDate, dashboardAccountId])

  function handlePeriodTypeChange(newPeriod: 'month' | 'year' | 'custom' | string) {
    const validPeriod = (newPeriod === 'year' || newPeriod === 'custom') ? newPeriod : 'month'
    setPeriodType(validPeriod)
    setMonthOffset(0)
    fetchDashboard(validPeriod, 0)
  }

  function handleMonthNavigate(delta: number) {
    const newOffset = monthOffset + delta
    setMonthOffset(newOffset)
    fetchDashboard(periodType, newOffset)
  }

  function handleApplyCustomPeriod(e: FormEvent) {
    e.preventDefault()
    fetchDashboard('custom', 0, customStartDate, customEndDate)
  }

  // Navegar do Dashboard/Relatórios/Contas para Transações com Filtro
  function navigateToTransactionsFiltered(filters: {
    startDate?: string | null
    endDate?: string | null
    vendor?: string | null
    category?: string | null
    accountId?: string | null
    paymentMethod?: string | null
    isRecurring?: boolean
    recurrenceStatus?: 'active' | 'ended'
    isInstallment?: boolean
  }) {
    if (filters.startDate !== undefined) setFilterStartDate(filters.startDate || '')
    if (filters.endDate !== undefined) setFilterEndDate(filters.endDate || '')
    if (filters.vendor !== undefined) setFilterVendor(filters.vendor || '')
    if (filters.category !== undefined) setFilterCategory(filters.category || '')
    if (filters.accountId !== undefined) setFilterAccount(filters.accountId || '')
    if (filters.paymentMethod !== undefined) setFilterPaymentMethod(filters.paymentMethod || '')
    if (filters.isRecurring !== undefined) setFilterRecurring(filters.isRecurring ? 'recurring' : 'all')
    if (filters.isInstallment !== undefined) setFilterRecurring(filters.isInstallment ? 'installment' : 'all')
    setActiveTab('transactions')
    fetchTransactions({
      startDate: filters.startDate || undefined,
      endDate: filters.endDate || undefined,
      vendor: filters.vendor || undefined,
      category: filters.category || undefined,
      accountId: filters.accountId || undefined,
      paymentMethod: filters.paymentMethod || undefined,
      isRecurring: filters.isRecurring,
      isInstallment: filters.isInstallment,
    })
  }

  // Contas / Meios de Pagamento State
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loadingAccounts, setLoadingAccounts] = useState(false)

  const fetchAccounts = useCallback(async () => {
    setLoadingAccounts(true)
    try {
      const res = await fetchWithAuth(`/api/accounts?_t=${Date.now()}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
      })
      const data = await res.json()
      if (data.ok && Array.isArray(data.accounts)) {
        setAccounts(data.accounts)
      }
    } catch (e) {
      console.error('Erro ao carregar contas:', e)
    } finally {
      setLoadingAccounts(false)
    }
  }, [fetchWithAuth])

  // Transações State
  const [transactions, setTransactions] = useState<TransactionRecord[]>([])
  const [loadingTx, setLoadingTx] = useState(false)
  const [loadingMoreTx, setLoadingMoreTx] = useState(false)
  const [hasMoreTx, setHasMoreTx] = useState(false)
  const [txError, setTxError] = useState('')
  const [selectedDrawerTx, setSelectedDrawerTx] = useState<TransactionRecord | null>(null)

  // Filtros Globais Compartilhados (usados por navegação cruzada para Transações)
  const [filterType, setFilterType] = useState<'all' | 'expense' | 'income'>('all')
  const [filterAccount, setFilterAccount] = useState<string>('')
  const [filterRecurring, setFilterRecurring] = useState<'all' | 'recurring' | 'installment'>('all')
  const [filterVendor, setFilterVendor] = useState('')
  const [filterStartDate, setFilterStartDate] = useState('')
  const [filterEndDate, setFilterEndDate] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [filterPaymentMethod, setFilterPaymentMethod] = useState('')

  // Carregar transações
  const fetchTransactions = useCallback(async (
    customFilters?: {
      type?: 'all' | 'expense' | 'income'
      reviewStatus?: 'all' | 'needs_review' | 'confirmed'
      accountId?: string
      paymentMethod?: string
      recurringFilter?: 'all' | 'recurring' | 'installment'
      isRecurring?: boolean
      isInstallment?: boolean
      startDate?: string
      endDate?: string
      vendor?: string
      category?: string
      search?: string
    },
    isLoadMore = false
  ) => {
    if (isLoadMore) {
      setLoadingMoreTx(true)
    } else {
      setLoadingTx(true)
    }
    setTxError('')
    try {
      const params = new URLSearchParams()
      params.append('limit', '50')
      if (isLoadMore) {
        params.append('offset', String(transactions.length))
      }
      const tType = customFilters?.type !== undefined ? customFilters.type : filterType
      const rStatus = customFilters?.reviewStatus
      const aId = customFilters?.accountId !== undefined ? customFilters.accountId : filterAccount
      const rFilter = customFilters?.recurringFilter !== undefined ? customFilters.recurringFilter : filterRecurring
      const sDate = customFilters?.startDate !== undefined ? customFilters.startDate : filterStartDate
      const eDate = customFilters?.endDate !== undefined ? customFilters.endDate : filterEndDate
      const vName = customFilters?.vendor !== undefined ? customFilters.vendor : filterVendor
      const cName = customFilters?.category !== undefined ? customFilters.category : filterCategory
      const pMethod = customFilters?.paymentMethod !== undefined ? customFilters.paymentMethod : filterPaymentMethod
      const sTerm = customFilters?.search !== undefined ? customFilters.search : undefined

      if (tType && tType !== 'all') params.append('type', tType)
      if (rStatus && rStatus !== 'all') params.append('reviewStatus', rStatus)
      if (aId) params.append('accountId', aId)
      if (pMethod) params.append('paymentMethod', pMethod)
      if (sTerm) params.append('search', sTerm)
      if (customFilters?.isRecurring !== undefined) {
        params.append('isRecurring', String(customFilters.isRecurring))
      } else if (rFilter === 'recurring') {
        params.append('isRecurring', 'true')
      }
      if (customFilters?.isInstallment !== undefined) {
        params.append('isInstallment', String(customFilters.isInstallment))
      } else if (rFilter === 'installment') {
        params.append('isInstallment', 'true')
      }
      if (sDate) params.append('startDate', sDate)
      if (eDate) params.append('endDate', eDate)
      if (vName) params.append('vendor', vName)
      if (cName) params.append('category', cName)
      params.append('_t', String(Date.now()))

      const res = await fetchWithAuth(`/api/transactions?${params.toString()}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
      })
      const data = await res.json()
      if (data.ok) {
        const fetched = data.transactions || []
        if (isLoadMore) {
          setTransactions((prev) => {
            const existingIds = new Set(prev.map((t) => t.id))
            const uniqueNew = fetched.filter((t: TransactionRecord) => !existingIds.has(t.id))
            return [...prev, ...uniqueNew]
          })
        } else {
          setTransactions(fetched)
        }
        setHasMoreTx(Boolean(data.has_more))
      } else {
        setTxError(data.error || 'Erro ao carregar transações')
      }
    } catch {
      setTxError('Erro de conexão ao carregar transações')
    } finally {
      if (isLoadMore) {
        setLoadingMoreTx(false)
      } else {
        setLoadingTx(false)
      }
    }
  }, [fetchWithAuth, filterType, filterAccount, filterRecurring, filterStartDate, filterEndDate, filterVendor, filterCategory, filterPaymentMethod, transactions.length])

  async function loadMoreTransactions() {
    if (loadingMoreTx || !hasMoreTx) return
    await fetchTransactions(undefined, true)
  }

  // Excluir transação
  async function handleDeleteTransaction(id: string) {
    setTxError('')
    try {
      const res = await fetchWithAuth(`/api/transactions/${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.ok) {
        setTransactions((prev) => prev.filter((t) => t.id !== id))
        if (selectedDrawerTx?.id === id) setSelectedDrawerTx(null)
        await Promise.all([
          fetchDashboard(periodType, monthOffset),
          fetchAccounts(),
        ])
      } else {
        const msg = data.error || 'Erro ao excluir transação'
        setTxError(msg)
        throw new Error(msg)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro de conexão ao excluir transação'
      setTxError(msg)
      throw new Error(msg)
    }
  }

  // Excluir compra parcelada completa (todas as parcelas do grupo)
  async function handleDeleteInstallmentGroup(groupId: string) {
    setTxError('')
    try {
      const res = await fetchWithAuth(`/api/transactions/installments/${groupId}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.ok) {
        setTransactions((prev) => prev.filter((t) => t.installment_group_id !== groupId))
        if (selectedDrawerTx?.installment_group_id === groupId) {
          setSelectedDrawerTx(null)
        }
        await Promise.all([
          fetchDashboard(periodType, monthOffset),
          fetchAccounts(),
        ])
      } else {
        const msg = data.error || 'Erro ao excluir compra parcelada'
        setTxError(msg)
        throw new Error(msg)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro de conexão ao excluir compra parcelada'
      setTxError(msg)
      throw new Error(msg)
    }
  }

  async function handleSaveSuccess() {
    await Promise.all([
      fetchDashboard(periodType, monthOffset),
      fetchTransactions(),
      fetchAccounts(),
    ])
  }

  useEffect(() => {
    if (isReady && (isTelegram || isWebAuthenticated === true)) {
      fetchDashboard()
      fetchTransactions()
      fetchAccounts()
    }
  }, [isReady, isTelegram, isWebAuthenticated, fetchDashboard, fetchTransactions, fetchAccounts])

  // Estado para inicialização contextual de Novo Lançamento
  const [newLaunchInitialType, setNewLaunchInitialType] = useState<'expense' | 'income'>('expense')
  const [newLaunchInitialMode, setNewLaunchInitialMode] = useState<'text' | 'image' | 'manual'>('text')

  // Se não estiver dentro do Telegram e não estiver autenticado na Web, exibe a tela de login
  if (isReady && !isTelegram && isWebAuthenticated === false) {
    return (
      <WebLoginScreen
        onLoginSuccess={() => {
          setIsWebAuthenticated(true)
          fetchDashboard()
          fetchTransactions()
          fetchAccounts()
        }}
      />
    )
  }

  return (
    <div className="min-h-screen bg-[#F4F6F9] text-[#0F172A] flex flex-col md:flex-row font-sans selection:bg-[#3B82F6]/20 selection:text-[#0F172A]">
      {/* Mobile Top Header */}
      <MobileHeader
        setActiveTab={(tab) => {
          if (tab === 'new') {
            setNewLaunchInitialType('expense')
            setNewLaunchInitialMode('text')
          }
          if (tab === 'dashboard') fetchDashboard()
          if (tab === 'transactions') fetchTransactions()
          if (tab === 'accounts') {
            fetchAccounts()
            fetchDashboard()
          }
          setActiveTab(tab)
        }}
        mobileMenuOpen={mobileMenuOpen}
        setMobileMenuOpen={setMobileMenuOpen}
        activeTabTitle={TAB_TITLES[activeTab]}
      />

      {/* Desktop & Mobile Sidebar */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={(tab) => {
          if (tab === 'new') {
            setNewLaunchInitialType('expense')
            setNewLaunchInitialMode('text')
          }
          setActiveTab(tab)
        }}
        mobileMenuOpen={mobileMenuOpen}
        setMobileMenuOpen={setMobileMenuOpen}
        transactionsCount={transactions.length}
        onNavigateTab={(tab) => {
          if (tab === 'dashboard') fetchDashboard()
          if (tab === 'transactions') fetchTransactions()
          if (tab === 'accounts') {
            fetchAccounts()
            fetchDashboard()
          }
        }}
        onOpenShortcutsModal={() => setShortcutsModalOpen(true)}
      />

      {/* Main Content Area */}
      <main className="flex-1 min-w-0 px-4 sm:px-6 lg:px-8 pt-2 sm:pt-6 pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))] md:pb-8 max-w-6xl mx-auto w-full">
        {/* ÁREA 0: DASHBOARD / VISÃO GERAL */}
        {activeTab === 'dashboard' && (
          <DashboardTab
            dashboardData={dashboardData}
            loadingDashboard={loadingDashboard}
            dashboardError={dashboardError}
            accounts={accounts}
            periodType={periodType}
            handlePeriodTypeChange={handlePeriodTypeChange}
            monthOffset={monthOffset}
            handleMonthNavigate={handleMonthNavigate}
            customStartDate={customStartDate}
            setCustomStartDate={setCustomStartDate}
            customEndDate={customEndDate}
            setCustomEndDate={setCustomEndDate}
            handleApplyCustomPeriod={handleApplyCustomPeriod}
            dashboardAccountId={dashboardAccountId}
            setDashboardAccountId={setDashboardAccountId}
            fetchDashboard={fetchDashboard}
            setFilterType={setFilterType}
            navigateToTransactionsFiltered={navigateToTransactionsFiltered}
            onOpenNewLaunch={(type) => {
              setNewLaunchInitialType(type)
              setNewLaunchInitialMode('manual')
              setActiveTab('new')
            }}
            onNavigateToCategories={() => {
              setActiveTab('categories')
            }}
            onTransactionUpdated={(updatedTx) => {
              setTransactions((prev) =>
                prev.map((t) => (t.id === updatedTx.id ? updatedTx : t))
              )
              fetchDashboard()
            }}
            onDeleteTransaction={async (id) => {
              await handleDeleteTransaction(id)
            }}
          />
        )}

        {/* ÁREA 1: NOVO LANÇAMENTO (2 ESTADOS PROGRESSIVOS) */}
        {activeTab === 'new' && (
          <NewLaunchTab
            key={`${newLaunchInitialType}-${newLaunchInitialMode}`}
            accounts={accounts}
            initialType={newLaunchInitialType}
            initialMode={newLaunchInitialMode}
            onSaveSuccess={handleSaveSuccess}
          />
        )}

        {/* ÁREA 2: TRANSAÇÕES SALVAS */}
        {activeTab === 'transactions' && (
          <TransactionsTab
            transactions={transactions}
            loadingTx={loadingTx}
            loadingMoreTx={loadingMoreTx}
            hasMoreTx={hasMoreTx}
            loadMoreTransactions={loadMoreTransactions}
            txError={txError}
            accounts={accounts}
            selectedDrawerTx={selectedDrawerTx}
            setSelectedDrawerTx={setSelectedDrawerTx}
            filterType={filterType}
            setFilterType={setFilterType}
            filterAccount={filterAccount}
            setFilterAccount={setFilterAccount}
            filterRecurring={filterRecurring}
            setFilterRecurring={setFilterRecurring}
            filterStartDate={filterStartDate}
            setFilterStartDate={setFilterStartDate}
            filterEndDate={filterEndDate}
            setFilterEndDate={setFilterEndDate}
            filterVendor={filterVendor}
            setFilterVendor={setFilterVendor}
            filterCategory={filterCategory}
            setFilterCategory={setFilterCategory}
            filterPaymentMethod={filterPaymentMethod}
            setFilterPaymentMethod={setFilterPaymentMethod}
            fetchTransactions={fetchTransactions}
            onDeleteTransaction={async (id) => {
              await handleDeleteTransaction(id)
            }}
            onDeleteInstallmentGroup={async (groupId) => {
              await handleDeleteInstallmentGroup(groupId)
            }}
            onTransactionUpdated={(updatedTx) => {
              setTransactions((prev) =>
                prev.map((t) => (t.id === updatedTx.id ? updatedTx : t))
              )
              fetchDashboard()
            }}
          />
        )}

        {/* ÁREA: CONTAS E CARTÕES */}
        {activeTab === 'accounts' && (
          <AccountsTab
            accounts={accounts}
            loadingAccounts={loadingAccounts}
            fetchAccounts={fetchAccounts}
            navigateToTransactionsFiltered={navigateToTransactionsFiltered}
            initialCardId={initialCardId}
            initialDueDate={initialDueDate}
            onClearInitialCard={() => {
              setInitialCardId(null)
              setInitialDueDate(null)
            }}
          />
        )}

        {/* ÁREA: CATEGORIAS */}
        {activeTab === 'categories' && (
          <CategoriesTab
            periodData={{
              startDate: dashboardData?.period?.startDate,
              endDate: dashboardData?.period?.endDate,
              label: dashboardData?.period?.label,
            }}
            onCategorySelect={(categoryId, categoryName, type) => {
              setFilterType(type)
              navigateToTransactionsFiltered({
                category: categoryName,
                startDate: dashboardData?.period?.startDate,
                endDate: dashboardData?.period?.endDate,
              })
            }}
          />
        )}
      </main>

      {/* Modal de Token e Configuração de Atalhos / Siri do iOS */}
      <ShortcutsTokenModal
        isOpen={shortcutsModalOpen}
        onClose={() => setShortcutsModalOpen(false)}
      />

      {/* Assistente Financeiro Flutuante */}
      <AssistantFloatingWidget />

      {/* Telegram Mini App & Mobile Bottom Navigation */}
      <TelegramMiniAppNav
        activeTab={activeTab}
        transactionsCount={transactions.length}
        onSelectTab={(tab) => {
          if (tab === 'new') {
            setNewLaunchInitialType('expense')
            setNewLaunchInitialMode('text')
          }
          if (tab === 'dashboard') fetchDashboard()
          if (tab === 'transactions') fetchTransactions()
          if (tab === 'accounts') {
            fetchAccounts()
            fetchDashboard()
          }
          setActiveTab(tab)
        }}
      />
    </div>
  )
}
