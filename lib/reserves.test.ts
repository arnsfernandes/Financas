import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getReserves,
  createReserve,
  updateReserve,
  deleteReserve,
  addReserveMovement,
} from './reserves'
import * as persist from './persist'

describe('Reserves Domain Module (Supabase-backed)', () => {
  let mockReservesTable: any[] = []
  let mockMovementsTable: any[] = []

  beforeEach(() => {
    mockReservesTable = [
      {
        id: 'test-emergencia',
        name: 'Reserva de Emergência Teste',
        current_amount: 5000,
        target_amount: 10000,
        color: null,
        icon: null,
        deadline: null,
        account_id: null,
        created_at: '2026-09-01T12:00:00.000Z',
        updated_at: '2026-09-01T12:00:00.000Z',
      },
    ]

    mockMovementsTable = [
      {
        id: 'mov-init',
        reserve_id: 'test-emergencia',
        type: 'deposit',
        amount: 5000,
        date: '2026-09-01',
        description: 'Aporte inicial via Conta Corrente Principal',
        created_at: '2026-09-01T12:00:00.000Z',
      },
    ]

    const fakeSupabase = {
      from: (tableName: string) => {
        if (tableName === 'reserves') {
          return {
            select: (_cols?: string) => ({
              order: (_col: string, _opts: any) => Promise.resolve({ data: [...mockReservesTable], error: null }),
              eq: (_col: string, val: any) => ({
                single: () => {
                  const item = mockReservesTable.find((r) => r.id === val)
                  return Promise.resolve({ data: item ? { ...item } : null, error: item ? null : { message: 'Not found' } })
                },
              }),
            }),
            insert: (data: any) => ({
              select: () => ({
                single: () => {
                  const newRow = {
                    id: data.id || `res-${Date.now()}`,
                    ...data,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                  }
                  mockReservesTable.push(newRow)
                  return Promise.resolve({ data: newRow, error: null })
                },
              }),
            }),
            update: (updates: any) => ({
              eq: (_col: string, val: any) => ({
                select: () => ({
                  single: () => {
                    const idx = mockReservesTable.findIndex((r) => r.id === val)
                    if (idx === -1) return Promise.resolve({ data: null, error: { message: 'Not found' } })
                    mockReservesTable[idx] = { ...mockReservesTable[idx], ...updates }
                    return Promise.resolve({ data: mockReservesTable[idx], error: null })
                  },
                }),
              }),
            }),
            delete: () => ({
              eq: (_col: string, val: any) => {
                const initialLen = mockReservesTable.length
                mockReservesTable = mockReservesTable.filter((r) => r.id !== val)
                mockMovementsTable = mockMovementsTable.filter((m) => m.reserve_id !== val)
                return Promise.resolve({ error: null, count: initialLen - mockReservesTable.length })
              },
            }),
          }
        }

        if (tableName === 'reserve_movements') {
          return {
            select: (_cols?: string) => ({
              in: (_col: string, vals: any[]) => ({
                order: (_oCol: string, _opts: any) => {
                  const filtered = mockMovementsTable.filter((m) => vals.includes(m.reserve_id))
                  return Promise.resolve({ data: filtered, error: null })
                },
              }),
              eq: (_col: string, val: any) => ({
                order: (_oCol: string, _opts: any) => {
                  const filtered = mockMovementsTable.filter((m) => m.reserve_id === val)
                  return Promise.resolve({ data: filtered, error: null })
                },
              }),
            }),
            insert: (data: any) => ({
              select: () => ({
                single: () => {
                  const newRow = {
                    id: data.id || `mov-${Date.now()}`,
                    ...data,
                    created_at: new Date().toISOString(),
                  }
                  mockMovementsTable.push(newRow)
                  return Promise.resolve({ data: newRow, error: null })
                },
              }),
            }),
          }
        }

        return {}
      },
    }

    vi.spyOn(persist, 'getSupabaseClient').mockReturnValue(fakeSupabase as any)
  })

  it('lists existing reserves with their movements', async () => {
    const reserves = await getReserves()
    expect(reserves.length).toBe(1)
    expect(reserves[0].name).toBe('Reserva de Emergência Teste')
    expect(reserves[0].currentBalance).toBe(5000)
    expect(reserves[0].movements).toHaveLength(1)
    expect(reserves[0].movements[0].type).toBe('deposit')
  })

  it('creates a new reserve with optional initial deposit', async () => {
    const created = await createReserve({
      name: 'Viagem 2027',
      initialBalance: 1200,
      targetAmount: 6000,
      notes: 'Primeira economia',
      fromAccount: 'Conta Corrente Principal',
    })

    expect(created.name).toBe('Viagem 2027')
    expect(created.currentBalance).toBe(1200)
    expect(created.targetAmount).toBe(6000)
    expect(created.movements).toHaveLength(1)
    expect(created.movements[0].type).toBe('deposit')
    expect(created.movements[0].amount).toBe(1200)
  })

  it('adds deposit (aporte) increasing balance', async () => {
    const { reserve, movement } = await addReserveMovement('test-emergencia', {
      type: 'deposit',
      amount: 1500,
      notes: 'Aporte mensal',
      fromAccount: 'Conta Corrente',
    })

    expect(reserve.currentBalance).toBe(6500)
    expect(movement.type).toBe('deposit')
    expect(movement.amount).toBe(1500)
    expect(reserve.movements.some((m) => m.id === movement.id)).toBe(true)
  })

  it('adds withdrawal (retirada) decreasing balance and rejects if insufficient funds', async () => {
    const { reserve } = await addReserveMovement('test-emergencia', {
      type: 'withdrawal',
      amount: 2000,
      notes: 'Conserto do carro',
    })

    expect(reserve.currentBalance).toBe(3000)

    // Should reject withdrawal larger than remaining balance
    await expect(
      addReserveMovement('test-emergencia', {
        type: 'withdrawal',
        amount: 4000,
      })
    ).rejects.toThrow(/Saldo insuficiente/)
  })

  it('updates reserve name and targetAmount', async () => {
    const updated = await updateReserve('test-emergencia', {
      name: 'Reserva Blindada',
      targetAmount: 15000,
    })

    expect(updated.name).toBe('Reserva Blindada')
    expect(updated.targetAmount).toBe(15000)
  })

  it('deletes a reserve and its movements', async () => {
    const success = await deleteReserve('test-emergencia')
    expect(success).toBe(true)

    const list = await getReserves()
    expect(list.find((r) => r.id === 'test-emergencia')).toBeUndefined()
  })
})
