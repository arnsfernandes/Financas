import { describe, expect, it } from 'vitest'
import { isBankStatementText, parseBankStatementText, paymentMethodOf } from './bankStatement'

const EXTRATO = `Solicitado em: 10/11/2026 - 14h22
FULANO DE TAL SILVA
Período: 13/08/2026 a 10/11/2026
14 de Agosto de 2026 Saldo do dia: R$ 172,70 Valor Saldo por transação
Pix enviado: "Cp :10573521-SUPERMERCADO BOM PRECO LTDA" -R$ 80,00 -R$ 567,62
Pix recebido: "Cp :00000000-MARIA SOUZA" R$ 710,32 R$ 142,70
Pix enviado: "Cp :00000000-JOSE DA SILVA" -R$ 40,00 R$ 102,70
15 de Agosto de 2026 Saldo do dia: R$ 123,01
Pagamento efetuado: "Pagamento fatura cartao Inter" -R$ 667,00 R$ 864,29
Pagamento efetuado: "NEOENERGIA ELEKTRO" -R$ 120,00 R$ 744,29
Aplicacao: "CDB Porq Obj BANCO INTER S A" -R$ 650,00 -R$ 526,21
Pix recebido: "Cp :22896431-Fulano De Tal Silva" R$ 529,54 R$ 1.393,83
Pix enviado: "Cp :60701190-LOJA X COMERCIO LTDA" -R$ 57,00 R$ 1.336,83
Pix enviado devolvido: "Cp :60701190-LOJA X COMERCIO LTDA" R$ 57,00 R$ 1.393,83
Pix enviado: "Cp :14796606-UBER DO BRASIL TECNOLOGIA LTDA -R$ 10,24 -R$ 1,32`

describe('extrato da conta', () => {
  it('separa gasto em estabelecimento, pessoa, fatura, transferência própria, investimento, entrada e Pix devolvido', () => {
    expect(isBankStatementText(EXTRATO)).toBe(true)
    const st = parseBankStatementText(EXTRATO)
    expect(st.from).toBe('2026-08-13')
    expect(st.lines.map((l) => [l.date, l.kind, l.amount])).toEqual([
      ['2026-08-14', 'gasto', -80], ['2026-08-14', 'entrada', 710.32], ['2026-08-14', 'pessoa', -40],
      ['2026-08-15', 'fatura', -667], ['2026-08-15', 'gasto', -120], ['2026-08-15', 'investimento', -650],
      ['2026-08-15', 'transferencia', 529.54], ['2026-08-15', 'estorno_pix', -57], ['2026-08-15', 'estorno_pix', 57],
      ['2026-08-15', 'gasto', -10.24], // linha com aspas quebradas no PDF
    ])
    expect(st.lines[0].category).toBe('Mercado')
    expect(st.lines[4].category).toBe('Moradia')
    expect(st.lines[9].category).toBe('Transporte')
    expect(paymentMethodOf('Pagamento efetuado')).toBe('Boleto')
    expect(paymentMethodOf('Pix enviado')).toBe('Pix')
  })
  it('fatura de cartão não é confundida com extrato', () => {
    expect(isBankStatementText('04 de abr. 2026 AUTOZONE (Parcela 05 de 10) - R$ 54,69\nDespesas do mês R$ 10,00')).toBe(false)
  })
})

describe('instituições de pagamento', () => {
  it('Pix para Mercado Pago ou Wise fica sem categoria (para o usuário decidir); Shopee via instituição continua Compras', () => {
    const st = parseBankStatementText(`ZE DA SILVA
14 de Agosto de 2026 Saldo do dia: R$ 1,00
Pix enviado: "Cp :10573521-MERCADO PAGO INSTITUICAO DE PAGAMENTO LTDA" -R$ 802,73 -R$ 567,62
Pix enviado: "Cp :1-Wise Brasil Instituicao de Pagamento Ltda" -R$ 250,00 -R$ 1,00
Pix enviado: "Cp :90400888-SHPP BRASIL INSTITUICAO DE PAG" -R$ 104,41 -R$ 8,32`)
    expect(st.lines.map((l) => [l.kind, l.category])).toEqual([['gasto', null], ['gasto', null], ['gasto', 'Compras']])
  })
})
