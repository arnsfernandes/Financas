import { scanReceipt } from './vision'
import { store } from './storage'
import { save } from './persist'
import type { StoredReceipt } from './schema'

/**
 * The end-to-end scan pipeline for images: store the original, run the AI call, and
 * persist the validated result.
 */
export async function processReceipt(
  buffer: Buffer,
  contentType: string,
): Promise<StoredReceipt> {
  const stored = await store(buffer, contentType)
  const { receipt } = await scanReceipt(buffer, contentType)
  return save({ receipt, imageKey: stored.key, imageSha256: stored.sha256, sourceType: 'image' })
}

/**
 * Process a text-based expense description into a persisted, structured receipt.
 */
export async function processTextExpense(text: string): Promise<StoredReceipt> {
  const { receipt } = await scanReceipt(text)
  return save({ receipt, imageKey: null, imageSha256: null, sourceType: 'text' })
}

export interface BatchItemResult {
  filename: string
  ok: boolean
  receipt?: StoredReceipt
  error?: string
}

/**
 * Process several receipts. Each file is independent: one bad image does not
 * fail the rest of the batch, so every item gets its own ok/error result.
 * Files are processed with bounded concurrency to keep the model bill and
 * memory predictable.
 */
export async function processBatch(
  files: { filename: string; buffer: Buffer; contentType: string }[],
  concurrency = 4,
): Promise<BatchItemResult[]> {
  const results: BatchItemResult[] = new Array(files.length)
  let cursor = 0

  async function worker(): Promise<void> {
    while (cursor < files.length) {
      const index = cursor++
      const file = files[index]
      try {
        const receipt = await processReceipt(file.buffer, file.contentType)
        results[index] = { filename: file.filename, ok: true, receipt }
      } catch (e) {
        results[index] = {
          filename: file.filename,
          ok: false,
          error: e instanceof Error ? e.message : 'Scan failed',
        }
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, files.length) }, worker),
  )
  return results
}
