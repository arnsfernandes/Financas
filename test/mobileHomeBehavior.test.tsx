import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { DashboardTab } from '@/components/dashboard/DashboardTab'
import { CategoryDetailPanel } from '@/components/dashboard/CategoryDetailPanel'
import type { DashboardSummary } from '@/lib/queries'
import type { TransactionRecord } from '@/lib/schema'

// Mock useTelegramWebApp hook
vi.mock('@/lib/useTelegramWebApp', () => ({
  useTelegramWebApp: () => ({
    fetchWithAuth: vi.fn().mockResolvedValue({
      json: async () => ({ ok: true, transactions: [] }),
    }),
  }),
}))

describe('Mobile Home & Category Details Behavior Tests', () => {
  const mockDashboardData: DashboardSummary = {
    period: {
      type: 'month',
      label: 'Outubro de 2026',
      startDate: '2026-10-01',
      endDate: '2026-10-31',
      previousLabel: 'Setembro de 2026',
      previousStartDate: '2026-09-01',
      previousEndDate: '2026-09-30',
    },
    selectedAccountId: null,
    selectedPaymentMethod: null,
    metrics: {
      totalIncome: 1000,
      totalExpenses: 4848.64,
      balance: -3848.64,
      totalSpent: 4848.64,
      expenseTransactionCount: 4,
      incomeTransactionCount: 1,
      transactionCount: 5,
      dailyAverage: 156.4,
      activeDaysCount: 4,
      totalDaysInPeriod: 31,
      averageTicket: 1212.16,
      maxExpense: null,
      peakDay: null,
      comparison: {
        previousTotalSpent: 4000,
        previousTotalIncome: 1000,
        previousBalance: -3000,
        differenceAmount: 848.64,
        differencePercentage: 21.2,
      },
    },
    topCategories: [
      {
        category: 'Moradia',
        rawCategory: 'Moradia',
        total: 1774.99,
        percentage: 36.6,
        count: 1,
        averageTicket: 1774.99,
        previousTotal: 1700,
        differencePercentage: 4.4,
      },
      {
        category: 'Transporte',
        rawCategory: 'Transporte',
        total: 1754.97,
        percentage: 36.2,
        count: 2,
        averageTicket: 877.48,
        previousTotal: 1500,
        differencePercentage: 16.9,
      },
    ],
    topIncomeSources: [],
    topVendors: [],
    accountMetrics: [],
    recentTransactions: [
      {
        id: 'tx-ml-1',
        type: 'expense',
        vendor: 'Mercado Livre',
        total: 430.55,
        date: '2026-10-02',
        payment_method: 'Cartão de Crédito',
        category: 'Compras',
        created_at: '2026-10-02T12:48:00Z',
      },
      {
        id: 'tx-neo-2',
        type: 'expense',
        vendor: 'Neo Energia',
        total: 180.0,
        date: '2026-10-01',
        payment_method: 'PIX',
        category: 'Moradia',
        created_at: '2026-10-01T10:04:00Z',
      },
    ],
    dailyExpenses: [],
    upcomingCommitments: {
      forecastTotal30Days: 0,
      recurringTotal30Days: 0,
      installmentsTotal30Days: 0,
      upcomingRecurring: [],
      upcomingInstallments: [],
      allUpcoming: [],
    },
    forecastTotal30Days: 0,
    recurringTotal30Days: 0,
    installmentsTotal30Days: 0,
    upcomingRecurring: [],
    upcomingInstallments: [],
    allUpcoming: [],
    insights: [],
  }

  it('renders quick filter pills on Home (Tudo, Cartão, PIX, Dinheiro)', () => {
    const html = renderToStaticMarkup(
      <DashboardTab
        dashboardData={mockDashboardData}
        loadingDashboard={false}
        accounts={[]}
        periodType="month"
        handlePeriodTypeChange={vi.fn()}
        monthOffset={0}
        handleMonthNavigate={vi.fn()}
        dashboardAccountId=""
        setDashboardAccountId={vi.fn()}
        fetchDashboard={vi.fn().mockResolvedValue(undefined)}
        setFilterType={vi.fn()}
        navigateToTransactionsFiltered={vi.fn()}
      />
    )

    expect(html).toContain('Tudo')
    expect(html).toContain('Cartão')
    expect(html).toContain('PIX')
    expect(html).toContain('Dinheiro')
    expect(html).toContain('Mercado Livre')
  })

  it('proves CategoryDetailPanel only shows category expenses and no general top vendors ranking', () => {
    const sampleCategoryTxs: TransactionRecord[] = [
      {
        id: 'tx-neo-1',
        type: 'expense',
        vendor: 'Neo Energia',
        vendor_address: null,
        total: 180.0,
        date: '2026-10-01',
        payment_method: 'PIX',
        category: 'Moradia',
        created_at: '2026-10-01T10:04:00Z',
      },
    ]

    const html = renderToStaticMarkup(
      <CategoryDetailPanel
        category={mockDashboardData.topCategories[0]}
        onClose={vi.fn()}
        categoryTxList={sampleCategoryTxs}
        loadingCategoryTx={false}
        categoryTxError=""
        onEditTx={vi.fn()}
      />
    )

    expect(html).toContain('Detalhamento de Categoria')
    expect(html).toContain('Moradia')
    expect(html).toContain('Lançamentos da Categoria')
    expect(html).toContain('Neo Energia')
    expect(html).toContain('Editar')
    // Must NOT contain general/redundant top vendor ranking block
    expect(html).not.toContain('Principais Estabelecimentos')
  })
})
