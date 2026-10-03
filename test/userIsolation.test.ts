import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { GET as getTransactions, POST as createTransaction } from '../app/api/transactions/route'
import { GET as getAccounts, POST as createAccount } from '../app/api/accounts/route'
import { GET as getCategories, POST as createCategory } from '../app/api/categories/route'
import { GET as getReserves, POST as createReserve } from '../app/api/reserves/route'
import { GET as getDashboard } from '../app/api/dashboard/route'
import * as authGuard from '../lib/authGuard'
import * as queries from '../lib/queries'
import * as reservesLib from '../lib/reserves'
import * as persistLib from '../lib/persist'

describe('Multi-User Financial Data Isolation Suite', () => {
  const USER_A_ID = 'bc5a76de-8865-4ec3-b7d5-5dfbfb8123a6'
  const USER_B_ID = '99999999-8888-7777-6666-555555555555'

  const userAAuth = {
    authorized: true,
    user: { id: USER_A_ID, email: 'arnfernandes@financas.local', user_metadata: { name: 'Arnaldo' } },
    userId: USER_A_ID,
  }

  const userBAuth = {
    authorized: true,
    user: { id: USER_B_ID, email: 'userb@financas.local', user_metadata: { name: 'User B' } },
    userId: USER_B_ID,
  }

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Transactions Isolation', () => {
    it('ensures User B does not receive User A transactions', async () => {
      // Mock listTransactions to observe the userId filter passed
      const listSpy = vi.spyOn(queries, 'listTransactions').mockImplementation(async (filter) => {
        if (filter.userId === USER_A_ID) {
          return {
            transactions: [
              { id: 'tx-a-1', user_id: USER_A_ID, total: 100, vendor: 'Posto A', type: 'expense', date: '2026-10-01' } as any,
            ],
            total_count: 1,
            total_amount: 100,
            has_more: false,
          }
        }
        if (filter.userId === USER_B_ID) {
          return {
            transactions: [],
            total_count: 0,
            total_amount: 0,
            has_more: false,
          }
        }
        return { transactions: [], total_count: 0, total_amount: 0, has_more: false }
      })

      // Query as User A
      vi.spyOn(authGuard, 'requireFinancialAuth').mockReturnValueOnce(userAAuth as any)
      const reqA = new NextRequest('http://localhost:3000/api/transactions')
      const resA = await getTransactions(reqA)
      const dataA = await resA.json()

      expect(dataA.ok).toBe(true)
      expect(dataA.total_count).toBe(1)
      expect(dataA.transactions[0].id).toBe('tx-a-1')
      expect(listSpy).toHaveBeenLastCalledWith(expect.objectContaining({ userId: USER_A_ID }))

      // Query as User B
      vi.spyOn(authGuard, 'requireFinancialAuth').mockReturnValueOnce(userBAuth as any)
      const reqB = new NextRequest('http://localhost:3000/api/transactions')
      const resB = await getTransactions(reqB)
      const dataB = await resB.json()

      expect(dataB.ok).toBe(true)
      expect(dataB.total_count).toBe(0)
      expect(dataB.transactions).toEqual([])
      expect(listSpy).toHaveBeenLastCalledWith(expect.objectContaining({ userId: USER_B_ID }))
    })

    it('attaches authenticated userId when creating a transaction', async () => {
      vi.spyOn(authGuard, 'requireFinancialAuth').mockReturnValue(userBAuth as any)
      vi.spyOn(queries, 'listAccounts').mockResolvedValue([])

      const saveSpy = vi.spyOn(persistLib, 'save').mockImplementation(async (input) => {
        return {
          id: 'new-tx-b',
          user_id: input.userId,
          total: input.receipt.total,
          vendor: input.receipt.vendor,
          date: input.receipt.date,
          currency: 'BRL',
          created_at: '2026-10-02T20:00:00Z',
          items: [],
        } as any
      })

      const req = new NextRequest('http://localhost:3000/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receipt: {
            vendor: 'Padaria B',
            total: 25.5,
            date: '2026-10-02',
            type: 'expense',
            payment_method: 'Dinheiro',
          },
          sourceType: 'manual',
        }),
      })

      const res = await createTransaction(req)
      const data = await res.json()

      expect(data.ok).toBe(true)
      expect(saveSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: USER_B_ID,
          receipt: expect.objectContaining({ user_id: USER_B_ID }),
        })
      )
    })
  })

  describe('Accounts & Stats Isolation', () => {
    it('scopes listAccountsWithStats to the authenticated user', async () => {
      const accountsSpy = vi.spyOn(queries, 'listAccountsWithStats').mockImplementation(async (options) => {
        if (options?.userId === USER_A_ID) {
          return [
            { id: 'acc-a-1', user_id: USER_A_ID, name: 'Nubank Arnaldo', type: 'credit_card', active: true, transactionCount: 50 },
          ]
        }
        if (options?.userId === USER_B_ID) {
          return []
        }
        return []
      })

      // Query as User B
      vi.spyOn(authGuard, 'requireFinancialAuth').mockReturnValueOnce(userBAuth as any)
      const reqB = new NextRequest('http://localhost:3000/api/accounts')
      const resB = await getAccounts(reqB)
      const dataB = await resB.json()

      expect(dataB.ok).toBe(true)
      expect(dataB.accounts).toEqual([])
      expect(accountsSpy).toHaveBeenCalledWith(expect.objectContaining({ userId: USER_B_ID }))

      // Query as User A
      vi.spyOn(authGuard, 'requireFinancialAuth').mockReturnValueOnce(userAAuth as any)
      const reqA = new NextRequest('http://localhost:3000/api/accounts')
      const resA = await getAccounts(reqA)
      const dataA = await resA.json()

      expect(dataA.ok).toBe(true)
      expect(dataA.accounts.length).toBe(1)
      expect(dataA.accounts[0].name).toBe('Nubank Arnaldo')
      expect(accountsSpy).toHaveBeenCalledWith(expect.objectContaining({ userId: USER_A_ID }))
    })

    it('assigns authenticated user_id when creating a new account', async () => {
      vi.spyOn(authGuard, 'requireFinancialAuth').mockReturnValue(userBAuth as any)
      const createAccSpy = vi.spyOn(queries, 'createAccount').mockImplementation(async (input) => {
        return {
          id: 'acc-b-1',
          user_id: input.userId || USER_B_ID,
          name: input.name,
          type: input.type,
          active: true,
        }
      })

      const req = new NextRequest('http://localhost:3000/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Inter B',
          type: 'bank_account',
        }),
      })

      const res = await createAccount(req)
      const data = await res.json()

      expect(data.ok).toBe(true)
      expect(createAccSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: USER_B_ID,
          name: 'Inter B',
        })
      )
    })
  })

  describe('Reserves Isolation', () => {
    it('scopes getReserves to the authenticated user', async () => {
      const reservesSpy = vi.spyOn(reservesLib, 'getReserves').mockImplementation(async (userId) => {
        if (userId === USER_A_ID) {
          return [{ id: 'res-a', user_id: USER_A_ID, name: 'Emergência A', currentBalance: 5000 }]
        }
        return []
      })

      vi.spyOn(authGuard, 'requireFinancialAuth').mockReturnValueOnce(userBAuth as any)
      const reqB = new NextRequest('http://localhost:3000/api/reserves')
      const resB = await getReserves(reqB)
      const dataB = await resB.json()

      expect(dataB.ok).toBe(true)
      expect(dataB.reserves).toEqual([])
      expect(dataB.totalSaved).toBe(0)
      expect(reservesSpy).toHaveBeenCalledWith(USER_B_ID)
    })
  })

  describe('Dashboard Isolation', () => {
    it('passes userId to getDashboardSummary to isolate metrics', async () => {
      const dashSpy = vi.spyOn(queries, 'getDashboardSummary').mockImplementation(async (filter) => {
        if (filter.userId === USER_A_ID) {
          return {
            totalSpent: 3500,
            totalIncome: 7000,
            netBalance: 3500,
            transactionCount: 42,
            period: { startDate: '2026-10-01', endDate: '2026-10-31', label: 'Outubro 2026' },
            categories: [],
            accounts: [],
            recentTransactions: [],
          } as any
        }
        return {
          totalSpent: 0,
          totalIncome: 0,
          netBalance: 0,
          transactionCount: 0,
          period: { startDate: '2026-10-01', endDate: '2026-10-31', label: 'Outubro 2026' },
          categories: [],
          accounts: [],
          recentTransactions: [],
        } as any
      })

      vi.spyOn(authGuard, 'requireFinancialAuth').mockReturnValueOnce(userBAuth as any)
      const reqB = new NextRequest('http://localhost:3000/api/dashboard?period=month')
      const resB = await getDashboard(reqB)
      const dataB = await resB.json()

      expect(dataB.ok).toBe(true)
      expect(dataB.summary.totalSpent).toBe(0)
      expect(dataB.summary.transactionCount).toBe(0)
      expect(dashSpy).toHaveBeenCalledWith(expect.objectContaining({ userId: USER_B_ID }))

      vi.spyOn(authGuard, 'requireFinancialAuth').mockReturnValueOnce(userAAuth as any)
      const reqA = new NextRequest('http://localhost:3000/api/dashboard?period=month')
      const resA = await getDashboard(reqA)
      const dataA = await resA.json()

      expect(dataA.ok).toBe(true)
      expect(dataA.summary.totalSpent).toBe(3500)
      expect(dataA.summary.transactionCount).toBe(42)
      expect(dashSpy).toHaveBeenCalledWith(expect.objectContaining({ userId: USER_A_ID }))
    })
  })
})
