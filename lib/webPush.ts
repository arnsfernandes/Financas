import webpush from 'web-push'
import { getSupabaseClient } from './persist'
import { listAccounts, listTransactions } from './queries'
import { groupTransactionsIntoInvoices } from './billingCycles'
import { formatBRL } from './formatters'
import type { Account } from './schema'

/**
 * Configure VAPID details for Web Push
 */
function configureVapid() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT || 'mailto:suporte@financas.local'

  if (publicKey && privateKey) {
    webpush.setVapidDetails(subject, publicKey, privateKey)
    return true
  }
  return false
}

export interface PushSubscriptionRecord {
  id?: string
  userId: string
  endpoint: string
  p256dh: string
  auth: string
  userAgent?: string | null
}

export interface PushNotificationPayload {
  title: string
  body: string
  icon?: string
  badge?: string
  url?: string
  tag?: string
  data?: Record<string, any>
}

export interface GeneratedPushReminder {
  dedupKey: string
  userId: string
  type: 'invoice' | 'recurrence'
  entityId: string
  targetDate: string
  stage: '3_days_before' | 'due_day'
  payload: PushNotificationPayload
}

/**
 * Saves or updates a device push subscription for a user
 */
export async function savePushSubscription(sub: PushSubscriptionRecord): Promise<boolean> {
  const supabase = getSupabaseClient()
  if (!supabase) return false

  const { error } = await supabase
    .from('push_subscriptions')
    .upsert(
      {
        user_id: sub.userId,
        endpoint: sub.endpoint,
        p256dh: sub.p256dh,
        auth: sub.auth,
        user_agent: sub.userAgent || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'endpoint' }
    )

  if (error) {
    console.error('Error saving push subscription:', error)
    return false
  }
  return true
}

/**
 * Removes an invalid or expired push subscription
 */
export async function deletePushSubscription(endpoint: string): Promise<boolean> {
  const supabase = getSupabaseClient()
  if (!supabase) return false

  const { error } = await supabase
    .from('push_subscriptions')
    .delete()
    .eq('endpoint', endpoint)

  if (error) {
    console.error('Error deleting push subscription:', error)
    return false
  }
  return true
}

/**
 * Helper to calculate days diff (target - current) in UTC
 */
function diffDays(currentDateStr: string, targetDateStr: string): number {
  const c = new Date(currentDateStr + 'T00:00:00Z')
  const t = new Date(targetDateStr + 'T00:00:00Z')
  return Math.round((t.getTime() - c.getTime()) / (1000 * 60 * 60 * 24))
}

/**
 * Format YYYY-MM-DD to DD/MM
 */
function formatBrDate(dateStr: string): string {
  if (!dateStr || dateStr.length < 10) return dateStr
  const [, m, d] = dateStr.slice(0, 10).split('-')
  return `${d}/${m}`
}

/**
 * Checks pending credit card invoice reminders for a specific user.
 * - 3 days before due date (stage: '3_days_before')
 * - On due date (stage: 'due_day')
 * - Only for invoices with amount > 0 and not marked as paid
 */
export async function checkUserInvoicePushReminders(
  userId: string,
  now: Date = new Date()
): Promise<GeneratedPushReminder[]> {
  const reminders: GeneratedPushReminder[] = []
  const todayStr = now.toISOString().slice(0, 10)

  // 1. Fetch user's credit card accounts
  const accounts = await listAccounts({ activeOnly: true, userId })
  const creditCards = accounts.filter((a) => a.type === 'credit_card')
  if (creditCards.length === 0) return reminders

  const accountsMap = Object.fromEntries(accounts.map((a) => [a.id, a]))

  // 2. Fetch all user transactions
  const { transactions } = await listTransactions({ limit: 1000, userId })
  if (transactions.length === 0) return reminders

  const cardTxs = transactions.filter((t) => t.account_id && accountsMap[t.account_id]?.type === 'credit_card')
  if (cardTxs.length === 0) return reminders

  const invoices = groupTransactionsIntoInvoices(cardTxs, accountsMap)

  for (const inv of invoices) {
    if (inv.total <= 0) continue

    const days = diffDays(todayStr, inv.dueDate)
    let stage: '3_days_before' | 'due_day' | null = null

    if (days === 3) {
      stage = '3_days_before'
    } else if (days === 0) {
      stage = 'due_day'
    }

    if (!stage) continue

    const card = accountsMap[inv.accountId]
    const cardName = card?.name || inv.accountName || 'Cartão de Crédito'
    const dedupKey = `push:${userId}:invoice:${inv.accountId}:${inv.dueDate}:${stage}`
    const formattedTotal = formatBRL(inv.total)
    const formattedDueDate = formatBrDate(inv.dueDate)

      const title = stage === 'due_day'
        ? `💳 Fatura do ${cardName} vence hoje!`
        : `💳 Fatura do ${cardName} vence em 3 dias`

      const body = stage === 'due_day'
        ? `Sua fatura de ${formattedTotal} vence hoje (${formattedDueDate}). Não se esqueça de pagar para evitar juros.`
        : `Sua fatura no valor de ${formattedTotal} vence dia ${formattedDueDate}.`

      reminders.push({
        dedupKey,
        userId,
        type: 'invoice',
        entityId: inv.accountId,
        targetDate: inv.dueDate,
        stage,
        payload: {
          title,
          body,
          icon: '/icon-192.png',
          badge: '/icon-192.png',
          url: '/?tab=accounts',
          tag: `invoice-${inv.accountId}-${inv.dueDate}`,
          data: {
            type: 'invoice',
            cardId: inv.accountId,
            dueDate: inv.dueDate,
            amount: inv.total,
          },
        },
      })
    }

  return reminders
}

/**
 * Checks pending recurring expense reminders for a specific user.
 * - 3 days before next expected date (stage: '3_days_before')
 * - On due date (stage: 'due_day')
 */
export async function checkUserRecurrencePushReminders(
  userId: string,
  now: Date = new Date()
): Promise<GeneratedPushReminder[]> {
  const reminders: GeneratedPushReminder[] = []
  const todayStr = now.toISOString().slice(0, 10)

  const { transactions } = await listTransactions({
    isRecurring: true,
    recurrenceStatus: 'active',
    userId,
    limit: 500,
  })

  for (const tx of transactions) {
    if (tx.type !== 'expense') continue
    const nextDate = tx.recurrence_next_date || tx.date
    if (!nextDate) continue

    const days = diffDays(todayStr, nextDate)
    let stage: '3_days_before' | 'due_day' | null = null

    if (days === 3) {
      stage = '3_days_before'
    } else if (days === 0) {
      stage = 'due_day'
    }

    if (!stage) continue

    const dedupKey = `push:${userId}:recurrence:${tx.id}:${nextDate}:${stage}`
    const vendorName = tx.vendor || 'Lançamento recorrente'
    const formattedTotal = formatBRL(Number(tx.total) || 0)
    const formattedNextDate = formatBrDate(nextDate)

    const title = stage === 'due_day'
      ? `📅 Conta ${vendorName} vence hoje!`
      : `📅 Conta ${vendorName} vence em 3 dias`

    const body = stage === 'due_day'
      ? `O pagamento de ${vendorName} no valor de ${formattedTotal} está programado para hoje (${formattedNextDate}).`
      : `O pagamento de ${vendorName} (${formattedTotal}) vence no dia ${formattedNextDate}.`

    reminders.push({
      dedupKey,
      userId,
      type: 'recurrence',
      entityId: tx.id,
      targetDate: nextDate,
      stage,
      payload: {
        title,
        body,
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        url: '/?tab=transactions',
        tag: `recurrence-${tx.id}-${nextDate}`,
        data: {
          type: 'recurrence',
          transactionId: tx.id,
          date: nextDate,
          amount: tx.total,
        },
      },
    })
  }

  return reminders
}

/**
 * Checks if a push reminder has already been sent (deduplication)
 */
export async function isPushAlreadySent(dedupKey: string): Promise<boolean> {
  const supabase = getSupabaseClient()
  if (!supabase) return false

  const { data, error } = await supabase
    .from('push_notification_logs')
    .select('id')
    .eq('dedup_key', dedupKey)
    .limit(1)

  if (error || !data) return false
  return data.length > 0
}

/**
 * Logs a sent push notification in push_notification_logs
 */
export async function logPushSent(reminder: GeneratedPushReminder): Promise<void> {
  const supabase = getSupabaseClient()
  if (!supabase) return

  try {
    const { error } = await supabase
      .from('push_notification_logs')
      .insert({
        user_id: reminder.userId,
        dedup_key: reminder.dedupKey,
        type: reminder.type,
        entity_id: reminder.entityId,
        target_date: reminder.targetDate,
        stage: reminder.stage,
        title: reminder.payload.title,
        body: reminder.payload.body,
      })

    if (error) {
      console.warn('Could not insert push_notification_log:', error.message)
    }
  } catch (err) {
    console.warn('Exception inserting push_notification_log:', err)
  }
}

/**
 * Sends a push notification to all active devices of a given user
 */
export async function sendPushToUser(
  userId: string,
  payload: PushNotificationPayload
): Promise<{ sent: number; failed: number }> {
  const supabase = getSupabaseClient()
  if (!supabase) return { sent: 0, failed: 0 }

  const configured = configureVapid()
  if (!configured) {
    console.warn('VAPID keys not configured, skipping push notification delivery')
    return { sent: 0, failed: 0 }
  }

  // Fetch all active subscriptions for the user
  const { data: subscriptions, error } = await supabase
    .from('push_subscriptions')
    .select('*')
    .eq('user_id', userId)

  if (error || !subscriptions || subscriptions.length === 0) {
    return { sent: 0, failed: 0 }
  }

  let sent = 0
  let failed = 0
  const stringifiedPayload = JSON.stringify(payload)

  for (const sub of subscriptions) {
    const pushSubscription = {
      endpoint: sub.endpoint,
      keys: {
        p256dh: sub.p256dh,
        auth: sub.auth,
      },
    }

    try {
      await webpush.sendNotification(pushSubscription, stringifiedPayload, {
        TTL: 24 * 60 * 60, // 24 hours
        urgency: 'high',
      })
      sent++
    } catch (err: any) {
      console.warn(`Web push delivery failed for endpoint (${sub.endpoint.slice(0, 30)}...):`, err?.statusCode || err?.message)
      failed++
      // If subscription expired or gone (404 / 410), clean it up
      if (err?.statusCode === 404 || err?.statusCode === 410) {
        await deletePushSubscription(sub.endpoint)
      }
    }
  }

  return { sent, failed }
}

/**
 * Main dispatcher: finds all pending reminders for all users or a specific user,
 * filters duplicates, and delivers them via Web Push.
 */
export async function processAutomaticPushReminders(
  specificUserId?: string,
  now: Date = new Date()
): Promise<{ processed: number; sentCount: number; deduplicated: number }> {
  const supabase = getSupabaseClient()
  if (!supabase) return { processed: 0, sentCount: 0, deduplicated: 0 }

  // 1. Identify users to check
  let targetUserIds: string[] = []
  if (specificUserId) {
    targetUserIds = [specificUserId]
  } else {
    // Find all users who have at least one registered push subscription
    const { data: userSubRows } = await supabase
      .from('push_subscriptions')
      .select('user_id')
    const distinctUsers = Array.from(new Set((userSubRows || []).map((r) => r.user_id).filter(Boolean)))
    targetUserIds = distinctUsers
  }

  let processed = 0
  let sentCount = 0
  let deduplicated = 0

  for (const userId of targetUserIds) {
    const invoiceReminders = await checkUserInvoicePushReminders(userId, now)
    const recurrenceReminders = await checkUserRecurrencePushReminders(userId, now)
    const allReminders = [...invoiceReminders, ...recurrenceReminders]

    for (const reminder of allReminders) {
      processed++
      const alreadySent = await isPushAlreadySent(reminder.dedupKey)
      if (alreadySent) {
        deduplicated++
        continue
      }

      const { sent } = await sendPushToUser(userId, reminder.payload)
      if (sent > 0) {
        await logPushSent(reminder)
        sentCount++
      }
    }
  }

  return { processed, sentCount, deduplicated }
}
