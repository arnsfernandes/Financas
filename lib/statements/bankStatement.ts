/**
 * Extrato de conta (Inter, PDF): separa o que é gasto em estabelecimento do que é só dinheiro mudando
 * de lugar. Sem IA: regras sobre o tipo da linha e o nome de quem recebeu.
 *
 *  gasto            Pix/boleto para empresa, compra no débito
 *  pessoa           Pix para pessoa física: o usuário decide uma vez (mercado? transferência?)
 *  entrada          Pix recebido de terceiros
 *  transferencia    Pix entre contas do próprio titular
 *  fatura           pagamento da fatura do cartão (já está nas compras do cartão)
 *  investimento     aplicação, resgate, pontos
 *  estorno_pix      Pix enviado devolvido (anula o Pix enviado de mesmo valor)
 */
import { normalizeVendor } from '../duplicate'
import { guessCategory } from './importStatement'
import { cleanVendor } from './interPdf'

/** É extrato de conta (e não fatura de cartão)? */
export function isBankStatementText(text: string): boolean {
  return /saldo do dia/i.test(text) && /pix (enviado|recebido)|pagamento efetuado|aplica[cç][aã]o|resgate/i.test(text)
}

/** Nome amigável do estabelecimento. */
const NICE: Array<[RegExp, string]> = [
  [/arcos dourados/i, "McDonald's"], [/telefonica/i, 'Vivo'], [/^tim\b/i, 'TIM'], [/shpp/i, 'Shopee'], [/magalupay/i, 'Magalu'],
  [/rd saude/i, 'Raia/Drogasil'], [/uber/i, 'Uber'], [/neoenergia/i, 'Neoenergia Elektro (luz)'], [/pagaleve/i, 'Pagaleve'],
  [/cotrijal/i, 'Cotrijal'], [/ebanx/i, 'Ebanx'], [/i9 educacao/i, 'I9 Educação'], [/mercado pago/i, 'Mercado Pago'],
]
export function displayVendor(name: string): string {
  return NICE.find(([re]) => re.test(name))?.[1] || cleanVendor(name.replace(/^\d+\s+/, ''))
}

/** Instituição de pagamento sem loja definida (o destino real do dinheiro não aparece). */
export function isPaymentInstitution(name: string): boolean {
  return !/shpp|shopee|magalu/i.test(name) &&
    /mercado\s*pago|wise|paypal|picpay|pagbank|nubank|instituicao de pag|institui[cç][aã]o de pagamento/i.test(name)
}

/** Forma de pagamento pelo tipo da linha. */
export function paymentMethodOf(type: string): string {
  if (/d[eé]bito|compra/i.test(type)) return 'Cartão de Débito'
  if (/pagamento efetuado|boleto/i.test(type)) return 'Boleto'
  return 'Pix'
}

export type BankKind = 'gasto' | 'pessoa' | 'entrada' | 'transferencia' | 'fatura' | 'investimento' | 'estorno_pix'

export interface BankLine {
  index: number
  date: string
  type: string
  counterparty: string
  name: string
  amount: number // positivo = entrou, negativo = saiu
  kind: BankKind
  category: string | null
  pairedWith?: number
}

const MONTHS: Record<string, number> = {
  janeiro: 1, fevereiro: 2, marco: 3, março: 3, abril: 4, maio: 5, junho: 6, julho: 7, agosto: 8,
  setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
}
const DAY = /^(\d{1,2}) de ([a-zç]+) de (\d{4})\s+saldo do dia/i
const LINE = /^([^:"]+?):\s*"?(.*?)"?\s+(-?)R\$\s*([\d.]+,\d{2})\s+-?R\$\s*[\d.]+,\d{2}$/
const COMPANY =
  /\b(ltda|s\.?\s?a\.?|me|eireli|epp|instituicao|institui[cç][aã]o|pagamentos?|pay|comercio|com[eé]rcio|cooperativa|industria|servi[cç]os|tecnologia|brasil|bras|educacao|educa[cç][aã]o|energia|elektro|telefonica|tim|fundo|banco|distribuidora|supermercados?|mercado|posto|farmacia|drogaria|restaurante|loja|ebanx|uber|ifood|sabesp|claro|vivo|sky|cobr|alimentos|holding|participa[cç][oõ]es|ind|magalupay|magalu|pizzas?|pizzaria|food|saude|saúde|lanches|bar|cafe|padaria)\b/i

const EXTRA_RULES: Array<[RegExp, string]> = [
  [/neoenergia|elektro|energia|sabesp|saneamento|\bagua\b|água|condominio|condomínio|aluguel|imobili/i, 'Moradia'],
  [/telefonica|telefônica/i, 'Serviços'],
  [/arcos dourados|mc\s*donald|burger king|bk brasil/i, 'Alimentação'],
  [/educa[cç][aã]o|escola|colegio|colégio/i, 'Educação'],
  [/cooperativa agropecuaria|cotrijal/i, 'Mercado'],
  [/magalupay|shpp|shopee/i, 'Compras'],
  [/pizza|food|lanche/i, 'Alimentação'],
  [/rd saude|raia|drogasil/i, 'Saúde'],
]

function norm(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim()
}

export function parseBankStatementText(text: string) {
  const rows = text.split(/\r?\n/).map((r) => r.trim()).filter(Boolean)
  const holderLine = rows.find((r) => /^[A-ZÀ-Ú ]{8,}$/.test(r)) || ''
  const holder = norm(holderLine)
  const period = /per[ií]odo:\s*(\d{2})\/(\d{2})\/(\d{4})\s*a\s*(\d{2})\/(\d{2})\/(\d{4})/i.exec(text)
  const lines: BankLine[] = []
  let date = ''
  for (const r of rows) {
    const d = DAY.exec(r)
    if (d) {
      const m = MONTHS[norm(d[2])]
      if (m) date = `${d[3]}-${String(m).padStart(2, '0')}-${d[1].padStart(2, '0')}`
      continue
    }
    const l = LINE.exec(r)
    if (!l || !date) continue
    const type = l[1].trim()
    const counterparty = l[2].trim()
    const name = counterparty.replace(/^cp\s*:\s*\d+\s*-\s*/i, '').replace(/^[\d.]+\s+/, '').trim()
    const amount = (l[3] ? -1 : 1) * Number(l[4].replace(/\./g, '').replace(',', '.'))
    lines.push({ index: lines.length, date, type, counterparty, name, amount, kind: 'gasto', category: null })
  }
  for (const l of lines) classify(l, holder)
  // "Pix enviado devolvido" anula o Pix enviado de mesmo valor para o mesmo destinatário.
  for (const back of lines.filter((l) => l.kind === 'estorno_pix')) {
    const sent = lines.find((s) => s.pairedWith === undefined && s.amount === -back.amount && s.type.startsWith('Pix enviado') &&
      s.kind !== 'estorno_pix' && normalizeVendor(s.name) === normalizeVendor(back.name))
    if (sent) {
      sent.pairedWith = back.index
      back.pairedWith = sent.index
      sent.kind = 'estorno_pix'
    }
  }
  return {
    holder: holderLine,
    from: period ? `${period[3]}-${period[2]}-${period[1]}` : null,
    to: period ? `${period[6]}-${period[5]}-${period[4]}` : null,
    lines,
  }
}

function classify(l: BankLine, holder: string) {
  const t = norm(l.type)
  const n = norm(l.name)
  const own = holder && (n.includes(holder) || holder.includes(n))
  if (/aplicacao|resgate|pontos|porquinho|cdb|poupanca|investimento/.test(t)) return set(l, 'investimento')
  if (/devolvido/.test(t)) return set(l, 'estorno_pix')
  if (/pagamento/.test(t) && /fatura/.test(n)) return set(l, 'fatura')
  if (own) return set(l, 'transferencia')
  if (l.amount > 0) return set(l, 'entrada')
  const company = COMPANY.test(l.name) || /\d{3,}/.test(l.name) || /pagamento efetuado|debito|débito|compra/.test(t)
  if (!company) return set(l, 'pessoa')
  set(l, 'gasto')
  for (const [re, cat] of EXTRA_RULES) if (re.test(l.name)) return (l.category = cat)
  // Pix para instituição de pagamento sem loja definida (Mercado Pago, Wise…): pode ser fatura de outro
  // cartão, envio para outra pessoa etc. Fica sem categoria e desmarcado para o usuário decidir.
  if (isPaymentInstitution(l.name)) return (l.category = null)
  l.category = guessCategory({ description: l.name, vendor: cleanVendor(l.name), kind: 'purchase' })
}

function set(l: BankLine, kind: BankKind) {
  l.kind = kind
}
