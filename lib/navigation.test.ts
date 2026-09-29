import { describe, it, expect, vi } from 'vitest'
import { InlineKeyboard } from 'grammy'
import {
  encodeNavCallback,
  decodeNavCallback,
  NavigationRegistry,
  addBackButton,
  renderScreenToContext,
  type BotScreen,
} from './navigation'

describe('Generic Telegram Inline Navigation Infrastructure (lib/navigation.ts)', () => {
  describe('1. Callback Data Encoding & Decoding', () => {
    it('encodes simple screen and action without params', () => {
      const cb = encodeNavCallback('hub', 'view')
      expect(cb).toBe('nav:hub:view')
    })

    it('encodes screen, action and query params compactly', () => {
      const cb = encodeNavCallback('invoice', 'detail', { cardId: 'acc_123', cycle: '2026-09' })
      expect(cb).toBe('nav:invoice:detail:cardId=acc_123;cycle=2026-09')
    })

    it('decodes simple callback data', () => {
      const decoded = decodeNavCallback('nav:hub:view')
      expect(decoded).not.toBeNull()
      expect(decoded?.screenId).toBe('hub')
      expect(decoded?.action).toBe('view')
      expect(decoded?.params).toEqual({})
    })

    it('decodes callback data with params', () => {
      const decoded = decodeNavCallback('nav:account:view:id=acc_nubank;month=09')
      expect(decoded).not.toBeNull()
      expect(decoded?.screenId).toBe('account')
      expect(decoded?.action).toBe('view')
      expect(decoded?.params).toEqual({ id: 'acc_nubank', month: '09' })
    })

    it('returns null for non-navigation callbacks', () => {
      expect(decodeNavCallback('confirm_123')).toBeNull()
      expect(decodeNavCallback('cancel_456')).toBeNull()
      expect(decodeNavCallback('pm_set:123:Pix')).toBeNull()
      expect(decodeNavCallback('rem_toggle:invoices')).toBeNull()
    })
  })

  describe('2. Navigation Registry & Screen Rendering', () => {
    it('registers and renders screens deterministically without AI', async () => {
      const registry = new NavigationRegistry()

      registry.register<{ cardId: string }>('invoice_details', async (params) => {
        return {
          text: `💳 <b>Fatura do Cartão ${params.cardId}</b>`,
          keyboard: new InlineKeyboard().text('⬅️ Voltar', encodeNavCallback('hub', 'view')),
        }
      })

      expect(registry.has('invoice_details')).toBe(true)
      expect(registry.has('unknown')).toBe(false)

      const screen = await registry.render('invoice_details', { cardId: 'acc_inter' })
      expect(screen.text).toContain('acc_inter')
      expect(screen.keyboard).toBeDefined()
    })

    it('throws error when rendering an unregistered screen', async () => {
      const registry = new NavigationRegistry()
      await expect(registry.render('non_existent')).rejects.toThrow('Screen "non_existent" not found')
    })
  })

  describe('3. Back Button Helper', () => {
    it('adds a contextual back button to an InlineKeyboard', () => {
      const kb = new InlineKeyboard()
      addBackButton(kb, 'overview', 'view', { tab: 'main' })

      const row = kb.inline_keyboard[0]
      expect(row).toBeDefined()
      expect(row[0].text).toBe('⬅️ Voltar')
      expect(row[0].callback_data).toBe('nav:overview:view:tab=main')
    })
  })

  describe('4. Context Screen Renderer (editMessageText / reply fallback)', () => {
    it('edits current message when callbackQuery is present', async () => {
      const ctx = {
        callbackQuery: {
          data: 'nav:test:view',
          message: { message_id: 123 },
        },
        answerCallbackQuery: vi.fn(),
        editMessageText: vi.fn().mockResolvedValue(true),
        reply: vi.fn(),
      }

      const screen: BotScreen = {
        text: 'Nova tela',
        keyboard: new InlineKeyboard().text('Btn', 'nav:btn:click'),
      }

      await renderScreenToContext(ctx, screen, { answerCallbackText: 'OK' })

      expect(ctx.answerCallbackQuery).toHaveBeenCalledWith({ text: 'OK', show_alert: undefined })
      expect(ctx.editMessageText).toHaveBeenCalledWith('Nova tela', {
        parse_mode: 'HTML',
        reply_markup: screen.keyboard,
      })
      expect(ctx.reply).not.toHaveBeenCalled()
    })

    it('falls back to reply when not in callbackQuery', async () => {
      const ctx = {
        reply: vi.fn().mockResolvedValue(true),
      }

      const screen: BotScreen = {
        text: 'Mensagem inicial',
      }

      await renderScreenToContext(ctx, screen)
      expect(ctx.reply).toHaveBeenCalledWith('Mensagem inicial', {
        parse_mode: 'HTML',
        reply_markup: undefined,
      })
    })
  })
})
