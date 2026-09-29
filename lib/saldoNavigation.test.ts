import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  renderSaldoScreen,
  renderSaldoAccountsScreen,
  renderSaldoInvoicesScreen,
  renderSaldoInvoiceDetailScreen,
  renderSaldoInvoiceTransactionsScreen,
  renderSaldoInvoiceCategoriesScreen,
  renderSaldoDueDatesScreen,
} from './saldoNavigation'
import { navigationRegistry, decodeNavCallback, encodeNavCallback } from './navigation'
import * as queries from './queries'
import { formatBRL } from './formatters'
import type { Account } from './schema'

describe('Deterministic /saldo Inline Navigation Flow (lib/saldoNavigation.ts)', () => {
  const mockAccounts: Account[] = [
    {
      id: 'acc_nubank',
      name: 'Nubank Conta',
      type: 'checking',
      institution: 'Nubank',
      active: true,
    },
    {
      id: 'acc_inter_card',
      name: 'Cartão Inter',
      type: 'credit_card',
      institution: 'Inter',
      closing_day: 5,
      due_day: 15,
      active: true,
    },
    {
      id: 'acc_wallet',
      name: 'Carteira Física',
      type: 'cash',
      active: true,
    },
  ]

  const mockSummary = {
    period: { label: 'Setembro de 2026', startDate: '2026-09-01', endDate: '2026-09-30' },
    metrics: {
      balance: 1500,
      totalIncome: 3000,
      totalExpenses: 1500,
      totalSpent: 1500,
      transactionCount: 12,
      expenseTransactionCount: 10,
      incomeTransactionCount: 2,
      dailyAverage: 50,
      averageTicket: 150,
    },
    accountMetrics: [
      { id: 'acc_nubank', balance: 2000, totalExpenses: 500, totalIncome: 2500, transactionCount: 5 },
      { id: 'acc_inter_card', balance: -800, totalExpenses: 800, totalIncome: 0, transactionCount: 6 },
      { id: 'acc_wallet', balance: 300, totalExpenses: 200, totalIncome: 500, transactionCount: 1 },
    ],
    upcomingCommitments: {
      invoices: [],
      recurring: [],
      allUpcoming: [
        { id: 'up_1', type: 'invoice', description: 'Fatura Cartão Inter', amount: 800, date: '2026-10-15' },
        { id: 'up_2', type: 'recurring', description: 'Spotify', amount: 34.9, date: '2026-10-05' },
      ],
    },
  }

  const mockTransactionsResponse = {
    transactions: [
      {
        id: 'tx_1',
        type: 'expense',
        vendor: 'Supermercado Pão de Açúcar',
        total: 250,
        date: '2026-09-12',
        category: 'Mercado',
        payment_method: 'Cartão de Crédito',
        account_id: 'acc_inter_card',
      },
      {
        id: 'tx_2',
        type: 'expense',
        vendor: 'Restaurante Sabor',
        total: 85,
        date: '2026-09-15',
        category: 'Alimentação',
        payment_method: 'Cartão de Crédito',
        account_id: 'acc_inter_card',
      },
    ],
    total_count: 2,
    total_amount: 335,
  }

  beforeEach(() => {
    vi.spyOn(queries, 'listAccounts').mockResolvedValue(mockAccounts)
    vi.spyOn(queries, 'getDashboardSummary').mockResolvedValue(mockSummary as any)
    vi.spyOn(queries, 'listTransactions').mockResolvedValue(mockTransactionsResponse as any)
  })

  it('renders main /saldo screen as a compact summary without individual accounts', async () => {
    const screen = await renderSaldoScreen({}, {})
    expect(screen.text).toContain('Resumo Financeiro')
    expect(screen.text).toContain('Setembro de 2026')
    expect(screen.text).toContain('Saldo Disponível')
    expect(screen.text).toContain('2.300,00') // 2000 (Nubank) + 300 (Carteira)
    expect(screen.text).toContain('Faturas de Cartão (mês)')
    expect(screen.text).toContain('800,00') // Fatura Inter
    expect(screen.text).toContain('Saldo Geral do Período')
    expect(screen.text).toContain('1.500,00')
    // Does NOT list individual accounts in the main summary
    expect(screen.text).not.toContain('Nubank Conta')
    expect(screen.text).not.toContain('Cartão Inter')
    expect(screen.text).not.toContain('Toque nos botões abaixo para ver os detalhes:')
    expect(screen.keyboard).toBeDefined()

    const buttonTexts = screen.keyboard?.inline_keyboard.flat().map((btn) => btn.text)
    expect(buttonTexts).toContain('📊 Gastos')
    expect(buttonTexts).toContain('📅 Vencimentos')
    expect(buttonTexts).not.toContain('📅 Próximos Vencimentos')

    const buttonCallbacks = screen.keyboard?.inline_keyboard.flat().map((btn) => btn.callback_data)
    expect(buttonCallbacks).toContain('nav:saldo_accounts:view')
    expect(buttonCallbacks).toContain('nav:saldo_invoices:view')
    expect(buttonCallbacks).toContain('nav:gastos:view')
    expect(buttonCallbacks).toContain('nav:saldo_due_dates:view')
    expect(buttonCallbacks).toContain('nav:saldo:view')
  })

  it('renders detailed accounts screen (saldo_accounts) without redundant type labels', async () => {
    const screen = await renderSaldoAccountsScreen({}, {})
    expect(screen.text).toContain('Contas & Carteiras')
    expect(screen.text).toContain('Nubank Conta')
    expect(screen.text).toContain('Carteira Física')
    expect(screen.text).not.toContain('Tipo: checking')
    expect(screen.text).not.toContain('Tipo: Conta Bancária')
    expect(screen.text).not.toContain('Cartão Inter') // Filtered out credit cards

    const backButton = screen.keyboard?.inline_keyboard.flat().find((b) => b.text.includes('Voltar'))
    expect(backButton).toBeDefined()
    expect(backButton?.callback_data).toBe('nav:saldo:view')
  })

  it('renders detailed invoices list screen (saldo_invoices) with buttons to detail each invoice', async () => {
    const screen = await renderSaldoInvoicesScreen({}, {})
    expect(screen.text).toContain('Faturas de Cartão')
    expect(screen.text).toContain('Cartão Inter')
    expect(screen.text).toContain('800,00')
    expect(screen.text).not.toContain('Tipo: Cartão de Crédito')
    expect(screen.text).not.toContain('Nubank Conta')

    const buttonTexts = screen.keyboard?.inline_keyboard.flat().map((b) => b.text)
    expect(buttonTexts).toContain('🧾 Detalhar Cartão Inter')

    const detailBtn = screen.keyboard?.inline_keyboard.flat().find((b) => b.text.includes('Detalhar'))
    expect(detailBtn?.callback_data).toBe('nav:saldo_invoice_detail:view:i=0;m=0')

    const backButton = screen.keyboard?.inline_keyboard.flat().find((b) => b.text.includes('Voltar'))
    expect(backButton).toBeDefined()
    expect(backButton?.callback_data).toBe('nav:saldo:view')
  })

  it('renders invoice detail screen (saldo_invoice_detail) with total, closing, due, purchases count, and actions', async () => {
    const screen = await renderSaldoInvoiceDetailScreen({ i: '0', m: '0' }, {})
    expect(screen.text).toContain('Fatura Cartão Inter')
    expect(screen.text).toContain('Valor Total:')
    expect(screen.text).toContain(`${formatBRL(335)}`)
    expect(screen.text).toContain('Fechamento:')
    expect(screen.text).toContain('Vencimento:')
    expect(screen.text).toContain('Quantidade de Compras:')
    expect(screen.text).toContain('2 compras')

    const buttonTexts = screen.keyboard?.inline_keyboard.flat().map((b) => b.text)
    expect(buttonTexts).toContain('🧾 Compras')
    expect(buttonTexts).toContain('📁 Categorias')
    expect(buttonTexts).toContain('◀️ Anterior')
    expect(buttonTexts).toContain('Próxima ▶️')
    expect(buttonTexts).toContain('⬅️ Voltar')

    const backButton = screen.keyboard?.inline_keyboard.flat().find((b) => b.text.includes('Voltar'))
    expect(backButton?.callback_data).toBe('nav:saldo_invoices:view')

    const prevBtn = screen.keyboard?.inline_keyboard.flat().find((b) => b.text.includes('Anterior'))
    expect(prevBtn?.callback_data).toBe('nav:saldo_invoice_detail:view:i=0;m=-1')

    const nextBtn = screen.keyboard?.inline_keyboard.flat().find((b) => b.text.includes('Próxima'))
    expect(nextBtn?.callback_data).toBe('nav:saldo_invoice_detail:view:i=0;m=1')
  })

  it('renders invoice purchases screen (saldo_invoice_txs) in compact statement format', async () => {
    const screen = await renderSaldoInvoiceTransactionsScreen({ i: '0', m: '0' }, {})
    expect(screen.text).toContain('Compras — Cartão Inter')
    expect(screen.text).toContain('12/09  Supermercado Pão de Açúcar')
    expect(screen.text).toContain(`${formatBRL(250)} • Mercado`)
    expect(screen.text).toContain('15/09  Restaurante Sabor')
    expect(screen.text).toContain(`${formatBRL(85)} • Alimentação`)
    expect(screen.text).toContain('2 compras')

    const backButton = screen.keyboard?.inline_keyboard.flat().find((b) => b.text.includes('Voltar'))
    expect(backButton?.callback_data).toBe('nav:saldo_invoice_detail:view:i=0;m=0')
  })

  it('renders invoice categories screen (saldo_invoice_cats) with breakdown', async () => {
    const screen = await renderSaldoInvoiceCategoriesScreen({ i: '0', m: '0' }, {})
    expect(screen.text).toContain('Categorias — Cartão Inter')
    expect(screen.text).toContain('Mercado')
    expect(screen.text).toContain(`${formatBRL(250)} • 74.6% • 1 lançamento`)
    expect(screen.text).toContain('Alimentação')
    expect(screen.text).toContain(`${formatBRL(85)} • 25.4% • 1 lançamento`)
    expect(screen.text).toContain(`Total da Fatura:</b> <b>${formatBRL(335)}`)

    const backButton = screen.keyboard?.inline_keyboard.flat().find((b) => b.text.includes('Voltar'))
    expect(backButton?.callback_data).toBe('nav:saldo_invoice_detail:view:i=0;m=0')
  })

  it('renders upcoming commitments screen (saldo_due_dates) grouped by date with total and invoice button', async () => {
    // Setup multiple commitments, including two on the same date (15/10)
    const testSummary = {
      ...mockSummary,
      upcomingCommitments: {
        allUpcoming: [
          { id: 'up_1', type: 'recurring', description: 'Spotify', amount: 34.9, date: '2026-10-05' },
          { id: 'up_2', type: 'invoice', description: 'Fatura Banco Inter', amount: 170.92, date: '2026-10-15' },
          { id: 'up_3', type: 'invoice', description: 'Fatura Cartão de Crédito', amount: 100, date: '2026-10-15' },
        ],
      },
    }
    vi.spyOn(queries, 'getDashboardSummary').mockResolvedValue(testSummary as any)

    const screen = await renderSaldoDueDatesScreen({}, {})
    expect(screen.text).toContain('Próximos Vencimentos')
    // Compact agenda format grouped by date:
    expect(screen.text).toContain('<b>05/10</b>\nSpotify — <b>R$ 34,90</b>')
    expect(screen.text).toContain('<b>15/10</b>\nFatura Banco Inter — <b>R$ 170,92</b>\nFatura Cartão de Crédito — <b>R$ 100,00</b>')
    expect(screen.text).toContain('Total Previsto:</b> <b>R$ 305,82</b>')

    // Date header "15/10" should appear only once
    const occurrences = (screen.text.match(/<b>15\/10<\/b>/g) || []).length
    expect(occurrences).toBe(1)

    const buttonTexts = screen.keyboard?.inline_keyboard.flat().map((b) => b.text)
    expect(buttonTexts).toContain('💳 Ver faturas')
    expect(buttonTexts).toContain('⬅️ Voltar')
    expect(buttonTexts).toContain('🔄 Atualizar')

    const verFaturasBtn = screen.keyboard?.inline_keyboard.flat().find((b) => b.text.includes('Ver faturas'))
    expect(verFaturasBtn?.callback_data).toBe('nav:saldo_invoices:view')

    const backButton = screen.keyboard?.inline_keyboard.flat().find((b) => b.text.includes('Voltar'))
    expect(backButton?.callback_data).toBe('nav:saldo:view')

    // Empty state test
    vi.spyOn(queries, 'getDashboardSummary').mockResolvedValue({
      ...mockSummary,
      upcomingCommitments: { allUpcoming: [] },
    } as any)

    const emptyScreen = await renderSaldoDueDatesScreen({}, {})
    expect(emptyScreen.text).toContain('Nenhum compromisso financeiro previsto para os próximos dias')
    expect(emptyScreen.keyboard?.inline_keyboard.flat().map((b) => b.text)).toContain('💳 Ver faturas')
  })

  it('verifies that all navigation callbacks decode properly, exist in registry and are <= 64 bytes', () => {
    const callbacks = [
      encodeNavCallback('saldo', 'view'),
      encodeNavCallback('saldo_accounts', 'view'),
      encodeNavCallback('saldo_invoices', 'view'),
      encodeNavCallback('saldo_invoice_detail', 'view', { i: 0, m: 0 }),
      encodeNavCallback('saldo_invoice_detail', 'view', { i: 0, m: -1 }),
      encodeNavCallback('saldo_invoice_detail', 'view', { i: 0, m: 1 }),
      encodeNavCallback('saldo_invoice_txs', 'view', { i: 0, m: 0, p: 2 }),
      encodeNavCallback('saldo_invoice_cats', 'view', { i: 0, m: 0 }),
      encodeNavCallback('saldo_due_dates', 'view'),
    ]

    for (const cb of callbacks) {
      expect(new TextEncoder().encode(cb).length).toBeLessThanOrEqual(64)
      const decoded = decodeNavCallback(cb)
      expect(decoded).not.toBeNull()
      expect(navigationRegistry.has(decoded!.screenId)).toBe(true)
    }
  })
})
