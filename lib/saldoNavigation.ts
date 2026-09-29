import { InlineKeyboard } from 'grammy'
import {
  encodeNavCallback,
  addBackButton,
  navigationRegistry,
  NavigationRegistry,
  type BotScreen,
  type ScreenRenderer,
} from './navigation'
import { listAccounts, getDashboardSummary, listTransactions } from './queries'
import { formatBRL, getAccountTypeLabel } from './formatters'
import { getCardInvoiceDates } from './billingCycles'

/**
 * Tela Principal do /saldo
 * Resumo compacto de alto nível com navegação por botões.
 */
export const renderSaldoScreen: ScreenRenderer = async (): Promise<BotScreen> => {
  const accounts = await listAccounts({ activeOnly: true })

  if (!accounts || accounts.length === 0) {
    return {
      text: 'ℹ️ Nenhuma conta cadastrada ou ativa encontrada.',
    }
  }

  const summary = await getDashboardSummary({ periodType: 'month' })
  const accountMetricsMap = new Map((summary.accountMetrics || []).map((m) => [m.id, m]))

  let totalLiquidBalance = 0
  let totalCreditInvoice = 0

  for (const acc of accounts) {
    const metric = accountMetricsMap.get(acc.id)
    if (acc.type === 'credit_card') {
      const invoiceTotal = metric ? metric.totalExpenses : 0
      totalCreditInvoice += invoiceTotal
    } else {
      const balance = metric ? metric.balance : 0
      totalLiquidBalance += balance
    }
  }

  let message = `💰 <b>Resumo Financeiro</b>\n`
  message += `<i>Referência: ${summary.period.label}</i>\n`
  message += `━━━━━━━━━━━━━━━━━━━━━\n\n`
  message += `💵 <b>Saldo Disponível:</b> <b>${formatBRL(totalLiquidBalance)}</b>\n`
  message += `💳 <b>Faturas de Cartão (mês):</b> <b>${formatBRL(totalCreditInvoice)}</b>\n`
  message += `📈 <b>Saldo Geral do Período:</b> <b>${formatBRL(summary.metrics.balance)}</b>`

  const keyboard = new InlineKeyboard()
    .text('🏦 Contas', encodeNavCallback('saldo_accounts', 'view'))
    .text('💳 Faturas', encodeNavCallback('saldo_invoices', 'view'))
    .row()
    .text('📊 Gastos', encodeNavCallback('gastos', 'view'))
    .text('📅 Vencimentos', encodeNavCallback('saldo_due_dates', 'view'))
    .row()
    .text('🔄 Atualizar', encodeNavCallback('saldo', 'view'))

  return {
    text: message,
    keyboard,
    parseMode: 'HTML',
  }
}

/**
 * Tela Detalhada: Contas Bancárias e Carteiras (sem cartões de crédito)
 */
export const renderSaldoAccountsScreen: ScreenRenderer = async (): Promise<BotScreen> => {
  const accounts = await listAccounts({ activeOnly: true })
  const liquidAccounts = (accounts || []).filter((a) => a.type !== 'credit_card')

  if (liquidAccounts.length === 0) {
    let text = `🏦 <b>Contas Bancárias & Carteiras</b>\n━━━━━━━━━━━━━━━━━━━━━\n\n`
    text += `ℹ️ Nenhuma conta bancária ou carteira cadastrada.`
    const kb = addBackButton(new InlineKeyboard(), 'saldo', 'view')
    return { text, keyboard: kb, parseMode: 'HTML' }
  }

  const summary = await getDashboardSummary({ periodType: 'month' })
  const accountMetricsMap = new Map((summary.accountMetrics || []).map((m) => [m.id, m]))

  let message = `🏦 <b>Contas & Carteiras</b>\n`
  message += `<i>Referência: ${summary.period.label}</i>\n`
  message += `━━━━━━━━━━━━━━━━━━━━━\n\n`

  let totalLiquid = 0

  for (const acc of liquidAccounts) {
    const metric = accountMetricsMap.get(acc.id)
    const balance = metric ? metric.balance : 0
    totalLiquid += balance

    const icon = acc.type === 'cash' ? '💵' : acc.type === 'digital_wallet' ? '📱' : '🏦'
    const institution = acc.institution ? ` (${acc.institution})` : ''

    message += `${icon} <b>${acc.name}</b>${institution}\n`
    message += `   • Saldo: <b>${formatBRL(balance)}</b>\n`
    if (metric && metric.transactionCount > 0) {
      message += `   • Movimentações: ${metric.transactionCount}\n`
    }
    message += `\n`
  }

  message += `━━━━━━━━━━━━━━━━━━━━━\n`
  message += `💰 <b>Total Disponível:</b> <b>${formatBRL(totalLiquid)}</b>`

  const keyboard = new InlineKeyboard()
  addBackButton(keyboard, 'saldo', 'view', undefined, '⬅️ Voltar')
  keyboard.text('🔄 Atualizar', encodeNavCallback('saldo_accounts', 'view'))

  return {
    text: message,
    keyboard,
    parseMode: 'HTML',
  }
}

export interface SaldoInvoiceParams {
  i?: string | number // card index in credit cards array
  m?: string | number // month offset from current date (0 = current cycle)
  p?: string | number // page for transactions list
}

const TXS_PER_PAGE = 5

function parseInvoiceParams(params: Record<string, any> = {}) {
  const cardIndex = params.i !== undefined && params.i !== null && params.i !== ''
    ? Math.max(0, parseInt(String(params.i), 10) || 0)
    : 0
  const monthOffset = params.m !== undefined && params.m !== null && params.m !== ''
    ? parseInt(String(params.m), 10) || 0
    : 0
  const page = params.p !== undefined && params.p !== null && params.p !== ''
    ? Math.max(1, parseInt(String(params.p), 10) || 1)
    : 1
  return { cardIndex, monthOffset, page }
}

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

/**
 * Calculates cycle reference date, closing date, due date and cycle label based on monthOffset.
 */
function getInvoiceCycleForCard(
  card: { closing_day?: number | null; due_day?: number | null },
  monthOffset: number = 0
) {
  const closingDay = card.closing_day || 5
  const dueDay = card.due_day || 15

  const now = new Date()
  const todayStr = now.toISOString().slice(0, 10)
  const baseCycle = getCardInvoiceDates(todayStr, closingDay, dueDay)

  // Calculate target due date based on monthOffset
  const [dueY, dueM, dueD] = baseCycle.dueDate.split('-').map(Number)
  const targetDueMonthTotal = dueY * 12 + (dueM - 1) + monthOffset
  const targetDueYear = Math.floor(targetDueMonthTotal / 12)
  const targetDueMonth = (targetDueMonthTotal % 12) + 1

  // Safe due date in target month
  const maxDueDays = new Date(Date.UTC(targetDueYear, targetDueMonth, 0)).getUTCDate()
  const actualDueDay = Math.min(dueDay, maxDueDays)
  const targetDueDateStr = `${targetDueYear}-${String(targetDueMonth).padStart(2, '0')}-${String(actualDueDay).padStart(2, '0')}`

  // Calculate closing month:
  // If dueDay > closingDay: closing is in same month as due date
  // If dueDay <= closingDay: closing is in previous month
  let targetClosingMonthTotal = targetDueMonthTotal
  if (dueDay <= closingDay) {
    targetClosingMonthTotal -= 1
  }
  const targetClosingYear = Math.floor(targetClosingMonthTotal / 12)
  const targetClosingMonth = (targetClosingMonthTotal % 12) + 1
  const maxClosingDays = new Date(Date.UTC(targetClosingYear, targetClosingMonth, 0)).getUTCDate()
  const actualClosingDay = Math.min(closingDay, maxClosingDays)
  const targetClosingDateStr = `${targetClosingYear}-${String(targetClosingMonth).padStart(2, '0')}-${String(actualClosingDay).padStart(2, '0')}`

  // Cycle start date: day after previous closing date
  const prevClosingMonthTotal = targetClosingMonthTotal - 1
  const prevClosingYear = Math.floor(prevClosingMonthTotal / 12)
  const prevClosingMonth = (prevClosingMonthTotal % 12) + 1
  const maxPrevClosingDays = new Date(Date.UTC(prevClosingYear, prevClosingMonth, 0)).getUTCDate()
  const actualPrevClosingDay = Math.min(closingDay, maxPrevClosingDays)

  // The day after previous closing
  const prevClosingDateObj = new Date(Date.UTC(prevClosingYear, prevClosingMonth - 1, actualPrevClosingDay))
  prevClosingDateObj.setUTCDate(prevClosingDateObj.getUTCDate() + 1)
  const cycleStartDateStr = prevClosingDateObj.toISOString().slice(0, 10)

  const monthLabel = `${MONTH_NAMES[targetDueMonth - 1]} de ${targetDueYear}`

  return {
    cycleLabel: monthLabel,
    closingDate: targetClosingDateStr,
    dueDate: targetDueDateStr,
    cycleStartDate: cycleStartDateStr,
    targetDueYear,
    targetDueMonth,
  }
}

function formatIsoDateShort(isoStr: string): string {
  const parts = isoStr.split('-')
  if (parts.length < 3) return isoStr
  return `${parts[2]}/${parts[1]}`
}

function formatIsoDateFull(isoStr: string): string {
  const parts = isoStr.split('-')
  if (parts.length < 3) return isoStr
  return `${parts[2]}/${parts[1]}/${parts[0]}`
}

/**
 * Tela Detalhada: Faturas de Cartão de Crédito
 * Lista faturas dos cartões com botões interativos para ver o detalhe de cada fatura.
 */
export const renderSaldoInvoicesScreen: ScreenRenderer<SaldoInvoiceParams> = async (
  params = {}
): Promise<BotScreen> => {
  const accounts = await listAccounts({ activeOnly: true })
  const creditCards = (accounts || []).filter((acc) => acc.type === 'credit_card')

  if (creditCards.length === 0) {
    let text = `💳 <b>Faturas de Cartão de Crédito</b>\n━━━━━━━━━━━━━━━━━━━━━\n\n`
    text += `ℹ️ Nenhum cartão de crédito cadastrado ou ativo encontrado.`
    const kb = addBackButton(new InlineKeyboard(), 'saldo', 'view')
    return { text, keyboard: kb, parseMode: 'HTML' }
  }

  const summary = await getDashboardSummary({ periodType: 'month' })
  const accountMetricsMap = new Map((summary.accountMetrics || []).map((m) => [m.id, m]))

  let message = `💳 <b>Faturas de Cartão</b>\n`
  message += `<i>Referência: ${summary.period.label}</i>\n`
  message += `━━━━━━━━━━━━━━━━━━━━━\n\n`

  let totalInvoices = 0
  const keyboard = new InlineKeyboard()

  for (let i = 0; i < creditCards.length; i++) {
    const card = creditCards[i]
    const metric = accountMetricsMap.get(card.id)
    const invoiceAmount = metric ? metric.totalExpenses : 0
    const count = metric ? metric.transactionCount : 0
    totalInvoices += invoiceAmount

    const cycle = getInvoiceCycleForCard(card, 0)
    const institution = card.institution ? ` (${card.institution})` : ''
    const countText = count === 1 ? '1 lançamento' : `${count} lançamentos`

    message += `💳 <b>${card.name}</b>${institution}\n`
    message += `${formatBRL(invoiceAmount)} • ${countText}\n`
    message += `Vence em ${formatIsoDateShort(cycle.dueDate)} (fecha em ${formatIsoDateShort(cycle.closingDate)})\n\n`

    // Button to open invoice detail (uses index i)
    keyboard.text(
      `🧾 Detalhar ${card.name.slice(0, 14)}`,
      encodeNavCallback('saldo_invoice_detail', 'view', { i, m: 0 })
    )
    if (i % 2 === 1 || i === creditCards.length - 1) {
      keyboard.row()
    }
  }

  message += `━━━━━━━━━━━━━━━━━━━━━\n`
  message += `📊 <b>Total de Faturas:</b> <b>${formatBRL(totalInvoices)}</b>`

  addBackButton(keyboard, 'saldo', 'view', undefined, '⬅️ Voltar')
  keyboard.text('🔄 Atualizar', encodeNavCallback('saldo_invoices', 'view'))

  return {
    text: message,
    keyboard,
    parseMode: 'HTML',
  }
}

/**
 * Tela Detalhada de uma Fatura Específica de um Cartão
 */
export const renderSaldoInvoiceDetailScreen: ScreenRenderer<SaldoInvoiceParams> = async (
  params = {}
): Promise<BotScreen> => {
  const { cardIndex, monthOffset } = parseInvoiceParams(params)
  const accounts = await listAccounts({ activeOnly: true })
  const creditCards = (accounts || []).filter((acc) => acc.type === 'credit_card')

  if (creditCards.length === 0 || cardIndex >= creditCards.length) {
    let text = `💳 <b>Detalhe da Fatura</b>\n━━━━━━━━━━━━━━━━━━━━━\n\n`
    text += `ℹ️ Cartão não encontrado ou sem faturas.`
    const kb = addBackButton(new InlineKeyboard(), 'saldo_invoices', 'view')
    return { text, keyboard: kb, parseMode: 'HTML' }
  }

  const card = creditCards[cardIndex]
  const cycle = getInvoiceCycleForCard(card, monthOffset)

  // Fetch purchases belonging to this invoice cycle
  const txRes = await listTransactions({
    type: 'expense',
    accountId: card.id,
    startDate: cycle.cycleStartDate,
    endDate: cycle.closingDate,
    limit: 100,
  })

  const txs = txRes.transactions || []
  const invoiceTotal = txs.reduce((sum, t) => sum + (Number(t.installment_amount) || Number(t.total) || 0), 0)
  const count = txs.length
  const countText = count === 1 ? '1 compra' : `${count} compras`

  const institution = card.institution ? ` (${card.institution})` : ''

  let message = `💳 <b>Fatura ${card.name}</b>${institution}\n`
  message += `<i>Ciclo: ${cycle.cycleLabel}</i>\n`
  message += `━━━━━━━━━━━━━━━━━━━━━\n\n`

  message += `💰 <b>Valor Total:</b> <b>${formatBRL(invoiceTotal)}</b>\n`
  message += `🔒 <b>Fechamento:</b> ${formatIsoDateFull(cycle.closingDate)}\n`
  message += `📅 <b>Vencimento:</b> ${formatIsoDateFull(cycle.dueDate)}\n`
  message += `🛍️ <b>Quantidade de Compras:</b> ${countText}\n`

  if (count === 0) {
    message += `\n<i>ℹ️ Nenhuma compra registrada nesta fatura.</i>`
  }

  const keyboard = new InlineKeyboard()

  // Actions for this invoice
  keyboard
    .text('🧾 Compras', encodeNavCallback('saldo_invoice_txs', 'view', { i: cardIndex, m: monthOffset }))
    .text('📁 Categorias', encodeNavCallback('saldo_invoice_cats', 'view', { i: cardIndex, m: monthOffset }))
    .row()

  // Temporal cycle navigation for this card
  keyboard
    .text('◀️ Anterior', encodeNavCallback('saldo_invoice_detail', 'view', { i: cardIndex, m: monthOffset - 1 }))
    .text('Próxima ▶️', encodeNavCallback('saldo_invoice_detail', 'view', { i: cardIndex, m: monthOffset + 1 }))
    .row()

  addBackButton(keyboard, 'saldo_invoices', 'view', undefined, '⬅️ Voltar')
  keyboard.text('🔄 Atualizar', encodeNavCallback('saldo_invoice_detail', 'view', { i: cardIndex, m: monthOffset }))

  return {
    text: message,
    keyboard,
    parseMode: 'HTML',
  }
}

/**
 * Tela de Compras da Fatura Selecionada (Extrato Compacto)
 */
export const renderSaldoInvoiceTransactionsScreen: ScreenRenderer<SaldoInvoiceParams> = async (
  params = {}
): Promise<BotScreen> => {
  const { cardIndex, monthOffset, page } = parseInvoiceParams(params)
  const accounts = await listAccounts({ activeOnly: true })
  const creditCards = (accounts || []).filter((acc) => acc.type === 'credit_card')

  if (creditCards.length === 0 || cardIndex >= creditCards.length) {
    let text = `🧾 <b>Compras da Fatura</b>\n━━━━━━━━━━━━━━━━━━━━━\n\nℹ️ Cartão não encontrado.`
    const kb = addBackButton(new InlineKeyboard(), 'saldo_invoices', 'view')
    return { text, keyboard: kb, parseMode: 'HTML' }
  }

  const card = creditCards[cardIndex]
  const cycle = getInvoiceCycleForCard(card, monthOffset)

  const offset = (page - 1) * TXS_PER_PAGE
  const txRes = await listTransactions({
    type: 'expense',
    accountId: card.id,
    startDate: cycle.cycleStartDate,
    endDate: cycle.closingDate,
    limit: TXS_PER_PAGE,
    offset,
  })

  const txs = txRes.transactions || []
  const totalCount = txRes.total_count || 0
  const totalPages = Math.max(1, Math.ceil(totalCount / TXS_PER_PAGE))

  const pageSubtitle = totalPages > 1 ? ` • Página ${page} de ${totalPages}` : ''

  let message = `🧾 <b>Compras — ${card.name}</b>\n`
  message += `<i>Fatura: ${cycle.cycleLabel}${pageSubtitle}</i>\n`
  message += `━━━━━━━━━━━━━━━━━━━━━\n\n`

  if (txs.length === 0) {
    message += `ℹ️ Nenhuma compra registrada nesta fatura.\n`
  } else {
    for (const tx of txs) {
      const amount = Number(tx.installment_amount) || Number(tx.total) || 0
      const amountStr = formatBRL(amount)
      const vendorName = tx.vendor || 'Estabelecimento não informado'

      let dateStr = tx.date || tx.created_at?.slice(0, 10) || ''
      if (dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        const [y, m, d] = dateStr.split('-')
        dateStr = `${d}/${m}`
      }

      const catName = tx.category || tx.categories?.name || 'Outros'
      const installmentInfo = tx.installment_total && tx.installment_total > 1
        ? ` (${tx.installment_current || 1}/${tx.installment_total})`
        : ''

      message += `${dateStr}  ${vendorName}${installmentInfo}\n`
      message += `${amountStr} • ${catName}\n\n`
    }

    message += `━━━━━━━━━━━━━━━━━━━━━\n`
    const countLabel = totalCount === 1 ? '1 compra' : `${totalCount} compras`
    if (txs.length === totalCount) {
      message += `📊 <b>${countLabel}</b>`
    } else {
      message += `📊 Exibindo <b>${txs.length}</b> de <b>${totalCount}</b> compras.`
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
        encodeNavCallback('saldo_invoice_txs', 'view', { i: cardIndex, m: monthOffset, p: page - 1 })
      )
    }
    if (hasNext) {
      keyboard.text(
        'Próxima ➡️',
        encodeNavCallback('saldo_invoice_txs', 'view', { i: cardIndex, m: monthOffset, p: page + 1 })
      )
    }
    keyboard.row()
  }

  addBackButton(keyboard, 'saldo_invoice_detail', 'view', { i: cardIndex, m: monthOffset }, '⬅️ Voltar')
  keyboard.text(
    '🔄 Atualizar',
    encodeNavCallback('saldo_invoice_txs', 'view', { i: cardIndex, m: monthOffset, p: page })
  )

  return {
    text: message,
    keyboard,
    parseMode: 'HTML',
  }
}

/**
 * Tela de Categorias da Fatura Selecionada
 */
export const renderSaldoInvoiceCategoriesScreen: ScreenRenderer<SaldoInvoiceParams> = async (
  params = {}
): Promise<BotScreen> => {
  const { cardIndex, monthOffset } = parseInvoiceParams(params)
  const accounts = await listAccounts({ activeOnly: true })
  const creditCards = (accounts || []).filter((acc) => acc.type === 'credit_card')

  if (creditCards.length === 0 || cardIndex >= creditCards.length) {
    let text = `📁 <b>Categorias da Fatura</b>\n━━━━━━━━━━━━━━━━━━━━━\n\nℹ️ Cartão não encontrado.`
    const kb = addBackButton(new InlineKeyboard(), 'saldo_invoices', 'view')
    return { text, keyboard: kb, parseMode: 'HTML' }
  }

  const card = creditCards[cardIndex]
  const cycle = getInvoiceCycleForCard(card, monthOffset)

  const txRes = await listTransactions({
    type: 'expense',
    accountId: card.id,
    startDate: cycle.cycleStartDate,
    endDate: cycle.closingDate,
    limit: 500,
  })

  const txs = txRes.transactions || []
  let invoiceTotal = 0
  const catMap: Record<string, { total: number; count: number }> = {}

  for (const t of txs) {
    const val = Number(t.installment_amount) || Number(t.total) || 0
    invoiceTotal += val
    const cat = t.category || t.categories?.name || 'Outros'
    if (!catMap[cat]) {
      catMap[cat] = { total: 0, count: 0 }
    }
    catMap[cat].total += val
    catMap[cat].count += 1
  }

  const sortedCategories = Object.entries(catMap)
    .map(([category, data]) => ({
      category,
      total: data.total,
      count: data.count,
      percentage: invoiceTotal > 0 ? Number(((data.total / invoiceTotal) * 100).toFixed(1)) : 0,
    }))
    .sort((a, b) => b.total - a.total)

  let message = `📁 <b>Categorias — ${card.name}</b>\n`
  message += `<i>Fatura: ${cycle.cycleLabel}</i>\n`
  message += `━━━━━━━━━━━━━━━━━━━━━\n\n`

  if (sortedCategories.length === 0) {
    message += `ℹ️ Nenhuma compra registrada nesta fatura por categoria.`
  } else {
    for (const cat of sortedCategories) {
      const countText = cat.count === 1 ? '1 lançamento' : `${cat.count} lançamentos`
      message += `<b>${cat.category}</b>\n`
      message += `${formatBRL(cat.total)} • ${cat.percentage}% • ${countText}\n\n`
    }
    message += `━━━━━━━━━━━━━━━━━━━━━\n`
    message += `💸 <b>Total da Fatura:</b> <b>${formatBRL(invoiceTotal)}</b>`
  }

  const keyboard = new InlineKeyboard()
  addBackButton(keyboard, 'saldo_invoice_detail', 'view', { i: cardIndex, m: monthOffset }, '⬅️ Voltar')
  keyboard.text(
    '🔄 Atualizar',
    encodeNavCallback('saldo_invoice_cats', 'view', { i: cardIndex, m: monthOffset })
  )

  return {
    text: message,
    keyboard,
    parseMode: 'HTML',
  }
}

/**
 * Tela Detalhada: Próximos Vencimentos (Agenda Financeira)
 * Lista em ordem cronológica faturas de cartão (valor consolidado) e despesas fixas/recorrentes.
 */
export const renderSaldoDueDatesScreen: ScreenRenderer = async (): Promise<BotScreen> => {
  const summary = await getDashboardSummary({ periodType: 'month' })
  const upcoming = summary.upcomingCommitments?.allUpcoming || []

  let message = `📅 <b>Próximos Vencimentos</b>\n`
  message += `━━━━━━━━━━━━━━━━━━━━━\n\n`

  const keyboard = new InlineKeyboard()

  if (upcoming.length === 0) {
    message += `ℹ️ Nenhum compromisso financeiro previsto para os próximos dias.`
  } else {
    let totalPredicted = 0
    let lastDateStr = ''

    for (const item of upcoming) {
      const amount = Number(item.amount) || 0
      totalPredicted += amount

      let dateStr = ''
      if (item.date && /^\d{4}-\d{2}-\d{2}$/.test(item.date)) {
        const [y, m, d] = item.date.split('-')
        dateStr = `${d}/${m}`
      } else if (item.date) {
        dateStr = item.date.slice(8, 10) + '/' + item.date.slice(5, 7)
      }

      const name = item.title || (item as any).description || item.vendor || 'Compromisso'

      if (dateStr !== lastDateStr) {
        if (lastDateStr !== '') {
          message += `\n`
        }
        message += `<b>${dateStr}</b>\n`
        lastDateStr = dateStr
      }

      message += `${name} — <b>${formatBRL(amount)}</b>\n`
    }

    message += `\n━━━━━━━━━━━━━━━━━━━━━\n`
    message += `📊 <b>Total Previsto:</b> <b>${formatBRL(totalPredicted)}</b>`
  }

  // Buttons: Ver Faturas, Voltar, Atualizar
  keyboard
    .text('💳 Ver faturas', encodeNavCallback('saldo_invoices', 'view'))
    .row()

  addBackButton(keyboard, 'saldo', 'view', undefined, '⬅️ Voltar')
  keyboard.text('🔄 Atualizar', encodeNavCallback('saldo_due_dates', 'view'))

  return {
    text: message,
    keyboard,
    parseMode: 'HTML',
  }
}

/**
 * Registers all saldo screen renderers into the global navigation registry.
 */
export function registerSaldoScreens(registry = navigationRegistry): void {
  registry.register('saldo', renderSaldoScreen)
  registry.register('saldo_accounts', renderSaldoAccountsScreen)
  registry.register('saldo_invoices', renderSaldoInvoicesScreen)
  registry.register('saldo_invoice_detail', renderSaldoInvoiceDetailScreen)
  registry.register('saldo_invoice_txs', renderSaldoInvoiceTransactionsScreen)
  registry.register('saldo_invoice_cats', renderSaldoInvoiceCategoriesScreen)
  registry.register('saldo_due_dates', renderSaldoDueDatesScreen)
}

// Auto-register on module load
registerSaldoScreens()

