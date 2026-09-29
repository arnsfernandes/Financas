import { NextRequest, NextResponse } from 'next/server'
import { parseReceiptImage, parseTextExpense } from '@/lib/pipeline'
import { resolveInstallmentPlan } from '@/lib/installments'
import { validateReceipt } from '@/lib/validation'
import type { Receipt } from '@/lib/schema'
import { requireFinancialAuth } from '@/lib/authGuard'

export const runtime = 'nodejs'
export const maxDuration = 60

/** Prepare the same installment/review representation previously returned by save,
 * without inserting transactions, installments or uploading the image. */
function previewResponse(parsed: { receipt: Receipt; originalExtractedData: Record<string, any> }, sourceType: 'text' | 'image', rawText: string | null, originalFilename: string | null = null) {
  const receipt = { ...parsed.receipt }
  const plan = resolveInstallmentPlan({ total: receipt.total || 0, subtotal: receipt.subtotal,
    installmentTotal: receipt.installment_total, installmentCurrent: receipt.installment_current,
    installmentAmount: receipt.installment_amount, notes: receipt.notes, vendor: receipt.vendor })
  if (plan.isMultiInstallment) {
    receipt.total = plan.installmentAmount
    receipt.subtotal = plan.totalPurchaseAmount
    receipt.installment_amount = plan.installmentAmount
    receipt.installment_total = plan.installmentTotal
    receipt.installment_current = plan.installmentCurrent
  }
  // A draft is not an existing installment group. save creates the group on confirmation.
  receipt.installment_group_id = null
  const validation = validateReceipt(parsed.receipt)
  receipt.review_status = validation.reviewStatus
  receipt.review_reasons = validation.reviewReasons
  return NextResponse.json({ ok: true, receipt, originalExtractedData: parsed.originalExtractedData,
    sourceType, rawText, originalFilename })
}

export async function POST(req: NextRequest) {
  const auth = requireFinancialAuth(req)
  if (!auth.authorized && auth.response) {
    return auth.response
  }

  try {
    const contentType = req.headers.get('content-type') || ''

    // Support JSON text input: { text: "...", overrideType?, accountId?, isRecurring?, recurrenceFrequency?, recurrenceNextDate?, installmentTotal?, installmentCurrent?, installmentAmount? }
    if (contentType.includes('application/json')) {
      const body = await req.json()

      if (body.manual || body.receipt) {
        return NextResponse.json({ ok: false, error: 'Use POST /api/transactions para confirmar o lançamento.' }, { status: 400 })
      }

      if (!body.text || typeof body.text !== 'string') {
        return NextResponse.json({ ok: false, error: 'No text provided' }, { status: 400 })
      }
      const overrideType = body.overrideType === 'income' || body.overrideType === 'expense' ? body.overrideType : undefined
      const accountId = typeof body.accountId === 'string' && body.accountId.trim() ? body.accountId.trim() : undefined
      const isRecurring = typeof body.isRecurring === 'boolean' ? body.isRecurring : undefined
      const recurrenceFrequency = body.recurrenceFrequency || undefined
      const recurrenceNextDate = body.recurrenceNextDate || undefined
      const installmentTotal = typeof body.installmentTotal === 'number' ? body.installmentTotal : (body.installmentTotal ? parseInt(body.installmentTotal, 10) : undefined)
      const installmentCurrent = typeof body.installmentCurrent === 'number' ? body.installmentCurrent : (body.installmentCurrent ? parseInt(body.installmentCurrent, 10) : undefined)
      const installmentAmount = typeof body.installmentAmount === 'number' ? body.installmentAmount : (body.installmentAmount ? parseFloat(body.installmentAmount) : undefined)

      const parsed = await parseTextExpense(body.text, {
        overrideType,
        accountId,
        isRecurring,
        recurrenceFrequency,
        recurrenceNextDate,
        installmentTotal,
        installmentCurrent,
        installmentAmount,
      })
      return previewResponse(parsed, 'text', body.text)
    }

    // Default: Multipart form data with file (image/pdf)
    const form = await req.formData()
    const file = form.get('file')
    const text = form.get('text')
    const rawOverrideType = form.get('overrideType')
    const overrideType: 'income' | 'expense' | undefined = rawOverrideType === 'income' || rawOverrideType === 'expense' ? rawOverrideType : undefined
    const rawAccountId = form.get('accountId')
    const accountId = typeof rawAccountId === 'string' && rawAccountId.trim() ? rawAccountId.trim() : undefined
    const isRecurring = form.get('isRecurring') === 'true'
    const recurrenceFrequency = (form.get('recurrenceFrequency') as 'monthly' | 'weekly' | 'yearly' | null) || undefined
    const recurrenceNextDate = (form.get('recurrenceNextDate') as string) || undefined
    const rawInstTotal = form.get('installmentTotal')
    const installmentTotal = rawInstTotal ? parseInt(String(rawInstTotal), 10) : undefined
    const rawInstCurrent = form.get('installmentCurrent')
    const installmentCurrent = rawInstCurrent ? parseInt(String(rawInstCurrent), 10) : undefined
    const rawInstAmount = form.get('installmentAmount')
    const installmentAmount = rawInstAmount ? parseFloat(String(rawInstAmount)) : undefined

    const processOpts = {
      overrideType,
      accountId,
      isRecurring,
      recurrenceFrequency,
      recurrenceNextDate,
      installmentTotal,
      installmentCurrent,
      installmentAmount,
      filename: file instanceof File ? file.name : undefined,
      rawText: typeof text === 'string' && text.trim() ? text.trim() : undefined,
    }

    // Se temos arquivo (com ou sem texto complementar), a imagem é a fonte primária
    if (file instanceof File) {
      const buf = Buffer.from(await file.arrayBuffer())
      const parsed = await parseReceiptImage(buf, file.type || 'image/jpeg', processOpts)
      return previewResponse(parsed, 'image', processOpts.rawText || null, file.name)
    }

    // Se temos somente texto sem arquivo
    if (typeof text === 'string' && text.trim()) {
      const parsed = await parseTextExpense(text, processOpts)
      return previewResponse(parsed, 'text', text)
    }

    return NextResponse.json({ ok: false, error: 'No file or text uploaded' }, { status: 400 })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Scan failed'
    console.error('Scan error:', e)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
