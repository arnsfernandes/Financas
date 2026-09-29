import { describe, it, expect, beforeEach } from 'vitest'
import {
  getReserves,
  createReserve,
  updateReserve,
  deleteReserve,
  addReserveMovement,
} from './reserves'
import fs from 'fs/promises'
import path from 'path'

const DATA_DIR = path.join(process.cwd(), 'data')
const RESERVES_FILE = path.join(DATA_DIR, 'reserves.json')

describe('Reserves Domain Module', () => {
  beforeEach(async () => {
    // Reset to clean test data before each test
    const initial = [
      {
        id: 'test-emergencia',
        name: 'Reserva de Emergência Teste',
        currentBalance: 5000,
        targetAmount: 10000,
        createdAt: '2026-09-01T12:00:00.000Z',
        updatedAt: '2026-09-01T12:00:00.000Z',
        movements: [
          {
            id: 'mov-init',
            reserveId: 'test-emergencia',
            type: 'deposit',
            amount: 5000,
            date: '2026-09-01',
            notes: 'Aporte inicial',
            fromAccount: 'Conta Corrente Principal',
            createdAt: '2026-09-01T12:00:00.000Z',
          },
        ],
      },
    ]
    await fs.mkdir(DATA_DIR, { recursive: true })
    await fs.writeFile(RESERVES_FILE, JSON.stringify(initial, null, 2), 'utf-8')
  })

  it('lists existing reserves', async () => {
    const reserves = await getReserves()
    expect(reserves.length).toBeGreaterThanOrEqual(1)
    expect(reserves[0].name).toBe('Reserva de Emergência Teste')
    expect(reserves[0].currentBalance).toBe(5000)
  })

  it('creates a new reserve with optional initial deposit', async () => {
    const created = await createReserve({
      name: 'Viagem 2027',
      initialBalance: 1200,
      targetAmount: 6000,
      notes: 'Primeira economia',
      fromAccount: 'Conta Corrente Principal',
    })

    expect(created.id).toMatch(/^res-/)
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
    expect(reserve.movements[0].id).toBe(movement.id)
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

  it('deletes a reserve', async () => {
    const success = await deleteReserve('test-emergencia')
    expect(success).toBe(true)

    const list = await getReserves()
    expect(list.find((r) => r.id === 'test-emergencia')).toBeUndefined()
  })
})
