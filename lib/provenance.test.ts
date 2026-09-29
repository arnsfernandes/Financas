import { describe, it, expect, vi, beforeEach } from 'vitest'
import { save, setSupabaseClientForTesting } from './persist'
import { processReceipt, processTextExpense, processBatch } from './pipeline'
import { getTransactionById, updateTransaction } from './queries'
import type { Receipt } from './schema'

describe('Transaction Provenance & Traceability', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    setSupabaseClientForTesting(null)
  })

  describe('save() provenance metadata', () => {
    it('sets image origin, filename, hash, and snapshot of original extracted data', async () => {
      let insertedRow: any = null
      const mockSupabase: any = {
        from: (table: string) => {
          if (table === 'transactions') {
            return {
              select: () => ({
                eq: () => ({ limit: () => ({ data: [], error: null }) }),
              }),
              insert: vi.fn().mockImplementation((rows: any) => {
                insertedRow = Array.isArray(rows) ? rows[0] : rows
                return { error: null }
              }),
            }
          }
          if (table === 'canonical_vendors') {
            return {
              select: () => ({
                eq: () => ({ single: () => ({ data: null, error: null }) }),
                or: () => ({ data: [], error: null }),
              }),
              insert: () => ({ select: () => ({ single: () => ({ data: { id: 'v-1' }, error: null }) }) }),
            }
          }
          if (table === 'transaction_items') {
            return {
              insert: vi.fn().mockResolvedValue({ error: null }),
            }
          }
          return {}
        },
      }

      setSupabaseClientForTesting(mockSupabase)

      const receipt: Receipt = {
        type: 'expense',
        vendor: 'Supermercado Dia',
        vendor_address: null,
        date: '2026-09-23',
        time: '10:30',
        currency: 'BRL',
        category: 'Groceries',
        subtotal: 50,
        tax: 0,
        tip: 0,
        total: 50,
        payment_method: 'Cartão',
        notes: null,
        items: [
          { description: 'Arroz 5kg', quantity: 1, unit_price: 25, total: 25, category: 'Alimentos' },
          { description: 'Feijão 1kg', quantity: 2, unit_price: 12.5, total: 25, category: 'Alimentos' },
        ],
      }

      const stored = await save({
        receipt,
        imageKey: 'r2/receipt-123.jpg',
        imageSha256: 'sha256-hash-abc-123',
        sourceType: 'image',
        originType: 'image',
        originalFilename: 'cupom_fiscal_dia.jpg',
        allowDuplicate: true,
      })

      expect(stored.origin_type).toBe('image')
      expect(stored.original_filename).toBe('cupom_fiscal_dia.jpg')
      expect(stored.image_sha256).toBe('sha256-hash-abc-123')
      expect(stored.captured_at).toBeDefined()
      expect(stored.original_extracted_data).toBeDefined()
      expect(stored.original_extracted_data?.vendor).toBe('Supermercado Dia')
      expect(stored.original_extracted_data?.total).toBe(50)

      expect(insertedRow).not.toBeNull()
      expect(insertedRow.origin_type).toBe('image')
      expect(insertedRow.original_filename).toBe('cupom_fiscal_dia.jpg')
      expect(insertedRow.image_sha256).toBe('sha256-hash-abc-123')
      expect(insertedRow.raw_text).toBeNull()
      expect(insertedRow.original_extracted_data.vendor).toBe('Supermercado Dia')
      expect(insertedRow.original_extracted_data.items).toHaveLength(2)
    })

    it('sets text origin, stores raw_text, and does not require image_sha256', async () => {
      let insertedRow: any = null
      const mockSupabase: any = {
        from: (table: string) => {
          if (table === 'transactions') {
            return {
              select: () => ({
                eq: () => ({ limit: () => ({ data: [], error: null }) }),
              }),
              insert: vi.fn().mockImplementation((rows: any) => {
                insertedRow = Array.isArray(rows) ? rows[0] : rows
                return { error: null }
              }),
            }
          }
          if (table === 'canonical_vendors') {
            return {
              select: () => ({
                eq: () => ({ single: () => ({ data: null, error: null }) }),
                or: () => ({ data: [], error: null }),
              }),
              insert: () => ({ select: () => ({ single: () => ({ data: { id: 'v-1' }, error: null }) }) }),
            }
          }
          return {}
        },
      }

      setSupabaseClientForTesting(mockSupabase)

      const receipt: Receipt = {
        type: 'income',
        vendor: 'Freelance Design',
        vendor_address: null,
        date: '2026-09-23',
        time: null,
        currency: 'BRL',
        category: 'Freelance',
        subtotal: 1200,
        tax: 0,
        tip: 0,
        total: 1200,
        payment_method: 'Pix',
        notes: null,
        items: [],
      }

      const rawText = 'Recebi 1200 reais de freela de design via pix'
      const stored = await save({
        receipt,
        imageKey: null,
        imageSha256: null,
        sourceType: 'text',
        originType: 'text',
        rawText,
        allowDuplicate: true,
      })

      expect(stored.origin_type).toBe('text')
      expect(stored.raw_text).toBe(rawText)
      expect(stored.original_filename).toBeNull()
      expect(stored.image_sha256).toBeNull()

      expect(insertedRow.origin_type).toBe('text')
      expect(insertedRow.raw_text).toBe(rawText)
      expect(insertedRow.original_filename).toBeNull()
      expect(insertedRow.original_extracted_data.total).toBe(1200)
    })
  })

  describe('updateTransaction() provenance preservation', () => {
    it('does not overwrite origin_type, raw_text, original_filename, captured_at, or original_extracted_data when editing', async () => {
      let updatedPayload: any = null
      const mockExistingTx = {
        id: 'tx-orig-1',
        vendor: 'Padaria Original',
        total: 20,
        date: '2026-09-20',
        origin_type: 'image',
        original_filename: 'recibo_padaria.png',
        image_sha256: 'hash-padaria-999',
        raw_text: null,
        captured_at: '2026-09-20T14:00:00Z',
        original_extracted_data: {
          vendor: 'Padaria Original',
          total: 20,
          date: '2026-09-20',
          items: [{ description: 'Pão de Queijo', total: 20 }],
        },
        transaction_items: [],
      }

      const mockSupabase: any = {
        from: (table: string) => {
          if (table === 'transactions') {
            return {
              update: vi.fn().mockImplementation((payload: any) => {
                updatedPayload = payload
                return {
                  eq: vi.fn().mockResolvedValue({ error: null }),
                }
              }),
              select: () => ({
                eq: () => ({
                  single: () => ({
                    data: {
                      ...mockExistingTx,
                      ...updatedPayload,
                    },
                    error: null,
                  }),
                }),
              }),
            }
          }
          if (table === 'canonical_vendors') {
            return {
              select: () => ({
                eq: () => ({ single: () => ({ data: null, error: null }) }),
                or: () => ({ data: [], error: null }),
              }),
              insert: () => ({ select: () => ({ single: () => ({ data: { id: 'v-1' }, error: null }) }) }),
            }
          }
          return {}
        },
      }

      setSupabaseClientForTesting(mockSupabase)

      const result = await updateTransaction('tx-orig-1', {
        vendor: 'Padaria Real Corrigida',
        total: 25,
        category: 'Alimentação',
      })

      // The update payload sent to database must NOT touch origin fields
      expect(updatedPayload).not.toHaveProperty('origin_type')
      expect(updatedPayload).not.toHaveProperty('raw_text')
      expect(updatedPayload).not.toHaveProperty('original_filename')
      expect(updatedPayload).not.toHaveProperty('captured_at')
      expect(updatedPayload).not.toHaveProperty('original_extracted_data')
      expect(updatedPayload).not.toHaveProperty('image_sha256')

      // The returned transaction retains all historical provenance
      expect(result.vendor).toBe('Padaria Real Corrigida')
      expect(result.origin_type).toBe('image')
      expect(result.original_filename).toBe('recibo_padaria.png')
      expect(result.image_sha256).toBe('hash-padaria-999')
      expect(result.original_extracted_data.vendor).toBe('Padaria Original')
      expect(result.original_extracted_data.total).toBe(20)
    })
  })

  describe('getTransactionById()', () => {
    it('returns full provenance data along with transaction and items', async () => {
      const mockSupabase: any = {
        from: (table: string) => {
          if (table === 'transactions') {
            return {
              select: () => ({
                eq: (col: string, val: any) => ({
                  single: () => ({
                    data: {
                      id: val,
                      vendor: 'Posto Ipiranga',
                      total: 200,
                      origin_type: 'image',
                      original_filename: 'abastecimento.jpg',
                      image_sha256: 'sha-ipiranga-777',
                      captured_at: '2026-09-22T19:00:00Z',
                      raw_text: null,
                      original_extracted_data: { vendor: 'Posto Ipiranga', total: 200 },
                      transaction_items: [{ id: 'item-1', description: 'Gasolina Comum', total: 200 }],
                    },
                    error: null,
                  }),
                }),
              }),
            }
          }
          return {}
        },
      }

      setSupabaseClientForTesting(mockSupabase)

      const tx = await getTransactionById('tx-123')
      expect(tx).not.toBeNull()
      expect(tx?.vendor).toBe('Posto Ipiranga')
      expect(tx?.origin_type).toBe('image')
      expect(tx?.original_filename).toBe('abastecimento.jpg')
      expect(tx?.image_sha256).toBe('sha-ipiranga-777')
      expect(tx?.captured_at).toBe('2026-09-22T19:00:00Z')
      expect(tx?.original_extracted_data).toEqual({ vendor: 'Posto Ipiranga', total: 200 })
    })

    it('returns null if transaction does not exist', async () => {
      const mockSupabase: any = {
        from: () => ({
          select: () => ({
            eq: () => ({
              single: () => ({ data: null, error: { message: 'Not found' } }),
            }),
          }),
        }),
      }

      setSupabaseClientForTesting(mockSupabase)
      const tx = await getTransactionById('non-existent')
      expect(tx).toBeNull()
    })
  })
})
