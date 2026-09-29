import { NextRequest, NextResponse } from 'next/server'
import { processBatch } from '@/lib/pipeline'
import { requireFinancialAuth } from '@/lib/authGuard'

export const runtime = 'nodejs'
export const maxDuration = 300

const MAX_FILES = 50

/**
 * Multi-receipt batch upload. Accepts many `file` parts in one multipart
 * request, scans them with bounded concurrency, and returns a per-file result
 * so the caller can see exactly which receipts succeeded.
 */
export async function POST(req: NextRequest) {
  const auth = requireFinancialAuth(req)
  if (!auth.authorized) {
    return auth.response!
  }

  try {
    const form = await req.formData()
    const files = form.getAll('file').filter((f): f is File => f instanceof File)

    if (files.length === 0) {
      return NextResponse.json({ ok: false, error: 'No files uploaded' }, { status: 400 })
    }
    if (files.length > MAX_FILES) {
      return NextResponse.json(
        { ok: false, error: `Too many files: ${files.length}. The limit is ${MAX_FILES}.` },
        { status: 400 },
      )
    }

    const inputs = await Promise.all(
      files.map(async (file) => ({
        filename: file.name || 'receipt',
        buffer: Buffer.from(await file.arrayBuffer()),
        contentType: file.type || 'image/jpeg',
      })),
    )

    const results = await processBatch(inputs)
    const succeeded = results.filter((r) => r.ok).length

    return NextResponse.json({
      ok: true,
      total: results.length,
      succeeded,
      failed: results.length - succeeded,
      results,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Batch scan failed'
    console.error('Batch scan error:', e)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
