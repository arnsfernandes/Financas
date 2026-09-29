import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  buildPreviewMessage,
  buildPreviewKeyboard,
  processConfirmationAction,
  processCancellationAction,
  processEditAction,
  type PendingTransaction,
} from './confirmation'
import type { Receipt } from './schema'
import * as queries from './queries'
import type { Account } from './schema'

describe('Inline Buttons Confirmation Flow (lib/confirmation.ts)', () => {
  const mockAccounts: Account[] = [
    {
      id: 'acc_inter_card',
      name: 'Cartão Inter',
      type: 'credit_card',
      institution: 'Inter',
      closing_day: 5,
      due_day: 15,
      active: true,
    },
    {
      id: 'acc_nubank',
      name: 'Nubank Conta',
      type: 'checking',
      institution: 'Nubank',
      active: true,
    },
  ]

  const completeReceipt: Receipt = {
    type: 'expense',
    vendor: 'Padaria Real',
    date: '2026-09-27',
    total: 35.5,
    category: 'Alimentação',
    payment_method: 'Pix',
    account_id: 'acc_nubank',
    currency: 'BRL',
    items: [],
  }

  const incompleteReceipt: Receipt = {
    type: 'expense',
    vendor: 'Mercado Livre',
    date: '2026-09-27',
    total: 150,
    category: 'Outros',
    payment_method: null,
    account_id: null,
    currency: 'BRL',
    items: [],
  }

  beforeEach(() => {
    vi.spyOn(queries, 'listAccounts').mockResolvedValue(mockAccounts)
  })

  describe('buildPreviewMessage & buildPreviewKeyboard', () => {
    it('builds compact preview message with simplified format', async () => {
      const msg = await buildPreviewMessage(completeReceipt, 'text')
      expect(msg).toContain('Confirmar lançamento')
      expect(msg).toContain('Padaria Real')
      expect(msg).toContain('35,50')
      expect(msg).toContain('📁 Alimentação')
      expect(msg).toContain('🏦 Nubank Conta')
      expect(msg).toContain('📅 27/09/2026')
      expect(msg).not.toContain('Tipo: Despesa')
      expect(msg).not.toContain('Itens identificados')
    })

    it('shows items list only when multiple items exist', async () => {
      const singleItemReceipt = {
        ...completeReceipt,
        items: [{ description: 'Pão francês', total: 35.5, quantity: 1 }],
      }
      const singleMsg = await buildPreviewMessage(singleItemReceipt, 'text')
      expect(singleMsg).not.toContain('Itens (')

      const multiItemReceipt = {
        ...completeReceipt,
        items: [
          { description: 'Pão francês', total: 15.5, quantity: 1 },
          { description: 'Café', total: 20.0, quantity: 2 },
        ],
      }
      const multiMsg = await buildPreviewMessage(multiItemReceipt, 'text')
      expect(multiMsg).toContain('Itens (2):')
      expect(multiMsg).toContain('Pão francês')
      expect(multiMsg).toContain('2x Café')
    })

    it('shows installment info when installment_total > 1', async () => {
      const installmentReceipt = {
        ...completeReceipt,
        installment_total: 3,
        installment_amount: 11.83,
      }
      const msg = await buildPreviewMessage(installmentReceipt, 'text')
      expect(msg).toContain('3x de')
      expect(msg).toContain('11,83')
    })

    it('builds keyboard with Confirmar, Alterar and Cancelar buttons when receipt is complete', async () => {
      const keyboard = await buildPreviewKeyboard('tx_123', completeReceipt)
      const buttons = keyboard.inline_keyboard.flat()
      const buttonTexts = buttons.map((b) => b.text)
      const buttonCallbacks = buttons.map((b) => b.callback_data)

      expect(buttonTexts).toContain('✅ Confirmar')
      expect(buttonTexts).toContain('✏️ Alterar')
      expect(buttonTexts).toContain('❌ Cancelar')

      expect(buttonCallbacks).toContain('confirm_tx_123')
      expect(buttonCallbacks).toContain('edit_tx_123')
      expect(buttonCallbacks).toContain('cancel_tx_123')

      // Ensure all callback data is <= 64 bytes
      for (const cb of buttonCallbacks) {
        expect(new TextEncoder().encode(cb).length).toBeLessThanOrEqual(64)
      }
    })

    it('builds keyboard with direct accounts/cards and Dinheiro when receipt is missing payment method/account', async () => {
      const keyboard = await buildPreviewKeyboard('tx_456', incompleteReceipt)
      const buttons = keyboard.inline_keyboard.flat()
      const buttonTexts = buttons.map((b) => b.text)
      const buttonCallbacks = buttons.map((b) => b.callback_data)

      expect(buttonTexts).toContain('💳 Cartão Inter')
      expect(buttonTexts).toContain('🏦 Nubank Conta')
      expect(buttonTexts).toContain('💵 Dinheiro')
      expect(buttonTexts).toContain('✏️ Alterar')
      expect(buttonTexts).toContain('❌ Cancelar')
      expect(buttonTexts).not.toContain('✅ Confirmar') // Cannot confirm yet

      expect(buttonCallbacks).toContain('acc:tx_456:0')
      expect(buttonCallbacks).toContain('acc:tx_456:1')
      expect(buttonCallbacks).toContain('pm:tx_456:cash')
      expect(buttonCallbacks).toContain('edit_tx_456')
      expect(buttonCallbacks).toContain('cancel_tx_456')

      for (const cb of buttonCallbacks) {
        expect(new TextEncoder().encode(cb).length).toBeLessThanOrEqual(64)
      }
    })

    it('ensures all callback_data remain strictly <= 64 bytes even with real 36-char UUID account IDs', async () => {
      const uuidAccounts: Account[] = [
        {
          id: '123e4567-e89b-12d3-a456-426614174000',
          name: 'Cartão Master Black Super VIP',
          type: 'credit_card',
          institution: 'Banco do Brasil',
          closing_day: 10,
          due_day: 20,
          active: true,
        },
        {
          id: '987fcdeb-51a2-43f7-9abc-def012345678',
          name: 'Conta Corrente Principal Investimentos',
          type: 'checking',
          institution: 'Itaú Unibanco',
          active: true,
        },
      ]
      vi.spyOn(queries, 'listAccounts').mockResolvedValue(uuidAccounts)

      const longTxId = 'tx_1727483921000_abcde12345'
      const keyboard = await buildPreviewKeyboard(longTxId, incompleteReceipt)
      const buttons = keyboard.inline_keyboard.flat()

      expect(buttons.length).toBeGreaterThan(0)
      for (const b of buttons) {
        const byteLen = new TextEncoder().encode(b.callback_data).length
        expect(byteLen).toBeLessThanOrEqual(64)
      }
    })
  })

  describe('processConfirmationAction', () => {
    it('executes deterministic save function on confirm and removes from pending map', async () => {
      const pendingMap = new Map<string, PendingTransaction>()
      pendingMap.set('tx_test_1', {
        id: 'tx_test_1',
        userId: 999,
        receipt: { ...completeReceipt },
        originalExtractedData: {},
        sourceType: 'text',
        rawText: 'padaria 35.50 no pix nubank',
        createdAt: Date.now(),
      })

      const saveMock = vi.fn().mockResolvedValue({
        id: 'saved_1',
        ...completeReceipt,
      })

      const result = await processConfirmationAction('tx_test_1', 999, pendingMap, saveMock)

      expect(result.status).toBe('confirmed')
      expect(saveMock).toHaveBeenCalledOnce()
      expect(saveMock).toHaveBeenCalledWith(
        expect.objectContaining({
          receipt: expect.objectContaining({ vendor: 'Padaria Real', total: 35.5 }),
          sourceType: 'text',
        })
      )
      // Must have been deleted from pending map
      expect(pendingMap.has('tx_test_1')).toBe(false)
    })

    it('blocks duplicate confirmation on repeated click', async () => {
      const pendingMap = new Map<string, PendingTransaction>()
      pendingMap.set('tx_test_2', {
        id: 'tx_test_2',
        userId: 999,
        receipt: { ...completeReceipt },
        originalExtractedData: {},
        sourceType: 'text',
        rawText: 'almoço 40 pix',
        createdAt: Date.now(),
      })

      const saveMock = vi.fn().mockResolvedValue({ id: 'saved_2', ...completeReceipt })

      // First click: succeeds
      const firstClick = await processConfirmationAction('tx_test_2', 999, pendingMap, saveMock)
      expect(firstClick.status).toBe('confirmed')

      // Second click (duplicate): blocked
      const secondClick = await processConfirmationAction('tx_test_2', 999, pendingMap, saveMock)
      expect(secondClick.status).toBe('duplicate_blocked')
      expect(secondClick.message).toContain('já foi processada ou expirou')
      expect(saveMock).toHaveBeenCalledOnce() // Not called again
    })

    it('rejects confirmation if unauthorized user tries to click', async () => {
      const pendingMap = new Map<string, PendingTransaction>()
      pendingMap.set('tx_test_3', {
        id: 'tx_test_3',
        userId: 999, // Owner
        receipt: { ...completeReceipt },
        originalExtractedData: {},
        sourceType: 'text',
        rawText: 'lanche',
        createdAt: Date.now(),
      })

      const saveMock = vi.fn()
      const result = await processConfirmationAction('tx_test_3', 888, pendingMap, saveMock) // Other user

      expect(result.status).toBe('unauthorized')
      expect(saveMock).not.toHaveBeenCalled()
      expect(pendingMap.has('tx_test_3')).toBe(true) // Preserved for real owner
    })

    it('prevents confirmation if required fields are missing', async () => {
      const pendingMap = new Map<string, PendingTransaction>()
      pendingMap.set('tx_test_4', {
        id: 'tx_test_4',
        userId: 999,
        receipt: { ...incompleteReceipt },
        originalExtractedData: {},
        sourceType: 'text',
        rawText: 'compras 150',
        createdAt: Date.now(),
      })

      const saveMock = vi.fn()
      const result = await processConfirmationAction('tx_test_4', 999, pendingMap, saveMock)

      expect(result.status).toBe('missing_data')
      expect(saveMock).not.toHaveBeenCalled()
      expect(pendingMap.has('tx_test_4')).toBe(true)
    })
  })

  describe('processCancellationAction', () => {
    it('discards transaction without persisting and removes from pending map', () => {
      const pendingMap = new Map<string, PendingTransaction>()
      pendingMap.set('tx_cancel_1', {
        id: 'tx_cancel_1',
        userId: 999,
        receipt: { ...completeReceipt },
        originalExtractedData: {},
        sourceType: 'text',
        rawText: 'teste',
        createdAt: Date.now(),
      })

      const res = processCancellationAction('tx_cancel_1', 999, pendingMap)
      expect(res.status).toBe('cancelled')
      expect(res.message).toContain('cancelado')
      expect(pendingMap.has('tx_cancel_1')).toBe(false)
    })
  })

  describe('processEditAction and Textual Flow Interaction', () => {
    it('returns instructions on how to provide correction while keeping transaction in pending map', () => {
      const pendingMap = new Map<string, PendingTransaction>()
      pendingMap.set('tx_edit_1', {
        id: 'tx_edit_1',
        userId: 999,
        receipt: { ...completeReceipt },
        originalExtractedData: {},
        sourceType: 'text',
        rawText: 'teste',
        createdAt: Date.now(),
      })

      const res = processEditAction('tx_edit_1', 999, pendingMap)
      expect(res.status).toBe('editing')
      expect(res.message).toContain('corrigir')
      expect(pendingMap.has('tx_edit_1')).toBe(true) // Must remain pending so text router can update it
    })

    it('allows textual cancellation while in pending/edit state using processCancellationAction', () => {
      const pendingMap = new Map<string, PendingTransaction>()
      pendingMap.set('tx_pending_text_1', {
        id: 'tx_pending_text_1',
        userId: 999,
        receipt: { ...completeReceipt },
        originalExtractedData: {},
        sourceType: 'text',
        rawText: 'padaria 35.50',
        createdAt: Date.now(),
      })

      // Simulate user typing "cancelar" or "descartar"
      const res = processCancellationAction('tx_pending_text_1', 999, pendingMap)
      expect(res.status).toBe('cancelled')
      expect(res.message).toContain('cancelado')
      expect(pendingMap.has('tx_pending_text_1')).toBe(false)
    })

    it('allows textual confirmation while in pending/edit state using processConfirmationAction', async () => {
      const pendingMap = new Map<string, PendingTransaction>()
      pendingMap.set('tx_pending_text_2', {
        id: 'tx_pending_text_2',
        userId: 999,
        receipt: { ...completeReceipt },
        originalExtractedData: {},
        sourceType: 'text',
        rawText: 'padaria 35.50 no pix nubank',
        createdAt: Date.now(),
      })

      const saveMock = vi.fn().mockResolvedValue({
        id: 'saved_text_1',
        ...completeReceipt,
      })

      // Simulate user typing "confirmar" or "sim"
      const res = await processConfirmationAction('tx_pending_text_2', 999, pendingMap, saveMock)
      expect(res.status).toBe('confirmed')
      expect(saveMock).toHaveBeenCalledOnce()
      expect(pendingMap.has('tx_pending_text_2')).toBe(false)
    })
  })
})

