import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { AccountsTab } from '@/components/accounts/AccountsTab'
import type { AccountWithStats } from '@/lib/queries'

// Mock Telegram hook
vi.mock('@/lib/useTelegramWebApp', () => ({
  useTelegramWebApp: () => ({
    fetchWithAuth: vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ ok: true, reserves: [], totalSaved: 0 }),
    }),
  }),
}))

const mockCard1: AccountWithStats = {
  id: 'card-1',
  name: 'Nubank Ultravioleta',
  type: 'credit_card',
  institution: 'Nubank',
  color: '#820AD1',
  closing_day: 5,
  due_day: 15,
  active: true,
  currentMonthExpenses: 1250.5,
  futureInstallmentsTotal: 3000,
  futureInstallmentsCount: 3,
  transactionCount: 15,
  totalIncome: 0,
  totalExpense: 1250.5,
  balance: 0,
}

const mockCard2: AccountWithStats = {
  id: 'card-2',
  name: 'Inter Black',
  type: 'credit_card',
  institution: 'Inter',
  color: '#FF7A00',
  closing_day: 10,
  due_day: 20,
  active: true,
  currentMonthExpenses: 840.0,
  futureInstallmentsTotal: 0,
  futureInstallmentsCount: 0,
  transactionCount: 8,
  totalIncome: 0,
  totalExpense: 840.0,
  balance: 0,
}

const mockBankAccount: AccountWithStats = {
  id: 'bank-1',
  name: 'Itaú Principal',
  type: 'bank_account',
  institution: 'Itaú',
  color: '#EC7000',
  active: true,
  currentMonthExpenses: 500,
  transactionCount: 20,
  totalIncome: 5000,
  totalExpense: 500,
  balance: 4500,
}

describe('AccountsTab mobile cleanup & multi-card carousel', () => {
  it('renders clean section titles without count badges or counters', () => {
    const html = renderToStaticMarkup(
      <AccountsTab
        accounts={[mockCard1, mockBankAccount]}
        loadingAccounts={false}
        fetchAccounts={vi.fn()}
        navigateToTransactionsFiltered={vi.fn()}
      />
    )

    // Verify Section Titles exist
    expect(html).toContain('Cartões de crédito')
    expect(html).toContain('Contas')
    expect(html).toContain('Reservas')

    // Verify absence of counter texts
    expect(html).not.toMatch(/1 cartão/i)
    expect(html).not.toMatch(/1 conta/i)
    expect(html).not.toMatch(/0 reservas/i)

    // Verify absence of segmented control buttons
    expect(html).not.toContain('>Todas<')
    expect(html).not.toContain('>Cartões<')
  })

  it('renders single credit card normally without carousel container', () => {
    const html = renderToStaticMarkup(
      <AccountsTab
        accounts={[mockCard1, mockBankAccount]}
        loadingAccounts={false}
        fetchAccounts={vi.fn()}
        navigateToTransactionsFiltered={vi.fn()}
      />
    )

    expect(html).toContain('Nubank Ultravioleta')
    expect(html).not.toContain('data-testid="credit-cards-carousel"')
  })

  it('renders multiple credit cards inside horizontal scroll carousel', () => {
    const html = renderToStaticMarkup(
      <AccountsTab
        accounts={[mockCard1, mockCard2, mockBankAccount]}
        loadingAccounts={false}
        fetchAccounts={vi.fn()}
        navigateToTransactionsFiltered={vi.fn()}
      />
    )

    expect(html).toContain('data-testid="credit-cards-carousel"')
    expect(html).toContain('overflow-x-auto')
    expect(html).toContain('snap-x')
    expect(html).toContain('Nubank Ultravioleta')
    expect(html).toContain('Inter Black')
  })

  it('renders compact list for bank accounts and credit cards', () => {
    const html = renderToStaticMarkup(
      <AccountsTab
        accounts={[mockCard1, mockBankAccount]}
        loadingAccounts={false}
        fetchAccounts={vi.fn()}
        navigateToTransactionsFiltered={vi.fn()}
      />
    )

    expect(html).toContain('Itaú Principal')
    expect(html).toContain('Nubank Ultravioleta')
  })
})
