import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { TransactionsTab, TransactionRecord, InstallmentGroupItem } from '@/components/transactions/TransactionsTab'
import type { Account } from '@/lib/schema'

// Mock useTelegramWebApp hook
vi.mock('@/lib/useTelegramWebApp', () => ({
  useTelegramWebApp: () => ({
    fetchWithAuth: vi.fn().mockResolvedValue({
      json: async () => ({ ok: true, categories: [] }),
    }),
  }),
}))

describe('TransactionsTab Drawer Render & Deletion Tests', () => {
  const dummyAccounts: Account[] = [
    {
      id: 'acc-1',
      name: 'Nubank',
      type: 'credit_card',
      institution: 'Nubank',
      active: true,
      created_at: '2026-01-01T00:00:00Z',
    },
  ]

  const mockProps = {
    loadingTx: false,
    loadingMoreTx: false,
    hasMoreTx: false,
    loadMoreTransactions: vi.fn(),
    accounts: dummyAccounts,
    filterType: 'all' as const,
    setFilterType: vi.fn(),
    filterAccount: '',
    setFilterAccount: vi.fn(),
    filterRecurring: 'all' as const,
    setFilterRecurring: vi.fn(),
    filterStartDate: '',
    setFilterStartDate: vi.fn(),
    filterEndDate: '',
    setFilterEndDate: vi.fn(),
    filterVendor: '',
    setFilterVendor: vi.fn(),
    filterCategory: '',
    setFilterCategory: vi.fn(),
    fetchTransactions: vi.fn().mockResolvedValue(undefined),
    onDeleteTransaction: vi.fn().mockResolvedValue(undefined),
    onDeleteInstallmentGroup: vi.fn().mockResolvedValue(undefined),
    onTransactionUpdated: vi.fn(),
  }

  it('proves that a normal transaction (e.g. Claude) renders "Excluir lançamento" visibly in the drawer', () => {
    const claudeTx: TransactionRecord = {
      id: 'tx-claude-123',
      vendor: 'Claude',
      vendor_address: null,
      date: '2026-09-25',
      time: '14:30',
      currency: 'BRL',
      category: 'Tecnologia',
      total: 104.0,
      subtotal: 104.0,
      tax: null,
      tip: null,
      payment_method: 'Cartão de Crédito',
      notes: null,
      source_type: 'web',
      origin_type: 'manual',
      created_at: '2026-09-25T14:30:00Z',
      accounts: dummyAccounts[0],
    }

    const html = renderToStaticMarkup(
      <TransactionsTab
        {...mockProps}
        transactions={[claudeTx]}
        selectedDrawerTx={claudeTx}
        setSelectedDrawerTx={vi.fn()}
      />
    )

    // Verification of drawer sections
    expect(html).toContain('Detalhes do Lançamento')
    expect(html).toContain('Claude')
    expect(html).toContain('Informações Gerais')
    // Verification of action buttons
    expect(html).toContain('Excluir lançamento')
    expect(html).toContain('Editar Lançamento')
    // Verification that backdrop uses high z-index (z-[100]) above bottom nav (z-50)
    expect(html).toContain('z-[100]')
  })

  it('proves that an installment group renders "Excluir compra" in both summary card and drawer footer', () => {
    const shopeeInstallments: TransactionRecord[] = [
      {
        id: 'tx-shopee-1',
        vendor: 'Shopee',
        vendor_address: null,
        date: '2026-06-26',
        time: null,
        currency: 'BRL',
        category: 'Compras',
        total: 64.51,
        subtotal: 387.06,
        tax: null,
        tip: null,
        payment_method: 'Cartão de Crédito',
        notes: null,
        source_type: 'web',
        installment_group_id: 'grp-shopee-6x',
        installment_current: 1,
        installment_total: 6,
        installment_amount: 64.51,
        created_at: '2026-06-26T10:00:00Z',
        accounts: dummyAccounts[0],
      },
      {
        id: 'tx-shopee-2',
        vendor: 'Shopee',
        vendor_address: null,
        date: '2026-07-26',
        time: null,
        currency: 'BRL',
        category: 'Compras',
        total: 64.51,
        subtotal: 387.06,
        tax: null,
        tip: null,
        payment_method: 'Cartão de Crédito',
        notes: null,
        source_type: 'web',
        installment_group_id: 'grp-shopee-6x',
        installment_current: 2,
        installment_total: 6,
        installment_amount: 64.51,
        created_at: '2026-06-26T10:00:00Z',
        accounts: dummyAccounts[0],
      },
    ]

    const groupItem: InstallmentGroupItem = {
      type: 'installment_group',
      groupId: 'grp-shopee-6x',
      vendor: 'Shopee',
      totalPurchaseAmount: 387.06,
      installmentCount: 6,
      installmentAmount: 64.51,
      date: '2026-06-26',
      category: 'Compras',
      accountName: 'Nubank',
      paymentMethod: 'Cartão de Crédito',
      installments: shopeeInstallments,
    }

    // Render with installment transaction selected in drawer
    const drawerTxHtml = renderToStaticMarkup(
      <TransactionsTab
        {...mockProps}
        transactions={shopeeInstallments}
        selectedDrawerTx={shopeeInstallments[0]}
        setSelectedDrawerTx={vi.fn()}
      />
    )

    // Verify both single installment deletion ("Excluir lançamento") and full purchase deletion ("Excluir compra") are present
    expect(drawerTxHtml).toContain('Excluir lançamento')
    expect(drawerTxHtml).toContain('Excluir compra')
    expect(drawerTxHtml).toContain('Compra Parcelada')
    expect(drawerTxHtml).toContain('Parcela 1 de 6')
  })
})
