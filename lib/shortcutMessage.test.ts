import { describe, it, expect } from 'vitest'
import { shortcutSuccessMessage, shortcutErrorMessage } from './shortcutMessage'

const nbsp = (s: string) => s.replace(/ /g, ' ')

describe('mensagem do atalho', () => {
  it('gasto à vista com total do mês', () => {
    const m = shortcutSuccessMessage(
      { type: 'expense', total: 45.9, vendor: 'Mercado', category: 'Mercado', date: '2026-11-11' },
      { accountName: 'Cartão Inter', today: '2026-11-11', monthTotal: { month: '2026-11', total: 3533 } },
    )
    expect(nbsp(m)).toBe('✓ Mercado · R$ 45,90\nCartão Inter\nNovembro: R$ 3.533,00 em gastos')
  })

  it('parcelado, outra data e categoria diferente da loja', () => {
    const m = shortcutSuccessMessage(
      { type: 'expense', total: 300, vendor: 'Magalu', category: 'Compras', date: '2026-11-09', installment_total: 3, installment_amount: 100 },
      { accountName: 'Cartão Inter', today: '2026-11-11' },
    )
    expect(nbsp(m)).toBe('✓ Magalu · 3x de R$ 100,00\nCartão Inter · Compras · dia 09/11')
  })

  it('entrada não mostra total de gastos', () => {
    const m = shortcutSuccessMessage(
      { type: 'income', total: 500, vendor: 'Freela', category: 'Renda extra', date: '2026-11-11' },
      { accountName: 'PIX', today: '2026-11-11', monthTotal: { month: '2026-11', total: 10 } },
    )
    expect(nbsp(m)).toBe('✓ Freela · + R$ 500,00\nPIX · Renda extra')
  })

  it('erro com exemplo', () => {
    expect(shortcutErrorMessage('Não consegui identificar o valor.')).toBe(
      '⚠️ Não lançado\nNão consegui identificar o valor.\nEx.: "mercado 45,90" ou "recebi 500 freela"',
    )
    expect(shortcutErrorMessage('Token inválido')).toBe('⚠️ Não lançado\nToken inválido')
  })
})
