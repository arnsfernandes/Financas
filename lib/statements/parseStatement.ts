/**
 * Ponto de entrada da leitura de faturas: descobre o formato e escolhe o leitor.
 *
 * - PDF com texto: leitor por código (qualquer banco). Se não achar lançamentos, usa a IA de reserva.
 * - PDF escaneado (sem texto): OCR local da Apple (Vision) + o mesmo leitor por código. IA só se o OCR
 *   não resolver.
 * - OFX (exportado pelo internet banking): leitor por código.
 * - CSV / planilha exportada (Nubank, Inter, C6…): leitor por código.
 * - Texto colado (.txt): mesmo leitor do PDF.
 */
import { createHash } from 'crypto'
import {
  detectIssuer, extractUpcomingParcels, makeLine, parseMoneyBR, parseStatementText, readPdf, StatementParseError,
  type ParsedStatement, type StatementLine,
} from './interPdf'
import { parseStatementWithAi, statementAiAvailable } from './aiStatement'
import { appleOcrAvailable, ocrPdf } from './appleOcr'

export { StatementParseError }
export { StatementPasswordError } from './interPdf'

const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex')

/**
 * Posição do cabeçalho %PDF, ou -1. Aceita bytes nulos/espaços antes dele: o PDF do Inter baixado
 * no celular (ou enviado por AirDrop) chega com centenas de KB de zeros antes do cabeçalho.
 */
export function pdfStart(buffer: Buffer): number {
  const at = buffer.indexOf('%PDF')
  if (at < 0) return -1
  if (at < 1024) return at
  for (let i = 0; i < at; i++) {
    const b = buffer[i]
    if (b !== 0 && b !== 0x20 && b !== 0x09 && b !== 0x0a && b !== 0x0d) return -1
  }
  return at
}

function isoFrom(text: string): string | null {
  const t = text.trim()
  let m = /^(\d{4})-?(\d{2})-?(\d{2})/.exec(t)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/.exec(t)
  if (m) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])
    return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  }
  return null
}

/** Valor em texto de planilha: "1.234,56", "1234.56", "-R$ 10,00", "(10,00)". */
export function parseAnyAmount(text: string): number | null {
  let t = text.trim().replace(/\s/g, '').replace(/R\$|BRL|US\$/gi, '').replace(/−/g, '-')
  let negative = /^-|-$|^\(.*\)$/.test(t)
  t = t.replace(/[()+-]/g, '')
  if (!/\d/.test(t)) return null
  if (/,\d{1,2}$/.test(t)) t = t.replace(/\./g, '').replace(',', '.')
  else t = t.replace(/,/g, '')
  const n = Number(t)
  if (!Number.isFinite(n)) return null
  return negative ? -n : n
}

/** OFX (SGML ou XML). Em OFX, valor negativo é saída (compra) e positivo é entrada (pagamento/estorno). */
export function parseOfx(text: string, sha256: string): ParsedStatement {
  const tag = (block: string, name: string) => {
    const m = new RegExp(`<${name}>([^<\\r\\n]*)`, 'i').exec(block)
    return m ? m[1].trim() : ''
  }
  const blocks = text.split(/<STMTTRN>/i).slice(1).map((b) => b.split(/<\/STMTTRN>/i)[0])
  const card = tag(text, 'ACCTID').replace(/\D/g, '').slice(-4)
  const lines: StatementLine[] = []
  for (const b of blocks) {
    const date = isoFrom(tag(b, 'DTPOSTED'))
    const amount = parseAnyAmount(tag(b, 'TRNAMT'))
    const description = [tag(b, 'NAME'), tag(b, 'MEMO')].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(' ')
    if (!date || amount === null || amount === 0 || !description) continue
    lines.push(makeLine({ index: lines.length, date, description, amount, credit: amount > 0, card: card ? `****${card}` : null,
      raw: b.replace(/\s+/g, ' ').trim() }))
  }
  const org = tag(text, 'ORG')
  const detected = detectIssuer(`${org}\n${text.slice(0, 2000)}`)
  const dueDate = isoFrom(tag(text, 'DTDUE') || '') || null
  return { ...detected, issuerName: detected.issuerName || org || null, source: 'ofx', dueDate, sha256, lines }
}

function splitCsvLine(line: string, sep: string): string[] {
  const out: string[] = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') { cur += '"'; i++ } else quoted = !quoted
    } else if (ch === sep && !quoted) { out.push(cur); cur = '' } else cur += ch
  }
  out.push(cur)
  return out.map((c) => c.trim())
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

/** CSV exportado pelo banco: acha as colunas de data, descrição e valor pelo cabeçalho. */
export function parseCsv(text: string, sha256: string): ParsedStatement | null {
  const rows = text.replace(/^﻿/, '').split(/\r?\n/).filter((r) => r.trim())
  if (rows.length < 2) return null
  const sep = [';', ',', '\t'].sort((a, b) => rows[0].split(b).length - rows[0].split(a).length)[0]
  let headerAt = -1
  let cols = { date: -1, desc: -1, amount: -1, credit: -1, installment: -1 }
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const h = splitCsvLine(rows[i], sep).map(norm)
    const find = (re: RegExp) => h.findIndex((c) => re.test(c))
    const c = {
      date: find(/^data|^date|^dt/),
      desc: find(/descri|titulo|title|historico|estabelec|lancamento|memo|nome/),
      amount: find(/^valor|amount|value|^debito|^montante/),
      credit: find(/^credito$/),
      installment: find(/^parcela/),
    }
    if (c.date >= 0 && c.desc >= 0 && c.amount >= 0) { headerAt = i; cols = c; break }
  }
  if (headerAt < 0) return null

  const parsed: Array<{ date: string; description: string; value: number; installment: string }> = []
  for (const row of rows.slice(headerAt + 1)) {
    const cells = splitCsvLine(row, sep)
    const date = isoFrom(cells[cols.date] || '')
    const description = (cells[cols.desc] || '').trim()
    let value = parseAnyAmount(cells[cols.amount] || '')
    if (cols.credit >= 0 && (value === null || value === 0)) {
      const c = parseAnyAmount(cells[cols.credit] || '')
      if (c) value = -Math.abs(c) // coluna de crédito separada: sinal oposto ao dos gastos
    }
    if (!date || !description || value === null || value === 0) continue
    parsed.push({ date, description, value, installment: cols.installment >= 0 ? cells[cols.installment] || '' : '' })
  }
  if (!parsed.length) return null
  // Convenção de sinal pela maioria: a maior parte das linhas de uma fatura são gastos.
  const positives = parsed.filter((p) => p.value > 0).length
  const expenseSign = positives >= parsed.length - positives ? 1 : -1
  const lines = parsed.map((p, index) => {
    const inst = /(\d{1,2})\s*(?:\/|de)\s*(\d{1,2})/.exec(p.installment)
    return makeLine({ index, date: p.date, description: p.description, amount: p.value, credit: Math.sign(p.value) !== expenseSign,
      card: null, installmentCurrent: inst ? Number(inst[1]) : null, installmentTotal: inst ? Number(inst[2]) : null })
  })
  return { ...detectIssuer(text.slice(0, 3000)), source: 'csv', dueDate: null, sha256, lines }
}

export interface ParseOptions {
  filename: string
  /** força a leitura com IA (botão "Ler com IA") */
  forceAi?: boolean
  /** senha do PDF protegido (usada só para abrir o arquivo; nunca guardada) */
  password?: string
}

/** Lê uma fatura em qualquer formato aceito. */
export async function parseStatementFile(buffer: Buffer, options: ParseOptions): Promise<ParsedStatement> {
  const head = buffer.subarray(0, 4096).toString('latin1')
  const isPdf = pdfStart(buffer) >= 0

  if (isPdf) {
    const pdf = await readPdf(buffer, options.password)
    const { sha256, data } = pdf
    let text = pdf.text
    let hasText = text.replace(/\s/g, '').length > 80
    let source: 'pdf' | 'ocr' = 'pdf'
    // PDF escaneado: OCR local da Apple, sem rede e sem IA.
    if (!hasText && appleOcrAvailable()) {
      try {
        text = await ocrPdf(data, options.password)
        hasText = text.replace(/\s/g, '').length > 80
        source = 'ocr'
      } catch (e) {
        console.error('Apple Vision OCR failed:', e)
      }
    }
    if (!options.forceAi && hasText) {
      const parsed: ParsedStatement = { ...parseStatementText(text, sha256), source }
      if (source === 'pdf') parsed.upcoming = await extractUpcomingParcels(new Uint8Array(data), options.password).catch(() => [])
      if (source === 'ocr')
        parsed.warnings = ['PDF escaneado: lido com o OCR da Apple, no seu Mac (sem IA). Confira os valores antes de registrar.']
      if (parsed.lines.length > 0) return parsed
    }
    if (!statementAiAvailable()) {
      throw new StatementParseError(
        hasText
          ? 'Não encontrei lançamentos neste PDF. Tente exportar a fatura em OFX ou CSV pelo app do banco.'
          : 'Este PDF é uma imagem (escaneado) e não foi possível ler o texto. Exporte a fatura em PDF original, OFX ou CSV.',
      )
    }
    const parsed = await parseStatementWithAi({ text: hasText ? text : undefined, pdf: data, filename: options.filename, sha256 })
    if (!parsed.lines.length) throw new StatementParseError('Nenhum lançamento encontrado nesta fatura.')
    return hasText ? crossCheckAi(parsed, parseStatementText(text, sha256)) : parsed
  }

  const sha256 = sha(buffer)
  const text = buffer.toString('utf8').includes('�') ? buffer.toString('latin1') : buffer.toString('utf8')
  if (/OFXHEADER|<OFX>/i.test(head)) {
    const parsed = parseOfx(text, sha256)
    if (parsed.lines.length) return parsed
    throw new StatementParseError('Nenhum lançamento encontrado no arquivo OFX.')
  }
  const csv = parseCsv(text, sha256)
  if (csv) return csv
  const plain = { ...parseStatementText(text, sha256), source: 'text' as const }
  if (plain.lines.length) return plain
  if (statementAiAvailable() && text.replace(/\s/g, '').length > 200) {
    const parsed = await parseStatementWithAi({ text, filename: options.filename, sha256 })
    if (parsed.lines.length) return parsed
  }
  throw new StatementParseError('Formato não reconhecido. Envie a fatura em PDF, OFX ou CSV.')
}

export { parseMoneyBR }

const money = (n: number) => `R$ ${n.toFixed(2).replace('.', ',')}`

/**
 * A IA pode pular linhas (ex.: juntar créditos repetidos de estorno). Compara com a leitura por código
 * e com o quadro impresso; o total a pagar vem sempre do documento, nunca da IA.
 */
export function crossCheckAi(ai: ParsedStatement, code: ParsedStatement): ParsedStatement {
  const sum = (st: ParsedStatement, credit: boolean) =>
    st.lines.filter((l) => l.isCredit === credit && l.kind !== 'payment').reduce((s, l) => s + l.amount, 0)
  const warnings = [...(ai.warnings || [])]
  const problems: string[] = []
  if (code.lines.length) {
    if (code.lines.length !== ai.lines.length)
      problems.push(`a IA leu ${ai.lines.length} lançamentos e a leitura por código leu ${code.lines.length}`)
    const [aiDebit, codeDebit, aiCredit, codeCredit] = [sum(ai, false), sum(code, false), sum(ai, true), sum(code, true)]
    if (Math.abs(aiDebit - codeDebit) > 0.02) problems.push(`despesas ${money(aiDebit)} (IA) × ${money(codeDebit)} (código)`)
    if (Math.abs(aiCredit - codeCredit) > 0.02) problems.push(`estornos ${money(aiCredit)} (IA) × ${money(codeCredit)} (código)`)
  }
  if (code.printed?.expenses != null && Math.abs(sum(ai, false) - code.printed.expenses) > 0.02)
    problems.push(`despesas lidas pela IA não batem com as impressas (${money(code.printed.expenses)})`)
  if (problems.length)
    warnings.unshift(`⚠ A leitura da IA NÃO confere: ${problems.join('; ')}. Use a leitura por código (feche e anexe de novo).`)
  else if (code.lines.length) warnings.unshift('✓ A leitura da IA confere com a leitura por código.')
  return {
    ...ai,
    issuer: code.issuer !== 'unknown' ? code.issuer : ai.issuer,
    issuerName: code.issuerName || ai.issuerName,
    dueDate: code.dueDate || ai.dueDate,
    printed: code.printed,
    statedTotal: code.statedTotal ?? null,
    warnings,
  }
}

/** Hash do arquivo, igual ao usado na leitura (PDF: a partir do cabeçalho %PDF). */
export function fileSha256(buffer: Buffer): string {
  const start = pdfStart(buffer)
  return sha(start >= 0 ? buffer.subarray(start) : buffer)
}

/**
 * Leitura por IA não é determinística: na confirmação, reaproveita o que o usuário revisou na prévia
 * (só se for do mesmo arquivo), renormalizando cada linha.
 */
export function statementFromPreview(json: unknown, buffer: Buffer): ParsedStatement | null {
  const st = json as Partial<ParsedStatement> | null
  if (!st || !Array.isArray(st.lines) || st.sha256 !== fileSha256(buffer)) return null
  const ISO = /^\d{4}-\d{2}-\d{2}$/
  const lines = st.lines
    .filter((l) => l && ISO.test(String(l.date)) && Number(l.amount) > 0 && String(l.description || '').trim())
    .map((l, index) =>
      makeLine({ index, date: l.date, description: l.description, amount: Number(l.amount), credit: Boolean(l.isCredit),
        payment: l.kind === 'payment', card: typeof l.card === 'string' ? l.card : null,
        installmentCurrent: l.installmentCurrent, installmentTotal: l.installmentTotal }))
  return {
    issuer: String(st.issuer || 'unknown'),
    issuerName: typeof st.issuerName === 'string' ? st.issuerName : null,
    source: 'ai',
    dueDate: typeof st.dueDate === 'string' && ISO.test(st.dueDate) ? st.dueDate : null,
    sha256: st.sha256!,
    lines,
    statedTotal: typeof st.statedTotal === 'number' ? st.statedTotal : null,
    warnings: Array.isArray(st.warnings) ? st.warnings.map(String) : [],
  }
}
