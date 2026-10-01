'use client'

import React, { useState, useEffect } from 'react'
import { X, Loader2, Check, CreditCard, DollarSign, Calendar } from 'lucide-react'
import { formatBRL } from '@/lib/formatters'
import type { Account } from '@/lib/schema'

export interface PayInvoiceModalProps {
  isOpen: boolean
  onClose: () => void
  accountName: string
  dueDate: string
  totalAmount: number
  remainingAmount: number
  accounts: Account[]
  onPaySuccess: () => void
  onPayInvoice: (data: {
    amount: number
    paymentDate: string
    fromAccountId?: string
    paymentMethod?: string
    notes?: string
  }) => Promise<{ ok: boolean; error?: string }>
}

export function PayInvoiceModal({
  isOpen,
  onClose,
  accountName,
  dueDate,
  totalAmount,
  remainingAmount,
  accounts,
  onPaySuccess,
  onPayInvoice,
}: PayInvoiceModalProps) {
  const [amount, setAmount] = useState('')
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [fromAccountId, setFromAccountId] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('PIX')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (isOpen) {
      const initAmount = remainingAmount > 0 ? remainingAmount : totalAmount
      setAmount(initAmount ? String(initAmount.toFixed(2)).replace('.', ',') : '')
      setPaymentDate(new Date().toISOString().slice(0, 10))
      setNotes('')
      setError('')
      setPaymentMethod('PIX')
      const firstBank = accounts.find((a) => a.type === 'bank_account')?.id || ''
      setFromAccountId(firstBank)
    }
  }, [isOpen, remainingAmount, totalAmount, accounts])

  if (!isOpen) return null

  const parsedAmount = parseFloat(amount.replace(/\./g, '').replace(',', '.')) || 0
  const isPartial = parsedAmount < (remainingAmount || totalAmount) - 0.01

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (parsedAmount <= 0) {
      setError('Informe um valor de pagamento maior que zero.')
      return
    }

    setLoading(true)
    setError('')
    try {
      const res = await onPayInvoice({
        amount: parsedAmount,
        paymentDate,
        fromAccountId: fromAccountId || undefined,
        paymentMethod: paymentMethod || undefined,
        notes: notes.trim() || undefined,
      })

      if (res.ok) {
        onPaySuccess()
        onClose()
      } else {
        setError(res.error || 'Erro ao registrar pagamento.')
      }
    } catch {
      setError('Erro de conexão ao pagar fatura.')
    } finally {
      setLoading(false)
    }
  }

  const formattedDueDate = dueDate
    ? `${dueDate.slice(8, 10)}/${dueDate.slice(5, 7)}/${dueDate.slice(0, 4)}`
    : ''

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-[#EBEEF2] overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-[#EBEEF2] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
              <CreditCard className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-[#111827]">Pagar Fatura</h3>
              <p className="text-xs text-[#6B7280]">
                {accountName} • Vencimento: {formattedDueDate}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold p-3 rounded-xl">
              {error}
            </div>
          )}

          {/* Resumo da Fatura */}
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block">
                Valor Total da Fatura
              </span>
              <span className="text-base font-bold text-slate-900 block">
                {formatBRL(totalAmount)}
              </span>
            </div>
            <div className="text-right">
              <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block">
                Restante em Aberto
              </span>
              <span className="text-base font-bold text-emerald-800 block">
                {formatBRL(remainingAmount)}
              </span>
            </div>
          </div>

          {/* Campo: Valor do Pagamento */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-800">
                Valor a Pagar (R$) *
              </label>
              {remainingAmount > 0 && (
                <button
                  type="button"
                  onClick={() => setAmount(String(remainingAmount.toFixed(2)).replace('.', ','))}
                  className="text-[11px] font-bold text-[#2F68FE] hover:underline"
                >
                  Pagar total restante
                </button>
              )}
            </div>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-500">
                R$
              </span>
              <input
                type="text"
                required
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0,00"
                className="w-full bg-white border border-slate-300 rounded-xl pl-8 pr-3 py-2 text-sm font-bold text-slate-900 focus:outline-none focus:border-[#2F68FE] focus:ring-2 focus:ring-[#2F68FE]/20"
              />
            </div>
            {isPartial && parsedAmount > 0 && (
              <p className="text-[11px] font-medium text-amber-700 mt-1">
                ⚠️ Este pagamento será registrado como <strong>pagamento parcial</strong>.
              </p>
            )}
          </div>

          {/* Campo: Data do Pagamento */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-800 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-slate-500" />
              <span>Data do Pagamento *</span>
            </label>
            <input
              type="date"
              required
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-medium text-slate-900 focus:outline-none focus:border-[#2F68FE] focus:ring-2 focus:ring-[#2F68FE]/20"
            />
          </div>

          {/* Campo: Conta de Origem (Opcional) */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-800">
                Conta debitada
              </label>
              <select
                value={fromAccountId}
                onChange={(e) => setFromAccountId(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-xl px-2.5 py-2 text-xs font-medium text-slate-900 focus:outline-none focus:border-[#2F68FE]"
              >
                <option value="">Não vincular</option>
                {accounts
                  .filter((a) => a.type === 'bank_account' || a.type === 'cash')
                  .map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name}
                    </option>
                  ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-800">
                Forma de Pagamento
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-xl px-2.5 py-2 text-xs font-medium text-slate-900 focus:outline-none focus:border-[#2F68FE]"
              >
                <option value="PIX">PIX</option>
                <option value="Boleto">Boleto</option>
                <option value="Débito Automático">Débito Automático</option>
                <option value="Transferência">Transferência</option>
                <option value="Dinheiro">Dinheiro</option>
              </select>
            </div>
          </div>

          {/* Observações */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-600">
              Observações (opcional)
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex: Pago com desconto, adiantamento..."
              className="w-full bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-[#2F68FE]"
            />
          </div>

          {/* Botões */}
          <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-xs font-bold shadow-sm transition-all disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Registrando...</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>Confirmar Pagamento</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
