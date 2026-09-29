import * as dotenv from 'dotenv'
import { resolve } from 'path'

// Carregar variáveis de ambiente dos arquivos .env.local e .env
dotenv.config({ path: resolve(process.cwd(), '.env.local') })
dotenv.config({ path: resolve(process.cwd(), '.env') })

import { Bot, InlineKeyboard } from 'grammy'
import { parseBatch, batchPreview, correctBatch, confirmBatch, cancelBatch, selectBatchAccount, type PendingBatch } from '../lib/transactionBatch'
const pendingBatches = new Map<string, PendingBatch>()

// Helper para validação e leitura segura de variáveis de ambiente
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
const ALLOWED_USER_ID = process.env.TELEGRAM_ALLOWED_USER_ID?.trim()
const MINI_APP_URL = (process.env.MINI_APP_URL || process.env.NEXT_PUBLIC_APP_URL || '').trim()

if (!BOT_TOKEN) {
  console.error('[Telegram Bot] ERRO: Variável TELEGRAM_BOT_TOKEN não definida.')
  console.error('[Telegram Bot] Defina TELEGRAM_BOT_TOKEN no seu arquivo .env ou .env.local.')
  process.exit(1)
}

/**
 * Valida se o usuário remetente está autorizado.
 * Se TELEGRAM_ALLOWED_USER_ID não estiver definido ou for diferente do ID do remetente, o acesso financeiro é negado.
 */
function isAuthorized(userId: number | undefined): boolean {
  if (!userId || !ALLOWED_USER_ID) return false
  return String(userId) === ALLOWED_USER_ID
}

// Inicializa a instância do Bot com grammY
const bot = new Bot(BOT_TOKEN)

// ==========================================
// COMANDOS PÚBLICOS (Sempre respondem a qualquer usuário)
// ==========================================

// Comando /start: Apresenta o bot e sempre informa o ID do usuário para configuração
bot.command('start', async (ctx) => {
  const userId = ctx.from?.id
  const firstName = ctx.from?.first_name || 'Usuário'
  const authorized = isAuthorized(userId)

  let message = `👋 Olá, <b>${firstName}</b>!\n\n`
  message += `🤖 <b>Assistente Financeiro Pessoal</b>\n`
  message += `━━━━━━━━━━━━━━━━━━━━━\n`
  message += `🆔 <b>Seu Telegram User ID:</b> <code>${userId}</code>\n`
  message += `🔒 <b>Status:</b> ${authorized ? '✅ Autorizado' : '⛔ Não autorizado'}\n\n`

  let keyboard: InlineKeyboard | undefined

  if (authorized) {
    message += `Você está autenticado e pronto para gerenciar suas finanças.\n\n`
    if (MINI_APP_URL && MINI_APP_URL.startsWith('https://')) {
      message += `📱 <b>Mini App Disponível:</b> Você pode abrir o painel completo interativo pelo botão abaixo.\n\n`
      keyboard = new InlineKeyboard().webApp('📱 Abrir App Finanças', MINI_APP_URL)
    }
    message += `💡 <i>Use /ajuda para ver os comandos disponíveis.</i>`
  } else {
    message += `⚠️ Sua conta ainda <b>não está autorizada</b> para realizar lançamentos ou consultas financeiras.\n\n`
    message += `Para liberar o seu acesso, adicione a seguinte linha no seu arquivo <code>.env.local</code>:\n`
    message += `<code>TELEGRAM_ALLOWED_USER_ID=${userId}</code>`
  }

  await ctx.reply(message, {
    parse_mode: 'HTML',
    reply_markup: keyboard,
  })
})

// Comando /id: Retorna o Telegram User ID numérico do usuário
bot.command('id', async (ctx) => {
  const userId = ctx.from?.id
  await ctx.reply(`🆔 <b>Seu Telegram User ID:</b> <code>${userId}</code>`, { parse_mode: 'HTML' })
})

// Comando /ajuda: Instruções de uso e comandos
bot.command('ajuda', async (ctx) => {
  const userId = ctx.from?.id
  const authorized = isAuthorized(userId)

  let helpMessage = `📖 <b>Ajuda do Assistente Financeiro</b>\n\n`
  helpMessage += `🆔 <b>Seu User ID:</b> <code>${userId}</code>\n`
  helpMessage += `🔒 <b>Status:</b> ${authorized ? '✅ Autorizado' : '⛔ Não autorizado'}\n\n`

  if (!authorized) {
    helpMessage +=
      `<b>Comandos públicos:</b>\n` +
      `/start - Inicia o bot e exibe seu status\n` +
      `/id - Exibe apenas o seu Telegram User ID\n` +
      `/ajuda - Exibe este guia de ajuda\n\n` +
      `⚠️ Acesso financeiro bloqueado. Configure <code>TELEGRAM_ALLOWED_USER_ID=${userId}</code> no arquivo <code>.env.local</code> para ter acesso completo.`
    await ctx.reply(helpMessage, { parse_mode: 'HTML' })
    return
  }

    helpMessage +=
    `<b>Comandos disponíveis:</b>\n` +
    `/start - Informações da sua conta e status de acesso\n` +
    `/id - Exibe o seu Telegram User ID\n` +
    `/saldo - Consulta os saldos e faturas das suas contas\n` +
    `/fatura - Consulta detalhada das faturas de cartão de crédito\n` +
    `/gastos - Resumo das despesas do mês agrupadas por categoria\n` +
    `/ultimos - Lista os lançamentos financeiros mais recentes\n` +
    `/lembretes - Configura notificações de faturas, recorrências e resumo semanal\n` +
    `/ajuda - Exibe este guia de ajuda\n` +
    `/cancelar - Cancela a operação pendente\n\n` +
    `📸 <b>Envio de Comprovantes (Foto ou Documento):</b>\n` +
    `Envie uma foto ou arquivo de imagem (JPEG/PNG/WEBP) com legenda opcional (ex: <i>"paguei no Pix"</i> ou <i>"parcela em 2x no Nubank"</i>).\n\n` +
    `💬 <b>Lançamentos por Texto:</b>\n` +
    `Descreva seu gasto ou receita em linguagem natural. Ex: <i>"gastei 85 no mercado hoje no cartão Inter"</i>.\n\n` +
    `✏️ <b>Correção de Prévia:</b>\n` +
    `Se houver uma prévia pendente, basta enviar uma mensagem com o ajuste (ex: <i>"foi no Pix"</i>, <i>"a conta é Inter"</i>, <i>"foi 90 reais"</i>) para atualizar antes de confirmar.\n\n` +
    `🔍 <b>Consultas em Linguagem Natural:</b>\n` +
    `Você também pode perguntar diretamente ao bot:\n` +
    `• <i>"quanto gastei com mercado este mês?"</i>\n` +
    `• <i>"qual a fatura do Inter?"</i>\n` +
    `• <i>"qual o meu saldo atual?"</i>\n` +
    `• <i>"quais foram minhas últimas compras?"</i>\n\n` +
    `📱 <b>Telegram Mini App:</b>\n` +
    `Você pode usar o aplicativo visual completo com visão geral, contas, faturas, extrato com filtros e novos lançamentos diretamente no Telegram.\n\n` +
    `<i>O bot nunca grava nada no banco antes de você clicar em ✅ Confirmar.</i>`

  let keyboard: InlineKeyboard | undefined
  if (MINI_APP_URL && MINI_APP_URL.startsWith('https://')) {
    keyboard = new InlineKeyboard().webApp('📱 Abrir App Finanças', MINI_APP_URL)
  }

  await ctx.reply(helpMessage, {
    parse_mode: 'HTML',
    reply_markup: keyboard,
  })
})

// Comando /cancelar: Cancela estados e fluxos ativos
bot.command('cancelar', async (ctx) => {
  const userId = ctx.from?.id
  if (userId) {
    const batch = [...pendingBatches.values()].find(b => b.userId === userId)
    if (batch) {
      await ctx.reply(cancelBatch(batch, userId, pendingBatches))
      return
    }
    let cancelled = false
    for (const [id, pending] of pendingTransactions.entries()) {
      if (pending.userId === userId) {
        pendingTransactions.delete(id)
        cancelled = true
      }
    }
    if (cancelled) {
      await ctx.reply('❌ <b>Lançamento cancelado e descartado.</b>', { parse_mode: 'HTML' })
      return
    }
  }
  await ctx.reply('🚫 Nenhuma operação em andamento para cancelar.')
})

// ==========================================
// MIDDLEWARE DE AUTORIZAÇÃO (Protege todas as demais mensagens e dados financeiros)
// ==========================================
bot.use(async (ctx, next) => {
  const userId = ctx.from?.id
  if (!isAuthorized(userId)) {
    await ctx.reply(
      `⛔ <b>Acesso não autorizado.</b>\n\nSeu Telegram User ID é: <code>${userId}</code>\n\nAdicione esta chave ao seu <code>.env.local</code> para liberar o acesso:\n<code>TELEGRAM_ALLOWED_USER_ID=${userId}</code>`,
      { parse_mode: 'HTML' }
    )
    return
  }

  return next()
})

// ==========================================
// COMANDOS FINANCEIROS PROTEGIDOS (Apenas Usuário Autorizado)
// ==========================================

// Comando /saldo: Consulta saldo de contas e faturas de cartão com botões inline de navegação
bot.command('saldo', async (ctx) => {
  try {
    const { renderSaldoScreen } = await import('../lib/saldoNavigation')
    const screen = await renderSaldoScreen({}, { ctx, userId: ctx.from?.id })
    await ctx.reply(screen.text, {
      parse_mode: screen.parseMode || 'HTML',
      reply_markup: screen.keyboard,
    })
  } catch (error) {
    console.error('[Telegram Bot] Erro ao consultar /saldo:', error)
    const errMessage = error instanceof Error ? error.message : 'Erro desconhecido'
    await ctx.reply(`⚠️ Ocorreu um erro ao consultar os saldos:\n<code>${errMessage}</code>`, { parse_mode: 'HTML' })
  }
})

// Comando /fatura: Consulta detalhada das faturas abertas do mês atual por cartão
bot.command('fatura', async (ctx) => {
  try {
    const { listAccounts, getDashboardSummary } = await import('../lib/queries')
    const { formatBRL } = await import('../lib/formatters')
    const { getCardInvoiceDates } = await import('../lib/billingCycles')

    const accounts = await listAccounts({ activeOnly: true })
    const creditCards = (accounts || []).filter((acc) => acc.type === 'credit_card')

    if (!creditCards || creditCards.length === 0) {
      await ctx.reply('ℹ️ Nenhum cartão de crédito cadastrado ou ativo encontrado.')
      return
    }

    const summary = await getDashboardSummary({ periodType: 'month' })
    const accountMetricsMap = new Map((summary.accountMetrics || []).map((m) => [m.id, m]))

    const todayStr = new Date().toISOString().slice(0, 10)

    let message = `💳 <b>Faturas de Cartão de Crédito</b>\n`
    message += `<i>Referência: ${summary.period.label}</i>\n`
    message += `━━━━━━━━━━━━━━━━━━━━━\n\n`

    let totalInvoices = 0

    for (const card of creditCards) {
      const metric = accountMetricsMap.get(card.id)
      const invoiceAmount = metric ? metric.totalExpenses : 0
      totalInvoices += invoiceAmount

      const closingDay = card.closing_day || 5
      const dueDay = card.due_day || 15
      const cycle = getCardInvoiceDates(todayStr, closingDay, dueDay)

      // Formatar datas de fechamento e vencimento (DD/MM/AAAA)
      const formatIsoDate = (isoStr: string) => {
        const [y, m, d] = isoStr.split('-')
        return `${d}/${m}/${y}`
      }

      const institution = card.institution ? ` (${card.institution})` : ''

      message += `💳 <b>${card.name}</b>${institution}\n`
      message += `   • Fechamento: <b>${formatIsoDate(cycle.closingDate)}</b> (dia ${closingDay})\n`
      message += `   • Vencimento: <b>${formatIsoDate(cycle.dueDate)}</b> (dia ${dueDay})\n`
      message += `   • Fatura Atual: <b>${formatBRL(invoiceAmount)}</b>\n`
      if (metric && metric.transactionCount > 0) {
        message += `   • Lançamentos no mês: ${metric.transactionCount}\n`
      }
      message += `\n`
    }

    message += `━━━━━━━━━━━━━━━━━━━━━\n`
    message += `📊 <b>Total Consolidado de Faturas:</b> <b>${formatBRL(totalInvoices)}</b>`

    await ctx.reply(message, { parse_mode: 'HTML' })
  } catch (error) {
    console.error('[Telegram Bot] Erro ao consultar /fatura:', error)
    const errMessage = error instanceof Error ? error.message : 'Erro desconhecido'
    await ctx.reply(`⚠️ Ocorreu um erro ao consultar as faturas:\n<code>${errMessage}</code>`, { parse_mode: 'HTML' })
  }
})

// Comando /gastos: Painel interativo de Gastos com navegação determinística por botões inline
bot.command('gastos', async (ctx) => {
  try {
    const { renderGastosScreen } = await import('../lib/gastosNavigation')
    const screen = await renderGastosScreen({}, { ctx, userId: ctx.from?.id })
    await ctx.reply(screen.text, {
      parse_mode: screen.parseMode || 'HTML',
      reply_markup: screen.keyboard,
    })
  } catch (error) {
    console.error('[Telegram Bot] Erro ao consultar /gastos:', error)
    const errMessage = error instanceof Error ? error.message : 'Erro desconhecido'
    await ctx.reply(`⚠️ Ocorreu um erro ao consultar os gastos:\n<code>${errMessage}</code>`, { parse_mode: 'HTML' })
  }
})

// Helper reutilizável para formatar lista de últimos lançamentos
async function formatRecentTransactionsMessage(limit = 10, categoryFilter?: string, vendorFilter?: string): Promise<string> {
  const { listTransactions } = await import('../lib/queries')
  const { formatBRL } = await import('../lib/formatters')

  const res = await listTransactions({
    limit,
    category: categoryFilter,
    vendor: vendorFilter,
  })

  const txs = res.transactions || []
  if (txs.length === 0) {
    let emptyMsg = 'ℹ️ Nenhum lançamento financeiro recente encontrado'
    if (categoryFilter) emptyMsg += ` para a categoria "${categoryFilter}"`
    if (vendorFilter) emptyMsg += ` para "${vendorFilter}"`
    return `${emptyMsg}.`
  }

  let message = `🧾 <b>Últimos Lançamentos</b>`
  if (categoryFilter) message += ` (Categoria: <i>${categoryFilter}</i>)`
  if (vendorFilter) message += ` (Local: <i>${vendorFilter}</i>)`
  message += `\n━━━━━━━━━━━━━━━━━━━━━\n\n`

  for (const tx of txs) {
    const isIncome = tx.type === 'income'
    const emoji = isIncome ? '🟢' : '🔴'
    const amountStr = formatBRL(tx.total)
    const vendorName = tx.vendor || (isIncome ? 'Origem não informada' : 'Estabelecimento não informado')
    
    // Formatar data (DD/MM/AAAA)
    let dateStr = tx.date || tx.created_at?.slice(0, 10) || ''
    if (dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      const [y, m, d] = dateStr.split('-')
      dateStr = `${d}/${m}/${y}`
    }

    const catName = tx.category || tx.categories?.name || 'Outros'
    const payment = tx.payment_method ? ` • ${tx.payment_method}` : ''
    const accName = tx.accounts?.name ? ` • 🏦 ${tx.accounts.name}` : ''

    message += `${emoji} <b>${amountStr}</b> — <b>${vendorName}</b>\n`
    message += `   📅 ${dateStr} • 📁 ${catName}${payment}${accName}\n\n`
  }

  message += `━━━━━━━━━━━━━━━━━━━━━\n`
  message += `📊 Total exibido: <b>${txs.length}</b> de <b>${res.total_count}</b> lançamentos.`
  return message
}

// Comando /ultimos: Consulta lançamentos recentes
bot.command('ultimos', async (ctx) => {
  try {
    const message = await formatRecentTransactionsMessage(10)
    await ctx.reply(message, { parse_mode: 'HTML' })
  } catch (error) {
    console.error('[Telegram Bot] Erro ao consultar /ultimos:', error)
    const errMessage = error instanceof Error ? error.message : 'Erro desconhecido'
    await ctx.reply(`⚠️ Ocorreu um erro ao consultar os últimos lançamentos:\n<code>${errMessage}</code>`, { parse_mode: 'HTML' })
  }
})

// Helper para construir o menu de configuração de lembretes
function buildRemindersMenu(userId: number) {
  const { getPreferences } = require('../lib/reminders')
  const prefs = getPreferences(userId)

  const invStatus = prefs.invoicesEnabled ? '🟢 Ligado' : '⚪ Desligado'
  const recStatus = prefs.recurrencesEnabled ? '🟢 Ligado' : '⚪ Desligado'
  const weekStatus = prefs.weeklySummaryEnabled ? '🟢 Ligado' : '⚪ Desligado'

  let text = `⏰ <b>Configuração de Lembretes Automáticos</b>\n\n`
  text += `Escolha quais notificações você deseja receber no seu Telegram:\n\n`
  text += `1. <b>Faturas de Cartão:</b> ${invStatus}\n`
  text += `   <i>Avisos 3 dias antes e no dia do vencimento às ${prefs.reminderHour}h.</i>\n\n`
  text += `2. <b>Despesas Recorrentes:</b> ${recStatus}\n`
  text += `   <i>Aviso 1 dia antes da data prevista às ${prefs.reminderHour}h.</i>\n\n`
  text += `3. <b>Resumo Semanal:</b> ${weekStatus}\n`
  text += `   <i>Enviado toda segunda-feira às ${prefs.reminderHour}h com gastos e compromissos.</i>\n\n`
  text += `🕒 <b>Horário atual:</b> <code>${String(prefs.reminderHour).padStart(2, '0')}:00</code> (Horário de Brasília - <code>${prefs.timezone}</code>)`

  const keyboard = new InlineKeyboard()
    .text(prefs.invoicesEnabled ? '💳 Faturas: Ligado (Desligar)' : '💳 Faturas: Desligado (Ligar)', 'rem_toggle:invoices')
    .row()
    .text(prefs.recurrencesEnabled ? '🔁 Recorrências: Ligado (Desligar)' : '🔁 Recorrências: Desligado (Ligar)', 'rem_toggle:recurrences')
    .row()
    .text(prefs.weeklySummaryEnabled ? '📊 Resumo Semanal: Ligado (Desligar)' : '📊 Resumo Semanal: Desligado (Ligar)', 'rem_toggle:weekly')
    .row()
    .text('🕒 Alterar Horário', 'rem_change_hour')
    .text('🔄 Atualizar', 'rem_refresh')

  return { text, keyboard }
}

// Comando /lembretes: Gerencia preferências e notificações
bot.command('lembretes', async (ctx) => {
  const userId = ctx.from?.id
  if (!userId) return

  try {
    const { text, keyboard } = buildRemindersMenu(userId)
    await ctx.reply(text, {
      parse_mode: 'HTML',
      reply_markup: keyboard,
    })
  } catch (error) {
    console.error('[Telegram Bot] Erro ao abrir /lembretes:', error)
    await ctx.reply('⚠️ Ocorreu um erro ao carregar as configurações de lembretes.')
  }
})


// ==========================================
// FLUXO DE LANÇAMENTO E PROCESSAMENTO DE MÍDIA / TEXTO
// ==========================================

import type { Receipt } from '../lib/schema'

// Helpers importados de lib/confirmation
import {
  buildPreviewMessage,
  buildPreviewKeyboard,
  eligiblePreviewAccounts,
  applyPreviewAccount,
  applyPreviewPayment,
  processConfirmationAction,
  processCancellationAction,
  formatConfirmationSuccessMessage,
  type PendingTransaction,
} from '../lib/confirmation'

// Armazenamento em memória das prévias pendentes de confirmação
const pendingTransactions = new Map<string, PendingTransaction>()

// Limpeza automática de transações pendentes expiradas (> 15 minutos)
setInterval(() => {
  const now = Date.now()
  for (const [id, batch] of pendingBatches) {
    if (!batch.busy && now - batch.createdAt > 15 * 60 * 1000) pendingBatches.delete(id)
  }
  for (const [id, pending] of pendingTransactions.entries()) {
    if (now - pending.createdAt > 15 * 60 * 1000) {
      pendingTransactions.delete(id)
    }
  }
}, 60 * 1000)

// Helper compartilhado para processar buffer de imagem (usado por photo e document)
async function handleReceiptImageBuffer(
  ctx: any,
  buffer: Buffer,
  contentType: string,
  filename: string,
  caption: string | null
) {
  const userId = ctx.from.id
  for (const [id, batch] of pendingBatches) {
    if (batch.userId === userId) {
      if (batch.busy) { await ctx.reply('⏳ Aguarde o processamento do lote.'); return }
      pendingBatches.delete(id)
    }
  }
  const statusMsg = await ctx.reply('⏳ <i>Processando imagem do comprovante...</i>', { parse_mode: 'HTML' })

  try {
    const { parseReceiptImage } = await import('../lib/pipeline')

    // Analisar comprovante SEM salvar no banco e SEM enviar para o Storage ainda
    const { receipt, originalExtractedData, sha256 } = await parseReceiptImage(buffer, contentType, {
      rawText: caption,
      filename,
    })

    // Validar se dados essenciais foram identificados
    const hasValidAmount = typeof receipt.total === 'number' && receipt.total > 0
    if (!hasValidAmount) {
      await ctx.api.editMessageText(
        ctx.chat.id,
        statusMsg.message_id,
        `❓ Não consegui identificar o valor financeiro neste comprovante.\n\n` +
        `Verifique se a imagem está legível ou envie os dados por texto com valor e estabelecimento.`,
        { parse_mode: 'HTML' }
      )
      return
    }

    // Limpar qualquer prévia pendente anterior deste usuário para evitar acumular lixo em memória
    for (const [prevId, prevPending] of pendingTransactions.entries()) {
      if (prevPending.userId === userId) {
        pendingTransactions.delete(prevId)
      }
    }

    // ID único para esta prévia
    const txPendingId = `tx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`

    pendingTransactions.set(txPendingId, {
      id: txPendingId,
      userId,
      receipt,
      originalExtractedData,
      sourceType: 'image',
      rawText: caption,
      imageBuffer: buffer,
      imageContentType: contentType,
      imageSha256: sha256,
      originalFilename: filename,
      createdAt: Date.now(),
    })

    const preview = await buildPreviewMessage(receipt, 'image')
    const keyboard = await buildPreviewKeyboard(txPendingId, receipt)

    await ctx.api.editMessageText(ctx.chat.id, statusMsg.message_id, preview, {
      parse_mode: 'HTML',
      reply_markup: keyboard,
    })
  } catch (error) {
    console.error('[Telegram Bot] Erro ao processar comprovante:', error)
    const errMessage = error instanceof Error ? error.message : 'Erro ao processar imagem'
    await ctx.api.editMessageText(
      ctx.chat.id,
      statusMsg.message_id,
      `⚠️ Não foi possível interpretar o comprovante:\n<code>${errMessage}</code>`,
      { parse_mode: 'HTML' }
    )
  }
}

// Ouvinte de mensagens de foto com legenda opcional
bot.on('message:photo', async (ctx) => {
  const caption = ctx.message.caption?.trim() || null

  try {
    const photos = ctx.message.photo
    const largestPhoto = photos[photos.length - 1]
    const fileInfo = await ctx.api.getFile(largestPhoto.file_id)

    if (!fileInfo.file_path) {
      throw new Error('Não foi possível obter o caminho do arquivo do Telegram.')
    }

    const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${fileInfo.file_path}`
    const response = await fetch(fileUrl)
    if (!response.ok) {
      throw new Error(`Falha ao baixar imagem do Telegram: HTTP ${response.status}`)
    }
    const arrayBuffer = await response.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const contentType = 'image/jpeg'
    const filename = `telegram_${largestPhoto.file_id.slice(0, 12)}.jpg`

    await handleReceiptImageBuffer(ctx, buffer, contentType, filename, caption)
  } catch (error) {
    console.error('[Telegram Bot] Erro ao baixar foto:', error)
    const errMessage = error instanceof Error ? error.message : 'Falha no download'
    await ctx.reply(`⚠️ Falha ao baixar a foto enviada:\n<code>${errMessage}</code>`, { parse_mode: 'HTML' })
  }
})

// Ouvinte de documentos (para comprovantes enviados como arquivo/imagem sem compressão)
bot.on('message:document', async (ctx) => {
  const doc = ctx.message.document
  const mimeType = (doc.mime_type || '').toLowerCase()
  const caption = ctx.message.caption?.trim() || null

  // Verificar se o documento é uma imagem suportada
  const isImageDoc =
    mimeType.startsWith('image/') ||
    /\.(jpe?g|png|webp|heic)$/i.test(doc.file_name || '')

  if (!isImageDoc) {
    await ctx.reply('ℹ️ Por favor, envie comprovantes em formato de imagem (JPEG, PNG ou WebP).')
    return
  }

  try {
    const fileInfo = await ctx.api.getFile(doc.file_id)
    if (!fileInfo.file_path) {
      throw new Error('Não foi possível obter o caminho do arquivo no Telegram.')
    }

    const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${fileInfo.file_path}`
    const response = await fetch(fileUrl)
    if (!response.ok) {
      throw new Error(`Falha ao baixar documento do Telegram: HTTP ${response.status}`)
    }
    const arrayBuffer = await response.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const contentType = mimeType.startsWith('image/') ? mimeType : 'image/jpeg'
    const filename = doc.file_name || `telegram_doc_${doc.file_id.slice(0, 12)}.jpg`

    await handleReceiptImageBuffer(ctx, buffer, contentType, filename, caption)
  } catch (error) {
    console.error('[Telegram Bot] Erro ao processar documento de imagem:', error)
    const errMessage = error instanceof Error ? error.message : 'Falha no processamento'
    await ctx.reply(`⚠️ Falha ao processar o documento de imagem:\n<code>${errMessage}</code>`, { parse_mode: 'HTML' })
  }
})

// Ouvinte de mensagens de texto: Roteador Inteligente (Consultas Determinísticas -> Lançamentos Locais -> IA Fallback)
bot.on('message:text', async (ctx) => {
  const text = ctx.message.text.trim()

  // Ignorar comandos
  if (text.startsWith('/')) {
    return
  }

  const userId = ctx.from.id

  const batch = [...pendingBatches.values()].find(b => b.userId === userId)
  if (batch) {
    try {
      if (/^(cancelar|cancela|descartar|esquece|não|nao)$/i.test(text)) {
        await ctx.reply(cancelBatch(batch, userId, pendingBatches))
      } else if (/^(sim|confirmar(?: todos)?|confirma|ok|salvar|pode salvar)$/i.test(text)) {
        await ctx.reply(await confirmBatch(batch.id, userId, pendingBatches))
      } else {
        const error = await correctBatch(batch, text)
        if (error) await ctx.reply(error)
        else {
          const preview = await batchPreview(batch)
          await ctx.reply(preview.text, { parse_mode: 'HTML', reply_markup: preview.keyboard })
        }
      }
    } catch (error) {
      console.error('[Telegram Bot] Lote:', error)
      await ctx.reply('⚠️ Não foi possível processar o lote. Se houve tentativa de gravação, confira os lançamentos antes de reenviar.')
    }
    return
  }

  // 1. VERIFICAÇÃO DE CORREÇÃO DE PRÉVIA EXISTENTE
  // Se o usuário já possui uma prévia pendente ativa, verificar se a mensagem é um ajuste de campo
  let existingPendingEntry: [string, PendingTransaction] | null = null
  for (const entry of pendingTransactions.entries()) {
    if (entry[1].userId === userId) {
      existingPendingEntry = entry
      break
    }
  }

  if (existingPendingEntry) {
    const [txId, pending] = existingPendingEntry
    const lowerText = text.toLowerCase().trim()

    // Compatibilidade com confirmação textual (ex: "sim", "confirmar", "confirma", "ok", "pode salvar")
    const isTextConfirm = /^(sim|confirmar|confirma|confirmado|ok|gravar|salvar|pode salvar|pode gravar)$/i.test(lowerText)
    // Compatibilidade com cancelamento textual (ex: "cancelar", "cancela", "descartar", "esquece")
    const isTextCancel = /^(cancelar|cancela|cancelado|descartar|descarta|esquece|nao|não)$/i.test(lowerText)

    if (isTextCancel) {
      const cancelRes = processCancellationAction(txId, userId, pendingTransactions)
      await ctx.reply(cancelRes.message, { parse_mode: 'HTML' })
      return
    }

    if (isTextConfirm) {
      const statusMsg = await ctx.reply('⏳ <i>Gravando lançamento...</i>', { parse_mode: 'HTML' })
      try {
        const { save } = await import('../lib/persist')
        const { store } = await import('../lib/storage')

        const result = await processConfirmationAction(
          txId,
          userId,
          pendingTransactions,
          save,
          async (buf, ct) => {
            const stored = await store(buf, ct)
            return { key: stored.key, sha256: stored.sha256 }
          }
        )

        if (result.status === 'confirmed' && result.saved) {
          const successMsg = formatConfirmationSuccessMessage(result.saved)
          await ctx.api.editMessageText(ctx.chat.id, statusMsg.message_id, successMsg, {
            parse_mode: 'HTML',
          })
        } else {
          await ctx.api.editMessageText(ctx.chat.id, statusMsg.message_id, result.message, {
            parse_mode: 'HTML',
          })
        }
      } catch (err) {
        console.error('[Telegram Bot] Erro ao gravar lançamento por confirmação textual:', err)
        const errMsg = err instanceof Error ? err.message : 'Falha na gravação'
        await ctx.api.editMessageText(ctx.chat.id, statusMsg.message_id, `⚠️ Erro ao gravar lançamento:\n<code>${errMsg}</code>`, {
          parse_mode: 'HTML',
        })
      }
      return
    }

    // Mensagens de correção: durante o estado de prévia pendente, qualquer mensagem textual é tratada como correção
    const statusMsg = await ctx.reply('⏳ <i>Atualizando prévia...</i>', { parse_mode: 'HTML' })
    try {
      const { parsePreviewCorrection } = await import('../lib/intent')
      const { recordAiCall } = await import('../lib/textRouter')
      recordAiCall()
      const correctionResult = await parsePreviewCorrection(pending.receipt, text)

      if (correctionResult.changedFields.length > 0) {
        pending.receipt = correctionResult.updatedReceipt
        pending.createdAt = Date.now() // Renova o TTL
        pendingTransactions.set(txId, pending)

        const updatedPreview = await buildPreviewMessage(pending.receipt, pending.sourceType, correctionResult.changedFields)
        const keyboard = await buildPreviewKeyboard(txId, pending.receipt)

        await ctx.api.editMessageText(ctx.chat.id, statusMsg.message_id, updatedPreview, {
          parse_mode: 'HTML',
          reply_markup: keyboard,
        })
        return
      } else {
        // Nenhuma alteração reconhecida: orientar o usuário sem cair em novo lançamento
        const keyboard = await buildPreviewKeyboard(txId, pending.receipt)
        await ctx.api.editMessageText(
          ctx.chat.id,
          statusMsg.message_id,
          `⚠️ Não entendi a alteração.\n\nVocê pode:\n• Tocar em <b>✅ Confirmar</b> para gravar\n• Informar correções como: <i>"foi no pix"</i>, <i>"conta Nubank"</i>, <i>"valor 50"</i>\n• Enviar <b>cancelar</b> ou tocar em <b>❌ Cancelar</b> para descartar`,
          {
            parse_mode: 'HTML',
            reply_markup: keyboard,
          }
        )
        return
      }
    } catch (err) {
      console.error('[Telegram Bot] Erro na correção de prévia:', err)
      const keyboard = await buildPreviewKeyboard(txId, pending.receipt)
      await ctx.api.editMessageText(
        ctx.chat.id,
        statusMsg.message_id,
        `⚠️ Ocorreu um erro ao processar a alteração. Tente novamente ou use os botões abaixo:`,
        {
          parse_mode: 'HTML',
          reply_markup: keyboard,
        }
      )
      return
    }
  }

  // 2. CONSULTAS INEQUÍVOCAS DETERMINÍSTICAS (Zero AI)
  try {
    const { listAccounts, listCategories } = await import('../lib/queries')
    const {
      matchDeterministicQuery,
      parseSingleTransactionLocally,
      recordLocalQuery,
      recordLocalLaunch,
      recordAiCall,
    } = await import('../lib/textRouter')

    const accounts = await listAccounts({ activeOnly: true })
    const deterministicQuery = matchDeterministicQuery(text, accounts)

    if (deterministicQuery) {
      recordLocalQuery()

      // A) Consulta de Faturas Determinística
      if (deterministicQuery.type === 'invoice') {
        if (deterministicQuery.ambiguousAccountName) {
          await ctx.reply(
            `❓ Você mencionou <b>${deterministicQuery.ambiguousAccountName}</b>, mas não encontrei um cartão de crédito correspondente cadastrado.\n\n` +
            `💡 <i>Verifique seus cartões com /saldo ou /fatura.</i>`,
            { parse_mode: 'HTML' }
          )
          return
        }

        const { formatBRL } = await import('../lib/formatters')
        const { getCardInvoiceDates } = await import('../lib/billingCycles')
        const { getDashboardSummary } = await import('../lib/queries')

        let creditCards = (accounts || []).filter((acc) => acc.type === 'credit_card')
        if (deterministicQuery.targetAccount) {
          creditCards = creditCards.filter((c) => c.id === deterministicQuery.targetAccount?.id)
        }

        if (creditCards.length === 0) {
          await ctx.reply('ℹ️ Nenhum cartão de crédito cadastrado ou ativo encontrado.')
          return
        }

        const summary = await getDashboardSummary({ periodType: 'month' })
        const accountMetricsMap = new Map((summary.accountMetrics || []).map((m) => [m.id, m]))
        const todayStr = new Date().toISOString().slice(0, 10)

        let msg = `💳 <b>Consulta de Fatura de Cartão</b>\n`
        msg += `<i>Referência: ${summary.period.label}</i>\n`
        msg += `━━━━━━━━━━━━━━━━━━━━━\n\n`

        let totalInvoices = 0
        for (const card of creditCards) {
          const metric = accountMetricsMap.get(card.id)
          const invoiceAmount = metric ? metric.totalExpenses : 0
          totalInvoices += invoiceAmount

          const closingDay = card.closing_day || 5
          const dueDay = card.due_day || 15
          const cycle = getCardInvoiceDates(todayStr, closingDay, dueDay)
          const formatIsoDate = (isoStr: string) => {
            const [y, m, d] = isoStr.split('-')
            return `${d}/${m}/${y}`
          }

          msg += `💳 <b>${card.name}</b>${card.institution ? ` (${card.institution})` : ''}\n`
          msg += `   • Fatura Atual: <b>${formatBRL(invoiceAmount)}</b>\n`
          msg += `   • Fechamento: ${formatIsoDate(cycle.closingDate)} | Vencimento: ${formatIsoDate(cycle.dueDate)}\n\n`
        }

        if (creditCards.length > 1) {
          msg += `━━━━━━━━━━━━━━━━━━━━━\n`
          msg += `📊 <b>Total Consolidado:</b> <b>${formatBRL(totalInvoices)}</b>`
        }

        await ctx.reply(msg, { parse_mode: 'HTML' })
        return
      }

      // B) Consulta de Saldo Determinística
      if (deterministicQuery.type === 'balance') {
        if (deterministicQuery.ambiguousAccountName) {
          await ctx.reply(
            `❓ Você mencionou <b>${deterministicQuery.ambiguousAccountName}</b>, mas não encontrei uma conta correspondente cadastrada.\n\n` +
            `💡 <i>Verifique suas contas com /saldo.</i>`,
            { parse_mode: 'HTML' }
          )
          return
        }

        const { formatBRL, getAccountTypeLabel } = await import('../lib/formatters')
        const { getDashboardSummary } = await import('../lib/queries')

        const summary = await getDashboardSummary({ periodType: 'month' })
        const accountMetricsMap = new Map((summary.accountMetrics || []).map((m) => [m.id, m]))

        let targetAccounts = accounts
        if (deterministicQuery.targetAccount) {
          targetAccounts = accounts.filter((a) => a.id === deterministicQuery.targetAccount?.id)
        }

        let msg = `💰 <b>Consulta de Saldo</b>\n`
        msg += `<i>Referência: ${summary.period.label}</i>\n`
        msg += `━━━━━━━━━━━━━━━━━━━━━\n\n`

        let totalLiquid = 0
        for (const acc of targetAccounts) {
          const metric = accountMetricsMap.get(acc.id)
          const typeLabel = getAccountTypeLabel(acc.type)
          const institution = acc.institution ? ` (${acc.institution})` : ''

          if (acc.type === 'credit_card') {
            const invoice = metric ? metric.totalExpenses : 0
            msg += `💳 <b>${acc.name}</b>${institution}\n`
            msg += `   • Fatura Atual: <b>${formatBRL(invoice)}</b>\n\n`
          } else {
            const balance = metric ? metric.balance : 0
            totalLiquid += balance
            const icon = acc.type === 'cash' ? '💵' : acc.type === 'digital_wallet' ? '📱' : '🏦'
            msg += `${icon} <b>${acc.name}</b>${institution}\n`
            msg += `   • Saldo do Mês: <b>${formatBRL(balance)}</b>\n\n`
          }
        }

        if (targetAccounts.length > 1) {
          msg += `━━━━━━━━━━━━━━━━━━━━━\n`
          msg += `📊 <b>Saldo Líquido Consolidado:</b> <b>${formatBRL(totalLiquid)}</b>`
        }

        await ctx.reply(msg, { parse_mode: 'HTML' })
        return
      }

      // C) Consulta de Gastos Determinística
      if (deterministicQuery.type === 'expenses') {
        const { getDashboardSummary, listTransactions } = await import('../lib/queries')
        const { formatBRL } = await import('../lib/formatters')

        if (deterministicQuery.category) {
          const txRes = await listTransactions({
            type: 'expense',
            category: deterministicQuery.category,
            limit: 50,
          })
          const total = txRes.total_amount || 0
          const count = txRes.total_count || 0

          let msg = `📊 <b>Gastos Encontrados</b>\n`
          msg += `📁 Categoria: <b>${deterministicQuery.category}</b>\n`
          msg += `━━━━━━━━━━━━━━━━━━━━━\n\n`
          msg += `💰 <b>Total Gasto:</b> <b>${formatBRL(total)}</b>\n`
          msg += `🧾 <b>Lançamentos:</b> ${count} registro(s)\n`

          if (txRes.transactions && txRes.transactions.length > 0) {
            msg += `\n<i>Últimos lançamentos:</i>\n`
            for (const t of txRes.transactions.slice(0, 5)) {
              let d = t.date || t.created_at?.slice(0, 10) || ''
              if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
                const [y, m, day] = d.split('-')
                d = `${day}/${m}/${y}`
              }
              msg += `• ${d}: <b>${formatBRL(t.total)}</b> (${t.vendor || 'Sem local'})\n`
            }
          }
          await ctx.reply(msg, { parse_mode: 'HTML' })
          return
        }

        // Resumo geral
        const summary = await getDashboardSummary({ periodType: 'month' })
        const { metrics, topCategories, period } = summary

        let msg = `📊 <b>Despesas do Mês</b>\n`
        msg += `<i>Referência: ${period.label}</i>\n`
        msg += `━━━━━━━━━━━━━━━━━━━━━\n\n`

        if (!metrics || metrics.expenseTransactionCount === 0 || metrics.totalExpenses === 0) {
          msg += `ℹ️ Nenhum gasto registrado neste período.`
        } else {
          msg += `📁 <b>Gastos por Categoria:</b>\n`
          for (const cat of topCategories) {
            const pct = cat.percentage ? `${cat.percentage}%` : '0%'
            msg += `• <b>${cat.category}</b>: <b>${formatBRL(cat.total)}</b> (${pct})\n`
          }
          msg += `\n━━━━━━━━━━━━━━━━━━━━━\n`
          msg += `💰 <b>Total de Despesas:</b> <b>${formatBRL(metrics.totalExpenses)}</b>\n`
          msg += `🧾 <b>Lançamentos:</b> ${metrics.expenseTransactionCount}`
        }

        await ctx.reply(msg, { parse_mode: 'HTML' })
        return
      }

      // D) Consulta de Últimos Determinística
      if (deterministicQuery.type === 'recent') {
        const message = await formatRecentTransactionsMessage(deterministicQuery.limit || 10)
        await ctx.reply(message, { parse_mode: 'HTML' })
        return
      }
    }

    const { isMultiExpenseText } = await import('../lib/textRouter')
    if (isMultiExpenseText(text)) {
      recordAiCall()
      const batch = await parseBatch(text, userId, accounts, await listCategories())
      if (batch.items.length > 1) {
        pendingBatches.set(batch.id, batch)
        const preview = await batchPreview(batch)
        await ctx.reply(preview.text, { parse_mode: 'HTML', reply_markup: preview.keyboard })
        return
      }
      // An itemized purchase is still a single transaction.
    }

    // 3. INTERPRETAÇÃO LOCAL DE LANÇAMENTOS SIMPLES (Zero AI)
    const categories = await listCategories()
    const localParse = parseSingleTransactionLocally(text, accounts, categories)

    if (localParse.success && localParse.receipt) {
      recordLocalLaunch()

      // Limpar qualquer prévia pendente anterior deste usuário
      for (const [prevId, prevPending] of pendingTransactions.entries()) {
        if (prevPending.userId === userId) {
          pendingTransactions.delete(prevId)
        }
      }

      const txPendingId = `tx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
      const receipt = localParse.receipt

      pendingTransactions.set(txPendingId, {
        id: txPendingId,
        userId,
        receipt,
        originalExtractedData: { ...receipt },
        sourceType: 'text',
        rawText: text,
        createdAt: Date.now(),
      })

      const preview = await buildPreviewMessage(receipt, 'text')
      const keyboard = await buildPreviewKeyboard(txPendingId, receipt)

      await ctx.reply(preview, {
        parse_mode: 'HTML',
        reply_markup: keyboard,
      })
      return
    }

    // 4. CAMPO INDISPENSÁVEL AUSENTE (Sem chamar IA se faltar apenas valor)
    if (localParse.missingField === 'amount') {
      await ctx.reply(
        `❓ Não consegui identificar o valor financeiro da operação.\n\n` +
        `Por favor, informe a descrição incluindo o valor. Exemplo:\n` +
        `<i>"Gastei 50 no mercado hoje"</i> ou <i>"Recebi 120 de reembolso"</i>`,
        { parse_mode: 'HTML' }
      )
      return
    }

    // 6. TEXTO COMPLEXO OU AMBÍGUO (ÚNICO LANÇAMENTO) -> FLUXO DE IA
    recordAiCall()
    const statusMsg = await ctx.reply('⏳ <i>Interpretando com IA...</i>', { parse_mode: 'HTML' })

    const { parseTextExpense } = await import('../lib/pipeline')
    const { receipt, originalExtractedData } = await parseTextExpense(text)

    const hasValidAmount = typeof receipt.total === 'number' && receipt.total > 0
    if (!hasValidAmount) {
      await ctx.api.editMessageText(
        ctx.chat.id,
        statusMsg.message_id,
        `❓ Não consegui identificar o valor financeiro da operação.\n\n` +
        `Por favor, informe a descrição com o valor e estabelecimento. Exemplo:\n` +
        `<i>"Gastei 50 no mercado hoje"</i> ou <i>"Recebi 120 de reembolso"</i>`,
        { parse_mode: 'HTML' }
      )
      return
    }

    for (const [prevId, prevPending] of pendingTransactions.entries()) {
      if (prevPending.userId === userId) {
        pendingTransactions.delete(prevId)
      }
    }

    const txPendingId = `tx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
    pendingTransactions.set(txPendingId, {
      id: txPendingId,
      userId,
      receipt,
      originalExtractedData,
      sourceType: 'text',
      rawText: text,
      createdAt: Date.now(),
    })

    const preview = await buildPreviewMessage(receipt, 'text')
    const keyboard = await buildPreviewKeyboard(txPendingId, receipt)

    await ctx.api.editMessageText(ctx.chat.id, statusMsg.message_id, preview, {
      parse_mode: 'HTML',
      reply_markup: keyboard,
    })
  } catch (error) {
    console.error('[Telegram Bot] Erro ao interpretar texto:', error)
    const errMessage = error instanceof Error ? error.message : 'Erro ao processar'
    await ctx.reply(
      `⚠️ Não foi possível interpretar o lançamento:\n<code>${errMessage}</code>`,
      { parse_mode: 'HTML' }
    )
  }
})

// Handler de botões Inline (Confirmar / Cancelar / Navegação / Lembretes)
bot.on('callback_query:data', async (ctx) => {
  const data = ctx.callbackQuery.data
  const userId = ctx.from.id

  // Apenas o usuário autorizado pode interagir com botões
  if (!isAuthorized(userId)) {
    await ctx.answerCallbackQuery({ text: '⛔ Você não tem permissão para esta ação.', show_alert: true })
    return
  }

  if (data.startsWith('bs:')) {
    const [, id, token, choice] = data.split(':')
    try {
      const result = await selectBatchAccount(id, userId, token, choice, pendingBatches)
      await ctx.answerCallbackQuery({ text: result.error || 'Lançamento atualizado.', show_alert: Boolean(result.error) })
      if (result.preview) await ctx.editMessageText(result.preview.text, {
        parse_mode: 'HTML', reply_markup: result.preview.keyboard,
      })
    } catch (error) {
      console.error('[Telegram Bot] Seleção de conta do lote:', error)
      await ctx.reply('⚠️ Não foi possível atualizar a conta do lote. Tente novamente ou corrija por texto.')
    }
    return
  }

  if (data.startsWith('batch:')) {
    const [, action, id] = data.split(':')
    const batch = pendingBatches.get(id)
    if (!batch || batch.userId !== userId) {
      await ctx.answerCallbackQuery({ text: '⚠️ Lote indisponível.', show_alert: true })
      return
    }
    await ctx.answerCallbackQuery()
    try {
      if (action === 'confirm') {
        const message = await confirmBatch(id, userId, pendingBatches)
        if (!pendingBatches.has(id)) await ctx.editMessageText(message)
        else await ctx.reply(message)
      } else if (action === 'cancel') {
        await ctx.reply(cancelBatch(batch, userId, pendingBatches))
        if (!pendingBatches.has(id)) await ctx.editMessageReplyMarkup({ reply_markup: undefined })
      } else if (action === 'edit') {
        await ctx.reply('✏️ Indique o lançamento e a correção, por exemplo: “2: foi 80 no Pix”.')
      }
    } catch (error) {
      console.error('[Telegram Bot] Confirmação de lote:', error)
      await ctx.reply('⚠️ Falha na gravação do lote. Confira os lançamentos antes de reenviar; esta confirmação não será repetida.')
    }
    return
  }

  // ==========================================
  // NAVEGAÇÃO GENÉRICA DETERMINÍSTICA POR TELAS/BOTÕES
  // ==========================================
  if (data.startsWith('nav:')) {
    const { decodeNavCallback, navigationRegistry, renderScreenToContext } = await import('../lib/navigation')
    await import('../lib/saldoNavigation') // Garante registro das telas de saldo
    await import('../lib/gastosNavigation') // Garante registro das telas de gastos
    const parsed = decodeNavCallback(data)
    if (parsed && navigationRegistry.has(parsed.screenId)) {
      try {
        const screen = await navigationRegistry.render(parsed.screenId, parsed.params, { userId, ctx })
        await renderScreenToContext(ctx, screen)
      } catch (err) {
        console.error('[Telegram Bot] Erro ao renderizar tela de navegação:', err)
        await ctx.answerCallbackQuery({ text: '⚠️ Ocorreu um erro ao carregar esta tela.', show_alert: true })
      }
      return
    }
  }

  // ==========================================
  // CALLBACKS DO SISTEMA DE LEMBRETES
  // ==========================================
  if (data.startsWith('rem_')) {
    const { getPreferences, updatePreferences, setLog, buildDedupKey } = await import('../lib/reminders')

    // 1. Toggle de preferências
    if (data === 'rem_toggle:invoices') {
      const prefs = getPreferences(userId)
      updatePreferences(userId, { invoicesEnabled: !prefs.invoicesEnabled })
      await ctx.answerCallbackQuery({ text: `Faturas ${!prefs.invoicesEnabled ? 'ativadas' : 'desativadas'}.` })
      const { text, keyboard } = buildRemindersMenu(userId)
      await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: keyboard })
      return
    }

    if (data === 'rem_toggle:recurrences') {
      const prefs = getPreferences(userId)
      updatePreferences(userId, { recurrencesEnabled: !prefs.recurrencesEnabled })
      await ctx.answerCallbackQuery({ text: `Recorrências ${!prefs.recurrencesEnabled ? 'ativadas' : 'desativadas'}.` })
      const { text, keyboard } = buildRemindersMenu(userId)
      await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: keyboard })
      return
    }

    if (data === 'rem_toggle:weekly') {
      const prefs = getPreferences(userId)
      updatePreferences(userId, { weeklySummaryEnabled: !prefs.weeklySummaryEnabled })
      await ctx.answerCallbackQuery({ text: `Resumo semanal ${!prefs.weeklySummaryEnabled ? 'ativado' : 'desativado'}.` })
      const { text, keyboard } = buildRemindersMenu(userId)
      await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: keyboard })
      return
    }

    if (data === 'rem_refresh') {
      await ctx.answerCallbackQuery({ text: 'Atualizado.' })
      const { text, keyboard } = buildRemindersMenu(userId)
      await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: keyboard })
      return
    }

    // 2. Alteração de horário
    if (data === 'rem_change_hour') {
      await ctx.answerCallbackQuery()
      let hourMsg = `🕒 <b>Escolha o horário para receber os lembretes:</b>\n\n`
      hourMsg += `<i>Os lembretes são enviados no horário selecionado (fuso America/Sao_Paulo).</i>`

      const hourKeyboard = new InlineKeyboard()
        .text('07:00', 'rem_set_hour:7')
        .text('08:00', 'rem_set_hour:8')
        .text('09:00 (Padrão)', 'rem_set_hour:9')
        .row()
        .text('10:00', 'rem_set_hour:10')
        .text('12:00', 'rem_set_hour:12')
        .text('18:00', 'rem_set_hour:18')
        .row()
        .text('20:00', 'rem_set_hour:20')
        .text('21:00', 'rem_set_hour:21')
        .text('⬅️ Voltar', 'rem_refresh')

      await ctx.editMessageText(hourMsg, { parse_mode: 'HTML', reply_markup: hourKeyboard })
      return
    }

    if (data.startsWith('rem_set_hour:')) {
      const hour = parseInt(data.replace('rem_set_hour:', ''), 10)
      if (!isNaN(hour) && hour >= 0 && hour <= 23) {
        updatePreferences(userId, { reminderHour: hour })
        await ctx.answerCallbackQuery({ text: `Horário alterado para ${hour}h.` })
        const { text, keyboard } = buildRemindersMenu(userId)
        await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: keyboard })
      }
      return
    }

    // 3. Ações de notificação: Dispensar
    if (data.startsWith('rem_dismiss:')) {
      const parts = data.split(':') // rem_dismiss:type:entityId:targetDate
      const type = parts[1] as any
      const entityId = parts[2]
      const targetDate = parts[3]

      // Grava log com status dismissed para impedir novas notificações deste ciclo
      const dedupKey = buildDedupKey(userId, type, entityId, targetDate, 'due_day')
      setLog({
        dedupKey,
        userId,
        type,
        entityId,
        targetDate,
        stage: 'due_day',
        status: 'dismissed',
        timestamp: Date.now(),
      })

      await ctx.answerCallbackQuery({ text: 'Vencimento dispensado.' })
      await ctx.editMessageReplyMarkup({ reply_markup: undefined })
      await ctx.reply('🚫 <b>Lembrete deste ciclo dispensado.</b>\n<i>(Não altera dados financeiros nem marca como pago).</i>', { parse_mode: 'HTML' })
      return
    }

    // 4. Ações de notificação: Lembrar amanhã (Snooze)
    if (data.startsWith('rem_snooze:')) {
      const parts = data.split(':') // rem_snooze:type:entityId:targetDate
      const type = parts[1] as any
      const entityId = parts[2]
      const targetDate = parts[3]

      const dedupKey = buildDedupKey(userId, type, entityId, targetDate, 'snooze_day')
      setLog({
        dedupKey,
        userId,
        type,
        entityId,
        targetDate,
        stage: 'snooze_day',
        status: 'snoozed',
        timestamp: Date.now(),
      })

      await ctx.answerCallbackQuery({ text: 'Lembrete adiado para amanhã.' })
      await ctx.editMessageReplyMarkup({ reply_markup: undefined })
      await ctx.reply('⏰ <b>Lembrete adiado para amanhã.</b>', { parse_mode: 'HTML' })
      return
    }

    // 5. Ações de visualização rápida
    if (data.startsWith('rem_view_inv:')) {
      const parts = data.split(':') // rem_view_inv:cardId:dueDate
      const cardId = parts[1]
      await ctx.answerCallbackQuery()
      try {
        const { listAccounts, listTransactions } = await import('../lib/queries')
        const { groupTransactionsIntoInvoices } = await import('../lib/billingCycles')
        const { formatBRL } = await import('../lib/formatters')

        const accounts = await listAccounts()
        const targetCard = accounts.find((a) => a.id === cardId)
        const accountsMap: Record<string, any> = {}
        for (const a of accounts) accountsMap[a.id] = a

        const txRes = await listTransactions({ limit: 1000 })
        const txList = txRes.transactions || []
        const invoices = groupTransactionsIntoInvoices(txList, accountsMap)
        const invoice = invoices.find((inv) => inv.accountId === cardId)

        if (!invoice || invoice.items.length === 0) {
          await ctx.reply(`💳 <b>${targetCard?.name || 'Fatura'}:</b> Nenhum lançamento nesta fatura no momento.`, { parse_mode: 'HTML' })
          return
        }

        let invMsg = `💳 <b>Detalhamento da Fatura — ${targetCard?.name}</b>\n`
        invMsg += `📅 Vencimento: <b>${invoice.dueDate.slice(8, 10)}/${invoice.dueDate.slice(5, 7)}</b>\n`
        invMsg += `💰 Total atual: <b>${formatBRL(invoice.total)}</b>\n`
        invMsg += `━━━━━━━━━━━━━━━━━━━━━\n\n`

        for (const item of invoice.items.slice(0, 10)) {
          const inst = item.isInstallment && item.installmentCurrent ? ` (${item.installmentCurrent}/${item.installmentTotal})` : ''
          invMsg += `• <b>${formatBRL(item.amount)}</b> — ${item.vendor || 'Compra'}${inst}\n`
        }
        if (invoice.items.length > 10) {
          invMsg += `\n<i>... e mais ${invoice.items.length - 10} lançamentos.</i>`
        }

        await ctx.reply(invMsg, { parse_mode: 'HTML' })
      } catch (err) {
        await ctx.reply('⚠️ Não foi possível carregar os detalhes da fatura.')
      }
      return
    }

    if (data.startsWith('rem_view_rec:')) {
      const recId = data.replace('rem_view_rec:', '')
      await ctx.answerCallbackQuery()
      try {
        const { getTransactionById } = await import('../lib/queries')
        const { formatBRL } = await import('../lib/formatters')
        const tx = await getTransactionById(recId)
        if (!tx) {
          await ctx.reply('ℹ️ Recorrência não encontrada.')
          return
        }

        let msg = `🔁 <b>Detalhes da Recorrência</b>\n\n`
        msg += `🏢 <b>Descrição:</b> ${tx.vendor || tx.category || 'Despesa'}\n`
        msg += `💰 <b>Valor:</b> ${formatBRL(tx.total)}\n`
        msg += `📅 <b>Próxima data:</b> ${tx.recurrence_next_date || 'Automático'}\n`
        msg += `🔄 <b>Frequência:</b> ${tx.recurrence_frequency === 'yearly' ? 'Anual' : tx.recurrence_frequency === 'weekly' ? 'Semanal' : 'Mensal'}\n`
        if (tx.accounts?.name) {
          msg += `🏦 <b>Conta:</b> ${tx.accounts.name}\n`
        }

        await ctx.reply(msg, { parse_mode: 'HTML' })
      } catch {
        await ctx.reply('⚠️ Não foi possível carregar os detalhes da recorrência.')
      }
      return
    }

    if (data === 'rem_open_gastos') {
      await ctx.answerCallbackQuery()
      try {
        const { getDashboardSummary } = await import('../lib/queries')
        const { formatBRL } = await import('../lib/formatters')
        const summary = await getDashboardSummary({ periodType: 'month' })
        const totalExpenses = summary.metrics.totalExpenses || summary.metrics.totalSpent || 0

        let msg = `📊 <b>Resumo de Gastos do Mês Atual</b>\n`
        msg += `<i>Período: ${summary.period.label}</i>\n`
        msg += `━━━━━━━━━━━━━━━━━━━━━\n\n`
        msg += `🔴 <b>Total de Despesas:</b> ${formatBRL(totalExpenses)}\n\n`

        if (summary.topCategories && summary.topCategories.length > 0) {
          msg += `<b>Por Categoria:</b>\n`
          for (const cat of summary.topCategories.slice(0, 5)) {
            msg += `• <b>${cat.category}:</b> ${formatBRL(cat.total)} (${cat.percentage.toFixed(0)}%)\n`
          }
        }
        await ctx.reply(msg, { parse_mode: 'HTML' })
      } catch {
        await ctx.reply('⚠️ Erro ao obter resumo de gastos.')
      }
      return
    }

    if (data === 'rem_open_vencimentos') {
      await ctx.answerCallbackQuery()
      try {
        const { getDashboardSummary } = await import('../lib/queries')
        const { formatBRL } = await import('../lib/formatters')
        const summary = await getDashboardSummary({ periodType: 'month' })
        const upcoming = summary.upcomingCommitments?.allUpcoming || []

        if (upcoming.length === 0) {
          await ctx.reply('ℹ️ Nenhum compromisso previsto para os próximos dias.')
          return
        }

        let msg = `📅 <b>Próximos Vencimentos</b>\n━━━━━━━━━━━━━━━━━━━━━\n\n`
        for (const item of upcoming.slice(0, 8)) {
          const typeIcon = item.kind === 'recurring' ? '🔁' : '💳'
          const dateStr = item.date ? `${item.date.slice(8, 10)}/${item.date.slice(5, 7)}` : ''
          const name = item.title || item.vendor || 'Compromisso'
          msg += `${typeIcon} <b>${name}</b>\n`
          msg += `   • Data: ${dateStr} • Valor: <b>${formatBRL(item.amount)}</b>\n\n`
        }
        await ctx.reply(msg, { parse_mode: 'HTML' })
      } catch {
        await ctx.reply('⚠️ Erro ao consultar próximos vencimentos.')
      }
      return
    }
  }

  // ==========================================
  // SELEÇÃO INTERATIVA DE FORMA DE PAGAMENTO E CONTA (Prévia)
  // ==========================================
  if (data.startsWith('pm_set:') || data.startsWith('pm:')) {
    const [, txId, method] = data.split(':')
    const pending = pendingTransactions.get(txId)

    if (!pending) {
      await ctx.answerCallbackQuery({ text: '⚠️ Esta operação expirou ou já foi processada.', show_alert: true })
      return
    }
    if (pending.userId !== userId) {
      await ctx.answerCallbackQuery({ text: '⛔ Esta operação pertence a outro usuário.', show_alert: true })
      return
    }

    const { listAccounts } = await import('../lib/queries')
    const accounts = await listAccounts({ activeOnly: true })
    applyPreviewPayment(pending.receipt, method, accounts)
    const updatedMethod = pending.receipt.payment_method

    pending.createdAt = Date.now()
    pendingTransactions.set(txId, pending)

    await ctx.answerCallbackQuery({ text: `Forma de pagamento: ${updatedMethod}` })

    try {
      const updatedPreview = await buildPreviewMessage(pending.receipt, pending.sourceType)
      const keyboard = await buildPreviewKeyboard(txId, pending.receipt)

      await ctx.editMessageText(updatedPreview, {
        parse_mode: 'HTML',
        reply_markup: keyboard,
      })
    } catch (err) {
      console.error('[Telegram Bot] Erro ao atualizar preview após pm:', err)
    }
    return
  }

  // Seleção de Conta / Cartão (index-based acc: ou legado acc_set:)
  if (data.startsWith('acc:') || data.startsWith('acc_set:')) {
    const isShort = data.startsWith('acc:')
    const parts = data.split(':')
    const txId = parts[1]
    const accRef = parts[2] // Index when isShort, accId otherwise

    const pending = pendingTransactions.get(txId)

    if (!pending) {
      await ctx.answerCallbackQuery({ text: '⚠️ Esta operação expirou ou já foi processada.', show_alert: true })
      return
    }
    if (pending.userId !== userId) {
      await ctx.answerCallbackQuery({ text: '⛔ Esta operação pertence a outro usuário.', show_alert: true })
      return
    }

    const { listAccounts } = await import('../lib/queries')
    const accounts = await listAccounts({ activeOnly: true })

    const eligibleAccounts = eligiblePreviewAccounts(pending.receipt, accounts)

    let chosenAcc: any = null
    if (isShort) {
      const idx = parseInt(accRef, 10)
      chosenAcc = eligibleAccounts[idx] || accounts[idx]
    } else {
      chosenAcc = accounts.find((a) => a.id === accRef)
    }

    if (chosenAcc) {
      applyPreviewAccount(pending.receipt, chosenAcc)
    }

    pending.createdAt = Date.now()
    pendingTransactions.set(txId, pending)

    await ctx.answerCallbackQuery({ text: `Conta: ${chosenAcc?.name || 'Selecionada'}` })

    try {
      const updatedPreview = await buildPreviewMessage(pending.receipt, pending.sourceType)
      const keyboard = await buildPreviewKeyboard(txId, pending.receipt)

      await ctx.editMessageText(updatedPreview, {
        parse_mode: 'HTML',
        reply_markup: keyboard,
      })
    } catch (err) {
      console.error('[Telegram Bot] Erro ao atualizar preview após acc:', err)
    }
    return
  }

  // Ação de Cancelamento
  if (data.startsWith('cancel_')) {
    const txId = data.replace('cancel_', '')
    const pending = pendingTransactions.get(txId)

    if (pending && pending.userId !== userId) {
      await ctx.answerCallbackQuery({ text: '⛔ Esta operação pertence a outro usuário.', show_alert: true })
      return
    }

    pendingTransactions.delete(txId)
    await ctx.answerCallbackQuery({ text: 'Operação cancelada.' })

    try {
      await ctx.editMessageText('❌ <b>Lançamento cancelado e descartado.</b>', {
        parse_mode: 'HTML',
        reply_markup: undefined,
      })
    } catch {
      // Silently continue if message could not be edited
    }
    return
  }

  // Ação de Alteração / Correção
  if (data.startsWith('edit_')) {
    const txId = data.replace('edit_', '')
    const pending = pendingTransactions.get(txId)

    if (!pending) {
      await ctx.answerCallbackQuery({ text: '⚠️ Esta operação já foi processada ou expirou.', show_alert: true })
      return
    }

    if (pending.userId !== userId) {
      await ctx.answerCallbackQuery({ text: '⛔ Esta operação pertence a outro usuário.', show_alert: true })
      return
    }

    await ctx.answerCallbackQuery({ text: 'Envie uma mensagem com a alteração desejada.' })

    await ctx.reply(
      `✏️ <b>Como alterar este lançamento:</b>\n\n` +
      `Basta enviar uma mensagem de texto descrevendo o que deseja corrigir.\n\n` +
      `<i>Exemplos:</i>\n` +
      `• <i>"foi 120 no Pix"</i>\n` +
      `• <i>"a conta é Nubank"</i>\n` +
      `• <i>"categoria Mercado"</i>\n` +
      `• <i>"foi em 3x no cartão Inter"</i>\n\n` +
      `A prévia acima será atualizada automaticamente.`,
      { parse_mode: 'HTML' }
    )
    return
  }

  // Ação de Confirmação
  if (data.startsWith('confirm_')) {
    const txId = data.replace('confirm_', '')
    const pending = pendingTransactions.get(txId)

    // Prevenir duplo clique ou ação expirada
    if (!pending) {
      await ctx.answerCallbackQuery({ text: '⚠️ Esta operação já foi processada ou expirou.', show_alert: true })
      try {
        await ctx.editMessageReplyMarkup({ reply_markup: undefined })
      } catch {
        // Silently continue
      }
      return
    }

    if (pending.userId !== userId) {
      await ctx.answerCallbackQuery({ text: '⛔ Esta operação pertence a outro usuário.', show_alert: true })
      return
    }

    // Validação de segurança: garantir completude antes de salvar
    const { listAccounts } = await import('../lib/queries')
    const { validateLaunchCompleteness } = await import('../lib/textRouter')
    const currentAccounts = await listAccounts({ activeOnly: true })
    const validation = validateLaunchCompleteness(pending.receipt, currentAccounts)

    if (!validation.isComplete) {
      await ctx.answerCallbackQuery({
        text: `⚠️ ${validation.reason || 'Complete os dados antes de confirmar.'}`,
        show_alert: true,
      })
      const updatedPreview = await buildPreviewMessage(pending.receipt, pending.sourceType)
      const keyboard = await buildPreviewKeyboard(txId, pending.receipt)
      try {
        await ctx.editMessageText(updatedPreview, {
          parse_mode: 'HTML',
          reply_markup: keyboard,
        })
      } catch {
        // Silently continue
      }
      return
    }

    // Remove imediatamente do mapa para evitar duplicidade em caso de cliques simultâneos
    pendingTransactions.delete(txId)

    // Estado para controlar rollback de imagem no R2 em caso de falha no save
    let newlyUploadedImageKey: string | null = null

    try {
      await ctx.answerCallbackQuery({ text: 'Gravando lançamento...' })

      const { save, getSupabaseClient } = await import('../lib/persist')
      const { store } = await import('../lib/storage')
      const { formatBRL } = await import('../lib/formatters')

      // Se for imagem, envia para o Storage oficial SOMENTE no momento da confirmação
      let imageKey: string | null = null
      let imageSha256 = pending.imageSha256 || null

      if (pending.sourceType === 'image' && pending.imageBuffer && pending.imageContentType) {
        // Verificar antes se este mesmo hash de imagem já está associado a algum lançamento preexistente no banco
        let isAlreadyReferencedInDb = false
        if (imageSha256) {
          try {
            const supabase = getSupabaseClient()
            if (supabase && typeof supabase.from === 'function') {
              const checkQuery = supabase
                .from('transactions')
                .select('id, image_key')
                .eq('image_sha256', imageSha256)
              const checkRes = typeof checkQuery.limit === 'function' ? await checkQuery.limit(1) : await checkQuery
              const { data: existingMatches } = checkRes || {}
              if (existingMatches && existingMatches.length > 0) {
                isAlreadyReferencedInDb = true
              }
            }
          } catch {
            // Em caso de falha na consulta prévia, assume conservadoramente false
          }
        }

        const stored = await store(pending.imageBuffer, pending.imageContentType)
        imageKey = stored.key
        imageSha256 = stored.sha256

        // Só marcamos para potencial remoção/rollback se a imagem não pertencia a um lançamento existente no banco
        if (imageKey && !isAlreadyReferencedInDb) {
          newlyUploadedImageKey = imageKey
        }
      }

      // Gravação oficial no banco via persist.ts
      const saved = await save({
        receipt: pending.receipt,
        imageKey,
        imageSha256,
        sourceType: pending.sourceType,
        originType: pending.sourceType,
        rawText: pending.rawText,
        originalFilename: pending.originalFilename || null,
        capturedAt: new Date().toISOString(),
        originalExtractedData: pending.originalExtractedData,
        allowDuplicate: false,
      })

      // Gravação bem-sucedida: desarmar flag de rollback
      newlyUploadedImageKey = null

      const successMsg = formatConfirmationSuccessMessage(saved)

      await ctx.editMessageText(successMsg, {
        parse_mode: 'HTML',
        reply_markup: undefined,
      })
    } catch (error) {
      console.error('[Telegram Bot] Erro ao gravar lançamento confirmado:', error)

      // Limpeza segura da imagem recém-enviada ao R2 se a persistência falhou
      if (newlyUploadedImageKey) {
        try {
          const { remove } = await import('../lib/storage')
          await remove(newlyUploadedImageKey)
          console.log('[Telegram Bot] Limpeza de imagem órfã realizada com sucesso após falha no save:', newlyUploadedImageKey)
        } catch (cleanupErr) {
          // Tratar falha da própria limpeza com log seguro sem crashar o bot nem expor credenciais
          const cleanupMsg = cleanupErr instanceof Error ? cleanupErr.message : 'Falha desconhecida'
          console.error(`[Telegram Bot] Falha não crítica na limpeza de imagem órfã (${newlyUploadedImageKey}): ${cleanupMsg}`)
        }
      }

      const errMessage = error instanceof Error ? error.message : 'Falha na gravação'

      // Se for duplicata detectada
      if (errMessage.includes('duplicado') || errMessage.includes('Duplicate')) {
        await ctx.editMessageText(`⚠️ <b>Lançamento duplicado detectado:</b>\n${errMessage}`, {
          parse_mode: 'HTML',
          reply_markup: undefined,
        })
      } else {
        await ctx.editMessageText(`⚠️ <b>Erro ao salvar lançamento:</b>\n<code>${errMessage}</code>`, {
          parse_mode: 'HTML',
          reply_markup: undefined,
        })
      }
    }
  }
})


// ==========================================
// SCHEDULER LOCAL DE LEMBRETES (Processo bot:dev)
// ==========================================

async function runReminderChecks() {
  if (!ALLOWED_USER_ID) return
  const userIdNum = parseInt(ALLOWED_USER_ID, 10)
  if (isNaN(userIdNum)) return

  try {
    const { collectPendingReminders, setLog, getLog } = await import('../lib/reminders')
    const notifications = await collectPendingReminders(userIdNum, new Date())

    for (const notif of notifications) {
      // Verificar se já foi enviado antes de disparar
      const existing = getLog(notif.dedupKey)
      if (existing?.status === 'sent') continue

      let keyboard: InlineKeyboard | undefined
      if (notif.buttons && notif.buttons.length > 0) {
        keyboard = new InlineKeyboard()
        for (let i = 0; i < notif.buttons.length; i++) {
          const b = notif.buttons[i]
          keyboard.text(b.text, b.callbackData)
          if (i % 2 === 1 || i === notif.buttons.length - 1) {
            keyboard.row()
          }
        }
      }

      try {
        await bot.api.sendMessage(userIdNum, notif.text, {
          parse_mode: 'HTML',
          reply_markup: keyboard,
        })

        // Só marca como enviado após confirmação da API do Telegram
        setLog({
          dedupKey: notif.dedupKey,
          userId: userIdNum,
          type: notif.type,
          stage: notif.dedupKey.split(':')[4] as any,
          status: 'sent',
          timestamp: Date.now(),
        })
        console.log(`[Telegram Bot] Lembrete enviado com sucesso (${notif.dedupKey})`)
      } catch (sendErr) {
        console.error(`[Telegram Bot] Falha ao enviar lembrete (${notif.dedupKey}):`, sendErr)
      }
    }
  } catch (err) {
    console.error('[Telegram Bot] Erro na verificação agendada de lembretes:', err)
  }
}

// Executa verificação a cada 60 segundos
const REMINDER_CHECK_INTERVAL_MS = 60 * 1000
setInterval(() => {
  runReminderChecks().catch((err) => {
    console.error('[Telegram Bot] Erro no ciclo de lembretes:', err)
  })
}, REMINDER_CHECK_INTERVAL_MS)

// Tratamento de erros
bot.catch((err) => {
  console.error('[Telegram Bot] Erro na execução:', err.message || err)
})

// Iniciar em Long Polling
console.log('--------------------------------------------------')
console.log('🤖 Bot do Telegram iniciado em modo Long Polling.')
console.log(`🔒 ID de usuário autorizado: ${ALLOWED_USER_ID || 'NÃO DEFINIDO (todos bloqueados)'}`)
console.log('⏰ Agendador de lembretes ativo (verificação a cada 60s).')
console.log('--------------------------------------------------')

bot.start()

