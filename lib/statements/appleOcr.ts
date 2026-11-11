/**
 * OCR local com o Vision da Apple, para PDFs escaneados (sem texto). Só funciona em macOS; não usa
 * rede nem IA. O programa Swift é compilado uma vez, na primeira utilização, em node_modules/.cache.
 * Desligue com STATEMENT_OCR=off.
 */
import { execFile } from 'child_process'
import { randomUUID } from 'crypto'
import { existsSync, mkdirSync, statSync } from 'fs'
import { unlink, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { promisify } from 'util'

const run = promisify(execFile)
const SOURCE = join(process.cwd(), 'scripts', 'ocr', 'VisionOCR.swift')
const BINARY = join(process.cwd(), 'node_modules', '.cache', 'vision-ocr', 'vision-ocr')

export function appleOcrAvailable(): boolean {
  return process.platform === 'darwin' && process.env.STATEMENT_OCR !== 'off' && existsSync(SOURCE)
}

let building: Promise<void> | null = null
async function ensureBinary(): Promise<void> {
  const fresh = existsSync(BINARY) && statSync(BINARY).mtimeMs >= statSync(SOURCE).mtimeMs
  if (fresh) return
  if (!building) {
    mkdirSync(join(BINARY, '..'), { recursive: true })
    building = run('swiftc', ['-O', SOURCE, '-o', BINARY], { timeout: 300_000 })
      .then(() => undefined)
      .finally(() => {
        building = null
      })
  }
  await building
}

interface OcrItem { s: string; x: number; y: number; w: number; h: number }

/** Remonta as linhas visuais: junta os trechos na mesma altura e ordena da esquerda para a direita. */
export function ocrPagesToText(pages: OcrItem[][]): string {
  const out: string[] = []
  for (const items of pages) {
    const heights = items.map((i) => i.h).sort((a, b) => a - b)
    const tolerance = (heights[Math.floor(heights.length / 2)] || 0.01) * 0.55
    const rows: Array<{ y: number; items: OcrItem[] }> = []
    for (const item of [...items].sort((a, b) => b.y - a.y)) {
      const row = rows.find((r) => Math.abs(r.y - item.y) <= tolerance)
      if (row) row.items.push(item)
      else rows.push({ y: item.y, items: [item] })
    }
    for (const row of rows) out.push(row.items.sort((a, b) => a.x - b.x).map((i) => i.s.trim()).join(' '))
  }
  return out.join('\n')
}

export async function ocrPdf(pdf: Buffer, password?: string): Promise<string> {
  await ensureBinary()
  const file = join(tmpdir(), `fatura-ocr-${randomUUID()}.pdf`)
  await writeFile(file, pdf, { mode: 0o600 })
  try {
    const env = password ? { ...process.env, VISION_OCR_PASSWORD: password } : process.env
    const { stdout } = await run(BINARY, [file], { maxBuffer: 64 * 1024 * 1024, timeout: 180_000, env })
    return ocrPagesToText(JSON.parse(stdout) as OcrItem[][])
  } finally {
    await unlink(file).catch(() => undefined)
  }
}
