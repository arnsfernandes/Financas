import OpenAI from 'openai'
import sharp from 'sharp'
import { normaliseReceipt, type Receipt } from './schema'

export const VISION_MODEL = process.env.VISION_MODEL || 'gpt-4o'
export const TEXT_MODEL = process.env.TEXT_MODEL || 'gpt-4o-mini'
const MAX_PX = parseInt(process.env.MAX_IMAGE_PX || '2048', 10)

/**
 * Returns current timestamp details formatted for Sao Paulo timezone
 */
export function getCurrentDateTimeContext(): { date: string; time: string; weekday: string; full: string } {
  const now = new Date()
  const timeZone = 'America/Sao_Paulo'

  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)

  const time = new Intl.DateTimeFormat('pt-BR', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(now)

  const weekday = new Intl.DateTimeFormat('pt-BR', {
    timeZone,
    weekday: 'long',
  }).format(now)

  return {
    date,
    time,
    weekday,
    full: `${date} (${weekday}) às ${time} [Timezone: America/Sao_Paulo]`,
  }
}

/**
 * Prompt dedicated to raw typed text / quick text inputs (no OCR or image instructions).
 */
export function buildTextSystemPrompt(contextDate = getCurrentDateTimeContext()): string {
  return `You are an intelligent financial transaction and expense/income parser.
You extract structured financial data from raw typed or spoken text descriptions of purchases, expenses, or income (e.g. "recebi 5 mil de salário", "entrou 800 de freelance", "recebi reembolso de 120 reais", "gastei 84 no Carrefour comprando arroz e café", "almoço 45 reais no débito").

CURRENT REFERENCE DATE & TIME (America/Sao_Paulo):
- Reference Date (today): ${contextDate.date} (${contextDate.weekday})
- Reference Time: ${contextDate.time}
- Reference Full: ${contextDate.full}

Rules for relative dates:
- "hoje" / "today" -> ${contextDate.date}
- "ontem" / "yesterday" -> compute 1 day before reference date (${contextDate.date})
- "anteontem" / "day before yesterday" -> compute 2 days before reference date (${contextDate.date})
- "amanhã" / "tomorrow" -> compute 1 day after reference date (${contextDate.date})
- "quarta passada", "última segunda", etc. -> compute the most recent matching weekday prior to reference date.
- Explicit dates (e.g. "28/11/2025", "28 de novembro de 2025") must ALWAYS be output exactly as stated in ISO 8601 (YYYY-MM-DD), even if they are in the past or previous years.
- For installment purchases (e.g. "comprado em 28/11/2025 em 12x"), the date field MUST be the exact date of purchase (the first installment date), NEVER adjusted to the current month or current year.
- Dates must ALWAYS be output in ISO 8601 (YYYY-MM-DD). If year is omitted, use the context year.

Transaction Type & Category Rules:
- Determine if the transaction is an 'income' (receita/entrada) or 'expense' (despesa/gasto/saída) in the 'type' field ('expense' | 'income').
- If the user received money, got paid, received salary, freelance, sale, refund, or investment return -> type = 'income'.
- If the user paid, bought, spent, or described a purchase/bill -> type = 'expense'.
- For INCOME transactions, categorize into one of: "Salário", "Freelance", "Vendas", "Rendimentos", "Reembolsos", "Outros".
- For EXPENSE transactions, categorize into one of: "Alimentação", "Mercado", "Moradia", "Transporte", "Saúde", "Lazer", "Compras", "Educação", "Assinaturas", "Serviços", "Impostos & Tarifas", "Outros".
- For income, the vendor field can be the payer/client/source/company if mentioned, or null.
- For expenses, extract the store, vendor, platform or merchant name into vendor.
- For each item mentioned, infer a sensible item category in item.category (e.g. "Laticínios", "Hortifrúti", "Limpeza", "Farmácia", "Bebidas", "Padaria").
- If quantity is not explicitly stated but an item exists, default quantity to 1.
- If total of an item is not given but unit_price and quantity exist, calculate it; or vice-versa.
- If total amount of the transaction is not explicitly stated, calculate it from items, subtotal, tax, and tip.
- Payment Method Rules:
  * If the user mentions "pix", "via pix", "no pix", "chave pix" -> payment_method = 'Pix'.
  * If the user mentions "cartão de crédito", "no crédito", "no credito", "parcelado" -> payment_method = 'Cartão de Crédito'.
  * If the user mentions "débito", "debito", "no débito" -> payment_method = 'Cartão de Débito'.
  * If the user mentions "dinheiro", "em espécie", "em dinheiro" -> payment_method = 'Dinheiro'.
  * If not mentioned, infer from context or leave null.
- Map currency terms/symbols to ISO 4217 code (R$ / reais -> BRL, $ / dólares -> USD, € -> EUR, etc.). Default to 'BRL' if Brazilian currency/terms are detected.
- Times are 24-hour HH:MM. If not mentioned in text, use null.
- Use null for any field that cannot be determined or inferred with reasonable certainty. Never invent arbitrary vendors or prices.`
}

/**
 * Prompt for image / receipt / invoice scans.
 */
export function buildSystemPrompt(contextDate = getCurrentDateTimeContext()): string {
  return `You are an intelligent financial transaction and expense/income parser.
You extract structured financial data from any input:
- Photographs or scans of printed receipts or invoices (notas fiscais)
- Photographs of handwritten text, purchase notes, or shopping lists
- Any image containing purchase, income, or transaction information
- Raw typed or spoken text descriptions of purchases, expenses, or income (e.g. "recebi 5 mil de salário", "entrou 800 de freelance", "recebi reembolso de 120 reais", "ganhei 300 com venda", "gastei 50 no mercado")

CURRENT REFERENCE DATE & TIME (America/Sao_Paulo):
- Reference Date (today): ${contextDate.date} (${contextDate.weekday})
- Reference Time: ${contextDate.time}
- Reference Full: ${contextDate.full}

Rules for relative dates:
- "hoje" / "today" -> ${contextDate.date}
- "ontem" / "yesterday" -> compute 1 day before reference date (${contextDate.date})
- "anteontem" / "day before yesterday" -> compute 2 days before reference date (${contextDate.date})
- "amanhã" / "tomorrow" -> compute 1 day after reference date (${contextDate.date})
- "quarta passada", "última segunda", etc. -> compute the most recent matching weekday prior to reference date.
- Explicit dates (e.g. "28/11/2025", "28 de novembro de 2025") must ALWAYS be output exactly as stated in ISO 8601 (YYYY-MM-DD), even if they are in the past or previous years.
- For installment purchases (e.g. "comprado em 28/11/2025 em 12x"), the date field MUST be the exact date of purchase (the first installment date), NEVER adjusted to the current month or current year.
- Dates must ALWAYS be output in ISO 8601 (YYYY-MM-DD). If year is omitted, use the context year.

Transaction Type & Category Rules:
- Determine if the transaction is an 'income' (receita/entrada) or 'expense' (despesa/gasto/saída) in the 'type' field ('expense' | 'income').
- If the user received money, got paid, received salary, freelance, sale, refund, or investment return -> type = 'income'.
- If the user paid, bought, spent, or showed a receipt/bill -> type = 'expense'.
- For INCOME transactions, categorize into one of: "Salário", "Freelance", "Vendas", "Rendimentos", "Reembolsos", "Outros".
- For EXPENSE transactions, categorize into one of: "Alimentação", "Mercado", "Moradia", "Transporte", "Saúde", "Lazer", "Compras", "Educação", "Assinaturas", "Serviços", "Impostos & Tarifas", "Outros".
- For income, the vendor field can be the payer/client/source/company if mentioned, or null.
- For each item, infer a sensible item category in item.category (e.g. "Laticínios", "Hortifrúti", "Limpeza", "Farmácia", "Bebidas", "Padaria").

Receipt / Invoice (NFC-e / Cupom Fiscal) Visual Block Extraction & Self-Reconciliation:
The printed final payable total (VALOR A PAGAR / TOTAL R$ / VALOR LÍQUIDO) on the receipt image is the PRIMARY FINANCIAL ANCHOR.

1. VISUAL BLOCK READING FOR EACH ITEM:
   - Receipts present items in visual blocks:
     * Line A (Main line): Product description, Quantity (decimal weights supported, e.g. 0.354 kg), and unit price / gross subtotal.
     * Line B (Immediate sub-line): If the line immediately below contains a discount, rebate, or adjustment (e.g. "Desc.", "-R$ X,XX", "Desconto sobre item", "Vl. Desc"), it belongs directly to the preceding product.
   - For each product block:
     * net_total (stored in 'item.total'): The final net amount actually paid for the item after deducting any sub-line discount (gross subtotal - discount = net total).
     * effective_unit_price (stored in 'item.unit_price'): The actual price paid per unit after discounts (effective_unit_price = net_total / quantity).
     * quantity: The exact quantity (integer or decimal for weight).
   - NEVER create separate standalone products from adjustment/discount lines.
   - NEVER extract footer/summary/tax lines (e.g. "Qtd. Total de Itens", "QTD TOTAL", "Número de Itens", "Tributos Totais", "Troco", "Total Tributos") as items.

2. RECONCILIATION CLOSING CONSTRAINT:
   - Sum of all net item.total values MUST equal the printed final total ('total').
   - If sum(item.total) != total, audit the visual blocks:
     * Check if a sub-line discount below a product was missed or applied to the wrong item;
     * Check if a gross subtotal was captured instead of the discounted net value;
     * Check if decimal weight/quantity was misread;
     * Check for missed or duplicate product lines.
   - Adjust extracted items so that their net values sum to the printed anchor total. No arbitrary values should be invented.

- If quantity is not explicitly stated but an item exists, default quantity to 1.
- If total of an item is not given but unit_price and quantity exist, calculate it; or vice-versa.
- If total amount of the transaction is not explicitly stated, calculate it from items, subtotal, tax, and tip.
- Strip currency symbols from numeric fields. Map visible symbols to ISO 4217 code (£ -> GBP, € -> EUR, $ -> USD, R$ -> BRL, ₹ -> INR, etc.). Default to 'BRL' if Brazilian currency/terms are detected.
- Times are 24-hour HH:MM.
- Use null for any field that cannot be determined or inferred with reasonable certainty. Never invent arbitrary vendors or prices.`
}

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
    type: { type: 'string', enum: ['expense', 'income'] },
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
    'type',
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

export interface ScanOptions {
  model?: string
  additionalContextText?: string | null
}

/**
 * The single intelligence call. Accepts an image (Buffer) or typed text (string),
 * and returns a normalised, categorized `Receipt`.
 *
 * Uses OpenAI Chat Completions / Structured Outputs.
 * - Text inputs use TEXT_MODEL ('gpt-4o-mini' by default) with buildTextSystemPrompt()
 * - Image inputs use VISION_MODEL ('gpt-4o' by default) with buildSystemPrompt()
 *
 * Pass a client to inject a stub in tests; production omits it.
 */
export async function scanReceipt(
  input: ScanInput,
  _mediaType?: string,
  openai: OpenAI = client(),
  options?: ScanOptions,
): Promise<ScanResult> {
  const isImage = Buffer.isBuffer(input)

  const selectedModel =
    options?.model ||
    (isImage ? process.env.VISION_MODEL || 'gpt-4o' : process.env.TEXT_MODEL || 'gpt-4o-mini')

  const systemPrompt = isImage ? buildSystemPrompt() : buildTextSystemPrompt()

  const userContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] = []

  if (isImage) {
    const jpeg = await preprocessImage(input)
    const imageBase64 = jpeg.toString('base64')
    
    let promptText = 'Extract and categorize this expense/receipt.'
    if (options?.additionalContextText && options.additionalContextText.trim()) {
      promptText = `Extract and categorize this expense/receipt image.
The image is the PRIMARY source of truth for vendor/establishment, date, currency, total amount, taxes, and itemized list.
The user also provided this complementary note: "${options.additionalContextText.trim()}".
Use this complementary note ONLY to adjust context (such as payment method, account/card details, or notes), but NEVER let it overwrite or erase the actual store/vendor, total amount, date, or items found on the receipt unless the text explicitly corrects an error on the receipt.`
    }

    userContent.push(
      { type: 'text', text: promptText },
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
    model: selectedModel,
    temperature: 0,
    messages: [
      {
        role: 'system',
        content: systemPrompt,
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

  let text = response.choices[0]?.message?.content?.trim() || '{}'
  let parsedJson = JSON.parse(text)
  let receipt = normaliseReceipt(parsedJson)

  // SECOND-PASS VISUAL RECONCILIATION FOR IMAGES
  // If the extracted items sum diverges from the printed total detected on the receipt,
  // execute an immediate second-pass review focused on line pairing, discounts, and weights.
  if (isImage && receipt.items && receipt.items.length > 0 && typeof receipt.total === 'number' && receipt.total > 0) {
    const itemsSum = receipt.items.reduce((acc, it) => acc + (it.total || 0), 0)
    const diff = Math.abs(itemsSum - receipt.total)

    if (diff > 0.05) {
      try {
        const diffDirection = itemsSum < receipt.total ? `UNDER-COUNT (missing R$ ${diff.toFixed(2)})` : `OVER-COUNT (excess of R$ ${diff.toFixed(2)})`
        const reconciliationMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
          {
            role: 'system',
            content: systemPrompt,
          },
          {
            role: 'user',
            content: userContent,
          },
          {
            role: 'assistant',
            content: text,
          },
          {
            role: 'user',
            content: `TARGETED VISUAL RECONCILIATION AUDIT:
The printed total anchor recognized on this receipt is R$ ${receipt.total.toFixed(2)}.
However, the extracted items currently sum to R$ ${itemsSum.toFixed(2)}, causing an ${diffDirection}.

Do NOT re-extract everything generically. Focus specifically on identifying the lines causing the difference:
1. CHECK VISUAL ITEM BLOCKS & SUB-LINES: Check every product line and its immediate sub-line for discounts/adjustments (e.g. "Desc.", "-R$ X,XX", "Desconto sobre item"). If an adjustment line was missed or associated to the wrong item, or if a gross subtotal was recorded instead of the net amount, correct item.total = (quantity × unit_price) - discount.
2. CHECK DECIMAL WEIGHTS / QUANTITIES: For weighed items (kg), ensure the exact decimal quantity and effective unit price are captured accurately.
3. CHECK OMITTED OR DUPLICATED LINES: Ensure no legitimate product line from the image was skipped, and no line was duplicated.
4. EXCLUDE NON-PRODUCT LINES: Ensure no footer totals, "Qtd Total de Itens", or tax summary lines were included as items.
5. FINANCIAL CLOSING CONSTRAINT: The sum of all net item.total values MUST equal the printed receipt total of R$ ${receipt.total.toFixed(2)}.

Re-output the full, corrected structured JSON.`,
          },
        ]

        const secondPassResponse = await openai.chat.completions.create({
          model: selectedModel,
          temperature: 0,
          messages: reconciliationMessages,
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'expense_extraction',
              strict: true,
              schema: RECEIPT_JSON_SCHEMA,
            },
          },
        })

        const secondPassText = secondPassResponse.choices[0]?.message?.content?.trim()
        if (secondPassText) {
          const secondParsed = JSON.parse(secondPassText)
          const secondReceipt = normaliseReceipt(secondParsed)
          const secondSum = (secondReceipt.items || []).reduce((acc, it) => acc + (it.total || 0), 0)
          const targetTotal = typeof secondReceipt.total === 'number' && secondReceipt.total > 0 ? secondReceipt.total : receipt.total
          const secondDiff = Math.abs(secondSum - targetTotal)

          // Só aceite a segunda leitura se a soma dos itens fechar estritamente com o total dentro de R$ 0,02
          if (secondDiff <= 0.02) {
            text = secondPassText
            receipt = secondReceipt
          }
        }
      } catch {
        // Fallback to initial extraction if second pass fails
      }
    }
  }

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
