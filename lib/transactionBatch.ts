import { randomBytes } from 'node:crypto'
import { InlineKeyboard } from 'grammy'
import type { PendingTransaction } from './confirmation'
import { buildPreviewMessage, appendAccountSelection, eligiblePreviewAccounts, applyPreviewAccount, applyPreviewPayment } from './confirmation'
import { listAccounts } from './queries'
import { validateLaunchCompleteness, parseSingleTransactionLocally, findAccountInText, normalizeText } from './textRouter'
import { parsePreviewCorrection, splitTransactionText } from './intent'
import { parseTextExpense } from './pipeline'
import { saveBatch, type PersistInput } from './persist'
import { formatBRL } from './formatters'
import type { Account, Category } from './schema'

export interface PendingBatch {
  id: string
  userId: number
  items: PendingTransaction[]
  createdAt: number
  busy?: boolean
  failed?: boolean
  selection?: { token: string; itemIndex: number; choices: ({ kind: 'account'; accountId: string } | { kind: 'cash' })[] }
}

export async function parseBatch(text: string, userId: number, accounts: Account[], categories: Category[]): Promise<PendingBatch> {
  const descriptions = await splitTransactionText(text)
  const id = `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
  const items: PendingTransaction[] = []
  for (const description of descriptions) {
    const local = parseSingleTransactionLocally(description, accounts, categories)
    const parsed = local.success && local.receipt
      ? { receipt: local.receipt, originalExtractedData: structuredClone(local.receipt) }
      : await parseTextExpense(description)
    if (findAccountInText(normalizeText(description), accounts).ambiguous) parsed.receipt.account_id = null
    items.push({ ...structuredClone(parsed), id: `${id}-${items.length}`, userId, sourceType: 'text', rawText: description, createdAt: Date.now() })
  }
  return { id, userId, items, createdAt: Date.now() }
}

export async function incompleteItems(batch: PendingBatch): Promise<number[]> {
  const accounts = await listAccounts({ activeOnly: true })
  return batch.items.flatMap((item, index) => validateLaunchCompleteness(item.receipt, accounts).isComplete ? [] : [index])
}

export async function batchPreview(batch: PendingBatch) {
  const parts = await Promise.all(batch.items.map(async (item, index) =>
    (await buildPreviewMessage(item.receipt, 'text', undefined, index + 1)).trimEnd()))
  const missing = await incompleteItems(batch)
  let text = `📝 <b>Confirmar lançamentos</b>\n\n${parts.join('\n\n')}`
  if (missing.length) text += `\n\nInforme os dados faltantes do lançamento ${missing[0] + 1}. Para outro item, use “2: conta Inter”.`
  text += `\n\n💰 <b>Total: ${formatBRL(batch.items.reduce((sum, item) => sum + (item.receipt.total || 0), 0))}</b>`
  const keyboard = new InlineKeyboard()
  if (missing.length) {
    const itemIndex = missing[0]
    const receipt = batch.items[itemIndex].receipt
    const accounts = await listAccounts({ activeOnly: true })
    const validation = validateLaunchCompleteness(receipt, accounts)
    if (validation.missingField === 'account' || validation.missingField === 'payment_method') {
      const eligible = eligiblePreviewAccounts(receipt, accounts)
      const selection: NonNullable<PendingBatch['selection']> = { token: randomBytes(6).toString('hex'), itemIndex, choices: [] }
      appendAccountSelection(keyboard, receipt, accounts, (kind, index) => {
        const choice = selection.choices.length
        selection.choices.push(kind === 'cash' ? { kind } : { kind, accountId: eligible[index].id })
        return `bs:${batch.id}:${selection.token}:${choice}`
      })
      batch.selection = selection
    } else delete batch.selection
  } else delete batch.selection
  if (!missing.length) keyboard.text('✅ Confirmar todos', `batch:confirm:${batch.id}`).row()
  keyboard.text('✏️ Alterar', `batch:edit:${batch.id}`).text('❌ Cancelar', `batch:cancel:${batch.id}`)
  return { text, keyboard }
}

/** Resolve the compact callback against the server-side preview snapshot. */
export async function selectBatchAccount(
  id: string, userId: number, token: string, choiceRef: string, pending: Map<string, PendingBatch>,
): Promise<{ error?: string; preview?: Awaited<ReturnType<typeof batchPreview>> }> {
  const batch = pending.get(id)
  if (!batch || batch.userId !== userId || batch.busy || batch.failed) return { error: '⚠️ Lote indisponível.' }
  const selection = batch.selection
  if (!selection || selection.token !== token || !/^\d+$/.test(choiceRef)) return { error: '⚠️ Esta seleção expirou. Use o preview atual.' }
  const choice = selection.choices[Number(choiceRef)]
  if (!choice) return { error: '⚠️ Seleção inválida.' }
  batch.busy = true
  try {
    const accounts = await listAccounts({ activeOnly: true })
    const item = batch.items[selection.itemIndex]
    const validation = validateLaunchCompleteness(item.receipt, accounts)
    if (validation.missingField !== 'account' && validation.missingField !== 'payment_method') return { error: '⚠️ Este lançamento já foi atualizado.' }
    if (choice.kind === 'account') {
      const account = eligiblePreviewAccounts(item.receipt, accounts).find(account => account.id === choice.accountId)
      if (!account) return { error: '⚠️ Conta indisponível. Corrija por texto.' }
      applyPreviewAccount(item.receipt, account)
    } else applyPreviewPayment(item.receipt, 'cash', accounts)
    delete batch.selection
    batch.createdAt = Date.now()
    return { preview: await batchPreview(batch) }
  } finally { batch.busy = false }
}

/** An explicit number always wins; implicit corrections only target the sole incomplete item. */
export async function correctBatch(batch: PendingBatch, text: string): Promise<string | null> {
  if (batch.busy || batch.failed) return '⚠️ Lote em processamento ou já processado.'
  batch.busy = true
  try {
    const match = text.match(/^(?:lançamento\s*|lancamento\s*|item\s*|#)?(\d+)\s*[:\-]\s*(.+)$/i)
    const missing = await incompleteItems(batch)
    const index = match ? Number(match[1]) - 1 : missing.length === 1 ? missing[0] : -1
    if (index < 0 || index >= batch.items.length) return '✏️ Indique o lançamento: “2: foi 80 no Pix”.'
    const item = batch.items[index]
    const correction = await parsePreviewCorrection(structuredClone(item.receipt), match ? match[2] : text)
    const accounts = await listAccounts({ activeOnly: true })
    if (findAccountInText(normalizeText(match ? match[2] : text), accounts).ambiguous) correction.updatedReceipt.account_id = null
    delete batch.selection
    // Apply only the requested fields to this item's own state. Never replace it
    // with a full receipt returned by the editor.
    const updated = { ...item.receipt }
    const fields = ['total', 'vendor', 'category', 'payment_method', 'date', 'account_id', 'type', 'installment_total', 'is_recurring', 'notes'] as const
    for (const field of fields) {
      if (correction.changedFields.includes(field)) Object.assign(updated, { [field]: correction.updatedReceipt[field] })
    }
    if (correction.changedFields.includes('installment_total')) updated.installment_amount = correction.updatedReceipt.installment_amount
    item.receipt = updated
    batch.createdAt = Date.now()
    return null
  } finally { batch.busy = false }
}

export function cancelBatch(batch: PendingBatch, userId: number, pending: Map<string, PendingBatch>): string {
  if (batch.userId !== userId) return '⛔ Esta operação pertence a outro usuário.'
  if (batch.busy) return '⏳ Aguarde o processamento do lote.'
  pending.delete(batch.id)
  return '❌ Lote cancelado e descartado.'
}

export async function confirmBatch(id: string, userId: number, pending: Map<string, PendingBatch>, persist: (inputs: PersistInput[]) => Promise<unknown> = saveBatch): Promise<string> {
  const batch = pending.get(id)
  if (!batch || batch.busy || batch.failed) return '⚠️ Esta operação já foi processada, está em processamento ou expirou.'
  if (batch.userId !== userId) return '⛔ Esta operação pertence a outro usuário.'
  // Claim synchronously, before validation or persistence can yield.
  batch.busy = true
  try {
    const missing = await incompleteItems(batch)
    if (missing.length) return `⚠️ Complete o lançamento ${missing[0] + 1} antes de confirmar.`
    // Never retry after an uncertain write outcome. Old buttons remain consumed.
    batch.failed = true
    await persist(batch.items.map(item => ({ receipt: item.receipt, imageKey: null, imageSha256: null,
      sourceType: 'text', originType: 'text', rawText: item.rawText,
      originalExtractedData: item.originalExtractedData, allowDuplicate: false })))
    pending.delete(id)
    return `✅ ${batch.items.length} lançamentos gravados com sucesso!`
  } finally { batch.busy = false }
}
