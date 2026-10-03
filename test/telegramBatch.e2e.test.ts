import { afterEach, expect, it, vi } from 'vitest'
import type { Bot as TelegramBot } from 'grammy'
import { setOpenAIClientForTesting } from '../lib/intent'

const harness = vi.hoisted(() => ({ bot: null as TelegramBot | null }))
vi.mock('dotenv', () => ({ config: vi.fn() }))
vi.mock('grammy', async importOriginal => {
  const actual = await importOriginal<typeof import('grammy')>()
  return {
    ...actual,
    Bot: class extends actual.Bot {
      constructor(token: string) {
        super(token, { botInfo: {
          id: 100, is_bot: true, first_name: 'Test', username: 'test_bot',
          can_join_groups: true, can_read_all_group_messages: false, supports_inline_queries: false,
          can_connect_to_business: false, has_main_web_app: false,
        } })
        harness.bot = this
      }
      // Register the production middleware without starting network polling.
      start = vi.fn(async () => {})
    },
  }
})
vi.mock('../lib/queries', async importOriginal => ({
  ...await importOriginal<typeof import('../lib/queries')>(),
  listAccounts: vi.fn(async () => [
    { id: 'inter', name: 'Inter', institution: 'Inter', type: 'credit_card', active: true },
    { id: 'nubank', name: 'Nubank', institution: 'Nubank', type: 'credit_card', active: true },
    { id: 'bank', name: 'Conta teste', type: 'bank_account', active: true },
  ]),
  listCategories: vi.fn(async () => []),
}))
vi.mock('../lib/persist', async importOriginal => ({
  ...await importOriginal<typeof import('../lib/persist')>(),
  save: vi.fn(async () => { throw new Error('No write before confirmation') }),
  saveBatch: vi.fn(async () => { throw new Error('No write before confirmation') }),
}))

afterEach(() => {
  setOpenAIClientForTesting(null)
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

it('routes a Telegram message with three launches through the real handler to one batch preview', { timeout: 15000 }, async () => {
  vi.useFakeTimers()
  vi.stubEnv('TELEGRAM_BOT_TOKEN', '100:test-token')
  vi.stubEnv('TELEGRAM_ALLOWED_USER_ID', '42')
  vi.stubEnv('OPENAI_API_KEY', 'test-key')
  vi.spyOn(console, 'log').mockImplementation(() => {})
  const create = vi.fn(async () => ({ choices: [{ message: { content: JSON.stringify({ shared_context: null, descriptions: [
    'gastei 45 no mercado no Inter',
    '80 de gasolina no Débito',
    '32 na farmácia no Nubank',
  ] }) } }] }))
  setOpenAIClientForTesting({ chat: { completions: { create } } } as any)
  await import('../scripts/telegram-bot')
  const messages: { text: string; reply_markup?: { inline_keyboard: { text: string; callback_data?: string }[][] } }[] = []
  const edits: any[] = []
  harness.bot!.api.config.use(async (_previous, method, payload) => {
    if (method === 'answerCallbackQuery') return { ok: true, result: true } as any
    if (method === 'editMessageText') { edits.push(payload); return { ok: true, result: true } as any }
    if (method !== 'sendMessage') throw new Error(`Unexpected Telegram API call: ${method}`)
    messages.push(payload as unknown as typeof messages[number])
    return { ok: true, result: { message_id: messages.length, date: 0, chat: { id: 42, type: 'private' }, text: '' } } as any
  })
  await harness.bot!.handleUpdate({ update_id: 1, message: {
    message_id: 1, date: 0, chat: { id: 42, type: 'private', first_name: 'Test' },
    from: { id: 42, is_bot: false, first_name: 'Test' },
    text: 'gastei 45 no mercado no Inter, 80 de gasolina no Débito e 32 na farmácia no Nubank',
  } })
  expect(create).toHaveBeenCalledOnce()
  expect(messages).toHaveLength(1)
  const preview = messages[0]
  for (const number of [1, 2, 3]) expect(preview.text).toContain(`<b>${number}. `)
  for (const amount of ['45,00', '80,00', '32,00', '157,00']) expect(preview.text).toContain(amount)
  expect(preview.text).toContain('Total:')
  expect(preview.text).toContain('dados faltantes do lançamento 2')
  expect(preview.text).not.toContain('Identifiquei mais de um lançamento')
  expect(preview.text).not.toContain('um lançamento por vez')
  expect(preview.reply_markup?.inline_keyboard.flat().map(button => button.text)).toEqual(['🏦 Conta teste', '✏️ Alterar', '❌ Cancelar'])
  const data = preview.reply_markup!.inline_keyboard[0][0].callback_data!
  expect(Buffer.byteLength(data)).toBeLessThanOrEqual(64)
  await harness.bot!.handleUpdate({ update_id: 2, callback_query: {
    id: 'selection', chat_instance: 'test', data, from: { id: 42, is_bot: false, first_name: 'Test' },
    message: { message_id: 1, date: 0, chat: { id: 42, type: 'private' }, text: preview.text },
  } })
  expect(messages).toHaveLength(1)
  expect(edits).toHaveLength(1)
  expect(edits[0].message_id).toBe(1)
  expect(edits[0].text).toContain('🏦 Conta teste')
  expect(edits[0].text).not.toContain('dados faltantes')
  expect(edits[0].reply_markup.inline_keyboard.flat().map((button: any) => button.text)).toEqual(['✅ Confirmar todos', '✏️ Alterar', '❌ Cancelar'])
  const { save, saveBatch } = await import('../lib/persist')
  expect(save).not.toHaveBeenCalled()
  expect(saveBatch).not.toHaveBeenCalled()
})
