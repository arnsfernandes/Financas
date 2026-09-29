import { NextRequest, NextResponse } from 'next/server'
import { listTransactions, type TransactionFilter } from '@/lib/queries'
import { processPendingRecurrences } from '@/lib/recurrence'
import { requireFinancialAuth } from '@/lib/authGuard'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = requireFinancialAuth(req)
  if (!auth.authorized && auth.response) {
    return auth.response
  }

  try {
    // Process any due recurring transactions deterministically on app load
    try {
      await processPendingRecurrences()
    } catch (recErr) {
      console.warn('Could not process pending recurrences:', recErr)
    }

    const { searchParams } = new URL(req.url)

    const typeParam = searchParams.get('type')
    const type = (typeParam === 'income' || typeParam === 'expense' || typeParam === 'all') ? typeParam : undefined
    const accountId = searchParams.get('accountId') || searchParams.get('account_id') || undefined
    const reviewStatusParam = searchParams.get('reviewStatus') || searchParams.get('review_status')
    const reviewStatus = (reviewStatusParam === 'confirmed' || reviewStatusParam === 'needs_review' || reviewStatusParam === 'all') ? reviewStatusParam : undefined
    const isRecurringParam = searchParams.get('isRecurring') || searchParams.get('is_recurring')
    const isRecurring = isRecurringParam === 'true' ? true : isRecurringParam === 'false' ? false : undefined
    const recurrenceStatus = (searchParams.get('recurrenceStatus') || searchParams.get('recurrence_status')) as 'active' | 'ended' | undefined
    const isInstallmentParam = searchParams.get('isInstallment') || searchParams.get('is_installment')
    const isInstallment = isInstallmentParam === 'true' ? true : isInstallmentParam === 'false' ? false : undefined
    const installmentGroupId = searchParams.get('installmentGroupId') || searchParams.get('installment_group_id') || undefined
    const categoryId = searchParams.get('categoryId') || searchParams.get('category_id') || undefined
    const paymentMethod = searchParams.get('paymentMethod') || searchParams.get('payment_method') || undefined

    const filters: TransactionFilter = {
      type,
      accountId,
      categoryId,
      paymentMethod,
      reviewStatus,
      isRecurring,
      recurrenceStatus,
      isInstallment,
      installmentGroupId,
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
    return NextResponse.json(
      { ok: true, ...result },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
        },
      }
    )
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to query transactions'
    console.error('Error in GET /api/transactions:', e)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

/** Explicit confirmation of the reviewed draft; no AI is called here. */
export async function POST(req: NextRequest) {
  const auth = requireFinancialAuth(req)
  if (!auth.authorized) return auth.response!
  const { save, DuplicateTransactionError } = await import('@/lib/persist')
  try {
    let file: File | null = null
    let body: any
    if ((req.headers.get('content-type') || '').includes('multipart/form-data')) {
      const form = await req.formData()
      body = JSON.parse(String(form.get('payload') || '{}'))
      const uploaded = form.get('file')
      if (uploaded instanceof File) file = uploaded
    } else body = await req.json()
    const { receiptSchema } = await import('@/lib/schema')
    const parsed = receiptSchema.safeParse({ vendor_address: null, currency: 'BRL', subtotal: null,
      tax: null, tip: null, time: null, notes: null, items: [], ...body.receipt })
    if (!parsed.success) return NextResponse.json({ ok: false, error: 'Dados do lançamento inválidos.' }, { status: 400 })
    const receipt = { ...parsed.data, installment_group_id: null }
    const { validateLaunchCompleteness } = await import('@/lib/textRouter')
    const { listAccounts } = await import('@/lib/queries')
    const validation = validateLaunchCompleteness(receipt, await listAccounts({ activeOnly: true }))
    if (!validation.isComplete) return NextResponse.json({ ok: false, error: validation.reason }, { status: 400 })
    if (body.sourceType === 'image' && !file) return NextResponse.json({ ok: false, error: 'Comprovante ausente. Anexe o arquivo antes de salvar.' }, { status: 400 })
    const sourceType = file ? 'image' : body.sourceType === 'text' ? 'text' : 'manual'
    let imageKey: string | null = null
    let imageSha256: string | null = null
    if (file) {
      const { store } = await import('@/lib/storage')
      const stored = await store(Buffer.from(await file.arrayBuffer()), file.type || 'image/jpeg')
      imageKey = stored.key
      imageSha256 = stored.sha256
    }
    const saved = await save({ receipt, imageKey, imageSha256, sourceType, originType: sourceType,
      rawText: typeof body.rawText === 'string' ? body.rawText : null,
      originalFilename: file?.name || null, capturedAt: new Date().toISOString(),
      originalExtractedData: body.originalExtractedData || null, allowDuplicate: body.allowDuplicate === true })
    return NextResponse.json({ ok: true, id: saved.id, receipt: saved })
  } catch (error) {
    if (error instanceof DuplicateTransactionError) return NextResponse.json({ ok: false, isDuplicate: true,
      duplicateType: error.duplicateResult.type, existingTransaction: error.duplicateResult.existingTransaction,
      error: error.message }, { status: 409 })
    console.error('Error in POST /api/transactions:', error)
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Falha ao salvar lançamento.' }, { status: 500 })
  }
}
