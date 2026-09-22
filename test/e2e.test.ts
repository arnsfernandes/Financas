import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { scanReceipt, preprocessImage } from '@/lib/vision'
import { receiptSchema, type Receipt } from '@/lib/schema'

const imagePath = fileURLToPath(new URL('./fixtures/receipt.jpg', import.meta.url))
const receiptFixture: Receipt = receiptSchema.parse(
  JSON.parse(readFileSync(fileURLToPath(new URL('./fixtures/tesco-receipt.json', import.meta.url)), 'utf8')),
)

/**
 * A stub that mimics OpenAI's `chat.completions.create`.
 */
function stubOpenAI(output: unknown) {
  const create = vi.fn(async (params: unknown) => ({
    model: 'gpt-4o',
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

  it('accepts raw typed text input and parses structured expense', async () => {
    const textFixture = {
      vendor: 'Supermercado Central',
      vendor_address: null,
      date: '2026-09-20',
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

    const result = await scanReceipt('Gastei 39,50 no Supermercado Central: 2 cafés 31 reais e 1 pão 8,50 via Pix', undefined, client)

    expect(create).toHaveBeenCalledOnce()
    expect(result.receipt.vendor).toBe('Supermercado Central')
    expect(result.receipt.category).toBe('Groceries')
    expect(result.receipt.total).toBe(39.5)
    expect(result.receipt.items[0].category).toBe('Beverages')
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
    vi.resetModules()
    vi.doMock('@/lib/vision', () => ({
      scanReceipt: vi.fn(async (buf: Buffer) => {
        // The second file is empty: simulate a model/scan failure for it.
        if (buf.length === 0) throw new Error('empty image')
        return { receipt: receiptFixture, model: 'gpt-4o', usage: {} }
      }),
    }))
    vi.doMock('@/lib/storage', () => ({
      store: vi.fn(async () => ({ key: null, sha256: 'hash' })),
      isStorageConfigured: () => false,
    }))

    const { processBatch } = await import('@/lib/pipeline')
    const original = readFileSync(imagePath)

    const results = await processBatch([
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

    vi.doUnmock('@/lib/vision')
    vi.doUnmock('@/lib/storage')
  })
})
