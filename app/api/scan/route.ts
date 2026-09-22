import { NextRequest, NextResponse } from 'next/server'
import { processReceipt, processTextExpense } from '@/lib/pipeline'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get('content-type') || ''

    // Support JSON text input: { text: "Comprei 2 cafés por R$ 10 na padaria ontem" }
    if (contentType.includes('application/json')) {
      const body = await req.json()
      if (!body.text || typeof body.text !== 'string') {
        return NextResponse.json({ ok: false, error: 'No text provided' }, { status: 400 })
      }
      const receipt = await processTextExpense(body.text)
      return NextResponse.json({ ok: true, id: receipt.id, receipt })
    }

    // Default: Multipart form data with file (image/pdf)
    const form = await req.formData()
    const file = form.get('file')
    const text = form.get('text')

    if (typeof text === 'string' && text.trim()) {
      const receipt = await processTextExpense(text)
      return NextResponse.json({ ok: true, id: receipt.id, receipt })
    }

    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: 'No file or text uploaded' }, { status: 400 })
    }
    const buf = Buffer.from(await file.arrayBuffer())
    const receipt = await processReceipt(buf, file.type || 'image/jpeg')
    return NextResponse.json({ ok: true, id: receipt.id, receipt })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Scan failed'
    console.error('Scan error:', e)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
