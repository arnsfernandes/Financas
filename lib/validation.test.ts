import { describe, it, expect } from 'vitest'
import { validateReceipt } from './validation'
import type { Receipt } from './schema'

describe('Deterministic Receipt Validation', () => {
  const validReceipt: Receipt = {
    type: 'expense',
    vendor: 'Supermercado Central',
    date: '2026-09-22',
    total: 50.0,
    category: 'Mercado / Supermercado',
    currency: 'BRL',
    items: [
      { description: 'Arroz 5kg', quantity: 1, unit_price: 30.0, total: 30.0 },
      { description: 'Feijão 1kg', quantity: 2, unit_price: 10.0, total: 20.0 },
    ],
    vendor_address: null,
    time: null,
    subtotal: null,
    tax: null,
    tip: null,
    payment_method: null,
    notes: null,
    is_recurring: false,
    installment_total: null,
  }

  it('marks a well-formed receipt as confirmed with no reasons', () => {
    const result = validateReceipt(validReceipt)
    expect(result.reviewStatus).toBe('confirmed')
    expect(result.reviewReasons).toHaveLength(0)
  })

  it('flags missing total or total <= 0', () => {
    const noTotal = { ...validReceipt, total: null }
    const res1 = validateReceipt(noTotal)
    expect(res1.reviewStatus).toBe('needs_review')
    expect(res1.reviewReasons).toContain('Total da transação ausente.')

    const zeroTotal = { ...validReceipt, total: 0 }
    const res2 = validateReceipt(zeroTotal)
    expect(res2.reviewStatus).toBe('needs_review')
    expect(res2.reviewReasons).toContain('Valor total da transação deve ser maior que zero.')
  })

  it('flags missing vendor / payer', () => {
    const noVendor = { ...validReceipt, vendor: null }
    const result = validateReceipt(noVendor)
    expect(result.reviewStatus).toBe('needs_review')
    expect(result.reviewReasons).toContain('Estabelecimento ou fonte pagadora não identificado.')
  })

  it('flags missing or invalid date', () => {
    const noDate = { ...validReceipt, date: null }
    const res1 = validateReceipt(noDate)
    expect(res1.reviewStatus).toBe('needs_review')
    expect(res1.reviewReasons).toContain('Data da transação ausente.')

    const invalidDate = { ...validReceipt, date: '22/09/2026' }
    const res2 = validateReceipt(invalidDate)
    expect(res2.reviewStatus).toBe('needs_review')
    expect(res2.reviewReasons).toContain('Formato de data inválido.')
  })

  it('flags missing category', () => {
    const noCat = { ...validReceipt, category: null }
    const result = validateReceipt(noCat)
    expect(result.reviewStatus).toBe('needs_review')
    expect(result.reviewReasons).toContain('Categoria da transação não informada.')
  })

  it('accepts items with effective unit price where quantity * effective_unit_price ≈ net_total', () => {
    const discountedReceipt: Receipt = {
      ...validReceipt,
      total: 45.0,
      items: [
        // 2 unidades a R$ 7.50 efetivo após desconto = R$ 15.00 líquido
        { description: 'Feijão Carioca', quantity: 2, unit_price: 7.5, total: 15.0 },
        // 1 * 30 = 30
        { description: 'Arroz 5kg', quantity: 1, unit_price: 30.0, total: 30.0 },
      ],
    }
    const result = validateReceipt(discountedReceipt)
    expect(result.reviewStatus).toBe('confirmed')
    expect(result.reviewReasons).toHaveLength(0)
  })

  it('flags item when quantity * effective_unit_price diverges from net total', () => {
    const invalidItem: Receipt = {
      ...validReceipt,
      total: 60.0,
      items: [
        // 2 * 10 = 20, but item.total is written as 25
        { description: 'Feijão Carioca', quantity: 2, unit_price: 10.0, total: 25.0 },
        { description: 'Arroz', quantity: 1, unit_price: 35.0, total: 35.0 },
      ],
    }
    const result = validateReceipt(invalidItem)
    expect(result.reviewStatus).toBe('needs_review')
    expect(result.reviewReasons.some((r) => r.includes('multiplicação'))).toBe(true)
  })

  it('flags sum of items divergent from transaction total', () => {
    const sumMismatch: Receipt = {
      ...validReceipt,
      total: 60.0, // items sum to 50
    }
    const result = validateReceipt(sumMismatch)
    expect(result.reviewStatus).toBe('needs_review')
    expect(result.reviewReasons.some((r) => r.includes('Soma dos itens'))).toBe(true)
  })

  it('flags installment inconsistencies (e.g. current > total or total <= 1)', () => {
    const invalidCurrent: Receipt = {
      ...validReceipt,
      installment_total: 3,
      installment_current: 5,
    }
    const res1 = validateReceipt(invalidCurrent)
    expect(res1.reviewStatus).toBe('needs_review')
    expect(res1.reviewReasons.some((r) => r.includes('Parcela atual (5) é inválida'))).toBe(true)

    const invalidTotal: Receipt = {
      ...validReceipt,
      installment_total: 1,
    }
    const res2 = validateReceipt(invalidTotal)
    expect(res2.reviewStatus).toBe('needs_review')
    expect(res2.reviewReasons).toContain('Número total de parcelas deve ser maior que 1.')
  })

  it('allows valid optional fields to be absent without falsely triggering needs_review', () => {
    const minimalValidReceipt: Receipt = {
      type: 'expense',
      vendor: 'Posto Ipiranga',
      date: '2026-09-22',
      total: 100.0,
      category: 'Transporte & Combustível',
      items: [], // no items
      vendor_address: null,
      time: null,
      subtotal: null,
      tax: null,
      tip: null,
      payment_method: null,
      notes: null,
    }
    const result = validateReceipt(minimalValidReceipt)
    expect(result.reviewStatus).toBe('confirmed')
    expect(result.reviewReasons).toHaveLength(0)
  })
})
