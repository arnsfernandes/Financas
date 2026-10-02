'use client'

import React from 'react'
import {
  PiggyBank,
  Plus,
  Minus,
  X,
  Loader2,
  Edit3,
  ShieldCheck,
  ArrowDownLeft,
  ArrowUpRight,
  Trash2,
} from 'lucide-react'
import type { Reserve } from '@/lib/reserves'
import { formatBRL } from '@/lib/formatters'

export interface ReserveDetailDrawerProps {
  isOpen: boolean
  reserve: Reserve | null
  onClose: () => void
  onOpenMovementModal: (type: 'deposit' | 'withdrawal') => void
  onDeleteReserve: () => void
  deletingReserve: boolean
  onSaveReserveEdit: (e: React.FormEvent) => void
  savingReserveEdit: boolean
  isEditingReserve: boolean
  setIsEditingReserve: (editing: boolean) => void
  editReserveName: string
  setEditReserveName: (name: string) => void
  editReserveTarget: string
  setEditReserveTarget: (target: string) => void
}

export function ReserveDetailDrawer({
  isOpen,
  reserve,
  onClose,
  onOpenMovementModal,
  onDeleteReserve,
  deletingReserve,
  onSaveReserveEdit,
  savingReserveEdit,
  isEditingReserve,
  setIsEditingReserve,
  editReserveName,
  setEditReserveName,
  editReserveTarget,
  setEditReserveTarget,
}: ReserveDetailDrawerProps) {
  if (!isOpen || !reserve) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-stretch sm:justify-end bg-black/40 backdrop-blur-xs transition-opacity"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-none h-[92vh] sm:h-full shadow-2xl flex flex-col justify-between overflow-hidden animate-in slide-in-from-bottom sm:slide-in-from-right duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile Grab Handle */}
        <div className="sm:hidden pt-2.5 pb-1 bg-white flex justify-center shrink-0">
          <div className="w-10 h-1 bg-slate-300 rounded-full" />
        </div>

        {/* Header do Drawer da Reserva */}
        <div className="p-4 sm:p-6 border-b border-[#EBEEF2] flex items-start justify-between gap-3 sm:gap-4 sticky top-0 bg-white z-10">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
              <PiggyBank className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-[#111827] truncate">
                  {reserve.name}
                </h2>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                  Reserva
                </span>
              </div>
              <p className="text-xs text-[#6B7280] mt-0.5">
                Dinheiro guardado • Transferências internas
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-[#9CA3AF] hover:text-[#111827] hover:bg-[#F4F5F7] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Conteúdo do Drawer da Reserva */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Banner de Saldo e Meta */}
          <div className="p-5 rounded-2xl bg-gradient-to-br from-emerald-50/70 to-emerald-100/30 border border-emerald-200/70 space-y-4">
            <div>
              <span className="text-[11px] uppercase font-bold text-emerald-800 tracking-wider block">
                Saldo Atual
              </span>
              <div className="text-2xl font-black text-emerald-900 tracking-tight mt-0.5">
                {formatBRL(reserve.currentBalance)}
              </div>
            </div>

            {reserve.targetAmount && reserve.targetAmount > 0 ? (
              <div className="space-y-1.5 pt-3 border-t border-emerald-200/50">
                <div className="flex items-center justify-between text-xs text-emerald-800">
                  <span>Meta: {formatBRL(reserve.targetAmount)}</span>
                  <span className="font-bold">
                    {Math.min(100, Math.round((reserve.currentBalance / reserve.targetAmount) * 100))}% atingido
                  </span>
                </div>
                <div className="w-full h-2 bg-emerald-200/60 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-600 rounded-full transition-all duration-300"
                    style={{
                      width: `${Math.min(100, Math.round((reserve.currentBalance / reserve.targetAmount) * 100))}%`,
                    }}
                  />
                </div>
                {reserve.targetAmount > reserve.currentBalance && (
                  <p className="text-[11px] text-emerald-700">
                    Faltam {formatBRL(reserve.targetAmount - reserve.currentBalance)} para atingir a meta.
                  </p>
                )}
              </div>
            ) : (
              <div className="text-xs text-emerald-700 pt-2 border-t border-emerald-200/50">
                Sem meta estipulada para esta reserva.
              </div>
            )}
          </div>

          {/* Aviso da Regra Fundamental */}
          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-[#F9FAFB] border border-[#EBEEF2] text-xs text-[#6B7280]">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <span>
              <strong>Movimentação interna:</strong> aportes não contam como despesas e retiradas não contam como receitas na sua Visão Geral.
            </span>
          </div>

          {/* Botões de Ação: Aporte, Retirada, Editar, Excluir */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <button
              type="button"
              onClick={() => onOpenMovementModal('deposit')}
              className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm transition-all"
            >
              <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>Aporte</span>
            </button>

            <button
              type="button"
              onClick={() => onOpenMovementModal('withdrawal')}
              disabled={reserve.currentBalance <= 0}
              className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold shadow-sm transition-all disabled:opacity-40"
            >
              <Minus className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>Retirada</span>
            </button>

            <button
              type="button"
              onClick={() => setIsEditingReserve(!isEditingReserve)}
              className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-white border border-[#E5E7EB] hover:border-[#2F68FE] text-[#4B5563] hover:text-[#2F68FE] text-xs font-semibold transition-all"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>{isEditingReserve ? 'Cancelar' : 'Editar'}</span>
            </button>

            <button
              type="button"
              onClick={onDeleteReserve}
              disabled={deletingReserve}
              className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-white border border-[#FCA5A5]/60 hover:bg-red-50 text-red-600 text-xs font-semibold transition-all disabled:opacity-40"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Excluir</span>
            </button>
          </div>

          {/* Formulário de Edição da Reserva */}
          {isEditingReserve && (
            <form onSubmit={onSaveReserveEdit} className="p-4 bg-[#F9FAFB] rounded-2xl border border-[#EBEEF2] space-y-3">
              <h4 className="text-xs font-bold text-[#111827] uppercase tracking-wider">
                Editar Reserva
              </h4>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-[#4B5563]">Nome da Reserva</label>
                <input
                  type="text"
                  required
                  value={editReserveName}
                  onChange={(e) => setEditReserveName(e.target.value)}
                  className="w-full bg-white border border-[#E5E7EB] rounded-xl px-3 py-1.5 text-xs text-[#111827] focus:outline-none focus:border-emerald-600"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-[#4B5563]">Meta (R$, opcional)</label>
                <input
                  type="text"
                  value={editReserveTarget}
                  onChange={(e) => setEditReserveTarget(e.target.value)}
                  placeholder="Ex: 10000"
                  className="w-full bg-white border border-[#E5E7EB] rounded-xl px-3 py-1.5 text-xs text-[#111827] focus:outline-none focus:border-emerald-600"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsEditingReserve(false)}
                  className="px-3 py-1.5 text-xs font-semibold text-[#6B7280] hover:text-[#111827]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingReserveEdit}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-all disabled:opacity-50"
                >
                  {savingReserveEdit && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Salvar Alterações
                </button>
              </div>
            </form>
          )}

          {/* Histórico de Movimentações */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#9CA3AF]">
                Histórico de Movimentações ({reserve.movements?.length || 0})
              </h3>
            </div>

            {!reserve.movements || reserve.movements.length === 0 ? (
              <div className="p-8 text-center text-xs text-[#9CA3AF] bg-[#F9FAFB] rounded-2xl border border-[#EBEEF2]">
                Nenhuma movimentação registrada nesta reserva ainda.
              </div>
            ) : (
              <div className="space-y-2">
                {reserve.movements.map((mov) => {
                  const isDeposit = mov.type === 'deposit'
                  return (
                    <div
                      key={mov.id}
                      className="p-3 bg-[#F9FAFB] hover:bg-white border border-[#EBEEF2] rounded-xl flex items-center justify-between gap-3 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                            isDeposit ? 'bg-emerald-100/70 text-emerald-700' : 'bg-slate-200 text-slate-700'
                          }`}
                        >
                          {isDeposit ? <ArrowDownLeft className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold text-[#111827]">
                              {isDeposit ? 'Aporte' : 'Retirada'}
                            </span>
                            {mov.fromAccount && (
                              <span className="text-[10px] text-[#6B7280] bg-white border border-[#E5E7EB] px-1.5 py-0.2 rounded">
                                {mov.fromAccount}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-[#9CA3AF] mt-0.5 truncate">
                            {mov.date} {mov.notes ? `• ${mov.notes}` : ''}
                          </div>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span
                          className={`text-xs font-bold block ${
                            isDeposit ? 'text-emerald-700' : 'text-slate-800'
                          }`}
                        >
                          {isDeposit ? `+${formatBRL(mov.amount)}` : `-${formatBRL(mov.amount)}`}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        <div className="p-4 pb-[max(1rem,env(safe-area-inset-bottom,0px))] border-t border-[#EBEEF2] bg-[#F9FAFB] flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl text-xs font-semibold text-[#4B5563] hover:text-[#111827] bg-white border border-[#E5E7EB] hover:bg-[#F3F4F6] transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}
