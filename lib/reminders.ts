/**
 * Reminders engine for Telegram Bot.
 *
 * Handles:
 * 1. Persistent preferences per user (invoices, recurrences, weekly_summary, reminder_hour, timezone)
 *    - Hybrid persistence: Supabase table (if available) + local JSON storage fallback
 * 2. Deduplication and state tracking (sent, dismissed, snoozed, stale_discarded)
 * 3. Credit Card Invoices alerts (3 days before and on due date)
 * 4. Recurrence alerts (1 day before next expected date)
 * 5. Weekly summary alerts (Mondays at scheduled hour in America/Sao_Paulo)
 * 6. Stale alert discarding (> 24h delay protection)
 */

import { listAccounts, listTransactions, getDashboardSummary } from './queries'
import { getCardInvoiceDates, groupTransactionsIntoInvoices } from './billingCycles'
import { getSupabaseClient } from './persist'
import { formatBRL } from './formatters'
import type { Account } from './schema'

export interface ReminderPreferences {
  userId: number
  invoicesEnabled: boolean
  recurrencesEnabled: boolean
  weeklySummaryEnabled: boolean
  reminderHour: number // 0-23
  timezone: string // 'America/Sao_Paulo'
  updatedAt: string
}

export type ReminderType = 'invoice' | 'recurrence' | 'weekly_summary'
export type ReminderStage = '3_days_before' | 'due_day' | '1_day_before' | 'weekly_monday' | 'snooze_day'
export type ReminderStatus = 'sent' | 'dismissed' | 'snoozed' | 'stale_discarded'

export interface ReminderLogEntry {
  dedupKey: string
  userId: number
  type: ReminderType
  entityId?: string | null
  targetDate?: string | null
  stage: ReminderStage
  status: ReminderStatus
  timestamp: number
  metadata?: Record<string, any>
}

export interface ReminderNotification {
  dedupKey: string
  userId: number
  type: ReminderType
  text: string
  buttons?: Array<{ text: string; callbackData: string }>
}

// In-Memory caches initialized from file/db
const memoryPreferences = new Map<number, ReminderPreferences>()
const memoryLogs = new Map<string, ReminderLogEntry>()
let isStoreLoaded = false

export function resetReminderStore(): void {
  memoryPreferences.clear()
  memoryLogs.clear()
  isStoreLoaded = true
}

async function getFs() {
  if (typeof window !== 'undefined') return null
  try {
    return await import('fs/promises')
  } catch {
    return null
  }
}

async function getPath() {
  if (typeof window !== 'undefined') return null
  try {
    return await import('path')
  } catch {
    return null
  }
}

async function getStorageFilePath(): Promise<string | null> {
  const pathModule = await getPath()
  if (!pathModule) return null
  return pathModule.join(process.cwd(), 'data', 'reminders_store.json')
}

async function ensureDataDir(): Promise<void> {
  const fsModule = await getFs()
  const pathModule = await getPath()
  if (!fsModule || !pathModule) return
  try {
    await fsModule.mkdir(pathModule.join(process.cwd(), 'data'), { recursive: true })
  } catch {
    // Already exists
  }
}

async function loadStore(): Promise<void> {
  if (isStoreLoaded) return
  isStoreLoaded = true

  const fsModule = await getFs()
  const filePath = await getStorageFilePath()
  if (!fsModule || !filePath) return

  await ensureDataDir()
  try {
    const raw = await fsModule.readFile(filePath, 'utf-8')
    const parsed = JSON.parse(raw)

    if (parsed.preferences && Array.isArray(parsed.preferences)) {
      for (const p of parsed.preferences) {
        memoryPreferences.set(p.userId, p)
      }
    }
    if (parsed.logs && Array.isArray(parsed.logs)) {
      for (const l of parsed.logs) {
        memoryLogs.set(l.dedupKey, l)
      }
    }
  } catch {
    // File doesn't exist yet
  }
}

async function persistStore(): Promise<void> {
  const fsModule = await getFs()
  const filePath = await getStorageFilePath()
  if (!fsModule || !filePath) return

  await ensureDataDir()
  try {
    const data = {
      preferences: Array.from(memoryPreferences.values()),
      logs: Array.from(memoryLogs.values()),
      updatedAt: new Date().toISOString(),
    }
    await fsModule.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8')
  } catch (err) {
    console.error('[Reminders Store] Erro ao gravar reminders_store.json:', err)
  }
}

export function getPreferences(userId: number): ReminderPreferences {
  // Sync load if memory empty
  if (!isStoreLoaded && typeof window === 'undefined') {
    try {
      const fs = require('fs')
      const path = require('path')
      const filePath = path.join(process.cwd(), 'data', 'reminders_store.json')
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf-8')
        const parsed = JSON.parse(raw)
        if (parsed.preferences && Array.isArray(parsed.preferences)) {
          for (const p of parsed.preferences) {
            memoryPreferences.set(p.userId, p)
          }
        }
        if (parsed.logs && Array.isArray(parsed.logs)) {
          for (const l of parsed.logs) {
            memoryLogs.set(l.dedupKey, l)
          }
        }
      }
      isStoreLoaded = true
    } catch {
      isStoreLoaded = true
    }
  }

  const existing = memoryPreferences.get(userId)
  if (existing) return existing

  const allowedUserId = process.env.TELEGRAM_ALLOWED_USER_ID?.trim()
  const isAllowed = allowedUserId && String(userId) === allowedUserId

  // Default: All 3 active for authorized user
  const defaultPref: ReminderPreferences = {
    userId,
    invoicesEnabled: Boolean(isAllowed),
    recurrencesEnabled: Boolean(isAllowed),
    weeklySummaryEnabled: Boolean(isAllowed),
    reminderHour: 9,
    timezone: 'America/Sao_Paulo',
    updatedAt: new Date().toISOString(),
  }
  memoryPreferences.set(userId, defaultPref)
  persistStore().catch(() => {})
  return defaultPref
}

export function updatePreferences(
  userId: number,
  updates: Partial<Omit<ReminderPreferences, 'userId'>>
): ReminderPreferences {
  const current = getPreferences(userId)
  const updated: ReminderPreferences = {
    ...current,
    ...updates,
    updatedAt: new Date().toISOString(),
  }
  memoryPreferences.set(userId, updated)
  persistStore().catch(() => {})

  // Also try updating Supabase table if it exists
  const supabase = getSupabaseClient()
  if (supabase && typeof supabase.from === 'function') {
    ;(async () => {
      try {
        await supabase.from('reminder_preferences').upsert({
          user_id: userId,
          invoices_enabled: updated.invoicesEnabled,
          recurrences_enabled: updated.recurrencesEnabled,
          weekly_summary_enabled: updated.weeklySummaryEnabled,
          reminder_hour: updated.reminderHour,
          timezone: updated.timezone,
          updated_at: updated.updatedAt,
        })
      } catch {
        // Table doesn't exist yet or not pushed; local file store handles it reliably
      }
    })()
  }

  return updated
}

export function getLog(dedupKey: string): ReminderLogEntry | undefined {
  if (!isStoreLoaded) {
    getPreferences(0) // Trigger sync initial load
  }
  return memoryLogs.get(dedupKey)
}

export function setLog(entry: ReminderLogEntry): void {
  memoryLogs.set(entry.dedupKey, entry)
  persistStore().catch(() => {})

  // Also try recording into Supabase if table exists
  const supabase = getSupabaseClient()
  if (supabase && typeof supabase.from === 'function') {
    ;(async () => {
      try {
        await supabase.from('reminder_logs').upsert({
          dedup_key: entry.dedupKey,
          user_id: entry.userId,
          type: entry.type,
          entity_id: entry.entityId || null,
          target_date: entry.targetDate || null,
          stage: entry.stage,
          status: entry.status,
          sent_at: new Date(entry.timestamp).toISOString(),
          metadata: entry.metadata || null,
        })
      } catch {
        // Table doesn't exist yet; local file store handles it reliably
      }
    })()
  }
}

export function buildDedupKey(
  userId: number,
  type: ReminderType,
  entityId: string,
  targetDate: string,
  stage: ReminderStage
): string {
  return `${userId}:${type}:${entityId}:${targetDate}:${stage}`
}

/**
 * Helper to get current Date/Time components in America/Sao_Paulo.
 */
export function getZonedDateParts(now: Date = new Date(), timezone = 'America/Sao_Paulo') {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    weekday: 'short',
  })

  const parts = formatter.formatToParts(now)
  const get = (type: string) => parts.find((p) => p.type === type)?.value || ''

  const year = parseInt(get('year'), 10)
  const month = parseInt(get('month'), 10)
  const day = parseInt(get('day'), 10)
  const hour = parseInt(get('hour'), 10)
  const minute = parseInt(get('minute'), 10)
  const weekday = get('weekday') // 'Mon', 'Tue', etc.

  const isoDate = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`

  return { year, month, day, hour, minute, weekday, isoDate }
}

/**
 * Calculates days diff between two YYYY-MM-DD dates (target - current).
 */
export function diffDays(currentDateStr: string, targetDateStr: string): number {
  const c = new Date(currentDateStr + 'T00:00:00Z')
  const t = new Date(targetDateStr + 'T00:00:00Z')
  return Math.round((t.getTime() - c.getTime()) / (1000 * 60 * 60 * 24))
}

/**
 * Formats YYYY-MM-DD to DD/MM.
 */
export function formatBrDate(dateStr: string): string {
  if (!dateStr || dateStr.length < 10) return dateStr
  const [, m, d] = dateStr.slice(0, 10).split('-')
  return `${d}/${m}`
}

/**
 * Check and generate pending credit card invoice reminders.
 */
export async function checkInvoiceReminders(
  userId: number,
  now: Date = new Date()
): Promise<ReminderNotification[]> {
  const prefs = getPreferences(userId)
  if (!prefs.invoicesEnabled) return []

  const { isoDate, hour } = getZonedDateParts(now, prefs.timezone)
  // Only trigger if current hour matches reminderHour
  if (hour !== prefs.reminderHour) return []

  const accounts = await listAccounts()
  const creditCards = accounts.filter((a) => a.type === 'credit_card' && a.active !== false)
  if (creditCards.length === 0) return []

  // Load transactions to compute current invoice value
  const txRes = await listTransactions({ limit: 1000 })
  const txList = txRes.transactions || []
  const accountsMap: Record<string, Account> = {}
  for (const acc of accounts) accountsMap[acc.id] = acc

  const consolidatedInvoices = groupTransactionsIntoInvoices(txList, accountsMap)

  const notifications: ReminderNotification[] = []

  // Group cards by due date and stage
  const remindersByDateAndStage: Record<
    string,
    {
      stage: ReminderStage
      dueDate: string
      daysUntil: number
      cards: Array<{ account: Account; total: number; invoiceId?: string }>
    }
  > = {}

  for (const card of creditCards) {
    const dueDay = card.due_day || 15

    // Check candidate due dates for current month and next month
    const [curYear, curMonth] = isoDate.split('-').map(Number)
    const candidateMonths = [
      { y: curYear, m: curMonth },
      { y: curMonth === 12 ? curYear + 1 : curYear, m: curMonth === 12 ? 1 : curMonth + 1 },
    ]

    for (const { y, m } of candidateMonths) {
      const maxDays = new Date(Date.UTC(y, m, 0)).getUTCDate()
      const actualDueDay = Math.min(dueDay, maxDays)
      const dueDate = `${y}-${String(m).padStart(2, '0')}-${String(actualDueDay).padStart(2, '0')}`
      const daysUntil = diffDays(isoDate, dueDate)

      let stage: ReminderStage | null = null
      if (daysUntil === 3) {
        stage = '3_days_before'
      } else if (daysUntil === 0) {
        stage = 'due_day'
      }

      if (!stage) continue

      // Check if this specific card was already sent or dismissed
      const dedupKey = buildDedupKey(userId, 'invoice', card.id, dueDate, stage)
      const existingLog = getLog(dedupKey)
      if (existingLog && (existingLog.status === 'sent' || existingLog.status === 'dismissed')) {
        continue
      }

      // Check if whole cycle was dismissed for this card
      const cycleDismissKey = buildDedupKey(userId, 'invoice', card.id, dueDate, 'due_day')
      const cycleLog = getLog(cycleDismissKey)
      if (cycleLog?.status === 'dismissed') {
        continue
      }

      // Find invoice total
      const invoice = consolidatedInvoices.find(
        (inv) => inv.accountId === card.id && inv.dueDate === dueDate
      )
      const currentTotal = invoice ? invoice.total : 0

      const groupKey = `${dueDate}_${stage}`
      if (!remindersByDateAndStage[groupKey]) {
        remindersByDateAndStage[groupKey] = {
          stage,
          dueDate,
          daysUntil,
          cards: [],
        }
      }

      remindersByDateAndStage[groupKey].cards.push({
        account: card,
        total: currentTotal,
        invoiceId: invoice?.id,
      })
    }
  }

  // Build notifications
  for (const group of Object.values(remindersByDateAndStage)) {
    if (group.cards.length === 0) continue

    const formattedDate = formatBrDate(group.dueDate)
    const cardIds = group.cards.map((c) => c.account.id).sort().join(',')
    const firstCard = group.cards[0]
    const dedupKey = buildDedupKey(userId, 'invoice', cardIds, group.dueDate, group.stage)

    let text = ''
    if (group.cards.length === 1) {
      const { account, total } = firstCard
      if (group.stage === '3_days_before') {
        text = `💳 <b>Fatura próxima</b> — <b>${account.name}</b> · vence em 3 dias (${formattedDate}).`
      } else {
        text = `💳 <b>Fatura vence hoje</b> — <b>${account.name}</b> · ${formattedDate}.`
      }
      if (total > 0) {
        text += `\nValor atual: <b>${formatBRL(total)}</b>.`
      } else {
        text += `\nValor atual: <b>R$ 0,00</b>.`
      }
    } else {
      // Multiple cards on the same day
      if (group.stage === '3_days_before') {
        text = `💳 <b>Faturas próximas</b> — vencem em 3 dias (${formattedDate}):\n`
      } else {
        text = `💳 <b>Faturas vencem hoje</b> — (${formattedDate}):\n`
      }
      for (const c of group.cards) {
        text += `• <b>${c.account.name}</b>: ${formatBRL(c.total)}\n`
      }
    }

    const primaryCardId = firstCard.account.id
    const buttons = [
      { text: '🔍 Ver fatura', callbackData: `rem_view_inv:${primaryCardId}:${group.dueDate}` },
      { text: '⏰ Lembrar amanhã', callbackData: `rem_snooze:invoice:${primaryCardId}:${group.dueDate}` },
      { text: '🚫 Dispensar este vencimento', callbackData: `rem_dismiss:invoice:${primaryCardId}:${group.dueDate}` },
    ]

    notifications.push({
      dedupKey,
      userId,
      type: 'invoice',
      text,
      buttons,
    })
  }

  return notifications
}

/**
 * Check and generate recurring expense reminders (1 day before next date).
 */
export async function checkRecurrenceReminders(
  userId: number,
  now: Date = new Date()
): Promise<ReminderNotification[]> {
  const prefs = getPreferences(userId)
  if (!prefs.recurrencesEnabled) return []

  const { isoDate, hour } = getZonedDateParts(now, prefs.timezone)
  if (hour !== prefs.reminderHour) return []

  const txRes = await listTransactions({ limit: 1000 })
  const transactions = txRes.transactions || []
  const activeRecurring = transactions.filter(
    (t) => t.is_recurring && t.recurrence_status === 'active' && t.recurrence_next_date
  )

  const notifications: ReminderNotification[] = []

  // Keep unique recurring subscriptions by parent/id
  const seenEntities = new Set<string>()

  for (const rec of activeRecurring) {
    const nextDate = rec.recurrence_next_date!
    const daysUntil = diffDays(isoDate, nextDate)

    // 1 day before
    if (daysUntil !== 1) continue

    const entityId = rec.id
    if (seenEntities.has(entityId)) continue
    seenEntities.add(entityId)

    const stage: ReminderStage = '1_day_before'
    const dedupKey = buildDedupKey(userId, 'recurrence', entityId, nextDate, stage)

    const existingLog = getLog(dedupKey)
    if (existingLog && (existingLog.status === 'sent' || existingLog.status === 'dismissed')) {
      continue
    }

    const formattedDate = formatBrDate(nextDate)
    const title = rec.vendor || rec.category || 'Despesa fixa'
    const amountStr = rec.total != null ? formatBRL(rec.total) : ''

    let text = `📅 <b>Despesa recorrente amanhã</b> — <b>${title}</b> · ${formattedDate}.`
    if (amountStr) {
      text += `\nValor previsto: <b>${amountStr}</b>.`
    }

    const buttons = [
      { text: '🔍 Ver detalhes', callbackData: `rem_view_rec:${entityId}` },
      { text: '🚫 Dispensar este vencimento', callbackData: `rem_dismiss:recurrence:${entityId}:${nextDate}` },
    ]

    notifications.push({
      dedupKey,
      userId,
      type: 'recurrence',
      text,
      buttons,
    })
  }

  return notifications
}

/**
 * Check and generate weekly financial summary (Mondays at scheduled hour).
 */
export async function checkWeeklySummary(
  userId: number,
  now: Date = new Date()
): Promise<ReminderNotification | null> {
  const prefs = getPreferences(userId)
  if (!prefs.weeklySummaryEnabled) return null

  const { isoDate, hour, weekday } = getZonedDateParts(now, prefs.timezone)
  if (weekday !== 'Mon' || hour !== prefs.reminderHour) return null

  const dedupKey = buildDedupKey(userId, 'weekly_summary', 'summary', isoDate, 'weekly_monday')
  const existingLog = getLog(dedupKey)
  if (existingLog && existingLog.status === 'sent') {
    return null
  }

  // Get previous week's dashboard summary using existing metrics
  const summary = await getDashboardSummary({
    periodType: 'week',
    referenceDate: now.toISOString(),
  })

  const spentPreviousWeek = summary.metrics.comparison?.previousTotalSpent ?? summary.metrics.totalSpent
  const topCategory = summary.topCategories && summary.topCategories.length > 0 ? summary.topCategories[0] : null
  const upcomingCount = summary.upcomingCommitments?.allUpcoming?.length || 0

  let text = `📊 <b>Sua semana no Finanças</b>\n\n`
  text += `• <b>Gastos da semana anterior:</b> ${formatBRL(spentPreviousWeek)}\n`
  if (topCategory) {
    text += `• <b>Maior categoria:</b> ${topCategory.category} (${formatBRL(topCategory.total)})\n`
  }
  text += `• <b>Compromissos nos próximos 7 dias:</b> ${upcomingCount} lançamento(s)\n`

  const buttons = [
    { text: '📊 Ver gastos', callbackData: 'rem_open_gastos' },
    { text: '📅 Próximos vencimentos', callbackData: 'rem_open_vencimentos' },
  ]

  return {
    dedupKey,
    userId,
    type: 'weekly_summary',
    text,
    buttons,
  }
}

/**
 * Run all reminder checks for an authorized user.
 * Filters out stale notifications (> 24 hours).
 */
export async function collectPendingReminders(
  userId: number,
  now: Date = new Date()
): Promise<ReminderNotification[]> {
  const results: ReminderNotification[] = []

  const invoiceAlerts = await checkInvoiceReminders(userId, now)
  results.push(...invoiceAlerts)

  const recAlerts = await checkRecurrenceReminders(userId, now)
  results.push(...recAlerts)

  const weeklyAlert = await checkWeeklySummary(userId, now)
  if (weeklyAlert) {
    results.push(weeklyAlert)
  }

  return results
}
