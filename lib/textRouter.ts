import { getCurrentDateTimeContext } from './vision'
import type { Account, Category, Receipt } from './schema'
import { normalizeInstitutionKey } from './institutions'
import { normalizeCategoryName } from './queries'
import { resolveInstallmentPlan, parseInstallmentFromText } from './installments'

export interface LocalRoutingStats {
  localQueries: number
  localLaunches: number
  aiCalls: number
}

const stats: LocalRoutingStats = {
  localQueries: 0,
  localLaunches: 0,
  aiCalls: 0,
}

export function getLocalRoutingStats(): LocalRoutingStats {
  return { ...stats }
}

export function recordLocalQuery(): void {
  stats.localQueries += 1
}

export function recordLocalLaunch(): void {
  stats.localLaunches += 1
}

export function recordAiCall(): void {
  stats.aiCalls += 1
}

export function resetLocalRoutingStats(): void {
  stats.localQueries = 0
  stats.localLaunches = 0
  stats.aiCalls = 0
}

export type MissingRequiredField = 'payment_method' | 'account' | 'amount'

export interface LaunchValidationResult {
  isComplete: boolean
  missingField?: MissingRequiredField
  reason?: string
}

/**
 * Validates if a transaction has all necessary fields before enabling Confirm.
 * Rules:
 * - Expense must have a payment_method.
 * - If payment_method is Pix, Débito, Dinheiro, Transferência: needs an account (checking/cash/wallet/savings).
 * - If payment_method is Cartão de Crédito or has installments: needs a credit_card account.
 * - If payment_method is Dinheiro: optional cash account or general.
 * - Income: needs an account to receive the funds.
 */
export function validateLaunchCompleteness(
  receipt: Receipt,
  accounts: Account[]
): LaunchValidationResult {
  if (typeof receipt.total !== 'number' || !Number.isFinite(receipt.total) || receipt.total <= 0) {
    return { isComplete: false, missingField: 'amount', reason: 'Informe o valor do lançamento' }
  }
  const isExpense = receipt.type !== 'income'

  if (isExpense) {
    if (!receipt.payment_method) {
      return {
        isComplete: false,
        missingField: 'payment_method',
        reason: 'Selecione a forma de pagamento',
      }
    }

    const pm = receipt.payment_method.toLowerCase()
    const isCredit =
      pm.includes('crédito') ||
      pm.includes('credito') ||
      Boolean(receipt.installment_total && receipt.installment_total > 1)
    const isCash =
      pm.includes('dinheiro') ||
      pm.includes('espécie') ||
      pm.includes('especie')

    if (!receipt.account_id && !isCash) {
      return {
        isComplete: false,
        missingField: 'account',
        reason: isCredit
          ? 'Selecione o cartão de crédito'
          : 'Selecione a conta de pagamento',
      }
    }

    if (receipt.account_id) {
      const acc = accounts.find((a) => a.id === receipt.account_id)
      if (isCredit && acc && acc.type !== 'credit_card') {
        return {
          isComplete: false,
          missingField: 'account',
          reason: 'A forma de pagamento crédito exige um cartão de crédito',
        }
      }
      if (!isCredit && !isCash && acc && acc.type === 'credit_card') {
        return {
          isComplete: false,
          missingField: 'account',
          reason:
            'Pagamento via Pix ou Débito exige uma conta bancária/carteira, não cartão de crédito',
        }
      }
    }
  } else {
    // Income: needs an account (bank_account, checking, wallet, cash, etc.)
    if (!receipt.account_id) {
      return {
        isComplete: false,
        missingField: 'account',
        reason: 'Selecione a conta de destino',
      }
    }
  }

  return { isComplete: true }
}

export type DeterministicQueryIntent =
  | { type: 'balance'; targetAccount?: Account | null; ambiguousAccountName?: string }
  | { type: 'invoice'; targetAccount?: Account | null; ambiguousAccountName?: string }
  | { type: 'expenses'; category?: string; periodType?: 'month' | 'today' | 'custom' }
  | { type: 'recent'; limit?: number }

/**
 * Normalizes text for keyword matching: strips accents, lowercases, cleans punctuation.
 */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s$,.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * 1. DETERMINISTIC QUERY MATCHER (Zero AI)
 * Detects unambiguous natural queries like:
 * - "qual meu saldo?", "saldo no Nubank", "quanto tenho no Inter?"
 * - "qual a fatura do Inter?", "faturas abertas", "quanto tá a fatura do Nubank?"
 * - "quanto gastei este mês?", "gastos de hoje", "gastos com mercado"
 * - "ultimas compras", "ultimos 5 gastos"
 */
export function matchDeterministicQuery(
  rawText: string,
  accounts: Account[]
): DeterministicQueryIntent | null {
  const norm = normalizeText(rawText)

  // Must not look like a financial recording or action
  if (/^(gastei|comprei|paguei|recebi|pagamento de|compre|lancar|cadastrar)\b/i.test(norm)) {
    return null
  }

  // --- A. Query Saldo / Balance ---
  // Matches: "qual meu saldo", "qual o saldo", "ver saldo", "quanto tenho na conta", "saldo no inter", "saldo"
  if (
    /^(qual|quanto|ver|consultar|meu|mostrar)?\s*(o\s+|meu\s+|de\s+)?(saldo|saldos)\b/i.test(norm) ||
    /^(quanto\s+(eu\s+)?tenho(\s+de\s+saldo)?(\s+no|\s+na|\s+em|\s+de)?)/i.test(norm) ||
    /^saldo\b/i.test(norm)
  ) {
    // Check if a specific account is mentioned
    const matched = findAccountInText(norm, accounts)
    if (matched.ambiguous) {
      return { type: 'balance', ambiguousAccountName: matched.ambiguousName }
    }
    return { type: 'balance', targetAccount: matched.account || undefined }
  }

  // --- B. Query Fatura / Invoice ---
  // Matches: "qual a fatura", "fatura do inter", "quanto esta a fatura", "minhas faturas", "fatura"
  if (
    /^(qual|quanto|ver|consultar|mostrar)?\s*(a\s+|minha\s+|as\s+|minhas\s+)?(fatura|faturas)\b/i.test(norm) ||
    /\b(fatura\s+(do|da|de|no|na))\b/i.test(norm)
  ) {
    const matched = findAccountInText(norm, accounts, 'credit_card')
    if (matched.ambiguous) {
      return { type: 'invoice', ambiguousAccountName: matched.ambiguousName }
    }
    return { type: 'invoice', targetAccount: matched.account || undefined }
  }

  // --- C. Query Últimos Lançamentos / Recent ---
  // Matches: "ultimos gastos", "ultimas compras", "ultimos lancamentos", "ver ultimos 5"
  if (
    /\b(ultim(os|as))\s+(gastos|compras|lancamentos|despesas|registros|transacoes)\b/i.test(norm) ||
    /\b(ver\s+ultim(os|as))\b/i.test(norm)
  ) {
    const limitMatch = norm.match(/\b(\d+)\b/)
    const limit = limitMatch ? parseInt(limitMatch[1], 10) : 10
    return { type: 'recent', limit: limit > 0 && limit <= 50 ? limit : 10 }
  }

  // --- D. Query Gastos / Despesas ---
  // Matches: "quanto gastei este mes", "gastos deste mes", "total de despesas", "quanto gastei com mercado"
  if (
    /^(quanto\s+(eu\s+)?gastei|gastos|despesas|total\s+(de\s+)?gastos|total\s+(de\s+)?despesas)\b/i.test(norm)
  ) {
    // Check if a category is mentioned (e.g. mercado, alimentacao, transporte, etc.)
    let category: string | undefined
    if (/\b(mercado|supermercado)\b/i.test(norm)) category = 'Mercado'
    else if (/\b(alimentacao|comida|restaurante|almoco|jantar)\b/i.test(norm)) category = 'Alimentação'
    else if (/\b(transporte|uber|combustivel|gasolina|onibus)\b/i.test(norm)) category = 'Transporte'
    else if (/\b(moradia|aluguel|condominio|luz|agua|internet)\b/i.test(norm)) category = 'Moradia'
    else if (/\b(saude|farmacia|medico|remedio)\b/i.test(norm)) category = 'Saúde'
    else if (/\b(lazer|cinema|viagem|passeio|jogos)\b/i.test(norm)) category = 'Lazer'
    else if (/\b(compras|roupa|calcado|shopping)\b/i.test(norm)) category = 'Compras'
    else if (/\b(educacao|curso|livro|faculdade|escola)\b/i.test(norm)) category = 'Educação'
    else if (/\b(assinaturas|streaming|netflix|spotify)\b/i.test(norm)) category = 'Assinaturas'
    else if (/\b(servicos)\b/i.test(norm)) category = 'Serviços'

    let periodType: 'month' | 'today' | 'custom' = 'month'
    if (/\b(hoje)\b/i.test(norm)) periodType = 'today'

    return { type: 'expenses', category, periodType }
  }

  return null
}

/**
 * Finds if an account is mentioned in text, checking exact account name, institution or keywords.
 */
export function findAccountInText(
  normText: string,
  accounts: Account[],
  filterType?: string
): { account?: Account | null; ambiguous?: boolean; ambiguousName?: string } {
  const eligible = filterType ? accounts.filter((a) => a.type === filterType) : accounts
  if (eligible.length === 0) return { account: null }

  // 1. Direct match with account name (e.g. "Cartão Inter", "Nubank Conta", "Carteira")
  const directMatches = eligible.filter((a) => {
    const aNorm = normalizeText(a.name)
    return aNorm.length >= 3 && normText.includes(aNorm)
  })
  if (directMatches.length === 1) {
    return { account: directMatches[0] }
  }
  if (directMatches.length > 1) {
    return { ambiguous: true, ambiguousName: directMatches.map((a) => a.name).join(', ') }
  }

  // 2. Institution matching (e.g. "inter", "nubank", "itau", "bradesco", "c6")
  const instKey = normalizeInstitutionKey(normText)
  if (instKey) {
    const instMatches = eligible.filter((a) => {
      const aInst = normalizeInstitutionKey(a.institution || a.name)
      return aInst === instKey
    })
    if (instMatches.length === 1) {
      return { account: instMatches[0] }
    }
    if (instMatches.length > 1) {
      // If multiple accounts share institution (e.g. Inter Débito e Inter Crédito), check context words
      if (/\b(cartao|credito|fatura)\b/i.test(normText)) {
        const cc = instMatches.find((a) => a.type === 'credit_card')
        if (cc) return { account: cc }
      }
      if (/\b(conta|debito|saldo|corrente)\b/i.test(normText)) {
        const checking = instMatches.find((a) => a.type !== 'credit_card')
        if (checking) return { account: checking }
      }
      return { ambiguous: true, ambiguousName: instMatches.map((a) => a.name).join(', ') }
    }
    // Mentioned institution not registered in accounts
    return { ambiguous: true, ambiguousName: instKey }
  }

  return { account: null }
}

/**
 * Helper to detect if a message attempts to log multiple separate expenses at once.
 * Examples:
 * - "gastei 50 no mercado e 30 na farmácia"
 * - "arroz 25, feijão 10 e carne 40"
 * - "almoço 45 e uber 20"
 */
export function isMultiExpenseText(rawText: string): boolean {
  const norm = normalizeText(rawText)

  // Candidate only: AI distinguishes separate launches from products, dates and installments.
  const amountCount = (rawText.match(/\d+(?:[.,]\d+)?/g) || []).length
  if ((/[,;\n]|\b(e|tambem|mais)\b/i.test(rawText) && amountCount >= 2) ||
      (/\b(e|tambem|mais)\b/i.test(rawText) && amountCount >= 1)) return true

  // Explicit conjunctions of multiple expenses
  if (/\b(e tambem|e mais|alem de|depois comprei|depois gastei|e gastei|e paguei)\b/i.test(norm)) {
    return true
  }

  // Count monetary amounts
  const allAmountMatches = norm.match(/(?:r\$\s*|reais\s*)?(\d+(?:[.,]\d{1,2})?)\s*(?:reais|r\$)?/gi) || []
  const numbersFound: number[] = []
  for (const m of allAmountMatches) {
    const cleanNum = m.replace(/[^\d.,]/g, '').replace(',', '.')
    const val = parseFloat(cleanNum)
    if (!isNaN(val) && val > 0 && !numbersFound.includes(val)) {
      numbersFound.push(val)
    }
  }

  const installmentMatch = norm.match(/\b(?:em\s+)?(\d{1,2})\s*(?:x|vezes|parcelas?)\b/i)
  const installmentCount = installmentMatch ? parseInt(installmentMatch[1], 10) : 1
  const nonInstallmentNumbers = numbersFound.filter((n) => n !== installmentCount)

  if (nonInstallmentNumbers.length > 1) {
    // Check if there are multiple action verbs or multiple items linked by 'e' / ','
    if (
      /\b(e|mais|\+|,)\b/.test(norm) ||
      /\b(gastei|comprei|paguei|mercado|uber|farmacia|almoço|almoco|lanche)\b.*\b(gastei|comprei|paguei|mercado|uber|farmacia|almoço|almoco|lanche)\b/i.test(norm)
    ) {
      return true
    }
  }

  return false
}

export interface LocalParseResult {
  success: boolean
  receipt?: Receipt
  missingField?: 'amount' | 'account' | 'vendor'
  requiresClarification?: boolean
  clarificationMessage?: string
}

/**
 * 2. DETERMINISTIC LOCAL EXPENSE/INCOME PARSER (Zero AI)
 * Resolves single transactions with clear values, vendor/category, payment method and accounts.
 * If ambiguous or multi-item, returns success: false so the bot seamlessly delegates to AI.
 */
export function parseSingleTransactionLocally(
  rawText: string,
  accounts: Account[],
  categories: Category[]
): LocalParseResult {
  const norm = normalizeText(rawText)

  // Disqualify complex / multi-transaction patterns immediately
  // e.g. "e", "também", "mais", multiple different amounts, lists with commas and multiple prices
  if (/\b(e tambem|e mais|alem de|depois comprei|e gastei)\b/i.test(norm)) {
    return { success: false }
  }

  // Check multiple distinct currency/amount occurrences
  const allAmountMatches = norm.match(/(?:r\$\s*|reais\s*)?(\d+(?:[.,]\d{1,2})?)\s*(?:reais|r\$)?/gi) || []
  const numbersFound: number[] = []
  for (const m of allAmountMatches) {
    const cleanNum = m.replace(/[^\d.,]/g, '').replace(',', '.')
    const val = parseFloat(cleanNum)
    if (!isNaN(val) && val > 0 && !numbersFound.includes(val)) {
      numbersFound.push(val)
    }
  }

  // If there are multiple distinct amounts with different values (e.g. "arroz 25 e feijao 10"), fallback to AI
  if (numbersFound.length > 1) {
    // Check if the extra number is an installment number like "2x", "em 3x", "3 parcelas"
    const installmentMatch = norm.match(/\b(?:em\s+)?(\d{1,2})\s*(?:x|vezes|parcelas?)\b/i)
    const installmentCount = installmentMatch ? parseInt(installmentMatch[1], 10) : 1
    const nonInstallmentNumbers = numbersFound.filter((n) => n !== installmentCount)
    if (nonInstallmentNumbers.length > 1) {
      return { success: false }
    }
  }

  // 1. Determine Type: Expense vs Income
  const isIncome = /^(recebi|recebido|recebimento|entrou|ganhei|salario|reembolso|vendi|rendimento)\b/i.test(norm)
  const isExplicitExpense = /^(gastei|comprei|paguei|pagamento|despesa|almoço|almoco|jantar|lanche|uber|ifood|mercado)\b/i.test(norm)

  const type: 'expense' | 'income' = isIncome ? 'income' : 'expense'

  // 2. Extract Value / Total
  let total: number | null = null
  const amountPattern = /(?:r\$\s*|reais\s*)?(\d+(?:[.,]\d{1,2})?)\s*(?:reais|r\$)?/i
  const valMatch = norm.match(amountPattern)
  if (valMatch) {
    // Search the primary amount from text tokens
    for (const token of norm.split(' ')) {
      const tClean = token.replace(/^r\$/i, '').replace(/reais$/i, '').trim()
      if (/^\d+([.,]\d{1,2})?$/.test(tClean)) {
        const parsed = parseFloat(tClean.replace(',', '.'))
        if (!isNaN(parsed) && parsed > 0) {
          total = parsed
          break
        }
      }
    }
  }

  if (!total || total <= 0) {
    return { success: false, missingField: 'amount' }
  }

  // 3. Extract Date (Relative or explicit)
  const dateCtx = getCurrentDateTimeContext()
  let date: string = dateCtx.date

  if (/\b(ontem)\b/i.test(norm)) {
    const d = new Date()
    d.setDate(d.getDate() - 1)
    date = d.toISOString().slice(0, 10)
  } else if (/\b(anteontem)\b/i.test(norm)) {
    const d = new Date()
    d.setDate(d.getDate() - 2)
    date = d.toISOString().slice(0, 10)
  } else if (/\b(amanha|amanhã)\b/i.test(norm)) {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    date = d.toISOString().slice(0, 10)
  } else {
    // Explicit date format: DD/MM or DD/MM/YYYY
    const dateMatch = norm.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/)
    if (dateMatch) {
      const d = String(dateMatch[1]).padStart(2, '0')
      const m = String(dateMatch[2]).padStart(2, '0')
      const y = dateMatch[3] ? (dateMatch[3].length === 2 ? `20${dateMatch[3]}` : dateMatch[3]) : dateCtx.date.slice(0, 4)
      date = `${y}-${m}-${d}`
    }
  }

  // 4. Extract Payment Method
  let paymentMethod: string | null = null
  if (/\b(pix|via pix|no pix|chave pix|pelo pix|paguei no pix|paguei via pix)\b/i.test(norm)) {
    paymentMethod = 'Pix'
  } else if (/\b(credito|cartao de credito|no cartao|no credito|parcelado)\b/i.test(norm)) {
    paymentMethod = 'Cartão de Crédito'
  } else if (/\b(debito|cartao de debito|no debito)\b/i.test(norm)) {
    paymentMethod = 'Cartão de Débito'
  } else if (/\b(dinheiro|em especie|em dinheiro|no dinheiro)\b/i.test(norm)) {
    paymentMethod = 'Dinheiro'
  }

  // 5. Match Account (DO NOT infer account solely because of "Pix")
  let accountId: string | null = null
  const accountMatch = findAccountInText(norm, accounts)
  if (accountMatch.ambiguous) {
    // If ambiguous account was mentioned (e.g. user said "no banco" or unknown bank), let AI decide or ask
    return { success: false }
  }
  if (accountMatch.account) {
    accountId = accountMatch.account.id
    if (accountMatch.account.type === 'credit_card' && !paymentMethod) {
      paymentMethod = 'Cartão de Crédito'
    }
  }

  // 6. Extract Installments (Parcelas)
  let installmentTotal: number | null = null
  let installmentCurrent: number | null = null
  let installmentAmount: number | null = null
  let installmentDateAnchor: 'purchase_date' | 'current_installment' | null = null
  const parsedInst = parseInstallmentFromText(rawText)
  if (parsedInst) {
    installmentTotal = parsedInst.total
    installmentCurrent = parsedInst.current
    installmentDateAnchor = parsedInst.anchor || (parsedInst.current === 1 ? 'purchase_date' : 'purchase_date')
    installmentAmount = Math.round((total / parsedInst.total) * 100) / 100
    if (!paymentMethod) {
      paymentMethod = 'Cartão de Crédito'
    }
  }

  // 7. Extract Recurrence
  let isRecurring = false
  let recurrenceFrequency: 'monthly' | 'weekly' | 'yearly' | null = null
  if (/\b(recorrente|todo mes|todo mês|mensalmente|assinatura fixa|despesa fixa)\b/i.test(norm)) {
    isRecurring = true
    recurrenceFrequency = 'monthly'
  } else if (/\b(toda semana|semanalmente)\b/i.test(norm)) {
    isRecurring = true
    recurrenceFrequency = 'weekly'
  } else if (/\b(todo ano|anualmente)\b/i.test(norm)) {
    isRecurring = true
    recurrenceFrequency = 'yearly'
  }

  // 8. Match Category & Vendor/Description
  let categoryName: string | null = null
  let vendorName: string | null = null

  if (type === 'income') {
    if (/\b(salario|salário|holerite)\b/i.test(norm)) {
      categoryName = 'Salário'
      vendorName = 'Salário'
    } else if (/\b(freelance|freela|bico|projeto)\b/i.test(norm)) {
      categoryName = 'Freelance'
      vendorName = 'Freelance'
    } else if (/\b(venda|vendas|vendi)\b/i.test(norm)) {
      categoryName = 'Vendas'
      vendorName = 'Venda'
    } else if (/\b(reembolso|estorno)\b/i.test(norm)) {
      categoryName = 'Reembolsos'
      vendorName = 'Reembolso'
    } else if (/\b(rendimento|dividendos|juros)\b/i.test(norm)) {
      categoryName = 'Rendimentos'
      vendorName = 'Rendimentos'
    } else {
      categoryName = 'Outros'
      vendorName = 'Receita'
    }
  } else {
    // Expense Categories & Vendors
    if (/\b(mercado|supermercado|carrefour|pao de acucar|extra|assai|atacadao|mambo|dia)\b/i.test(norm)) {
      categoryName = 'Mercado'
      if (/\bcarrefour\b/i.test(norm)) vendorName = 'Carrefour'
      else if (/\bpao de acucar\b/i.test(norm)) vendorName = 'Pão de Açúcar'
      else if (/\bextra\b/i.test(norm)) vendorName = 'Extra'
      else if (/\bassai\b/i.test(norm)) vendorName = 'Assaí'
      else if (/\batacadao\b/i.test(norm)) vendorName = 'Atacadão'
      else vendorName = 'Mercado'
    } else if (/\b(uber|99|99app|taxi|transporte|gasolina|combustivel|posto|shell|ipiranga|petrobras)\b/i.test(norm)) {
      categoryName = 'Transporte'
      if (/\buber\b/i.test(norm)) vendorName = 'Uber'
      else if (/\b99\b/i.test(norm)) vendorName = '99'
      else if (/\bshell\b/i.test(norm)) vendorName = 'Posto Shell'
      else if (/\bipiranga\b/i.test(norm)) vendorName = 'Posto Ipiranga'
      else if (/\bgasolina\b/i.test(norm)) vendorName = 'Gasolina'
      else vendorName = 'Transporte'
    } else if (/\b(ifood|restaurante|almoco|almoço|jantar|lanche|mcdonalds|burger king|subway|pizza|hamburguer|padaria|cafe|café)\b/i.test(norm)) {
      categoryName = 'Alimentação'
      if (/\bifood\b/i.test(norm)) vendorName = 'iFood'
      else if (/\bmcdonalds\b/i.test(norm)) vendorName = "McDonald's"
      else if (/\bburger king|bk\b/i.test(norm)) vendorName = 'Burger King'
      else if (/\bsubway\b/i.test(norm)) vendorName = 'Subway'
      else if (/\bpadaria\b/i.test(norm)) vendorName = 'Padaria'
      else vendorName = 'Restaurante / Alimentação'
    } else if (/\b(farmacia|farmácia|droga raia|drogasil|pacheco|drogaria|remedio|médico|medico|dentista|consulta)\b/i.test(norm)) {
      categoryName = 'Saúde'
      if (/\bdrogasil\b/i.test(norm)) vendorName = 'Drogasil'
      else if (/\bdroga raia|raia\b/i.test(norm)) vendorName = 'Droga Raia'
      else vendorName = 'Farmácia / Saúde'
    } else if (/\b(aluguel|condominio|condomínio|luz|enel|energia|agua|água|sabesp|internet|claro|vivo|tim)\b/i.test(norm)) {
      categoryName = 'Moradia'
      if (/\benergia|luz|enel\b/i.test(norm)) vendorName = 'Energia Elétrica'
      else if (/\bagua|água|sabesp\b/i.test(norm)) vendorName = 'Água e Esgoto'
      else if (/\binternet|claro|vivo|tim\b/i.test(norm)) vendorName = 'Internet'
      else vendorName = 'Moradia'
    } else if (/\b(cinema|teatro|show|festa|jogo|lazer|viagem|hotel|passeio)\b/i.test(norm)) {
      categoryName = 'Lazer'
      vendorName = 'Lazer'
    } else if (/\b(netflix|spotify|amazon prime|disney|hbo|youtube)\b/i.test(norm)) {
      categoryName = 'Assinaturas'
      if (/\bnetflix\b/i.test(norm)) vendorName = 'Netflix'
      else if (/\bspotify\b/i.test(norm)) vendorName = 'Spotify'
      else vendorName = 'Assinatura'
    } else if (/\b(curso|escola|faculdade|livro|livraria|udemy|alura)\b/i.test(norm)) {
      categoryName = 'Educação'
      vendorName = 'Educação'
    } else if (/\b(amazon|shopee|mercado livre|magalu|magazine luiza|compras|loja)\b/i.test(norm)) {
      categoryName = 'Compras'
      if (/\bamazon\b/i.test(norm)) vendorName = 'Amazon'
      else if (/\bshopee\b/i.test(norm)) vendorName = 'Shopee'
      else if (/\bmercado livre\b/i.test(norm)) vendorName = 'Mercado Livre'
      else if (/\bmagalu|magazine luiza\b/i.test(norm)) vendorName = 'Magalu'
      else vendorName = 'Compras'
    } else {
      categoryName = 'Outros'
      vendorName = 'Despesa'
    }
  }

  // Match system category object if available
  const matchedCategory = categories.find((c) => {
    if (categoryName && normalizeCategoryName(c.name) === normalizeCategoryName(categoryName)) {
      return true
    }
    return false
  })

  const finalCategory = matchedCategory ? matchedCategory.name : (categoryName || 'Outros')

  const receipt: Receipt = {
    type,
    account_id: accountId,
    vendor: vendorName,
    vendor_address: null,
    date,
    time: null,
    currency: 'BRL',
    category: finalCategory,
    subtotal: total,
    tax: null,
    tip: null,
    total,
    payment_method: paymentMethod,
    notes: null,
    items: [
      {
        description: vendorName || 'Item',
        quantity: 1,
        unit_price: total,
        total,
        category: finalCategory,
      },
    ],
    installment_total: installmentTotal,
    installment_current: installmentCurrent,
    installment_amount: installmentAmount,
    installment_date_anchor: installmentDateAnchor,
    is_recurring: isRecurring,
    recurrence_frequency: recurrenceFrequency,
  }

  return {
    success: true,
    receipt,
  }
}
