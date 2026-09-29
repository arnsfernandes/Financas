import { describe, it, expect, vi, beforeEach } from 'vitest'
import { parseUserIntent, parsePreviewCorrection } from './intent'
import type { Receipt } from './schema'

describe('Intent Classification & Natural Language Queries (lib/intent.ts)', () => {
  it('classifies expense query by category ("quanto gastei com mercado este mês?")', async () => {
    const mockOpenAI: any = {
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    intent: 'query_expenses',
                    confidence: 0.95,
                    filters: {
                      category: 'Mercado',
                      vendor: null,
                      accountNameOrInstitution: null,
                      paymentMethod: null,
                      periodType: 'month',
                      startDate: null,
                      endDate: null,
                      limit: null,
                    },
                    clarificationMessage: null,
                  }),
                },
              },
            ],
          }),
        },
      },
    }

    const res = await parseUserIntent('quanto gastei com mercado este mês?', mockOpenAI)
    expect(res.intent).toBe('query_expenses')
    expect(res.filters?.category).toBe('Mercado')
    expect(res.filters?.periodType).toBe('month')
  })

  it('classifies invoice query for a bank ("qual a fatura do Inter?")', async () => {
    const mockOpenAI: any = {
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    intent: 'query_invoice',
                    confidence: 0.98,
                    filters: {
                      category: null,
                      vendor: null,
                      accountNameOrInstitution: 'Inter',
                      paymentMethod: null,
                      periodType: 'month',
                      startDate: null,
                      endDate: null,
                      limit: null,
                    },
                    clarificationMessage: null,
                  }),
                },
              },
            ],
          }),
        },
      },
    }

    const res = await parseUserIntent('qual a fatura do Inter?', mockOpenAI)
    expect(res.intent).toBe('query_invoice')
    expect(res.filters?.accountNameOrInstitution).toBe('Inter')
  })

  it('classifies balance query ("qual meu saldo?")', async () => {
    const mockOpenAI: any = {
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    intent: 'query_balance',
                    confidence: 0.95,
                    filters: {
                      category: null,
                      vendor: null,
                      accountNameOrInstitution: null,
                      paymentMethod: null,
                      periodType: null,
                      startDate: null,
                      endDate: null,
                      limit: null,
                    },
                    clarificationMessage: null,
                  }),
                },
              },
            ],
          }),
        },
      },
    }

    const res = await parseUserIntent('qual o meu saldo?', mockOpenAI)
    expect(res.intent).toBe('query_balance')
  })

  it('asks for clarification on ambiguous input ("mercado")', async () => {
    const mockOpenAI: any = {
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    intent: 'clarification',
                    confidence: 0.4,
                    filters: {
                      category: 'Mercado',
                      vendor: null,
                      accountNameOrInstitution: null,
                      paymentMethod: null,
                      periodType: null,
                      startDate: null,
                      endDate: null,
                      limit: null,
                    },
                    clarificationMessage: 'Você deseja consultar seus gastos na categoria Mercado ou registrar um novo lançamento?',
                  }),
                },
              },
            ],
          }),
        },
      },
    }

    const res = await parseUserIntent('mercado', mockOpenAI)
    expect(res.intent).toBe('clarification')
    expect(res.clarificationMessage).toContain('Mercado')
  })
})

describe('Preview Correction (lib/intent.ts)', () => {
  const initialReceipt: Receipt = {
    type: 'expense',
    vendor: 'Padaria Real',
    vendor_address: null,
    date: '2026-09-25',
    time: '10:00',
    currency: 'BRL',
    category: 'Alimentação',
    subtotal: 50,
    tax: 0,
    tip: 0,
    total: 50,
    payment_method: null,
    notes: null,
    items: [],
  }

  it('updates payment method when user types "foi no Pix"', async () => {
    const mockOpenAI: any = {
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    total: null,
                    vendor: null,
                    category: null,
                    payment_method: 'Pix',
                    date: null,
                    account_name_or_institution: null,
                    type: null,
                    installment_total: null,
                    is_recurring: null,
                    notes: null,
                    changed_fields: ['payment_method'],
                  }),
                },
              },
            ],
          }),
        },
      },
    }

    const res = await parsePreviewCorrection(initialReceipt, 'foi no Pix', mockOpenAI)
    expect(res.changedFields).toContain('payment_method')
    expect(res.updatedReceipt.payment_method).toBe('Pix')
    expect(res.updatedReceipt.total).toBe(50)
  })

  it('updates total when user types "o valor foi 85"', async () => {
    const mockOpenAI: any = {
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    total: 85,
                    vendor: null,
                    category: null,
                    payment_method: null,
                    date: null,
                    account_name_or_institution: null,
                    type: null,
                    installment_total: null,
                    is_recurring: null,
                    notes: null,
                    changed_fields: ['total'],
                  }),
                },
              },
            ],
          }),
        },
      },
    }

    const res = await parsePreviewCorrection(initialReceipt, 'o valor foi 85', mockOpenAI)
    expect(res.changedFields).toContain('total')
    expect(res.updatedReceipt.total).toBe(85)
  })
})
