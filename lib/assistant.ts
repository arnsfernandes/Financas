import OpenAI from 'openai'
import { getCurrentDateTimeContext, TEXT_MODEL } from './vision'
import {
  getDashboardSummary,
  listTransactions,
  listAccounts,
  listCategories,
  normalizeCategoryName,
} from './queries'
import { formatBRL } from './formatters'
import { getCardInvoiceDates } from './billingCycles'
import { getOrCreateInvoice } from './invoices'
import { getSupabaseClient } from './persist'

let cachedClient: OpenAI | null = null

function getOpenAIClient(): OpenAI {
  if (cachedClient) {
    return cachedClient
  }
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not set')
  }
  cachedClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  return cachedClient
}

export function setAssistantOpenAIClient(client: OpenAI | null): void {
  cachedClient = client
}

export type AssistantIntentType =
  | 'total_spent_period'
  | 'total_spent_category'
  | 'largest_expense_period'
  | 'spent_by_vendor'
  | 'card_invoice_amount'
  | 'remaining_installments'
  | 'current_balance'
  | 'export_expenses'
  | 'clarification'
  | 'unsupported'
  | 'out_of_scope'

export interface AssistantExtractedParams {
  category?: string | null
  vendor?: string | null
  accountNameOrInstitution?: string | null
  periodType?: 'month' | 'year' | 'custom' | null
  monthOffset?: number | null
  startDate?: string | null
  endDate?: string | null
  targetEndDate?: string | null
  format?: 'csv' | 'xlsx' | null
  limit?: number | null
}

export interface PendingClarificationState {
  intent: AssistantIntentType
  resolvedParams: AssistantExtractedParams
  missingParam: 'accountNameOrInstitution' | 'category' | 'vendor' | 'period'
}

/**
 * Minimal structured conversational context.
 * Kept strictly compact to avoid high token consumption.
 */
export interface AssistantConversationContext {
  lastIntent?: AssistantIntentType | null
  category?: string | null
  vendor?: string | null
  accountNameOrInstitution?: string | null
  periodType?: 'month' | 'year' | 'custom' | null
  monthOffset?: number | null
  startDate?: string | null
  endDate?: string | null
  targetEndDate?: string | null
  metric?: string | null
  entityType?: 'card_invoice' | 'category_expenses' | 'vendor_expenses' | 'balance' | 'installments' | null
  invoiceDueDate?: string | null
  invoiceClosingDate?: string | null
  invoiceTotal?: number | null
  invoicePaid?: boolean | null
  pendingClarification?: PendingClarificationState | null
  updatedAt?: number | null
}

const CONTEXT_TTL_MS = 10 * 60 * 1000 // 10 minutes
const MAX_STRING_LENGTH = 100
const MAX_CONTEXT_SERIALIZED_BYTES = 4096

function sanitizeString(val: unknown, maxLen = MAX_STRING_LENGTH): string | null {
  if (typeof val !== 'string') return null
  const trimmed = val.trim()
  if (!trimmed) return null
  return trimmed.length > maxLen ? trimmed.slice(0, maxLen) : trimmed
}

function sanitizeNumber(val: unknown): number | null {
  if (typeof val !== 'number' || isNaN(val)) return null
  return val
}

function sanitizeBoolean(val: unknown): boolean | null {
  if (typeof val !== 'boolean') return null
  return val
}

/**
 * Validates, normalizes, applies 10-minute TTL, prunes domain-incompatible fields,
 * and enforces strict 4 KB limit on conversational context.
 */
export function sanitizeAssistantContext(
  context: AssistantConversationContext | null | undefined
): AssistantConversationContext | null {
  if (!context || typeof context !== 'object') {
    return null
  }

  const now = Date.now()

  // 1. Check TTL (10 minutes)
  if (context.updatedAt && typeof context.updatedAt === 'number') {
    if (now - context.updatedAt > CONTEXT_TTL_MS) {
      return null // Expired context automatically cleared
    }
  }

  // 2. Validate and normalize allowed fields
  const allowedIntents: AssistantIntentType[] = [
    'total_spent_period',
    'total_spent_category',
    'largest_expense_period',
    'spent_by_vendor',
    'card_invoice_amount',
    'remaining_installments',
    'current_balance',
    'export_expenses',
    'clarification',
    'unsupported',
    'out_of_scope',
  ]

  const lastIntent = allowedIntents.includes(context.lastIntent as AssistantIntentType)
    ? (context.lastIntent as AssistantIntentType)
    : null

  const allowedEntityTypes = ['card_invoice', 'category_expenses', 'vendor_expenses', 'balance', 'installments'] as const
  const entityType = allowedEntityTypes.includes(context.entityType as any)
    ? context.entityType
    : null

  let category = sanitizeString(context.category)
  let vendor = sanitizeString(context.vendor)
  let accountNameOrInstitution = sanitizeString(context.accountNameOrInstitution)
  let metric = sanitizeString(context.metric, 50)

  // Period sanitization (at most 1 active period)
  const allowedPeriodTypes = ['month', 'year', 'custom'] as const
  const periodType = allowedPeriodTypes.includes(context.periodType as any) ? context.periodType : null
  const monthOffset = sanitizeNumber(context.monthOffset)
  const startDate = sanitizeString(context.startDate, 20)
  const endDate = sanitizeString(context.endDate, 20)
  const targetEndDate = sanitizeString(context.targetEndDate, 20)

  // Invoice specific fields
  let invoiceDueDate = sanitizeString(context.invoiceDueDate, 20)
  let invoiceClosingDate = sanitizeString(context.invoiceClosingDate, 20)
  let invoiceTotal = sanitizeNumber(context.invoiceTotal)
  let invoicePaid = sanitizeBoolean(context.invoicePaid)

  // Pending clarification sanitization (at most 1 active pending clarification)
  let pendingClarification: PendingClarificationState | null = null
  if (context.pendingClarification && typeof context.pendingClarification === 'object') {
    const pc = context.pendingClarification
    if (allowedIntents.includes(pc.intent) && ['accountNameOrInstitution', 'category', 'vendor', 'period'].includes(pc.missingParam)) {
      pendingClarification = {
        intent: pc.intent,
        missingParam: pc.missingParam,
        resolvedParams: {
          category: sanitizeString(pc.resolvedParams?.category),
          vendor: sanitizeString(pc.resolvedParams?.vendor),
          accountNameOrInstitution: sanitizeString(pc.resolvedParams?.accountNameOrInstitution),
          periodType: allowedPeriodTypes.includes(pc.resolvedParams?.periodType as any) ? pc.resolvedParams.periodType : null,
          monthOffset: sanitizeNumber(pc.resolvedParams?.monthOffset),
          startDate: sanitizeString(pc.resolvedParams?.startDate, 20),
          endDate: sanitizeString(pc.resolvedParams?.endDate, 20),
          targetEndDate: sanitizeString(pc.resolvedParams?.targetEndDate, 20),
          format: pc.resolvedParams?.format === 'csv' || pc.resolvedParams?.format === 'xlsx' ? pc.resolvedParams.format : null,
          limit: sanitizeNumber(pc.resolvedParams?.limit),
        },
      }
    }
  }

  // 3. Domain and Intent Incompatibility Pruning (keep only at most 1 active main entity)
  // Determine effective domain from lastIntent or entityType
  if (lastIntent === 'card_invoice_amount' || entityType === 'card_invoice') {
    // Keep card/account and invoice status/dates, clear incompatible fields
    category = null
    vendor = null
  } else if (lastIntent === 'total_spent_category' || entityType === 'category_expenses') {
    // Keep category + period, clear invoice/vendor/account fields
    vendor = null
    accountNameOrInstitution = null
    invoiceDueDate = null
    invoiceClosingDate = null
    invoiceTotal = null
    invoicePaid = null
  } else if (lastIntent === 'spent_by_vendor' || entityType === 'vendor_expenses') {
    // Keep vendor + period, clear invoice/category/account fields
    category = null
    accountNameOrInstitution = null
    invoiceDueDate = null
    invoiceClosingDate = null
    invoiceTotal = null
    invoicePaid = null
  } else if (lastIntent === 'current_balance' || entityType === 'balance') {
    // Keep account/institution, clear invoice/category/vendor fields
    category = null
    vendor = null
    invoiceDueDate = null
    invoiceClosingDate = null
    invoiceTotal = null
    invoicePaid = null
  } else if (lastIntent === 'remaining_installments' || entityType === 'installments') {
    // Keep targetEndDate + account if applicable, clear category/vendor/invoice fields
    category = null
    vendor = null
    invoiceDueDate = null
    invoiceClosingDate = null
    invoiceTotal = null
    invoicePaid = null
  } else if (lastIntent === 'total_spent_period' || lastIntent === 'largest_expense_period' || lastIntent === 'export_expenses') {
    // Keep period and optional category, clear invoice and vendor fields
    invoiceDueDate = null
    invoiceClosingDate = null
    invoiceTotal = null
    invoicePaid = null
    if (lastIntent !== 'largest_expense_period') {
      accountNameOrInstitution = null
    }
  }

  // Build clean sanitized context object
  let cleanContext: AssistantConversationContext = {
    lastIntent,
    category,
    vendor,
    accountNameOrInstitution,
    periodType,
    monthOffset,
    startDate,
    endDate,
    targetEndDate,
    metric,
    entityType,
    invoiceDueDate,
    invoiceClosingDate,
    invoiceTotal,
    invoicePaid,
    pendingClarification,
    updatedAt: now,
  }

  // Remove keys with null/undefined to keep semantic state minimal and clean
  const prunedEntries = Object.entries(cleanContext).filter(
    ([_, v]) => v !== null && v !== undefined
  )
  if (prunedEntries.length === 0 || (prunedEntries.length === 1 && prunedEntries[0][0] === 'updatedAt')) {
    return null
  }

  cleanContext = Object.fromEntries(prunedEntries) as AssistantConversationContext

  // 4. Limit serialized context to max 4 KB (4096 bytes)
  let serialized = JSON.stringify(cleanContext)
  if (serialized.length > MAX_CONTEXT_SERIALIZED_BYTES) {
    // Fallback: discard non-essential attributes and keep only critical identification fields
    const minimalContext: AssistantConversationContext = {
      lastIntent: cleanContext.lastIntent || null,
      category: cleanContext.category ? cleanContext.category.slice(0, 50) : null,
      vendor: cleanContext.vendor ? cleanContext.vendor.slice(0, 50) : null,
      accountNameOrInstitution: cleanContext.accountNameOrInstitution ? cleanContext.accountNameOrInstitution.slice(0, 50) : null,
      periodType: cleanContext.periodType || null,
      monthOffset: cleanContext.monthOffset !== undefined ? cleanContext.monthOffset : null,
      updatedAt: now,
    }
    const minimalPruned = Object.fromEntries(
      Object.entries(minimalContext).filter(([_, v]) => v !== null && v !== undefined)
    ) as AssistantConversationContext

    return minimalPruned
  }

  return cleanContext
}

export interface AssistantIntentClassification {
  intent: AssistantIntentType
  confidence: number
  params?: AssistantExtractedParams | null
  clarificationMessage?: string | null
}

export interface AssistantSummaryCard {
  title: string
  mainValue: string
  subtitle?: string
  badge?: {
    label: string
    variant?: 'default' | 'success' | 'warning' | 'info'
  }
  metrics?: Array<{
    label: string
    value: string
  }>
}

export interface AssistantTableBlock {
  title?: string
  columns: string[]
  rows: Array<Array<string | number>>
}

export interface AssistantChartBlock {
  title?: string
  type: 'bar' | 'donut'
  labels: string[]
  data: number[]
  valuePrefix?: string
}

export interface AssistantExportBlock {
  title: string
  description: string
  filename: string
  csvData: string
  format: 'csv'
}

export interface AssistantStructuredResponse {
  type: 'structured'
  text: string
  card?: AssistantSummaryCard | null
  table?: AssistantTableBlock | null
  chart?: AssistantChartBlock | null
  export?: AssistantExportBlock | null
  context?: AssistantConversationContext | null
}

const ASSISTANT_INTENT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    intent: {
      type: 'string',
      enum: [
        'total_spent_period',
        'total_spent_category',
        'largest_expense_period',
        'spent_by_vendor',
        'card_invoice_amount',
        'remaining_installments',
        'current_balance',
        'export_expenses',
        'clarification',
        'unsupported',
        'out_of_scope',
      ],
    },
    confidence: { type: 'number' },
    params: {
      type: ['object', 'null'],
      additionalProperties: false,
      properties: {
        category: { type: ['string', 'null'] },
        vendor: { type: ['string', 'null'] },
        accountNameOrInstitution: { type: ['string', 'null'] },
        periodType: {
          type: ['string', 'null'],
          enum: ['month', 'year', 'custom', null],
        },
        monthOffset: { type: ['number', 'null'] },
        startDate: { type: ['string', 'null'] },
        endDate: { type: ['string', 'null'] },
        targetEndDate: { type: ['string', 'null'] },
        format: { type: ['string', 'null'], enum: ['csv', 'xlsx', null] },
        limit: { type: ['number', 'null'] },
      },
      required: [
        'category',
        'vendor',
        'accountNameOrInstitution',
        'periodType',
        'monthOffset',
        'startDate',
        'endDate',
        'targetEndDate',
        'format',
        'limit',
      ],
    },
    clarificationMessage: { type: ['string', 'null'] },
  },
  required: ['intent', 'confidence', 'params', 'clarificationMessage'],
} as const

/**
 * Step 1: Lightweight Intent Classification with compact conversational context
 * Sends ONLY user text, current date, and previous structured context (if any).
 */
export async function classifyAssistantQuery(
  userText: string,
  context?: AssistantConversationContext | null,
  openaiClient: OpenAI = getOpenAIClient()
): Promise<AssistantIntentClassification> {
  const contextDate = getCurrentDateTimeContext()

  let systemPrompt = `You are a financial query intent classifier and parameter extractor for a personal finance system.
Language: Portuguese (pt-BR).
CURRENT REFERENCE DATE (America/Sao_Paulo): ${contextDate.full} (Today is ${contextDate.date}).
`

  if (context && Object.keys(context).length > 0) {
    systemPrompt += `
PREVIOUS CONVERSATIONAL CONTEXT:
- Last Intent: ${context.lastIntent || 'none'}
- Category in context: ${context.category || 'none'}
- Vendor in context: ${context.vendor || 'none'}
- Account/Card in context: ${context.accountNameOrInstitution || 'none'}
- PeriodType in context: ${context.periodType || 'none'}
- MonthOffset in context: ${context.monthOffset !== undefined && context.monthOffset !== null ? context.monthOffset : 'none'}
- StartDate in context: ${context.startDate || 'none'}
- EndDate in context: ${context.endDate || 'none'}
- TargetEndDate in context: ${context.targetEndDate || 'none'}

FOLLOW-UP RULES:
- If the user asks a continuation or follow-up question (e.g. "E no mês passado?", "E no Inter?", "Qual foi maior?", "Mostra só mercado", "E até dezembro?", "E este ano?"):
  - Inherit relevant fields from previous context unless overridden.
  - "E no mês passado?": keep same intent/category/vendor, but change monthOffset to -1 (or previous month).
  - "E no Inter?" or "E no Nubank?": if previous intent was 'card_invoice_amount' or 'current_balance', keep intent and update accountNameOrInstitution.
  - "Qual foi maior?" / "Qual foi o maior?": resolve to 'largest_expense_period', inheriting the previous category/period if applicable.
  - "Mostra só mercado" / "E com alimentação?": resolve to 'total_spent_category' with the new category, preserving period from context.
  - "E até dezembro?": if previous intent was 'remaining_installments', update targetEndDate to end of December.
  - If the new question is about a topic unrelated to the system/finance, DO NOT inherit old context and classify as 'out_of_scope'.
`
  }

  systemPrompt += `
CRITICAL DOMAIN RESTRICTION (SCOPE GUARD):
You are strictly limited to the user's personal finances and data available in this finance system (transactions, expenses, income, bank accounts, credit cards, invoices, installments, categories, vendors, recurrences, reserves, and balances).
You must NEVER answer general world knowledge, trivia, politics, sports, weather, coding, geography, news, jokes, recipes, or external non-financial subjects.

You must strictly classify the user request into ONE of the following intents:

1. 'total_spent_period':
   - Questions about total expenses/spending in a timeframe (this month, last month, this year, specific dates).
   - Examples: "Quanto gastei este mês?", "Total de gastos do mês passado", "Quanto gastei em 2026?".
   - Extract: periodType ('month', 'year', 'custom'), monthOffset (0 for current, -1 for previous), startDate, endDate.

2. 'total_spent_category':
   - Questions about expenses in a specific category.
   - Examples: "Quanto gastei com mercado este mês?", "Quanto gastei com mercado nos últimos 6 meses?", "Gastos com transporte", "Mostra só mercado".
   - Extract: category, periodType, startDate, endDate, monthOffset.

3. 'largest_expense_period':
   - Questions about the highest/biggest single expense or purchase.
   - Examples: "Qual foi meu maior gasto?", "Maior despesa este mês", "Qual foi o maior gasto?", "Qual foi maior?".
   - Extract: periodType, startDate, endDate, monthOffset, limit.

4. 'spent_by_vendor':
   - Questions about expenses at a specific vendor, store or app.
   - Examples: "Quanto gastei no Carrefour?", "Gastos na Amazon este ano", "Quanto gastei no Uber?".
   - Extract: vendor, periodType, startDate, endDate, monthOffset.

5. 'card_invoice_amount':
   - Questions about credit card invoices.
   - Examples: "Quanto está a fatura do Inter?", "Qual o valor da fatura do Nubank?", "Fatura do cartão", "E no Inter?".
   - Extract: accountNameOrInstitution.

6. 'remaining_installments':
   - Questions about future/remaining installments.
   - Examples: "Quanto ainda tenho de parcelas?", "Quanto tenho de parcelas até dezembro?", "E até dezembro?".
   - Extract: targetEndDate (ISO YYYY-MM-DD cutoff).

7. 'current_balance':
   - Questions about available liquid bank balance or consolidated account balances.
   - Examples: "Quanto tenho de saldo?", "Qual meu saldo atual?", "Saldo consolidado", "Saldo no Nubank".
   - Extract: accountNameOrInstitution.

8. 'export_expenses':
   - User asks to export/download expenses or transactions as CSV/XLSX.
   - Examples: "Exporte minhas despesas de setembro", "Baixar extrato em CSV", "Exportar gastos deste mês".
   - Extract: periodType, monthOffset, startDate, endDate, format ('csv' or 'xlsx').

9. 'clarification':
   - Financial query is too ambiguous, vague, or short (e.g. "mercado", "qual?", "oi", "ajuda").
   - Set clarificationMessage with a friendly clarification question in Portuguese.

10. 'unsupported':
   - Valid financial request, but feature is not yet supported (e.g. writing/updating data, simulation, investment calculator, budgeting goals).

11. 'out_of_scope':
   - ANY question outside personal finance and this system's data (e.g. "Qual a capital de São Paulo?", "Quem ganhou o jogo ontem?", "Como fazer bolo?", "Previsão do tempo", "Quem é o presidente?", "Escreva um código em Python").
   - Never answer these using external knowledge. Classify as 'out_of_scope'.

RULES:
- Today is ${contextDate.date}.
- "últimos 6 meses": startDate = 6 months prior, endDate = ${contextDate.date}, periodType = 'custom'.
- Return null for missing fields.
`

  const response = await openaiClient.chat.completions.create({
    model: TEXT_MODEL,
    temperature: 0,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userText },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'assistant_intent_classification',
        strict: true,
        schema: ASSISTANT_INTENT_SCHEMA,
      },
    },
  })

  const content = response.choices[0]?.message?.content?.trim()
  if (!content) {
    return {
      intent: 'unsupported',
      confidence: 0,
      params: null,
      clarificationMessage: null,
    }
  }

  return JSON.parse(content) as AssistantIntentClassification
}

/**
 * Deterministic Query Resolvers (zero LLM token consumption for calculations or UI blocks)
 */

async function resolveTotalSpentPeriod(params?: AssistantExtractedParams | null): Promise<AssistantStructuredResponse> {
  const periodType = params?.periodType || (params?.startDate ? 'custom' : 'month')
  const monthOffset = params?.monthOffset ?? 0
  const startDate = params?.startDate || undefined
  const endDate = params?.endDate || undefined

  const summary = await getDashboardSummary({
    periodType,
    monthOffset,
    startDate,
    endDate,
  })

  const total = summary.metrics.totalSpent || summary.metrics.totalExpenses || 0
  const txCount = summary.metrics.expenseTransactionCount || 0
  const topCategories = summary.topCategories || []

  const chart = topCategories.length > 0
    ? {
        title: 'Top Categorias do Período',
        type: 'donut' as const,
        labels: topCategories.slice(0, 5).map((c) => c.category),
        data: topCategories.slice(0, 5).map((c) => c.total),
        valuePrefix: 'R$ ',
      }
    : null

  const table = topCategories.length > 0
    ? {
        title: 'Detalhamento por Categoria',
        columns: ['Categoria', 'Qtd', 'Total'],
        rows: topCategories.slice(0, 5).map((c) => [c.category, c.count, formatBRL(c.total)]),
      }
    : null

  return {
    type: 'structured',
    text: `Você teve um total de ${formatBRL(total)} em despesas durante ${summary.period.label}, distribuídas em ${txCount} lançamento(s).`,
    card: {
      title: `Total de Gastos • ${summary.period.label}`,
      mainValue: formatBRL(total),
      subtitle: `${txCount} lançamento(s) registrados`,
      metrics: [
        { label: 'Média diária', value: formatBRL(summary.metrics.dailyAverage || 0) },
        { label: 'Maior categoria', value: topCategories[0]?.category || 'N/A' },
      ],
    },
    chart,
    table,
    context: {
      lastIntent: 'total_spent_period',
      periodType,
      monthOffset,
      startDate: summary.period.startDate,
      endDate: summary.period.endDate,
      metric: 'total_spent',
      entityType: null,
    },
  }
}

async function resolveTotalSpentCategory(params?: AssistantExtractedParams | null): Promise<AssistantStructuredResponse> {
  const categoryParam = params?.category?.trim()
  if (!categoryParam) {
    return {
      type: 'structured',
      text: 'Por favor, informe qual categoria você deseja consultar (ex.: Mercado, Alimentação, Transporte).',
      context: {
        lastIntent: 'total_spent_category',
        periodType: params?.periodType || 'month',
        monthOffset: params?.monthOffset ?? 0,
        startDate: params?.startDate || null,
        endDate: params?.endDate || null,
        pendingClarification: {
          intent: 'total_spent_category',
          resolvedParams: params || {},
          missingParam: 'category',
        },
      },
    }
  }

  const periodType = params?.periodType || (params?.startDate ? 'custom' : 'month')
  const monthOffset = params?.monthOffset ?? 0
  const startDate = params?.startDate || undefined
  const endDate = params?.endDate || undefined

  const normSearch = normalizeCategoryName(categoryParam)
  const categories = await listCategories({ activeOnly: false })
  const matchedCat = categories.find(
    (c) =>
      c.normalized_name === normSearch ||
      normalizeCategoryName(c.name).includes(normSearch) ||
      normSearch.includes(normalizeCategoryName(c.name))
  )

  const catName = matchedCat ? matchedCat.name : categoryParam

  const txResult = await listTransactions({
    type: 'expense',
    category: catName,
    startDate,
    endDate,
    limit: 500,
  })

  let total = 0
  let periodLabel = ''
  const txs = txResult.transactions

  if (startDate || endDate) {
    periodLabel = `de ${startDate || 'início'} até ${endDate || 'hoje'}`
    total = txs.reduce((acc, t) => acc + (Number(t.installment_amount) || Number(t.total) || 0), 0)
  } else {
    const summary = await getDashboardSummary({ periodType, monthOffset })
    periodLabel = summary.period.label
    const mSummaryTxs = txs.filter((tx) => {
      const d = tx.date || ''
      return d >= summary.period.startDate && d <= summary.period.endDate
    })
    total = mSummaryTxs.reduce((acc, t) => acc + (Number(t.installment_amount) || Number(t.total) || 0), 0)
  }

  if (txs.length === 0 || total === 0) {
    return {
      type: 'structured',
      text: `Não foram encontrados lançamentos registrados para a categoria ${catName} no período selecionado (${periodLabel}).`,
      card: {
        title: `Gastos em ${catName}`,
        mainValue: formatBRL(0),
        subtitle: `Sem registros em ${periodLabel}`,
      },
      context: {
        lastIntent: 'total_spent_category',
        category: catName,
        periodType,
        monthOffset,
        startDate,
        endDate,
        entityType: 'category_expenses',
        pendingClarification: null,
      },
    }
  }

  // Monthly group for chart if multi-month range
  const monthlyMap: Record<string, number> = {}
  txs.forEach((tx) => {
    const mKey = (tx.date || '').slice(0, 7) // YYYY-MM
    if (mKey) {
      const val = Number(tx.installment_amount) || Number(tx.total) || 0
      monthlyMap[mKey] = (monthlyMap[mKey] || 0) + val
    }
  })

  const sortedMonths = Object.keys(monthlyMap).sort()
  const chart = sortedMonths.length > 1
    ? {
        title: `Evolução Mensal • ${catName}`,
        type: 'bar' as const,
        labels: sortedMonths.map((m) => `${m.slice(5, 7)}/${m.slice(2, 4)}`),
        data: sortedMonths.map((m) => Number(monthlyMap[m].toFixed(2))),
        valuePrefix: 'R$ ',
      }
    : null

  const table = {
    title: `Últimos lançamentos em ${catName}`,
    columns: ['Data', 'Estabelecimento', 'Valor'],
    rows: txs.slice(0, 5).map((t) => [
      t.date || 'S/ data',
      t.vendor || t.description || 'Lançamento',
      formatBRL(Number(t.installment_amount) || Number(t.total) || 0),
    ]),
  }

  return {
    type: 'structured',
    text: `Você gastou um total de ${formatBRL(total)} em ${catName} (${periodLabel}).`,
    card: {
      title: `Categoria: ${catName}`,
      mainValue: formatBRL(total),
      subtitle: `${txs.length} compra(s) registradas`,
      metrics: [
        { label: 'Ticket Médio', value: formatBRL(total / (txs.length || 1)) },
        { label: 'Período', value: periodLabel },
      ],
    },
    chart,
    table,
    context: {
      lastIntent: 'total_spent_category',
      category: catName,
      periodType,
      monthOffset,
      startDate,
      endDate,
      entityType: 'category_expenses',
      pendingClarification: null,
    },
  }
}

async function resolveLargestExpensePeriod(params?: AssistantExtractedParams | null): Promise<AssistantStructuredResponse> {
  const periodType = params?.periodType || (params?.startDate ? 'custom' : 'month')
  const monthOffset = params?.monthOffset ?? 0
  const startDate = params?.startDate || undefined
  const endDate = params?.endDate || undefined
  const category = params?.category || undefined

  let finalStart = startDate
  let finalEnd = endDate
  let label = ''

  if (!finalStart && !finalEnd) {
    const summary = await getDashboardSummary({ periodType, monthOffset })
    finalStart = summary.period.startDate
    finalEnd = summary.period.endDate
    label = summary.period.label
  } else {
    label = `${finalStart || 'início'} até ${finalEnd || 'hoje'}`
  }

  const result = await listTransactions({
    type: 'expense',
    category,
    startDate: finalStart,
    endDate: finalEnd,
    limit: 500,
  })

  const expenses = result.transactions.map((tx) => ({
    ...tx,
    effectiveAmount: Number(tx.installment_amount) || Number(tx.total) || 0,
  }))

  if (expenses.length === 0) {
    return {
      type: 'structured',
      text: `Não foram encontradas despesas registradas no período (${label}).`,
      context: {
        lastIntent: 'largest_expense_period',
        periodType,
        monthOffset,
        startDate: finalStart,
        endDate: finalEnd,
        category,
        pendingClarification: null,
      },
    }
  }

  expenses.sort((a, b) => b.effectiveAmount - a.effectiveAmount)
  const top1 = expenses[0]
  const top5 = expenses.slice(0, 5)

  const table = {
    title: `Top 5 Maiores Despesas (${label})`,
    columns: ['Local / Descrição', 'Categoria', 'Data', 'Valor'],
    rows: top5.map((t) => [
      t.vendor || t.description || 'Despesa',
      t.category || 'Outros',
      t.date || 'S/ data',
      formatBRL(t.effectiveAmount),
    ]),
  }

  const chart = {
    title: 'Comparativo dos Maiores Gastos',
    type: 'bar' as const,
    labels: top5.map((t) => (t.vendor || t.description || 'Gasto').slice(0, 14)),
    data: top5.map((t) => Number(t.effectiveAmount.toFixed(2))),
    valuePrefix: 'R$ ',
  }

  return {
    type: 'structured',
    text: `Seu maior gasto no período (${label}) foi ${formatBRL(top1.effectiveAmount)} em ${top1.vendor || top1.description || 'Despesa'} (${top1.category || 'Geral'}).`,
    card: {
      title: `Maior Gasto • ${label}`,
      mainValue: formatBRL(top1.effectiveAmount),
      subtitle: top1.vendor || top1.description || 'Despesa',
      metrics: [
        { label: 'Data', value: top1.date || 'N/A' },
        { label: 'Categoria', value: top1.category || 'Outros' },
      ],
    },
    table,
    chart,
    context: {
      lastIntent: 'largest_expense_period',
      periodType,
      monthOffset,
      startDate: finalStart,
      endDate: finalEnd,
      category,
      pendingClarification: null,
    },
  }
}

async function resolveSpentByVendor(params?: AssistantExtractedParams | null): Promise<AssistantStructuredResponse> {
  const vendorParam = params?.vendor?.trim()
  if (!vendorParam) {
    return {
      type: 'structured',
      text: 'Por favor, informe o estabelecimento ou loja que você deseja consultar (ex.: Carrefour, Uber, Amazon).',
      context: {
        lastIntent: 'spent_by_vendor',
        periodType: params?.periodType || 'month',
        monthOffset: params?.monthOffset ?? 0,
        startDate: params?.startDate || null,
        endDate: params?.endDate || null,
        pendingClarification: {
          intent: 'spent_by_vendor',
          resolvedParams: params || {},
          missingParam: 'vendor',
        },
      },
    }
  }

  const startDate = params?.startDate || undefined
  const endDate = params?.endDate || undefined
  const periodType = params?.periodType || (startDate ? 'custom' : 'month')
  const monthOffset = params?.monthOffset ?? 0

  let result = await listTransactions({
    type: 'expense',
    vendor: vendorParam,
    startDate,
    endDate,
    limit: 500,
  })

  let txs = result.transactions
  if (txs.length === 0) {
    const retry = await listTransactions({
      type: 'expense',
      search: vendorParam,
      startDate,
      endDate,
      limit: 500,
    })
    txs = retry.transactions
  }

  if (txs.length === 0) {
    return {
      type: 'structured',
      text: `Não encontrei compras registradas para "${vendorParam}".`,
      context: {
        lastIntent: 'spent_by_vendor',
        vendor: vendorParam,
        periodType,
        monthOffset,
        startDate,
        endDate,
        entityType: 'vendor_expenses',
        pendingClarification: null,
      },
    }
  }

  const total = txs.reduce((acc, t) => acc + (Number(t.installment_amount) || Number(t.total) || 0), 0)
  const sampleName = txs[0].vendor || vendorParam

  const table = {
    title: `Compras em ${sampleName}`,
    columns: ['Data', 'Categoria', 'Valor'],
    rows: txs.slice(0, 5).map((t) => [
      t.date || 'S/ data',
      t.category || 'Geral',
      formatBRL(Number(t.installment_amount) || Number(t.total) || 0),
    ]),
  }

  return {
    type: 'structured',
    text: `Você possui um total acumulado de ${formatBRL(total)} em ${sampleName}, distribuído em ${txs.length} compra(s).`,
    card: {
      title: `Estabelecimento: ${sampleName}`,
      mainValue: formatBRL(total),
      subtitle: `${txs.length} compra(s) realizadas`,
      metrics: [
        { label: 'Média / compra', value: formatBRL(total / txs.length) },
        { label: 'Última compra', value: txs[0]?.date || 'N/A' },
      ],
    },
    table,
    context: {
      lastIntent: 'spent_by_vendor',
      vendor: sampleName,
      periodType,
      monthOffset,
      startDate,
      endDate,
      entityType: 'vendor_expenses',
      pendingClarification: null,
    },
  }
}

async function resolveCardInvoiceAmount(params?: AssistantExtractedParams | null): Promise<AssistantStructuredResponse> {
  const accounts = await listAccounts({ activeOnly: false })
  const creditCards = accounts.filter((a) => a.type === 'credit_card')

  if (creditCards.length === 0) {
    return {
      type: 'structured',
      text: 'Não há nenhum cartão de crédito cadastrado no sistema.',
      context: {
        pendingClarification: null,
      },
    }
  }

  const searchInst = (params?.accountNameOrInstitution || '').toLowerCase().trim()
  let targetCard: typeof creditCards[0] | null = null

  if (searchInst) {
    const found = creditCards.find(
      (c) =>
        c.name.toLowerCase().includes(searchInst) ||
        (c.institution && c.institution.toLowerCase().includes(searchInst))
    )
    if (found) targetCard = found
  }

  // If user has multiple cards and did not specify one
  if (!targetCard) {
    if (creditCards.length === 1) {
      targetCard = creditCards[0]
    } else {
      const cardNames = creditCards.map((c) => c.name).join(', ')
      return {
        type: 'structured',
        text: `Você possui mais de um cartão cadastrado (${cardNames}). Qual cartão de crédito você deseja consultar?`,
        context: {
          lastIntent: 'card_invoice_amount',
          periodType: params?.periodType || 'month',
          monthOffset: params?.monthOffset ?? 0,
          startDate: params?.startDate || null,
          endDate: params?.endDate || null,
          pendingClarification: {
            intent: 'card_invoice_amount',
            resolvedParams: params || {},
            missingParam: 'accountNameOrInstitution',
          },
        },
      }
    }
  }

  // Calculate reference date for the invoice cycle
  let refDateStr = getCurrentDateTimeContext().date
  if (params?.startDate) {
    refDateStr = params.startDate
  } else if (params?.monthOffset !== undefined && params?.monthOffset !== null && params?.monthOffset !== 0) {
    const targetD = new Date()
    targetD.setMonth(targetD.getMonth() + params.monthOffset)
    refDateStr = targetD.toISOString().slice(0, 10)
  }

  const cDay = targetCard.closing_day || 5
  const dDay = targetCard.due_day || 15
  const currentCycle = getCardInvoiceDates(refDateStr, cDay, dDay)

  const invoiceData = await getOrCreateInvoice(targetCard.id, currentCycle.dueDate, currentCycle.closingDate)
  const invoiceTotal = invoiceData ? invoiceData.computedTotal : 0
  const isPaid = invoiceData?.status === 'paid'

  return {
    type: 'structured',
    text: `A fatura do ${targetCard.name} com vencimento em ${currentCycle.dueDate.slice(8, 10)}/${currentCycle.dueDate.slice(5, 7)}/${currentCycle.dueDate.slice(0, 4)} está em ${formatBRL(invoiceTotal)} (${isPaid ? 'Paga' : 'Em aberto'}).`,
    card: {
      title: `Fatura ${targetCard.name}`,
      mainValue: formatBRL(invoiceTotal),
      subtitle: `Fechamento: ${currentCycle.closingDate.slice(8, 10)}/${currentCycle.closingDate.slice(5, 7)}`,
      badge: {
        label: isPaid ? 'Fatura Paga' : 'Em Aberto',
        variant: isPaid ? 'success' : 'warning',
      },
      metrics: [
        { label: 'Vencimento', value: `${currentCycle.dueDate.slice(8, 10)}/${currentCycle.dueDate.slice(5, 7)}` },
        { label: 'Status', value: isPaid ? 'Paga' : 'Aberta' },
      ],
    },
    context: {
      lastIntent: 'card_invoice_amount',
      accountNameOrInstitution: targetCard.name,
      metric: 'invoice',
      entityType: 'card_invoice',
      invoiceDueDate: currentCycle.dueDate,
      invoiceClosingDate: currentCycle.closingDate,
      invoiceTotal,
      invoicePaid: isPaid,
      pendingClarification: null,
    },
  }
}

async function resolveRemainingInstallments(params?: AssistantExtractedParams | null): Promise<AssistantStructuredResponse> {
  const supabase = getSupabaseClient()
  if (!supabase) {
    return {
      type: 'structured',
      text: 'Nenhuma parcela encontrada no momento.',
    }
  }

  const todayStr = getCurrentDateTimeContext().date
  const targetEnd = params?.targetEndDate || undefined

  let query = supabase
    .from('transactions')
    .select('id, description, vendor, category, date, total, installment_amount, installment_current, installment_total')
    .eq('type', 'expense')
    .gt('installment_total', 1)
    .gte('date', todayStr)
    .order('date', { ascending: true })

  if (targetEnd) {
    query = query.lte('date', targetEnd)
  }

  const { data: futureTxs } = await query

  if (!futureTxs || futureTxs.length === 0) {
    const periodDesc = targetEnd ? `até ${targetEnd.slice(8, 10)}/${targetEnd.slice(5, 7)}/${targetEnd.slice(0, 4)}` : 'a partir de hoje'
    return {
      type: 'structured',
      text: `Você não possui parcelas futuras a vencer ${periodDesc}.`,
      card: {
        title: 'Parcelas Restantes',
        mainValue: formatBRL(0),
        subtitle: 'Tudo quitado no período',
      },
      context: {
        lastIntent: 'remaining_installments',
        targetEndDate: targetEnd,
        entityType: 'installments',
      },
    }
  }

  const totalAmount = futureTxs.reduce((sum, tx) => sum + (Number(tx.installment_amount) || Number(tx.total) || 0), 0)
  const count = futureTxs.length

  const table = {
    title: 'Próximas Parcelas a Vencer',
    columns: ['Data', 'Item / Local', 'Parcela', 'Valor'],
    rows: futureTxs.slice(0, 6).map((t) => [
      t.date || 'S/ data',
      t.vendor || t.description || 'Compra parcelada',
      `${t.installment_current || 1}/${t.installment_total || 1}`,
      formatBRL(Number(t.installment_amount) || Number(t.total) || 0),
    ]),
  }

  // Monthly breakdown for chart
  const monthlySums: Record<string, number> = {}
  futureTxs.forEach((t) => {
    const m = (t.date || '').slice(0, 7)
    if (m) {
      const v = Number(t.installment_amount) || Number(t.total) || 0
      monthlySums[m] = (monthlySums[m] || 0) + v
    }
  })

  const sortedMonths = Object.keys(monthlySums).sort()
  const chart = sortedMonths.length > 1
    ? {
        title: 'Compromissos por Mês',
        type: 'bar' as const,
        labels: sortedMonths.map((m) => `${m.slice(5, 7)}/${m.slice(2, 4)}`),
        data: sortedMonths.map((m) => Number(monthlySums[m].toFixed(2))),
        valuePrefix: 'R$ ',
      }
    : null

  return {
    type: 'structured',
    text: `Você tem ${formatBRL(totalAmount)} a pagar distribuídos em ${count} parcela(s) futuras.`,
    card: {
      title: 'Compromisso de Parcelas',
      mainValue: formatBRL(totalAmount),
      subtitle: `${count} parcela(s) futuras`,
      metrics: [
        { label: 'Próximo vencimento', value: futureTxs[0]?.date || 'N/A' },
        { label: 'Média / parcela', value: formatBRL(totalAmount / count) },
      ],
    },
    table,
    chart,
    context: {
      lastIntent: 'remaining_installments',
      targetEndDate: targetEnd,
      entityType: 'installments',
    },
  }
}

async function resolveCurrentBalance(params?: AssistantExtractedParams | null): Promise<AssistantStructuredResponse> {
  const accounts = await listAccounts({ activeOnly: true, includePaymentMethodAccounts: false })
  const liquidAccounts = accounts.filter((a) => a.type !== 'credit_card')

  if (liquidAccounts.length === 0) {
    return {
      type: 'structured',
      text: 'Nenhuma conta bancária ou carteira cadastrada.',
    }
  }

  const summary = await getDashboardSummary({ periodType: 'month' })
  const metricMap = new Map((summary.accountMetrics || []).map((m) => [m.id, m]))

  const searchInst = (params?.accountNameOrInstitution || '').toLowerCase().trim()

  if (searchInst) {
    const target = liquidAccounts.find(
      (a) =>
        a.name.toLowerCase().includes(searchInst) ||
        (a.institution && a.institution.toLowerCase().includes(searchInst))
    )

    if (target) {
      const metric = metricMap.get(target.id)
      const bal = metric ? metric.balance : 0
      return {
        type: 'structured',
        text: `O saldo atual da conta ${target.name} é ${formatBRL(bal)}.`,
        card: {
          title: `Conta: ${target.name}`,
          mainValue: formatBRL(bal),
          subtitle: target.institution || 'Conta Bancária',
          metrics: [
            { label: 'Entradas no mês', value: formatBRL(metric?.totalIncome || 0) },
            { label: 'Saídas no mês', value: formatBRL(metric?.totalExpenses || 0) },
          ],
        },
        context: {
          lastIntent: 'current_balance',
          accountNameOrInstitution: target.name,
          metric: 'balance',
          entityType: 'balance',
        },
      }
    }
  }

  let totalLiquid = 0
  const rows: Array<Array<string | number>> = []
  const chartLabels: string[] = []
  const chartData: number[] = []

  for (const acc of liquidAccounts) {
    const metric = metricMap.get(acc.id)
    const bal = metric ? metric.balance : 0
    totalLiquid += bal
    rows.push([acc.name, acc.institution || '-', formatBRL(bal)])
    if (bal > 0) {
      chartLabels.push(acc.name)
      chartData.push(Number(bal.toFixed(2)))
    }
  }

  const chart = chartData.length > 0
    ? {
        title: 'Distribuição dos Saldos',
        type: 'donut' as const,
        labels: chartLabels,
        data: chartData,
        valuePrefix: 'R$ ',
      }
    : null

  const table = {
    title: 'Saldos por Conta',
    columns: ['Conta', 'Instituição', 'Saldo Atual'],
    rows,
  }

  return {
    type: 'structured',
    text: `Seu saldo líquido consolidado disponível é de ${formatBRL(totalLiquid)}.`,
    card: {
      title: 'Saldo Consolidado',
      mainValue: formatBRL(totalLiquid),
      subtitle: `${liquidAccounts.length} conta(s) ativas`,
      metrics: [
        { label: 'Contas com saldo', value: String(chartData.length) },
        { label: 'Mês de Ref.', value: summary.period.label },
      ],
    },
    table,
    chart,
    context: {
      lastIntent: 'current_balance',
      metric: 'consolidated_balance',
      entityType: 'balance',
    },
  }
}

async function resolveExportExpenses(params?: AssistantExtractedParams | null): Promise<AssistantStructuredResponse> {
  const periodType = params?.periodType || (params?.startDate ? 'custom' : 'month')
  const monthOffset = params?.monthOffset ?? 0
  const startDate = params?.startDate || undefined
  const endDate = params?.endDate || undefined

  const summary = await getDashboardSummary({ periodType, monthOffset, startDate, endDate })

  const result = await listTransactions({
    type: 'expense',
    startDate: summary.period.startDate,
    endDate: summary.period.endDate,
    limit: 1000,
  })

  const txs = result.transactions
  const filename = `despesas-${summary.period.startDate}-a-${summary.period.endDate}.csv`

  // Build CSV content deterministically (RFC 4180 with UTF-8 BOM)
  const headers = ['Data', 'Estabelecimento', 'Categoria', 'Valor (R$)', 'Forma Pagamento', 'Notas']
  const csvRows = txs.map((t) => {
    const d = t.date || ''
    const v = (t.vendor || t.description || '').replace(/"/g, '""')
    const c = (t.category || '').replace(/"/g, '""')
    const val = (Number(t.installment_amount) || Number(t.total) || 0).toFixed(2)
    const pm = (t.payment_method || '').replace(/"/g, '""')
    const n = (t.notes || '').replace(/"/g, '""')
    return `"${d}","${v}","${c}",${val},"${pm}","${n}"`
  })

  const csvContent = '\uFEFF' + [headers.join(','), ...csvRows].join('\r\n')
  const total = txs.reduce((acc, t) => acc + (Number(t.installment_amount) || Number(t.total) || 0), 0)

  return {
    type: 'structured',
    text: `Gerei o arquivo CSV com os ${txs.length} lançamentos de despesa do período (${summary.period.label}), totalizando ${formatBRL(total)}.`,
    card: {
      title: `Exportação de Despesas`,
      mainValue: `${txs.length} lançamentos`,
      subtitle: summary.period.label,
      metrics: [
        { label: 'Total exportado', value: formatBRL(total) },
        { label: 'Formato', value: 'CSV (Excel/Sheets)' },
      ],
    },
    export: {
      title: filename,
      description: `Planilha pronta para Excel, Numbers e Google Sheets (${txs.length} linhas)`,
      filename,
      csvData: csvContent,
      format: 'csv',
    },
    context: {
      lastIntent: 'export_expenses',
      periodType,
      monthOffset,
      startDate: summary.period.startDate,
      endDate: summary.period.endDate,
    },
  }
}

/**
 * Main query entry point with optional conversational context
 */
export async function executeAssistantQuery(
  userText: string,
  context?: AssistantConversationContext | null
): Promise<AssistantStructuredResponse> {
  const trimmed = userText.trim()
  const sanitizedContext = sanitizeAssistantContext(context)

  if (!trimmed) {
    return {
      type: 'structured',
      text: 'Por favor, envie uma pergunta sobre suas finanças.',
      context: sanitizedContext,
    }
  }

  // Helper to ensure all responses have sanitized contexts
  const wrapResponse = (res: AssistantStructuredResponse): AssistantStructuredResponse => {
    return {
      ...res,
      context: sanitizeAssistantContext(res.context),
    }
  }

  // 1. FAST-PATH: Check if previous turn had a pending clarification
  if (sanitizedContext?.pendingClarification) {
    const { intent, resolvedParams, missingParam } = sanitizedContext.pendingClarification
    const lowerText = trimmed.toLowerCase()

    // Deterministic resolution for missing card/account
    if (missingParam === 'accountNameOrInstitution') {
      const accounts = await listAccounts({ activeOnly: false })
      const creditCards = accounts.filter((a) => a.type === 'credit_card')
      const matchedCard = creditCards.find(
        (c) =>
          lowerText.includes(c.name.toLowerCase()) ||
          (c.institution && lowerText.includes(c.institution.toLowerCase()))
      )

      if (matchedCard) {
        const completedParams: AssistantExtractedParams = {
          ...resolvedParams,
          accountNameOrInstitution: matchedCard.name,
        }
        if (intent === 'card_invoice_amount') {
          return wrapResponse(await resolveCardInvoiceAmount(completedParams))
        }
      }
    }

    // Deterministic resolution for missing category
    if (missingParam === 'category') {
      const categories = await listCategories({ activeOnly: false })
      const normInput = normalizeCategoryName(trimmed)
      const matchedCat = categories.find(
        (c) =>
          c.normalized_name === normInput ||
          normalizeCategoryName(c.name).includes(normInput) ||
          normInput.includes(normalizeCategoryName(c.name))
      )

      if (matchedCat || trimmed.split(/\s+/).length <= 3) {
        const completedParams: AssistantExtractedParams = {
          ...resolvedParams,
          category: matchedCat ? matchedCat.name : trimmed,
        }
        if (intent === 'total_spent_category') {
          return wrapResponse(await resolveTotalSpentCategory(completedParams))
        }
      }
    }

    // Deterministic resolution for missing vendor
    if (missingParam === 'vendor') {
      if (trimmed.split(/\s+/).length <= 4) {
        const completedParams: AssistantExtractedParams = {
          ...resolvedParams,
          vendor: trimmed.replace(/^(no|na|em|o|a)\s+/i, '').trim(),
        }
        if (intent === 'spent_by_vendor') {
          return wrapResponse(await resolveSpentByVendor(completedParams))
        }
      }
    }
  }

  // 2. FAST-PATH: Deterministic referential follow-ups on previously resolved entities ("ela", "essa", "quando vence", "qual o valor")
  if (sanitizedContext?.lastIntent && !sanitizedContext?.pendingClarification) {
    const lower = trimmed.toLowerCase()
    const isReferentialPronoun =
      /\b(ela|essa|este|esse|dele|dela|disso|dessa|desse)\b/i.test(lower) ||
      /\b(quando\s+(?:ela\s+)?vence|vencimento(?:\s+dela|\s+dele)?|qual\s+(?:o\s+)?vencimento|data\s+de\s+vencimento)\b/i.test(lower) ||
      /\b(quanto\s+falta|qual\s+o\s+fechamento|quando\s+fecha)\b/i.test(lower)

    // Referencing previous credit card invoice
    if (sanitizedContext.lastIntent === 'card_invoice_amount' && (isReferentialPronoun || lower.includes('fatura') || lower.includes('vence') || lower.includes('fecha'))) {
      if (sanitizedContext.invoiceDueDate && (lower.includes('vence') || lower.includes('vencimento') || lower.includes('quando'))) {
        const parts = sanitizedContext.invoiceDueDate.split('-')
        const formattedDue = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : sanitizedContext.invoiceDueDate
        const cardName = sanitizedContext.accountNameOrInstitution || 'do seu cartão'
        const isPaid = sanitizedContext.invoicePaid

        return wrapResponse({
          type: 'structured',
          text: `A fatura do ${cardName} vence no dia ${formattedDue} e seu status atual é ${isPaid ? 'Paga' : 'Em aberto'}.`,
          card: {
            title: `Vencimento • ${cardName}`,
            mainValue: formattedDue,
            subtitle: `Valor: ${sanitizedContext.invoiceTotal !== undefined && sanitizedContext.invoiceTotal !== null ? formatBRL(sanitizedContext.invoiceTotal) : 'Consultado'}`,
            badge: {
              label: isPaid ? 'Fatura Paga' : 'Em Aberto',
              variant: isPaid ? 'success' : 'warning',
            },
            metrics: [
              { label: 'Fechamento', value: sanitizedContext.invoiceClosingDate ? `${sanitizedContext.invoiceClosingDate.slice(8, 10)}/${sanitizedContext.invoiceClosingDate.slice(5, 7)}` : 'N/A' },
              { label: 'Status', value: isPaid ? 'Paga' : 'Aberta' },
            ],
          },
          context: sanitizedContext,
        })
      }

      // Re-query the same card for month changes (e.g. "e no mês que vem?")
      if (lower.includes('mês que vem') || lower.includes('proximo mês') || lower.includes('próximo mês')) {
        return wrapResponse(await resolveCardInvoiceAmount({
          accountNameOrInstitution: sanitizedContext.accountNameOrInstitution,
          monthOffset: (sanitizedContext.monthOffset || 0) + 1,
        }))
      }
      if (lower.includes('mês passado') || lower.includes('anterior')) {
        return wrapResponse(await resolveCardInvoiceAmount({
          accountNameOrInstitution: sanitizedContext.accountNameOrInstitution,
          monthOffset: (sanitizedContext.monthOffset || 0) - 1,
        }))
      }
    }

    // Referencing previous category expenses (e.g. "qual foi a maior?", "quanto foi no mês passado?")
    if (sanitizedContext.lastIntent === 'total_spent_category' && sanitizedContext.category) {
      if (lower.includes('maior') || lower.includes('qual foi mais cara') || lower.includes('qual o maior gasto')) {
        return wrapResponse(await resolveLargestExpensePeriod({
          category: sanitizedContext.category,
          periodType: sanitizedContext.periodType,
          monthOffset: sanitizedContext.monthOffset,
          startDate: sanitizedContext.startDate,
          endDate: sanitizedContext.endDate,
        }))
      }
      if (lower.includes('mês passado') || lower.includes('anterior')) {
        return wrapResponse(await resolveTotalSpentCategory({
          category: sanitizedContext.category,
          periodType: 'month',
          monthOffset: -1,
        }))
      }
    }
  }

  try {
    const classification = await classifyAssistantQuery(trimmed, sanitizedContext)

    if (classification.intent === 'out_of_scope') {
      return {
        type: 'structured',
        text: 'Posso ajudar apenas com suas finanças e os dados deste sistema.',
        context: null, // Clear context on topic change to non-financial matter
      }
    }

    if (classification.intent === 'clarification') {
      return wrapResponse({
        type: 'structured',
        text:
          classification.clarificationMessage ||
          'Não entendi completamente sua pergunta. Você poderia detalhar se deseja consultar gastos, saldo, faturas, parcelas ou exportar?',
        context: sanitizedContext,
      })
    }

    if (classification.intent === 'unsupported') {
      return wrapResponse({
        type: 'structured',
        text: 'Esta consulta ainda não está disponível no Assistente Financeiro. No momento posso responder sobre: total gasto no período, gastos por categoria, maior gasto, gastos por estabelecimento, fatura de cartão, parcelas restantes, saldo consolidado e exportação de despesas.',
        context: sanitizedContext,
      })
    }

    switch (classification.intent) {
      case 'total_spent_period':
        return wrapResponse(await resolveTotalSpentPeriod(classification.params))
      case 'total_spent_category':
        return wrapResponse(await resolveTotalSpentCategory(classification.params))
      case 'largest_expense_period':
        return wrapResponse(await resolveLargestExpensePeriod(classification.params))
      case 'spent_by_vendor':
        return wrapResponse(await resolveSpentByVendor(classification.params))
      case 'card_invoice_amount':
        return wrapResponse(await resolveCardInvoiceAmount(classification.params))
      case 'remaining_installments':
        return wrapResponse(await resolveRemainingInstallments(classification.params))
      case 'current_balance':
        return wrapResponse(await resolveCurrentBalance(classification.params))
      case 'export_expenses':
        return wrapResponse(await resolveExportExpenses(classification.params))
      default:
        return wrapResponse({
          type: 'structured',
          text: 'Essa consulta ainda não está disponível.',
          context: sanitizedContext,
        })
    }
  } catch (error) {
    console.error('Error executing assistant query:', error)
    return wrapResponse({
      type: 'structured',
      text: 'Desculpe, ocorreu um erro ao consultar suas finanças. Por favor, tente novamente em alguns instantes.',
      context: sanitizedContext,
    })
  }
}
