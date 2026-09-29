'use client'

import { useState, useEffect, FormEvent } from 'react'
import type { Account } from '@/lib/schema'
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

export type TabType = 'dashboard' | 'transactions' | 'accounts' | 'categories' | 'new'

export default function Home() {
  const { isReady, isTelegram, fetchWithAuth, user: telegramUser, logoutWeb } = useTelegramWebApp()
  const [isWebAuthenticated, setIsWebAuthenticated] = useState<boolean | null>(null)
  const [activeTab, setActiveTab] = useState<TabType>('dashboard')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

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
  const [dashboardData, setDashboardData] = useState<any | null>(null)
  const [loadingDashboard, setLoadingDashboard] = useState(false)
  const [dashboardError, setDashboardError] = useState('')
  const [periodType, setPeriodType] = useState<'month' | 'year' | 'custom'>('month')
  const [dashboardAccountId, setDashboardAccountId] = useState<string>('')
  const [monthOffset, setMonthOffset] = useState<number>(0)
  const [customStartDate, setCustomStartDate] = useState<string>('')
  const [customEndDate, setCustomEndDate] = useState<string>('')

  async function fetchDashboard(
    overridePeriod?: 'month' | 'year' | 'custom',
    overrideOffset?: number,
    overrideStart?: string,
    overrideEnd?: string,
    overrideAccountId?: string
  ) {
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
      if (aId) params.append('accountId', aId)
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
  }

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
    isRecurring?: boolean
    recurrenceStatus?: 'active' | 'ended'
    isInstallment?: boolean
  }) {
    if (filters.startDate !== undefined) setFilterStartDate(filters.startDate || '')
    if (filters.endDate !== undefined) setFilterEndDate(filters.endDate || '')
    if (filters.vendor !== undefined) setFilterVendor(filters.vendor || '')
    if (filters.category !== undefined) setFilterCategory(filters.category || '')
    if (filters.accountId !== undefined) setFilterAccount(filters.accountId || '')
    if (filters.isRecurring !== undefined) setFilterRecurring(filters.isRecurring ? 'recurring' : 'all')
    if (filters.isInstallment !== undefined) setFilterRecurring(filters.isInstallment ? 'installment' : 'all')
    setActiveTab('transactions')
    fetchTransactions({
      startDate: filters.startDate || undefined,
      endDate: filters.endDate || undefined,
      vendor: filters.vendor || undefined,
      category: filters.category || undefined,
      accountId: filters.accountId || undefined,
      isRecurring: filters.isRecurring,
      isInstallment: filters.isInstallment,
    })
  }

  // Contas / Meios de Pagamento State
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loadingAccounts, setLoadingAccounts] = useState(false)

  async function fetchAccounts() {
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
  }

  // Transações State
  const [transactions, setTransactions] = useState<TransactionRecord[]>([])
  const [loadingTx, setLoadingTx] = useState(false)
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
  async function fetchTransactions(customFilters?: {
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
  }) {
    setLoadingTx(true)
    setTxError('')
    try {
      const params = new URLSearchParams()
      params.append('limit', '50')
      const tType = customFilters?.type !== undefined ? customFilters.type : filterType
      const rStatus = customFilters?.reviewStatus
      const aId = customFilters?.accountId !== undefined ? customFilters.accountId : filterAccount
      const rFilter = customFilters?.recurringFilter !== undefined ? customFilters.recurringFilter : filterRecurring
      const sDate = customFilters?.startDate !== undefined ? customFilters.startDate : filterStartDate
      const eDate = customFilters?.endDate !== undefined ? customFilters.endDate : filterEndDate
      const vName = customFilters?.vendor !== undefined ? customFilters.vendor : filterVendor
      const cName = customFilters?.category !== undefined ? customFilters.category : filterCategory
      const pMethod = customFilters?.paymentMethod !== undefined ? customFilters.paymentMethod : filterPaymentMethod

      if (tType && tType !== 'all') params.append('type', tType)
      if (rStatus && rStatus !== 'all') params.append('reviewStatus', rStatus)
      if (aId) params.append('accountId', aId)
      if (pMethod) params.append('paymentMethod', pMethod)
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
        setTransactions(data.transactions || [])
      } else {
        setTxError(data.error || 'Erro ao carregar transações')
      }
    } catch {
      setTxError('Erro de conexão ao carregar transações')
    } finally {
      setLoadingTx(false)
    }
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
        fetchDashboard()
      } else {
        setTxError(data.error || 'Erro ao excluir transação')
      }
    } catch {
      setTxError('Erro de conexão ao excluir transação')
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
  }, [isReady, isTelegram, isWebAuthenticated])

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
    <div className="min-h-screen bg-[#F8F9FA] text-[#111827] flex flex-col md:flex-row font-sans selection:bg-[#EBF2FF] selection:text-[#2F68FE]">
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
      />

      {/* Main Content Area */}
      <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto w-full pb-20 md:pb-8">
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
