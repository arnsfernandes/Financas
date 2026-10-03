import { NextRequest, NextResponse } from 'next/server'
import { getDashboardSummary } from '@/lib/queries'
import { processPendingRecurrences } from '@/lib/recurrence'
import { requireFinancialAuth } from '@/lib/authGuard'

import { unstable_noStore as noStore } from 'next/cache'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

export async function GET(req: NextRequest) {
  noStore()
  const auth = requireFinancialAuth(req)
  if (!auth.authorized && auth.response) {
    return auth.response
  }

  try {
    // Process any due recurring transactions deterministically
    try {
      await processPendingRecurrences()
    } catch (recErr) {
      console.warn('Could not process pending recurrences:', recErr)
    }

    const { searchParams } = new URL(req.url)
    const periodType = (searchParams.get('period') || searchParams.get('periodType') || 'month') as 'week' | 'month' | 'year' | 'custom'
    const monthOffsetParam = searchParams.get('monthOffset')
    const monthOffset = monthOffsetParam !== null ? parseInt(monthOffsetParam, 10) : 0
    const accountId = searchParams.get('accountId') || searchParams.get('account') || undefined
    const paymentMethod = searchParams.get('paymentMethod') || searchParams.get('payment_method') || undefined
    const startDate = searchParams.get('startDate') || undefined
    const endDate = searchParams.get('endDate') || undefined
    const referenceDate = searchParams.get('referenceDate') || undefined

    const summary = await getDashboardSummary({
      userId: auth.userId,
      periodType,
      accountId,
      paymentMethod,
      monthOffset: isNaN(monthOffset) ? 0 : monthOffset,
      startDate,
      endDate,
      referenceDate,
    })
    return NextResponse.json(
      { ok: true, summary },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
        },
      }
    )
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to fetch dashboard summary'
    console.error('Error in GET /api/dashboard:', e)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
