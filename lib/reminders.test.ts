import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  getPreferences,
  updatePreferences,
  buildDedupKey,
  checkInvoiceReminders,
  checkRecurrenceReminders,
  checkWeeklySummary,
  setLog,
  getLog,
  getZonedDateParts,
  resetReminderStore,
} from './reminders'

// Dynamic Mock Data for queries
let mockAccounts = [
  {
    id: 'acc_inter',
    name: 'Cartão Inter',
    type: 'credit_card',
    closing_day: 5,
    due_day: 15,
    active: true,
  },
  {
    id: 'acc_nubank',
    name: 'Nubank',
    type: 'credit_card',
    closing_day: 10,
    due_day: 20,
    active: true,
  },
]

let mockTransactions = [
  {
    id: 'tx_inv_1',
    account_id: 'acc_inter',
    type: 'expense',
    total: 150.0,
    date: '2026-10-02',
  },
  {
    id: 'rec_internet',
    type: 'expense',
    vendor: 'Internet',
    total: 99.9,
    is_recurring: true,
    recurrence_status: 'active',
    recurrence_next_date: '2026-10-12',
  },
]

vi.mock('./queries', () => ({
  listAccounts: vi.fn(async () => mockAccounts),
  listTransactions: vi.fn(async () => ({
    transactions: mockTransactions,
    total_count: mockTransactions.length,
    total_amount: mockTransactions.reduce((acc, t) => acc + (t.total || 0), 0),
  })),
  getDashboardSummary: vi.fn(async () => ({
    period: { label: 'Outubro de 2026' },
    metrics: {
      totalSpent: 1200.0,
      totalExpenses: 1200.0,
      comparison: { previousTotalSpent: 1150.0 },
    },
    topCategories: [{ category: 'Alimentação', rawCategory: 'Alimentação', total: 500.0, percentage: 41.6, count: 5 }],
    upcomingCommitments: { allUpcoming: [{ id: '1' }, { id: '2' }] },
  })),
  getTransactionById: vi.fn(async (id: string) => mockTransactions.find((t) => t.id === id) || null),
}))

describe('Telegram Bot Reminders Suite (lib/reminders.ts)', () => {
  const userId = 997305354

  beforeEach(() => {
    resetReminderStore()
    mockAccounts = [
      {
        id: 'acc_inter',
        name: 'Cartão Inter',
        type: 'credit_card',
        closing_day: 5,
        due_day: 15,
        active: true,
      },
      {
        id: 'acc_nubank',
        name: 'Nubank',
        type: 'credit_card',
        closing_day: 10,
        due_day: 20,
        active: true,
      },
    ]

    mockTransactions = [
      {
        id: 'tx_inv_1',
        account_id: 'acc_inter',
        type: 'expense',
        total: 150.0,
        date: '2026-10-02',
      },
      {
        id: 'rec_internet',
        type: 'expense',
        vendor: 'Internet',
        total: 99.9,
        is_recurring: true,
        recurrence_status: 'active',
        recurrence_next_date: '2026-10-12',
      },
    ]

    // Reset preferences
    updatePreferences(userId, {
      invoicesEnabled: false,
      recurrencesEnabled: false,
      weeklySummaryEnabled: false,
      reminderHour: 9,
      timezone: 'America/Sao_Paulo',
    })
  })

  describe('Preferences & Defaults', () => {
    it('initializes with all reminders disabled by default and 9h America/Sao_Paulo', () => {
      const prefs = getPreferences(userId)
      expect(prefs.invoicesEnabled).toBe(false)
      expect(prefs.recurrencesEnabled).toBe(false)
      expect(prefs.weeklySummaryEnabled).toBe(false)
      expect(prefs.reminderHour).toBe(9)
      expect(prefs.timezone).toBe('America/Sao_Paulo')
    })

    it('allows toggling preferences individually', () => {
      updatePreferences(userId, { invoicesEnabled: true })
      expect(getPreferences(userId).invoicesEnabled).toBe(true)
      expect(getPreferences(userId).recurrencesEnabled).toBe(false)

      updatePreferences(userId, { reminderHour: 8 })
      expect(getPreferences(userId).reminderHour).toBe(8)
    })
  })

  describe('Credit Card Invoices Reminders', () => {
    it('does not send invoice reminders when invoicesEnabled is false', async () => {
      // 3 days before 2026-10-15 is 2026-10-12 at 09:00
      const date = new Date('2026-10-12T12:00:00Z') // 09:00 in America/Sao_Paulo (-03:00)
      const alerts = await checkInvoiceReminders(userId, date)
      expect(alerts.length).toBe(0)
    })

    it('generates 3-day invoice alert when invoicesEnabled is true and hour matches', async () => {
      updatePreferences(userId, { invoicesEnabled: true, reminderHour: 9 })

      // 2026-10-12 09:00 Sao Paulo time (12:00 UTC)
      const date = new Date('2026-10-12T12:00:00Z')
      const alerts = await checkInvoiceReminders(userId, date)

      expect(alerts.length).toBe(1)
      expect(alerts[0].text).toContain('Fatura próxima')
      expect(alerts[0].text).toContain('15/10')
      expect(alerts[0].buttons?.some((b) => b.text.includes('Dispensar'))).toBe(true)
      expect(alerts[0].buttons?.some((b) => b.text.includes('Lembrar amanhã'))).toBe(true)
    })

    it('generates due-day invoice alert on the exact due date', async () => {
      updatePreferences(userId, { invoicesEnabled: true, reminderHour: 9 })

      // 2026-10-15 09:00 Sao Paulo time (12:00 UTC)
      const date = new Date('2026-10-15T12:00:00Z')
      const alerts = await checkInvoiceReminders(userId, date)

      expect(alerts.length).toBe(1)
      expect(alerts[0].text).toContain('Fatura vence hoje')
      expect(alerts[0].text).toContain('15/10')
    })

    it('does not send duplicate alert if already sent', async () => {
      updatePreferences(userId, { invoicesEnabled: true, reminderHour: 9 })

      const date = new Date('2026-10-12T12:00:00Z')
      const dedupKey = buildDedupKey(userId, 'invoice', 'acc_inter', '2026-10-15', '3_days_before')

      setLog({
        dedupKey,
        userId,
        type: 'invoice',
        stage: '3_days_before',
        status: 'sent',
        timestamp: Date.now(),
      })

      const alerts = await checkInvoiceReminders(userId, date)
      expect(alerts.length).toBe(0)
    })

    it('does not send alert if cycle was dismissed by user', async () => {
      updatePreferences(userId, { invoicesEnabled: true, reminderHour: 9 })

      const date = new Date('2026-10-12T12:00:00Z')
      const cycleDismissKey = buildDedupKey(userId, 'invoice', 'acc_inter', '2026-10-15', 'due_day')

      setLog({
        dedupKey: cycleDismissKey,
        userId,
        type: 'invoice',
        stage: 'due_day',
        status: 'dismissed',
        timestamp: Date.now(),
      })

      const alerts = await checkInvoiceReminders(userId, date)
      expect(alerts.length).toBe(0)
    })
  })

  describe('Recurring Expense Reminders', () => {
    it('generates recurrence reminder 1 day before next date', async () => {
      updatePreferences(userId, { recurrencesEnabled: true, reminderHour: 9 })

      // Recurrence next date is 2026-10-12. 1 day before is 2026-10-11 at 09:00 (12:00 UTC)
      const date = new Date('2026-10-11T12:00:00Z')
      const alerts = await checkRecurrenceReminders(userId, date)

      expect(alerts.length).toBe(1)
      expect(alerts[0].text).toContain('Despesa recorrente amanhã')
      expect(alerts[0].text).toContain('Internet')
      expect(alerts[0].text).toContain('12/10')
      expect(alerts[0].text).toMatch(/99,90/)
    })

    it('does not send recurrence reminder if disabled', async () => {
      updatePreferences(userId, { recurrencesEnabled: false })
      const date = new Date('2026-10-11T12:00:00Z')
      const alerts = await checkRecurrenceReminders(userId, date)
      expect(alerts.length).toBe(0)
    })
  })

  describe('Weekly Financial Summary Reminders', () => {
    it('generates weekly summary on Mondays at 9h', async () => {
      updatePreferences(userId, { weeklySummaryEnabled: true, reminderHour: 9 })

      // 2026-10-12 is Monday. 12:00 UTC is 09:00 America/Sao_Paulo
      const mondayDate = new Date('2026-10-12T12:00:00Z')
      const alert = await checkWeeklySummary(userId, mondayDate)

      expect(alert).not.toBeNull()
      expect(alert?.text).toContain('Sua semana no Finanças')
      expect(alert?.text).toContain('Gastos da semana anterior')
      expect(alert?.text).toContain('Alimentação')
    })

    it('does not generate weekly summary on non-Mondays', async () => {
      updatePreferences(userId, { weeklySummaryEnabled: true, reminderHour: 9 })

      // 2026-10-13 is Tuesday
      const tuesdayDate = new Date('2026-10-13T12:00:00Z')
      const alert = await checkWeeklySummary(userId, tuesdayDate)

      expect(alert).toBeNull()
    })
  })

  describe('Dynamic Changes & Live State Suite (No Stale Calendars)', () => {
    it('(1) Card Due Date Change: old date alerts cease, new date alerts fire once, old dismissals do not suppress new date', async () => {
      updatePreferences(userId, { invoicesEnabled: true, reminderHour: 9 })

      // Initial state: Inter due_day = 15. On 2026-10-12 (3 days before 15), user dismissed or received alert
      const oldDueDate = '2026-10-15'
      const oldDismissKey = buildDedupKey(userId, 'invoice', 'acc_inter', oldDueDate, 'due_day')
      setLog({
        dedupKey: oldDismissKey,
        userId,
        type: 'invoice',
        stage: 'due_day',
        status: 'dismissed',
        timestamp: Date.now(),
      })

      // User changes due date of Inter to 25 (due_day = 25, closing_day = 15)
      mockAccounts = mockAccounts.map((acc) =>
        acc.id === 'acc_inter' ? { ...acc, due_day: 25, closing_day: 15 } : acc
      )

      // Test 1: On old 3-day alert date (2026-10-12), NO reminder is generated for Inter
      const oldAlertDate = new Date('2026-10-12T12:00:00Z')
      const oldAlerts = await checkInvoiceReminders(userId, oldAlertDate)
      expect(oldAlerts.some((a) => a.text.includes('Cartão Inter'))).toBe(false)

      // Test 2: On new 3-day alert date (3 days before 2026-10-25 is 2026-10-22 at 09:00 SP time)
      const newAlertDate = new Date('2026-10-22T12:00:00Z')
      const newAlerts = await checkInvoiceReminders(userId, newAlertDate)
      expect(newAlerts.length).toBe(1)
      expect(newAlerts[0].text).toContain('Cartão Inter')
      expect(newAlerts[0].text).toContain('25/10')
      expect(newAlerts[0].dedupKey).toContain('2026-10-25:3_days_before')

      // Mark as sent
      setLog({
        dedupKey: newAlerts[0].dedupKey,
        userId,
        type: 'invoice',
        stage: '3_days_before',
        status: 'sent',
        timestamp: Date.now(),
      })

      // Test 3: Deduplication ensures it does not fire again for the new date
      const repeatAlerts = await checkInvoiceReminders(userId, newAlertDate)
      expect(repeatAlerts.length).toBe(0)
    })

    it('(2) Add New Card: immediately recognized on next calculation without restart', async () => {
      updatePreferences(userId, { invoicesEnabled: true, reminderHour: 9 })

      // User adds a new card "Cartão C6" with due_day = 10
      mockAccounts.push({
        id: 'acc_c6',
        name: 'Cartão C6',
        type: 'credit_card',
        closing_day: 1,
        due_day: 10,
        active: true,
      })

      // 3 days before 2026-10-10 is 2026-10-07 at 09:00 SP time (12:00 UTC)
      const alertDate = new Date('2026-10-07T12:00:00Z')
      const alerts = await checkInvoiceReminders(userId, alertDate)

      expect(alerts.length).toBe(1)
      expect(alerts[0].text).toContain('Cartão C6')
      expect(alerts[0].text).toContain('10/10')
      expect(alerts[0].dedupKey).toContain('acc_c6:2026-10-10:3_days_before')
    })

    it('(3) Change Recurring Expense Date: old date alerts cease, new date triggers 1 day before', async () => {
      updatePreferences(userId, { recurrencesEnabled: true, reminderHour: 9 })

      // Initial recurring next date was 2026-10-12 (alert would be 2026-10-11).
      // Suppose old occurrence was dismissed
      const oldDate = '2026-10-12'
      const oldDismissKey = buildDedupKey(userId, 'recurrence', 'rec_internet', oldDate, '1_day_before')
      setLog({
        dedupKey: oldDismissKey,
        userId,
        type: 'recurrence',
        stage: '1_day_before',
        status: 'dismissed',
        timestamp: Date.now(),
      })

      // User alters next recurrence date from 2026-10-12 to 2026-10-20
      mockTransactions = mockTransactions.map((tx) =>
        tx.id === 'rec_internet' ? { ...tx, recurrence_next_date: '2026-10-20' } : tx
      )

      // Test 1: On old alert day (2026-10-11), NO reminder is generated
      const oldAlertDate = new Date('2026-10-11T12:00:00Z')
      const oldAlerts = await checkRecurrenceReminders(userId, oldAlertDate)
      expect(oldAlerts.length).toBe(0)

      // Test 2: On new alert day (1 day before 2026-10-20 is 2026-10-19 at 09:00 SP time)
      const newAlertDate = new Date('2026-10-19T12:00:00Z')
      const newAlerts = await checkRecurrenceReminders(userId, newAlertDate)
      expect(newAlerts.length).toBe(1)
      expect(newAlerts[0].text).toContain('Internet')
      expect(newAlerts[0].text).toContain('20/10')
      expect(newAlerts[0].dedupKey).toBe(buildDedupKey(userId, 'recurrence', 'rec_internet', '2026-10-20', '1_day_before'))

      // Mark as sent
      setLog({
        dedupKey: newAlerts[0].dedupKey,
        userId,
        type: 'recurrence',
        stage: '1_day_before',
        status: 'sent',
        timestamp: Date.now(),
      })

      // Test 3: Deduplication ensures it does not fire again for the new date
      const repeatAlerts = await checkRecurrenceReminders(userId, newAlertDate)
      expect(repeatAlerts.length).toBe(0)
    })
  })
})
