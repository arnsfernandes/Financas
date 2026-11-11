import { NextRequest, NextResponse } from 'next/server'
import { verifyShortcutsAuth } from '@/lib/shortcutsAuth'
import { listAccounts, listCategories } from '@/lib/queries'
import {
  parseSingleTransactionLocally,
  validateLaunchCompleteness,
  isMultiExpenseText,
} from '@/lib/textRouter'
import { parseTextExpense } from '@/lib/pipeline'
import { save } from '@/lib/persist'
import { formatBRL } from '@/lib/formatters'
import type { Receipt } from '@/lib/schema'
import { shortcutSuccessMessage, shortcutErrorMessage } from '@/lib/shortcutMessage'

/**
 * O atalho do iPhone mostra sempre o campo `message`: em caso de erro, ele recebe o motivo
 * (ex.: "inclua o valor na frase"), para a notificação nunca vir vazia.
 */
export async function POST(req: NextRequest) {
  const res = await handleShortcutTransaction(req)
  const body = await res.json().catch(() => null)
  if (body && body.ok === false && body.error) body.message = shortcutErrorMessage(body.message || body.error)
  return NextResponse.json(body, { status: res.status })
}

async function handleShortcutTransaction(req: NextRequest) {
  // 1. Validar autenticação do usuário via Bearer Token de Atalhos
  const auth = await verifyShortcutsAuth(req)
  if (!auth.authorized || !auth.user) {
    return NextResponse.json(
      {
        ok: false,
        error: auth.error || 'Acesso não autorizado via Atalhos.',
      },
      { status: 401 }
    )
  }

  // 2. Extrair texto de entrada (suporta JSON { text }, { query }, { message } ou texto plano)
  let rawText = ''
  const contentType = req.headers.get('content-type') || ''

  try {
    if (contentType.includes('application/json')) {
      const body = await req.json().catch(() => ({}))
      rawText = body.text || body.query || body.message || body.input || ''
    } else {
      rawText = await req.text()
    }
  } catch {
    rawText = ''
  }

  const cleanText = (typeof rawText === 'string' ? rawText : '').trim()

  if (!cleanText) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Nada foi escrito.',
      },
      { status: 400 }
    )
  }

  try {
    const accounts = await listAccounts({ activeOnly: true, userId: auth.user.id })
    const categories = await listCategories({ userId: auth.user.id })

    // 3. Verificar se é múltiplo lançamento (Atalhos/Siri requer um lançamento claro por comando de voz)
    if (isMultiExpenseText(cleanText)) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Tem mais de um lançamento na frase. Lance um por vez.',
        },
        { status: 422 }
      )
    }

    let resolvedReceipt: Receipt | null = null
    let extractedData: Record<string, any> = {}

    // 4. Tentativa 1: Parser determinístico local (rápido, preciso, zero custo de IA)
    const localResult = parseSingleTransactionLocally(cleanText, accounts, categories)

    if (localResult.success && localResult.receipt) {
      resolvedReceipt = localResult.receipt
      extractedData = { ...localResult.receipt }
    } else if (localResult.missingField === 'amount') {
      return NextResponse.json(
        {
          ok: false,
          error: 'Faltou o valor.',
        },
        { status: 422 }
      )
    } else {
      // 5. Tentativa 2: Parser inteligente com IA (para frases mais livres ou complexas)
      const aiParsed = await parseTextExpense(cleanText)
      resolvedReceipt = aiParsed.receipt
      extractedData = aiParsed.originalExtractedData || {}
    }

    if (!resolvedReceipt || typeof resolvedReceipt.total !== 'number' || resolvedReceipt.total <= 0) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Não encontrei um valor válido.',
        },
        { status: 422 }
      )
    }

    // 6. Validar completude e ambiguidades financeiras sem adivinhar
    const validation = validateLaunchCompleteness(resolvedReceipt, accounts)

    if (!validation.isComplete) {
      // Se a conta está ausente e é despesa com cartão de crédito, verificar se existe exatamente 1 cartão
      const isCredit =
        (resolvedReceipt.payment_method || '').toLowerCase().includes('crédito') ||
        (resolvedReceipt.payment_method || '').toLowerCase().includes('credito') ||
        Boolean(resolvedReceipt.installment_total && resolvedReceipt.installment_total > 1)

      if (isCredit && !resolvedReceipt.account_id) {
        const creditCards = accounts.filter((a) => a.type === 'credit_card')
        if (creditCards.length === 1) {
          resolvedReceipt.account_id = creditCards[0].id
        } else if (creditCards.length > 1) {
          const names = creditCards.map((c) => c.name).join(' ou ')
          return NextResponse.json(
            {
              ok: false,
              error: `Você possui mais de um cartão cadastrado (${names}). Especifique qual cartão foi utilizado.`,
            },
            { status: 422 }
          )
        }
      }

      // Se a forma é Pix ou Débito e não especificou conta
      const isPixOrDebit =
        (resolvedReceipt.payment_method || '').toLowerCase().includes('pix') ||
        (resolvedReceipt.payment_method || '').toLowerCase().includes('débito') ||
        (resolvedReceipt.payment_method || '').toLowerCase().includes('debito')

      if (isPixOrDebit && !resolvedReceipt.account_id) {
        const checkingAccounts = accounts.filter((a) => a.type !== 'credit_card')
        if (checkingAccounts.length === 1) {
          resolvedReceipt.account_id = checkingAccounts[0].id
        }
      }

      // Revalidar completude após resolução de conta única
      const revalidation = validateLaunchCompleteness(resolvedReceipt, accounts)
      if (!revalidation.isComplete) {
        return NextResponse.json(
          {
            ok: false,
            error: revalidation.reason || 'Informações incompletas para registrar o lançamento.',
            missingField: revalidation.missingField,
          },
          { status: 422 }
        )
      }
    }

    // 7. Persistir o lançamento no banco de dados associado ao usuário
    resolvedReceipt.user_id = auth.user.id
    const saved = await save({
      receipt: resolvedReceipt,
      userId: auth.user.id,
      imageKey: null,
      imageSha256: null,
      sourceType: 'text',
      originType: 'text',
      rawText: cleanText,
      originalFilename: null,
      capturedAt: new Date().toISOString(),
      originalExtractedData: extractedData,
      allowDuplicate: false,
    })

    // 8. Mensagem da notificação: o que foi lançado, onde, e quanto já foi gasto no mês.
    const matchedAccount = accounts.find((a) => a.id === saved.account_id)
    const accountName = matchedAccount?.name || saved.payment_method || null
    const formattedAmount = formatBRL(Number(saved.total))
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
    let monthTotal: { month: string; total: number } | null = null
    if (saved.type !== 'income') {
      try {
        const { getSupabaseClient } = await import('@/lib/persist')
        const { computeMonthlyHistory } = await import('@/lib/queries/dashboardExtras')
        const supabase = getSupabaseClient()
        if (supabase) {
          const accountsMap = Object.fromEntries(accounts.map((a) => [a.id, a])) as any
          const [m] = await computeMonthlyHistory(supabase, accountsMap, today.slice(0, 7), { userId: auth.user.id, months: 1 })
          if (m) monthTotal = { month: m.month, total: m.total }
        }
      } catch {
        monthTotal = null
      }
    }
    const summaryVoiceMessage = shortcutSuccessMessage(saved as any, { accountName, today, monthTotal })

    return NextResponse.json({
      ok: true,
      message: summaryVoiceMessage,
      user: {
        id: auth.user.id,
        username: auth.user.username,
      },
      transaction: {
        id: saved.id,
        type: saved.type,
        total: Number(saved.total),
        totalFormatted: formattedAmount,
        vendor: saved.vendor,
        category: saved.category,
        paymentMethod: saved.payment_method,
        accountId: saved.account_id,
        accountName: accountName || 'Conta',
        date: saved.date,
        installments: saved.installment_total
          ? `${saved.installment_current || 1}/${saved.installment_total}`
          : null,
      },
    })
  } catch (error: any) {
    console.error('[Shortcuts Transaction API] Erro ao processar:', error)
    return NextResponse.json(
      {
        ok: false,
        error: error.message || 'Erro interno ao processar o lançamento por voz.',
      },
      { status: 500 }
    )
  }
}
