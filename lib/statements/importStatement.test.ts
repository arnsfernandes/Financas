import { describe, expect, it } from 'vitest'
import { parseLine, parseStatementText } from './interPdf'
import {
  antecipatedDates, buildPersistInputs, buildRefundMarkers, buildRefundUpdates, planStatementImport, type ExistingTx,
} from './importStatement'
import { generateInstallmentDates } from '../installments'

const FATURA = `Resumo da fatura
Data de Vencimento
Este é o valor que você precisa pagar nesse mês 15/08/2026
ARNALDO DA SILVA
5364****1053 15/08/2026 R$ 0,00
Despesas da fatura
CARTÃO 5364****1053
Data Movimentação Beneficiário Valor
04 de abr. 2026 AUTOZONE BRASIL COMERC (Parcela 05 de 10) - R$ 54,69
10 de jul. 2026 MERCEARIA SRA DE LOURD - R$ 12,99
10 de jul. 2026 MERCEARIA SRA DE LOURD - R$ 12,99
13 de jul. 2026 PAGAMENTO ON LINE - + R$ 1.139,43
15 de jul. 2026 APPLE.COM/BILL - R$ 9,99
16 de jul. 2026 IOF INTERNACIONAL - R$ 0,58
Total CARTÃO 5364****1053 R$ 583,06
CARTÃO 5361****7207
28 de nov. 2025 LIVELO S.A. (Parcela 09 de 12) - R$ 60,79
28 de nov. 2025 LIVELO S.A. (Parcela 09 de 12) - R$ 60,79
10 de ago. 2026 MERCADOLIVRE*MERCADOL (Parcela 01 de 06) - R$ 39,75
10 de ago. 2026 MERCADOLIVRE*MERCADOL (Parcela 02 de 06) - R$ 39,73
20 de ago. 2026 MERCADOLIVRE*MERCADOL (Parcela 01 de 06) - + R$ 238,40
Próxima fatura
LIVELO S.A. (Parcela 10 de 12) R$ 60,79
01 de set. 2026 NAO DEVE ENTRAR - R$ 1,00
Banco Inter S.A.`

describe('leitor da fatura Inter', () => {
  it('lê data, valor, parcelas, cartão e vencimento, e para na seção "Próxima fatura"', () => {
    const st = parseStatementText(FATURA)
    expect(st.issuer).toBe('inter')
    expect(st.dueDate).toBe('2026-08-15')
    expect(st.lines).toHaveLength(11)
    expect(st.lines[0]).toMatchObject({ date: '2026-04-04', amount: 54.69, installmentCurrent: 5, installmentTotal: 10,
      vendor: 'Autozone Brasil Comerc', card: '5364****1053', kind: 'purchase' })
    expect(st.lines[3]).toMatchObject({ kind: 'payment', isCredit: true, amount: 1139.43 })
    expect(st.lines[5].kind).toBe('fee')
    expect(st.lines[6].card).toBe('5361****7207')
    expect(st.lines.some((l) => l.description.includes('NAO DEVE ENTRAR'))).toBe(false)
  })

  it('aceita datas numéricas e infere o ano pelo vencimento', () => {
    const l = parseLine('28/12 LOJA X - R$ 1.200,00', '2026-01-15', null, 0)
    expect(l).toMatchObject({ date: '2025-12-28', amount: 1200 })
  })
})

describe('planejamento da importação', () => {
  const st = parseStatementText(FATURA)

  it('importa compras, pula pagamento, agrupa parcelas da mesma compra e abate estorno', () => {
    const plan = planStatementImport(st, { singles: [], installments: [] })
    expect(plan.map((l) => l.action)).toEqual([
      'import', 'import', 'import', 'payment', 'import', 'import',
      'import', 'import', // LIVELO 2×: duas compras iguais
      'refunded', 'same_purchase', 'refund', // Mercado Livre 6× estornado por inteiro
    ])
    expect(plan[9]).toMatchObject({ action: 'same_purchase', purchaseOf: 8 })
    expect(plan[8].presentInstallments).toEqual([1, 2])
    expect(plan[10]).toMatchObject({ action: 'refund', purchaseOf: 8 })
    expect(plan[8]).toMatchObject({ refunded: 238.4, netAmount: 0 })
    expect(plan[5].category).toBe('Impostos & Tarifas')
    expect(plan[4].category).toBe('Assinaturas')
  })

  it('estorno parcial reduz o valor; vários estornos se encaixam nas compras certas', () => {
    const p = planStatementImport(parseStatementText(`Vencimento 15/08/2026
CARTÃO 5361****9124
29 de jul. 2026 MERCADOLIVRE*MERCADOL - R$ 104,04
29 de jul. 2026 MERCADOLIVRE*MERCADOL - R$ 75,36
01 de ago. 2026 MERCADOLIVRE*MERCADOL - + R$ 78,02
01 de ago. 2026 MERCADOLIVRE*MERCADOL - + R$ 37,68
01 de ago. 2026 MERCADOLIVRE*MERCADOL - + R$ 26,02
02 de ago. 2026 LOJA X (Parcela 01 de 04) - R$ 100,00
05 de ago. 2026 LOJA X (Parcela 01 de 04) - + R$ 100,00`), { singles: [], installments: [] })
    expect(p.map((l) => l.action)).toEqual(['refunded', 'import', 'refund', 'refund', 'refund', 'import', 'refund'])
    expect(p[1]).toMatchObject({ refunded: 37.68, netAmount: 37.68 })
    expect(p[5]).toMatchObject({ refunded: 100, netAmount: 75 }) // 400 − 100 = 300 em 4×
  })

  it('reimportar a mesma fatura não cria nada (idempotente)', () => {
    const first = planStatementImport(st, { singles: [], installments: [] })
    const inputs = buildPersistInputs(first, { userId: 'u', accountId: 'acc', statement: st, filename: 'f.pdf' })
    // Simula o que persist grava: 1 linha por compra à vista, N linhas por parcelamento.
    const singles: ExistingTx[] = []
    const installments: ExistingTx[] = []
    inputs.forEach((input, i) => {
      const r = input.receipt
      if (r.installment_total) {
        for (const d of generateInstallmentDates(r.date!, r.installment_total, r.installment_current!, 'purchase_date')) {
          installments.push({ id: `g${i}-${d.installmentCurrent}`, date: d.date, vendor: r.vendor, raw_text: r.raw_text,
            total: r.total, installment_group_id: `g${i}`, installment_current: d.installmentCurrent,
            installment_total: r.installment_total, installment_amount: r.installment_amount })
        }
      } else {
        singles.push({ id: `s${i}`, date: r.date, vendor: r.vendor, raw_text: r.raw_text, total: r.total })
      }
    })
    const markers: ExistingTx[] = buildRefundMarkers(first, { userId: 'u', accountId: 'acc', statement: st, filename: 'f.pdf' })
      .map((m, i) => ({ id: `m${i}`, ...m }))
    const again = planStatementImport(st, { singles, installments, markers })
    expect(again.filter((l) => l.action === 'import' || l.action === 'refunded')).toHaveLength(0)
    expect(again.filter((l) => l.action === 'installment_exists')).toHaveLength(4) // inclui o Mercado Livre estornado
    expect(again.filter((l) => l.action === 'duplicate')).toHaveLength(4)
    expect(again.filter((l) => l.action === 'refund_applied')).toHaveLength(1)
  })

  it('a fatura do mês seguinte reconhece o parcelamento já criado e só importa o que é novo', () => {
    const next = parseStatementText(`Vencimento 15/09/2026
CARTÃO 5364****1053
04 de abr. 2026 AUTOZONE BRASIL COMERC (Parcela 06 de 10) - R$ 54,69
11 de ago. 2026 PADARIA CARMELINA - R$ 38,70`)
    const existing: ExistingTx[] = generateInstallmentDates('2026-04-04', 10, 5, 'purchase_date').map((d) => ({
      id: `a${d.installmentCurrent}`, date: d.date, vendor: 'Autozone Brasil Comerc', raw_text: 'AUTOZONE BRASIL COMERC (Parcela 05 de 10)',
      total: 54.69, installment_group_id: 'auto', installment_current: d.installmentCurrent, installment_total: 10, installment_amount: 54.69,
    }))
    const plan = planStatementImport(next, { singles: [], installments: existing })
    expect(plan.map((l) => l.action)).toEqual(['installment_exists', 'import'])
    expect(plan[1].category).toBe('Alimentação')
  })

  it('não confunde compra lançada por foto com valor diferente', () => {
    const plan = planStatementImport(st, {
      singles: [{ id: 'x', date: '2026-07-15', vendor: 'Apple', total: 19.9 }],
      installments: [],
    })
    expect(plan[4].action).toBe('import')
  })

  it('gera lançamentos no cartão escolhido, ancorados na data da compra', () => {
    const plan = planStatementImport(st, { singles: [], installments: [] })
    const inputs = buildPersistInputs(plan, { userId: 'u', accountId: 'acc', statement: st, filename: 'f.pdf' })
    expect(inputs).toHaveLength(7)
    // Parcela 5 de 10 na fatura: lança as 10, passadas (1–4) e futuras (6–10).
    const dates = generateInstallmentDates(inputs[0].receipt.date!, 10, 5, 'purchase_date')
    expect(dates.map((d) => d.date)).toEqual(['2026-04-04', '2026-05-04', '2026-06-04', '2026-07-04', '2026-08-04',
      '2026-09-04', '2026-10-04', '2026-11-04', '2026-12-04', '2027-01-04'])
    const auto = inputs[0].receipt
    expect(auto).toMatchObject({ account_id: 'acc', date: '2026-04-04', total: 54.69, installment_total: 10,
      installment_current: 5, installment_amount: 54.69, installment_date_anchor: 'purchase_date',
      payment_method: 'Cartão de Crédito', type: 'expense' })
    expect(inputs.every((i) => i.allowDuplicate && i.userId === 'u')).toBe(true)
  })

  it('estorno numa fatura posterior corrige o parcelamento já lançado', () => {
    const existing: ExistingTx[] = generateInstallmentDates('2026-07-02', 4, 1, 'purchase_date').map((d) => ({
      id: `x${d.installmentCurrent}`, date: d.date, vendor: 'Loja X', raw_text: 'LOJA X (Parcela 01 de 04)', total: 100,
      notes: 'n', installment_group_id: 'gx', installment_current: d.installmentCurrent, installment_total: 4, installment_amount: 100,
    }))
    const next = parseStatementText(`Vencimento 15/09/2026
CARTÃO 5361****9124
02 de jul. 2026 LOJA X (Parcela 02 de 04) - R$ 100,00
20 de ago. 2026 LOJA X (Parcela 01 de 04) - + R$ 200,00`)
    const plan = planStatementImport(next, { singles: [], installments: existing })
    expect(plan.map((l) => l.action)).toEqual(['installment_exists', 'refund_existing'])
    const updates = buildRefundUpdates(plan, new Map(existing.map((t) => [t.id, t])), next)
    expect(updates).toHaveLength(4)
    expect(updates[0].patch).toMatchObject({ total: 50, installment_amount: 50 })
    // Reimportar depois da correção não aplica de novo.
    const fixed = existing.map((t, i) => ({ ...t, ...updates[i].patch })) as ExistingTx[]
    expect(planStatementImport(next, { singles: [], installments: fixed }).map((l) => l.action))
      .toEqual(['installment_exists', 'refund_applied'])
  })

  it('parcelas antecipadas ficam com a data desta fatura', () => {
    const plan = planStatementImport(parseStatementText(`Vencimento 15/09/2026
CARTÃO 5361****9124
10 de ago. 2026 LOJA Y (Parcela 01 de 03) - R$ 50,00
10 de ago. 2026 LOJA Y (Parcela 02 de 03) - R$ 50,00`), { singles: [], installments: [] })
    expect(antecipatedDates(plan)).toEqual([{ installments: [2], date: '2026-08-10' }])
  })
})

describe('quadro-resumo impresso do Inter', () => {
  it('lê Despesas do mês, Valor antecipado e Fatura atual', () => {
    const st = parseStatementText(`DESPESAS DO MÊS VALOR ANTECIPADO FATURA ATUAL
R$ 4.520,10 R$ 2.153,46 R$ 2.366,64
Vencimento 15/09/2026
CARTÃO 5364****1053
11 de ago. 2026 PADARIA CARMELINA - R$ 38,70`)
    expect(st.printed).toEqual({ expenses: 4520.1, advanced: 2153.46, due: 2366.64, nextCutoff: null })
    expect(st.statedTotal).toBe(2366.64)
  })
})

describe('pagamento/adiantamento da fatura', () => {
  it('vai para a fatura que vence logo depois do pagamento e não é registrado duas vezes', async () => {
    const { paymentDueFor } = await import('./importStatement')
    expect(paymentDueFor('2026-07-13', '2026-08-15')).toBe('2026-07-15') // adiantou a fatura de julho
    expect(paymentDueFor('2026-08-02', '2026-08-15')).toBe('2026-08-15') // adiantou a fatura atual
    const st = parseStatementText(FATURA)
    const first = planStatementImport(st, { singles: [], installments: [] })
    expect(first[3]).toMatchObject({ action: 'payment', paymentDue: '2026-07-15', paymentRegistered: false })
    expect(buildPersistInputs(first, { userId: 'u', accountId: 'a', statement: st, filename: null })
      .some((i) => i.receipt.total === 1139.43)).toBe(false) // nunca vira despesa
    const again = planStatementImport(st, { singles: [], installments: [], markers: [],
      payments: [{ amount: 1139.43, payment_date: '2026-07-13' }] })
    expect(again[3].paymentRegistered).toBe(true)
  })
})

describe('créditos de parcela sem nome da loja', () => {
  it('"CRED PARC LOJ PARCELA" é ligado à compra parcelada com parcela de mesmo valor', () => {
    const st = parseStatementText(`Vencimento 15/11/2026
CARTÃO 5364****9124
15 de out. 2026 AMAZON BR (Parcela 01 de 12) - R$ 54,23
15 de out. 2026 AMAZON BR (Parcela 01 de 12) - + R$ 649,99
15 de out. 2026 CRED PARC LOJ PARCELA - + R$ 54,16
15 de out. 2026 CRED PARC LOJ PARCELA - + R$ 54,16
20 de out. 2026 PADARIA - R$ 10,00
21 de out. 2026 CRED PARC LOJ PARCELA - + R$ 33,33`)
    const plan = planStatementImport(st, { singles: [], installments: [] })
    expect(plan.map((l) => l.action)).toEqual(['refunded', 'refund', 'refund', 'refund', 'import', 'credit'])
    expect(plan[2]).toMatchObject({ purchaseOf: 0 })
    expect(plan[2].reason).toMatch(/sem nome na fatura.*Amazon/)
  })
})

describe('ajustes do banco que se anulam', () => {
  it('"REV CR PARC LOJ PARCEL" (débito) e "CRED PARC LOJ PARCELA" (crédito) de mesmo valor não são gasto nem estorno', () => {
    const st = parseStatementText(`Vencimento 15/11/2026
CARTÃO 5361****7207
15 de out. 2026 REV CR PARC LOJ PARCEL - R$ 54,16
15 de out. 2026 CRED PARC LOJ PARCELA - + R$ 54,16
15 de out. 2026 REV CR PARC LOJ PARCEL - R$ 54,16
15 de out. 2026 CRED PARC LOJ PARCELA - + R$ 54,16
20 de out. 2026 PADARIA - R$ 10,00`)
    const plan = planStatementImport(st, { singles: [], installments: [] })
    expect(plan.map((l) => l.action)).toEqual(['adjustment', 'adjustment', 'adjustment', 'adjustment', 'import'])
    expect(buildPersistInputs(plan, { userId: 'u', accountId: 'a', statement: st, filename: null })).toHaveLength(1)
  })
})

describe('modo igual ao banco', () => {
  it('compra estornada continua como despesa pelo valor cobrado e o estorno vira crédito', async () => {
    const { planLiteralImport, buildCreditRows } = await import('./importStatement')
    const st = parseStatementText(`Vencimento 15/08/2026
CARTÃO 5361****9124
29 de jul. 2026 MERCADOLIVRE*MERCADOL - R$ 104,04
01 de ago. 2026 MERCADOLIVRE*MERCADOL - + R$ 104,04
15 de out. 2026 REV CR PARC LOJ PARCEL - R$ 54,16
15 de out. 2026 CRED PARC LOJ PARCELA - + R$ 54,16`)
    const plan = planLiteralImport(st, { singles: [], installments: [] })
    expect(plan.map((l) => l.action)).toEqual(['import', 'card_credit', 'import', 'card_credit'])
    expect(plan[0]).toMatchObject({ netAmount: 104.04, refundedBy: 104.04 })
    const inputs = buildPersistInputs(plan, { userId: 'u', accountId: 'a', statement: st, filename: null })
    expect(inputs.map((i) => i.receipt.total)).toEqual([104.04, 54.16])
    const credits = buildCreditRows(plan, { userId: 'u', accountId: 'a', statement: st, filename: null })
    expect(credits.map((c) => [c.type, c.total, c.original_extracted_data.card_credit])).toEqual([['income', 104.04, true], ['income', 54.16, true]])
    // Reimportar não duplica créditos
    const again = planLiteralImport(st, { singles: [], installments: [], credits: credits.map((c, i) => ({ id: `c${i}`, ...c })) as any })
    expect(again.filter((l) => l.action === 'card_credit')).toHaveLength(0)
  })
})
