'use client'

import React from 'react'
import { PiggyBank, X, Loader2 } from 'lucide-react'
import type { AccountWithStats } from '@/lib/queries'
import { getAccountTypeLabel } from '@/lib/formatters'

export interface CreateReserveModalProps {
  isOpen: boolean
  onClose: () => void
  name: string
  setName: (name: string) => void
  initialBalance: string
  setInitialBalance: (val: string) => void
  targetAmount: string
  setTargetAmount: (val: string) => void
  fromAccount: string
  setFromAccount: (acc: string) => void
  saving: boolean
  error: string
  onCreate: (e: React.FormEvent) => void
  accounts: AccountWithStats[]
}

export function CreateReserveModal({
  isOpen,
  onClose,
  name,
  setName,
  initialBalance,
  setInitialBalance,
  targetAmount,
  setTargetAmount,
  fromAccount,
  setFromAccount,
  saving,
  error,
  onCreate,
  accounts,
}: CreateReserveModalProps) {
  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl border border-[#EBEEF2] overflow-hidden max-h-[92vh] flex flex-col animate-in slide-in-from-bottom sm:zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile Grab Handle */}
        <div className="sm:hidden pt-2.5 pb-1 bg-white flex justify-center shrink-0">
          <div className="w-10 h-1 bg-slate-300 rounded-full" />
        </div>

        <div className="p-4 sm:p-5 border-b border-[#EBEEF2] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
              <PiggyBank className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-[#111827]">Nova Reserva</h3>
              <p className="text-[11px] text-[#6B7280]">
                Guarde dinheiro para objetivos específicos
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-[#9CA3AF] hover:text-[#111827] hover:bg-[#F4F5F7] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={onCreate} className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1">
          {error && (
            <div className="text-xs text-red-600 bg-red-50 p-2.5 rounded-xl border border-red-100">
              {error}
            </div>
          )}

          {/* Nome */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#111827]">
              Nome da Reserva *
            </label>
            <input
              type="text"
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Reserva de emergência, Viagem, Entrada do carro..."
              className="w-full bg-[#F9FAFB] border border-[#E5E7EB] hover:border-[#D1D5DB] focus:bg-white rounded-xl px-3 py-2 text-xs text-[#111827] focus:outline-none focus:border-emerald-600 transition-all"
            />
          </div>

          {/* Saldo Inicial */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#111827]">
              Saldo Inicial (R$, opcional)
            </label>
            <input
              type="text"
              value={initialBalance}
              onChange={(e) => setInitialBalance(e.target.value)}
              placeholder="0,00"
              className="w-full bg-[#F9FAFB] border border-[#E5E7EB] hover:border-[#D1D5DB] focus:bg-white rounded-xl px-3 py-2 text-xs text-[#111827] focus:outline-none focus:border-emerald-600 transition-all"
            />
          </div>

          {/* Meta Opcional */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#111827]">
              Meta Financeira (R$, opcional)
            </label>
            <input
              type="text"
              value={targetAmount}
              onChange={(e) => setTargetAmount(e.target.value)}
              placeholder="Ex: 5000, 10000..."
              className="w-full bg-[#F9FAFB] border border-[#E5E7EB] hover:border-[#D1D5DB] focus:bg-white rounded-xl px-3 py-2 text-xs text-[#111827] focus:outline-none focus:border-emerald-600 transition-all"
            />
          </div>

          {/* Conta de Origem (se houver saldo inicial) */}
          {Boolean(initialBalance && parseFloat(initialBalance.replace(',', '.')) > 0) && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[#111827]">
                Conta de Origem do Saldo Inicial
              </label>
              <select
                value={fromAccount}
                onChange={(e) => setFromAccount(e.target.value)}
                className="w-full bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl px-3 py-2 text-xs text-[#111827] focus:outline-none focus:border-emerald-600 transition-all cursor-pointer"
              >
                <option value="">Não informado</option>
                {accounts
                  .filter((a) => a.active !== false && a.type !== 'credit_card')
                  .map((a) => (
                    <option key={a.id} value={a.name}>
                      {a.name} ({getAccountTypeLabel(a.type)})
                    </option>
                  ))}
              </select>
            </div>
          )}

          {/* Botões de Ação */}
          <div className="flex items-center justify-end gap-2 pt-3 pb-[max(1rem,env(safe-area-inset-bottom,0px))] sm:pb-0 border-t border-[#EBEEF2]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 sm:py-2 rounded-xl text-xs font-semibold text-[#6B7280] hover:bg-[#F4F5F7] active:bg-[#E5E7EB] transition-colors touch-manipulation min-h-[44px] sm:min-h-0"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="flex items-center justify-center gap-1.5 px-5 py-2.5 sm:py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-xs font-semibold shadow-sm transition-colors disabled:opacity-50 touch-manipulation min-h-[44px] sm:min-h-0"
            >
              {saving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Criando...</span>
                </>
              ) : (
                <span>Criar Reserva</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
