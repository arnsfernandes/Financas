'use client'

import React from 'react'
import { Plus, Minus, X, Loader2 } from 'lucide-react'
import type { Reserve } from '@/lib/reserves'
import type { AccountWithStats } from '@/lib/queries'
import { formatBRL, getAccountTypeLabel } from '@/lib/formatters'

export interface ReserveMovementModalProps {
  isOpen: boolean
  reserve: Reserve | null
  onClose: () => void
  movementType: 'deposit' | 'withdrawal'
  setMovementType: (type: 'deposit' | 'withdrawal') => void
  movementAmount: string
  setMovementAmount: (amount: string) => void
  movementDate: string
  setMovementDate: (date: string) => void
  movementAccount: string
  setMovementAccount: (acc: string) => void
  movementNotes: string
  setMovementNotes: (notes: string) => void
  savingMovement: boolean
  movementError: string
  onSaveMovement: (e: React.FormEvent) => void
  accounts: AccountWithStats[]
}

export function ReserveMovementModal({
  isOpen,
  reserve,
  onClose,
  movementType,
  setMovementType,
  movementAmount,
  setMovementAmount,
  movementDate,
  setMovementDate,
  movementAccount,
  setMovementAccount,
  movementNotes,
  setMovementNotes,
  savingMovement,
  movementError,
  onSaveMovement,
  accounts,
}: ReserveMovementModalProps) {
  if (!isOpen || !reserve) return null

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
            <div
              className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                movementType === 'deposit'
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-slate-100 text-slate-800'
              }`}
            >
              {movementType === 'deposit' ? <Plus className="w-4 h-4" /> : <Minus className="w-4 h-4" />}
            </div>
            <div>
              <h3 className="text-base font-bold text-[#111827]">
                {movementType === 'deposit' ? 'Adicionar Aporte' : 'Realizar Retirada'}
              </h3>
              <p className="text-[11px] text-[#6B7280]">
                Reserva: <strong>{reserve.name}</strong> • Saldo atual: {formatBRL(reserve.currentBalance)}
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

        <form onSubmit={onSaveMovement} className="p-5 space-y-4">
          {movementError && (
            <div className="text-xs text-red-600 bg-red-50 p-2.5 rounded-xl border border-red-100">
              {movementError}
            </div>
          )}

          {/* Seletor Rápido de Tipo */}
          <div className="grid grid-cols-2 gap-2 bg-[#F4F5F7] p-1 rounded-xl border border-[#E5E7EB]">
            <button
              type="button"
              onClick={() => setMovementType('deposit')}
              className={`py-1.5 text-xs font-semibold rounded-lg transition-all ${
                movementType === 'deposit'
                  ? 'bg-white text-emerald-700 shadow-sm'
                  : 'text-[#6B7280] hover:text-[#111827]'
              }`}
            >
              + Aporte (Guardar)
            </button>
            <button
              type="button"
              onClick={() => setMovementType('withdrawal')}
              className={`py-1.5 text-xs font-semibold rounded-lg transition-all ${
                movementType === 'withdrawal'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-[#6B7280] hover:text-[#111827]'
              }`}
            >
              - Retirada (Resgatar)
            </button>
          </div>

          {/* Valor */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#111827]">Valor (R$) *</label>
            <input
              type="text"
              required
              autoFocus
              value={movementAmount}
              onChange={(e) => setMovementAmount(e.target.value)}
              placeholder="0,00"
              className="w-full bg-[#F9FAFB] border border-[#E5E7EB] hover:border-[#D1D5DB] focus:bg-white rounded-xl px-3 py-2 text-sm font-bold text-[#111827] focus:outline-none focus:border-emerald-600 transition-all"
            />
          </div>

          {/* Data */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#111827]">Data da Movimentação</label>
            <input
              type="date"
              required
              value={movementDate}
              onChange={(e) => setMovementDate(e.target.value)}
              className="w-full bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl px-3 py-2 text-xs text-[#111827] focus:outline-none focus:border-emerald-600 transition-all"
            />
          </div>

          {/* Conta de Origem/Destino (opcional) */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#111827]">
              {movementType === 'deposit' ? 'Origem do dinheiro (opcional)' : 'Destino do dinheiro (opcional)'}
            </label>
            <select
              value={movementAccount}
              onChange={(e) => setMovementAccount(e.target.value)}
              className="w-full bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl px-3 py-2 text-xs text-[#111827] focus:outline-none focus:border-emerald-600 transition-all cursor-pointer"
            >
              <option value="">Não informado (Geral)</option>
              {accounts
                .filter((a) => a.active !== false && a.type !== 'credit_card')
                .map((a) => (
                  <option key={a.id} value={a.name}>
                    {a.name} ({getAccountTypeLabel(a.type)})
                  </option>
                ))}
            </select>
          </div>

          {/* Nota / Descrição */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#111827]">Descrição ou Motivo (opcional)</label>
            <input
              type="text"
              value={movementNotes}
              onChange={(e) => setMovementNotes(e.target.value)}
              placeholder={movementType === 'deposit' ? 'Ex: Economia do mês, Sobra...' : 'Ex: Manutenção do carro, Emergência...'}
              className="w-full bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl px-3 py-2 text-xs text-[#111827] focus:outline-none focus:border-emerald-600 transition-all"
            />
          </div>

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
              disabled={savingMovement || !movementAmount.trim()}
              className={`flex items-center gap-1.5 px-5 py-2 rounded-xl text-white text-xs font-semibold shadow-sm transition-colors disabled:opacity-50 ${
                movementType === 'deposit'
                  ? 'bg-emerald-600 hover:bg-emerald-700'
                  : 'bg-slate-900 hover:bg-black'
              }`}
            >
              {savingMovement ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Processando...</span>
                </>
              ) : (
                <span>Confirmar {movementType === 'deposit' ? 'Aporte' : 'Retirada'}</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
