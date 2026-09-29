import { InlineKeyboard } from 'grammy'
import {
  encodeNavCallback,
  addBackButton,
  navigationRegistry,
  NavigationRegistry,
  type BotScreen,
  type ScreenRenderer,
} from './navigation'
import { getDashboardSummary, listTransactions, listAccounts, listCategories } from './queries'
import { formatBRL } from './formatters'
import { getCardInvoiceDates } from './billingCycles'

export interface GastosScreenParams {
  m?: string | number // monthOffset (0 = atual, -1 = mês anterior, etc.)
  p?: string | number // page index (1-based)
  cat?: string // category name filter
  acc?: string // accountId or account index filter
  i?: string | number // account index in listAccounts
  src?: string // source screen for contextual back button ('main' | 'cat' | 'cards' | 'accs')
}

const TXS_PER_PAGE = 5

/**
 * Helper to parse monthOffset safely
 */
function parseMonthOffset(param?: string | number): number {
  if (param === undefined || param === null || param === '') return 0
  const parsed = parseInt(String(param), 10)
  return isNaN(parsed) ? 0 : parsed
}

/**
 * Helper to parse page number safely
 */
function parsePage(param?: string | number): number {
  if (param === undefined || param === null || param === '') return 1
  const parsed = parseInt(String(param), 10)
  return isNaN(parsed) || parsed < 1 ? 1 : parsed
}

/**
 * Tela Principal de Gastos (/gastos)
 * Mostra:
 * - Período/mês
 * - Total gasto
 * - Total em cartões
 * - Total em contas
 * Botões: Categorias, Cartões, Contas, Lançamentos, Mês Anterior, Próximo Mês (quando aplicável), Atualizar
 */
export const renderGastosScreen: ScreenRenderer<GastosScreenParams> = async (
  params = {}
): Promise<BotScreen> => {
  const monthOffset = parseMonthOffset(params.m)
  const summary = await getDashboardSummary({ periodType: 'month', monthOffset })
  const accounts = await listAccounts({ activeOnly: false })
  const creditCardIds = new Set(accounts.filter((a) => a.type === 'credit_card').map((a) => a.id))

  let totalCards = 0
  let totalAccounts = 0

  for (const accMetric of summary.accountMetrics || []) {
    if (creditCardIds.has(accMetric.id)) {
      totalCards += accMetric.totalExpenses
    } else {
      totalAccounts += accMetric.totalExpenses
    }
  }

  const totalSpent = summary.metrics.totalSpent || summary.metrics.totalExpenses || 0

  let message = `📊 <b>Painel de Gastos</b>\n`
  message += `<i>Referência: ${summary.period.label}</i>\n`
  message += `━━━━━━━━━━━━━━━━━━━━━\n\n`
  message += `💸 <b>Total Gasto:</b> <b>${formatBRL(totalSpent)}</b>\n`
  message += `💳 <b>Total em Cartões:</b> <b>${formatBRL(totalCards)}</b>\n`
  message += `🏦 <b>Total em Contas:</b> <b>${formatBRL(totalAccounts)}</b>`

  if (summary.metrics.expenseTransactionCount > 0) {
    message += `\n🧾 <b>Lançamentos:</b> ${summary.metrics.expenseTransactionCount}`
  }

  const keyboard = new InlineKeyboard()
    .text('📁 Categorias', encodeNavCallback('gastos_cat', 'view', { m: monthOffset }))
    .text('💳 Cartões', encodeNavCallback('gastos_cards', 'view', { m: monthOffset }))
    .row()
    .text('🏦 Contas', encodeNavCallback('gastos_accs', 'view', { m: monthOffset }))
    .text('🧾 Lançamentos', encodeNavCallback('gastos_txs', 'view', { m: monthOffset, src: 'main' }))
    .row()

  // Month navigation: always display previous month and next month
  keyboard
    .text('◀️ Mês Ant.', encodeNavCallback('gastos', 'view', { m: monthOffset - 1 }))
    .text('Mês Seg. ▶️', encodeNavCallback('gastos', 'view', { m: monthOffset + 1 }))
    .row()

  keyboard.text('🔄 Atualizar', encodeNavCallback('gastos', 'view', { m: monthOffset }))

  return {
    text: message,
    keyboard,
    parseMode: 'HTML',
  }
}

/**
 * Tela de Categorias de Gastos
 * Lista valor, percentual e quantidade.
 * Permite abrir os lançamentos de cada categoria.
 */
export const renderGastosCategoriesScreen: ScreenRenderer<GastosScreenParams> = async (
  params = {}
): Promise<BotScreen> => {
  const monthOffset = parseMonthOffset(params.m)
  const summary = await getDashboardSummary({ periodType: 'month', monthOffset })
  const categories = summary.topCategories || []

  let message = `📁 <b>Gastos por Categoria</b>\n`
  message += `<i>Referência: ${summary.period.label}</i>\n`
  message += `━━━━━━━━━━━━━━━━━━━━━\n\n`

  const keyboard = new InlineKeyboard()

  if (categories.length === 0) {
    message += `ℹ️ Nenhuma despesa registrada por categoria neste período.`
  } else {
    for (let i = 0; i < categories.length; i++) {
      const cat = categories[i]
      const countText = cat.count === 1 ? '1 lançamento' : `${cat.count} lançamentos`
      message += `<b>${cat.category}</b>\n`
      message += `${formatBRL(cat.total)} • ${cat.percentage}% • ${countText}\n\n`

      // Add a compact button to view transactions of this category
      const btnLabel = `🧾 Ver ${cat.category.slice(0, 14)}`
      // Limit category query param if needed to stay under 64-byte Telegram limit
      keyboard.text(
        btnLabel,
        encodeNavCallback('gastos_txs', 'view', { m: monthOffset, cat: cat.category.slice(0, 15), src: 'cat' })
      )
      if (i % 2 === 1 || i === categories.length - 1) {
        keyboard.row()
      }
    }
    const totalSpent = summary.metrics.totalSpent || summary.metrics.totalExpenses || 0
    message += `━━━━━━━━━━━━━━━━━━━━━\n`
    message += `💸 <b>Total:</b> <b>${formatBRL(totalSpent)}</b>`
  }

  addBackButton(keyboard, 'gastos', 'view', { m: monthOffset }, '⬅️ Voltar')
  keyboard.text('🔄 Atualizar', encodeNavCallback('gastos_cat', 'view', { m: monthOffset }))

  return {
    text: message,
    keyboard,
    parseMode: 'HTML',
  }
}

/**
 * Tela de Gastos/Faturas por Cartão de Crédito
 * Mostra gastos por cartão no período e permite abrir detalhamento dos lançamentos do cartão.
 */
export const renderGastosCardsScreen: ScreenRenderer<GastosScreenParams> = async (
  params = {}
): Promise<BotScreen> => {
  const monthOffset = parseMonthOffset(params.m)
  const summary = await getDashboardSummary({ periodType: 'month', monthOffset })
  const accounts = await listAccounts({ activeOnly: false })
  const creditCards = (accounts || []).filter((acc) => acc.type === 'credit_card')
  const accountMetricsMap = new Map((summary.accountMetrics || []).map((m) => [m.id, m]))

  let message = `💳 <b>Gastos por Cartão de Crédito</b>\n`
  message += `<i>Referência: ${summary.period.label}</i>\n`
  message += `━━━━━━━━━━━━━━━━━━━━━\n\n`

  const keyboard = new InlineKeyboard()

  if (creditCards.length === 0) {
    message += `ℹ️ Nenhum cartão de crédito cadastrado.`
  } else {
    let totalCardSpent = 0
    const todayStr = new Date().toISOString().slice(0, 10)

    for (let i = 0; i < creditCards.length; i++) {
      const card = creditCards[i]
      const metric = accountMetricsMap.get(card.id)
      const spent = metric ? metric.totalExpenses : 0
      const count = metric ? metric.transactionCount : 0
      totalCardSpent += spent

      const closingDay = card.closing_day || 5
      const dueDay = card.due_day || 15
      const cycle = getCardInvoiceDates(todayStr, closingDay, dueDay)

      const formatIsoDate = (isoStr: string) => {
        const [y, m, d] = isoStr.split('-')
        return `${d}/${m}`
      }

      const institution = card.institution ? ` (${card.institution})` : ''
      const countText = count === 1 ? '1 lançamento' : `${count} lançamentos`

      message += `💳 <b>${card.name}</b>${institution}\n`
      message += `${formatBRL(spent)} • ${countText}\n`
      message += `Vence em ${formatIsoDate(cycle.dueDate)}\n\n`

      // Button to view this card's transactions (use index i to stay compact and under 64 bytes)
      keyboard.text(
        `🧾 Ver ${card.name.slice(0, 14)}`,
        encodeNavCallback('gastos_txs', 'view', { m: monthOffset, i, src: 'cards' })
      )
      if (i % 2 === 1 || i === creditCards.length - 1) {
        keyboard.row()
      }
    }

    message += `━━━━━━━━━━━━━━━━━━━━━\n`
    message += `📊 <b>Total em Cartões:</b> <b>${formatBRL(totalCardSpent)}</b>`
  }

  addBackButton(keyboard, 'gastos', 'view', { m: monthOffset }, '⬅️ Voltar')
  keyboard.text('🔄 Atualizar', encodeNavCallback('gastos_cards', 'view', { m: monthOffset }))

  return {
    text: message,
    keyboard,
    parseMode: 'HTML',
  }
}

/**
 * Tela de Gastos por Conta Bancária & Carteira
 * Mostra gastos por conta no período e permite abrir detalhamento dos lançamentos da conta.
 */
export const renderGastosAccountsScreen: ScreenRenderer<GastosScreenParams> = async (
  params = {}
): Promise<BotScreen> => {
  const monthOffset = parseMonthOffset(params.m)
  const summary = await getDashboardSummary({ periodType: 'month', monthOffset })
  const accounts = await listAccounts({ activeOnly: false })
  const liquidAccounts = (accounts || []).filter((acc) => acc.type !== 'credit_card')
  const accountMetricsMap = new Map((summary.accountMetrics || []).map((m) => [m.id, m]))

  let message = `🏦 <b>Gastos por Conta & Carteira</b>\n`
  message += `<i>Referência: ${summary.period.label}</i>\n`
  message += `━━━━━━━━━━━━━━━━━━━━━\n\n`

  const keyboard = new InlineKeyboard()

  if (liquidAccounts.length === 0) {
    message += `ℹ️ Nenhuma conta bancária ou carteira cadastrada.`
  } else {
    let totalAccountSpent = 0
    const accountsWithExpenses: Array<{ acc: typeof liquidAccounts[0]; metric: any; index: number }> = []

    for (let i = 0; i < liquidAccounts.length; i++) {
      const acc = liquidAccounts[i]
      const metric = accountMetricsMap.get(acc.id)
      const spent = metric ? metric.totalExpenses : 0
      totalAccountSpent += spent

      if (spent > 0) {
        accountsWithExpenses.push({ acc, metric, index: i })
      }
    }

    if (accountsWithExpenses.length === 0) {
      message += `ℹ️ Nenhuma despesa em contas bancárias ou carteiras neste período.`
    } else {
      for (let btnIdx = 0; btnIdx < accountsWithExpenses.length; btnIdx++) {
        const { acc, metric, index } = accountsWithExpenses[btnIdx]
        const spent = metric ? metric.totalExpenses : 0
        const count = metric ? metric.transactionCount : 0
        const countText = count === 1 ? '1 lançamento' : `${count} lançamentos`

        const icon = acc.type === 'cash' ? '💵' : acc.type === 'digital_wallet' ? '📱' : '🏦'
        const institution = acc.institution ? ` (${acc.institution})` : ''
        const balanceVal = metric && metric.balance !== undefined ? formatBRL(metric.balance) : formatBRL(0)

        message += `${icon} <b>${acc.name}</b>${institution}\n`
        message += `${formatBRL(spent)} • ${countText}\n`
        message += `Saldo atual: ${balanceVal}\n\n`

        // Button to view this account's transactions (use original index i to stay consistent and under 64 bytes)
        keyboard.text(
          `🧾 Ver ${acc.name.slice(0, 14)}`,
          encodeNavCallback('gastos_txs', 'view', { m: monthOffset, i: index, src: 'accs' })
        )
        if (btnIdx % 2 === 1 || btnIdx === accountsWithExpenses.length - 1) {
          keyboard.row()
        }
      }

      message += `━━━━━━━━━━━━━━━━━━━━━\n`
      message += `💰 <b>Total em Contas:</b> <b>${formatBRL(totalAccountSpent)}</b>`
    }
  }

  addBackButton(keyboard, 'gastos', 'view', { m: monthOffset }, '⬅️ Voltar')
  keyboard.text('🔄 Atualizar', encodeNavCallback('gastos_accs', 'view', { m: monthOffset }))

  return {
    text: message,
    keyboard,
    parseMode: 'HTML',
  }
}

/**
 * Tela de Lançamentos de Despesas do Período (Paginada)
 * Suporta filtros por categoria ou conta e paginação por botões.
 */
export const renderGastosTransactionsScreen: ScreenRenderer<GastosScreenParams> = async (
  params = {}
): Promise<BotScreen> => {
  const monthOffset = parseMonthOffset(params.m)
  const page = parsePage(params.p)
  const categoryFilter = params.cat ? String(params.cat).trim() : undefined
  const sourceScreen = params.src || 'main'

  // Resolve account filter either by index i (contextual from cards/accs) or explicit acc ID
  const accounts = await listAccounts({ activeOnly: false })
  let resolvedAccount = undefined
  let accountIndex = undefined

  if (params.i !== undefined && params.i !== null && params.i !== '') {
    const idx = parseInt(String(params.i), 10)
    if (!isNaN(idx)) {
      accountIndex = idx
      if (sourceScreen === 'cards') {
        const creditCards = (accounts || []).filter((a) => a.type === 'credit_card')
        resolvedAccount = creditCards[idx]
      } else if (sourceScreen === 'accs') {
        const liquidAccounts = (accounts || []).filter((a) => a.type !== 'credit_card')
        resolvedAccount = liquidAccounts[idx]
      } else {
        resolvedAccount = accounts[idx]
      }
    }
  } else if (params.acc) {
    const accStr = String(params.acc).trim()
    resolvedAccount = accounts.find((a) => a.id === accStr)
  }

  const accountFilter = resolvedAccount?.id

  const summary = await getDashboardSummary({ periodType: 'month', monthOffset })
  const offset = (page - 1) * TXS_PER_PAGE

  const res = await listTransactions({
    type: 'expense',
    startDate: summary.period.startDate,
    endDate: summary.period.endDate,
    category: categoryFilter,
    accountId: accountFilter,
    limit: TXS_PER_PAGE,
    offset,
  })

  const txs = res.transactions || []
  const totalCount = res.total_count || 0
  const totalPages = Math.max(1, Math.ceil(totalCount / TXS_PER_PAGE))

  let titleSubtitle = ''
  if (categoryFilter) {
    titleSubtitle = ` (📁 ${categoryFilter})`
  } else if (resolvedAccount) {
    titleSubtitle = ` (${resolvedAccount.type === 'credit_card' ? '💳' : '🏦'} ${resolvedAccount.name})`
  }

  let message = `🧾 <b>Lançamentos de Despesas</b>${titleSubtitle}\n`
  const pageSubtitle = totalPages > 1 ? ` • Página ${page} de ${totalPages}` : ''
  message += `<i>Referência: ${summary.period.label}${pageSubtitle}</i>\n`
  message += `━━━━━━━━━━━━━━━━━━━━━\n\n`

  if (txs.length === 0) {
    message += `ℹ️ Nenhuma despesa encontrada para este filtro no período.\n`
  } else {
    for (const tx of txs) {
      const amountStr = formatBRL(tx.total)
      const vendorName = tx.vendor || 'Estabelecimento não informado'

      let dateStr = tx.date || tx.created_at?.slice(0, 10) || ''
      if (dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        const [y, m, d] = dateStr.split('-')
        dateStr = `${d}/${m}`
      }

      const catName = tx.category || tx.categories?.name || 'Outros'

      // Clean and consolidate payment / account information
      const accName = tx.accounts?.name?.trim() || ''
      const paymentMethod = tx.payment_method?.trim() || ''

      let accountOrPayment = ''
      if (accName && paymentMethod) {
        const accLower = accName.toLowerCase()
        const payLower = paymentMethod.toLowerCase()
        if (accLower === payLower || accLower.includes(payLower) || payLower.includes(accLower)) {
          accountOrPayment = accName
        } else if (
          payLower.includes('cartão de crédito') ||
          payLower.includes('credito') ||
          payLower.includes('cartao de credito')
        ) {
          accountOrPayment = accName
        } else {
          accountOrPayment = `${accName} (${paymentMethod})`
        }
      } else {
        accountOrPayment = accName || paymentMethod
      }

      const paymentPart = accountOrPayment ? ` • ${accountOrPayment}` : ''

      message += `${dateStr}  ${vendorName}\n`
      message += `${amountStr} • ${catName}${paymentPart}\n\n`
    }

    message += `━━━━━━━━━━━━━━━━━━━━━\n`
    const countLabel = totalCount === 1 ? '1 despesa' : `${totalCount} despesas`
    if (txs.length === totalCount) {
      message += `📊 <b>${countLabel}</b>`
    } else {
      message += `📊 Exibindo <b>${txs.length}</b> de <b>${totalCount}</b> despesas.`
    }
  }

  const keyboard = new InlineKeyboard()

  // Pagination buttons
  const hasPrev = page > 1
  const hasNext = page < totalPages

  if (hasPrev || hasNext) {
    if (hasPrev) {
      keyboard.text(
        '⬅️ Anterior',
        encodeNavCallback('gastos_txs', 'view', {
          m: monthOffset,
          p: page - 1,
          cat: categoryFilter,
          i: accountIndex,
          src: sourceScreen,
        })
      )
    }
    if (hasNext) {
      keyboard.text(
        'Próxima ➡️',
        encodeNavCallback('gastos_txs', 'view', {
          m: monthOffset,
          p: page + 1,
          cat: categoryFilter,
          i: accountIndex,
          src: sourceScreen,
        })
      )
    }
    keyboard.row()
  }

  // Contextual back button based on source
  let backScreen = 'gastos'
  if (sourceScreen === 'cat') {
    backScreen = 'gastos_cat'
  } else if (sourceScreen === 'cards') {
    backScreen = 'gastos_cards'
  } else if (sourceScreen === 'accs') {
    backScreen = 'gastos_accs'
  }

  addBackButton(keyboard, backScreen, 'view', { m: monthOffset }, '⬅️ Voltar')
  keyboard.text(
    '🔄 Atualizar',
    encodeNavCallback('gastos_txs', 'view', {
      m: monthOffset,
      p: page,
      cat: categoryFilter,
      i: accountIndex,
      src: sourceScreen,
    })
  )

  return {
    text: message,
    keyboard,
    parseMode: 'HTML',
  }
}

/**
 * Registers all gastos screen renderers into the navigation registry.
 */
export function registerGastosScreens(registry = navigationRegistry): void {
  registry.register('gastos', renderGastosScreen)
  registry.register('gastos_cat', renderGastosCategoriesScreen)
  registry.register('gastos_cards', renderGastosCardsScreen)
  registry.register('gastos_accs', renderGastosAccountsScreen)
  registry.register('gastos_txs', renderGastosTransactionsScreen)
}

// Auto-register on module load
registerGastosScreens()
