'use client'

import React from 'react'
import { X, Edit2, Trash2 } from 'lucide-react'
import { formatBRL } from '@/lib/formatters'
import type { InstallmentGroupItem, TransactionRecord } from './TransactionsTab'

export interface InstallmentGroupModalProps {
  selectedInstallmentGroup: InstallmentGroupItem | null
  selectedGroupDetails: TransactionRecord[]
  loadingGroupInstallments: boolean
  groupDeleteError: string | null
  deletingGroupId: string | null
  deletingTxId: string | null
  onClose: () => void
  onStartEditing: (e: React.MouseEvent, tx: TransactionRecord) => void
  onDeleteSingleInstallment: (e: React.MouseEvent, id: string, label: string) => void
  onDeleteGroup: (groupId: string) => void
}

export function InstallmentGroupModal({
  selectedInstallmentGroup,
  selectedGroupDetails,
  loadingGroupInstallments,
  groupDeleteError,
  deletingGroupId,
  deletingTxId,
  onClose,
  onStartEditing,
  onDeleteSingleInstallment,
  onDeleteGroup,
}: InstallmentGroupModalProps) {
  if (!selectedInstallmentGroup) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-xs p-0 sm:p-4 transition-opacity animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col border border-[#EBEEF2] animate-in slide-in-from-bottom sm:zoom-in-95 duration-150 overflow-hidden max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile Grab Handle */}
        <div className="sm:hidden pt-2.5 pb-1 bg-white flex justify-center shrink-0">
          <div className="w-10 h-1 bg-slate-300 rounded-full" />
        </div>

        {/* Cabeçalho do Modal de Parcelamento */}
        <div className="px-4 sm:px-5 py-3.5 sm:py-4 border-b border-[#EBEEF2] flex items-start justify-between bg-white shrink-0">
          <div className="min-w-0 pr-2">
            <h2 className="text-base font-bold text-[#111827] truncate">
              {selectedInstallmentGroup.vendor}
            </h2>
            <p className="text-xs text-[#6B7280] truncate mt-0.5 flex items-center gap-1.5">
              <span>
                {selectedInstallmentGroup.date
                  ? new Date(selectedInstallmentGroup.date + 'T00:00:00').toLocaleDateString('pt-BR')
                  : 'Data não informada'}
              </span>
              <span>•</span>
              <span className="truncate">
                {selectedInstallmentGroup.category || 'Compras'}
              </span>
              <span>•</span>
              <span className="truncate">
                {selectedInstallmentGroup.accountName ||
                  selectedInstallmentGroup.paymentMethod ||
                  'Cartão de Crédito'}
              </span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-[#F4F5F7] text-[#9CA3AF] hover:text-[#111827] transition-colors cursor-pointer shrink-0"
            title="Fechar (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Conteúdo do Modal */}
        <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4 text-xs text-[#374151]">
          {groupDeleteError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
              {groupDeleteError}
            </div>
          )}

          {/* Card VALOR TOTAL em Destaque */}
          <div className="text-center bg-[#F9FAFB] rounded-xl border border-[#EBEEF2] p-4">
            <span className="text-[11px] font-semibold text-[#6B7280] uppercase tracking-wider block mb-1">
              Valor Total da Compra
            </span>
            <span className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#111827] block">
              - {formatBRL(selectedInstallmentGroup.totalPurchaseAmount)}
            </span>
            <span className="text-xs text-[#6B7280] mt-1 block font-medium">
              {selectedInstallmentGroup.installmentCount} parcelas de{' '}
              {formatBRL(selectedInstallmentGroup.installmentAmount)}
            </span>
          </div>

          {/* Resumo do Parcelamento Compacto */}
          <div className="space-y-2">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-[#4B5563]">
              Resumo do Parcelamento
            </h3>
            <div className="bg-white border border-[#EBEEF2] rounded-xl p-3 divide-y divide-[#F4F5F7] space-y-1.5">
              <div className="flex justify-between items-center py-1">
                <span className="text-[#4B5563]">Quantidade de parcelas</span>
                <span className="font-semibold text-[#111827]">
                  {selectedInstallmentGroup.installmentCount}x
                </span>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-[#4B5563]">Valor por parcela</span>
                <span className="font-semibold text-[#111827]">
                  {formatBRL(selectedInstallmentGroup.installmentAmount)}
                </span>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-[#4B5563]">Conta / Cartão</span>
                <span className="font-semibold text-[#111827]">
                  {selectedInstallmentGroup.accountName || 'Cartão de Crédito'}
                </span>
              </div>
            </div>
          </div>

          {/* Lista Completa de Parcelas com rolagem interna dedicada */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-[#4B5563]">
                Parcelas ({selectedGroupDetails.length}/{selectedInstallmentGroup.installmentCount})
              </h3>
            </div>

            {loadingGroupInstallments && selectedGroupDetails.length === 0 ? (
              <div className="text-center py-6 text-xs text-[#4B5563] animate-pulse bg-[#F9FAFB] rounded-xl border border-[#EBEEF2]">
                Carregando parcelas…
              </div>
            ) : (
              <div className="max-h-48 overflow-y-auto bg-white border border-[#EBEEF2] rounded-xl divide-y divide-[#F4F5F7]">
                {selectedGroupDetails.map((inst) => {
                  const cur = inst.installment_current || 1
                  const tot = inst.installment_total || selectedInstallmentGroup.installmentCount
                  const instDate = inst.date
                    ? new Date(inst.date + 'T00:00:00').toLocaleDateString('pt-BR')
                    : '—'

                  return (
                    <div
                      key={inst.id}
                      className="p-2.5 flex items-center justify-between gap-2 hover:bg-[#F9FAFB] transition-colors"
                    >
                      <div className="min-w-0 flex items-center gap-2">
                        <span className="text-[11px] font-semibold text-[#111827] bg-[#F4F5F7] px-1.5 py-0.5 rounded shrink-0 border border-[#E5E7EB]">
                          {cur}/{tot}
                        </span>
                        <span className="text-xs text-[#4B5563] truncate font-medium">
                          {instDate}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-bold text-xs text-[#111827]">
                          - {formatBRL(inst.total || selectedInstallmentGroup.installmentAmount)}
                        </span>
                        <button
                          type="button"
                          disabled={Boolean(deletingGroupId) || deletingTxId === inst.id}
                          onClick={(e) => onStartEditing(e, inst)}
                          className="p-1 text-[#6B7280] hover:text-[#2F68FE] hover:bg-[#EBF2FE] rounded transition-colors"
                          title={`Editar parcela ${cur}`}
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          disabled={Boolean(deletingGroupId) || deletingTxId === inst.id}
                          onClick={(e) => onDeleteSingleInstallment(e, inst.id, `Parcela ${cur} de ${selectedInstallmentGroup.vendor}`)}
                          className="p-1 text-[#6B7280] hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                          title={`Excluir parcela ${cur}`}
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Rodapé Fixo de Ações do Modal */}
        <div className="p-4 pb-[max(1rem,env(safe-area-inset-bottom,0px))] border-t border-[#EBEEF2] bg-[#F9FAFB] flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={(e) => {
              if (selectedGroupDetails.length > 0) {
                onStartEditing(e, selectedGroupDetails[0])
              }
            }}
            className="flex-1 py-2.5 px-3.5 rounded-xl bg-[#2F68FE] hover:bg-[#2557D6] active:scale-[0.98] text-white font-semibold text-xs transition-all flex items-center justify-center gap-1.5 shadow-sm shadow-blue-500/20 cursor-pointer"
          >
            <Edit2 className="w-3.5 h-3.5" />
            Editar compra
          </button>
          <button
            type="button"
            disabled={Boolean(deletingGroupId) || Boolean(deletingTxId)}
            onClick={() => onDeleteGroup(selectedInstallmentGroup.groupId)}
            className="py-2.5 px-3.5 rounded-xl border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 active:scale-[0.98] font-semibold text-xs transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow-2xs shrink-0"
            title="Excluir todas as parcelas desta compra"
          >
            <Trash2 className="w-3.5 h-3.5" />
            {deletingGroupId === selectedInstallmentGroup.groupId ? 'Excluindo…' : 'Excluir compra'}
          </button>
        </div>
      </div>
    </div>
  )
}
