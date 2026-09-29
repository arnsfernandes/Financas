import OpenAI from 'openai'
import { getCurrentDateTimeContext, TEXT_MODEL } from './vision'
import type { Receipt } from './schema'

let cachedClient: OpenAI | null = null

function getOpenAIClient(): OpenAI {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not set')
  }
  if (!cachedClient) {
    cachedClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  }
  return cachedClient
}

export function setOpenAIClientForTesting(client: OpenAI | null): void {
  cachedClient = client
}

export type UserIntentType =
  | 'create_transaction'
  | 'query_expenses'
  | 'query_balance'
  | 'query_invoice'
  | 'query_recent'
  | 'clarification'

export interface ParsedUserIntent {
  intent: UserIntentType
  confidence: number
  filters?: {
    category?: string | null
    vendor?: string | null
    accountNameOrInstitution?: string | null
    paymentMethod?: string | null
    periodType?: 'month' | 'today' | 'year' | 'custom' | null
    startDate?: string | null
    endDate?: string | null
    limit?: number | null
  } | null
  clarificationMessage?: string | null
}

const INTENT_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    intent: {
      type: 'string',
      enum: [
        'create_transaction',
        'query_expenses',
        'query_balance',
        'query_invoice',
        'query_recent',
        'clarification',
      ],
    },
    confidence: { type: 'number' },
    filters: {
      type: ['object', 'null'],
      additionalProperties: false,
      properties: {
        category: { type: ['string', 'null'] },
        vendor: { type: ['string', 'null'] },
        accountNameOrInstitution: { type: ['string', 'null'] },
        paymentMethod: { type: ['string', 'null'] },
        periodType: { type: ['string', 'null'], enum: ['month', 'today', 'year', 'custom', null] },
        startDate: { type: ['string', 'null'] },
        endDate: { type: ['string', 'null'] },
        limit: { type: ['number', 'null'] },
      },
      required: ['category', 'vendor', 'accountNameOrInstitution', 'paymentMethod', 'periodType', 'startDate', 'endDate', 'limit'],
    },
    clarificationMessage: { type: ['string', 'null'] },
  },
  required: ['intent', 'confidence', 'filters', 'clarificationMessage'],
} as const

/**
 * Classifies user text intent: whether it is a transaction registration (expense/income),
 * a financial query (expenses by category, invoice, balance, recent), or ambiguous.
 */
export async function parseUserIntent(
  text: string,
  openaiClient: OpenAI = getOpenAIClient(),
): Promise<ParsedUserIntent> {
  const contextDate = getCurrentDateTimeContext()

  const systemPrompt = `You are an intent classifier and financial query router for a personal finance system in Portuguese.

CURRENT REFERENCE DATE (America/Sao_Paulo): ${contextDate.full} (Today is ${contextDate.date})

Your task is to classify what the user wants:

1. 'create_transaction': The user is recording a new expense, purchase, bill, or income.
   Examples:
   - "gastei 85 no mercado hoje no cartão Inter"
   - "comprei cafe 12 reais no debito"
   - "almoço 45 via pix"
   - "recebi 5000 de salario"
   - "pagamento de 150 de luz"

2. 'query_expenses': The user is asking about expenses, spending totals, categories, or metrics.
   Examples:
   - "quanto gastei com mercado este mês?" -> category: "Mercado", periodType: "month"
   - "qual o total de despesas de ontem?" -> periodType: "today", startDate: yesterday
   - "quanto foi gasto em transporte?" -> category: "Transporte"
   - "quanto gastei no carrefour esse mes?" -> vendor: "Carrefour", periodType: "month"
   - "gastos deste mês"

3. 'query_balance': The user is asking about bank account balances or total consolidated balance.
   Examples:
   - "qual o meu saldo?"
   - "quanto tenho no nubank?" -> accountNameOrInstitution: "Nubank"
   - "saldo geral"
   - "qual meu saldo atual?"

4. 'query_invoice': The user is asking about credit card invoices / fatura de cartão.
   Examples:
   - "qual a fatura do Inter?" -> accountNameOrInstitution: "Inter"
   - "quanto está a fatura do nubank?" -> accountNameOrInstitution: "Nubank"
   - "qual o valor da minha fatura de cartão?"
   - "minhas faturas abertas"

5. 'query_recent': The user is asking to view recent / latest transactions.
   Examples:
   - "quais foram meus ultimos gastos?"
   - "ultimas compras"
   - "ver ultimos lançamentos"
   - "o que comprei ontem?"

6. 'clarification': The input is ambiguous, incomplete, or neither a clear query nor transaction.
   Example: "mercado", "inter", "qual?", "oi"
   Provide a polite explanation in clarificationMessage in Portuguese asking for details.

Always extract deterministic filters if present:
- category: Standard Portuguese category name (e.g. "Mercado", "Alimentação", "Transporte", "Saúde", "Lazer", "Compras", "Moradia", etc.) or null
- vendor: Vendor name (e.g. "Carrefour", "Uber", "Amazon") or null
- accountNameOrInstitution: Institution or account (e.g. "Inter", "Nubank", "Itaú", "Bradesco", "C6") or null
- periodType: 'month' (default for "este mês" / "esse mês"), 'today' ("hoje"), 'year' ("este ano"), 'custom' (if date range)
- startDate / endDate: in YYYY-MM-DD format if dates are identifiable
- limit: integer if user asked for N items (e.g. "últimos 5 gastos" -> 5), else null
`

  const response = await openaiClient.chat.completions.create({
    model: TEXT_MODEL,
    temperature: 0,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: text },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'user_intent',
        strict: true,
        schema: INTENT_JSON_SCHEMA,
      },
    },
  })

  const content = response.choices[0]?.message?.content?.trim()
  if (!content) {
    return {
      intent: 'create_transaction',
      confidence: 0.5,
      filters: null,
      clarificationMessage: null,
    }
  }

  const parsed = JSON.parse(content) as ParsedUserIntent
  return parsed
}

export interface PreviewCorrectionResult {
  updatedReceipt: Receipt
  changedFields: string[]
}

const CORRECTION_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    total: { type: ['number', 'null'] },
    vendor: { type: ['string', 'null'] },
    category: { type: ['string', 'null'] },
    payment_method: { type: ['string', 'null'] },
    date: { type: ['string', 'null'] },
    account_name_or_institution: { type: ['string', 'null'] },
    type: { type: ['string', 'null'], enum: ['expense', 'income', null] },
    installment_total: { type: ['number', 'null'] },
    is_recurring: { type: ['boolean', 'null'] },
    notes: { type: ['string', 'null'] },
    changed_fields: {
      type: 'array',
      items: { type: 'string' },
    },
  },
  required: [
    'total',
    'vendor',
    'category',
    'payment_method',
    'date',
    'account_name_or_institution',
    'type',
    'installment_total',
    'is_recurring',
    'notes',
    'changed_fields',
  ],
} as const

/**
 * Parses user correction message for an existing pending receipt preview.
 * Example: "foi no Pix", "a conta é Inter", "na verdade foi 95 reais", "muda categoria para Alimentação"
 */
export async function parsePreviewCorrection(
  currentReceipt: Receipt,
  correctionText: string,
  openaiClient: OpenAI = getOpenAIClient(),
): Promise<PreviewCorrectionResult> {
  const contextDate = getCurrentDateTimeContext()

  const systemPrompt = `You are a financial transaction editor. The user has a pending unconfirmed transaction preview and is sending a correction message to modify one or more fields of the preview.

CURRENT REFERENCE DATE (America/Sao_Paulo): ${contextDate.full} (Today is ${contextDate.date})

CURRENT TRANSACTION STATE:
- Type: ${currentReceipt.type || 'expense'}
- Total: ${currentReceipt.total || 0}
- Vendor: ${currentReceipt.vendor || 'null'}
- Category: ${currentReceipt.category || 'null'}
- Payment Method: ${currentReceipt.payment_method || 'null'}
- Date: ${currentReceipt.date || 'null'}
- Installments: ${currentReceipt.installment_total || 1}
- Recurring: ${currentReceipt.is_recurring ? 'true' : 'false'}
- Notes: ${currentReceipt.notes || 'null'}

RULES:
1. Identify which fields the user wants to change.
2. Return values ONLY for fields explicitly requested by the user. Return null for every unchanged field. Never copy values from another transaction. changed_fields must list only the requested edits.
3. If the user mentions "pix", "no pix", "via pix" -> payment_method = "Pix".
4. If the user mentions "cartão", "crédito" -> payment_method = "Cartão de Crédito".
5. If the user mentions an institution or bank (e.g. "conta Inter", "no Nubank", "Itaú") -> account_name_or_institution = "Inter", "Nubank", etc.
6. If the user mentions a new value (e.g. "foi 90 reais", "valor é 45.50") -> update total.
7. If the user mentions a new category (e.g. "categoria Alimentação", "muda pra Mercado") -> update category.
8. If the user mentions a new date (e.g. "foi ontem", "data 20/09") -> output ISO YYYY-MM-DD in date.
9. List all changed field names in 'changed_fields' (e.g. ["payment_method", "account_id"]).
`

  const response = await openaiClient.chat.completions.create({
    model: TEXT_MODEL,
    temperature: 0,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: correctionText },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'preview_correction',
        strict: true,
        schema: CORRECTION_JSON_SCHEMA,
      },
    },
  })

  const content = response.choices[0]?.message?.content?.trim()
  if (!content) {
    return {
      updatedReceipt: { ...currentReceipt },
      changedFields: [],
    }
  }

  const parsed = JSON.parse(content)
  const updatedReceipt: Receipt = { ...currentReceipt }
  const changedFields: string[] = Array.isArray(parsed.changed_fields) ? parsed.changed_fields : []
  // The editor returns a patch, not a replacement receipt. Ignore echoed or
  // unrelated values even when the model returns them as non-null fields.
  for (const field of ['total', 'vendor', 'category', 'payment_method', 'date', 'type', 'installment_total', 'is_recurring', 'notes', 'account_name_or_institution']) {
    const requested = changedFields.includes(field) || (field === 'account_name_or_institution' && changedFields.includes('account_id'))
    if (!requested) parsed[field] = null
  }

  if (typeof parsed.total === 'number' && parsed.total > 0) {
    updatedReceipt.total = parsed.total
    if (!changedFields.includes('total')) changedFields.push('total')
  }
  if (parsed.vendor) {
    updatedReceipt.vendor = parsed.vendor
    if (!changedFields.includes('vendor')) changedFields.push('vendor')
  }
  if (parsed.category) {
    updatedReceipt.category = parsed.category
    if (!changedFields.includes('category')) changedFields.push('category')
  }
  if (parsed.payment_method) {
    updatedReceipt.payment_method = parsed.payment_method
    if (!changedFields.includes('payment_method')) changedFields.push('payment_method')
  }
  if (parsed.date) {
    updatedReceipt.date = parsed.date
    if (!changedFields.includes('date')) changedFields.push('date')
  }
  if (parsed.type) {
    updatedReceipt.type = parsed.type
    if (!changedFields.includes('type')) changedFields.push('type')
  }
  if (typeof parsed.installment_total === 'number') {
    updatedReceipt.installment_total = parsed.installment_total
    if (parsed.installment_total > 1 && updatedReceipt.total) {
      updatedReceipt.installment_amount = Math.round((updatedReceipt.total / parsed.installment_total) * 100) / 100
    }
    if (!changedFields.includes('installment_total')) changedFields.push('installment_total')
  }
  if (typeof parsed.is_recurring === 'boolean') {
    updatedReceipt.is_recurring = parsed.is_recurring
    if (!changedFields.includes('is_recurring')) changedFields.push('is_recurring')
  }
  if (parsed.notes) {
    updatedReceipt.notes = parsed.notes
    if (!changedFields.includes('notes')) changedFields.push('notes')
  }

  // Se o usuário especificou ou corrigiu a conta / banco
  if (parsed.account_name_or_institution) {
    try {
      const { listAccounts } = await import('./queries')
      const { normalizeInstitutionKey } = await import('./institutions')
      const allAccounts = await listAccounts()
      const searchKey = normalizeInstitutionKey(parsed.account_name_or_institution.toLowerCase())
      const matched = allAccounts.find((a) => {
        const nameLower = a.name.toLowerCase()
        const instLower = (a.institution || '').toLowerCase()
        if (searchKey && (nameLower.includes(searchKey) || instLower.includes(searchKey))) return true
        return nameLower.includes(parsed.account_name_or_institution.toLowerCase())
      })
      if (matched) {
        updatedReceipt.account_id = matched.id
        if (matched.type === 'credit_card' && !updatedReceipt.payment_method) {
          updatedReceipt.payment_method = 'Cartão de Crédito'
        }
        if (!changedFields.includes('account_id')) changedFields.push('account_id')
      }
    } catch {
      // Silently continue
    }
  }

  return {
    updatedReceipt,
    changedFields,
  }
}

/** AI only separates descriptions; each goes through the existing receipt parser. */
export async function splitTransactionText(text: string, client: OpenAI = getOpenAIClient()): Promise<string[]> {
  const response = await client.chat.completions.create({
    model: TEXT_MODEL, temperature: 0,
    messages: [
      { role: 'system', content: `Separe lançamentos financeiros independentes usando somente trechos LITERAIS, contínuos e não sobrepostos do texto original, na ordem original, em descriptions. Não reescreva, complete nem repita palavras de outro trecho.
Cada trecho deve conter somente informações atribuídas àquele lançamento. Nunca herde conta, cartão, forma de pagamento, categoria, valor, data ou qualquer outro campo dos vizinhos. Uma informação no primeiro ou último lançamento NÃO tem escopo global por posição ou por ser repetida em outros itens.
shared_context deve ser null, salvo quando houver um trecho explicitamente global, marcado por "todos", "todas", "tudo", "ambos", "ambas" ou "cada lançamento". Nesse caso, devolva esse trecho LITERAL completo em shared_context, incluindo o marcador, e exclua-o das descriptions. Não inclua informações locais nesse trecho.
Exemplo: "gastei 45 no mercado no cartão Inter, 80 de gasolina e 32 de farmácia no cartão Inter" -> descriptions: ["gastei 45 no mercado no cartão Inter", "80 de gasolina", "32 de farmácia no cartão Inter"], shared_context: null.
Exemplo: "45 mercado, 80 gasolina e 32 farmácia, tudo no cartão Inter" -> descriptions: ["45 mercado", "80 gasolina", "32 farmácia"], shared_context: "tudo no cartão Inter".
Preserve campos ausentes. Produtos de uma mesma compra e parcelas são um único lançamento. Se houver apenas um lançamento, devolva o texto original em descriptions e shared_context null.` },
      { role: 'user', content: text },
    ],
    response_format: { type: 'json_schema', json_schema: { name: 'transaction_descriptions', strict: true,
      schema: { type: 'object', additionalProperties: false, properties: {
        descriptions: { type: 'array', items: { type: 'string' } },
        shared_context: { type: ['string', 'null'] },
      }, required: ['descriptions', 'shared_context'] } } },
  })
  const parsed = JSON.parse(response.choices[0]?.message?.content || '{}')
  if (!Array.isArray(parsed.descriptions) || !parsed.descriptions.length ||
      parsed.descriptions.some((v: unknown) => typeof v !== 'string' || !v.trim())) {
    throw new Error('Não foi possível separar os lançamentos.')
  }
  // Ground every fragment in the original message: rewritten model output cannot
  // inject a neighbour's fields into an otherwise incomplete launch.
  const shared = parsed.shared_context
  if (shared !== null && (typeof shared !== 'string' || !shared.trim() ||
      !/^(todos|todas|tudo|ambos|ambas|cada lançamento|cada lancamento)\b/i.test(shared))) {
    throw new Error('Contexto compartilhado sem escopo global explícito.')
  }
  const sharedStart = shared === null ? -1 : text.indexOf(shared)
  if (shared !== null && sharedStart < 0) throw new Error('Contexto compartilhado não encontrado no texto original.')
  let cursor = 0
  for (const description of parsed.descriptions as string[]) {
    const start = text.indexOf(description, cursor)
    const end = start + description.length
    if (start < 0 || (shared !== null && start < sharedStart + shared.length && end > sharedStart)) {
      throw new Error('Os lançamentos devem usar trechos independentes do texto original.')
    }
    cursor = end
  }
  return parsed.descriptions.map((description: string) => shared === null ? description : `${description} ${shared}`)
}
