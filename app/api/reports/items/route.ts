import { NextRequest, NextResponse } from 'next/server'
import { getItemReport, type ItemReportFilter } from '@/lib/queries'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)

    const filters: ItemReportFilter = {
      product: searchParams.get('product') || searchParams.get('item') || undefined,
      vendor: searchParams.get('vendor') || undefined,
      category: searchParams.get('category') || undefined,
      itemCategory: searchParams.get('itemCategory') || searchParams.get('item_category') || undefined,
      startDate: searchParams.get('startDate') || searchParams.get('start_date') || undefined,
      endDate: searchParams.get('endDate') || searchParams.get('end_date') || undefined,
    }

    const report = await getItemReport(filters)
    return NextResponse.json({ ok: true, report })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to generate item report'
    console.error('Error in GET /api/reports/items:', e)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
