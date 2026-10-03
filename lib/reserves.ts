import { getSupabaseClient } from './persist'

export interface ReserveMovement {
  id: string
  reserveId: string
  type: 'deposit' | 'withdrawal' // aporte ou retirada no frontend
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
  color?: string | null
  icon?: string | null
  deadline?: string | null
  accountId?: string | null
  createdAt: string
  updatedAt: string
  movements: ReserveMovement[]
}

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
]

function mapDbMovementToDomain(row: any): ReserveMovement {
  return {
    id: row.id,
    reserveId: row.reserve_id,
    type: row.type === 'withdraw' ? 'withdrawal' : 'deposit',
    amount: Number(row.amount) || 0,
    date: row.date,
    notes: row.description || null,
    fromAccount: null,
    createdAt: row.created_at,
  }
}

function mapDbReserveToDomain(row: any, movements: any[] = []): Reserve {
  return {
    id: row.id,
    name: row.name,
    currentBalance: Number(row.current_amount) || 0,
    targetAmount: row.target_amount !== null && row.target_amount !== undefined ? Number(row.target_amount) : null,
    color: row.color || null,
    icon: row.icon || null,
    deadline: row.deadline || null,
    accountId: row.account_id || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    movements: movements.map(mapDbMovementToDomain),
  }
}

export async function getReserves(userId?: string): Promise<Reserve[]> {
  const supabase = getSupabaseClient()
  if (!supabase) {
    return DEFAULT_RESERVES
  }

  let query = supabase
    .from('reserves')
    .select('*')
    .order('created_at', { ascending: true })

  if (userId) {
    query = query.eq('user_id', userId)
  }

  const { data: reservesData, error: reservesError } = await query

  if (reservesError || !reservesData) {
    console.error('Error fetching reserves:', reservesError)
    return []
  }

  if (reservesData.length === 0) {
    return []
  }

  const reserveIds = reservesData.map((r) => r.id)
  let movQuery = supabase
    .from('reserve_movements')
    .select('*')
    .in('reserve_id', reserveIds)
    .order('created_at', { ascending: false })

  if (userId) {
    movQuery = movQuery.eq('user_id', userId)
  }

  const { data: movementsData, error: movError } = await movQuery

  if (movError) {
    console.error('Error fetching reserve movements:', movError)
  }

  const movementsByReserveId = new Map<string, any[]>()
  for (const m of movementsData || []) {
    const list = movementsByReserveId.get(m.reserve_id) || []
    list.push(m)
    movementsByReserveId.set(m.reserve_id, list)
  }

  return reservesData.map((row) => mapDbReserveToDomain(row, movementsByReserveId.get(row.id) || []))
}

export async function saveReserves(_reserves: Reserve[]): Promise<void> {
  // Deprecated no-op: Supabase tables are single source of truth
}

export async function createReserve(input: {
  userId?: string | null
  name: string
  initialBalance?: number
  targetAmount?: number | null
  notes?: string
  fromAccount?: string | null
  color?: string | null
  icon?: string | null
  deadline?: string | null
  accountId?: string | null
}): Promise<Reserve> {
  const trimmed = input.name.trim()
  if (!trimmed) throw new Error('Nome da reserva é obrigatório.')

  const initialAmount = Math.max(0, Number(input.initialBalance) || 0)
  const userId = input.userId || 'bc5a76de-8865-4ec3-b7d5-5dfbfb8123a6'
  const supabase = getSupabaseClient()

  if (!supabase) {
    const now = new Date().toISOString()
    const id = `res-mock-${Date.now()}`
    const movements: ReserveMovement[] = initialAmount > 0 ? [{
      id: `mov-mock-${Date.now()}`,
      reserveId: id,
      type: 'deposit',
      amount: initialAmount,
      date: now.slice(0, 10),
      notes: input.notes?.trim() || 'Aporte inicial',
      fromAccount: input.fromAccount || null,
      createdAt: now,
    }] : []

    return {
      id,
      name: trimmed,
      currentBalance: initialAmount,
      targetAmount: input.targetAmount ? Math.max(0, Number(input.targetAmount)) : null,
      color: input.color || null,
      icon: input.icon || null,
      deadline: input.deadline || null,
      accountId: input.accountId || null,
      createdAt: now,
      updatedAt: now,
      movements,
    }
  }

  const { data: createdReserve, error: createError } = await supabase
    .from('reserves')
    .insert({
      user_id: userId,
      name: trimmed,
      current_amount: initialAmount,
      target_amount: input.targetAmount !== undefined && input.targetAmount !== null ? Number(input.targetAmount) : null,
      color: input.color || null,
      icon: input.icon || null,
      deadline: input.deadline || null,
      account_id: input.accountId || null,
    })
    .select('*')
    .single()

  if (createError || !createdReserve) {
    throw new Error(`Falha ao criar reserva: ${createError?.message}`)
  }

  const movements: any[] = []
  if (initialAmount > 0) {
    const desc = input.notes?.trim() || (input.fromAccount ? `Aporte inicial via ${input.fromAccount}` : 'Aporte inicial')
    const { data: movData, error: movError } = await supabase
      .from('reserve_movements')
      .insert({
        user_id: userId,
        reserve_id: createdReserve.id,
        amount: initialAmount,
        type: 'deposit',
        description: desc,
        date: new Date().toISOString().slice(0, 10),
      })
      .select('*')
      .single()

    if (movError) {
      console.error('Error adding initial movement for reserve:', movError)
    } else if (movData) {
      movements.push(movData)
    }
  }

  return mapDbReserveToDomain(createdReserve, movements)
}

export async function updateReserve(
  id: string,
  input: {
    name?: string
    targetAmount?: number | null
    color?: string | null
    icon?: string | null
    deadline?: string | null
    accountId?: string | null
  }
): Promise<Reserve> {
  const supabase = getSupabaseClient()
  if (!supabase) {
    throw new Error('Supabase client indisponível')
  }

  const updates: Record<string, any> = {
    updated_at: new Date().toISOString(),
  }

  if (input.name !== undefined) {
    const trimmed = input.name.trim()
    if (!trimmed) throw new Error('Nome da reserva não pode ser vazio.')
    updates.name = trimmed
  }

  if (input.targetAmount !== undefined) {
    updates.target_amount = input.targetAmount ? Math.max(0, Number(input.targetAmount)) : null
  }
  if (input.color !== undefined) updates.color = input.color
  if (input.icon !== undefined) updates.icon = input.icon
  if (input.deadline !== undefined) updates.deadline = input.deadline
  if (input.accountId !== undefined) updates.account_id = input.accountId

  const { data: updatedData, error: updateError } = await supabase
    .from('reserves')
    .update(updates)
    .eq('id', id)
    .select('*')
    .single()

  if (updateError || !updatedData) {
    throw new Error(`Reserva não encontrada ou falha ao atualizar: ${updateError?.message}`)
  }

  const { data: movementsData } = await supabase
    .from('reserve_movements')
    .select('*')
    .eq('reserve_id', id)
    .order('created_at', { ascending: false })

  return mapDbReserveToDomain(updatedData, movementsData || [])
}

export async function deleteReserve(id: string): Promise<boolean> {
  const supabase = getSupabaseClient()
  if (!supabase) {
    return true
  }

  const { error } = await supabase
    .from('reserves')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('Error deleting reserve:', error)
    return false
  }

  return true
}

export async function addReserveMovement(
  reserveId: string,
  input: {
    userId?: string | null
    type: 'deposit' | 'withdrawal'
    amount: number
    date?: string
    notes?: string | null
    fromAccount?: string | null
  }
): Promise<{ reserve: Reserve; movement: ReserveMovement }> {
  const supabase = getSupabaseClient()
  if (!supabase) {
    throw new Error('Supabase client indisponível')
  }

  const amount = Number(input.amount)
  if (!amount || amount <= 0) {
    throw new Error('Valor deve ser maior que zero.')
  }

  // 1. Fetch current reserve
  const { data: currentReserve, error: fetchError } = await supabase
    .from('reserves')
    .select('*')
    .eq('id', reserveId)
    .single()

  if (fetchError || !currentReserve) {
    throw new Error('Reserva não encontrada.')
  }

  const currentBalance = Number(currentReserve.current_amount) || 0
  if (input.type === 'withdrawal' && currentBalance < amount) {
    throw new Error(`Saldo insuficiente na reserva (${currentBalance} disponível).`)
  }

  const newBalance = input.type === 'deposit' ? currentBalance + amount : currentBalance - amount
  const dbType = input.type === 'withdrawal' ? 'withdraw' : 'deposit'
  const desc = input.notes?.trim() || (input.fromAccount ? `Origem/Destino: ${input.fromAccount}` : null)

  // 2. Insert movement
  const userId = input.userId || currentReserve.user_id || 'bc5a76de-8865-4ec3-b7d5-5dfbfb8123a6'
  const { data: movementRow, error: movInsertError } = await supabase
    .from('reserve_movements')
    .insert({
      user_id: userId,
      reserve_id: reserveId,
      amount,
      type: dbType,
      description: desc,
      date: input.date || new Date().toISOString().slice(0, 10),
    })
    .select('*')
    .single()

  if (movInsertError || !movementRow) {
    throw new Error(`Falha ao registrar movimentação: ${movInsertError?.message}`)
  }

  // 3. Update current_amount on reserves
  const { data: updatedReserve, error: resUpdateError } = await supabase
    .from('reserves')
    .update({
      current_amount: newBalance,
      updated_at: new Date().toISOString(),
    })
    .eq('id', reserveId)
    .select('*')
    .single()

  if (resUpdateError || !updatedReserve) {
    throw new Error(`Falha ao atualizar saldo da reserva: ${resUpdateError?.message}`)
  }

  const { data: allMovements } = await supabase
    .from('reserve_movements')
    .select('*')
    .eq('reserve_id', reserveId)
    .order('created_at', { ascending: false })

  const domainReserve = mapDbReserveToDomain(updatedReserve, allMovements || [])
  const domainMovement = mapDbMovementToDomain(movementRow)

  return { reserve: domainReserve, movement: domainMovement }
}
