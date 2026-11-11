/**
 * Importa uma fatura de cartão (já lida por interPdf.ts) como lançamentos.
 *
 * Regras:
 * - Compras à vista viram 1 lançamento na data da compra.
 * - Compras parceladas ("Parcela 04 de 10") criam o parcelamento completo, parcelas passadas e
 *   futuras (1 a 10), ancorado na data da compra (que o Inter repete em todas as parcelas). Se o
 *   parcelamento já existe (de outra fatura, foto ou Telegram), a linha é pulada.
 * - Várias parcelas da mesma compra na mesma fatura (antecipação) contam como uma compra só; as
 *   parcelas antecipadas ficam com a data desta fatura.
 * - Estornos são abatidos da compra correspondente: na própria fatura (antes de lançar), ou em
 *   lançamentos que já existem (o valor é corrigido). Compra estornada por inteiro fica registrada
 *   com R$ 0,00, para que as parcelas que o Inter ainda cobra nas faturas seguintes não sejam lançadas.
 * - Pagamentos da fatura não são importados.
 * - Duplicidade é verificada contra os lançamentos do mesmo usuário e conta: mesma data (±1 dia),
 *   mesmo valor e mesmo estabelecimento. Reimportar a mesma fatura não cria nem corrige nada de novo.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { PersistInput } from '../persist'
import type { Receipt } from '../schema'
import { normalizeVendor } from '../duplicate'
import type { ParsedStatement, StatementLine } from './interPdf'

export type PreviewAction =
  | 'import' // lançamento novo (pode ter estorno abatido)
  | 'refunded' // compra estornada por inteiro: registrada com R$ 0,00
  | 'duplicate' // já existe lançamento igual
  | 'installment_exists' // parcelamento já cadastrado
  | 'same_purchase' // outra parcela da mesma compra nesta fatura
  | 'payment' // pagamento da fatura
  | 'refund' // estorno abatido de uma compra desta fatura
  | 'refund_existing' // estorno que corrige um lançamento já existente
  | 'refund_applied' // estorno já aplicado numa importação anterior
  | 'credit' // crédito sem compra correspondente
  | 'adjustment' // ajuste interno do banco: crédito e reversão do crédito que se anulam
  | 'card_credit' // crédito no cartão (estorno, ajuste): registrado como crédito, igual à fatura
  | 'credit_exists' // crédito já registrado numa importação anterior

export interface RefundTarget {
  /** ids das linhas do banco a corrigir (todas as parcelas do grupo, ou o lançamento à vista) */
  ids: string[]
  vendor: string | null
  date: string | null
  installmentTotal: number | null
  /** valor atual: total da compra (soma das parcelas) */
  currentTotal: number
}

export interface PreviewLine extends StatementLine {
  action: PreviewAction
  reason: string
  category: string | null
  /** índice da linha principal quando action = same_purchase / refund */
  purchaseOf?: number
  /** parcelas desta compra presentes nesta fatura */
  presentInstallments?: number[]
  /** valor original da compra inteira (parcela × nº de parcelas) */
  purchaseTotal?: number
  /** soma dos estornos abatidos desta compra */
  refunded?: number
  /** valor que será lançado: da compra à vista, ou de cada parcela */
  netAmount?: number
  /** quando action = refund_existing */
  target?: RefundTarget
  /** parcela cobrada de uma compra já estornada por inteiro: não é gasto */
  refundedEarlier?: boolean
  /** parcelamento já gravado que corresponde a esta linha (para acertar centavos das parcelas) */
  matchedRows?: Array<{ id: string; installment_current: number | null; total: number }>
  /** modo igual ao banco: valor do estorno que veio como crédito para esta compra (não reduz a despesa) */
  refundedBy?: number
  /** pagamento: vencimento da fatura que ele quita, e se já está registrado */
  paymentDue?: string | null
  paymentRegistered?: boolean
  /** quando action = duplicate: id do lançamento que já existe */
  duplicateOf?: string
  /** compra nova que talvez já tenha sido lançada à mão (o usuário decide na prévia) */
  probable?: import('./probableMatches').ProbableMatch
}

export interface ExistingTx {
  id: string
  date: string | null
  vendor: string | null
  raw_text?: string | null
  total: number | string | null
  notes?: string | null
  installment_group_id?: string | null
  installment_current?: number | null
  installment_total?: number | null
  installment_amount?: number | string | null
  original_extracted_data?: Record<string, any> | null
}

// A ordem importa: a primeira regra que bate decide. Marketplaces antes de "mercado", viagem antes de transporte.
const CATEGORY_RULES: Array<[RegExp, string]> = [
  [/\b(?:iof|juros|multa|tarifa|anuidade|encargo)|^rev\.?\s*cr/i, 'Impostos & Tarifas'],
  [/mercado\s*\*?\s*livre|mercadolivre|mercado\s*pago|amazon(?!\s*prime|prime)|shopee|magalu|magazine\s*luiza|americanas|aliexpress|shein|temu|olx|enjoei|kabum/i, 'Compras'],
  [/airbnb|booking|hotel|pousada|decolar|latam|azul\s*linhas|gol\s*linhas|123\s*milhas|maxmilhas|hurb/i, 'Viagem'],
  [/supermercado|mercearia|mercado|hortifruti|atacad|assai|carrefour|mercamax|acougue|açougue|sacolao|sacolão/i, 'Mercado'],
  [/netflix|spotify|apple|google\s*\*?\s*one|youtube|openai|chatgpt|anthropic|claude|disney|globoplay|prime|smiles|deezer|torbox|hbo\s*max|smart\s*fit|academia|gympass|wellhub|totalpass|microsoft|adobe|dropbox|icloud|canva|notion|github/i, 'Assinaturas'],
  [/padaria|restaurante|lanchonete|ifood|ifd\*|\bbar\b|cafe|café|sorvete|pizza|burger|lanches|doceria|confeitaria|pastel|churrasc|acai|açaí|sushi|espetinho|cantina|marmita/i, 'Alimentação'],
  [/posto|combust|uber|99\s*app|estaciona|pedagio|pedágio|sem\s*parar|conectcar|autozone|auto\s*pe[cç]as|pneu|oficina|mec[aâ]nica|lava\s*r[aá]pido/i, 'Transporte'],
  [/farmacia|farmácia|drogaria|drogasil|drog\b|raia|pacheco|panvel|pague\s*menos|hospital|clinica|clínica|laborat|odonto|dentista/i, 'Saúde'],
  [/escola|curso|faculdade|udemy|alura|livraria/i, 'Educação'],
  [/cinema|ingresso|teatro|\bshow\b|steam|playstation|xbox|nintendo/i, 'Lazer'],
  [/\btim\b|vivo|claro|\boi\b|net\s*virtua|barbearia|barbeiro|sal[aã]o|cabeleir|lavanderia|estetica|estética/i, 'Serviços'],
  [/natura|boticario|botic[aá]rio|joias|informatica|informática|ferramen|casa\s*e\s*cia|renner|riachuelo|c&a|zara|leroy|decathlon/i, 'Compras'],
]

export function guessCategory(line: Pick<StatementLine, 'description' | 'vendor' | 'kind'>): string | null {
  if (line.kind === 'fee') return 'Impostos & Tarifas'
  const text = `${line.vendor} ${line.description}`
  for (const [pattern, category] of CATEGORY_RULES) if (pattern.test(text)) return category
  return null
}

function addMonths(isoDate: string, months: number): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  const target = new Date(Date.UTC(y, m - 1 + months, 1))
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  target.setUTCDate(Math.min(d, last))
  return target.toISOString().slice(0, 10)
}

function daysBetween(a: string, b: string): number {
  return Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000
}

function sameVendor(line: StatementLine, tx: ExistingTx): boolean {
  const a = normalizeVendor(line.vendor)
  const b = normalizeVendor(tx.vendor)
  const raw = normalizeVendor(line.description)
  const txRaw = normalizeVendor(tx.raw_text)
  if (txRaw && (txRaw === raw || txRaw.includes(raw))) return true
  if (!a || !b) return false
  return a === b || (a.length >= 4 && b.includes(a)) || (b.length >= 4 && a.includes(b)) || (b.length >= 4 && raw.includes(b))
}

function closeAmount(a: number, b: number, tolerance: number): boolean {
  return Math.abs(a - b) <= Math.max(0.01, b * tolerance)
}

/** Reversão de crédito ("REV CR PARC LOJ PARCEL"): débito que desfaz um crédito lançado antes. */
const CREDIT_REVERSAL = /^rev(?:ers[aã]o)?\.?\s*(?:de\s+)?cr(?:ed(?:ito)?)?\.?\s/i

/** Créditos de parcela que o banco lança sem o nome da loja. */
const GENERIC_PARCEL_CREDIT = /^(?:cred(?:ito)?\.?\s*parc|cr[eé]dito\s+(?:de\s+)?parcela|parc(?:ela)?\s*loj|estorno\s+(?:de\s+)?parcela)/i

const near2 = (a: number, b: number) => Math.abs(a - b) < 0.005

const round2 = (n: number) => Math.round(n * 100) / 100
const num = (v: unknown) => Number(v) || 0

/** Chave estável de uma linha de fatura: impede aplicar o mesmo estorno duas vezes. */
export function statementLineKey(statement: ParsedStatement, line: Pick<StatementLine, 'index'>): string {
  return `${statement.sha256}:${line.index}`
}

/** Valor original (como veio da fatura) de um lançamento importado; senão, o valor gravado. */
function originalAmount(tx: ExistingTx, fallback: unknown): number {
  const o = tx.original_extracted_data
  if (typeof o?.pre_refund_amount === 'number') return o.pre_refund_amount
  if (o?.source === 'inter_statement_pdf' && typeof o.amount === 'number') return o.amount
  return num(fallback)
}

/** Compra já registrada no banco: grupo de parcelas, lançamento à vista ou marcador de estorno total. */
interface Known {
  id: string
  kind: 'group' | 'single' | 'marker'
  rows: ExistingTx[]
  installmentTotal: number | null
  /** valor original da parcela (ou da compra à vista) */
  unit: number
  /** soma atual das parcelas gravadas (já com estornos abatidos) */
  currentTotal: number
  firstDate: string | null
}

function buildKnown(existing: ExistingSnapshot): Known[] {
  const known: Known[] = []
  const groups = new Map<string, ExistingTx[]>()
  for (const tx of existing.installments) {
    if (!tx.installment_group_id) continue
    const list = groups.get(tx.installment_group_id) || []
    list.push(tx)
    groups.set(tx.installment_group_id, list)
  }
  for (const [id, rows] of Array.from(groups.entries())) {
    rows.sort((a, b) => num(a.installment_current) - num(b.installment_current))
    const head = rows[0]
    const first = rows.find((r) => r.installment_current === 1)
    known.push({
      id,
      kind: 'group',
      rows,
      installmentTotal: num(head.installment_total) || null,
      unit: originalAmount(head, head.installment_amount ?? head.total),
      currentTotal: round2(rows.reduce((sum, r) => sum + num(r.total), 0)),
      firstDate: first?.date ?? (head.date ? addMonths(head.date, -(num(head.installment_current) - 1)) : null),
    })
  }
  for (const tx of existing.markers) {
    const rp = tx.original_extracted_data?.refunded_purchase
    if (!rp) continue
    known.push({ id: tx.id, kind: 'marker', rows: [tx], installmentTotal: rp.installmentTotal ?? null,
      unit: num(rp.unitAmount), currentTotal: 0, firstDate: rp.date ?? tx.date })
  }
  for (const tx of existing.singles) {
    if (tx.original_extracted_data?.refunded_purchase) continue
    known.push({ id: tx.id, kind: 'single', rows: [tx], installmentTotal: null,
      unit: originalAmount(tx, tx.total), currentTotal: num(tx.total), firstDate: tx.date })
  }
  return known
}

export interface ExistingSnapshot {
  singles: ExistingTx[]
  installments: ExistingTx[]
  /** compras estornadas por inteiro em importações anteriores (R$ 0,00) */
  markers: ExistingTx[]
  /** pagamentos de fatura já registrados neste cartão */
  payments?: Array<{ amount: number; payment_date: string }>
  /** créditos no cartão já registrados (estornos e ajustes, como receita do cartão) */
  credits?: ExistingTx[]
}

/**
 * Fatura que um pagamento quita: a primeira que vence no dia do pagamento ou depois. Um pagamento
 * feito antes do vencimento anterior (ex.: 13/07, com vencimento em 15/07) adianta aquela fatura.
 */
export function paymentDueFor(paymentDate: string, statementDue: string | null): string | null {
  if (!statementDue) return null
  const previous = addMonths(statementDue, -1)
  return paymentDate <= previous ? previous : statementDue
}

/** Um destino possível para um estorno: compra desta fatura ou compra já gravada. */
interface Bucket {
  key: string
  line?: number // índice em out (compra desta fatura a importar)
  known?: Known // compra já gravada
  installmentTotal: number | null
  unit: number
  total: number
  remaining: number
  date: string | null
  card: string | null
}

/**
 * Decide o que fazer com cada linha, comparando com lançamentos já existentes (mesmo usuário e conta).
 * Função pura: recebe os lançamentos existentes já carregados.
 */
export function planStatementImport(
  statement: ParsedStatement,
  existing: Partial<ExistingSnapshot> & { singles: ExistingTx[]; installments: ExistingTx[] },
): PreviewLine[] {
  const snapshot: ExistingSnapshot = { markers: [], ...existing }
  const known = buildKnown(snapshot)
  const usedKnown = new Set<string>()
  const knownOfLine = new Map<number, Known>()

  // Estornos já aplicados em importações anteriores.
  const appliedKeys = new Set<string>()
  for (const k of known) for (const r of k.rows)
    for (const ref of (r.original_extracted_data?.refunds as Array<{ key: string }> | undefined) || []) appliedKeys.add(ref.key)

  const purchases: Array<{ main: number; key: string; amount: number; ns: Set<number> }> = []
  const out: PreviewLine[] = []

  // 1ª passada: compras.
  for (const line of statement.lines) {
    const base: PreviewLine = { ...line, action: 'import', reason: '', category: guessCategory(line) }

    if (line.kind === 'payment') {
      const due = paymentDueFor(line.date, statement.dueDate)
      const registered = (snapshot.payments || []).some(
        (p) => Math.abs(Number(p.amount) - line.amount) <= 0.01 && daysBetween(p.payment_date, line.date) <= 1,
      )
      out.push({ ...base, action: 'payment', paymentDue: due, paymentRegistered: registered,
        reason: registered
          ? 'Pagamento de fatura já registrado'
          : `Pagamento da fatura com vencimento em ${due ? due.split('-').reverse().join('/') : '—'}: vai para os pagamentos de fatura, não é gasto` })
      continue
    }
    if (line.isCredit) {
      out.push({ ...base, action: 'credit', reason: '' }) // decidido na 2ª passada
      continue
    }

    if (line.installmentTotal && line.installmentCurrent) {
      const key = [line.card, normalizeVendor(line.vendor), line.installmentTotal, line.date].join('|')
      const same = purchases.find(
        (p) => p.key === key && !p.ns.has(line.installmentCurrent!) && closeAmount(line.amount, p.amount, 0.03),
      )
      if (same) {
        same.ns.add(line.installmentCurrent)
        const main = out[same.main]
        main.presentInstallments = Array.from(same.ns).sort((a, b) => a - b)
        out.push({ ...base, action: 'same_purchase', purchaseOf: same.main,
          reason: `Mesma compra da linha ${same.main + 1} (parcela ${line.installmentCurrent} antecipada)` })
        continue
      }
      purchases.push({ main: out.length, key, amount: line.amount, ns: new Set([line.installmentCurrent]) })
      base.presentInstallments = [line.installmentCurrent]
      base.purchaseTotal = round2(line.amount * line.installmentTotal)
      base.netAmount = line.amount

      const expected = addMonths(line.date, line.installmentCurrent - 1)
      const match = known.find((k) => {
        if (k.kind === 'single' || usedKnown.has(k.id)) return false
        if (k.installmentTotal !== line.installmentTotal) return false
        if (!k.rows.some((r) => sameVendor(line, r))) return false
        if (!closeAmount(line.amount, k.unit, 0.03)) return false
        if (k.firstDate && daysBetween(k.firstDate, line.date) <= 7) return true
        const current = k.rows.find((r) => r.installment_current === line.installmentCurrent)
        return Boolean(current?.date && daysBetween(current.date, expected) <= 45)
      })
      if (match) {
        usedKnown.add(match.id)
        knownOfLine.set(out.length, match)
        out.push({ ...base, action: 'installment_exists', refundedEarlier: match.kind === 'marker' || undefined,
          matchedRows: match.kind === 'group'
            ? match.rows.map((r) => ({ id: r.id, installment_current: r.installment_current ?? null, total: num(r.total) }))
            : undefined,
          netAmount: match.kind === 'marker' ? 0 : base.netAmount,
          reason: match.kind === 'marker' ? 'Compra estornada em fatura anterior' : 'Parcelamento já cadastrado' })
      } else {
        out.push(base)
      }
      continue
    }

    base.purchaseTotal = line.amount
    base.netAmount = line.amount
    const dup = known.find(
      (k) =>
        (k.kind === 'single' || (k.kind === 'marker' && !k.installmentTotal)) &&
        !usedKnown.has(k.id) &&
        k.firstDate !== null &&
        daysBetween(k.firstDate, line.date) <= 1 &&
        closeAmount(line.amount, k.unit, 0) &&
        sameVendor(line, k.rows[0]),
    )
    if (dup) {
      usedKnown.add(dup.id)
      knownOfLine.set(out.length, dup)
      out.push({ ...base, action: 'duplicate', duplicateOf: dup.id, reason: dup.kind === 'marker'
        ? 'Compra estornada, já registrada'
        : `Já lançado em ${dup.firstDate} (${dup.rows[0].vendor || 'sem nome'})` })
    } else {
      out.push(base)
    }
  }

  // Ajustes internos do banco: cada "REV CR ..." (débito) anula um crédito de mesmo valor no mesmo cartão.
  const reversals = out.filter((l) => !l.isCredit && CREDIT_REVERSAL.test(l.description))
  const pairedCredits = new Set<number>()
  for (const rev of reversals) {
    const credit = out.find(
      (c, i) =>
        c.action === 'credit' && !pairedCredits.has(i) && c.card === rev.card && near2(c.amount, rev.amount) &&
        daysBetween(c.date, rev.date) <= 3,
    )
    if (!credit) continue
    pairedCredits.add(out.indexOf(credit))
    const reason = 'Ajuste do banco: crédito e reversão do crédito de mesmo valor se anulam (não é gasto nem estorno)'
    Object.assign(rev, { action: 'adjustment', reason, netAmount: 0 })
    Object.assign(credit, { action: 'adjustment', reason })
  }

  // Destinos possíveis de estorno: compras desta fatura e compras já gravadas.
  const buckets: Bucket[] = []
  const bucketOfKnown = new Map<string, Bucket>()
  const addKnownBucket = (k: Known, card: string | null) => {
    if (bucketOfKnown.has(k.id)) return bucketOfKnown.get(k.id)!
    const b: Bucket = { key: `k:${k.id}`, known: k, installmentTotal: k.installmentTotal, unit: k.unit,
      total: k.unit * (k.installmentTotal || 1), remaining: k.currentTotal, date: k.firstDate, card }
    bucketOfKnown.set(k.id, b)
    buckets.push(b)
    return b
  }
  out.forEach((l, i) => {
    if (l.action === 'import') {
      buckets.push({ key: `l:${i}`, line: i, installmentTotal: l.installmentTotal, unit: l.amount,
        total: l.purchaseTotal!, remaining: l.purchaseTotal!, date: l.date, card: l.card })
    } else if (knownOfLine.has(i)) {
      addKnownBucket(knownOfLine.get(i)!, l.card)
    }
  })
  for (const k of known) if (k.kind !== 'marker') addKnownBucket(k, null)

  // 2ª passada: estornos, do maior para o menor (encaixa melhor vários estornos parciais).
  const credits = out
    .map((l, i) => ({ l, i }))
    .filter(({ l }) => l.action === 'credit')
    .sort((a, b) => b.l.amount - a.l.amount)
  for (const { l: credit, i } of credits) {
    if (appliedKeys.has(statementLineKey(statement, credit))) {
      credit.action = 'refund_applied'
      credit.reason = 'Estorno já aplicado numa importação anterior'
      continue
    }
    const vendorOf = (b: Bucket) => (b.line !== undefined ? out[b.line] : null)
    const candidates = buckets.filter((b) => {
      if (b.remaining < credit.amount - 0.02) return false
      if (b.card && credit.card && b.card !== credit.card) return false
      if ((b.installmentTotal || null) !== (credit.installmentTotal || null)) return false
      const sameName = b.line !== undefined
        ? normalizeVendor(vendorOf(b)!.vendor) === normalizeVendor(credit.vendor)
        : b.known!.rows.some((r) => sameVendor(credit, r))
      if (!sameName || !b.date) return false
      const age = (Date.parse(`${credit.date}T00:00:00Z`) - Date.parse(`${b.date}T00:00:00Z`)) / 86_400_000
      return age >= -1 && age <= 120
    })
    const score = (b: Bucket) =>
      (Math.abs(b.remaining - credit.amount) <= 0.02 ? 4 : 0) +
      (closeAmount(credit.amount, b.unit, 0.03) || closeAmount(credit.amount, b.total, 0.01) ? 2 : 0) +
      (b.line !== undefined ? 1 : 0)
    candidates.sort((a, b) => score(b) - score(a) || a.remaining - b.remaining)
    let target = candidates[0]
    let generic = false
    if (!target && GENERIC_PARCEL_CREDIT.test(credit.description)) {
      // Crédito de parcela sem nome da loja (ex.: "CRED PARC LOJ PARCELA"): o banco estorna as parcelas
      // de uma compra parcelada uma a uma. Liga à compra parcelada do mesmo cartão com parcela de mesmo valor.
      const byParcel = buckets
        .filter((b) => b.installmentTotal && closeAmount(credit.amount, b.unit, 0.02))
        .filter((b) => !(b.card && credit.card && b.card !== credit.card))
        .sort((a, b) => Number(b.line !== undefined) - Number(a.line !== undefined) || b.remaining - a.remaining)
      target = byParcel[0]
      generic = Boolean(target)
    }
    if (!target) {
      credit.reason = 'Crédito sem compra correspondente (não é gasto)'
      continue
    }
    if (generic && target.remaining < credit.amount - 0.02) {
      // A compra já está zerada por outro estorno: o crédito só confirma o estorno, não muda valores.
      const name = target.line !== undefined ? out[target.line].vendor : target.known!.rows[0].vendor
      credit.action = target.line !== undefined ? 'refund' : 'refund_applied'
      if (target.line !== undefined) credit.purchaseOf = target.line
      credit.reason = `Parcela estornada pela loja (sem nome na fatura): de ${name || 'compra parcelada'}`
      continue
    }
    target.remaining = round2(target.remaining - credit.amount)
    if (target.line !== undefined) {
      const purchase = out[target.line]
      purchase.refunded = round2((purchase.refunded || 0) + credit.amount)
      credit.action = 'refund'
      credit.purchaseOf = target.line
      credit.reason = `Estorno abatido de ${purchase.vendor} (linha ${target.line + 1})`
    } else {
      const k = target.known!
      credit.action = 'refund_existing'
      credit.target = { ids: k.rows.map((r) => r.id), vendor: k.rows[0].vendor, date: k.firstDate,
        installmentTotal: k.installmentTotal, currentTotal: k.currentTotal }
      credit.reason = `Corrige o lançamento de ${k.rows[0].vendor || 'sem nome'} (${k.firstDate || 'sem data'})`
    }
  }

  // Valor final das compras com estorno.
  for (const l of out) {
    if (l.action !== 'import' || !l.refunded) continue
    const left = round2(l.purchaseTotal! - l.refunded)
    if (left <= Math.max(0.05, l.purchaseTotal! * 0.01)) {
      l.action = 'refunded'
      l.netAmount = 0
      l.reason = 'Estornada por inteiro: fica registrada com R$ 0,00'
    } else {
      l.netAmount = l.installmentTotal ? round2(left / l.installmentTotal) : left
      l.reason = `Estorno de R$ ${l.refunded.toFixed(2).replace('.', ',')} abatido`
    }
  }
  return out
}

/** Carrega do Supabase os lançamentos do usuário e da conta que podem colidir com a fatura. */
export async function loadExistingForStatement(
  supabase: SupabaseClient,
  statement: ParsedStatement,
  userId: string,
  accountId: string,
): Promise<ExistingSnapshot> {
  // Estornos podem chegar até ~4 meses depois da compra: busca à vista desde então.
  const dates = statement.lines
    .filter((l) => !l.installmentTotal)
    .flatMap((l) => (l.isCredit ? [addMonths(l.date, -4), l.date] : [l.date]))
    .sort()
  const cols =
    'id, date, vendor, raw_text, total, notes, installment_group_id, installment_current, installment_total, installment_amount, original_extracted_data'
  const scoped = () =>
    supabase.from('transactions').select(cols).eq('user_id', userId).eq('account_id', accountId).eq('type', 'expense')

  let singles: ExistingTx[] = []
  if (dates.length) {
    const { data, error } = await scoped()
      .is('installment_total', null)
      .gte('date', dates[0].slice(0, 8) + '01')
      .lte('date', addMonths(dates[dates.length - 1], 1))
    if (error) throw new Error(`Falha ao consultar lançamentos: ${error.message}`)
    singles = (data || []) as ExistingTx[]
  }
  const { data: inst, error: instErr } = await scoped().not('installment_group_id', 'is', null).limit(5000)
  if (instErr) throw new Error(`Falha ao consultar parcelamentos: ${instErr.message}`)
  const { data: zero, error: zeroErr } = await scoped().eq('total', 0).limit(1000)
  if (zeroErr) throw new Error(`Falha ao consultar estornos: ${zeroErr.message}`)
  const markers = ((zero || []) as ExistingTx[]).filter((t) => t.original_extracted_data?.refunded_purchase)
  const { data: invoices } = await supabase
    .from('credit_card_invoices')
    .select('invoice_payments(amount, payment_date)')
    .eq('account_id', accountId)
  const payments = ((invoices || []) as any[]).flatMap((i) => i.invoice_payments || [])
  const { data: credits, error: credErr } = await supabase
    .from('transactions')
    .select(cols)
    .eq('user_id', userId)
    .eq('account_id', accountId)
    .eq('type', 'income')
    .limit(5000)
  if (credErr) throw new Error(`Falha ao consultar créditos: ${credErr.message}`)
  return { singles, installments: (inst || []) as ExistingTx[], markers, payments, credits: (credits || []) as ExistingTx[] }
}

function formatDue(due: string | null): string {
  return due ? due.split('-').reverse().join('/') : 'sem vencimento'
}

/** Marca dos lançamentos importados de fatura (mantido igual para reconhecer importações antigas). */
export const STATEMENT_SOURCE = 'inter_statement_pdf'

const issuerLabel = (st: ParsedStatement) => st.issuerName || 'do cartão'

const brl = (n: number) => `R$ ${n.toFixed(2).replace('.', ',')}`

interface BuildCtx {
  userId: string
  accountId: string
  statement: ParsedStatement
  filename: string | null
}

function refundsOf(lines: PreviewLine[], purchaseIndex: number, statement: ParsedStatement) {
  return lines
    .filter((l) => l.action === 'refund' && l.purchaseOf === purchaseIndex)
    .map((l) => ({ key: statementLineKey(statement, l), amount: l.amount, date: l.date }))
}

/** Converte as linhas a importar em entradas para saveBatch (mesmas regras de um lançamento manual). */
export function buildPersistInputs(lines: PreviewLine[], ctx: BuildCtx, only?: Set<number>): PersistInput[] {
  const capturedAt = new Date().toISOString()
  return lines
    .map((line, position) => ({ line, position }))
    .filter(({ line }) => line.action === 'import' && (!only || only.has(line.index)))
    .map(({ line, position }) => {
      const isInstallment = Boolean(line.installmentTotal)
      const cardSuffix = line.card ? ` · cartão final ${line.card.slice(-4)}` : ''
      const net = line.netAmount ?? line.amount
      const refundNote = line.refunded ? ` · estorno de ${brl(line.refunded)} abatido` : ''
      const present = line.presentInstallments || (line.installmentCurrent ? [line.installmentCurrent] : [])
      const receipt: Receipt = {
        user_id: ctx.userId,
        type: 'expense',
        account_id: ctx.accountId,
        vendor: line.vendor,
        vendor_address: null,
        date: line.date,
        time: null,
        currency: 'BRL',
        category: line.category,
        items: [],
        subtotal: null,
        tax: null,
        tip: null,
        total: net,
        payment_method: 'Cartão de Crédito',
        notes: `Importado da fatura ${issuerLabel(ctx.statement)} (venc. ${formatDue(ctx.statement.dueDate)})${cardSuffix}${refundNote}`,
        is_recurring: false,
        installment_group_id: null,
        installment_total: isInstallment ? line.installmentTotal : null,
        installment_current: isInstallment ? Math.max(...present) : null,
        installment_amount: isInstallment ? net : null,
        installment_date_anchor: 'purchase_date',
        review_status: 'confirmed',
        review_reasons: [],
        origin_type: 'text',
        raw_text: line.description,
        original_filename: ctx.filename,
      }
      return {
        receipt,
        userId: ctx.userId,
        imageKey: null,
        imageSha256: null,
        sourceType: 'text' as const,
        originType: 'text' as const,
        rawText: line.description,
        originalFilename: ctx.filename,
        capturedAt,
        originalExtractedData: {
          source: STATEMENT_SOURCE,
          statement_sha256: ctx.statement.sha256,
          statement_due_date: ctx.statement.dueDate,
          card: line.card,
          line_index: line.index,
          description: line.description,
          amount: line.amount,
          date: line.date,
          category: line.category,
          present_installments: isInstallment ? present : undefined,
          statement_printed: ctx.statement.printed ?? null,
          refunds: refundsOf(lines, position, ctx.statement),
        },
        // A duplicidade já foi decidida por planStatementImport, por linha.
        allowDuplicate: true,
      }
    })
}

/**
 * Parcelas antecipadas (cobradas nesta fatura antes do mês delas) ficam com a data da parcela mais
 * antiga presente na fatura. Retorna, por compra importada (mesma ordem de buildPersistInputs),
 * quais parcelas mudar e para qual data.
 */
export function antecipatedDates(lines: PreviewLine[], only?: Set<number>) {
  return lines
    .filter((l) => l.action === 'import' && (!only || only.has(l.index)))
    .map((l) => {
      const present = l.presentInstallments || []
      if (!l.installmentTotal || present.length < 2) return null
      const first = Math.min(...present)
      return { installments: present.filter((n) => n !== first), date: addMonths(l.date, first - 1) }
    })
}

/** Linhas para gravar direto: compras estornadas por inteiro, com R$ 0,00 (servem de memória). */
export function buildRefundMarkers(lines: PreviewLine[], ctx: BuildCtx) {
  return lines
    .map((line, position) => ({ line, position }))
    .filter(({ line }) => line.action === 'refunded')
    .map(({ line, position }) => {
      const n = line.installmentTotal
      const what = n ? `${n}× ${brl(line.amount)} (${brl(line.purchaseTotal!)})` : brl(line.amount)
      return {
        user_id: ctx.userId,
        account_id: ctx.accountId,
        type: 'expense',
        vendor: line.vendor,
        date: line.date,
        currency: 'BRL',
        category: line.category,
        total: 0,
        payment_method: 'Cartão de Crédito',
        notes: `Compra estornada: ${what} — estorno na fatura ${issuerLabel(ctx.statement)} (venc. ${formatDue(ctx.statement.dueDate)})`,
        is_recurring: false,
        source_type: 'text',
        origin_type: 'text',
        raw_text: line.description,
        original_filename: ctx.filename,
        review_status: 'confirmed',
        review_reasons: [],
        original_extracted_data: {
          source: STATEMENT_SOURCE,
          statement_sha256: ctx.statement.sha256,
          statement_due_date: ctx.statement.dueDate,
          card: line.card,
          line_index: line.index,
          description: line.description,
          amount: line.amount,
          date: line.date,
          refunded_purchase: { date: line.date, vendor: line.vendor, card: line.card,
            installmentTotal: n ?? null, unitAmount: line.amount, total: line.purchaseTotal },
          refunds: refundsOf(lines, position, ctx.statement),
        },
      }
    })
}

/** Correções em lançamentos já gravados: abate os estornos desta fatura. */
export function buildRefundUpdates(lines: PreviewLine[], existingById: Map<string, ExistingTx>, statement: ParsedStatement) {
  const byTarget = new Map<string, PreviewLine[]>()
  for (const l of lines) {
    if (l.action !== 'refund_existing' || !l.target) continue
    const key = l.target.ids.join(',')
    byTarget.set(key, [...(byTarget.get(key) || []), l])
  }
  const updates: Array<{ id: string; patch: Record<string, unknown> }> = []
  for (const credits of Array.from(byTarget.values())) {
    const target = credits[0].target!
    const sum = round2(credits.reduce((s, l) => s + l.amount, 0))
    const newTotal = Math.max(0, round2(target.currentTotal - sum))
    const per = target.installmentTotal ? round2(newTotal / target.ids.length) : newTotal
    const note = ` · estorno de ${brl(sum)} (fatura venc. ${formatDue(statement.dueDate)})`
    const refunds = credits.map((l) => ({ key: statementLineKey(statement, l), amount: l.amount, date: l.date }))
    for (const id of target.ids) {
      const tx = existingById.get(id)
      if (!tx) continue
      const oed = tx.original_extracted_data || {}
      updates.push({
        id,
        patch: {
          total: per,
          ...(target.installmentTotal ? { installment_amount: per } : {}),
          notes: `${tx.notes || ''}${note}`.trim(),
          original_extracted_data: {
            ...oed,
            pre_refund_amount: originalAmount(tx, target.installmentTotal ? tx.installment_amount ?? tx.total : tx.total),
            refunds: [...(oed.refunds || []), ...refunds],
          },
        },
      })
    }
  }
  return updates
}


/**
 * Modo "igual ao banco" (o que o usuário vê no app do Inter):
 * - toda cobrança vira despesa pelo valor cobrado, mesmo de compra estornada depois;
 * - todo crédito (estorno, crédito de parcela, ajuste) vira um crédito no cartão;
 * - pagamentos/adiantamentos vão para os pagamentos da fatura.
 * Assim "Despesas da fatura", créditos e "Fatura a pagar" batem com o banco.
 */
export function planLiteralImport(
  statement: ParsedStatement,
  existing: Partial<ExistingSnapshot> & { singles: ExistingTx[]; installments: ExistingTx[] },
): PreviewLine[] {
  const lines = planStatementImport(statement, { ...existing, markers: [] })
  const creditRows = existing.credits || []
  const knownKeys = new Set(creditRows.map((c) => c.original_extracted_data?.statement_key).filter(Boolean))
  const used = new Set<string>()
  for (const l of lines) {
    if (l.isCredit && l.kind !== 'payment') {
      const key = statementLineKey(statement, l)
      const dup =
        knownKeys.has(key) ||
        creditRows.find(
          (c) => !used.has(c.id) && c.date === l.date && Math.abs(num(c.total) - l.amount) < 0.005 && sameVendor(l, c),
        )
      if (dup && typeof dup === 'object') used.add(dup.id)
      const owner = l.purchaseOf !== undefined ? lines[l.purchaseOf] : null
      l.action = dup ? 'credit_exists' : 'card_credit'
      l.reason = dup
        ? 'Crédito já registrado'
        : owner
          ? `Estorno de ${owner.vendor}: entra como crédito no cartão`
          : l.reason.startsWith('Ajuste')
            ? 'Crédito do banco (anulado por uma reversão de mesmo valor)'
            : 'Crédito no cartão'
      continue
    }
    if (l.action === 'adjustment') {
      l.action = 'import'
      l.netAmount = l.amount
      l.reason = 'Reversão de crédito do banco (cobrada na fatura)'
      continue
    }
    if (l.action === 'refunded' || (l.action === 'import' && l.refunded)) {
      l.refundedBy = l.refunded
      l.refunded = undefined
      l.netAmount = l.amount
      l.action = 'import'
      l.reason = 'Estornada nesta fatura: a cobrança entra como despesa e o estorno como crédito'
    }
  }
  return lines
}

/** Linhas de crédito no cartão para gravar direto (receita da conta do cartão, categoria Reembolsos). */
export function buildCreditRows(lines: PreviewLine[], ctx: BuildCtx) {
  return lines
    .filter((l) => l.action === 'card_credit')
    .map((l) => {
      const owner = l.purchaseOf !== undefined ? lines[l.purchaseOf] : null
      return {
        user_id: ctx.userId,
        account_id: ctx.accountId,
        type: 'income',
        vendor: owner?.vendor || l.vendor,
        date: l.date,
        currency: 'BRL',
        category: 'Reembolsos',
        total: l.amount,
        payment_method: 'Cartão de Crédito',
        notes: `Crédito na fatura ${issuerLabel(ctx.statement)} (venc. ${formatDue(ctx.statement.dueDate)})${
          l.card ? ` · cartão final ${l.card.slice(-4)}` : ''}${owner ? ` · estorno de ${owner.vendor}` : ''}`,
        is_recurring: false,
        source_type: 'text',
        origin_type: 'text',
        raw_text: l.description,
        original_filename: ctx.filename,
        review_status: 'confirmed',
        review_reasons: [],
        original_extracted_data: {
          source: STATEMENT_SOURCE,
          card_credit: true,
          statement_sha256: ctx.statement.sha256,
          statement_due_date: ctx.statement.dueDate,
          statement_key: statementLineKey(ctx.statement, l),
          statement_printed: ctx.statement.printed ?? null,
          card: l.card,
          line_index: l.index,
          description: l.description,
          amount: l.amount,
          date: l.date,
        },
      }
    })
}


/**
 * Centavos das parcelas iguais ao banco.
 * - Compra nova com várias parcelas nesta fatura: cada parcela presente fica com o valor cobrado dela.
 *   Retorna, na ordem de buildPersistInputs, o mapa parcela → valor (só quando difere do valor padrão).
 * - Parcelamento já gravado: a parcela desta fatura e as seguintes ficam com o valor cobrado agora.
 */
export function newPlanParcelAmounts(lines: PreviewLine[], only?: Set<number>) {
  return lines
    .map((l, position) => ({ l, position }))
    .filter(({ l }) => l.action === 'import' && (!only || only.has(l.index)))
    .map(({ l, position }) => {
      if (!l.installmentTotal) return null
      const parts = lines.filter((x, i) => i === position || (x.action === 'same_purchase' && x.purchaseOf === position))
      const amounts: Record<number, number> = {}
      for (const x of parts) if (x.installmentCurrent && Math.abs(x.amount - (l.netAmount ?? l.amount)) >= 0.005) amounts[x.installmentCurrent] = x.amount
      // Parcelas futuras: o valor das parcelas 2+ (quando a fatura mostrou alguma) é o melhor palpite.
      const later = parts.find((x) => (x.installmentCurrent ?? 0) > 1)
      return { amounts, futureAmount: later && Math.abs(later.amount - (l.netAmount ?? l.amount)) >= 0.005 ? later.amount : null,
        after: Math.max(...parts.map((x) => x.installmentCurrent ?? 0)) }
    })
}

export function existingParcelFixes(lines: PreviewLine[]) {
  const fixes: Array<{ id: string; total: number }> = []
  for (const l of lines) {
    if (l.action !== 'installment_exists' || !l.matchedRows || !l.installmentCurrent) continue
    for (const r of l.matchedRows) {
      if ((r.installment_current ?? 0) < l.installmentCurrent) continue
      if (Math.abs(r.total - l.amount) >= 0.005) fixes.push({ id: r.id, total: l.amount })
    }
  }
  return fixes
}
