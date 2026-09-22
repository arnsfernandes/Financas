import OpenAI from 'openai'
import sharp from 'sharp'
import { normaliseReceipt, type Receipt } from './schema'

const VISION_MODEL = process.env.VISION_MODEL || 'gpt-4o'
const MAX_PX = parseInt(process.env.MAX_IMAGE_PX || '2048', 10)

const SYSTEM_PROMPT = `You are an intelligent expense and purchase parser.
You extract structured financial data from any input:
- Photographs or scans of printed receipts or invoices (notas fiscais)
- Photographs of handwritten text, purchase notes, or shopping lists
- Any image containing purchase or transaction information
- Raw typed or spoken text descriptions of purchases and expenses

Rules:
- Infer or categorize the overall transaction category (e.g. "Groceries", "Dining", "Transportation", "Utilities", "Office Supplies", "Health", "Entertainment", "Electronics") in the 'category' field.
- For each item, infer a sensible item category (e.g. "Dairy", "Produce", "Bakery", "Beverages", "Pharmacy", "Hardware") in item.category.
- If quantity is not explicitly stated but an item exists, default quantity to 1.
- If total of an item is not given but unit_price and quantity exist, calculate it; or vice-versa.
- If total amount of the transaction is not explicitly stated, calculate it from items, subtotal, tax, and tip.
- Strip currency symbols from numeric fields. Map visible symbols to ISO 4217 code (£ -> GBP, € -> EUR, $ -> USD, R$ -> BRL, ₹ -> INR, etc.). Default to null if unknown.
- Dates must be ISO 8601 (YYYY-MM-DD). If year is omitted in text, assume current context if unambiguous.
- Times are 24-hour HH:MM.
- Use null for any field that cannot be determined or inferred with reasonable certainty. Never invent arbitrary vendors or prices.`

export interface ScanResult {
  receipt: Receipt
  model: string
  usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens: number }
}

const nullableNumber = { type: ['number', 'null'] }
const nullableString = { type: ['string', 'null'] }

const RECEIPT_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    vendor: nullableString,
    vendor_address: nullableString,
    date: nullableString,
    time: nullableString,
    currency: nullableString,
    category: nullableString,
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          description: { type: 'string' },
          quantity: nullableNumber,
          unit_price: nullableNumber,
          total: nullableNumber,
          category: nullableString,
        },
        required: ['description', 'quantity', 'unit_price', 'total', 'category'],
      },
    },
    subtotal: nullableNumber,
    tax: nullableNumber,
    tip: nullableNumber,
    total: nullableNumber,
    payment_method: nullableString,
    notes: nullableString,
  },
  required: [
    'vendor',
    'vendor_address',
    'date',
    'time',
    'currency',
    'category',
    'items',
    'subtotal',
    'tax',
    'tip',
    'total',
    'payment_method',
    'notes',
  ],
} as const

let cachedClient: OpenAI | null = null

function client(): OpenAI {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not set')
  }
  if (!cachedClient) {
    cachedClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  }
  return cachedClient
}

/**
 * Downscale and re-encode an image to keep the request cheap and fast.
 * The result is always JPEG.
 */
export async function preprocessImage(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .rotate()
    .resize(MAX_PX, MAX_PX, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer()
}

export type ScanInput = Buffer | string

/**
 * The single intelligence call. Accepts an image (Buffer) or typed text (string),
 * and returns a normalised, categorized `Receipt`.
 *
 * Uses OpenAI Chat Completions / Structured Outputs.
 *
 * Pass a client to inject a stub in tests; production omits it.
 */
export async function scanReceipt(
  input: ScanInput,
  _mediaType?: string,
  openai: OpenAI = client(),
): Promise<ScanResult> {
  const isImage = Buffer.isBuffer(input)

  const userContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] = []

  if (isImage) {
    const jpeg = await preprocessImage(input)
    const imageBase64 = jpeg.toString('base64')
    userContent.push(
      { type: 'text', text: 'Extract and categorize this expense/receipt.' },
      {
        type: 'image_url',
        image_url: {
          url: `data:image/jpeg;base64,${imageBase64}`,
        },
      },
    )
  } else {
    userContent.push({
      type: 'text',
      text: `Extract and categorize the following purchase / expense description:\n\n${input}`,
    })
  }

  const response = await openai.chat.completions.create({
    model: VISION_MODEL,
    messages: [
      {
        role: 'system',
        content: SYSTEM_PROMPT,
      },
      {
        role: 'user',
        content: userContent,
      },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'expense_extraction',
        strict: true,
        schema: RECEIPT_JSON_SCHEMA,
      },
    },
  })

  const text = response.choices[0]?.message?.content?.trim() || '{}'
  const receipt = normaliseReceipt(JSON.parse(text))

  return {
    receipt,
    model: response.model,
    usage: {
      input_tokens: response.usage?.prompt_tokens ?? 0,
      output_tokens: response.usage?.completion_tokens ?? 0,
      cache_read_input_tokens: response.usage?.prompt_tokens_details?.cached_tokens ?? 0,
    },
  }
}
