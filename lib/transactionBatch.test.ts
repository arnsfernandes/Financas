import { beforeEach, describe, expect, it, vi } from 'vitest'
import { batchPreview, selectBatchAccount, cancelBatch, confirmBatch, correctBatch, parseBatch, type PendingBatch } from './transactionBatch'
import { parsePreviewCorrection, splitTransactionText } from './intent'
import { formatBRL } from './formatters'
import { listAccounts } from './queries'
import { parseTextExpense } from './pipeline'
import { isMultiExpenseText, parseSingleTransactionLocally } from './textRouter'
vi.mock('./queries', () => ({ listAccounts: vi.fn(async () => []), normalizeCategoryName: (s: string) => s.toLowerCase() }))
vi.mock('./intent', () => ({ splitTransactionText: vi.fn(), parsePreviewCorrection: vi.fn() }))
vi.mock('./pipeline', () => ({ parseTextExpense: vi.fn() }))

function batch(): PendingBatch {
  return { id: 'batch', userId: 1, createdAt: Date.now(), items: [45, 80, 32].map((amount, i) => {
    const receipt = parseSingleTransactionLocally(`gastei ${amount} no mercado em dinheiro`, [], []).receipt!
    return { id: String(i), userId: 1, receipt, originalExtractedData: structuredClone(receipt), sourceType: 'text', rawText: 'original', createdAt: Date.now() }
  }) }
}
beforeEach(() => { vi.clearAllMocks(); vi.mocked(listAccounts).mockResolvedValue([]) })
describe('Telegram batch', () => {
  it('parses 2+ independent descriptions without persistence', async () => {
    vi.mocked(splitTransactionText).mockResolvedValue(['gastei 45 no mercado em dinheiro', 'gastei 32 na farmacia em dinheiro'])
    const result = await parseBatch('texto', 1, [], [])
    expect(result.items.map(i => i.receipt.total)).toEqual([45, 32])
    expect(result.items[0].receipt).not.toBe(result.items[1].receipt)
  })
  it('detects equal amounts and comma separated candidates', () => {
    expect(isMultiExpenseText('45 no mercado e 45 na farmacia')).toBe(true)
    expect(isMultiExpenseText('45 no mercado, 80 gasolina, 32 farmacia')).toBe(true)
  })
  it('shows one numbered preview, total and the three actions', async () => {
    const preview = await batchPreview(batch())
    expect(preview.text).toContain('<b>3. Mercado</b>')
    expect(preview.text).toContain('157,00')
    expect(preview.keyboard.inline_keyboard.flat().map(b => b.text)).toEqual(['✅ Confirmar todos', '✏️ Alterar', '❌ Cancelar'])
  })
  it.each([2, 5, 12])('renders %i items dynamically in the requested order, without changing batch state', async count => {
    const b = batch()
    b.items = Array.from({ length: count }, (_, i) => ({
      ...structuredClone(b.items[0]), id: String(i),
      receipt: { ...structuredClone(b.items[0].receipt), vendor: `Descrição ${i + 1}`,
        total: i + 1, category: `Categoria ${i + 1}`, date: '2026-09-27',
        account_id: i % 2 === 0 ? 'card' : 'bank',
        payment_method: i % 2 === 0 ? 'Cartão de Crédito' : 'Pix' },
    }))
    vi.mocked(listAccounts).mockResolvedValue([
      { id: 'card', name: 'Cartão teste', type: 'credit_card', active: true },
      { id: 'bank', name: 'Conta teste', type: 'bank_account', active: true },
    ])
    const before = structuredClone(b)
    const { text, keyboard } = await batchPreview(b)
    expect(text.startsWith('📝 <b>Confirmar lançamentos</b>\n\n')).toBe(true)
    expect(text.match(/Confirmar lançamentos/g)).toHaveLength(1)
    expect(text).not.toContain('Confirmar lançamento</b>')
    for (let i = 0; i < count; i++) {
      expect(text).toContain(`<b>${i + 1}. Descrição ${i + 1}</b>\n<b>${formatBRL(i + 1)}</b>\n📁 Categoria ${i + 1}\n${i % 2 === 0 ? '💳 Cartão teste' : '🏦 Conta teste'}\n📅 27/09/2026`)
    }
    expect(text.endsWith(`💰 <b>Total: ${formatBRL(count * (count + 1) / 2)}</b>`)).toBe(true)
    expect(keyboard.inline_keyboard.flat().map(button => button.text)).toEqual(['✅ Confirmar todos', '✏️ Alterar', '❌ Cancelar'])
    expect(b).toEqual(before)
  })
  it('preserves additional details and missing-field warnings after the date', async () => {
    const b = batch()
    Object.assign(b.items[0].receipt, { installment_total: 3, installment_amount: 15,
      is_recurring: true, recurrence_frequency: 'monthly', payment_method: null, date: '2026-09-27' })
    const { text } = await batchPreview(b)
    expect(text).toContain('📅 27/09/2026\n💳 3x de ' + formatBRL(15) + '\n🔁 Recorrente (monthly)')
    expect(text).toContain('⚠️ Forma/Conta não informada')
    expect(text).toContain('Selecione a forma de pagamento')
    expect(text).toContain('dados faltantes do lançamento 1')
    expect(text.endsWith(`💰 <b>Total: ${formatBRL(157)}</b>`)).toBe(true)
  })
  it('preserves complete items and asks only for incomplete item', async () => {
    const b = batch(); b.items[1].receipt.payment_method = null
    const persist = vi.fn(); const map = new Map([[b.id, b]])
    const preview = await batchPreview(b)
    expect(preview.text).toContain('dados faltantes do lançamento 2')
    expect(preview.keyboard.inline_keyboard.flat().some(b => b.text === '✅ Confirmar todos')).toBe(false)
    expect(await confirmBatch(b.id, 1, map, persist)).toContain('lançamento 2')
    expect(persist).not.toHaveBeenCalled()
    const first = b.items[0].receipt
    vi.mocked(parsePreviewCorrection).mockResolvedValue({ updatedReceipt: { ...b.items[1].receipt, payment_method: 'Dinheiro' }, changedFields: ['payment_method'] })
    await correctBatch(b, 'em dinheiro')
    expect(b.items[0].receipt).toBe(first)
    expect(b.items[1].receipt.payment_method).toBe('Dinheiro')
  })
  it('keeps an ambiguous account unresolved while preserving the other launch', async () => {
    const accounts = [
      { id: 'bank', name: 'Inter Conta', institution: 'Inter', type: 'bank_account' as const, active: true },
      { id: 'card', name: 'Inter Crédito', institution: 'Inter', type: 'credit_card' as const, active: true },
    ]
    vi.mocked(listAccounts).mockResolvedValue(accounts)
    vi.mocked(splitTransactionText).mockResolvedValue(['gastei 45 no mercado em dinheiro', 'gastei 80 no Inter'])
    const receipt = { ...batch().items[1].receipt, account_id: 'card', payment_method: 'Cartão de Crédito' }
    vi.mocked(parseTextExpense).mockResolvedValue({ receipt, originalExtractedData: structuredClone(receipt) })
    const parsed = await parseBatch('texto', 1, accounts, [])
    expect(parsed.items[0].receipt.payment_method).toBe('Dinheiro')
    expect(parsed.items[1].receipt.account_id).toBeNull()
    expect((await batchPreview(parsed)).text).toContain('dados faltantes do lançamento 2')
  })
  it('blocks cancellation and edits while a confirmation is in flight', async () => {
    const b = batch(); const map = new Map([[b.id, b]])
    let release!: () => void
    const persist = vi.fn(() => new Promise<void>(resolve => { release = resolve }))
    const confirmation = confirmBatch(b.id, 1, map, persist)
    expect(cancelBatch(b, 1, map)).toContain('Aguarde')
    expect(await correctBatch(b, '2: foi 90')).toContain('processamento')
    await vi.waitFor(() => expect(persist).toHaveBeenCalledOnce())
    release()
    await confirmation
  })
  it('selects only the pending item, using compact references and stable account identity', async () => {
    const b = batch(); b.items[1].receipt.payment_method = null
    const others = [structuredClone(b.items[0]), structuredClone(b.items[2])]
    const accounts = [
      { id: 'private-account-uuid', name: 'Conta A', type: 'bank_account' as const, active: true },
      { id: 'private-card-uuid', name: 'Cartão B', type: 'credit_card' as const, active: true },
    ]
    vi.mocked(listAccounts).mockResolvedValue(accounts)
    const preview = await batchPreview(b)
    const buttons = preview.keyboard.inline_keyboard.flat()
    const button = buttons.find(button => button.text === '💳 Cartão B')!
    if (!('callback_data' in button)) throw Error('Missing callback')
    for (const button of buttons) if ('callback_data' in button) {
      expect(Buffer.byteLength(button.callback_data)).toBeLessThanOrEqual(64)
      expect(button.callback_data).not.toContain('private-')
      expect(button.callback_data).not.toContain('Cartão')
    }
    const [, id, token, choice] = button.callback_data.split(':')
    const pending = new Map([[b.id, b]])
    expect((await selectBatchAccount(id, 99, token, choice, pending)).error).toBeTruthy()
    vi.mocked(listAccounts).mockResolvedValue([...accounts].reverse())
    const result = await selectBatchAccount(id, 1, token, choice, pending)
    expect(result.error).toBeUndefined()
    expect(b.items[1].receipt.account_id).toBe('private-card-uuid')
    expect(b.items[1].receipt.payment_method).toBe('Cartão de Crédito')
    expect([b.items[0], b.items[2]]).toEqual(others)
    expect(result.preview!.keyboard.inline_keyboard.flat().map(button => button.text)).toEqual(['✅ Confirmar todos', '✏️ Alterar', '❌ Cancelar'])
    expect((await selectBatchAccount(id, 1, token, choice, pending)).error).toBeTruthy()
  })
  it('completes one missing item at a time and rejects a stale selection after text correction', async () => {
    const b = batch(); b.items[0].receipt.payment_method = null; b.items[1].receipt.payment_method = null
    const pending = new Map([[b.id, b]])
    await batchPreview(b)
    const first = b.selection!
    const selected = await selectBatchAccount(b.id, 1, first.token, '0', pending)
    expect(selected.preview!.text).toContain('dados faltantes do lançamento 2')
    expect(b.items[0].receipt.payment_method).toBe('Dinheiro')
    expect(b.items[1].receipt.payment_method).toBeNull()
    const stale = b.selection!
    vi.mocked(parsePreviewCorrection).mockResolvedValue({ updatedReceipt: { ...b.items[1].receipt, payment_method: 'Dinheiro' }, changedFields: ['payment_method'] })
    await correctBatch(b, 'em dinheiro')
    expect((await selectBatchAccount(b.id, 1, stale.token, '0', pending)).error).toBeTruthy()
  })
  it('does not accept a missing amount', async () => {
    const b = batch(); b.items[1].receipt.total = null
    expect(await confirmBatch(b.id, 1, new Map([[b.id, b]]), vi.fn())).toContain('lançamento 2')
  })
  it('targets explicit correction without rebuilding other items or provenance', async () => {
    const b = batch(); const first = b.items[0]; const original = b.items[1].originalExtractedData
    vi.mocked(parsePreviewCorrection).mockResolvedValue({ updatedReceipt: { ...b.items[1].receipt, total: 90 }, changedFields: ['total'] })
    await correctBatch(b, '2: foi 90')
    expect(b.items[0]).toBe(first)
    expect(b.items[1].receipt.total).toBe(90)
    expect(b.items[1].originalExtractedData).toBe(original)
    expect(await correctBatch(b, 'foi 100')).toContain('Indique')
  })
  it('cancels without saving; old confirmation cannot save', async () => {
    const b = batch(); const map = new Map([[b.id, b]]); const persist = vi.fn()
    expect(cancelBatch(b, 1, map)).toContain('cancelado')
    await confirmBatch(b.id, 1, map, persist)
    expect(persist).not.toHaveBeenCalled()
  })
  it('claims before async validation, saves all once under concurrent clicks', async () => {
    const b = batch(); const map = new Map([[b.id, b]]); const persist = vi.fn(async (_inputs: unknown[]) => [])
    const messages = await Promise.all([confirmBatch(b.id, 1, map, persist), confirmBatch(b.id, 1, map, persist)])
    expect(persist).toHaveBeenCalledTimes(1)
    expect(persist.mock.calls[0][0]).toHaveLength(3)
    expect(messages.join()).toContain('3 lançamentos gravados')
    expect(map.size).toBe(0)
  })
  it('does not retry uncertain failures or allow another user', async () => {
    const b = batch(); const map = new Map([[b.id, b]]); const persist = vi.fn(async () => { throw Error('network') })
    expect(await confirmBatch(b.id, 2, map, persist)).toContain('outro usuário')
    await expect(confirmBatch(b.id, 1, map, persist)).rejects.toThrow('network')
    await confirmBatch(b.id, 1, map, persist)
    expect(persist).toHaveBeenCalledTimes(1)
  })
})
