import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  scanReceipt,
  preprocessImage,
  buildSystemPrompt,
  buildTextSystemPrompt,
  getCurrentDateTimeContext,
} from '@/lib/vision'
import { receiptSchema, type Receipt } from '@/lib/schema'
import * as persistModule from '@/lib/persist'

const imagePath = fileURLToPath(new URL('./fixtures/receipt.jpg', import.meta.url))
const receiptFixture: Receipt = receiptSchema.parse(
  JSON.parse(readFileSync(fileURLToPath(new URL('./fixtures/tesco-receipt.json', import.meta.url)), 'utf8')),
)

/**
 * A stub that mimics OpenAI's `chat.completions.create`.
 */
function stubOpenAI(output: unknown) {
  const create = vi.fn(async (params: any) => ({
    model: params?.model || 'gpt-4o',
    choices: [
      {
        message: {
          content: JSON.stringify(output),
        },
      },
    ],
    usage: {
      prompt_tokens: 1200,
      completion_tokens: 250,
      prompt_tokens_details: { cached_tokens: 0 },
    },
    _params: params,
  }))
  return { client: { chat: { completions: { create } } } as unknown as Parameters<typeof scanReceipt>[2], create }
}

describe('Relative Dates & Timezone Context', () => {
  it('formats current datetime in America/Sao_Paulo timezone', () => {
    const ctx = getCurrentDateTimeContext()
    expect(ctx.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(ctx.time).toMatch(/^\d{2}:\d{2}$/)
    expect(ctx.full).toContain('America/Sao_Paulo')
  })

  it('includes explicit rules for relative dates in system prompt', () => {
    const fakeCtx = {
      date: '2026-09-22',
      time: '15:45',
      weekday: 'terça-feira',
      full: '2026-09-22 (terça-feira) às 15:45 [Timezone: America/Sao_Paulo]',
    }
    const prompt = buildSystemPrompt(fakeCtx)
    expect(prompt).toContain('Reference Date (today): 2026-09-22')
    expect(prompt).toContain('"hoje" / "today" -> 2026-09-22')
    expect(prompt).toContain('"ontem" / "yesterday" -> compute 1 day before reference date (2026-09-22)')
    expect(prompt).toContain('YYYY-MM-DD')
  })

  it('buildTextSystemPrompt is tailored for raw text without OCR/image instructions', () => {
    const fakeCtx = {
      date: '2026-09-22',
      time: '15:45',
      weekday: 'terça-feira',
      full: '2026-09-22 (terça-feira) às 15:45 [Timezone: America/Sao_Paulo]',
    }
    const textPrompt = buildTextSystemPrompt(fakeCtx)
    expect(textPrompt).toContain('Reference Date (today): 2026-09-22')
    expect(textPrompt).toContain('"hoje" / "today" -> 2026-09-22')
    expect(textPrompt).not.toContain('Photographs or scans of printed receipts')
    expect(textPrompt).not.toContain('Photographs of handwritten text')
  })

  it('passes the relative date context prompt to the OpenAI API', async () => {
    const { client, create } = stubOpenAI(receiptFixture)
    await scanReceipt('ontem fui no mercado', undefined, client)

    const params = create.mock.calls[0][0] as {
      messages: { role: string; content: string }[]
    }
    const systemMsg = params.messages.find((m) => m.role === 'system')
    expect(systemMsg?.content).toContain('America/Sao_Paulo')
    expect(systemMsg?.content).toContain('Reference Date (today):')
  })
})

describe('preprocessImage', () => {
  it('re-encodes any input to a JPEG buffer', async () => {
    const original = readFileSync(imagePath)
    const out = await preprocessImage(original)
    // JPEG SOI marker
    expect(out[0]).toBe(0xff)
    expect(out[1]).toBe(0xd8)
  })
})

describe('scanReceipt (end-to-end with a stubbed model)', () => {
  beforeEach(() => {
    process.env.VISION_MODEL = 'gpt-4o'
  })

  it('runs a real image through preprocessing and the OpenAI vision call, returning a validated receipt', async () => {
    const { client, create } = stubOpenAI(receiptFixture)
    const original = readFileSync(imagePath)

    const result = await scanReceipt(original, 'image/jpeg', client)

    expect(create).toHaveBeenCalledOnce()
    expect(result.receipt.vendor).toBe('Tesco')
    expect(result.receipt.items).toHaveLength(3)
    expect(result.receipt.total).toBe(5.35)
    expect(result.model).toBe('gpt-4o')
  })

  it('sends a base64 JPEG image and structured outputs configuration to the model', async () => {
    const { client, create } = stubOpenAI(receiptFixture)
    const original = readFileSync(imagePath)

    await scanReceipt(original, 'image/jpeg', client)

    const params = create.mock.calls[0][0] as {
      model: string
      messages: { role: string; content: unknown }[]
      response_format: { type: string; json_schema?: { name: string; strict: boolean; schema: unknown } }
    }
    expect(params.model).toBe('gpt-4o')
    expect(params.response_format.type).toBe('json_schema')
    expect(params.response_format.json_schema?.name).toBe('expense_extraction')
    expect(params.response_format.json_schema?.strict).toBe(true)

    const userMessage = params.messages.find((m) => m.role === 'user') as {
      role: string
      content: { type: string; text?: string; image_url?: { url: string } }[]
    }
    const imagePart = userMessage?.content.find((c) => c.type === 'image_url')
    expect(imagePart?.image_url?.url).toMatch(/^data:image\/jpeg;base64,/)
  })

  it('accepts raw typed text input and parses structured expense with TEXT_MODEL', async () => {
    const textFixture = {
      vendor: 'Supermercado Central',
      vendor_address: null,
      date: '2026-09-22',
      time: null,
      currency: 'BRL',
      category: 'Groceries',
      items: [
        { description: 'Café moído 500g', quantity: 2, unit_price: 15.5, total: 31, category: 'Beverages' },
        { description: 'Pão de forma', quantity: 1, unit_price: 8.5, total: 8.5, category: 'Bakery' },
      ],
      subtotal: 39.5,
      tax: null,
      tip: null,
      total: 39.5,
      payment_method: 'Pix',
      notes: null,
    }
    const { client, create } = stubOpenAI(textFixture)

    const result = await scanReceipt('Hoje gastei 39,50 no Supermercado Central: 2 cafés 31 reais e 1 pão 8,50 via Pix', undefined, client)

    expect(create).toHaveBeenCalledOnce()
    expect(result.model).toBe('gpt-4o-mini')
    expect(result.receipt.vendor).toBe('Supermercado Central')
    expect(result.receipt.date).toBe('2026-09-22')
    expect(result.receipt.category).toBe('Groceries')
    expect(result.receipt.total).toBe(39.5)
    expect(result.receipt.items[0].category).toBe('Beverages')

    const params = create.mock.calls[0][0] as {
      model: string
      messages: { role: string; content: string }[]
    }
    expect(params.model).toBe('gpt-4o-mini')
    const sysMsg = params.messages.find((m) => m.role === 'system')
    expect(sysMsg?.content).not.toContain('Photographs or scans')
  })

  it('validates the model output through Zod, rejecting malformed shapes', async () => {
    const bad = { vendor: 'X', total: 'not a number' }
    const { client } = stubOpenAI(bad)
    const original = readFileSync(imagePath)
    await expect(scanReceipt(original, 'image/jpeg', client)).rejects.toThrow()
  })
})

describe('processBatch (end-to-end, vision mocked)', () => {
  it('scans several files independently and isolates per-file failures', async () => {
    const vision = await import('@/lib/vision')
    const storage = await import('@/lib/storage')
    const pipeline = await import('@/lib/pipeline')

    vi.spyOn(vision, 'scanReceipt').mockImplementation(async (buf: any) => {
      if (Buffer.isBuffer(buf) && buf.length === 0) throw new Error('empty image')
      return { receipt: receiptFixture, model: 'gpt-4o', usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0 } }
    })
    vi.spyOn(storage, 'store').mockResolvedValue({ key: null, sha256: 'hash' })

    const original = readFileSync(imagePath)

    const results = await pipeline.processBatch([
      { filename: 'a.jpg', buffer: original, contentType: 'image/jpeg' },
      { filename: 'b.jpg', buffer: Buffer.alloc(0), contentType: 'image/jpeg' },
      { filename: 'c.jpg', buffer: original, contentType: 'image/jpeg' },
    ])

    expect(results).toHaveLength(3)
    expect(results[0].ok).toBe(true)
    expect(results[0].receipt?.vendor).toBe('Tesco')
    expect(results[1].ok).toBe(false)
    expect(results[1].error).toContain('empty image')
    expect(results[2].ok).toBe(true)
  })
})

describe('End-to-End Real Launch Flows & Full Pipeline Validation', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('Flow 1: Texto simples ("gastei 50 reais no mercado")', async () => {
    const aiOutput = {
      vendor: 'Mercado',
      vendor_address: null,
      date: '2026-09-22',
      time: null,
      currency: 'BRL',
      category: 'Groceries',
      items: [{ description: 'Compras no mercado', quantity: 1, unit_price: 50, total: 50, category: 'Groceries' }],
      subtotal: 50,
      tax: null,
      tip: null,
      total: 50,
      payment_method: null,
      notes: null,
    }
    const { client } = stubOpenAI(aiOutput)
    const scanResult = await scanReceipt('gastei 50 reais no mercado', undefined, client)

    expect(scanResult.receipt.vendor).toBe('Mercado')
    expect(scanResult.receipt.total).toBe(50)
    expect(scanResult.receipt.category).toBe('Groceries')
    expect(scanResult.receipt.items).toHaveLength(1)
    expect(scanResult.receipt.items[0].description).toBe('Compras no mercado')
  })

  it('Flow 2: Texto com estabelecimento ("gastei 84 reais no Carrefour")', async () => {
    const aiOutput = {
      vendor: 'Carrefour',
      vendor_address: null,
      date: '2026-09-22',
      time: null,
      currency: 'BRL',
      category: 'Groceries',
      items: [{ description: 'Despesa Carrefour', quantity: 1, unit_price: 84, total: 84, category: 'Groceries' }],
      subtotal: 84,
      tax: null,
      tip: null,
      total: 84,
      payment_method: null,
      notes: null,
    }
    const { client } = stubOpenAI(aiOutput)
    const scanResult = await scanReceipt('gastei 84 reais no Carrefour', undefined, client)

    expect(scanResult.receipt.vendor).toBe('Carrefour')
    expect(scanResult.receipt.total).toBe(84)
    expect(scanResult.receipt.category).toBe('Groceries')
  })

  it('Flow 3: Texto com data relativa ("ontem gastei 35 reais na farmácia")', async () => {
    const aiOutput = {
      vendor: 'Farmácia',
      vendor_address: null,
      date: '2026-09-21',
      time: null,
      currency: 'BRL',
      category: 'Health',
      items: [{ description: 'Medicamentos / Farmácia', quantity: 1, unit_price: 35, total: 35, category: 'Pharmacy' }],
      subtotal: 35,
      tax: null,
      tip: null,
      total: 35,
      payment_method: null,
      notes: null,
    }
    const { client } = stubOpenAI(aiOutput)
    const scanResult = await scanReceipt('ontem gastei 35 reais na farmácia', undefined, client)

    expect(scanResult.receipt.vendor).toBe('Farmácia')
    expect(scanResult.receipt.date).toBe('2026-09-21')
    expect(scanResult.receipt.category).toBe('Health')
    expect(scanResult.receipt.items[0].category).toBe('Pharmacy')
    expect(scanResult.receipt.total).toBe(35)
  })

  it('Flow 3.1: Texto com pagamento via Pix ("almoço 45 reais via Pix")', async () => {
    const aiOutput = {
      vendor: 'Restaurante',
      vendor_address: null,
      date: '2026-09-25',
      time: null,
      currency: 'BRL',
      category: 'Alimentação',
      items: [{ description: 'Almoço', quantity: 1, unit_price: 45, total: 45, category: 'Alimentação' }],
      subtotal: 45,
      tax: null,
      tip: null,
      total: 45,
      payment_method: 'Pix',
      notes: null,
    }
    const { client } = stubOpenAI(aiOutput)
    const scanResult = await scanReceipt('almoço 45 reais via Pix', undefined, client)

    expect(scanResult.receipt.payment_method).toBe('Pix')
    expect(scanResult.receipt.total).toBe(45)

    const { parseTextExpense } = await import('@/lib/pipeline')
    const vision = await import('@/lib/vision')
    vi.spyOn(vision, 'scanReceipt').mockResolvedValue({
      receipt: scanResult.receipt,
      model: 'gpt-4o-mini',
      usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0 },
    })

    const parsed = await parseTextExpense('almoço 45 reais via Pix')
    expect(parsed.receipt.payment_method).toBe('Pix')
    expect(parsed.receipt.total).toBe(45)
  })

  it('Flow 4: Texto com vários itens ("no mercado comprei arroz 25, macarrão 8 e leite 12")', async () => {
    const aiOutput = {
      vendor: 'Mercado',
      vendor_address: null,
      date: '2026-09-22',
      time: null,
      currency: 'BRL',
      category: 'Groceries',
      items: [
        { description: 'Arroz', quantity: 1, unit_price: 25, total: 25, category: 'Pantry' },
        { description: 'Macarrão', quantity: 1, unit_price: 8, total: 8, category: 'Pantry' },
        { description: 'Leite', quantity: 1, unit_price: 12, total: 12, category: 'Dairy' },
      ],
      subtotal: 45,
      tax: null,
      tip: null,
      total: 45,
      payment_method: null,
      notes: null,
    }
    const { client } = stubOpenAI(aiOutput)
    const scanResult = await scanReceipt('no mercado comprei arroz 25, macarrão 8 e leite 12', undefined, client)

    expect(scanResult.receipt.items).toHaveLength(3)
    expect(scanResult.receipt.total).toBe(45)
    expect(scanResult.receipt.items.map((i) => i.description)).toEqual(['Arroz', 'Macarrão', 'Leite'])
  })

  it('Flow 5: Imagem de nota com múltiplos itens e persistência completa em Supabase', async () => {
    const txInsertMock = vi.fn().mockResolvedValue({ error: null })
    const itemsInsertMock = vi.fn().mockResolvedValue({ error: null })
    const fromMock = vi.fn().mockImplementation((table: string) => {
      if (table === 'transactions') return { insert: txInsertMock }
      if (table === 'transaction_items') return { insert: itemsInsertMock }
      return {}
    })

    const mockClient = { from: fromMock } as any
    persistModule.setSupabaseClientForTesting(mockClient)

    const saved = await persistModule.save({
      receipt: receiptFixture,
      imageKey: 'receipts/test.jpg',
      imageSha256: 'sha256-test',
      sourceType: 'image',
    })

    persistModule.setSupabaseClientForTesting(null)

    expect(saved.vendor).toBe('Tesco')
    expect(saved.total).toBe(5.35)
    expect(saved.items).toHaveLength(3)

    // Verify transactions insert
    expect(fromMock).toHaveBeenCalledWith('transactions')
    expect(txInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        vendor: 'Tesco',
        total: 5.35,
        source_type: 'image',
      })
    )

    // Verify transaction_items insert with normalized_name
    expect(fromMock).toHaveBeenCalledWith('transaction_items')
    expect(itemsInsertMock).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          description: 'Semi-Skimmed Milk 2L',
          normalized_name: 'semi-skimmed milk 2l',
          total: 1.45,
        }),
        expect.objectContaining({
          description: 'Wholemeal Bread',
          normalized_name: 'wholemeal bread',
          total: 1.8,
        }),
      ])
    )
  })

  it('Flow 6: Imagem/documento com informações parciais (ex: sem estabelecimento ou data)', async () => {
    const partialOutput = {
      vendor: null,
      vendor_address: null,
      date: null,
      time: null,
      currency: 'BRL',
      category: 'Miscellaneous',
      items: [{ description: 'Produto Desconhecido', quantity: 1, unit_price: 19.9, total: 19.9, category: null }],
      subtotal: 19.9,
      tax: null,
      tip: null,
      total: 19.9,
      payment_method: null,
      notes: null,
    }
    const { client } = stubOpenAI(partialOutput)
    const scanResult = await scanReceipt('19.90 produto sem nome', undefined, client)

    expect(scanResult.receipt.vendor).toBeNull()
    expect(scanResult.receipt.date).toBeNull()
    expect(scanResult.receipt.total).toBe(19.9)
    expect(scanResult.receipt.items[0].description).toBe('Produto Desconhecido')
  })

  it('Flow 7: Entrada onde algum campo não pode ser identificado (campos opcionais nulos)', async () => {
    const partialOutput = {
      vendor: null,
      vendor_address: null,
      date: null,
      time: null,
      currency: null,
      category: null,
      items: [],
      subtotal: null,
      tax: null,
      tip: null,
      total: 15,
      payment_method: null,
      notes: null,
    }
    const { client } = stubOpenAI(partialOutput)
    const scanResult = await scanReceipt('gastei 15', undefined, client)

    expect(scanResult.receipt.total).toBe(15)
    expect(scanResult.receipt.vendor).toBeNull()
    expect(scanResult.receipt.items).toEqual([])
  })

  describe('Income (Receitas) Flows', () => {
    it('Flow 8: Extrai receita de salário corretamente', async () => {
      const incomeFixture = {
        type: 'income',
        vendor: 'Empresa XPTO',
        vendor_address: null,
        date: '2026-09-22',
        time: null,
        currency: 'BRL',
        category: 'Salário',
        items: [{ description: 'Salário Mensal', quantity: 1, unit_price: 5000, total: 5000, category: 'Salário' }],
        subtotal: 5000,
        tax: null,
        tip: null,
        total: 5000,
        payment_method: 'Pix',
        notes: null,
      }
      const { client } = stubOpenAI(incomeFixture)
      const res = await scanReceipt('recebi 5 mil de salário', undefined, client)

      expect(res.receipt.type).toBe('income')
      expect(res.receipt.total).toBe(5000)
      expect(res.receipt.category).toBe('Salário')
    })

    it('Flow 9: Extrai receita de freelance corretamente', async () => {
      const incomeFixture = {
        type: 'income',
        vendor: 'Cliente Freelance',
        vendor_address: null,
        date: '2026-09-22',
        time: null,
        currency: 'BRL',
        category: 'Freelance',
        items: [{ description: 'Projeto Landing Page', quantity: 1, unit_price: 800, total: 800, category: 'Freelance' }],
        subtotal: 800,
        tax: null,
        tip: null,
        total: 800,
        payment_method: null,
        notes: null,
      }
      const { client } = stubOpenAI(incomeFixture)
      const res = await scanReceipt('entrou 800 de freelance', undefined, client)

      expect(res.receipt.type).toBe('income')
      expect(res.receipt.total).toBe(800)
      expect(res.receipt.category).toBe('Freelance')
    })

    it('Flow 10: Extrai reembolso e venda corretamente', async () => {
      const refundFixture = {
        type: 'income',
        vendor: null,
        vendor_address: null,
        date: '2026-09-22',
        time: null,
        currency: 'BRL',
        category: 'Reembolso',
        items: [{ description: 'Reembolso despesa', quantity: 1, unit_price: 120, total: 120, category: 'Reembolso' }],
        subtotal: 120,
        tax: null,
        tip: null,
        total: 120,
        payment_method: null,
        notes: null,
      }
      const { client } = stubOpenAI(refundFixture)
      const res = await scanReceipt('recebi reembolso de 120 reais', undefined, client)

      expect(res.receipt.type).toBe('income')
      expect(res.receipt.total).toBe(120)
      expect(res.receipt.category).toBe('Reembolso')
    })

    it('Flow 11: Persiste receita em Supabase com type = income', async () => {
      const txInsertMock = vi.fn().mockResolvedValue({ error: null })
      const itemsInsertMock = vi.fn().mockResolvedValue({ error: null })
      const mockCategories = [
        { id: 'cat-vendas', name: 'Vendas', normalized_name: 'vendas', type: 'income', icon: 'TrendingUp', color: '#06B6D4', is_system: true, active: true, sort_order: 3 },
      ]
      const categoriesChain = {
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        eq: vi.fn().mockImplementation((col: string, val: any) => {
          if (col === 'type') return categoriesChain
          if (col === 'active') return Promise.resolve({ data: mockCategories, error: null })
          return categoriesChain
        }),
        then: (resolve: any) => resolve({ data: mockCategories, error: null }),
      }
      const fromMock = vi.fn().mockImplementation((table: string) => {
        if (table === 'transactions') return { insert: txInsertMock }
        if (table === 'transaction_items') return { insert: itemsInsertMock }
        if (table === 'categories') return categoriesChain
        return {}
      })

      const mockClient = { from: fromMock } as any
      persistModule.setSupabaseClientForTesting(mockClient)

      const incomeReceipt: Receipt = {
        type: 'income',
        vendor: 'Comprador OLX',
        vendor_address: null,
        date: '2026-09-22',
        time: null,
        currency: 'BRL',
        category: 'Venda',
        items: [{ description: 'Venda de monitor usado', quantity: 1, unit_price: 300, total: 300, category: 'Venda' }],
        subtotal: 300,
        tax: null,
        tip: null,
        total: 300,
        payment_method: 'Pix',
        notes: null,
      }

      const saved = await persistModule.save({
        receipt: incomeReceipt,
        imageKey: null,
        imageSha256: null,
        sourceType: 'text',
      })

      persistModule.setSupabaseClientForTesting(null)

      expect(saved.type).toBe('income')
      expect(saved.total).toBe(300)
      expect(txInsertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'income',
          total: 300,
          category: 'Venda',
        })
      )
    })
  })
})
