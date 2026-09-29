import { describe, it, expect } from 'vitest'
import {
  getCardInvoiceDates,
  isImmediatePayment,
  groupTransactionsIntoInvoices,
} from './billingCycles'

describe('Billing Cycles & Invoices', () => {
  describe('getCardInvoiceDates', () => {
    it('calculates invoice for purchase before closing day (closing 5, due 15)', () => {
      // Purchase on Sept 3: day 3 <= 5 -> Closes 2026-09-05, Due 2026-09-15
      const dates = getCardInvoiceDates('2026-09-03', 5, 15)
      expect(dates.closingDate).toBe('2026-09-05')
      expect(dates.dueDate).toBe('2026-09-15')
    })

    it('calculates invoice for purchase on closing day (closing 5, due 15)', () => {
      // Purchase on Sept 5: day 5 <= 5 -> Closes 2026-09-05, Due 2026-09-15
      const dates = getCardInvoiceDates('2026-09-05', 5, 15)
      expect(dates.closingDate).toBe('2026-09-05')
      expect(dates.dueDate).toBe('2026-09-15')
    })

    it('calculates invoice for purchase after closing day (closing 5, due 15)', () => {
      // Purchase on Sept 6: day 6 > 5 -> Closes 2026-10-05, Due 2026-10-15
      const dates = getCardInvoiceDates('2026-09-06', 5, 15)
      expect(dates.closingDate).toBe('2026-10-05')
      expect(dates.dueDate).toBe('2026-10-15')
    })

    it('handles cards where dueDay <= closingDay (e.g. closing 25, due 5 of next month)', () => {
      // Purchase on Sept 20: day 20 <= 25 -> Closes 2026-09-25, Due 2026-10-05
      const dates1 = getCardInvoiceDates('2026-09-20', 25, 5)
      expect(dates1.closingDate).toBe('2026-09-25')
      expect(dates1.dueDate).toBe('2026-10-05')

      // Purchase on Sept 26: day 26 > 25 -> Closes 2026-10-25, Due 2026-11-05
      const dates2 = getCardInvoiceDates('2026-09-26', 25, 5)
      expect(dates2.closingDate).toBe('2026-10-25')
      expect(dates2.dueDate).toBe('2026-11-05')
    })

    it('handles year-end rollover', () => {
      // Purchase on Dec 28 with closing 25, due 5
      const dates = getCardInvoiceDates('2026-12-28', 25, 5)
      expect(dates.closingDate).toBe('2027-01-25')
      expect(dates.dueDate).toBe('2027-02-05')
    })

    it('clamps month-end correctly for months with fewer days', () => {
      // Purchase with closing 31 in February (leap year check or 28 days)
      const dates = getCardInvoiceDates('2026-02-10', 31, 31)
      expect(dates.closingDate).toBe('2026-02-28')
      expect(dates.dueDate).toBe('2026-03-31')
    })
  })

  describe('isImmediatePayment', () => {
    it('identifies PIX, debit, cash, and transfer as immediate', () => {
      expect(isImmediatePayment('PIX')).toBe(true)
      expect(isImmediatePayment('Pix Transferência')).toBe(true)
      expect(isImmediatePayment('Cartão de Débito')).toBe(true)
      expect(isImmediatePayment('Dinheiro')).toBe(true)
      expect(isImmediatePayment('TED / DOC')).toBe(true)
      expect(isImmediatePayment(undefined, 'cash')).toBe(true)
      expect(isImmediatePayment(undefined, 'debit_card')).toBe(true)
    })

    it('does not classify credit card as immediate', () => {
      expect(isImmediatePayment('Cartão de Crédito', 'credit_card')).toBe(false)
      expect(isImmediatePayment('Crédito')).toBe(false)
      expect(isImmediatePayment('Boleto')).toBe(false)
    })
  })

  describe('groupTransactionsIntoInvoices', () => {
    it('groups multiple purchases into their respective invoices without duplication', () => {
      const accountsMap = {
        'acc-inter': {
          id: 'acc-inter',
          name: 'Inter',
          type: 'credit_card',
          closing_day: 5,
          due_day: 15,
        },
      }

      const txs = [
        {
          id: 'tx-1',
          type: 'expense',
          account_id: 'acc-inter',
          vendor: 'Mercado',
          total: 100,
          date: '2026-09-02',
        },
        {
          id: 'tx-2',
          type: 'expense',
          account_id: 'acc-inter',
          vendor: 'Farmácia',
          total: 50,
          date: '2026-09-04',
        },
        {
          id: 'tx-3',
          type: 'expense',
          account_id: 'acc-inter',
          vendor: 'Restaurante',
          total: 80,
          date: '2026-09-10', // after closing -> Oct 15 invoice
        },
      ]

      const invoices = groupTransactionsIntoInvoices(txs, accountsMap)
      expect(invoices).toHaveLength(2)

      // Invoice 1: Sept 15
      expect(invoices[0].dueDate).toBe('2026-09-15')
      expect(invoices[0].total).toBe(150)
      expect(invoices[0].items).toHaveLength(2)

      // Invoice 2: Oct 15
      expect(invoices[1].dueDate).toBe('2026-10-15')
      expect(invoices[1].total).toBe(80)
      expect(invoices[1].items).toHaveLength(1)
    })
  })
})
