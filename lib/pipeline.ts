import { scanReceipt } from './vision'
import { store } from './storage'
import { save } from './persist'
import { resolveInstallmentPlan } from './installments'
import { resolveRecurrenceUpdate } from './recurrence'
import type { Receipt, StoredReceipt } from './schema'

/**
 * The end-to-end scan pipeline for images: store the original, run the AI call, and
 * persist the validated result.
 */
export interface ProcessOptions {
  overrideType?: 'expense' | 'income'
  accountId?: string | null
  isRecurring?: boolean
  recurrenceFrequency?: 'monthly' | 'weekly' | 'yearly' | null
  recurrenceNextDate?: string | null
  installmentTotal?: number | null
  installmentCurrent?: number | null
  installmentAmount?: number | null
  installmentGroupId?: string | null
  installmentDateAnchor?: 'purchase_date' | 'current_installment' | null
  allowDuplicate?: boolean
  filename?: string | null
  rawText?: string | null
}

/**
 * Parse an image-based expense/receipt scan into a structured Receipt
 * without persisting to storage or database. Resolves accounts, recurrence and installments.
 */
export async function parseReceiptImage(
  buffer: Buffer,
  contentType: string,
  options?: ProcessOptions,
): Promise<{ receipt: Receipt; originalExtractedData: Record<string, any>; sha256: string }> {
  const { sha256: computeHash } = await import('./storage')
  const imageHash = computeHash(buffer)
  const { receipt } = await scanReceipt(buffer, contentType, undefined, {
    additionalContextText: options?.rawText || undefined,
  })
  if (options?.overrideType) {
    receipt.type = options.overrideType
  }

  // Se um accountId explícito foi fornecido, use-o
  if (options?.accountId !== undefined) {
    receipt.account_id = options.accountId
  } else if (options?.rawText) {
    // Tentar resolver account_id a partir do texto complementar (ex: "cartão Inter", "nubank")
    const { listAccounts } = await import('./queries')
    const { normalizeInstitutionKey } = await import('./institutions')
    try {
      const allAccounts = await listAccounts()
      const textLower = options.rawText.toLowerCase()
      const matchedInstKey = normalizeInstitutionKey(textLower)

      const matchedAccount = allAccounts.find((acc) => {
        const accNameLower = acc.name.toLowerCase()
        const accInstLower = (acc.institution || '').toLowerCase()
        if (matchedInstKey && (accNameLower.includes(matchedInstKey) || accInstLower.includes(matchedInstKey))) {
          return true
        }
        return textLower.includes(accNameLower)
      })

      if (matchedAccount) {
        receipt.account_id = matchedAccount.id
        if (matchedAccount.type === 'credit_card' && !receipt.payment_method) {
          receipt.payment_method = 'Cartão de Crédito'
        }
      }
    } catch {
      // Silently continue if account resolution fails
    }

    // Fallback determinístico para reconhecimento de forma de pagamento na legenda da imagem
    const textLower = options.rawText.toLowerCase()
    if (!receipt.payment_method) {
      if (/\b(pix|via pix|no pix|paguei no pix|paguei via pix|chave pix)\b/i.test(textLower)) {
        receipt.payment_method = 'Pix'
      } else if (/\b(dinheiro|em esp[eé]cie|em dinheiro|no dinheiro)\b/i.test(textLower)) {
        receipt.payment_method = 'Dinheiro'
      } else if (/\b(d[eé]bito|no d[eé]bito|cart[aã]o de d[eé]bito)\b/i.test(textLower)) {
        receipt.payment_method = 'Cartão de Débito'
      }
    }
  }

  if (options?.isRecurring !== undefined) {
    const rec = resolveRecurrenceUpdate({
      is_recurring: options.isRecurring,
      recurrence_frequency: options.recurrenceFrequency,
      recurrence_next_date: options.recurrenceNextDate,
      date: receipt.date,
    })
    receipt.is_recurring = rec.is_recurring
    receipt.recurrence_frequency = rec.recurrence_frequency
    receipt.recurrence_next_date = rec.recurrence_next_date
    receipt.recurrence_status = rec.recurrence_status
  }

  const plan = resolveInstallmentPlan({
    total: receipt.total || 0,
    installmentTotal: options?.installmentTotal,
    installmentCurrent: options?.installmentCurrent,
    installmentAmount: options?.installmentAmount,
    installmentGroupId: options?.installmentGroupId,
    installmentDateAnchor: options?.installmentDateAnchor,
    subtotal: receipt.subtotal,
    notes: receipt.notes,
    vendor: receipt.vendor,
    rawText: options?.rawText || null,
  })

  if (plan.isMultiInstallment) {
    receipt.installment_total = plan.installmentTotal
    receipt.installment_current = plan.installmentCurrent
    receipt.installment_amount = plan.installmentAmount
    receipt.installment_group_id = plan.installmentGroupId
    receipt.installment_date_anchor = plan.installmentDateAnchor
    receipt.subtotal = plan.totalPurchaseAmount
  }

  // Check and apply learned category preference if available
  try {
    const { getLearnedCategory } = await import('./categoryLearning')
    const learned = await getLearnedCategory({
      vendor: receipt.vendor,
      transactionType: receipt.type,
      itemKeyword: receipt.items && receipt.items.length > 0 ? receipt.items[0].description : null,
      rawText: options?.rawText || null,
    })
    if (learned) {
      receipt.category_id = learned.categoryId
      receipt.category = learned.categoryName
    }
  } catch (err) {
    console.warn('Could not check learned category preference:', err)
  }

  // Snapshot original extracted data
  const originalExtractedData = {
    type: receipt.type,
    account_id: receipt.account_id,
    vendor: receipt.vendor,
    vendor_address: receipt.vendor_address,
    date: receipt.date,
    time: receipt.time,
    currency: receipt.currency,
    category: receipt.category,
    subtotal: receipt.subtotal,
    tax: receipt.tax,
    tip: receipt.tip,
    total: receipt.total,
    payment_method: receipt.payment_method,
    notes: receipt.notes,
    items: receipt.items?.map((it) => ({ ...it })),
  }

  return { receipt, originalExtractedData, sha256: imageHash }
}

export async function processReceipt(
  buffer: Buffer,
  contentType: string,
  options?: ProcessOptions,
): Promise<StoredReceipt> {
  const stored = await store(buffer, contentType)
  const { receipt, originalExtractedData } = await parseReceiptImage(buffer, contentType, options)

  return save({
    receipt,
    imageKey: stored.key,
    imageSha256: stored.sha256,
    sourceType: 'image',
    originType: 'image',
    originalFilename: options?.filename || null,
    rawText: options?.rawText || null,
    capturedAt: new Date().toISOString(),
    originalExtractedData,
    allowDuplicate: options?.allowDuplicate,
  })
}

/**
 * Parse a text-based expense or income description into a structured Receipt without persisting to the database.
 * Resolves accounts, recurrence and installments.
 */
export async function parseTextExpense(
  text: string,
  options?: ProcessOptions,
): Promise<{ receipt: Receipt; originalExtractedData: Record<string, any> }> {
  const { receipt } = await scanReceipt(text)
  if (options?.overrideType) {
    receipt.type = options.overrideType
  }
  if (options?.accountId !== undefined) {
    receipt.account_id = options.accountId
  } else if (text) {
    // Tentar resolver account_id a partir do texto (ex: "cartão Inter", "nubank")
    const { listAccounts } = await import('./queries')
    const { normalizeInstitutionKey } = await import('./institutions')
    try {
      const allAccounts = await listAccounts()
      const textLower = text.toLowerCase()
      const matchedInstKey = normalizeInstitutionKey(textLower)

      const matchedAccount = allAccounts.find((acc) => {
        const accNameLower = acc.name.toLowerCase()
        const accInstLower = (acc.institution || '').toLowerCase()
        if (matchedInstKey && (accNameLower.includes(matchedInstKey) || accInstLower.includes(matchedInstKey))) {
          return true
        }
        return textLower.includes(accNameLower)
      })

      if (matchedAccount) {
        receipt.account_id = matchedAccount.id
        if (matchedAccount.type === 'credit_card' && !receipt.payment_method) {
          receipt.payment_method = 'Cartão de Crédito'
        }
      }
    } catch {
      // Silently continue
    }

    // Fallback determinístico para reconhecimento de Pix caso o modelo retorne nulo
    const textLower = text.toLowerCase()
    if (!receipt.payment_method) {
      if (/\b(pix|via pix|no pix|paguei no pix|paguei via pix|chave pix)\b/i.test(textLower)) {
        receipt.payment_method = 'Pix'
      } else if (/\b(dinheiro|em esp[eé]cie|em dinheiro|no dinheiro)\b/i.test(textLower)) {
        receipt.payment_method = 'Dinheiro'
      } else if (/\b(d[eé]bito|no d[eé]bito|cart[aã]o de d[eé]bito)\b/i.test(textLower)) {
        receipt.payment_method = 'Cartão de Débito'
      }
    }
  }
  if (options?.isRecurring !== undefined) {
    const rec = resolveRecurrenceUpdate({
      is_recurring: options.isRecurring,
      recurrence_frequency: options.recurrenceFrequency,
      recurrence_next_date: options.recurrenceNextDate,
      date: receipt.date,
    })
    receipt.is_recurring = rec.is_recurring
    receipt.recurrence_frequency = rec.recurrence_frequency
    receipt.recurrence_next_date = rec.recurrence_next_date
    receipt.recurrence_status = rec.recurrence_status
  }

  const plan = resolveInstallmentPlan({
    total: receipt.total || 0,
    installmentTotal: options?.installmentTotal,
    installmentCurrent: options?.installmentCurrent,
    installmentAmount: options?.installmentAmount,
    installmentGroupId: options?.installmentGroupId,
    installmentDateAnchor: options?.installmentDateAnchor,
    subtotal: receipt.subtotal,
    notes: receipt.notes,
    rawText: text,
    vendor: receipt.vendor,
  })

  if (plan.isMultiInstallment) {
    receipt.installment_total = plan.installmentTotal
    receipt.installment_current = plan.installmentCurrent
    receipt.installment_amount = plan.installmentAmount
    receipt.installment_group_id = plan.installmentGroupId
    receipt.installment_date_anchor = plan.installmentDateAnchor
    receipt.subtotal = plan.totalPurchaseAmount
  }

  // Check and apply learned category preference if available
  try {
    const { getLearnedCategory } = await import('./categoryLearning')
    const learned = await getLearnedCategory({
      vendor: receipt.vendor,
      transactionType: receipt.type,
      itemKeyword: receipt.items && receipt.items.length > 0 ? receipt.items[0].description : null,
      rawText: text || options?.rawText || null,
    })
    if (learned) {
      receipt.category_id = learned.categoryId
      receipt.category = learned.categoryName
    }
  } catch (err) {
    console.warn('Could not check learned category preference in text expense:', err)
  }

  // Snapshot original extracted data
  const originalExtractedData = {
    type: receipt.type,
    account_id: receipt.account_id,
    vendor: receipt.vendor,
    vendor_address: receipt.vendor_address,
    date: receipt.date,
    time: receipt.time,
    currency: receipt.currency,
    category: receipt.category,
    subtotal: receipt.subtotal,
    tax: receipt.tax,
    tip: receipt.tip,
    total: receipt.total,
    payment_method: receipt.payment_method,
    notes: receipt.notes,
    items: receipt.items?.map((it) => ({ ...it })),
  }

  return { receipt, originalExtractedData }
}

/**
 * Process a text-based expense or income description into a persisted, structured receipt.
 */
export async function processTextExpense(
  text: string,
  options?: ProcessOptions,
): Promise<StoredReceipt> {
  const { receipt, originalExtractedData } = await parseTextExpense(text, options)

  return save({
    receipt,
    imageKey: null,
    imageSha256: null,
    sourceType: 'text',
    originType: 'text',
    rawText: text,
    originalFilename: null,
    capturedAt: new Date().toISOString(),
    originalExtractedData,
    allowDuplicate: options?.allowDuplicate,
  })
}

export interface BatchItemResult {
  filename: string
  ok: boolean
  receipt?: StoredReceipt
  error?: string
}

/**
 * Process several receipts. Each file is independent: one bad image does not
 * fail the rest of the batch, so every item gets its own ok/error result.
 * Files are processed with bounded concurrency to keep the model bill and
 * memory predictable.
 */
export async function processBatch(
  files: { filename: string; buffer: Buffer; contentType: string }[],
  concurrency = 4,
): Promise<BatchItemResult[]> {
  const results: BatchItemResult[] = new Array(files.length)
  let cursor = 0

  async function worker(): Promise<void> {
    while (cursor < files.length) {
      const index = cursor++
      const file = files[index]
      try {
        const receipt = await processReceipt(file.buffer, file.contentType, { filename: file.filename })
        results[index] = { filename: file.filename, ok: true, receipt }
      } catch (e) {
        results[index] = {
          filename: file.filename,
          ok: false,
          error: e instanceof Error ? e.message : 'Scan failed',
        }
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, files.length) }, worker),
  )
  return results
}
