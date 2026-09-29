import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  processPendingRecurrences,
  resolveRecurrenceFrequency,
  resolveRecurrenceNextDate,
  resolveRecurrenceUpdate,
  projectRecurringTransactions,
  getUpcomingRecurringCommitments,
} from './recurrence'
import { computeNextRecurrenceDate } from './dateUtils'
import { setSupabaseClientForTesting } from './persist'

describe('Deterministic Real Recurrences', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    setSupabaseClientForTesting(null)
  })

  describe('computeNextRecurrenceDate', () => {
    it('advances monthly dates preserving day of month', () => {
      expect(computeNextRecurrenceDate('2026-09-23', 'monthly')).toBe('2026-10-23')
      expect(computeNextRecurrenceDate('2026-12-15', 'monthly')).toBe('2027-01-15')
    })

    it('clamps end-of-month days when advancing monthly', () => {
      expect(computeNextRecurrenceDate('2026-01-31', 'monthly')).toBe('2026-02-28')
      expect(computeNextRecurrenceDate('2026-03-31', 'monthly')).toBe('2026-04-30')
    })

    it('handles weekly and yearly frequencies', () => {
      expect(computeNextRecurrenceDate('2026-09-23', 'weekly')).toBe('2026-09-30')
      expect(computeNextRecurrenceDate('2026-09-23', 'yearly')).toBe('2027-09-23')
    })
  })

  describe('processPendingRecurrences()', () => {
    it('generates a single monthly cycle when next_date is due and advances next_date', async () => {
      const insertedRows: any[] = []
      const updatedRows: any[] = []

      const mockSupabase: any = {
        from: (table: string) => {
          if (table === 'transactions') {
            return {
              select: () => {
                const queryObj: any = {
                  eq: (col1: string, val1: any) => ({
                    eq: (col2: string, val2: any) => {
                      if (col1 === 'is_recurring' && val1 === true && col2 === 'recurrence_status' && val2 === 'active') {
                        return Promise.resolve({
                          data: [
                            {
                              id: 'parent-netflix-1',
                              account_id: 'acc-credit-1',
                              vendor: 'Netflix',
                              vendor_id: 'v-netflix',
                              category: 'Entretenimento',
                              total: 55.9,
                              currency: 'BRL',
                              type: 'expense',
                              payment_method: 'Cartão de Crédito',
                              notes: 'Assinatura mensal',
                              is_recurring: true,
                              recurrence_frequency: 'monthly',
                              recurrence_next_date: '2026-09-23',
                              recurrence_status: 'active',
                              date: '2026-08-23',
                              source_type: 'manual',
                              origin_type: 'manual',
                            },
                          ],
                          error: null,
                        })
                      }
                      return Promise.resolve({ data: [], error: null })
                    },
                  }),
                  or: () => ({
                    limit: () => Promise.resolve({ data: [], error: null }),
                  }),
                }
                return queryObj
              },
              insert: vi.fn().mockImplementation((row: any) => {
                insertedRows.push(row)
                return Promise.resolve({ error: null })
              }),
              update: vi.fn().mockImplementation((upd: any) => ({
                eq: (col: string, val: any) => {
                  updatedRows.push({ id: val, ...upd })
                  return Promise.resolve({ error: null })
                },
              })),
            }
          }
          return {}
        },
      }

      const result = await processPendingRecurrences({
        referenceDate: '2026-09-23',
        client: mockSupabase,
      })

      expect(result.processedCount).toBe(1)
      expect(result.generatedTransactions).toHaveLength(1)
      expect(insertedRows).toHaveLength(1)

      const generated = insertedRows[0]
      expect(generated.vendor).toBe('Netflix')
      expect(generated.total).toBe(55.9)
      expect(generated.date).toBe('2026-09-23')
      expect(generated.is_recurring).toBe(false)
      expect(generated.recurrence_parent_id).toBe('parent-netflix-1')
      expect(generated.recurrence_cycle_date).toBe('2026-09-23')
      expect(generated.notes).toContain('[Recorrência: parent-netflix-1 - 2026-09-23]')

      // Parent next date advanced to 2026-10-23
      expect(updatedRows).toHaveLength(1)
      expect(updatedRows[0].id).toBe('parent-netflix-1')
      expect(updatedRows[0].recurrence_next_date).toBe('2026-10-23')
    })

    it('catches up multiple overdue months when app was not opened for several cycles', async () => {
      const insertedRows: any[] = []
      const updatedRows: any[] = []

      const mockSupabase: any = {
        from: (table: string) => {
          if (table === 'transactions') {
            return {
              select: () => ({
                eq: (col1: string, val1: any) => ({
                  eq: (col2: string, val2: any) => {
                    if (col1 === 'is_recurring' && col2 === 'recurrence_status') {
                      return Promise.resolve({
                        data: [
                          {
                            id: 'parent-gym-1',
                            account_id: 'acc-bank-1',
                            vendor: 'Smart Fit',
                            total: 119.9,
                            type: 'expense',
                            category: 'Saúde',
                            is_recurring: true,
                            recurrence_frequency: 'monthly',
                            recurrence_next_date: '2026-06-10', // 4 overdue months: Jun 10, Jul 10, Aug 10, Sep 10 (today is 2026-09-23)
                            recurrence_status: 'active',
                            date: '2026-05-10',
                          },
                        ],
                        error: null,
                      })
                    }
                    return Promise.resolve({ data: [], error: null })
                  },
                }),
                or: () => ({
                  limit: () => Promise.resolve({ data: [], error: null }),
                }),
              }),
              insert: vi.fn().mockImplementation((row: any) => {
                insertedRows.push(row)
                return Promise.resolve({ error: null })
              }),
              update: vi.fn().mockImplementation((upd: any) => ({
                eq: (col: string, val: any) => {
                  updatedRows.push({ id: val, ...upd })
                  return Promise.resolve({ error: null })
                },
              })),
            }
          }
          return {}
        },
      }

      const result = await processPendingRecurrences({
        referenceDate: '2026-09-23',
        client: mockSupabase,
      })

      // 4 cycles: 2026-06-10, 2026-07-10, 2026-08-10, 2026-09-10
      expect(result.processedCount).toBe(4)
      expect(insertedRows).toHaveLength(4)
      expect(insertedRows.map((r) => r.date)).toEqual([
        '2026-06-10',
        '2026-07-10',
        '2026-08-10',
        '2026-09-10',
      ])

      // Next date should be 2026-10-10 (which is > 2026-09-23)
      expect(updatedRows[0].recurrence_next_date).toBe('2026-10-10')
    })

    it('respects recurrence_status = ended and does not generate transactions', async () => {
      const insertedRows: any[] = []

      const mockSupabase: any = {
        from: (table: string) => {
          if (table === 'transactions') {
            return {
              select: () => ({
                eq: (col1: string, val1: any) => ({
                  eq: (col2: string, val2: any) => {
                    // No active recurring transactions found
                    return Promise.resolve({ data: [], error: null })
                  },
                }),
              }),
              insert: vi.fn().mockImplementation((row: any) => {
                insertedRows.push(row)
                return Promise.resolve({ error: null })
              }),
            }
          }
          return {}
        },
      }

      const result = await processPendingRecurrences({
        referenceDate: '2026-09-23',
        client: mockSupabase,
      })

      expect(result.processedCount).toBe(0)
      expect(insertedRows).toHaveLength(0)
    })

    it('is idempotent and prevents duplicate transactions if cycle was already generated', async () => {
      const insertedRows: any[] = []

      const mockSupabase: any = {
        from: (table: string) => {
          if (table === 'transactions') {
            return {
              select: () => ({
                eq: (col1: string, val1: any) => ({
                  eq: (col2: string, val2: any) => {
                    if (col1 === 'is_recurring') {
                      return Promise.resolve({
                        data: [
                          {
                            id: 'parent-spotify-1',
                            vendor: 'Spotify',
                            total: 34.9,
                            type: 'expense',
                            is_recurring: true,
                            recurrence_frequency: 'monthly',
                            recurrence_next_date: '2026-09-23',
                            recurrence_status: 'active',
                            date: '2026-08-23',
                          },
                        ],
                        error: null,
                      })
                    }
                    return Promise.resolve({ data: [], error: null })
                  },
                }),
                or: () => ({
                  // Cycle already exists in database!
                  limit: () => Promise.resolve({
                    data: [{ id: 'existing-cycle-tx-1' }],
                    error: null,
                  }),
                }),
              }),
              insert: vi.fn().mockImplementation((row: any) => {
                insertedRows.push(row)
                return Promise.resolve({ error: null })
              }),
              update: vi.fn().mockImplementation((upd: any) => ({
                eq: () => Promise.resolve({ error: null }),
              })),
            }
          }
          return {}
        },
      }

      const result = await processPendingRecurrences({
        referenceDate: '2026-09-23',
        client: mockSupabase,
      })

      // Zero new rows inserted, but next date advanced to next month
      expect(result.processedCount).toBe(0)
      expect(insertedRows).toHaveLength(0)
    })

    it('handles concurrent simultaneous executions safely with unique constraint without duplicating transactions', async () => {
      let alreadyInserted = false
      const insertedRows: any[] = []

      const createMockSupabase = () => ({
        from: (table: string) => {
          if (table === 'transactions') {
            return {
              select: () => ({
                eq: (col1: string, val1: any) => ({
                  eq: (col2: string, val2: any) => {
                    if (col1 === 'is_recurring') {
                      return Promise.resolve({
                        data: [
                          {
                            id: 'parent-adobe-1',
                            vendor: 'Adobe Creative Cloud',
                            total: 224,
                            type: 'expense',
                            is_recurring: true,
                            recurrence_frequency: 'monthly',
                            recurrence_next_date: '2026-09-23',
                            recurrence_status: 'active',
                            date: '2026-08-23',
                          },
                        ],
                        error: null,
                      })
                    }
                    return Promise.resolve({ data: [], error: null })
                  },
                }),
                or: () => ({
                  // Simulating race condition: select initially sees no rows
                  limit: () => Promise.resolve({
                    data: alreadyInserted ? [{ id: 'tx-adobe-winner' }] : [],
                    error: null,
                  }),
                }),
              }),
              insert: vi.fn().mockImplementation((row: any) => {
                if (alreadyInserted) {
                  // Second caller hits unique index constraint violation (code 23505)
                  return Promise.resolve({
                    error: {
                      code: '23505',
                      message: 'duplicate key value violates unique constraint "idx_transactions_recurrence_cycle_unique"',
                    },
                  })
                }
                alreadyInserted = true
                insertedRows.push(row)
                return Promise.resolve({ error: null })
              }),
              update: vi.fn().mockImplementation(() => ({
                eq: () => Promise.resolve({ error: null }),
              })),
            }
          }
          return {}
        },
      })

      const client1 = createMockSupabase()
      const client2 = createMockSupabase()

      // Run 2 simultaneous calls to processPendingRecurrences
      const [res1, res2] = await Promise.all([
        processPendingRecurrences({ referenceDate: '2026-09-23', client: client1 as any }),
        processPendingRecurrences({ referenceDate: '2026-09-23', client: client2 as any }),
      ])

      // Only 1 transaction is inserted, the second is gracefully handled via constraint
      expect(insertedRows).toHaveLength(1)
      expect(insertedRows[0].recurrence_parent_id).toBe('parent-adobe-1')
      expect(insertedRows[0].recurrence_cycle_date).toBe('2026-09-23')
      expect(res1.processedCount + res2.processedCount).toBe(1)
    })
  })

  describe('Recurrence Domain Module (lib/recurrence)', () => {
    describe('resolveRecurrenceFrequency', () => {
      it('validates supported frequencies and defaults to monthly', () => {
        expect(resolveRecurrenceFrequency('weekly')).toBe('weekly')
        expect(resolveRecurrenceFrequency('yearly')).toBe('yearly')
        expect(resolveRecurrenceFrequency('monthly')).toBe('monthly')
        expect(resolveRecurrenceFrequency(null)).toBe('monthly')
        expect(resolveRecurrenceFrequency('daily')).toBe('monthly')
        expect(resolveRecurrenceFrequency('')).toBe('monthly')
      })
    })

    describe('resolveRecurrenceNextDate', () => {
      it('uses explicit next date when provided', () => {
        expect(resolveRecurrenceNextDate('2026-09-01', 'monthly', '2026-09-15')).toBe('2026-09-15')
      })

      it('computes next date from base date when explicit date is omitted', () => {
        expect(resolveRecurrenceNextDate('2026-09-01', 'monthly')).toBe('2026-10-01')
        expect(resolveRecurrenceNextDate('2026-09-01', 'weekly')).toBe('2026-09-08')
        expect(resolveRecurrenceNextDate('2026-09-01', 'yearly')).toBe('2027-09-01')
      })
    })

    describe('resolveRecurrenceUpdate - synchronization on edit', () => {
      it('returns inactive recurrence state when is_recurring is false', () => {
        const res = resolveRecurrenceUpdate({
          is_recurring: false,
          recurrence_frequency: 'monthly',
          recurrence_next_date: '2026-10-01',
        })
        expect(res.is_recurring).toBe(false)
        expect(res.recurrence_frequency).toBeNull()
        expect(res.recurrence_next_date).toBeNull()
      })

      it('computes recurrence_next_date if omitted when activating a recurrence', () => {
        const res = resolveRecurrenceUpdate({
          is_recurring: true,
          recurrence_frequency: 'monthly',
          date: '2026-09-15',
        })
        expect(res.is_recurring).toBe(true)
        expect(res.recurrence_frequency).toBe('monthly')
        expect(res.recurrence_next_date).toBe('2026-10-15')
        expect(res.recurrence_status).toBe('active')
      })

      it('preserves existing recurrence properties when editing non-recurrence fields', () => {
        const res = resolveRecurrenceUpdate({
          existingTx: {
            date: '2026-09-10',
            is_recurring: true,
            recurrence_frequency: 'weekly',
            recurrence_next_date: '2026-09-17',
            recurrence_status: 'active',
          },
        })
        expect(res.is_recurring).toBe(true)
        expect(res.recurrence_frequency).toBe('weekly')
        expect(res.recurrence_next_date).toBe('2026-09-17')
      })

      it('allows ending a recurrence', () => {
        const res = resolveRecurrenceUpdate({
          is_recurring: true,
          recurrence_status: 'ended',
          recurrence_next_date: '2026-09-15',
        })
        expect(res.is_recurring).toBe(true)
        expect(res.recurrence_status).toBe('ended')
      })
    })

    describe('projectRecurringTransactions - monthly projection', () => {
      it('projects upcoming cycles for active recurrences in future months', () => {
        const txList = [
          {
            id: 'tx-spotify-1',
            vendor: 'Spotify',
            category: 'Lazer',
            total: 34.9,
            date: '2026-09-05',
            is_recurring: true,
            recurrence_status: 'active',
            recurrence_frequency: 'monthly',
            recurrence_next_date: '2026-10-05',
          },
        ]

        // Querying October 2026 [2026-10-01, 2026-10-31]
        const projected = projectRecurringTransactions(txList, '2026-10-01', '2026-10-31')
        expect(projected).toHaveLength(1)
        expect(projected[0].id).toBe('proj_tx-spotify-1_2026-10-05')
        expect(projected[0].date).toBe('2026-10-05')
        expect(projected[0].total).toBe(34.9)
        expect(projected[0].is_projected).toBe(true)
      })

      it('does NOT project if a real transaction already exists for that cycle', () => {
        const txList = [
          {
            id: 'tx-spotify-1',
            vendor: 'Spotify',
            date: '2026-09-05',
            is_recurring: true,
            recurrence_status: 'active',
            recurrence_frequency: 'monthly',
            recurrence_next_date: '2026-10-05',
          },
          {
            id: 'tx-spotify-2',
            vendor: 'Spotify',
            date: '2026-10-05',
            recurrence_parent_id: 'tx-spotify-1',
            total: 34.9,
          },
        ]

        const projected = projectRecurringTransactions(txList, '2026-10-01', '2026-10-31')
        expect(projected).toHaveLength(0)
      })
    })

    describe('getUpcomingRecurringCommitments', () => {
      it('returns upcoming recurring commitments within the 30-day window', () => {
        const txList = [
          {
            id: 'tx-gym',
            vendor: 'Academia',
            category: 'Saúde',
            total: 150,
            date: '2026-09-10',
            is_recurring: true,
            recurrence_status: 'active',
            recurrence_frequency: 'monthly',
            recurrence_next_date: '2026-10-10', // within 30 days of 2026-09-23
          },
          {
            id: 'tx-yearly',
            vendor: 'Anuidade',
            category: 'Serviços',
            total: 500,
            date: '2026-09-10',
            is_recurring: true,
            recurrence_status: 'active',
            recurrence_frequency: 'yearly',
            recurrence_next_date: '2027-09-10', // outside 30 days window
          },
        ]

        const upcoming = getUpcomingRecurringCommitments(
          txList,
          '2026-09-23',
          '2026-10-23'
        )

        expect(upcoming).toHaveLength(1)
        expect(upcoming[0].id).toBe('tx-gym')
        expect(upcoming[0].amount).toBe(150)
        expect(upcoming[0].date).toBe('2026-10-10')
        expect(upcoming[0].frequency).toBe('monthly')
      })
    })
  })
})

