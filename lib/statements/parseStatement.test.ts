import { describe, expect, it } from 'vitest'
import { parseStatementText } from './interPdf'
import { parseCsv, parseOfx, pdfStart, statementFromPreview, fileSha256 } from './parseStatement'

describe('leitor genérico de faturas', () => {
  it('estilo Nubank: "10 AGO", sem sinal nos gastos, "−" nos créditos', () => {
    const st = parseStatementText(`Nubank
Data de vencimento: 15/09/2026
10 AGO Padaria Carmelina R$ 38,70
12 AGO Amazon Marketplace - Parcela 2/5 R$ 31,12
14 AGO Estorno de compra −R$ 20,00
20 AGO Pagamento recebido −R$ 1.500,00
22 AGO Uber *Trip R$ 15,90
Próximas faturas
10 SET Amazon Marketplace - Parcela 3/5 R$ 31,12`)
    expect(st.issuer).toBe('nubank')
    expect(st.lines.map((l) => [l.date, l.amount, l.isCredit, l.kind])).toEqual([
      ['2026-08-10', 38.7, false, 'purchase'],
      ['2026-08-12', 31.12, false, 'purchase'],
      ['2026-08-14', 20, true, 'credit'],
      ['2026-08-20', 1500, true, 'payment'],
      ['2026-08-22', 15.9, false, 'purchase'],
    ])
    expect(st.lines[1]).toMatchObject({ installmentCurrent: 2, installmentTotal: 5, vendor: 'Amazon' })
  })

  it('estilo Itaú/Bradesco: data dd/mm, parcela "05/10" antes do valor, crédito com "-" no fim, cartão "final"', () => {
    const st = parseStatementText(`Itaú Unibanco - Itaucard
Vencimento 10/09/2026   Total desta fatura R$ 300,40
Cartão final 4321
02/08 PADARIA SAO JOSE 25,00
05/04 LOJA DE MOVEIS 05/10 150,00
09/08 DEVOLUCAO LOJA X 30,00-
15/08 POSTO SHELL 155,40`)
    expect(st.issuer).toBe('itau')
    expect(st.statedTotal).toBe(300.4)
    expect(st.lines.map((l) => [l.date, l.amount, l.isCredit])).toEqual([
      ['2026-08-02', 25, false], ['2026-04-05', 150, false], ['2026-08-09', 30, true], ['2026-08-15', 155.4, false],
    ])
    expect(st.lines[1]).toMatchObject({ installmentCurrent: 5, installmentTotal: 10, card: '****4321' })
  })

  it('OFX: negativo é compra, positivo é pagamento/estorno', () => {
    const st = parseOfx(`OFXHEADER:100
<OFX><CREDITCARDMSGSRSV1><CCSTMTTRNRS><CCSTMTRS><CCACCTFROM><ACCTID>1234567890123456</CCACCTFROM>
<BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260810120000[-3:BRT]<TRNAMT>-39.75<MEMO>MERCADOLIVRE Parcela 1/6</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260820<TRNAMT>238.40<MEMO>ESTORNO MERCADOLIVRE</STMTTRN>
</BANKTRANLIST></CCSTMTRS></CCSTMTTRNRS></CREDITCARDMSGSRSV1></OFX>`, 'h')
    expect(st.source).toBe('ofx')
    expect(st.lines.map((l) => [l.date, l.amount, l.isCredit, l.installmentTotal])).toEqual([
      ['2026-08-10', 39.75, false, 6], ['2026-08-20', 238.4, true, null],
    ])
    expect(st.lines[0].card).toBe('****3456')
  })

  it('CSV do Nubank (positivo = gasto) e CSV com ";" e vírgula decimal (negativo = gasto)', () => {
    const nu = parseCsv(`date,title,amount
2026-08-10,Padaria Carmelina,38.70
2026-08-20,Pagamento recebido,-1500.00
2026-08-22,Uber *Trip,15.90`, 'h')!
    expect(nu.lines.map((l) => [l.amount, l.isCredit, l.kind])).toEqual([[38.7, false, 'purchase'], [1500, true, 'payment'], [15.9, false, 'purchase']])
    const br = parseCsv(`Data;Lançamento;Valor
10/08/2026;PADARIA;-38,70
11/08/2026;MERCADO;-1.234,50
12/08/2026;ESTORNO MERCADO;100,00`, 'h')!
    expect(br.lines.map((l) => [l.date, l.amount, l.isCredit])).toEqual([
      ['2026-08-10', 38.7, false], ['2026-08-11', 1234.5, false], ['2026-08-12', 100, true],
    ])
  })

  it('confirmação de leitura por IA só aceita a prévia do mesmo arquivo', () => {
    const buf = Buffer.from('%PDF-1.4 conteudo')
    const preview = { sha256: fileSha256(buf), issuer: 'x', issuerName: 'X', dueDate: '2026-09-15', lines: [
      { date: '2026-08-10', description: 'LOJA (Parcela 1 de 3)', amount: 50, isCredit: false, kind: 'purchase' },
      { date: 'lixo', description: 'x', amount: 1 },
    ] }
    const st = statementFromPreview(preview, buf)!
    expect(st.lines).toHaveLength(1)
    expect(st.lines[0]).toMatchObject({ installmentCurrent: 1, installmentTotal: 3 })
    expect(st.source).toBe('ai')
    expect(statementFromPreview(preview, Buffer.from('%PDF outro'))).toBeNull()
  })

  it('reconhece PDF com centenas de KB de zeros antes do cabeçalho (download do Inter / AirDrop)', () => {
    const padded = Buffer.concat([Buffer.alloc(435_481), Buffer.from('%PDF-1.7 ...')])
    expect(pdfStart(padded)).toBe(435_481)
    expect(pdfStart(Buffer.concat([Buffer.from('texto qualquer '.repeat(100)), Buffer.from('%PDF')]))).toBe(-1)
  })
})

describe('conferência da leitura por IA', () => {
  it('avisa quando a IA junta créditos repetidos e ignora o total inventado', async () => {
    const { crossCheckAi } = await import('./parseStatement')
    const code = parseStatementText(`Vencimento 15/08/2026
10 de jul. 2026 LOJA X - R$ 100,00
11 de jul. 2026 LOJA X - + R$ 50,00
11 de jul. 2026 LOJA X - + R$ 50,00`)
    const ai = { ...code, source: 'ai' as const, lines: code.lines.slice(0, 2), statedTotal: 14620, warnings: [] }
    const checked = crossCheckAi(ai, code)
    expect(checked.warnings![0]).toMatch(/NÃO confere.*IA leu 2.*código leu 3/)
    expect(checked.statedTotal).toBeNull()
  })
})

describe('OCR da Apple', () => {
  it('remonta as linhas a partir dos trechos reconhecidos e o traço lido como "•" vira "-"', async () => {
    const { ocrPagesToText } = await import('./appleOcr')
    const text = ocrPagesToText([[
      { s: 'R$ 38,70', x: 0.8, y: 0.700, w: 0.1, h: 0.012 },
      { s: '10 de ago. 2026', x: 0.05, y: 0.702, w: 0.15, h: 0.012 },
      { s: 'PADARIA EXEMPLO', x: 0.25, y: 0.699, w: 0.2, h: 0.012 },
      { s: '•', x: 0.7, y: 0.701, w: 0.01, h: 0.012 },
      { s: 'Vencimento 15/09/2026', x: 0.05, y: 0.9, w: 0.3, h: 0.012 },
    ]])
    expect(text.split('\n')).toEqual(['Vencimento 15/09/2026', '10 de ago. 2026 PADARIA EXEMPLO • R$ 38,70'])
    const st = parseStatementText(text)
    expect(st.lines[0]).toMatchObject({ date: '2026-08-10', amount: 38.7, isCredit: false, vendor: 'Padaria Exemplo' })
  })
})
