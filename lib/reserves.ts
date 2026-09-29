import fs from 'fs/promises'
import path from 'path'
import { randomUUID } from 'crypto'

export interface ReserveMovement {
  id: string
  reserveId: string
  type: 'deposit' | 'withdrawal' // aporte ou retirada
  amount: number
  date: string // YYYY-MM-DD
  notes?: string | null
  fromAccount?: string | null
  createdAt: string
}

export interface Reserve {
  id: string
  name: string
  currentBalance: number
  targetAmount?: number | null // meta opcional
  createdAt: string
  updatedAt: string
  movements: ReserveMovement[]
}

const DATA_DIR = path.join(process.cwd(), 'data')
const RESERVES_FILE = path.join(DATA_DIR, 'reserves.json')

const DEFAULT_RESERVES: Reserve[] = [
  {
    id: 'res-emergencia',
    name: 'Reserva de emergência',
    currentBalance: 5000,
    targetAmount: 10000,
    createdAt: '2026-09-01T12:00:00.000Z',
    updatedAt: '2026-09-01T12:00:00.000Z',
    movements: [
      {
        id: 'mov-1',
        reserveId: 'res-emergencia',
        type: 'deposit',
        amount: 5000,
        date: '2026-09-01',
        notes: 'Aporte inicial',
        fromAccount: 'Conta Corrente Principal',
        createdAt: '2026-09-01T12:00:00.000Z',
      },
    ],
  },
  {
    id: 'res-viagem',
    name: 'Viagem',
    currentBalance: 2000,
    targetAmount: 5000,
    createdAt: '2026-09-10T12:00:00.000Z',
    updatedAt: '2026-09-10T12:00:00.000Z',
    movements: [
      {
        id: 'mov-2',
        reserveId: 'res-viagem',
        type: 'deposit',
        amount: 2000,
        date: '2026-09-10',
        notes: 'Economia mensal',
        fromAccount: 'Conta Corrente Principal',
        createdAt: '2026-09-10T12:00:00.000Z',
      },
    ],
  },
  {
    id: 'res-outros',
    name: 'Outros',
    currentBalance: 1500,
    targetAmount: null,
    createdAt: '2026-09-15T12:00:00.000Z',
    updatedAt: '2026-09-15T12:00:00.000Z',
    movements: [
      {
        id: 'mov-3',
        reserveId: 'res-outros',
        type: 'deposit',
        amount: 1500,
        date: '2026-09-15',
        notes: 'Reserva geral',
        fromAccount: 'Conta Corrente Principal',
        createdAt: '2026-09-15T12:00:00.000Z',
      },
    ],
  },
]

async function ensureDataFile(): Promise<void> {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true })
    try {
      await fs.access(RESERVES_FILE)
    } catch {
      await fs.writeFile(RESERVES_FILE, JSON.stringify(DEFAULT_RESERVES, null, 2), 'utf-8')
    }
  } catch (err) {
    console.error('Error ensuring reserves data file:', err)
  }
}

export async function getReserves(): Promise<Reserve[]> {
  await ensureDataFile()
  try {
    const raw = await fs.readFile(RESERVES_FILE, 'utf-8')
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      return parsed
    }
    return DEFAULT_RESERVES
  } catch {
    return DEFAULT_RESERVES
  }
}

export async function saveReserves(reserves: Reserve[]): Promise<void> {
  await ensureDataFile()
  await fs.writeFile(RESERVES_FILE, JSON.stringify(reserves, null, 2), 'utf-8')
}

export async function createReserve(input: {
  name: string
  initialBalance?: number
  targetAmount?: number | null
  notes?: string
  fromAccount?: string | null
}): Promise<Reserve> {
  const reserves = await getReserves()
  const trimmed = input.name.trim()
  if (!trimmed) throw new Error('Nome da reserva é obrigatório.')

  const initialAmount = Math.max(0, Number(input.initialBalance) || 0)
  const id = `res-${randomUUID()}`
  const now = new Date().toISOString()
  const movements: ReserveMovement[] = []

  if (initialAmount > 0) {
    movements.push({
      id: `mov-${randomUUID()}`,
      reserveId: id,
      type: 'deposit',
      amount: initialAmount,
      date: now.slice(0, 10),
      notes: input.notes?.trim() || 'Aporte inicial',
      fromAccount: input.fromAccount || null,
      createdAt: now,
    })
  }

  const newReserve: Reserve = {
    id,
    name: trimmed,
    currentBalance: initialAmount,
    targetAmount: input.targetAmount ? Math.max(0, Number(input.targetAmount)) : null,
    createdAt: now,
    updatedAt: now,
    movements,
  }

  reserves.push(newReserve)
  await saveReserves(reserves)
  return newReserve
}

export async function updateReserve(
  id: string,
  input: {
    name?: string
    targetAmount?: number | null
  }
): Promise<Reserve> {
  const reserves = await getReserves()
  const idx = reserves.findIndex((r) => r.id === id)
  if (idx === -1) throw new Error('Reserva não encontrada.')

  const current = reserves[idx]
  if (input.name !== undefined) {
    const trimmed = input.name.trim()
    if (!trimmed) throw new Error('Nome da reserva não pode ser vazio.')
    current.name = trimmed
  }

  if (input.targetAmount !== undefined) {
    current.targetAmount = input.targetAmount ? Math.max(0, Number(input.targetAmount)) : null
  }

  current.updatedAt = new Date().toISOString()
  reserves[idx] = current
  await saveReserves(reserves)
  return current
}

export async function deleteReserve(id: string): Promise<boolean> {
  const reserves = await getReserves()
  const filtered = reserves.filter((r) => r.id !== id)
  if (filtered.length === reserves.length) return false
  await saveReserves(filtered)
  return true
}

export async function addReserveMovement(
  reserveId: string,
  input: {
    type: 'deposit' | 'withdrawal'
    amount: number
    date?: string
    notes?: string | null
    fromAccount?: string | null
  }
): Promise<{ reserve: Reserve; movement: ReserveMovement }> {
  const reserves = await getReserves()
  const idx = reserves.findIndex((r) => r.id === reserveId)
  if (idx === -1) throw new Error('Reserva não encontrada.')

  const amount = Number(input.amount)
  if (!amount || amount <= 0) {
    throw new Error('Valor deve ser maior que zero.')
  }

  const current = reserves[idx]
  if (input.type === 'withdrawal' && current.currentBalance < amount) {
    throw new Error(`Saldo insuficiente na reserva (${current.currentBalance} disponível).`)
  }

  const now = new Date().toISOString()
  const movement: ReserveMovement = {
    id: `mov-${randomUUID()}`,
    reserveId,
    type: input.type,
    amount,
    date: input.date || now.slice(0, 10),
    notes: input.notes?.trim() || null,
    fromAccount: input.fromAccount || null,
    createdAt: now,
  }

  if (input.type === 'deposit') {
    current.currentBalance += amount
  } else {
    current.currentBalance -= amount
  }

  current.movements.unshift(movement)
  current.updatedAt = now
  reserves[idx] = current
  await saveReserves(reserves)

  return { reserve: current, movement }
}
