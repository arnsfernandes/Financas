import { NextRequest, NextResponse } from 'next/server'
import { getOrCreateInvoice, registerInvoicePayment } from '@/lib/invoices'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const accountId = searchParams.get('accountId')
    const dueDate = searchParams.get('dueDate')
    const closingDate = searchParams.get('closingDate') || undefined

    if (!accountId || !dueDate) {
      return NextResponse.json(
        { ok: false, error: 'accountId e dueDate são obrigatórios' },
        { status: 400 }
      )
    }

    const invoice = await getOrCreateInvoice(accountId, dueDate, closingDate)
    if (!invoice) {
      return NextResponse.json(
        { ok: false, error: 'Fatura não encontrada' },
        { status: 404 }
      )
    }

    return NextResponse.json({ ok: true, invoice })
  } catch (err: any) {
    console.error('Erro na rota GET /api/invoices:', err)
    return NextResponse.json(
      { ok: false, error: err.message || 'Erro interno ao buscar fatura' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      accountId,
      dueDate,
      closingDate,
      amount,
      paymentDate,
      fromAccountId,
      paymentMethod,
      notes,
    } = body

    if (!accountId || !dueDate || !amount) {
      return NextResponse.json(
        { ok: false, error: 'accountId, dueDate e amount são obrigatórios' },
        { status: 400 }
      )
    }

    const res = await registerInvoicePayment({
      accountId,
      dueDate,
      closingDate,
      amount: Number(amount),
      paymentDate: paymentDate || new Date().toISOString().slice(0, 10),
      fromAccountId,
      paymentMethod,
      notes,
    })

    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: res.error || 'Erro ao registrar pagamento' },
        { status: 400 }
      )
    }

    return NextResponse.json({ ok: true, invoice: res.invoice }, { status: 201 })
  } catch (err: any) {
    console.error('Erro na rota POST /api/invoices/payments:', err)
    return NextResponse.json(
      { ok: false, error: err.message || 'Erro interno ao registrar pagamento de fatura' },
      { status: 500 }
    )
  }
}
