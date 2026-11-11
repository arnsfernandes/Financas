import { NextRequest, NextResponse } from 'next/server'
import { requireFinancialAuth } from '@/lib/authGuard'

export const runtime = 'nodejs'
export const maxDuration = 120

const MAX_BYTES = 25 * 1024 * 1024

/**
 * Importação de fatura de cartão de qualquer banco (PDF, OFX, CSV). O arquivo é lido por código; a IA
 * só entra como reserva (PDF escaneado ou layout que o código não entende) ou quando o usuário pede.
 *
 * multipart/form-data:
 *  - file: o PDF da fatura (reenviado na confirmação; nada fica guardado no servidor entre as etapas)
 *  - mode: 'preview' (padrão) | 'confirm'
 *  - accountId: cartão de crédito de destino (na prévia, opcional: sugere o cartão do mesmo banco)
 *  - ai: '1' para ler com IA (reserva)
 *  - selected: na confirmação, JSON com os índices das linhas a importar
 *  - merges: na confirmação, JSON { índice da linha: id do lançamento manual } das compras que o
 *    usuário confirmou já ter lançado (o lançamento existente recebe os dados da fatura)
 *
 * Na confirmação, além das compras selecionadas: compras estornadas por inteiro são registradas com
 * R$ 0,00, estornos de compras já lançadas corrigem o valor delas, e parcelas antecipadas ficam com a
 * data desta fatura.
 */
export async function POST(req: NextRequest) {
  const auth = requireFinancialAuth(req)
  if (!auth.authorized) return auth.response!
  const userId = auth.userId!

  try {
    const form = await req.formData()
    const file = form.get('file')
    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: 'Envie o PDF da fatura.' }, { status: 400 })
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ ok: false, error: 'Arquivo muito grande (máx. 25 MB).' }, { status: 400 })
    }
    const mode = form.get('mode') === 'confirm' ? 'confirm' : 'preview'

    const { parseStatementFile, statementFromPreview, StatementParseError, StatementPasswordError } = await import(
      '@/lib/statements/parseStatement'
    )
    const password = String(form.get('password') || '') || undefined
    const { statementAiAvailable } = await import('@/lib/statements/aiStatement')
    const buffer = Buffer.from(await file.arrayBuffer())
    let statement
    try {
      // Confirmação de leitura feita por IA: usa exatamente o que foi revisado na prévia.
      let reviewed = null
      if (mode === 'confirm' && form.get('statement')) {
        try {
          reviewed = statementFromPreview(JSON.parse(String(form.get('statement'))), buffer)
        } catch {
          reviewed = null
        }
      }
      // Extrato de conta (Pix, boletos) e não fatura de cartão: a tela troca para a importação de extrato.
      if (!reviewed && buffer.indexOf('%PDF') >= 0) {
        const { readPdf } = await import('@/lib/statements/interPdf')
        const { isBankStatementText } = await import('@/lib/statements/bankStatement')
        const { text } = await readPdf(buffer, password)
        if (isBankStatementText(text)) return NextResponse.json({ ok: true, kind: 'bank' })
      }
      statement =
        reviewed || (await parseStatementFile(buffer, { filename: file.name, forceAi: form.get('ai') === '1', password }))
    } catch (e) {
      if (e instanceof StatementPasswordError) {
        return NextResponse.json({ ok: false, error: e.message, needsPassword: true, wrongPassword: e.wrong }, { status: 422 })
      }
      if (e instanceof StatementParseError) return NextResponse.json({ ok: false, error: e.message }, { status: 422 })
      throw e
    }

    const { listAccounts, listCategories, normalizeCategoryName } = await import('@/lib/queries')
    const { normalizeInstitutionKey } = await import('@/lib/institutions')
    const cards = (await listAccounts({ activeOnly: true, userId })).filter((a) => a.type === 'credit_card')
    const sameBank = cards.filter(
      (a) => normalizeInstitutionKey(a.institution) === statement.issuer || normalizeInstitutionKey(a.name) === statement.issuer,
    )
    const suggested = sameBank.length === 1 ? sameBank[0] : cards.length === 1 ? cards[0] : null
    const requested = String(form.get('accountId') || '')
    const account = cards.find((a) => a.id === requested) || (mode === 'preview' ? suggested : null)
    if (mode === 'confirm' && !account) {
      return NextResponse.json({ ok: false, error: 'Escolha o cartão de crédito de destino.' }, { status: 400 })
    }

    const { getSupabaseClient, saveBatch } = await import('@/lib/persist')
    const { planLiteralImport, loadExistingForStatement } = await import('@/lib/statements/importStatement')
    const supabase = getSupabaseClient()
    const existing =
      supabase && account
        ? await loadExistingForStatement(supabase, statement, userId, account.id)
        : { singles: [], installments: [], markers: [], payments: [], credits: [] }
    // Modo igual ao banco: despesas como cobradas, estornos/ajustes como crédito no cartão.
    const lines = planLiteralImport(statement, existing)
    // "Talvez já lançado": mesmo valor, até 3 dias de diferença, outro nome ou outra conta.
    if (supabase && account) {
      const { loadProbableCandidates, markProbableMatches } = await import('@/lib/statements/probableMatches')
      const allAccounts = await listAccounts({ activeOnly: false, userId }).catch(() => [])
      const names = new Map(allAccounts.map((a) => [a.id, a.name] as [string, string]))
      markProbableMatches(lines, await loadProbableCandidates(supabase, statement, userId), names)
    }

    // Categoria: preferência aprendida do usuário para o estabelecimento, senão a sugestão por palavras-chave.
    const categories = await listCategories({ type: 'expense', activeOnly: true, userId })
    const byNorm = new Map(categories.map((c) => [normalizeCategoryName(c.name).replace(/\s*&\s*/g, ' e '), c]))
    const { getLearnedCategory } = await import('@/lib/categoryLearning')
    const learned = new Map<string, { id: string; name: string } | null>()
    const PURCHASE = new Set(['import', 'refunded', 'duplicate', 'installment_exists', 'same_purchase'])
    for (const line of lines) {
      if (!PURCHASE.has(line.action)) continue
      if (!learned.has(line.vendor)) {
        const rule = await getLearnedCategory({ userId, vendor: line.vendor, transactionType: 'expense', rawText: line.description }).catch(() => null)
        learned.set(line.vendor, rule ? { id: rule.categoryId, name: rule.categoryName } : null)
      }
      const rule = learned.get(line.vendor)
      if (rule) line.category = rule.name
    }
    // Categorias escolhidas pelo usuário na tela (índice da linha → nome da categoria).
    if (mode === 'confirm' && form.get('categories')) {
      try {
        const overrides = JSON.parse(String(form.get('categories'))) as Record<string, string>
        const valid = new Set(categories.map((c) => c.name))
        const { learnCategoryPreference } = await import('@/lib/categoryLearning')
        const learnedNow = new Set<string>()
        for (const line of lines) {
          const name = overrides[String(line.index)]
          if (!name || !valid.has(name) || !PURCHASE.has(line.action)) continue
          line.category = name
          // Lembra a escolha para esta loja: próximas faturas e lançamentos já vêm com essa categoria.
          if (!learnedNow.has(line.vendor)) {
            learnedNow.add(line.vendor)
            await learnCategoryPreference({
              userId, vendor: line.vendor, categoryName: name,
              categoryId: byNorm.get(normalizeCategoryName(name).replace(/\s*&\s*/g, ' e '))?.id ?? null,
              transactionType: 'expense', source: 'user_correction',
            }).catch((e) => console.warn('Could not learn category:', e))
          }
        }
      } catch {
        return NextResponse.json({ ok: false, error: 'Categorias inválidas.' }, { status: 400 })
      }
    }
    const categoryIdOf = (name: string | null) =>
      name ? byNorm.get(normalizeCategoryName(name).replace(/\s*&\s*/g, ' e '))?.id ?? null : null

    const purchases = statement.lines.filter((l) => !l.isCredit).reduce((s, l) => s + l.amount, 0)
    const credits = statement.lines.filter((l) => l.isCredit && l.kind !== 'payment').reduce((s, l) => s + l.amount, 0)
    const net = Number((purchases - credits).toFixed(2))
    const summary = {
      dueDate: statement.dueDate,
      issuer: statement.issuer,
      issuerName: statement.issuerName,
      source: statement.source,
      warnings: statement.warnings || [],
      statedTotal: statement.statedTotal ?? null,
      printed: statement.printed ?? null,
      // Conferência: a soma lida bate com o total impresso? (com saldo anterior, pode não bater)
      totalMatches:
        statement.statedTotal != null ? Math.abs(statement.statedTotal - net) <= Math.max(0.05, net * 0.005) : null,
      aiAvailable: statementAiAvailable(),
      filename: file.name,
      total: lines.length,
      toImport: lines.filter((l) => l.action === 'import').length,
      toImportAmount: Number(
        lines.filter((l) => l.action === 'import').reduce((s, l) => s + (l.netAmount ?? l.amount), 0).toFixed(2),
      ),
    }

    if (mode === 'preview') {
      return NextResponse.json({
        ok: true,
        statement: summary,
        accountId: account?.id ?? null,
        cards: cards.map((c) => ({ id: c.id, name: c.name, institution: c.institution ?? null })),
        categories: categories.map((c) => c.name),
        lines,
        // leitura por IA: a tela devolve isto na confirmação
        parsed: statement.source === 'ai' ? statement : undefined,
      })
    }

    let selected: Set<number>
    try {
      selected = new Set((JSON.parse(String(form.get('selected') || '[]')) as unknown[]).map(Number))
    } catch {
      return NextResponse.json({ ok: false, error: 'Seleção de linhas inválida.' }, { status: 400 })
    }

    if (!supabase) return NextResponse.json({ ok: false, error: 'Banco de dados indisponível.' }, { status: 500 })

    // Compras que o usuário disse serem as mesmas de um lançamento manual: atualiza o lançamento
    // existente com os dados da fatura em vez de criar outro.
    let merged = 0
    if (form.get('merges')) {
      let merges: Record<string, string>
      try {
        merges = JSON.parse(String(form.get('merges')))
      } catch {
        return NextResponse.json({ ok: false, error: 'Lançamentos repetidos inválidos.' }, { status: 400 })
      }
      const { mergePatch } = await import('@/lib/statements/probableMatches')
      for (const line of lines) {
        const txId = merges[String(line.index)]
        if (!txId || line.probable?.id !== txId) continue
        selected.delete(line.index)
        const { data: tx, error: readErr } = await supabase
          .from('transactions').select('vendor, date, notes, original_extracted_data')
          .eq('id', txId).eq('user_id', userId).maybeSingle()
        if (readErr || !tx) continue
        const { error: upErr } = await supabase.from('transactions')
          .update(mergePatch(line, tx, { accountId: account!.id, statement }))
          .eq('id', txId).eq('user_id', userId)
        if (upErr) throw new Error(`Falha ao juntar com o lançamento existente: ${upErr.message}`)
        merged++
      }
    }
    const incomeCategories = await listCategories({ type: 'income', activeOnly: true, userId }).catch(() => [])
    const creditCategory = incomeCategories.find((c) => /reembols|estorno/i.test(c.name)) || null
    const { commitStatementImport } = await import('@/lib/statements/commitImport')
    const result = await commitStatementImport({
      supabase, lines, statement, userId, accountId: account!.id, filename: file.name, selected, categoryIdOf,
      creditCategoryId: creditCategory?.id ?? null,
    })
    return NextResponse.json({ ok: true, statement: summary, ...result, merged })
  } catch (e) {
    console.error('Statement import error:', e)
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Falha ao importar a fatura.' },
      { status: 500 },
    )
  }
}
