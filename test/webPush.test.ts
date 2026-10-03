import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import {
  checkUserInvoicePushReminders,
  checkUserRecurrencePushReminders,
  isPushAlreadySent,
  processAutomaticPushReminders,
  savePushSubscription,
  deletePushSubscription,
} from '../lib/webPush'
import * as queries from '../lib/queries'
import * as persist from '../lib/persist'
import { POST as handleSubscribe } from '../app/api/push/subscribe/route'
import { GET as handleCron } from '../app/api/push/cron/route'
import * as authGuard from '../lib/authGuard'

describe('PWA Web Push Notification Engine Suite', () => {
  const USER_A_ID = 'bc5a76de-8865-4ec3-b7d5-5dfbfb8123a6'
  const USER_B_ID = '99999999-8888-7777-6666-555555555555'

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  describe('Invoice Push Reminders Generation', () => {
    it('generates reminder 3 days before invoice due date and on due date only for amount > 0', async () => {
      const mockAccounts = [
        { id: 'card-1', name: 'Nubank', type: 'credit_card', closing_day: 5, due_day: 15, active: true },
      ]

      // Current simulation date: 2026-10-12 (3 days before due date 2026-10-15)
      const simNow3Days = new Date('2026-10-12T12:00:00Z')

      const mockTransactions = [
        { id: 'tx-1', account_id: 'card-1', total: 350, type: 'expense', date: '2026-10-02' },
      ]

      vi.spyOn(queries, 'listAccounts').mockResolvedValue(mockAccounts as any)
      vi.spyOn(queries, 'listTransactions').mockResolvedValue({
        transactions: mockTransactions as any,
        total_count: 1,
        total_amount: 350,
        has_more: false,
      })

      const reminders3Days = await checkUserInvoicePushReminders(USER_A_ID, simNow3Days)
      expect(reminders3Days.length).toBe(1)
      expect(reminders3Days[0].stage).toBe('3_days_before')
      expect(reminders3Days[0].userId).toBe(USER_A_ID)
      expect(reminders3Days[0].payload.title).toContain('Fatura do Nubank vence em 3 dias')
      expect(reminders3Days[0].payload.body).toContain('350,00')
      expect(reminders3Days[0].dedupKey).toBe(`push:${USER_A_ID}:invoice:card-1:2026-10-15:3_days_before`)

      // Current simulation date: 2026-10-15 (due date)
      const simNowDue = new Date('2026-10-15T12:00:00Z')
      const remindersDue = await checkUserInvoicePushReminders(USER_A_ID, simNowDue)
      expect(remindersDue.length).toBe(1)
      expect(remindersDue[0].stage).toBe('due_day')
      expect(remindersDue[0].payload.title).toContain('Fatura do Nubank vence hoje!')
      expect(remindersDue[0].dedupKey).toBe(`push:${USER_A_ID}:invoice:card-1:2026-10-15:due_day`)
    })

    it('does not generate notification when invoice is already paid or amount is 0', async () => {
      const mockAccounts = [
        { id: 'card-1', name: 'Nubank', type: 'credit_card', closing_day: 5, due_day: 15, active: true },
      ]
      const simNow3Days = new Date('2026-10-12T12:00:00Z')

      vi.spyOn(queries, 'listAccounts').mockResolvedValue(mockAccounts as any)
      vi.spyOn(queries, 'listTransactions').mockResolvedValue({
        transactions: [], // No expenses, total 0
        total_count: 0,
        total_amount: 0,
        has_more: false,
      })

      const reminders = await checkUserInvoicePushReminders(USER_A_ID, simNow3Days)
      expect(reminders.length).toBe(0)
    })
  })

  describe('Recurrence Push Reminders Generation', () => {
    it('generates reminders 3 days before and on due date for active recurring expenses', async () => {
      const mockRecurringTxs = [
        {
          id: 'rec-1',
          vendor: 'Netflix',
          total: 55.9,
          type: 'expense',
          is_recurring: true,
          recurrence_status: 'active',
          recurrence_next_date: '2026-10-15',
          date: '2026-09-15',
        },
      ]

      vi.spyOn(queries, 'listTransactions').mockResolvedValue({
        transactions: mockRecurringTxs as any,
        total_count: 1,
        total_amount: 55.9,
        has_more: false,
      })

      // 3 days before
      const simNow3Days = new Date('2026-10-12T12:00:00Z')
      const reminders3Days = await checkUserRecurrencePushReminders(USER_A_ID, simNow3Days)
      expect(reminders3Days.length).toBe(1)
      expect(reminders3Days[0].stage).toBe('3_days_before')
      expect(reminders3Days[0].payload.title).toContain('Conta Netflix vence em 3 dias')
      expect(reminders3Days[0].payload.body).toContain('55,90')
      expect(reminders3Days[0].dedupKey).toBe(`push:${USER_A_ID}:recurrence:rec-1:2026-10-15:3_days_before`)

      // Due date
      const simNowDue = new Date('2026-10-15T12:00:00Z')
      const remindersDue = await checkUserRecurrencePushReminders(USER_A_ID, simNowDue)
      expect(remindersDue.length).toBe(1)
      expect(remindersDue[0].stage).toBe('due_day')
      expect(remindersDue[0].payload.title).toContain('Conta Netflix vence hoje!')
    })
  })

  describe('Deduplication & Multi-User Isolation', () => {
    it('never mixes reminders between different users', async () => {
      const listAccountsSpy = vi.spyOn(queries, 'listAccounts').mockImplementation(async (opt) => {
        if (opt?.userId === USER_A_ID) {
          return [{ id: 'card-a', name: 'Inter Arnaldo', type: 'credit_card', closing_day: 5, due_day: 15, active: true }] as any
        }
        return []
      })

      const listTxsSpy = vi.spyOn(queries, 'listTransactions').mockImplementation(async (opt) => {
        if (opt?.userId === USER_A_ID) {
          return {
            transactions: [{ id: 'tx-a', account_id: 'card-a', total: 120, type: 'expense', date: '2026-10-02' }] as any,
            total_count: 1,
            total_amount: 120,
            has_more: false,
          }
        }
        return { transactions: [], total_count: 0, total_amount: 0, has_more: false }
      })

      const simNow = new Date('2026-10-12T12:00:00Z')

      // User A gets their reminder
      const remA = await checkUserInvoicePushReminders(USER_A_ID, simNow)
      expect(remA.length).toBe(1)
      expect(remA[0].userId).toBe(USER_A_ID)

      // User B gets 0 reminders
      const remB = await checkUserInvoicePushReminders(USER_B_ID, simNow)
      expect(remB.length).toBe(0)
    })
  })

  describe('Push API Endpoints', () => {
    it('accepts and saves valid subscription for authenticated user', async () => {
      vi.spyOn(authGuard, 'requireFinancialAuth').mockReturnValue({
        authorized: true,
        userId: USER_A_ID,
      } as any)

      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          upsert: vi.fn().mockResolvedValue({ error: null }),
        }),
      }
      vi.spyOn(persist, 'getSupabaseClient').mockReturnValue(mockSupabase as any)

      const req = new NextRequest('http://localhost:3000/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscription: {
            endpoint: 'https://push.apple.com/sub/12345',
            keys: {
              p256dh: 'BNcRdreALRF...',
              auth: 'tBHIt8w...',
            },
          },
        }),
      })

      const res = await handleSubscribe(req)
      const data = await res.json()
      expect(data.ok).toBe(true)
      expect(mockSupabase.from).toHaveBeenCalledWith('push_subscriptions')
    })
  })
})
