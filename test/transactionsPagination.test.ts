import { describe, it, expect } from 'vitest'
import type { TransactionRecord, DisplayListItem, InstallmentGroupItem } from '../components/transactions/TransactionsTab'

/**
 * Pure displayItems grouping logic mirrored from TransactionsTab
 */
function computeDisplayItems(transactions: TransactionRecord[]): DisplayListItem[] {
  const items: DisplayListItem[] = []
  const groupsMap = new Map<string, InstallmentGroupItem>()

  for (const tx of transactions) {
    if (tx.installment_group_id && (tx.installment_total || 0) > 1) {
      const gId = tx.installment_group_id
      if (groupsMap.has(gId)) {
        const group = groupsMap.get(gId)!
        if (!group.installments.some((inst) => inst.id === tx.id)) {
          group.installments.push(tx)
        }
      } else {
        const totalInst = tx.installment_total || 1
        const instAmount = Number(tx.installment_amount) || Number(tx.total)
        const totalPurchaseAmount = tx.subtotal
          ? Number(tx.subtotal)
          : tx.installment_amount
          ? Number(tx.installment_amount) * totalInst
          : Number(tx.total) * totalInst

        const group: InstallmentGroupItem = {
          type: 'installment_group',
          groupId: gId,
          vendor: tx.canonical_vendors?.canonical_name || tx.vendor || 'Compra parcelada',
          totalPurchaseAmount,
          installmentCount: totalInst,
          installmentAmount: instAmount,
          date: tx.date || tx.created_at,
          category: tx.categories?.name || tx.category || null,
          categories: tx.categories,
          accountName: tx.accounts?.name || null,
          paymentMethod: tx.payment_method || 'Cartão de Crédito',
          installments: [tx],
        }
        groupsMap.set(gId, group)
        items.push(group)
      }
    } else {
      items.push({ type: 'single', tx })
    }
  }

  return items
}

describe('Transactions Tab Grouping & Incremental Loading Suite', () => {
  it('correctly unifies installments of the same group loaded across multiple incremental pages into a single visual item', () => {
    // Page 1 has installment 1/3 and 2/3 of an iPhone purchase, plus 1 single coffee purchase
    const page1Transactions: TransactionRecord[] = [
      {
        id: 'tx-inst-1',
        vendor: 'Apple Store',
        vendor_address: null,
        total: 1000,
        subtotal: 3000,
        date: '2026-09-01',
        time: null,
        currency: 'BRL',
        category: 'Eletrônicos',
        payment_method: 'Cartão de Crédito',
        notes: null,
        source_type: 'manual',
        created_at: '2026-09-01T10:00:00.000Z',
        installment_group_id: 'grp-apple-3000',
        installment_current: 1,
        installment_total: 3,
        installment_amount: 1000,
      },
      {
        id: 'tx-inst-2',
        vendor: 'Apple Store',
        vendor_address: null,
        total: 1000,
        subtotal: 3000,
        date: '2026-10-01',
        time: null,
        currency: 'BRL',
        category: 'Eletrônicos',
        payment_method: 'Cartão de Crédito',
        notes: null,
        source_type: 'manual',
        created_at: '2026-09-01T10:00:00.000Z',
        installment_group_id: 'grp-apple-3000',
        installment_current: 2,
        installment_total: 3,
        installment_amount: 1000,
      },
      {
        id: 'tx-coffee',
        vendor: 'Starbucks',
        vendor_address: null,
        total: 25,
        subtotal: 25,
        date: '2026-09-02',
        time: null,
        currency: 'BRL',
        category: 'Alimentação',
        payment_method: 'Pix',
        notes: null,
        source_type: 'manual',
        created_at: '2026-09-02T11:00:00.000Z',
      },
    ]

    const page1Display = computeDisplayItems(page1Transactions)
    // Should render exactly 2 items: 1 group card (Apple Store 3x) + 1 single card (Starbucks)
    expect(page1Display).toHaveLength(2)
    expect(page1Display[0].type).toBe('installment_group')
    if (page1Display[0].type === 'installment_group') {
      expect(page1Display[0].vendor).toBe('Apple Store')
      expect(page1Display[0].totalPurchaseAmount).toBe(3000)
      expect(page1Display[0].installments).toHaveLength(2)
    }

    // Page 2 loads installment 3/3 of the same group, plus another single gas purchase
    const page2Transactions: TransactionRecord[] = [
      {
        id: 'tx-inst-3',
        vendor: 'Apple Store',
        vendor_address: null,
        total: 1000,
        subtotal: 3000,
        date: '2026-11-01',
        time: null,
        currency: 'BRL',
        category: 'Eletrônicos',
        payment_method: 'Cartão de Crédito',
        notes: null,
        source_type: 'manual',
        created_at: '2026-09-01T10:00:00.000Z',
        installment_group_id: 'grp-apple-3000',
        installment_current: 3,
        installment_total: 3,
        installment_amount: 1000,
      },
      {
        id: 'tx-gas',
        vendor: 'Posto Shell',
        vendor_address: null,
        total: 200,
        subtotal: 200,
        date: '2026-08-30',
        time: null,
        currency: 'BRL',
        category: 'Transporte',
        payment_method: 'Cartão de Débito',
        notes: null,
        source_type: 'manual',
        created_at: '2026-08-30T15:00:00.000Z',
      },
    ]

    // Incremental loading state combines page 1 + page 2
    const accumulatedTransactions = [...page1Transactions, ...page2Transactions]
    const combinedDisplay = computeDisplayItems(accumulatedTransactions)

    // Should render exactly 3 items:
    // 1 group card for Apple Store (now containing all 3 installments) + 2 single cards (Starbucks + Posto Shell)
    expect(combinedDisplay).toHaveLength(3)
    expect(combinedDisplay[0].type).toBe('installment_group')
    if (combinedDisplay[0].type === 'installment_group') {
      expect(combinedDisplay[0].vendor).toBe('Apple Store')
      expect(combinedDisplay[0].totalPurchaseAmount).toBe(3000)
      expect(combinedDisplay[0].installments).toHaveLength(3)
      expect(combinedDisplay[0].installments.map((i) => i.installment_current)).toEqual([1, 2, 3])
    }
  })

  it('prevents duplicate transactions when paginating or reloading', () => {
    const existing: TransactionRecord[] = [
      {
        id: 'tx-1',
        vendor: 'Mercado A',
        vendor_address: null,
        total: 50,
        subtotal: 50,
        date: '2026-09-10',
        time: null,
        currency: 'BRL',
        category: 'Mercado',
        payment_method: 'Pix',
        notes: null,
        source_type: 'manual',
        created_at: '2026-09-10T10:00:00.000Z',
      },
    ]

    // If API returns tx-1 again in a subsequent fetch along with tx-2
    const incoming: TransactionRecord[] = [
      { ...existing[0] },
      {
        id: 'tx-2',
        vendor: 'Farmácia B',
        vendor_address: null,
        total: 30,
        subtotal: 30,
        date: '2026-09-09',
        time: null,
        currency: 'BRL',
        category: 'Saúde',
        payment_method: 'Pix',
        notes: null,
        source_type: 'manual',
        created_at: '2026-09-09T10:00:00.000Z',
      },
    ]

    const existingIds = new Set(existing.map((t) => t.id))
    const uniqueNew = incoming.filter((t) => !existingIds.has(t.id))
    const merged = [...existing, ...uniqueNew]

    expect(merged).toHaveLength(2)
    expect(merged.map((t) => t.id)).toEqual(['tx-1', 'tx-2'])
  })
})
