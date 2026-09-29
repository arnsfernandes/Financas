import { describe, it, expect, beforeEach } from 'vitest'
import {
  matchDeterministicQuery,
  parseSingleTransactionLocally,
  getLocalRoutingStats,
  resetLocalRoutingStats,
  recordLocalQuery,
  recordLocalLaunch,
  recordAiCall,
} from './textRouter'
import type { Account, Category } from './schema'

describe('Deterministic Text Router (lib/textRouter.ts)', () => {
  const mockAccounts: Account[] = [
    {
      id: 'acc_inter_cc',
      name: 'Cartão Inter',
      type: 'credit_card',
      institution: 'Inter',
      closing_day: 5,
      due_day: 15,
      active: true,
    },
    {
      id: 'acc_nubank_checking',
      name: 'Nubank Conta',
      type: 'checking',
      institution: 'Nubank',
      active: true,
    },
    {
      id: 'acc_itau',
      name: 'Itaú Corrente',
      type: 'checking',
      institution: 'Itaú',
      active: true,
    },
  ]

  const mockCategories: Category[] = [
    { id: 'cat-mercado', name: 'Mercado', normalized_name: 'mercado', type: 'expense', icon: 'ShoppingCart', color: '#10B981', is_system: true, active: true, sort_order: 1 },
    { id: 'cat-alimentacao', name: 'Alimentação', normalized_name: 'alimentacao', type: 'expense', icon: 'UtensilsCrossed', color: '#F97316', is_system: true, active: true, sort_order: 2 },
    { id: 'cat-transporte', name: 'Transporte', normalized_name: 'transporte', type: 'expense', icon: 'Car', color: '#3B82F6', is_system: true, active: true, sort_order: 3 },
    { id: 'cat-salario', name: 'Salário', normalized_name: 'salario', type: 'income', icon: 'Briefcase', color: '#10B981', is_system: true, active: true, sort_order: 1 },
  ]

  beforeEach(() => {
    resetLocalRoutingStats()
  })

  describe('1. Deterministic Queries (Zero AI)', () => {
    it('matches general balance query ("qual meu saldo?")', () => {
      const q = matchDeterministicQuery('qual meu saldo?', mockAccounts)
      expect(q).not.toBeNull()
      expect(q?.type).toBe('balance')
      expect(q?.targetAccount).toBeUndefined()
    })

    it('matches account-specific balance query ("quanto tenho no Nubank?")', () => {
      const q = matchDeterministicQuery('quanto tenho no Nubank?', mockAccounts)
      expect(q).not.toBeNull()
      expect(q?.type).toBe('balance')
      expect(q?.targetAccount?.id).toBe('acc_nubank_checking')
    })

    it('matches invoice query ("qual a fatura do Inter?")', () => {
      const q = matchDeterministicQuery('qual a fatura do Inter?', mockAccounts)
      expect(q).not.toBeNull()
      expect(q?.type).toBe('invoice')
      expect(q?.targetAccount?.id).toBe('acc_inter_cc')
    })

    it('matches general monthly expenses query ("quanto gastei este mês?")', () => {
      const q = matchDeterministicQuery('quanto gastei este mês?', mockAccounts)
      expect(q).not.toBeNull()
      expect(q?.type).toBe('expenses')
      expect(q?.periodType).toBe('month')
    })

    it('matches category expenses query ("quanto gastei com mercado?")', () => {
      const q = matchDeterministicQuery('quanto gastei com mercado?', mockAccounts)
      expect(q).not.toBeNull()
      expect(q?.type).toBe('expenses')
      expect(q?.category).toBe('Mercado')
    })

    it('matches recent transactions query ("quais foram meus ultimos gastos?")', () => {
      const q = matchDeterministicQuery('quais foram meus ultimos gastos?', mockAccounts)
      expect(q).not.toBeNull()
      expect(q?.type).toBe('recent')
      expect(q?.limit).toBe(10)
    })

    it('flags ambiguous account query when bank is not registered ("qual a fatura do Santander?")', () => {
      const q = matchDeterministicQuery('qual a fatura do Santander?', mockAccounts)
      expect(q).not.toBeNull()
      expect(q?.type).toBe('invoice')
      expect(q?.ambiguousAccountName).toBe('santander')
    })
  })

  describe('2. Simple Launches (Zero AI)', () => {
    it('parses "gastei 80 no mercado no Pix pelo Inter"', () => {
      const res = parseSingleTransactionLocally(
        'gastei 80 no mercado no Pix pelo Inter',
        mockAccounts,
        mockCategories
      )
      expect(res.success).toBe(true)
      expect(res.receipt?.total).toBe(80)
      expect(res.receipt?.type).toBe('expense')
      expect(res.receipt?.category).toBe('Mercado')
      expect(res.receipt?.payment_method).toBe('Pix')
      expect(res.receipt?.account_id).toBe('acc_inter_cc')
    })

    it('parses "Uber R$ 32 no cartão Inter"', () => {
      const res = parseSingleTransactionLocally(
        'Uber R$ 32 no cartão Inter',
        mockAccounts,
        mockCategories
      )
      expect(res.success).toBe(true)
      expect(res.receipt?.total).toBe(32)
      expect(res.receipt?.vendor).toBe('Uber')
      expect(res.receipt?.category).toBe('Transporte')
      expect(res.receipt?.payment_method).toBe('Cartão de Crédito')
      expect(res.receipt?.account_id).toBe('acc_inter_cc')
    })

    it('parses "recebi 500 de salário"', () => {
      const res = parseSingleTransactionLocally(
        'recebi 500 de salário',
        mockAccounts,
        mockCategories
      )
      expect(res.success).toBe(true)
      expect(res.receipt?.total).toBe(500)
      expect(res.receipt?.type).toBe('income')
      expect(res.receipt?.category).toBe('Salário')
    })

    it('parses installments "comprei notebook 3000 em 10x no cartão Inter"', () => {
      const res = parseSingleTransactionLocally(
        'comprei notebook 3000 em 10x no cartão Inter',
        mockAccounts,
        mockCategories
      )
      expect(res.success).toBe(true)
      expect(res.receipt?.total).toBe(3000)
      expect(res.receipt?.installment_total).toBe(10)
      expect(res.receipt?.installment_amount).toBe(300)
      expect(res.receipt?.payment_method).toBe('Cartão de Crédito')
      expect(res.receipt?.account_id).toBe('acc_inter_cc')
    })

    it('does NOT infer an account solely because payment method is Pix', () => {
      const res = parseSingleTransactionLocally(
        'almoço 45 reais via Pix',
        mockAccounts,
        mockCategories
      )
      expect(res.success).toBe(true)
      expect(res.receipt?.total).toBe(45)
      expect(res.receipt?.payment_method).toBe('Pix')
      expect(res.receipt?.account_id).toBeNull() // Not assigned to random account
    })

    it('handles relative date "ontem gastei 50 na farmácia"', () => {
      const res = parseSingleTransactionLocally(
        'ontem gastei 50 na farmácia',
        mockAccounts,
        mockCategories
      )
      expect(res.success).toBe(true)
      expect(res.receipt?.total).toBe(50)
      expect(res.receipt?.category).toBe('Saúde')
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)
      expect(res.receipt?.date).toBe(yesterday.toISOString().slice(0, 10))
    })
  })

  describe('3. Fallback to AI for Ambiguous / Complex Inputs', () => {
    it('delegates multiple items to AI ("comprei arroz 25 e feijão 10")', () => {
      const res = parseSingleTransactionLocally(
        'comprei arroz 25 e feijão 10',
        mockAccounts,
        mockCategories
      )
      expect(res.success).toBe(false)
    })

    it('flags missing value ("gastei no mercado")', () => {
      const res = parseSingleTransactionLocally(
        'gastei no mercado',
        mockAccounts,
        mockCategories
      )
      expect(res.success).toBe(false)
      expect(res.missingField).toBe('amount')
    })

    it('identifies multi-expense messages with isMultiExpenseText', async () => {
      const { isMultiExpenseText } = await import('./textRouter')
      expect(isMultiExpenseText('gastei 50 no mercado e 30 na farmácia')).toBe(true)
      expect(isMultiExpenseText('comprei arroz 25, feijão 10 e carne 40')).toBe(true)
      expect(isMultiExpenseText('almoço 45 e uber 20')).toBe(true)
      expect(isMultiExpenseText('Uber R$ 32 no cartão Inter')).toBe(false)
      expect(isMultiExpenseText('comprei notebook 3000 em 10x no cartão Inter')).toBe(false)
    })
  })

  describe('4. Routing Observability Tracking', () => {
    it('tracks metrics without logging sensitive data', () => {
      recordLocalQuery()
      recordLocalLaunch()
      recordAiCall()
      const stats = getLocalRoutingStats()
      expect(stats.localQueries).toBe(1)
      expect(stats.localLaunches).toBe(1)
      expect(stats.aiCalls).toBe(1)
    })
  })

  describe('5. Launch Completeness Validation (validateLaunchCompleteness)', () => {
    it('requires payment_method for expense', async () => {
      const { validateLaunchCompleteness } = await import('./textRouter')
      const incompleteReceipt: any = {
        type: 'expense',
        total: 50,
        vendor: 'Padaria',
        payment_method: null,
        account_id: null,
      }
      const res = validateLaunchCompleteness(incompleteReceipt, mockAccounts)
      expect(res.isComplete).toBe(false)
      expect(res.missingField).toBe('payment_method')
    })

    it('requires account for Pix expense', async () => {
      const { validateLaunchCompleteness } = await import('./textRouter')
      const pixWithoutAccount: any = {
        type: 'expense',
        total: 50,
        payment_method: 'Pix',
        account_id: null,
      }
      const res = validateLaunchCompleteness(pixWithoutAccount, mockAccounts)
      expect(res.isComplete).toBe(false)
      expect(res.missingField).toBe('account')
      expect(res.reason).toContain('conta de pagamento')
    })

    it('rejects credit_card account for Pix expense', async () => {
      const { validateLaunchCompleteness } = await import('./textRouter')
      const pixWithCreditCard: any = {
        type: 'expense',
        total: 50,
        payment_method: 'Pix',
        account_id: 'acc_inter_cc', // type: credit_card
      }
      const res = validateLaunchCompleteness(pixWithCreditCard, mockAccounts)
      expect(res.isComplete).toBe(false)
      expect(res.missingField).toBe('account')
      expect(res.reason).toContain('exige uma conta bancária/carteira')
    })

    it('accepts checking account for Pix expense', async () => {
      const { validateLaunchCompleteness } = await import('./textRouter')
      const completePix: any = {
        type: 'expense',
        total: 50,
        payment_method: 'Pix',
        account_id: 'acc_nubank_checking',
      }
      const res = validateLaunchCompleteness(completePix, mockAccounts)
      expect(res.isComplete).toBe(true)
    })

    it('requires credit_card account for Credit Card expense', async () => {
      const { validateLaunchCompleteness } = await import('./textRouter')
      const creditWithoutCard: any = {
        type: 'expense',
        total: 100,
        payment_method: 'Cartão de Crédito',
        account_id: null,
      }
      const res = validateLaunchCompleteness(creditWithoutCard, mockAccounts)
      expect(res.isComplete).toBe(false)
      expect(res.missingField).toBe('account')
      expect(res.reason).toContain('cartão de crédito')
    })

    it('rejects non-credit account for Credit Card expense', async () => {
      const { validateLaunchCompleteness } = await import('./textRouter')
      const creditWithChecking: any = {
        type: 'expense',
        total: 100,
        payment_method: 'Cartão de Crédito',
        account_id: 'acc_nubank_checking',
      }
      const res = validateLaunchCompleteness(creditWithChecking, mockAccounts)
      expect(res.isComplete).toBe(false)
      expect(res.missingField).toBe('account')
      expect(res.reason).toContain('exige um cartão de crédito')
    })

    it('accepts credit_card account for Credit Card expense', async () => {
      const { validateLaunchCompleteness } = await import('./textRouter')
      const completeCredit: any = {
        type: 'expense',
        total: 100,
        payment_method: 'Cartão de Crédito',
        account_id: 'acc_inter_cc',
      }
      const res = validateLaunchCompleteness(completeCredit, mockAccounts)
      expect(res.isComplete).toBe(true)
    })

    it('allows Cash expense without specific account', async () => {
      const { validateLaunchCompleteness } = await import('./textRouter')
      const cashExpense: any = {
        type: 'expense',
        total: 20,
        payment_method: 'Dinheiro',
        account_id: null,
      }
      const res = validateLaunchCompleteness(cashExpense, mockAccounts)
      expect(res.isComplete).toBe(true)
    })

    it('requires destination account for Income', async () => {
      const { validateLaunchCompleteness } = await import('./textRouter')
      const incomeWithoutAccount: any = {
        type: 'income',
        total: 1000,
        category: 'Salário',
        account_id: null,
      }
      const res = validateLaunchCompleteness(incomeWithoutAccount, mockAccounts)
      expect(res.isComplete).toBe(false)
      expect(res.missingField).toBe('account')
      expect(res.reason).toContain('conta de destino')

      const completeIncome: any = {
        ...incomeWithoutAccount,
        account_id: 'acc_itau',
      }
      const resOk = validateLaunchCompleteness(completeIncome, mockAccounts)
      expect(resOk.isComplete).toBe(true)
    })
  })
})
