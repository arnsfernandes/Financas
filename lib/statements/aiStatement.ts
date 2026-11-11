/**
 * Reserva com IA para faturas que o leitor por código não entende (PDF escaneado, layout estranho).
 * Só é usada quando o código não acha lançamentos, ou quando o usuário pede. Desligue com
 * STATEMENT_AI=off. No modo texto, cada valor devolvido precisa aparecer no texto da fatura:
 * linhas com valor que não está no documento são descartadas (a IA não pode inventar números).
 */
import OpenAI from 'openai'
import { detectIssuer, makeLine, type ParsedStatement, StatementParseError } from './interPdf'

export function statementAiAvailable(): boolean {
  return Boolean(process.env.OPENAI_API_KEY) && process.env.STATEMENT_AI !== 'off'
}

let client: OpenAI | null = null
function getClient(): OpenAI {
  if (!client) client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  return client
}

const nullable = (type: string) => ({ type: [type, 'null'] })

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['issuer_name', 'due_date', 'statement_total', 'lines'],
  properties: {
    issuer_name: nullable('string'),
    due_date: { ...nullable('string'), description: 'YYYY-MM-DD' },
    statement_total: nullable('number'),
    lines: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['date', 'description', 'amount', 'is_credit', 'is_payment', 'installment_current', 'installment_total', 'card_last4'],
        properties: {
          date: { type: 'string', description: 'Data da compra, YYYY-MM-DD' },
          description: { type: 'string' },
          amount: { type: 'number', description: 'Valor em reais, sempre positivo' },
          is_credit: { type: 'boolean' },
          is_payment: { type: 'boolean' },
          installment_current: nullable('integer'),
          installment_total: nullable('integer'),
          card_last4: nullable('string'),
        },
      },
    },
  },
} as const

const PROMPT = `Você extrai os lançamentos de uma fatura de cartão de crédito brasileira, de qualquer banco.
Regras:
- Liste TODOS os lançamentos do período desta fatura, um por linha, na ordem do documento.
- Copie a descrição exatamente como impressa (sem a data e sem o valor).
- date: a data impressa no lançamento (data da compra), em YYYY-MM-DD. Se o ano não aparece, deduza pelo vencimento.
- amount: o valor em reais (R$), sempre positivo. Em compras internacionais use o valor convertido em reais.
- is_credit = true para estornos, créditos, devoluções, cashback, ajustes a crédito e pagamentos.
- is_payment = true só para o pagamento da fatura.
- installment_current/installment_total: para "Parcela 3 de 10", "03/10", "PARC 3/10"; senão null.
- card_last4: os 4 últimos dígitos do cartão da seção do lançamento, se houver.
- NÃO inclua parcelas futuras ("próximas faturas", "lançamentos futuros"), totais, saldos, limites, juros projetados.
- Nunca invente lançamentos nem valores. Se não houver lançamentos, devolva lines vazio.`

/** Todas as formas de escrever o valor que contam como "aparece no documento". */
function amountForms(n: number): string[] {
  const fixed = n.toFixed(2)
  const [int, dec] = fixed.split('.')
  const thousands = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return [`${int},${dec}`, `${thousands},${dec}`, fixed, `${int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${dec}`]
}

const ISO = /^\d{4}-\d{2}-\d{2}$/

export async function parseStatementWithAi(input: {
  text?: string
  pdf?: Buffer
  filename: string
  sha256: string
}): Promise<ParsedStatement> {
  if (!statementAiAvailable()) throw new StatementParseError('Leitura por IA desativada.')
  const grounded = Boolean(input.text && input.text.replace(/\s/g, '').length > 200)
  const content: any[] = [{ type: 'text', text: 'Extraia os lançamentos desta fatura.' }]
  if (grounded) content.push({ type: 'text', text: input.text!.slice(0, 120_000) })
  else if (input.pdf)
    content.push({
      type: 'file',
      file: { filename: input.filename || 'fatura.pdf', file_data: `data:application/pdf;base64,${input.pdf.toString('base64')}` },
    })
  else throw new StatementParseError('Nada para ler na fatura.')

  const model = grounded ? process.env.TEXT_MODEL || 'gpt-4o-mini' : process.env.VISION_MODEL || 'gpt-4o'
  const response = await getClient().chat.completions.create({
    model,
    temperature: 0,
    messages: [
      { role: 'system', content: PROMPT },
      { role: 'user', content },
    ] as any,
    response_format: { type: 'json_schema', json_schema: { name: 'card_statement', strict: true, schema: SCHEMA as any } },
  })
  const json = JSON.parse(response.choices[0]?.message?.content || '{}')
  const rawLines: any[] = Array.isArray(json.lines) ? json.lines : []

  const haystack = grounded ? input.text!.replace(/\s+/g, ' ') : ''
  let dropped = 0
  const lines = []
  for (const l of rawLines) {
    const amount = Number(l.amount)
    if (!ISO.test(String(l.date)) || !(amount > 0) || !String(l.description || '').trim()) {
      dropped++
      continue
    }
    if (grounded && !amountForms(amount).some((f) => haystack.includes(f))) {
      dropped++
      continue
    }
    lines.push(
      makeLine({
        index: lines.length,
        date: l.date,
        description: String(l.description),
        amount,
        credit: Boolean(l.is_credit),
        payment: Boolean(l.is_payment),
        card: l.card_last4 ? `****${String(l.card_last4).slice(-4)}` : null,
        installmentCurrent: l.installment_current,
        installmentTotal: l.installment_total,
      }),
    )
  }
  const detected = input.text ? detectIssuer(input.text) : { issuer: 'unknown', issuerName: null }
  const warnings = [
    grounded
      ? 'Lida com IA: os valores foram conferidos contra o texto da fatura, mas revise antes de importar.'
      : 'Lida com IA a partir da imagem do PDF (escaneado): confira os valores antes de importar.',
  ]
  if (dropped) warnings.push(`${dropped} linha(s) descartada(s) porque o valor não aparece na fatura.`)
  return {
    issuer: detected.issuer,
    issuerName: detected.issuerName || (typeof json.issuer_name === 'string' ? json.issuer_name : null),
    source: 'ai',
    dueDate: ISO.test(String(json.due_date)) ? json.due_date : null,
    sha256: input.sha256,
    lines,
    statedTotal: typeof json.statement_total === 'number' ? json.statement_total : null,
    warnings,
  }
}
