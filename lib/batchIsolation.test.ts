import { afterEach, expect, it, vi } from 'vitest'
import { setOpenAIClientForTesting } from './intent'
import { parseBatch, batchPreview, correctBatch, selectBatchAccount } from './transactionBatch'
import type { Account } from './schema'
vi.mock('./queries', () => ({
  listAccounts: vi.fn(async () => [{ id: 'inter', name: 'Cartão Inter', institution: 'Inter', type: 'credit_card', active: true }]),
  normalizeCategoryName: (value: string) => value.toLowerCase(),
}))
const accounts: Account[] = [{ id: 'inter', name: 'Cartão Inter', institution: 'Inter', type: 'credit_card', active: true }]
afterEach(() => { setOpenAIClientForTesting(null); vi.unstubAllEnvs() })
it.each([
  {
    text: 'gastei 45 no mercado no cartão Inter, 80 de gasolina e 32 de farmácia no cartão Inter',
    descriptions: ['gastei 45 no mercado no cartão Inter', '80 de gasolina', '32 de farmácia no cartão Inter'],
    shared_context: null, complete: false,
  },
  {
    text: '45 mercado, 80 gasolina e 32 farmácia, tudo no cartão Inter',
    descriptions: ['45 mercado', '80 gasolina', '32 farmácia'],
    shared_context: 'tudo no cartão Inter', complete: true,
  },
])('isolates fields through splitter, parser and preview: $text', async scenario => {
  vi.stubEnv('OPENAI_API_KEY', 'test-key')
  const create = vi.fn(async () => ({ choices: [{ message: { content: JSON.stringify(scenario) } }] }))
  setOpenAIClientForTesting({ chat: { completions: { create } } } as any)
  const batch = await parseBatch(scenario.text, 42, accounts, [])
  expect(batch.items.map(item => item.receipt.total)).toEqual([45, 80, 32])
  expect(batch.items.map(item => item.receipt.category)).toEqual(['Mercado', 'Transporte', 'Saúde'])
  expect(batch.items.map(item => item.receipt.account_id)).toEqual(['inter', scenario.complete ? 'inter' : null, 'inter'])
  expect(batch.items.map(item => item.receipt.payment_method)).toEqual(['Cartão de Crédito', scenario.complete ? 'Cartão de Crédito' : null, 'Cartão de Crédito'])
  const preview = await batchPreview(batch)
  expect(preview.text.match(/Confirmar lançamentos/g)).toHaveLength(1)
  expect(preview.text).not.toContain('Confirmar lançamento</b>')
  expect(preview.text).toContain('<b>2. Gasolina</b>')
  const buttons = preview.keyboard.inline_keyboard.flat().map(button => button.text)
  expect(buttons.includes('✅ Confirmar todos')).toBe(scenario.complete)
  if (!scenario.complete) {
    expect(preview.text).toContain('dados faltantes do lançamento 2')
    expect(preview.text).not.toContain('dados faltantes do lançamento 1')
    expect(preview.text).not.toContain('dados faltantes do lançamento 3')
  }
})

it('preserves 45 Mercado, 80 Gasolina and 32 Farmácia when completing only item 2', async () => {
  vi.stubEnv('OPENAI_API_KEY', 'test-key')
  const text = 'gastei 45 no mercado no cartão Inter, 80 de gasolina e 32 de farmácia no cartão Inter'
  const create = vi.fn()
    .mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify({
      descriptions: ['gastei 45 no mercado no cartão Inter', '80 de gasolina', '32 de farmácia no cartão Inter'], shared_context: null,
    }) } }] })
    // Simulate an editor returning a neighbouring receipt along with the requested account.
    .mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify({
      total: 45, vendor: 'Mercado', category: 'Mercado', payment_method: 'Cartão de Crédito',
      account_name_or_institution: 'Inter', changed_fields: ['account_id', 'payment_method'],
    }) } }] })
  setOpenAIClientForTesting({ chat: { completions: { create } } } as any)
  const batch = await parseBatch(text, 42, accounts, [])
  const before = structuredClone(batch.items)
  const assertContent = async () => {
    expect(batch.items.map(item => item.receipt.total)).toEqual([45, 80, 32])
    expect(batch.items.map(item => item.receipt.vendor)).toEqual(['Mercado', 'Gasolina', 'Farmácia / Saúde'])
    const preview = await batchPreview(batch)
    expect(preview.text).toContain('<b>1. Mercado</b>')
    expect(preview.text).toContain('<b>2. Gasolina</b>')
    expect(preview.text).toContain('<b>3. Farmácia / Saúde</b>')
    expect(preview.text).toContain('157,00')
    expect(preview.text).not.toContain('122,00')
    expect(preview.text.match(/\. Mercado<\/b>/g)).toHaveLength(1)
  }
  expect(batch.items.map(item => item.receipt.account_id)).toEqual(['inter', null, 'inter'])
  await assertContent()
  expect((await batchPreview(batch)).text).toContain('dados faltantes do lançamento 2')
  await correctBatch(batch, '2: no cartão Inter')
  await assertContent()
  expect(batch.items[0]).toEqual(before[0])
  expect(batch.items[2]).toEqual(before[2])
  expect(batch.items[1].originalExtractedData).toEqual(before[1].originalExtractedData)
  expect(batch.items[1].receipt.account_id).toBe('inter')
  // The direct button must preserve precisely the same financial content.
  batch.items[1] = structuredClone(before[1])
  await assertContent()
  const selection = batch.selection!
  const result = await selectBatchAccount(batch.id, 42, selection.token, '0', new Map([[batch.id, batch]]))
  expect(result.error).toBeUndefined()
  await assertContent()
  expect(batch.items[0]).toEqual(before[0])
  expect(batch.items[2]).toEqual(before[2])
})
