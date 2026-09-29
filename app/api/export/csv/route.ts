import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { receiptSchema } from '@/lib/schema'
import { receiptsToCsv } from '@/lib/csv'
import { requireFinancialAuth } from '@/lib/authGuard'

export const runtime = 'nodejs'

const bodySchema = z.object({
  receipts: z.array(receiptSchema).min(1),
  layout: z.enum(['summary', 'items']).optional(),
})

/**
 * Export a set of scanned receipts as CSV. POST the validated receipts back and
 * receive a downloadable .csv file that opens in Excel, Google Sheets, Numbers,
 * and imports into most bookkeeping tools.
 *
 * `layout` is "summary" (one row per receipt, the default) or "items" (one row
 * per purchased line, with the parent vendor and date repeated). Unlike OFX,
 * the items layout preserves the full line-item detail of each receipt.
 */
export async function POST(req: NextRequest) {
  const auth = requireFinancialAuth(req)
  if (!auth.authorized && auth.response) {
    return auth.response
  }

  let parsed
  try {
    parsed = bodySchema.parse(await req.json())
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Invalid request body'
    return NextResponse.json({ ok: false, error: message }, { status: 400 })
  }

  const csv = receiptsToCsv(parsed.receipts, { layout: parsed.layout })
  const filename = parsed.layout === 'items' ? 'receipt-items.csv' : 'receipts.csv'

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
