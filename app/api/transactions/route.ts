import { NextRequest, NextResponse } from 'next/server'
import { listTransactions, type TransactionFilter } from '@/lib/queries'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)

    const filters: TransactionFilter = {
      startDate: searchParams.get('startDate') || searchParams.get('start_date') || undefined,
      endDate: searchParams.get('endDate') || searchParams.get('end_date') || undefined,
      vendor: searchParams.get('vendor') || undefined,
      category: searchParams.get('category') || undefined,
      product: searchParams.get('product') || searchParams.get('item') || undefined,
      itemCategory: searchParams.get('itemCategory') || searchParams.get('item_category') || undefined,
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : undefined,
      offset: searchParams.get('offset') ? parseInt(searchParams.get('offset')!, 10) : undefined,
    }

    const result = await listTransactions(filters)
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to query transactions'
    console.error('Error in GET /api/transactions:', e)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
