import { InlineKeyboard } from 'grammy'

/**
 * Interface representing a deterministic screen/view in the bot.
 */
export interface BotScreen<TContext = any> {
  text: string
  keyboard?: InlineKeyboard
  parseMode?: 'HTML' | 'MarkdownV2' | 'Markdown'
}

/**
 * Screen render function type.
 */
export type ScreenRenderer<TParams = any, TContext = any> = (
  params: TParams,
  context: TContext
) => Promise<BotScreen<TContext>> | BotScreen<TContext>

/**
 * Parsed callback payload.
 */
export interface ParsedCallback<TParams = Record<string, string>> {
  screenId: string
  action: string
  params: TParams
  raw: string
}

/**
 * Encodes a screen navigation callback data string.
 * Format: `nav:<screenId>:<action>:<key1=val1;key2=val2>`
 * Compact format to respect Telegram's 64-byte limit on callback_data.
 */
export function encodeNavCallback(
  screenId: string,
  action: string = 'view',
  params?: Record<string, string | number | boolean | undefined | null>
): string {
  if (!params || Object.keys(params).length === 0) {
    return `nav:${screenId}:${action}`
  }

  const serializedParams = Object.entries(params)
    .filter(([_, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join(';')

  const callback = `nav:${screenId}:${action}:${serializedParams}`
  if (callback.length > 64) {
    console.warn(`[Navigation] Callback data exceeds 64 bytes (${callback.length} bytes): ${callback}`)
  }
  return callback
}

/**
 * Decodes a navigation callback data string.
 * Returns null if the data is not a navigation callback.
 */
export function decodeNavCallback(data: string): ParsedCallback | null {
  if (!data || !data.startsWith('nav:')) {
    return null
  }

  const parts = data.split(':')
  if (parts.length < 3) {
    return null
  }

  const screenId = parts[1]
  const action = parts[2]
  const paramsStr = parts.slice(3).join(':')
  const params: Record<string, string> = {}

  if (paramsStr) {
    const pairs = paramsStr.split(';')
    for (const pair of pairs) {
      const [k, v] = pair.split('=')
      if (k) {
        params[k] = v ? decodeURIComponent(v) : ''
      }
    }
  }

  return {
    screenId,
    action,
    params,
    raw: data,
  }
}

/**
 * Registry of deterministic screen renderers.
 */
export class NavigationRegistry<TContext = any> {
  private screens = new Map<string, ScreenRenderer<any, TContext>>()

  /**
   * Register a screen renderer.
   */
  register<TParams = any>(screenId: string, renderer: ScreenRenderer<TParams, TContext>): this {
    this.screens.set(screenId, renderer)
    return this
  }

  /**
   * Check if a screen is registered.
   */
  has(screenId: string): boolean {
    return this.screens.has(screenId)
  }

  /**
   * Render a registered screen deterministically.
   */
  async render<TParams = any>(
    screenId: string,
    params: TParams = {} as TParams,
    context: TContext = {} as TContext
  ): Promise<BotScreen<TContext>> {
    const renderer = this.screens.get(screenId)
    if (!renderer) {
      throw new Error(`Screen "${screenId}" not found in navigation registry.`)
    }
    return await renderer(params, context)
  }
}

/**
 * Helper to safely edit a Telegram message to a new screen or reply if editing fails.
 */
export async function renderScreenToContext(
  ctx: any,
  screen: BotScreen,
  options?: { answerCallbackText?: string; showAlert?: boolean }
): Promise<void> {
  // Always answer the callback query promptly to prevent infinite loading spinner
  if (ctx.callbackQuery) {
    try {
      await ctx.answerCallbackQuery({
        text: options?.answerCallbackText,
        show_alert: options?.showAlert,
      })
    } catch {
      // Silently continue if callback was already answered or expired
    }
  }

  const parseMode = screen.parseMode || 'HTML'
  const replyMarkup = screen.keyboard

  try {
    if (ctx.callbackQuery?.message) {
      await ctx.editMessageText(screen.text, {
        parse_mode: parseMode,
        reply_markup: replyMarkup,
      })
      return
    }
  } catch (error: any) {
    const errMsg = String(error?.message || error)
    if (errMsg.includes('message is not modified')) {
      return
    }
    // If edit failed with BUTTON_DATA_INVALID or other fatal error, rethrow so caller catches and notifies
    if (errMsg.includes('BUTTON_DATA_INVALID') || errMsg.includes('Bad Request')) {
      throw error
    }
  }

  await ctx.reply(screen.text, {
    parse_mode: parseMode,
    reply_markup: replyMarkup,
  })
}

/**
 * Creates a back button or adds it to an existing InlineKeyboard.
 */
export function addBackButton(
  keyboard: InlineKeyboard,
  targetScreenId: string,
  targetAction: string = 'view',
  targetParams?: Record<string, string | number | boolean>,
  label: string = '⬅️ Voltar'
): InlineKeyboard {
  return keyboard.text(label, encodeNavCallback(targetScreenId, targetAction, targetParams))
}

/**
 * Global navigation registry singleton for the bot.
 */
export const navigationRegistry = new NavigationRegistry()
