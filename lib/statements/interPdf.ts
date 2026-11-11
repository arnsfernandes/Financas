/**
 * Leitor determinístico (sem IA) do texto de faturas de cartão, de qualquer banco.
 *
 * Cada lançamento é uma linha com data no início e valor no fim, por exemplo:
 *   04 de abr. 2026 AUTOZONE BRASIL COMERC (Parcela 05 de 10) - R$ 54,69   (Inter)
 *   10 AGO Padaria Carmelina R$ 38,70                                       (Nubank)
 *   10/08 PADARIA CARMELINA 05/10 38,70                                     (Itaú, Bradesco…)
 * O sinal que marca crédito muda de banco para banco ("+", "-", "C" no fim, ou ausência de
 * sinal): a convenção é descoberta pela própria fatura. Parcelas futuras ("Próxima fatura",
 * "Lançamentos futuros"…) são ignoradas.
 */
import { createHash } from 'crypto'

export type StatementLineKind = 'purchase' | 'payment' | 'credit' | 'fee'

export interface StatementLine {
  /** posição na fatura (0-based), estável para a mesma fatura */
  index: number
  date: string // YYYY-MM-DD (data da compra)
  description: string // como impresso, sem data e valor
  vendor: string // nome limpo para exibição
  amount: number // sempre positivo
  isCredit: boolean
  kind: StatementLineKind
  card: string | null // ex.: 5364****1053
  installmentCurrent: number | null
  installmentTotal: number | null
  raw: string
}

export interface ParsedStatement {
  /** chave da instituição ('inter', 'nubank', 'itau'…) ou 'unknown' */
  issuer: string
  issuerName: string | null
  /** como foi lido: texto do PDF, OFX, CSV, ou IA (reserva) */
  source: 'pdf' | 'ocr' | 'ofx' | 'csv' | 'text' | 'ai'
  dueDate: string | null
  sha256: string
  lines: StatementLine[]
  /** total impresso na fatura, quando encontrado (para conferência) */
  statedTotal?: number | null
  /** parcelas que o banco já informa para a próxima fatura (valor exato de cada uma) */
  upcoming?: Array<{ description: string; vendor: string; current: number; total: number; amount: number }>
  /** quadro-resumo impresso (Inter: Despesas do mês − Valor antecipado = Fatura atual) */
  printed?: { expenses: number | null; advanced: number | null; due: number | null; nextCutoff?: string | null }
  warnings?: string[]
}

/** Como a fatura marca créditos (estornos, pagamentos). */
export type Polarity = 'plus_is_credit' | 'minus_is_credit' | 'unsigned_is_credit'

export class StatementParseError extends Error {}

/** PDF protegido: falta a senha, ou a senha informada está errada. */
export class StatementPasswordError extends StatementParseError {
  constructor(public readonly wrong: boolean) {
    super(wrong ? 'Senha incorreta. Confira e tente de novo.' : 'Esta fatura tem senha. Digite a senha para abrir.')
  }
}

const MONTHS: Record<string, number> = {
  jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
}

const DATE_PT = /^(\d{1,2})[\s/\-]*(?:de\s+)?(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-zç]*\.?(?:[\s/\-]+(?:de\s+)?(\d{4}))?(?![a-z])/i
const DATE_NUM = /^(\d{1,2})[/\-.](\d{1,2})(?:[/\-.](\d{4}|\d{2}))?(?!\d)/
const DATE_ISO = /^(\d{4})-(\d{2})-(\d{2})\b/
const MONEY = '((?:\\d{1,3}(?:\\.\\d{3})+|\\d+),\\d{2})'
const AMOUNT = new RegExp(
  `([+\\-])?\\s*(?:R\\s?\\$|US\\$|USD|BRL)?\\s*([+\\-])?\\s*${MONEY}(?:\\s*([+\\-])|\\s+(CR|C|D)\\.?)?\\s*$`,
  'i',
)
const INSTALLMENT = [
  /\(?\s*parc(?:ela)?\.?\s*(\d{1,2})\s*(?:de|\/)\s*(\d{1,2})\s*\)?/i,
  /\s(\d{1,2})\s*\/\s*(\d{1,2})$/,
]
const SKIP = /^(?:total|subtotal|saldo|pagamento m[ií]nimo|limite|valor|resumo|encargos? (?:do|para)|pr[oó]xima fatura|demais faturas|vencimento|fechamento|melhor data)\b/i
const PAYMENT = /\b(?:pagamento|pagto|pgto)\b/i
const CREDIT_WORDS = /\b(?:estorno|cr[eé]dito|cashback|reembolso|devolu[cç][aã]o)\b/i
const FEE = /\b(?:iof|juros|multa|encargos?|mora|anuidade)\b/i
const DUE = /vencimento[^0-9]{0,90}(\d{2})\/(\d{2})\/(\d{4})/i
const DUE_HEADER = /^\d{4}\*{2,}\d{4}\s+(\d{2})\/(\d{2})\/(\d{4})\b/m
const NEXT_SECTION =
  /^(?:pr[oó]xima fatura|pr[oó]ximas faturas|essas s[aã]o as compras parceladas|compras parceladas\s*[-–:]?\s*pr[oó]xim|lan[cç]amentos futuros|pr[oó]ximos lan[cç]amentos|parcelas futuras|parcelamentos? futuros?)/i
const CARD_MASKED = /(?:(\d{4})[\s.]*)?[*xX•]{2,}[\s*xX•.]*(\d{4})\b/
const CARD_FINAL = /\bfinal\s*:?\s*(\d{4})\b/i
const STATED_TOTAL = new RegExp(
  `(?:total (?:da|desta) fatura|valor (?:total )?(?:da|desta) fatura|total a pagar|valor a pagar|total da fatura atual)[^0-9\\n]{0,60}?(?:R\\s?\\$\\s*)?${MONEY}`,
  'i',
)

const PRINTED_BOX = new RegExp(`despesas do m[eê]s\\s+valor antecipado\\s+fatura atual\\s*\\n\\s*R\\$\\s*${MONEY}\\s+R\\$\\s*${MONEY}\\s+R\\$\\s*${MONEY}`, 'i')
const PRINTED_EXPENSES = new RegExp(`^despesas do m[eê]s\\s+R\\$\\s*${MONEY}`, 'im')
const PRINTED_ADVANCED = new RegExp(`^valor antecipado\\s+R\\$\\s*${MONEY}`, 'im')

/** Instituições reconhecidas pelo cabeçalho/rodapé da fatura (chaves de lib/institutions). */
const ISSUERS: Array<[string, string, RegExp]> = [
  ['inter', 'Banco Inter', /banco inter|bancointer|inter\.co\b|\bintermedium/i],
  ['nubank', 'Nubank', /nubank|nu pagamentos/i],
  ['itau', 'Itaú', /ita[uú] unibanco|itaucard|\bita[uú]\b/i],
  ['bradesco', 'Bradesco', /bradesco|bradescard/i],
  ['santander', 'Santander', /santander/i],
  ['caixa', 'Caixa', /caixa econ[oô]mica/i],
  ['bb', 'Banco do Brasil', /banco do brasil|ourocard/i],
  ['c6', 'C6 Bank', /c6 ?bank|banco c6/i],
  ['picpay', 'PicPay', /picpay/i],
  ['mercadopago', 'Mercado Pago', /mercado pago (?:institui|cart)|mercadopago\.com/i],
  ['btg', 'BTG Pactual', /btg pactual/i],
  ['pagbank', 'PagBank', /pagbank|pagseguro internet/i],
  ['sicoob', 'Sicoob', /sicoob/i],
  ['sicredi', 'Sicredi', /sicredi/i],
  ['xp', 'XP', /xp investimentos|banco xp/i],
  ['neon', 'Neon', /banco neon|neon pagamentos/i],
  ['will', 'Will Bank', /will ?bank/i],
  ['porto', 'Porto Bank', /porto seguro|porto bank/i],
]

export function detectIssuer(text: string): { issuer: string; issuerName: string | null } {
  const rows = text.split(/\r?\n/)
  const edges = [...rows.slice(0, 80), ...rows.slice(-40)].join('\n')
  for (const scope of [edges, text]) {
    for (const [key, name, pattern] of ISSUERS) if (pattern.test(scope)) return { issuer: key, issuerName: name }
  }
  return { issuer: 'unknown', issuerName: null }
}

// Intermediadores que o cartão imprime antes do nome real do estabelecimento.
const PROCESSOR_PREFIX = /^(?:MP|MERCADOPAGO|PAG|PG|PAGSEGURO|IFD|ZP|EC|DM|DL|SQ|SP|CKO|EBN|EBANX|PAYPAL|PP|CA|STRIPE|HTM|PICPAY)\s*\*\s*/i
const BRANDS: Array<[RegExp, string]> = [
  [/NETFLIX/i, 'Netflix'], [/SPOTIFY/i, 'Spotify'], [/AMAZON\s*PRIME|AMAZONPRIME|PRIME\s*VIDEO/i, 'Amazon Prime'],
  [/APPLE\.COM|ITUNES/i, 'Apple'], [/GOOGLE\s*ONE/i, 'Google One'], [/YOUTUBE/i, 'YouTube Premium'],
  [/OPENAI|CHATGPT/i, 'OpenAI'], [/DISNEY/i, 'Disney+'], [/HBO\s*MAX|HBOMAX/i, 'Max'], [/GLOBOPLAY/i, 'Globoplay'],
  [/SMILES/i, 'Smiles'], [/LIVELO/i, 'Livelo'], [/MERCADO\s*LIVRE|MERCADOLIVRE|MERCADO\*MERCADOLIVRE/i, 'Mercado Livre'],
  [/^AMAZON|AMZN/i, 'Amazon'], [/SHOPEE/i, 'Shopee'], [/UBER/i, 'Uber'], [/IFOOD|^IFD\*/i, 'iFood'],
  [/LATAM/i, 'LATAM'], [/AZUL\s*LINHAS/i, 'Azul Linhas Aéreas'], [/LOJAS\s*AMERICANAS/i, 'Lojas Americanas'],
  [/IOF/i, 'IOF'],
]

function plain(text: string): string {
  // "•"/"·" soltos: o OCR às vezes lê o traço da coluna vazia como ponto.
  return text.normalize('NFKC').replace(/\u00a0/g, ' ').replace(/−/g, '-').replace(/(^|\s)[•·](?=\s|$)/g, '$1-')
    .replace(/[ \t]+/g, ' ').trim()
}

function iso(y: number, m: number, d: number): string | null {
  const dt = new Date(Date.UTC(y, m - 1, d))
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function yearFor(month: number, due: string | null): number {
  if (!due) {
    const now = new Date()
    return month > now.getMonth() + 2 ? now.getFullYear() - 1 : now.getFullYear()
  }
  const [y, m] = due.split('-').map(Number)
  return month > m ? y - 1 : y
}

function leadingDate(text: string, due: string | null): { date: string; rest: string } | null {
  let m = DATE_ISO.exec(text)
  if (m) {
    const date = iso(Number(m[1]), Number(m[2]), Number(m[3]))
    return date ? { date, rest: text.slice(m[0].length).trim() } : null
  }
  m = DATE_PT.exec(text)
  if (m) {
    const month = MONTHS[m[2].toLowerCase().slice(0, 3)]
    const date = iso(m[3] ? Number(m[3]) : yearFor(month, due), month, Number(m[1]))
    return date ? { date, rest: text.slice(m[0].length).trim() } : null
  }
  m = DATE_NUM.exec(text)
  if (m) {
    const month = Number(m[2])
    let year = m[3] ? Number(m[3]) : yearFor(month, due)
    if (m[3] && m[3].length === 2) year += 2000
    const date = iso(year, month, Number(m[1]))
    return date ? { date, rest: text.slice(m[0].length).trim() } : null
  }
  return null
}

export function splitInstallment(description: string): { base: string; current: number | null; total: number | null } {
  for (const pattern of INSTALLMENT) {
    const m = pattern.exec(description)
    if (m) {
      const current = Number(m[1])
      const total = Number(m[2])
      if (current >= 1 && total > 1 && current <= total && total <= 60) {
        const base = (description.slice(0, m.index) + ' ' + description.slice(m.index + m[0].length))
          .replace(/\s+/g, ' ')
          .replace(/^[\s\-–]+|[\s\-–]+$/g, '')
        return { base, current, total }
      }
    }
  }
  return { base: description, current: null, total: null }
}

function titleCase(text: string): string {
  return text
    .split(' ')
    .map((w) => (w === w.toUpperCase() || w === w.toLowerCase() ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(' ')
}

/** Nome do estabelecimento para exibição: marca conhecida ou descritor sem intermediador e sem códigos. */
const REFUND_PREFIX = /^(?:estorno|devolu[cç][aã]o|cr[eé]dito|reembolso|cancelamento)(?:\s+(?:de|da|do))?(?:\s+compra)?\s*[-:–]?\s*/i

export function cleanVendor(description: string): string {
  description = description.replace(REFUND_PREFIX, '') || description
  for (const [pattern, name] of BRANDS) if (pattern.test(description)) return name
  let text = description.replace(PROCESSOR_PREFIX, '').replace(/^\d+(?=[A-Za-z])/, '')
  text = text.replace(/\*/g, ' ')
  text = text.replace(/\b(?=[A-Z0-9]*\d)(?=[A-Z0-9]*[A-Z])[A-Z0-9]{6,}\b/gi, ' ') // códigos de referência
  text = text.replace(/\b\d{3,}\b/g, ' ') // números de loja
  text = text.replace(/(?<=[A-Za-zÀ-ÿ]{3})\d{3,}\b/g, ' ') // número de loja colado ao nome (DROGASIL1176)
  text = text.replace(/\b(?:S\.?A\.?|LTDA|EIRELI|ME|EPP)\b\.?/gi, ' ')
  text = text.replace(/\s+/g, ' ').trim()
  return titleCase(text || description)
}

/** Tipo do lançamento pelo texto e pelo sinal. Pagamento e estorno sempre são crédito. */
export function classify(description: string, signCredit: boolean): { kind: StatementLineKind; isCredit: boolean } {
  if (PAYMENT.test(description) && !description.includes('*')) return { kind: 'payment', isCredit: true }
  if (signCredit || CREDIT_WORDS.test(description)) return { kind: 'credit', isCredit: true }
  if (FEE.test(description)) return { kind: 'fee', isCredit: false }
  return { kind: 'purchase', isCredit: false }
}

/** Monta uma linha a partir de dados já separados (usado pelos leitores de OFX, CSV e IA). */
export function makeLine(input: {
  index: number; date: string; description: string; amount: number; credit: boolean; card: string | null
  raw?: string; installmentCurrent?: number | null; installmentTotal?: number | null; payment?: boolean
}): StatementLine {
  const description = plain(input.description)
  const inst = splitInstallment(description)
  const current = input.installmentCurrent ?? inst.current
  const total = input.installmentTotal ?? inst.total
  const valid = Boolean(current && total && current >= 1 && total > 1 && current <= total)
  const c = input.payment ? { kind: 'payment' as const, isCredit: true } : classify(description, input.credit)
  return {
    index: input.index,
    date: input.date,
    description,
    vendor: cleanVendor(inst.base || description),
    amount: Math.round(Math.abs(input.amount) * 100) / 100,
    isCredit: c.isCredit,
    kind: c.kind,
    card: input.card,
    installmentCurrent: valid ? current! : null,
    installmentTotal: valid ? total! : null,
    raw: input.raw ?? description,
  }
}

type SignClass = 'plus' | 'minus' | 'none' | 'suffix'

function signOf(m: RegExpExecArray): SignClass {
  if (m[5]) return 'suffix'
  const signs = (m[1] || '') + (m[2] || '') + (m[4] || '')
  return signs.includes('+') ? 'plus' : signs.includes('-') ? 'minus' : 'none'
}

/** Descobre como a fatura marca créditos, pela contagem dos sinais nas linhas de lançamento. */
export function detectPolarity(counts: Record<SignClass, number>): Polarity {
  if (counts.plus > 0) return 'plus_is_credit' // Inter: "-" em tudo, "+" nos créditos
  if (counts.minus === 0) return 'plus_is_credit' // sem sinais: tudo é gasto (exceto palavras-chave)
  if (counts.minus < counts.none) return 'minus_is_credit' // maioria sem sinal: "-" marca crédito
  if (counts.none > 0) return 'unsigned_is_credit' // gastos com "-", créditos sem sinal (estilo extrato)
  return 'plus_is_credit'
}

export function parseLine(
  raw: string,
  due: string | null,
  card: string | null,
  index: number,
  polarity: Polarity = 'plus_is_credit',
): StatementLine | null {
  const text = plain(raw)
  const lead = leadingDate(text, due)
  if (!lead) return null
  const m = AMOUNT.exec(lead.rest)
  if (!m) return null
  const description = lead.rest
    .slice(0, m.index)
    .replace(/(?:\s+[-–])+$/, '')
    .replace(/^[\s\-–|]+|[\s\-–|]+$/g, '')
    .trim()
  if (!description || SKIP.test(description) || !/[A-Za-zÀ-ÿ]/.test(description)) return null

  const amount = Number(m[3].replace(/\./g, '').replace(',', '.'))
  const sign = signOf(m)
  const signCredit =
    sign === 'suffix' ? /^c/i.test(m[5]) :
    polarity === 'plus_is_credit' ? sign === 'plus' :
    polarity === 'minus_is_credit' ? sign === 'minus' :
    sign === 'none'
  const { kind, isCredit } = classify(description, signCredit)
  const inst = splitInstallment(description)
  return {
    index,
    date: lead.date,
    description,
    vendor: cleanVendor(inst.base),
    amount,
    isCredit,
    kind,
    card,
    installmentCurrent: inst.current,
    installmentTotal: inst.total,
    raw: text,
  }
}

function findDue(text: string): string | null {
  const m = DUE.exec(text) || DUE_HEADER.exec(text)
  return m ? iso(Number(m[3]), Number(m[2]), Number(m[1])) : null
}

export function parseMoneyBR(text: string): number {
  return Number(text.replace(/\./g, '').replace(',', '.'))
}

function cardOf(line: string): string | null {
  if (!/cart|final|\*{2,}|x{4}/i.test(line)) return null
  const masked = CARD_MASKED.exec(line)
  if (masked) return `${masked[1] || ''}****${masked[2]}`
  const fin = CARD_FINAL.exec(line)
  return fin ? `****${fin[1]}` : null
}

export function parseStatementText(text: string, sha256 = ''): ParsedStatement {
  const dueDate = findDue(text)
  const rows = text.split(/\r?\n/).map(plain).filter(Boolean)

  // 1ª passada: como esta fatura marca créditos?
  const counts: Record<SignClass, number> = { plus: 0, minus: 0, none: 0, suffix: 0 }
  for (const row of rows) {
    const lead = leadingDate(row, dueDate)
    const m = lead && AMOUNT.exec(lead.rest)
    if (m && !PAYMENT.test(lead!.rest) && !CREDIT_WORDS.test(lead!.rest)) counts[signOf(m)]++
  }
  const polarity = detectPolarity(counts)

  const lines: StatementLine[] = []
  let card: string | null = null
  for (const line of rows) {
    if (lines.length && NEXT_SECTION.test(line)) break // parcelas futuras entram na próxima fatura
    const parsed = parseLine(line, dueDate, card, lines.length, polarity)
    if (parsed) {
      lines.push(parsed)
      continue
    }
    const c = cardOf(line)
    if (c) card = c.replace(/\s+/g, '')
  }
  const box = PRINTED_BOX.exec(text)
  const exp = PRINTED_EXPENSES.exec(text)
  const adv = PRINTED_ADVANCED.exec(text)
  const printed = box
    ? { expenses: parseMoneyBR(box[1]), advanced: parseMoneyBR(box[2]), due: parseMoneyBR(box[3]) }
    : exp || adv
      ? { expenses: exp ? parseMoneyBR(exp[1]) : null, advanced: adv ? parseMoneyBR(adv[1]) : null, due: null }
      : undefined
  // "Data de corte: 08/12/2026": fechamento da próxima fatura.
  const cut = /data de corte[^0-9]{0,20}(\d{2})\/(\d{2})\/(\d{4})/i.exec(text)
  const nextCutoff = cut ? iso(Number(cut[3]), Number(cut[2]), Number(cut[1])) : null
  const printedFull = printed ? { ...printed, nextCutoff } : nextCutoff ? { expenses: null, advanced: null, due: null, nextCutoff } : undefined
  const stated = STATED_TOTAL.exec(text)
  return {
    printed: printedFull,
    ...detectIssuer(text),
    source: 'text',
    dueDate,
    sha256,
    lines,
    statedTotal: printed?.due ?? (stated ? parseMoneyBR(stated[1]) : null),
  }
}

/** Reconstrói as linhas visuais do PDF agrupando os trechos de texto pela altura (y). */
export async function extractPdfText(data: Uint8Array, password?: string): Promise<string> {
  const { getDocumentProxy } = await import('unpdf')
  const pdf = await getDocumentProxy(data, password ? { password } : undefined)
  const out: string[] = []
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p)
    const content = await page.getTextContent()
    const rows: Array<{ y: number; parts: Array<{ x: number; w: number; s: string }> }> = []
    for (const item of content.items as Array<{ str?: string; transform?: number[]; width?: number }>) {
      if (!item.str || !item.transform) continue
      const x = item.transform[4]
      const y = item.transform[5]
      let row = rows.find((r) => Math.abs(r.y - y) <= 2.5)
      if (!row) rows.push((row = { y, parts: [] }))
      row.parts.push({ x, w: item.width ?? 0, s: item.str })
    }
    rows.sort((a, b) => b.y - a.y)
    for (const row of rows) {
      row.parts.sort((a, b) => a.x - b.x)
      // O PDF pode quebrar uma palavra em vários trechos ("P" + "AGAMENTO"): só insere espaço
      // quando há distância visível entre o fim de um trecho e o início do próximo.
      let line = ''
      let end = -Infinity
      for (const part of row.parts) {
        if (line && part.x - end > 1.5) line += ' '
        line += part.s
        end = Math.max(end, part.x + part.w)
      }
      out.push(line.replace(/\s+/g, ' ').trim())
    }
  }
  return out.join('\n')
}

/**
 * Inter: a seção "Próxima fatura" tem uma coluna "compras parceladas … que farão parte da sua próxima
 * fatura" com o valor exato de cada parcela. Ela divide a página com outro quadro, então é lida pela
 * posição (só a coluna da direita) e pode continuar na página seguinte, até "Saldo total de compras".
 */
export async function extractUpcomingParcels(data: Uint8Array, password?: string): Promise<NonNullable<ParsedStatement['upcoming']>> {
  const { getDocumentProxy } = await import('unpdf')
  const pdf = await getDocumentProxy(data, password ? { password } : undefined)
  type Part = { x: number; w: number; s: string }
  const lineOf = (parts: Part[]) => {
    parts.sort((a, b) => a.x - b.x)
    let line = ''
    let end = -Infinity
    for (const pt of parts) {
      if (line && pt.x - end > 1.5) line += ' '
      line += pt.s
      end = Math.max(end, pt.x + pt.w)
    }
    return line.replace(/\s+/g, ' ').trim()
  }
  let splitX: number | null = null
  const column: string[] = []
  let done = false
  for (let p = 1; p <= pdf.numPages && !done; p++) {
    const page = await pdf.getPage(p)
    const rows: Array<{ y: number; parts: Part[] }> = []
    for (const item of (await page.getTextContent()).items as Array<{ str?: string; transform?: number[]; width?: number }>) {
      if (!item.str || !item.transform) continue
      const y = item.transform[5]
      let row = rows.find((r) => Math.abs(r.y - y) <= 2.5)
      if (!row) rows.push((row = { y, parts: [] }))
      row.parts.push({ x: item.transform[4], w: item.width ?? 0, s: item.str })
    }
    rows.sort((a, b) => b.y - a.y)
    let startY = Infinity
    if (splitX === null) {
      const head = rows.find((r) => /compras parceladas realizadas/i.test(lineOf([...r.parts])))
      if (!head) continue
      splitX = Math.min(...head.parts.filter((pt) => pt.s.trim()).map((pt) => pt.x)) - 3
      startY = head.y
    }
    for (const r of rows) {
      if (r.y >= startY) continue
      const t = lineOf(r.parts.filter((pt) => pt.x >= splitX!))
      if (!t) continue
      if (/saldo total de compras parceladas/i.test(t)) { done = true; break }
      column.push(t)
    }
  }
  const text = column.join(' ')
  const start = text.search(/movimenta[cç][aã]o\s+valor/i)
  const body = start >= 0 ? text.slice(start).replace(/^movimenta[cç][aã]o\s+valor/i, '') : text
  const amounts = Array.from(body.matchAll(new RegExp(`R\\$\\s*${MONEY}`, 'g'))).map((m) => parseMoneyBR(m[1]))
  const rest = body.replace(new RegExp(`R\\$\\s*${MONEY}`, 'g'), ' ').replace(/\s+/g, ' ')
  const items = Array.from(rest.matchAll(/(.+?)\(\s*Parcela\s*(\d{1,2})\s*de\s*(\d{1,2})\s*\)/gi))
  if (!items.length || items.length !== amounts.length) return []
  return items.map((m, i) => {
    // Na quebra de página, rodapé e cabeçalho da página seguinte entram antes da descrição: corta-os.
    const raw = m[1].split(/movimenta[cç][aã]o\s+valor/i).pop()!
    const description = plain(raw).replace(/^[\s\-–]+/, '')
    return { description, vendor: cleanVendor(description), current: Number(m[2]), total: Number(m[3]), amount: amounts[i] }
  })
}

/** Lê só o texto do PDF (sem decidir o formato). Retorna também o hash do conteúdo. */
export async function readPdf(buffer: Buffer, password?: string): Promise<{ text: string; sha256: string; data: Buffer }> {
  // Alguns envios (ex.: AirDrop) chegam com bytes nulos antes do cabeçalho do PDF.
  const start = buffer.indexOf('%PDF')
  if (start < 0) throw new StatementParseError('O arquivo não é um PDF.')
  const data = buffer.subarray(start)
  const sha256 = createHash('sha256').update(data).digest('hex')
  try {
    return { text: await extractPdfText(new Uint8Array(data), password), sha256, data }
  } catch (e) {
    // pdf.js: code 1 = precisa de senha, code 2 = senha incorreta
    if ((e as { name?: string })?.name === 'PasswordException') {
      throw new StatementPasswordError((e as { code?: number }).code === 2 || Boolean(password))
    }
    throw new StatementParseError('Não foi possível ler o PDF. O arquivo pode estar corrompido.')
  }
}

export async function parseInterStatementPdf(buffer: Buffer): Promise<ParsedStatement> {
  const { text, sha256 } = await readPdf(buffer)
  const parsed = { ...parseStatementText(text, sha256), source: 'pdf' as const }
  if (parsed.lines.length === 0) throw new StatementParseError('Nenhum lançamento encontrado na fatura.')
  return parsed
}
