import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  renderGastosScreen,
  renderGastosCategoriesScreen,
  renderGastosCardsScreen,
  renderGastosAccountsScreen,
  renderGastosTransactionsScreen,
  registerGastosScreens,
} from './gastosNavigation'
import { navigationRegistry, decodeNavCallback, encodeNavCallback } from './navigation'
import { formatBRL } from './formatters'
import * as queries from './queries'
import type { Account } from './schema'

describe('Deterministic /gastos Inline Navigation Flow (lib/gastosNavigation.ts)', () => {
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
    topCategories: [
      { category: 'Mercado', total: 600, percentage: 40, count: 4 },
      { category: 'Alimentação', total: 450, percentage: 30, count: 3 },
      { category: 'Transporte', total: 250, percentage: 16.7, count: 2 },
      { category: 'Outros', total: 200, percentage: 13.3, count: 1 },
    ],
    accountMetrics: [
      { id: 'acc_nubank', balance: 2000, totalExpenses: 500, totalIncome: 2500, transactionCount: 5 },
      { id: 'acc_inter_card', balance: -800, totalExpenses: 800, totalIncome: 0, transactionCount: 6 },
      { id: 'acc_wallet', balance: 300, totalExpenses: 200, totalIncome: 500, transactionCount: 1 },
    ],
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
        accounts: { name: 'Cartão Inter' },
      },
      {
        id: 'tx_2',
        type: 'expense',
        vendor: 'Restaurante Sabor',
        total: 85,
        date: '2026-09-15',
        category: 'Alimentação',
        payment_method: 'Pix',
        accounts: { name: 'Nubank Conta' },
      },
      {
        id: 'tx_3',
        type: 'expense',
        vendor: 'Posto Shell',
        total: 120,
        date: '2026-09-20',
        category: 'Transporte',
        payment_method: 'Débito',
        accounts: { name: 'Nubank Conta' },
      },
    ],
    total_count: 3,
    total_amount: 455,
  }

  beforeEach(() => {
    vi.spyOn(queries, 'listAccounts').mockResolvedValue(mockAccounts)
    vi.spyOn(queries, 'getDashboardSummary').mockResolvedValue(mockSummary as any)
    vi.spyOn(queries, 'listTransactions').mockResolvedValue(mockTransactionsResponse as any)
  })

  it('renders main /gastos screen with totals for cards, accounts, and navigation buttons', async () => {
    const screen = await renderGastosScreen({ m: '0' }, {})
    expect(screen.text).toContain('Painel de Gastos')
    expect(screen.text).toContain('Setembro de 2026')
    expect(screen.text).toContain('Total Gasto')
    expect(screen.text).toContain('1.500,00')
    expect(screen.text).toContain('Total em Cartões')
    expect(screen.text).toContain('800,00') // acc_inter_card
    expect(screen.text).toContain('Total em Contas')
    expect(screen.text).toContain('700,00') // 500 (Nubank) + 200 (Carteira)

    expect(screen.keyboard).toBeDefined()
    const buttonTexts = screen.keyboard?.inline_keyboard.flat().map((b) => b.text)
    expect(buttonTexts).toContain('📁 Categorias')
    expect(buttonTexts).toContain('💳 Cartões')
    expect(buttonTexts).toContain('🏦 Contas')
    expect(buttonTexts).toContain('🧾 Lançamentos')
    expect(buttonTexts).toContain('◀️ Mês Ant.')
    expect(buttonTexts).toContain('🔄 Atualizar')

    const buttonCallbacks = screen.keyboard?.inline_keyboard.flat().map((b) => b.callback_data)
    expect(buttonCallbacks).toContain('nav:gastos_cat:view:m=0')
    expect(buttonCallbacks).toContain('nav:gastos_cards:view:m=0')
    expect(buttonCallbacks).toContain('nav:gastos_accs:view:m=0')
    expect(buttonCallbacks).toContain('nav:gastos_txs:view:m=0;src=main')
    expect(buttonCallbacks).toContain('nav:gastos:view:m=-1')
  })

  it('renders both previous and next month navigation buttons always', async () => {
    // Current month (m=0)
    const screenCurrent = await renderGastosScreen({ m: '0' }, {})
    const btnsCurrent = screenCurrent.keyboard?.inline_keyboard.flat().map((b) => b.text)
    expect(btnsCurrent).toContain('◀️ Mês Ant.')
    expect(btnsCurrent).toContain('Mês Seg. ▶️')
    const cbsCurrent = screenCurrent.keyboard?.inline_keyboard.flat().map((b) => b.callback_data)
    expect(cbsCurrent).toContain('nav:gastos:view:m=-1')
    expect(cbsCurrent).toContain('nav:gastos:view:m=1')

    // Past month (m=-2)
    const screenPast = await renderGastosScreen({ m: '-2' }, {})
    const cbsPast = screenPast.keyboard?.inline_keyboard.flat().map((b) => b.callback_data)
    expect(cbsPast).toContain('nav:gastos:view:m=-3')
    expect(cbsPast).toContain('nav:gastos:view:m=-1')

    // Future month (m=2)
    const screenFuture = await renderGastosScreen({ m: '2' }, {})
    const cbsFuture = screenFuture.keyboard?.inline_keyboard.flat().map((b) => b.callback_data)
    expect(cbsFuture).toContain('nav:gastos:view:m=1')
    expect(cbsFuture).toContain('nav:gastos:view:m=3')
  })

  it('renders Categories screen (gastos_cat) with value, percentage, count and transaction links', async () => {
    const screen = await renderGastosCategoriesScreen({ m: '0' }, {})
    expect(screen.text).toContain('Gastos por Categoria')
    expect(screen.text).toContain('Mercado')
    expect(screen.text).toContain(`${formatBRL(600)} • 40% • 4 lançamentos`)
    expect(screen.text).toContain('Outros')
    expect(screen.text).toContain(`${formatBRL(200)} • 13.3% • 1 lançamento`)
    expect(screen.text).not.toContain('• Valor:')
    expect(screen.text).not.toContain('• Lançamentos:')

    const buttonTexts = screen.keyboard?.inline_keyboard.flat().map((b) => b.text)
    expect(buttonTexts).toContain('🧾 Ver Mercado')
    expect(buttonTexts).toContain('🧾 Ver Alimentação')
    expect(buttonTexts).toContain('⬅️ Voltar')

    const backButton = screen.keyboard?.inline_keyboard.flat().find((b) => b.text.includes('Voltar'))
    expect(backButton?.callback_data).toBe('nav:gastos:view:m=0')
  })

  it('renders Cards screen (gastos_cards) with compact card invoice details and transaction buttons', async () => {
    const screen = await renderGastosCardsScreen({ m: '0' }, {})
    expect(screen.text).toContain('Gastos por Cartão de Crédito')
    expect(screen.text).toContain('Cartão Inter')
    expect(screen.text).toContain(`${formatBRL(800)} • 6 lançamentos`)
    expect(screen.text).toContain('Vence em 15/10')
    expect(screen.text).toContain('Total em Cartões')

    const buttonTexts = screen.keyboard?.inline_keyboard.flat().map((b) => b.text)
    expect(buttonTexts).toContain('🧾 Ver Cartão Inter')
    expect(buttonTexts).toContain('⬅️ Voltar')

    const backButton = screen.keyboard?.inline_keyboard.flat().find((b) => b.text.includes('Voltar'))
    expect(backButton?.callback_data).toBe('nav:gastos:view:m=0')
  })

  it('renders Accounts screen (gastos_accs) with only accounts having expenses and compact presentation', async () => {
    const screen = await renderGastosAccountsScreen({ m: '0' }, {})
    expect(screen.text).toContain('Gastos por Conta & Carteira')
    expect(screen.text).toContain('Nubank Conta')
    expect(screen.text).toContain(`${formatBRL(500)} • 5 lançamentos`)
    expect(screen.text).toContain(`Saldo atual: ${formatBRL(2000)}`)
    expect(screen.text).toContain('Carteira Física')
    expect(screen.text).toContain(`${formatBRL(200)} • 1 lançamento`)
    expect(screen.text).toContain(`Saldo atual: ${formatBRL(300)}`)
    expect(screen.text).toContain('Total em Contas')
    expect(screen.text).toContain('700,00')

    const buttonTexts = screen.keyboard?.inline_keyboard.flat().map((b) => b.text)
    expect(buttonTexts).toContain('🧾 Ver Nubank Conta')
    expect(buttonTexts).toContain(`🧾 Ver ${mockAccounts[2].name.slice(0, 14)}`)
    expect(buttonTexts).toContain('⬅️ Voltar')

    const backButton = screen.keyboard?.inline_keyboard.flat().find((b) => b.text.includes('Voltar'))
    expect(backButton?.callback_data).toBe('nav:gastos:view:m=0')
  })

  it('hides zero-expense accounts and handles empty state in Accounts screen', async () => {
    // Accounts exist, but only Nubank has expenses; Carteira has 0 expenses
    const partialSummary = {
      ...mockSummary,
      accountMetrics: [
        { id: 'acc_nubank', balance: 2000, totalExpenses: 150, totalIncome: 0, transactionCount: 1 },
        { id: 'acc_inter_card', balance: -800, totalExpenses: 800, totalIncome: 0, transactionCount: 6 },
        { id: 'acc_wallet', balance: 300, totalExpenses: 0, totalIncome: 0, transactionCount: 0 },
      ],
    }
    vi.spyOn(queries, 'getDashboardSummary').mockResolvedValue(partialSummary as any)

    const screen = await renderGastosAccountsScreen({ m: '0' }, {})
    expect(screen.text).toContain('Nubank Conta')
    expect(screen.text).toContain(`${formatBRL(150)} • 1 lançamento`)
    expect(screen.text).not.toContain('Carteira Física')

    const buttonTexts = screen.keyboard?.inline_keyboard.flat().map((b) => b.text)
    expect(buttonTexts).toContain('🧾 Ver Nubank Conta')
    expect(buttonTexts).not.toContain(`🧾 Ver ${mockAccounts[2].name.slice(0, 14)}`)

    // All accounts have 0 expenses
    const zeroExpensesSummary = {
      ...mockSummary,
      accountMetrics: [
        { id: 'acc_nubank', balance: 2000, totalExpenses: 0, totalIncome: 0, transactionCount: 0 },
        { id: 'acc_wallet', balance: 300, totalExpenses: 0, totalIncome: 0, transactionCount: 0 },
      ],
    }
    vi.spyOn(queries, 'getDashboardSummary').mockResolvedValue(zeroExpensesSummary as any)

    const emptyScreen = await renderGastosAccountsScreen({ m: '0' }, {})
    expect(emptyScreen.text).toContain('Nenhuma despesa em contas bancárias ou carteiras neste período')
    const emptyButtonTexts = emptyScreen.keyboard?.inline_keyboard.flat().map((b) => b.text)
    expect(emptyButtonTexts).not.toContain('🧾 Ver Nubank Conta')
    expect(emptyButtonTexts).toContain('⬅️ Voltar')
  })

  it('renders Transactions screen (gastos_txs) in compact statement format with deduplicated payment and contextual back navigation', async () => {
    const screen = await renderGastosTransactionsScreen({ m: '0', cat: 'Mercado', src: 'cat' }, {})
    expect(screen.text).toContain('Lançamentos de Despesas')
    expect(screen.text).toContain('(📁 Mercado)')
    // Single page: should not contain "Pág. 1/1" or "Página 1 de 1"
    expect(screen.text).not.toContain('Página 1 de 1')
    expect(screen.text).not.toContain('Pág. 1/1')
    // Compact statement format: DD/MM Estabelecimento
    expect(screen.text).toContain('12/09  Supermercado Pão de Açúcar')
    // Deduplicated payment: "Cartão de Crédito" + "Cartão Inter" -> "Cartão Inter"
    expect(screen.text).toContain(`${formatBRL(250)} • Mercado • Cartão Inter`)
    expect(screen.text).not.toContain('Cartão de Crédito • Cartão Inter')
    expect(screen.text).not.toContain('🔴')
    expect(screen.text).not.toContain('📅')
    // Footer: when all 3 shown, should show "3 despesas"
    expect(screen.text).toContain('3 despesas')

    const backButton = screen.keyboard?.inline_keyboard.flat().find((b) => b.text.includes('Voltar'))
    expect(backButton?.callback_data).toBe('nav:gastos_cat:view:m=0')
  })

  it('handles multi-page pagination header and partial counts in Transactions screen', async () => {
    vi.spyOn(queries, 'listTransactions').mockResolvedValue({
      transactions: [
        {
          id: 'tx_1',
          type: 'expense',
          vendor: 'Loja A',
          total: 50,
          date: '2026-09-01',
          category: 'Outros',
          payment_method: 'PIX',
          accounts: { name: 'Pix' },
        },
      ],
      total_count: 12,
      total_amount: 600,
    } as any)

    const screen = await renderGastosTransactionsScreen({ m: '0', p: '1', src: 'main' }, {})
    // Multiple pages: should show "Página 1 de 3" (since 12 items / 5 per page = 3 pages)
    expect(screen.text).toContain('Página 1 de 3')
    // Payment deduplication: "PIX" + "Pix" -> "Pix"
    expect(screen.text).toContain('01/09  Loja A')
    expect(screen.text).toContain(`${formatBRL(50)} • Outros • Pix`)
    expect(screen.text).not.toContain('Pix (PIX)')
    // Partial footer count:
    expect(screen.text).toContain('Exibindo <b>1</b> de <b>12</b> despesas.')
  })

  it('verifies callback string byte sizes do not exceed 64 bytes for all possible routes and UUID accounts', async () => {
    const testCallbacks = [
      encodeNavCallback('gastos', 'view', { m: 0 }),
      encodeNavCallback('gastos', 'view', { m: -1 }),
      encodeNavCallback('gastos_cat', 'view', { m: 0 }),
      encodeNavCallback('gastos_cards', 'view', { m: 0 }),
      encodeNavCallback('gastos_accs', 'view', { m: 0 }),
      encodeNavCallback('gastos_txs', 'view', { m: 0, p: 2, cat: 'Alimentação', src: 'cat' }),
      encodeNavCallback('gastos_txs', 'view', { m: 1, i: 0, src: 'cards' }),
      encodeNavCallback('gastos_txs', 'view', { m: 1, i: 1, src: 'accs' }),
    ]

    for (const cb of testCallbacks) {
      expect(new TextEncoder().encode(cb).length).toBeLessThanOrEqual(64)
      const decoded = decodeNavCallback(cb)
      expect(decoded).not.toBeNull()
      expect(navigationRegistry.has(decoded!.screenId)).toBe(true)
    }

    // Test that cards screen with real UUID accounts renders valid buttons under 64 bytes
    const uuidAccounts: Account[] = [
      { id: '70a4e89d-103f-4505-83ca-419ff378ba87', name: 'Cartão de Crédito', type: 'credit_card', active: true },
      { id: 'c587a5f8-473b-408b-93fa-fcc67e43adf4', name: 'Cartão Inter', type: 'credit_card', active: true },
    ]
    vi.spyOn(queries, 'listAccounts').mockResolvedValue(uuidAccounts)
    const cardsScreen = await renderGastosCardsScreen({ m: '1' }, {})
    const cardCallbacks = cardsScreen.keyboard?.inline_keyboard.flat().map((b) => b.callback_data)
    for (const cb of cardCallbacks || []) {
      expect(new TextEncoder().encode(cb!).length).toBeLessThanOrEqual(64)
    }

    // Test that transactions screen resolves index i correctly
    const txsScreen = await renderGastosTransactionsScreen({ m: '1', i: 1, src: 'cards' }, {})
    expect(txsScreen.text).toContain('Cartão Inter')
  })

  it('handles empty states gracefully across all screens', async () => {
    vi.spyOn(queries, 'getDashboardSummary').mockResolvedValue({
      period: { label: 'Outubro de 2026', startDate: '2026-10-01', endDate: '2026-10-31' },
      metrics: { totalSpent: 0, totalExpenses: 0, expenseTransactionCount: 0 },
      topCategories: [],
      accountMetrics: [],
    } as any)
    vi.spyOn(queries, 'listAccounts').mockResolvedValue([])
    vi.spyOn(queries, 'listTransactions').mockResolvedValue({ transactions: [], total_count: 0, total_amount: 0 })

    const mainScreen = await renderGastosScreen({}, {})
    expect(mainScreen.text).toContain('0,00')

    const catScreen = await renderGastosCategoriesScreen({}, {})
    expect(catScreen.text).toContain('Nenhuma despesa registrada')

    const cardsScreen = await renderGastosCardsScreen({}, {})
    expect(cardsScreen.text).toContain('Nenhum cartão de crédito cadastrado')

    const accsScreen = await renderGastosAccountsScreen({}, {})
    expect(accsScreen.text).toContain('Nenhuma conta bancária ou carteira cadastrada')

    const txsScreen = await renderGastosTransactionsScreen({}, {})
    expect(txsScreen.text).toContain('Nenhuma despesa encontrada')
  })
})
