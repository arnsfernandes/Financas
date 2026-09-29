import { expect, it, vi } from 'vitest'
import { splitTransactionText } from './intent'
it('interprets independent descriptions through structured output', async () => {
  const descriptions = ['gastei 45 no mercado no Inter', 'gastei 80 de gasolina no Pix', 'gastei 32 na farmácia no Nubank']
  const create = vi.fn(async () => ({ choices: [{ message: { content: JSON.stringify({ descriptions, shared_context: null }) } }] }))
  expect(await splitTransactionText(descriptions.join(', '), { chat: { completions: { create } } } as any)).toEqual(descriptions)
  expect(create).toHaveBeenCalledOnce()
})
it('rejects invalid model output instead of silently losing items', async () => {
  const create = vi.fn(async () => ({ choices: [{ message: { content: '{"descriptions":[]}' } }] }))
  await expect(splitTransactionText('texto', { chat: { completions: { create } } } as any)).rejects.toThrow('separar')
})

it('rejects a model attempt to copy a neighbour’s card into the middle launch', async () => {
  const text = 'gastei 45 no mercado no cartão Inter, 80 de gasolina e 32 de farmácia no cartão Inter'
  const create = vi.fn(async () => ({ choices: [{ message: { content: JSON.stringify({
    descriptions: ['gastei 45 no mercado no cartão Inter', '80 de gasolina no cartão Inter', '32 de farmácia no cartão Inter'], shared_context: null,
  }) } }] }))
  await expect(splitTransactionText(text, { chat: { completions: { create } } } as any)).rejects.toThrow('trechos independentes')
})
it('rejects a local card phrase mislabeled as global context', async () => {
  const create = vi.fn(async () => ({ choices: [{ message: { content: JSON.stringify({
    descriptions: ['45 mercado', '80 gasolina'], shared_context: 'no cartão Inter',
  }) } }] }))
  await expect(splitTransactionText('45 mercado, 80 gasolina no cartão Inter', { chat: { completions: { create } } } as any)).rejects.toThrow('escopo global')
})
