import { NextRequest, NextResponse } from 'next/server'
import { requireFinancialAuth } from '@/lib/authGuard'

export const runtime = 'nodejs'
export const maxDuration = 120

/**
 * Extrato de conta (PDF do Inter): separa gastos em estabelecimentos (Pix, boleto, débito) do que é
 * pagamento de fatura, transferência própria, investimento ou entrada. Sem IA.
 *
 * multipart/form-data:
 *  - file, password (se o PDF tiver senha)
 *  - mode: 'preview' | 'confirm'
 *  - accountId: conta onde registrar (conta corrente / PIX)
 *  - selected: JSON com os índices das linhas a registrar como gasto
 *  - categories: JSON { índice: categoria } escolhidas na tela
 *  - payments: '1' para registrar pagamentos de fatura do cartão (sem duplicar)
 */
export async function POST(req: NextRequest) {
  const auth = requireFinancialAuth(req)
  if (!auth.authorized) return auth.response!
  const userId = auth.userId!

  try {
    const form = await req.formData()
    const file = form.get('file')
    if (!(file instanceof File)) return NextResponse.json({ ok: false, error: 'Envie o PDF do extrato.' }, { status: 400 })
    const mode = form.get('mode') === 'confirm' ? 'confirm' : 'preview'
    const password = String(form.get('password') || '') || undefined

    const { readPdf, StatementPasswordError, StatementParseError } = await import('@/lib/statements/interPdf')
    const { parseBankStatementText, isBankStatementText, displayVendor, paymentMethodOf, isPaymentInstitution } = await import(
      '@/lib/statements/bankStatement'
    )
    let pdf
    try {
      pdf = await readPdf(Buffer.from(await file.arrayBuffer()), password)
    } catch (e) {
      if (e instanceof StatementPasswordError)
        return NextResponse.json({ ok: false, error: e.message, needsPassword: true, wrongPassword: e.wrong }, { status: 422 })
      if (e instanceof StatementParseError) return NextResponse.json({ ok: false, error: e.message }, { status: 422 })
      throw e
    }
    if (!isBankStatementText(pdf.text))
      return NextResponse.json({ ok: false, error: 'Este PDF não parece um extrato de conta.' }, { status: 422 })
    const st = parseBankStatementText(pdf.text)

    const { listAccounts, listCategories, normalizeCategoryName } = await import('@/lib/queries')
    const accounts = (await listAccounts({ activeOnly: true, userId })).filter((a) => a.type !== 'credit_card')
    const requested = String(form.get('accountId') || '')
    const suggested =
      accounts.find((a) => /pix/i.test(a.name) && a.type === 'bank_account') ||
      accounts.find((a) => a.type === 'bank_account') ||
      accounts[0] ||
      null
    const account = accounts.find((a) => a.id === requested) || (mode === 'preview' ? suggested : null)
    if (mode === 'confirm' && !account)
      return NextResponse.json({ ok: false, error: 'Escolha a conta onde registrar.' }, { status: 400 })

    const { getSupabaseClient, saveBatch } = await import('@/lib/persist')
    const supabase = getSupabaseClient()
    if (!supabase) return NextResponse.json({ ok: false, error: 'Banco de dados indisponível.' }, { status: 500 })

    // Já registrados: mesma linha deste extrato, ou mesmo dia + valor + destinatário (outra cópia do PDF).
    const keyOf = (i: number) => `${pdf.sha256}:${i}`
    let existing: any[] = []
    if (account) {
      const { data } = await supabase.from('transactions').select('date, total, raw_text, original_extracted_data')
        .eq('user_id', userId).eq('account_id', account.id).eq('type', 'expense')
        .gte('date', st.from || '2000-01-01').lte('date', st.to || '2100-01-01')
      existing = data || []
    }
    const { normalizeVendor } = await import('@/lib/duplicate')
    const already = (l: (typeof st.lines)[number]) =>
      existing.some((t) => t.original_extracted_data?.statement_key === keyOf(l.index) ||
        (t.date === l.date && Math.abs(Number(t.total) - Math.abs(l.amount)) < 0.005 && normalizeVendor(t.raw_text) === normalizeVendor(l.name)))

    // Categoria: o que o app aprendeu para essa loja; senão a regra.
    const { getLearnedCategory } = await import('@/lib/categoryLearning')
    const cats = await listCategories({ type: 'expense', activeOnly: true, userId })
    const idOf = (n: string | null) => (n ? cats.find((c) => normalizeCategoryName(c.name) === normalizeCategoryName(n))?.id ?? null : null)
    const learnedCache = new Map<string, string | null>()
    const lines = []
    for (const l of st.lines) {
      const vendor = displayVendor(l.name)
      let category = l.category
      if ((l.kind === 'gasto' || l.kind === 'pessoa') && !isPaymentInstitution(l.name)) {
        if (!learnedCache.has(vendor)) {
          const rule = await getLearnedCategory({ userId, vendor, transactionType: 'expense' }).catch(() => null)
          learnedCache.set(vendor, rule?.categoryName ?? null)
        }
        category = learnedCache.get(vendor) || category
      }
      lines.push({ ...l, vendor, category, paymentMethod: paymentMethodOf(l.type), registered: l.amount < 0 && already(l), learned: Boolean(learnedCache.get(vendor)) })
    }

    // Pagamentos de fatura do cartão: já registrados?
    const cards = (await listAccounts({ activeOnly: true, userId })).filter((a) => a.type === 'credit_card')
    const card = cards.find((c) => /inter/i.test(`${c.name} ${c.institution || ''}`)) || cards[0] || null
    let paid: Array<{ amount: number; payment_date: string }> = []
    if (card) {
      const { data } = await supabase.from('credit_card_invoices').select('invoice_payments(amount, payment_date)').eq('account_id', card.id)
      paid = ((data || []) as any[]).flatMap((i) => i.invoice_payments || [])
    }
    const dueFor = (date: string) => {
      const day = Math.min(28, card?.due_day || 15)
      const [y, m, d] = date.split('-').map(Number)
      const dt = new Date(Date.UTC(y, m - 1 + (d > day ? 1 : 0), day))
      return dt.toISOString().slice(0, 10)
    }
    for (const l of lines) {
      if (l.kind !== 'fatura') continue
      ;(l as any).paymentDue = dueFor(l.date)
      ;(l as any).registered = paid.some((p) => Math.abs(Number(p.amount) - Math.abs(l.amount)) < 0.005 &&
        Math.abs(Date.parse(p.payment_date) - Date.parse(l.date)) <= 2 * 86_400_000)
    }

    // Destinos que você marcou como "não é gasto" em extratos anteriores (preferência no servidor).
    const { getSetting, setSetting } = await import('@/lib/userSettings')
    const ignoreSetting = await getSetting<string[]>(userId, 'bank_ignore')
    const normName = (n: string) => n.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim()
    const ignoredNames = new Set(ignoreSetting.value || [])

    if (mode === 'preview') {
      return NextResponse.json({
        ignored: lines.filter((l) => ignoredNames.has(normName(l.name))).map((l) => l.index),
        settingsAvailable: ignoreSetting.available,
        ok: true,
        kind: 'bank',
        statement: { holder: st.holder, from: st.from, to: st.to, filename: file.name },
        accountId: account?.id ?? null,
        accounts: accounts.map((a) => ({ id: a.id, name: a.name, type: a.type })),
        cardName: card?.name ?? null,
        categories: cats.map((c) => c.name),
        lines,
      })
    }

    let selected: Set<number>
    let overrides: Record<string, string> = {}
    try {
      selected = new Set((JSON.parse(String(form.get('selected') || '[]')) as unknown[]).map(Number))
      overrides = JSON.parse(String(form.get('categories') || '{}'))
    } catch {
      return NextResponse.json({ ok: false, error: 'Seleção inválida.' }, { status: 400 })
    }
    const validCats = new Set(cats.map((c) => c.name))
    const chosen = lines.filter((l) => selected.has(l.index) && l.amount < 0 && !l.registered && (l.kind === 'gasto' || l.kind === 'pessoa'))
    const now = new Date().toISOString()
    const inputs = chosen.map((l) => {
      const category = (overrides[String(l.index)] && validCats.has(overrides[String(l.index)]) ? overrides[String(l.index)] : l.category) || 'Outros'
      return {
        receipt: {
          user_id: userId, type: 'expense', account_id: account!.id, vendor: l.vendor, vendor_address: null, date: l.date, time: null,
          currency: 'BRL', category, category_id: idOf(category), items: [], subtotal: null, tax: null, tip: null, total: Math.abs(l.amount),
          payment_method: l.paymentMethod, notes: `Importado do extrato · ${l.type}`, is_recurring: false,
          installment_group_id: null, installment_total: null, installment_current: null, installment_amount: null,
          review_status: 'confirmed', review_reasons: [], origin_type: 'text', raw_text: l.name, original_filename: file.name,
        } as any,
        userId, imageKey: null, imageSha256: null, sourceType: 'text' as const, originType: 'text' as const, rawText: l.name,
        originalFilename: file.name, capturedAt: now, allowDuplicate: true,
        originalExtractedData: { source: 'inter_bank_statement', statement_sha256: pdf.sha256, statement_key: keyOf(l.index),
          type: l.type, counterparty: l.counterparty, amount: Math.abs(l.amount), date: l.date, category },
      }
    })
    const saved = inputs.length ? await saveBatch(inputs) : []

    // Lembra a categoria de cada loja registrada (próximos extratos e faturas já vêm certos).
    const { learnCategoryPreference } = await import('@/lib/categoryLearning')
    const learned = new Set<string>()
    for (const i of inputs) {
      if (learned.has(i.receipt.vendor)) continue
      learned.add(i.receipt.vendor)
      await learnCategoryPreference({ userId, vendor: i.receipt.vendor, categoryName: i.receipt.category, categoryId: i.receipt.category_id,
        transactionType: 'expense', source: 'user_correction' }).catch(() => null)
    }

    // Lembra no servidor o que ficou de fora (vale em qualquer aparelho).
    if (ignoreSetting.available) {
      for (const l of lines) {
        if (l.amount >= 0 || (l.kind !== 'gasto' && l.kind !== 'pessoa') || l.registered) continue
        if (selected.has(l.index)) ignoredNames.delete(normName(l.name))
        else ignoredNames.add(normName(l.name))
      }
      await setSetting(userId, 'bank_ignore', Array.from(ignoredNames)).catch(() => null)
    }

    let paymentsRegistered = 0
    if (form.get('payments') === '1' && card) {
      const { registerInvoicePayment } = await import('@/lib/invoices')
      for (const l of lines) {
        if (l.kind !== 'fatura' || (l as any).registered) continue
        const res = await registerInvoicePayment({ accountId: card.id, dueDate: (l as any).paymentDue, amount: Math.abs(l.amount),
          paymentDate: l.date, paymentMethod: 'Pix', notes: `Importado do extrato: ${l.name}` })
        if (res.ok) paymentsRegistered++
      }
    }

    return NextResponse.json({
      ok: true,
      imported: saved.length,
      importedAmount: Number(inputs.reduce((s, i) => s + i.receipt.total, 0).toFixed(2)),
      paymentsRegistered,
    })
  } catch (e) {
    console.error('Bank statement import error:', e)
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Falha ao ler o extrato.' }, { status: 500 })
  }
}
