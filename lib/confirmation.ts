import { InlineKeyboard } from 'grammy'
import type { Receipt, Account } from './schema'
import { listAccounts } from './queries'
import { formatBRL } from './formatters'
import { validateLaunchCompleteness } from './textRouter'

export interface PendingTransaction {
  id: string
  userId: number
  receipt: Receipt
  originalExtractedData: Record<string, any>
  sourceType: 'text' | 'image'
  rawText: string | null
  imageBuffer?: Buffer
  imageContentType?: string
  imageSha256?: string
  originalFilename?: string | null
  createdAt: number
}

/**
 * Builds the preview message text for a pending transaction.
 */
export async function buildPreviewMessage(
  receipt: Receipt,
  sourceType: 'text' | 'image',
  changedFields?: string[],
  batchItemNumber?: number
): Promise<string> {
  let accounts: any[] = []
  try {
    accounts = await listAccounts()
  } catch {
    // Silently continue
  }

  // Resolve account details and format
  let accountDisplay = ''
  if (receipt.account_id) {
    const found = accounts.find((a) => a.id === receipt.account_id)
    if (found) {
      const isCard = found.type === 'credit_card'
      accountDisplay = `${isCard ? '💳' : '🏦'} ${found.name}`
    }
  }

  // Fallback if no account_id, but payment_method exists or is missing
  if (!accountDisplay) {
    const pm = (receipt.payment_method || '').toLowerCase()
    const isCash = pm.includes('dinheiro') || pm.includes('espécie') || pm.includes('especie')
    if (isCash) {
      accountDisplay = `💵 Dinheiro`
    } else if (receipt.payment_method) {
      accountDisplay = `💳 ${receipt.payment_method}`
    } else {
      accountDisplay = `⚠️ Forma/Conta não informada`
    }
  }

  // Format date
  let displayDate = receipt.date || new Date().toISOString().slice(0, 10)
  if (displayDate && /^\d{4}-\d{2}-\d{2}$/.test(displayDate)) {
    const [y, m, d] = displayDate.split('-')
    displayDate = `${d}/${m}/${y}`
  }

  const vendorLabel =
    receipt.vendor || (receipt.type === 'income' ? 'Origem não informada' : 'Estabelecimento não informado')
  const categoryLabel = receipt.category || 'Outros'

  let preview = ''
  if (batchItemNumber !== undefined) {
    preview += `<b>${batchItemNumber}. ${vendorLabel}</b>\n`
    preview += `<b>${formatBRL(receipt.total)}</b>\n`
  } else {
    preview = `📝 <b>Confirmar lançamento</b>\n`
    if (changedFields && changedFields.length > 0) {
      preview += `✨ <i>Campos atualizados</i>\n`
    }
    preview += `\n`
    preview += `<b>${formatBRL(receipt.total)}</b>\n`
    preview += `${vendorLabel}\n\n`
    if (receipt.type === 'income') {
      preview += `🟢 Receita\n`
    }
  }
  preview += `📁 ${categoryLabel}\n`
  preview += `${accountDisplay}\n`
  preview += `📅 ${displayDate}\n`
  if (batchItemNumber !== undefined && receipt.type === 'income') {
    preview += `🟢 Receita\n`
  }

  if (receipt.installment_total && receipt.installment_total > 1) {
    preview += `💳 ${receipt.installment_total}x de ${formatBRL(receipt.installment_amount)}\n`
  }

  if (receipt.is_recurring) {
    preview += `🔁 Recorrente (${receipt.recurrence_frequency || 'mensal'})\n`
  }

  if (receipt.items && receipt.items.length > 1) {
    preview += `\n🛒 <b>Itens (${receipt.items.length}):</b>\n`
    for (const it of receipt.items) {
      const qty = it.quantity && it.quantity > 1 ? `${it.quantity}x ` : ''
      preview += `  • ${qty}${it.description} — ${formatBRL(it.total)}\n`
    }
  }

  const validation = validateLaunchCompleteness(receipt, accounts)
  if (!validation.isComplete) {
    preview += `\n⚠️ <i>${validation.reason || 'Complete os dados antes de confirmar.'}</i>`
  }

  return preview
}

/**
 * Builds the inline confirmation keyboard:
 * - When complete: ✅ Confirmar | ✏️ Alterar | ❌ Cancelar
 * - When missing payment/account: prompt buttons + ✏️ Alterar + ❌ Cancelar
 */
export function eligiblePreviewAccounts(receipt: Receipt, accounts: Account[]): Account[] {
  const isExpense = receipt.type !== 'income'
  const pm = (receipt.payment_method || '').toLowerCase()
  const isCredit =
    pm.includes('crédito') ||
    pm.includes('credito') ||
    Boolean(receipt.installment_total && receipt.installment_total > 1)
  const isDebitOrPix =
    pm.includes('pix') ||
    pm.includes('débito') ||
    pm.includes('debito') ||
    pm.includes('transferência') ||
    pm.includes('transferencia')

  let eligibleAccounts = accounts
  if (isExpense) {
    if (isCredit) {
      eligibleAccounts = accounts.filter((a) => a.type === 'credit_card')
    } else if (isDebitOrPix) {
      eligibleAccounts = accounts.filter((a) => a.type !== 'credit_card')
    } else {
      // No specific payment method yet: show all active accounts/cards
      eligibleAccounts = accounts
    }
  } else {
    // Income: banking/cash accounts
    eligibleAccounts = accounts.filter((a) => a.type !== 'credit_card')
  }

  return eligibleAccounts
}

export function applyPreviewAccount(receipt: Receipt, account: Account): void {
  receipt.account_id = account.id
  if (account.type === 'credit_card') receipt.payment_method = 'Cartão de Crédito'
  else if (!receipt.payment_method || receipt.payment_method.toLowerCase().includes('crédito')) receipt.payment_method = 'Pix'
}

export function applyPreviewPayment(receipt: Receipt, method: string, accounts: Account[]): void {
  receipt.payment_method = method === 'cash' ? 'Dinheiro' : method
  const current = accounts.find(account => account.id === receipt.account_id)
  if (current && ((receipt.payment_method === 'Cartão de Crédito' && current.type !== 'credit_card') ||
      (['Pix', 'Cartão de Débito', 'Dinheiro'].includes(receipt.payment_method) && current.type === 'credit_card'))) {
    receipt.account_id = null
  }
}

export function appendAccountSelection(
  keyboard: InlineKeyboard, receipt: Receipt, accounts: Account[],
  callback: (kind: 'account' | 'cash', index: number) => string,
): void {
  const eligibleAccounts = eligiblePreviewAccounts(receipt, accounts)
  const isExpense = receipt.type !== 'income'
  const pm = (receipt.payment_method || '').toLowerCase()
  const isCredit = pm.includes('crédito') || pm.includes('credito') || Boolean(receipt.installment_total && receipt.installment_total > 1)
  // Render registered accounts directly using short index to guarantee <= 64 bytes
  for (let i = 0; i < eligibleAccounts.length; i++) {
    const acc = eligibleAccounts[i]
    const label = `${acc.type === 'credit_card' ? '💳' : '🏦'} ${acc.name}`
    keyboard.text(label, callback('account', i))
    if (i % 2 === 1 || i === eligibleAccounts.length - 1) {
      keyboard.row()
    }
  }

  // If it's an expense and payment_method is not specifically credit card, allow selecting "Dinheiro" directly
  if (isExpense && !isCredit && !receipt.payment_method) {
    keyboard.text('💵 Dinheiro', callback('cash', 0)).row()
  }

}

export async function buildPreviewKeyboard(
  txId: string,
  receipt: Receipt
): Promise<InlineKeyboard> {
  let accounts: any[] = []
  try {
    accounts = await listAccounts({ activeOnly: true })
  } catch {
    // Silently continue
  }

  const validation = validateLaunchCompleteness(receipt, accounts)
  const keyboard = new InlineKeyboard()

  if (!validation.isComplete) {
    appendAccountSelection(keyboard, receipt, accounts, (kind, index) =>
      kind === 'account' ? `acc:${txId}:${index}` : `pm:${txId}:cash`)

    // Action buttons when incomplete: Alterar e Cancelar
    keyboard
      .text('✏️ Alterar', `edit_${txId}`)
      .text('❌ Cancelar', `cancel_${txId}`)
  } else {
    // Action buttons when complete: Confirmar, Alterar e Cancelar
    keyboard
      .text('✅ Confirmar', `confirm_${txId}`)
      .text('✏️ Alterar', `edit_${txId}`)
      .text('❌ Cancelar', `cancel_${txId}`)
  }

  return keyboard
}

export interface ConfirmationResult {
  status: 'confirmed' | 'cancelled' | 'duplicate_blocked' | 'missing_data' | 'expired' | 'unauthorized'
  message: string
  saved?: any
}

/**
 * Deterministic helper to process confirmation click.
 * Ensures single-execution, removes from pending map, and executes persistence.
 */
export async function processConfirmationAction(
  txId: string,
  userId: number,
  pendingMap: Map<string, PendingTransaction>,
  saveFn: (payload: any) => Promise<any>,
  storeImageFn?: (buffer: Buffer, contentType: string) => Promise<{ key: string | null; sha256: string }>
): Promise<ConfirmationResult> {
  const pending = pendingMap.get(txId)

  // Double click / expired check
  if (!pending) {
    return {
      status: 'duplicate_blocked',
      message: '⚠️ Esta operação já foi processada ou expirou.',
    }
  }

  // Authorization check
  if (pending.userId !== userId) {
    return {
      status: 'unauthorized',
      message: '⛔ Esta operação pertence a outro usuário.',
    }
  }

  // Completeness check
  let accounts: any[] = []
  try {
    accounts = await listAccounts({ activeOnly: true })
  } catch {
    // Silently continue
  }

  const validation = validateLaunchCompleteness(pending.receipt, accounts)
  if (!validation.isComplete) {
    return {
      status: 'missing_data',
      message: `⚠️ ${validation.reason || 'Complete os dados antes de confirmar.'}`,
    }
  }

  // Remove immediately from map to prevent race conditions / repeated clicks
  pendingMap.delete(txId)

  let imageKey: string | null = null
  let imageSha256 = pending.imageSha256 || null

  if (pending.sourceType === 'image' && pending.imageBuffer && pending.imageContentType && storeImageFn) {
    const stored = await storeImageFn(pending.imageBuffer, pending.imageContentType)
    imageKey = stored.key
    imageSha256 = stored.sha256
  }

  const saved = await saveFn({
    receipt: pending.receipt,
    imageKey,
    imageSha256,
    sourceType: pending.sourceType,
    originType: pending.sourceType,
    rawText: pending.rawText,
    originalFilename: pending.originalFilename || null,
    capturedAt: new Date().toISOString(),
    originalExtractedData: pending.originalExtractedData,
    allowDuplicate: false,
  })

  return {
    status: 'confirmed',
    message: '✅ Lançamento gravado com sucesso!',
    saved,
  }
}

/**
 * Deterministic helper to process cancellation click.
 */
export function processCancellationAction(
  txId: string,
  userId: number,
  pendingMap: Map<string, PendingTransaction>
): { status: 'cancelled' | 'unauthorized' | 'not_found'; message: string } {
  const pending = pendingMap.get(txId)
  if (pending && pending.userId !== userId) {
    return {
      status: 'unauthorized',
      message: '⛔ Esta operação pertence a outro usuário.',
    }
  }

  pendingMap.delete(txId)
  return {
    status: 'cancelled',
    message: '❌ Lançamento cancelado e descartado.',
  }
}

/**
 * Deterministic helper to process edit/alterar click.
 */
export function processEditAction(
  txId: string,
  userId: number,
  pendingMap: Map<string, PendingTransaction>
): { status: 'editing' | 'unauthorized' | 'not_found'; message: string } {
  const pending = pendingMap.get(txId)
  if (!pending) {
    return {
      status: 'not_found',
      message: '⚠️ Esta operação expirou ou já foi processada.',
    }
  }
  if (pending.userId !== userId) {
    return {
      status: 'unauthorized',
      message: '⛔ Esta operação pertence a outro usuário.',
    }
  }

  return {
    status: 'editing',
    message: '✏️ Digite o que deseja corrigir (ex: "foi 120 no Pix", "conta Nubank", "categoria Mercado").',
  }
}

/**
 * Helper to build the final success message text when a transaction is confirmed and saved.
 */
export function formatConfirmationSuccessMessage(saved: any): string {
  const typeEmoji = saved.type === 'income' ? '🟢' : '🔴'
  let successMsg = `✅ <b>Lançamento gravado com sucesso!</b>\n\n`
  successMsg += `${typeEmoji} <b>Valor:</b> ${formatBRL(saved.total)}\n`
  successMsg += `🏢 <b>Descrição:</b> ${saved.vendor || 'Sem estabelecimento'}\n`
  if (saved.payment_method) {
    successMsg += `💳 <b>Forma de pagamento:</b> ${saved.payment_method}\n`
  }
  if (saved.installment_total && saved.installment_total > 1) {
    successMsg += `💳 <b>Parcelas:</b> ${saved.installment_total} parcelas programadas\n`
  }
  if (saved.is_recurring) {
    successMsg += `🔁 <b>Recorrência:</b> Próximo ciclo em ${saved.recurrence_next_date || 'automático'}\n`
  }
  return successMsg
}

