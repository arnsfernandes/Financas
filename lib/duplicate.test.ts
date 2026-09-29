import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  detectDuplicateTransaction,
  normalizeVendor,
  areItemsMatching,
} from './duplicate'
import { save, setSupabaseClientForTesting, DuplicateTransactionError } from './persist'
import type { Receipt } from './schema'

describe('Duplicate Transaction Detection', () => {
  describe('Utility Functions', () => {
    it('normalizes vendor names consistently', () => {
      expect(normalizeVendor('Carrefour Express - Loja 12')).toBe('carrefour express loja 12')
      expect(normalizeVendor('PÃO DE AÇÚCAR')).toBe('pao de acucar')
      expect(normalizeVendor('  Mcdonald\'s!  ')).toBe('mcdonald s')
      expect(normalizeVendor(null)).toBe('')
    })

    it('matches item lists correctly regardless of ordering', () => {
      const itemsA = [
        { description: 'COCA COLA 2L', total: 10, quantity: 1 },
        { description: 'ARROZ TIO JOAO 5KG', total: 25, quantity: 1 },
      ]
      const itemsB = [
        { description: 'Arroz Tio João 5kg', total: 25, quantity: 1 },
        { description: 'Coca Cola 2L', total: 10, quantity: 1 },
      ]
      expect(areItemsMatching(itemsA, itemsB)).toBe(true)

      const itemsC = [
        { description: 'FEIJAO CARIOCA', total: 8, quantity: 1 },
      ]
      expect(areItemsMatching(itemsA, itemsC)).toBe(false)
    })
  })

  describe('detectDuplicateTransaction rules', () => {
    it('detects exact duplicate by image_sha256 (same receipt scanned twice)', async () => {
      const mockSupabase: any = {
        from: (table: string) => {
          if (table === 'transactions') {
            return {
              select: () => ({
                eq: (col: string, val: any) => {
                  if (col === 'image_sha256' && val === 'sha256-existing-hash') {
                    return {
                      limit: () => ({
                        data: [
                          {
                            id: 'tx-existing-1',
                            date: '2026-09-20',
                            vendor: 'Carrefour Express',
                            total: 54.9,
                            type: 'expense',
                            image_sha256: 'sha256-existing-hash',
                          },
                        ],
                        error: null,
                      }),
                    }
                  }
                  return { limit: () => ({ data: [], error: null }) }
                },
              }),
            }
          }
          return {}
        },
      }

      const receipt: Receipt = {
        type: 'expense',
        vendor: 'Carrefour Express',
        date: '2026-09-20',
        total: 54.9,
        currency: 'BRL',
        items: [],
        vendor_address: null,
        time: null,
        category: null,
        subtotal: null,
        tax: null,
        tip: null,
        payment_method: null,
        notes: null,
      }

      const res = await detectDuplicateTransaction(
        { receipt, imageSha256: 'sha256-existing-hash', sourceType: 'image' },
        mockSupabase
      )

      expect(res.isDuplicate).toBe(true)
      expect(res.type).toBe('exact')
      expect(res.existingTransaction?.id).toBe('tx-existing-1')
    })

    it('detects exact duplicate when date, vendor, total and items match', async () => {
      const mockSupabase: any = {
        from: (table: string) => {
          if (table === 'transactions') {
            return {
              select: () => ({
                eq: () => ({
                  gte: () => ({
                    lte: () => ({
                      or: () => ({
                        data: [
                          {
                            id: 'tx-existing-2',
                            date: '2026-09-22',
                            vendor: 'Supermercado Dia',
                            total: 35.0,
                            type: 'expense',
                            transaction_items: [
                              { description: 'Pão de Forma', total: 10, quantity: 1 },
                              { description: 'Manteiga Extra', total: 25, quantity: 1 },
                            ],
                          },
                        ],
                        error: null,
                      }),
                    }),
                  }),
                }),
              }),
            }
          }
          return {}
        },
      }

      const receipt: Receipt = {
        type: 'expense',
        vendor: 'Supermercado Dia',
        date: '2026-09-22',
        total: 35.0,
        currency: 'BRL',
        items: [
          { description: 'PAO DE FORMA', total: 10, quantity: 1, unit_price: 10 },
          { description: 'MANTEIGA EXTRA', total: 25, quantity: 1, unit_price: 25 },
        ],
        vendor_address: null,
        time: null,
        category: null,
        subtotal: null,
        tax: null,
        tip: null,
        payment_method: null,
        notes: null,
      }

      const res = await detectDuplicateTransaction(
        { receipt, imageSha256: 'different-sha', sourceType: 'image' },
        mockSupabase
      )

      expect(res.isDuplicate).toBe(true)
      expect(res.type).toBe('exact')
      expect(res.existingTransaction?.id).toBe('tx-existing-2')
    })

    it('detects probable duplicate when date, vendor and total match without explicit item breakdown', async () => {
      const mockSupabase: any = {
        from: (table: string) => {
          if (table === 'transactions') {
            return {
              select: () => ({
                eq: () => ({
                  gte: () => ({
                    lte: () => ({
                      or: () => ({
                        data: [
                          {
                            id: 'tx-existing-3',
                            date: '2026-09-22',
                            vendor: 'Restaurante Sabor',
                            total: 45.0,
                            type: 'expense',
                            transaction_items: [],
                          },
                        ],
                        error: null,
                      }),
                    }),
                  }),
                }),
              }),
            }
          }
          return {}
        },
      }

      const receipt: Receipt = {
        type: 'expense',
        vendor: 'Restaurante Sabor',
        date: '2026-09-22',
        total: 45.0,
        currency: 'BRL',
        items: [],
        vendor_address: null,
        time: null,
        category: null,
        subtotal: null,
        tax: null,
        tip: null,
        payment_method: null,
        notes: null,
      }

      const res = await detectDuplicateTransaction(
        { receipt, sourceType: 'text' },
        mockSupabase
      )

      expect(res.isDuplicate).toBe(true)
      expect(res.type).toBe('probable')
      expect(res.existingTransaction?.id).toBe('tx-existing-3')
    })

    it('does not block legitimate similar transactions with different items on the same day', async () => {
      const mockSupabase: any = {
        from: (table: string) => {
          if (table === 'transactions') {
            return {
              select: () => ({
                eq: () => ({
                  gte: () => ({
                    lte: () => ({
                      or: () => ({
                        data: [
                          {
                            id: 'tx-existing-morning',
                            date: '2026-09-22',
                            vendor: 'Padaria Central',
                            total: 20.0,
                            type: 'expense',
                            transaction_items: [
                              { description: 'Café com Leite e Pão na Chapa', total: 20, quantity: 1 },
                            ],
                          },
                        ],
                        error: null,
                      }),
                    }),
                  }),
                }),
              }),
            }
          }
          return {}
        },
      }

      // Afternoon purchase at same bakery, same total R$ 20, but completely different item
      const receipt: Receipt = {
        type: 'expense',
        vendor: 'Padaria Central',
        date: '2026-09-22',
        total: 20.0,
        currency: 'BRL',
        items: [
          { description: 'Bolo de Cenoura com Chocolate', total: 20, quantity: 1, unit_price: 20 },
        ],
        vendor_address: null,
        time: null,
        category: null,
        subtotal: null,
        tax: null,
        tip: null,
        payment_method: null,
        notes: null,
      }

      const res = await detectDuplicateTransaction(
        { receipt, sourceType: 'text' },
        mockSupabase
      )

      expect(res.isDuplicate).toBe(false)
      expect(res.type).toBe('none')
    })

    it('does not flag transactions with different totals or different dates', async () => {
      const mockSupabase: any = {
        from: (table: string) => {
          if (table === 'transactions') {
            return {
              select: () => ({
                eq: () => ({
                  gte: () => ({
                    lte: () => ({
                      or: () => ({
                        data: [],
                        error: null,
                      }),
                    }),
                  }),
                }),
              }),
            }
          }
          return {}
        },
      }

      const receipt: Receipt = {
        type: 'expense',
        vendor: 'Padaria Central',
        date: '2026-09-22',
        total: 50.0,
        currency: 'BRL',
        items: [],
        vendor_address: null,
        time: null,
        category: null,
        subtotal: null,
        tax: null,
        tip: null,
        payment_method: null,
        notes: null,
      }

      const res = await detectDuplicateTransaction(
        { receipt, sourceType: 'text' },
        mockSupabase
      )

      expect(res.isDuplicate).toBe(false)
      expect(res.type).toBe('none')
    })
  })

  describe('save() with duplicate validation and allowDuplicate bypass', () => {
    let mockSupabase: any
    let insertCalled = false

    beforeEach(() => {
      insertCalled = false
      mockSupabase = {
        from: (table: string) => {
          if (table === 'transactions') {
            return {
              select: () => ({
                eq: () => ({
                  limit: () => ({ data: [], error: null }),
                  gte: () => ({
                    lte: () => ({
                      or: () => ({
                        data: [
                          {
                            id: 'tx-dup-1',
                            date: '2026-09-22',
                            vendor: 'Posto Shell',
                            total: 150.0,
                            type: 'expense',
                            transaction_items: [],
                          },
                        ],
                        error: null,
                      }),
                    }),
                  }),
                }),
              }),
              insert: () => {
                insertCalled = true
                return { error: null }
              },
            }
          }
          return { insert: () => ({ error: null }) }
        },
      }
      setSupabaseClientForTesting(mockSupabase)
    })

    afterEach(() => {
      setSupabaseClientForTesting(null)
    })

    it('throws DuplicateTransactionError when duplicate is detected and allowDuplicate is false', async () => {
      const receipt: Receipt = {
        type: 'expense',
        vendor: 'Posto Shell',
        date: '2026-09-22',
        total: 150.0,
        currency: 'BRL',
        items: [],
        vendor_address: null,
        time: null,
        category: null,
        subtotal: null,
        tax: null,
        tip: null,
        payment_method: null,
        notes: null,
      }

      await expect(
        save({
          receipt,
          imageKey: null,
          imageSha256: null,
          sourceType: 'text',
          allowDuplicate: false,
        })
      ).rejects.toThrow(DuplicateTransactionError)

      expect(insertCalled).toBe(false)
    })

    it('persists successfully when allowDuplicate is true', async () => {
      const receipt: Receipt = {
        type: 'expense',
        vendor: 'Posto Shell',
        date: '2026-09-22',
        total: 150.0,
        currency: 'BRL',
        items: [],
        vendor_address: null,
        time: null,
        category: null,
        subtotal: null,
        tax: null,
        tip: null,
        payment_method: null,
        notes: null,
      }

      const result = await save({
        receipt,
        imageKey: null,
        imageSha256: null,
        sourceType: 'text',
        allowDuplicate: true,
      })

      expect(result).toBeDefined()
      expect(result.id).toBeDefined()
      expect(insertCalled).toBe(true)
    })
  })
})
