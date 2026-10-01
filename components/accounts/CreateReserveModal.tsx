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
      className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-[#EBEEF2] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-[#EBEEF2] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <PiggyBank className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[#111827]">Nova Reserva</h3>
              <p className="text-[11px] text-[#6B7280]">
                Guarde dinheiro para objetivos específicos
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-xl text-[#9CA3AF] hover:text-[#111827] hover:bg-[#F4F5F7] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={onCreate} className="p-5 space-y-4">
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
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#EBEEF2]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-[#6B7280] hover:bg-[#F4F5F7] transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm transition-colors disabled:opacity-50"
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
