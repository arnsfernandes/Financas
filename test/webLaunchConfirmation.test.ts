import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST as interpret } from '../app/api/scan/route'
import { POST as confirm } from '../app/api/transactions/route'
import { scanReceipt } from '../lib/vision'
import { store } from '../lib/storage'
import { setSupabaseClientForTesting } from '../lib/persist'
import { detectDuplicateTransaction } from '../lib/duplicate'
import type { Receipt } from '../lib/schema'

vi.mock('../lib/vision', async importOriginal => ({
  ...await importOriginal<typeof import('../lib/vision')>(),
  scanReceipt: vi.fn(),
}))
vi.mock('../lib/storage', async original => ({
  ...await original<typeof import('../lib/storage')>(),
  store: vi.fn(async () => ({ key: 'receipts/test.jpg', sha256: 'test-hash' })),
}))
vi.mock('../lib/duplicate', () => ({ detectDuplicateTransaction: vi.fn(async () => ({ isDuplicate: false, type: 'none' })) }))
vi.mock('../lib/queries', () => ({
  listAccounts: vi.fn(async () => [
    { id: 'card', name: 'Cartão', type: 'credit_card', active: true },
    { id: 'checking_acc', name: 'Conta Corrente', type: 'checking', active: true },
  ]),
  listCategories: vi.fn(async () => []), normalizeCategoryName: (s: string) => s.toLowerCase(),
}))
vi.mock('../lib/canonicalVendor', () => ({ getOrCreateCanonicalVendor: vi.fn(async () => ({ vendorId: null })) }))
vi.mock('../lib/canonical', () => ({ getOrCreateCanonicalProduct: vi.fn(async () => ({ productId: null })) }))
const insertTx = vi.fn(async (_rows: any) => ({ error: null }))
const insertItems = vi.fn(async (_rows: any) => ({ error: null }))
const deleteRows = vi.fn()
const receipt = (): Receipt => ({ type: 'expense', vendor: 'Loja', vendor_address: null, date: '2026-09-28',
  time: null, currency: 'BRL', category: 'Compras', subtotal: 480, tax: null, tip: null,
  total: 480, payment_method: 'Cartão de Crédito', account_id: 'card', notes: null,
  items: [{ description: 'Compra', quantity: 1, unit_price: 480, total: 480 }] })
const jsonRequest = (path: string, body: unknown) => new NextRequest(`http://localhost:3000${path}`, {
  method: 'POST', headers: { host: 'localhost:3000', 'content-type': 'application/json' }, body: JSON.stringify(body),
})
const formRequest = (path: string, body: FormData) => new NextRequest(`http://localhost:3000${path}`, {
  method: 'POST', headers: { host: 'localhost:3000' }, body,
})
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('SUPABASE_URL', '')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '')
  vi.mocked(detectDuplicateTransaction).mockResolvedValue({ isDuplicate: false, type: 'none' })
  vi.mocked(scanReceipt).mockImplementation(async () => ({ receipt: receipt(), model: 'test', usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0 } }))
  setSupabaseClientForTesting({ from: (table: string) => ({ insert: table === 'transactions' ? insertTx : insertItems, delete: deleteRows }) } as any)
})
afterEach(() => { setSupabaseClientForTesting(null); vi.unstubAllEnvs() })

describe('web interpretation → review → explicit confirmation', () => {
  it.each([{ source: 'text', count: 1 }, { source: 'text', count: 4 }, { source: 'image', count: 1 }, { source: 'image', count: 4 }])(
    '$source / $count installment(s): no writes before confirmation, existing persistence creates all rows after Save', async ({ source, count }) => {
      const file = new File(['test-image'], 'receipt.jpg', { type: 'image/jpeg' })
      const text = count === 4 ? 'compra de 480 em 4x' : 'compra de 480'
      let request: NextRequest
      if (source === 'image') {
        const form = new FormData(); form.append('file', file); form.append('text', text)
        form.append('installmentTotal', String(count))
        request = formRequest('/api/scan', form)
      } else request = jsonRequest('/api/scan', { text, installmentTotal: count })
      const response = await interpret(request)
      expect(response.status).toBe(200)
      const preview = await response.json()
      expect(preview.id).toBeUndefined()
      expect(preview.receipt.total).toBe(count === 4 ? 120 : 480)
      expect(preview.receipt.installment_group_id).toBeNull()
      expect(preview.originalExtractedData.total).toBe(480)
      expect(insertTx).not.toHaveBeenCalled()
      expect(insertItems).not.toHaveBeenCalled()
      expect(store).not.toHaveBeenCalled()
      expect(deleteRows).not.toHaveBeenCalled()
      // Closing/discarding here needs no server cleanup: there are no writes to undo.
      const payload = { ...preview, receipt: { ...preview.receipt, vendor: 'Descrição revisada' } }
      let confirmation: NextRequest
      if (source === 'image') {
        const form = new FormData(); form.append('payload', JSON.stringify(payload)); form.append('file', file)
        confirmation = formRequest('/api/transactions', form)
      } else confirmation = jsonRequest('/api/transactions', payload)
      const saved = await confirm(confirmation)
      expect(saved.status).toBe(200)
      expect(scanReceipt).toHaveBeenCalledTimes(1)
      expect(insertTx).toHaveBeenCalledTimes(1)
      const rows = Array.isArray(insertTx.mock.calls[0][0]) ? insertTx.mock.calls[0][0] : [insertTx.mock.calls[0][0]]
      expect(rows).toHaveLength(count)
      expect(rows.map((r: any) => r.total)).toEqual(Array(count).fill(480 / count))
      expect(rows.every((r: any) => r.vendor === 'Descrição revisada')).toBe(true)
      expect(rows[0].origin_type).toBe(source)
      expect(rows[0].raw_text).toBe(text)
      expect(rows[0].original_extracted_data.vendor).toBe('Loja')
      if (count > 1) {
        expect(new Set(rows.map((r: any) => r.installment_group_id)).size).toBe(1)
        expect(rows.map((r: any) => r.date)).toEqual(['2026-09-28', '2026-10-28', '2026-11-28', '2026-12-28'])
      }
      expect(store).toHaveBeenCalledTimes(source === 'image' ? 1 : 0)
      if (source === 'image') expect(rows[0].original_filename).toBe('receipt.jpg')
    },
  )
  it('cannot persist by passing the old manual flag to /api/scan', async () => {
    expect((await interpret(jsonRequest('/api/scan', { manual: true, receipt: receipt() }))).status).toBe(400)
    expect(insertTx).not.toHaveBeenCalled(); expect(store).not.toHaveBeenCalled()
  })
  it('saves a manual launch only through the explicit confirmation endpoint', async () => {
    expect((await confirm(jsonRequest('/api/transactions', { sourceType: 'manual', receipt: receipt() }))).status).toBe(200)
    expect(insertTx).toHaveBeenCalledOnce(); expect(scanReceipt).not.toHaveBeenCalled()
  })
  it('rejects negative or zero total before persistence', async () => {
    const negResponse = await confirm(jsonRequest('/api/transactions', { receipt: { ...receipt(), total: -50 } }))
    expect(negResponse.status).toBe(400)
    expect((await negResponse.json()).error).toContain('valor')
    expect(insertTx).not.toHaveBeenCalled()

    const zeroResponse = await confirm(jsonRequest('/api/transactions', { receipt: { ...receipt(), total: 0 } }))
    expect(zeroResponse.status).toBe(400)
    expect((await zeroResponse.json()).error).toContain('valor')
    expect(insertTx).not.toHaveBeenCalled()
  })
  it('rejects expense without payment method', async () => {
    const response = await confirm(jsonRequest('/api/transactions', { receipt: { ...receipt(), payment_method: null } }))
    expect(response.status).toBe(400)
    expect((await response.json()).error).toContain('forma de pagamento')
    expect(insertTx).not.toHaveBeenCalled()
  })
  it('rejects credit card payment with non-credit checking account', async () => {
    const response = await confirm(jsonRequest('/api/transactions', { receipt: { ...receipt(), payment_method: 'Cartão de Crédito', account_id: 'checking_acc' } }))
    expect(response.status).toBe(400)
    expect((await response.json()).error).toContain('cartão de crédito')
    expect(insertTx).not.toHaveBeenCalled()
  })
  it('rejects pix/debit payment with a credit card account', async () => {
    const response = await confirm(jsonRequest('/api/transactions', { receipt: { ...receipt(), payment_method: 'Pix', account_id: 'card' } }))
    expect(response.status).toBe(400)
    expect((await response.json()).error).toContain('conta bancária')
    expect(insertTx).not.toHaveBeenCalled()
  })
  it('rejects income without destination account', async () => {
    const response = await confirm(jsonRequest('/api/transactions', { receipt: { ...receipt(), type: 'income', account_id: null } }))
    expect(response.status).toBe(400)
    expect((await response.json()).error).toContain('conta')
    expect(insertTx).not.toHaveBeenCalled()
  })
  it('accepts valid income with banking account', async () => {
    const response = await confirm(jsonRequest('/api/transactions', { receipt: { ...receipt(), type: 'income', account_id: 'checking_acc' } }))
    expect(response.status).toBe(200)
    expect(insertTx).toHaveBeenCalledOnce()
  })

  it('handles a single purchase with multiple products as 1 transaction with multiple transaction_items', async () => {
    // Single receipt with 3 items (e.g. Supermarket invoice/receipt)
    const singleReceiptWithItems: Receipt = {
      type: 'expense',
      vendor: 'Supermercado Central',
      vendor_address: null,
      date: '2026-09-28',
      time: '14:30',
      currency: 'BRL',
      category: 'Mercado',
      subtotal: 150,
      tax: null,
      tip: null,
      total: 150,
      payment_method: 'Cartão de Crédito',
      account_id: 'card',
      notes: null,
      items: [
        { description: 'Arroz 5kg', quantity: 1, unit_price: 35, total: 35, category: 'Alimentação' },
        { description: 'Feijão 1kg', quantity: 2, unit_price: 10, total: 20, category: 'Alimentação' },
        { description: 'Carne Bovina', quantity: 1, unit_price: 95, total: 95, category: 'Açougue' },
      ],
    }

    vi.mocked(scanReceipt).mockResolvedValueOnce({
      receipt: singleReceiptWithItems,
      model: 'test',
      usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0 },
    })

    const response = await interpret(jsonRequest('/api/scan', { text: 'mercado 150: arroz 35, feijão 20 e carne 95 no cartão' }))
    expect(response.status).toBe(200)
    const preview = await response.json()
    expect(preview.isBatch).toBeUndefined()
    expect(preview.receipt.total).toBe(150)
    expect(preview.receipt.items).toHaveLength(3)

    const confirmRes = await confirm(jsonRequest('/api/transactions', {
      sourceType: 'text',
      receipt: preview.receipt,
    }))
    expect(confirmRes.status).toBe(200)
    expect(insertTx).toHaveBeenCalledOnce()
    const txRows = Array.isArray(insertTx.mock.calls[0][0]) ? insertTx.mock.calls[0][0] : [insertTx.mock.calls[0][0]]
    expect(txRows).toHaveLength(1)
    expect(txRows[0].total).toBe(150)
    expect(txRows[0].vendor).toBe('Supermercado Central')

    expect(insertItems).toHaveBeenCalledOnce()
    const itemRows = Array.isArray(insertItems.mock.calls[0][0]) ? insertItems.mock.calls[0][0] : [insertItems.mock.calls[0][0]]
    expect(itemRows).toHaveLength(3)
    expect(itemRows.map((it: any) => it.description)).toEqual(['Arroz 5kg', 'Feijão 1kg', 'Carne Bovina'])
  })

  it('handles multiple expenses informed together (e.g. Google One, combustível, IOF no cartão Inter) as independent transactions in batch review and confirmation', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-key')
    const { setOpenAIClientForTesting } = await import('../lib/intent')
    const rawInput = 'Google One 23,99; combustível 150; IOF 3,50 no cartão Inter'

    // Mock splitTransactionText OpenAI call
    const create = vi.fn(async () => ({
      choices: [{
        message: {
          content: JSON.stringify({
            descriptions: ['Google One 23,99', 'combustível 150', 'IOF 3,50'],
            shared_context: 'no cartão Inter',
          }),
        },
      }],
    }))
    setOpenAIClientForTesting({ chat: { completions: { create } } } as any)

    // Mock scanReceipt for the 3 separated transactions
    vi.mocked(scanReceipt)
      .mockResolvedValueOnce({
        receipt: {
          type: 'expense',
          vendor: 'Google One',
          vendor_address: null,
          date: '2026-09-28',
          time: null,
          currency: 'BRL',
          category: 'Assinaturas',
          subtotal: 23.99,
          tax: null,
          tip: null,
          total: 23.99,
          payment_method: 'Cartão de Crédito',
          account_id: 'card',
          notes: null,
          items: [],
        },
        model: 'test',
        usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0 },
      })
      .mockResolvedValueOnce({
        receipt: {
          type: 'expense',
          vendor: 'Combustível',
          vendor_address: null,
          date: '2026-09-28',
          time: null,
          currency: 'BRL',
          category: 'Transporte',
          subtotal: 150,
          tax: null,
          tip: null,
          total: 150,
          payment_method: 'Cartão de Crédito',
          account_id: 'card',
          notes: null,
          items: [],
        },
        model: 'test',
        usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0 },
      })
      .mockResolvedValueOnce({
        receipt: {
          type: 'expense',
          vendor: 'IOF',
          vendor_address: null,
          date: '2026-09-28',
          time: null,
          currency: 'BRL',
          category: 'Impostos & Tarifas',
          subtotal: 3.50,
          tax: null,
          tip: null,
          total: 3.50,
          payment_method: 'Cartão de Crédito',
          account_id: 'card',
          notes: null,
          items: [],
        },
        model: 'test',
        usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0 },
      })

    const scanResponse = await interpret(jsonRequest('/api/scan', { text: rawInput }))
    expect(scanResponse.status).toBe(200)
    const scanData = await scanResponse.json()
    expect(scanData.isBatch).toBe(true)
    expect(scanData.items).toHaveLength(3)
    expect(scanData.items[0].receipt.total).toBe(23.99)
    expect(scanData.items[0].receipt.vendor).toBe('Google One')
    expect(scanData.items[0].receipt.category).toBe('Assinaturas')

    expect(scanData.items[1].receipt.total).toBe(150)
    expect(scanData.items[1].receipt.vendor).toBe('Combustível')
    expect(scanData.items[1].receipt.category).toBe('Transporte')

    expect(scanData.items[2].receipt.total).toBe(3.5)
    expect(scanData.items[2].receipt.vendor).toBe('IOF')
    expect(scanData.items[2].receipt.category).toBe('Impostos & Tarifas')

    // Confirm the batch through POST /api/transactions
    const confirmResponse = await confirm(jsonRequest('/api/transactions', {
      items: scanData.items,
    }))
    expect(confirmResponse.status).toBe(200)
    const confirmData = await confirmResponse.json()
    expect(confirmData.isBatch).toBe(true)
    expect(confirmData.count).toBe(3)

    expect(insertTx).toHaveBeenCalledOnce()
    const rows = Array.isArray(insertTx.mock.calls[0][0]) ? insertTx.mock.calls[0][0] : [insertTx.mock.calls[0][0]]
    expect(rows).toHaveLength(3)
    expect(rows.map((r: any) => ({ total: r.total, vendor: r.vendor, category: r.category }))).toEqual([
      { total: 23.99, vendor: 'Google One', category: 'Assinaturas' },
      { total: 150, vendor: 'Combustível', category: 'Transporte' },
      { total: 3.50, vendor: 'IOF', category: 'Impostos & Tarifas' },
    ])
    expect(rows.every((r: any) => r.payment_method === 'Cartão de Crédito' && r.account_id === 'card')).toBe(true)
    setOpenAIClientForTesting(null)
  })
})

