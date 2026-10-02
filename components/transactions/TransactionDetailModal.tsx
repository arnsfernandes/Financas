'use client'

import React from 'react'
import { X, Edit2, Trash2, Repeat } from 'lucide-react'
import { formatBRL } from '@/lib/formatters'
import type { TransactionRecord } from './TransactionsTab'

export interface TransactionDetailModalProps {
  selectedDrawerTx: TransactionRecord | null
  deletingTxId: string | null
  deletingGroupId: string | null
  onClose: () => void
  onStartEditing: (e: React.MouseEvent, tx: TransactionRecord) => void
  onDeleteTx: (e: React.MouseEvent, id: string, vendor?: string | null) => void
  onDeleteGroup: (groupId: string) => void
}

export function TransactionDetailModal({
  selectedDrawerTx,
  deletingTxId,
  deletingGroupId,
  onClose,
  onStartEditing,
  onDeleteTx,
  onDeleteGroup,
}: TransactionDetailModalProps) {
  if (!selectedDrawerTx) return null

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

        {/* Cabeçalho do Modal */}
        <div className="px-4 sm:px-5 py-3.5 sm:py-4 border-b border-[#EBEEF2] flex items-start justify-between bg-white shrink-0">
          <div className="min-w-0 pr-2">
            <h2 className="text-base font-bold text-[#111827] truncate">
              {selectedDrawerTx.canonical_vendors?.canonical_name ||
                selectedDrawerTx.vendor ||
                (selectedDrawerTx.type === 'income' ? 'Receita' : 'Sem estabelecimento')}
            </h2>
            <p className="text-xs text-[#6B7280] truncate mt-0.5 flex items-center gap-1.5">
              <span>
                {selectedDrawerTx.date
                  ? new Date(selectedDrawerTx.date + 'T00:00:00').toLocaleDateString('pt-BR')
                  : new Date(selectedDrawerTx.created_at).toLocaleDateString('pt-BR')}
              </span>
              <span>•</span>
              <span className="truncate">
                {selectedDrawerTx.categories?.name ||
                  selectedDrawerTx.category ||
                  'Não categorizado'}
              </span>
              <span>•</span>
              <span className="truncate">
                {selectedDrawerTx.payment_method ||
                  selectedDrawerTx.accounts?.name ||
                  'PIX'}
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
          {/* Card VALOR TOTAL em Destaque */}
          <div className="text-center bg-[#F9FAFB] rounded-xl border border-[#EBEEF2] p-4">
            <span className="text-[11px] font-semibold text-[#6B7280] uppercase tracking-wider block mb-1">
              {selectedDrawerTx.type === 'income' ? 'Valor Recebido' : 'Valor Total'}
            </span>
            <span
              className={`text-2xl sm:text-3xl font-extrabold tracking-tight block ${
                selectedDrawerTx.type === 'income' ? 'text-emerald-600' : 'text-[#111827]'
              }`}
            >
              {selectedDrawerTx.type === 'income' ? '+' : '-'} {formatBRL(selectedDrawerTx.total)}
            </span>
          </div>

          {/* Informações de Parcelamento se aplicável */}
          {selectedDrawerTx.installment_group_id && (selectedDrawerTx.installment_total || 0) > 1 && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-2 text-xs text-amber-900">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold block">Compra Parcelada</span>
                <span className="text-[11px] font-medium text-amber-800 bg-amber-100/70 px-2 py-0.5 rounded">
                  Parcela {selectedDrawerTx.installment_current || 1} de {selectedDrawerTx.installment_total}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 pt-1 border-t border-amber-200/60">
                <span className="text-[11px] text-amber-800">
                  Deseja remover todas as {selectedDrawerTx.installment_total} parcelas?
                </span>
                <button
                  type="button"
                  disabled={Boolean(deletingGroupId) || deletingTxId === selectedDrawerTx.id}
                  onClick={() => onDeleteGroup(selectedDrawerTx.installment_group_id!)}
                  className="px-2.5 py-1 text-xs font-semibold text-red-600 bg-red-100/80 hover:bg-red-200 rounded-lg transition-colors flex items-center gap-1 shrink-0 cursor-pointer disabled:opacity-50"
                  title="Excluir todas as parcelas deste parcelamento"
                >
                  <Trash2 className="w-3 h-3" />
                  {deletingGroupId === selectedDrawerTx.installment_group_id ? 'Excluindo…' : 'Excluir compra'}
                </button>
              </div>
            </div>
          )}

          {/* Informações Gerais Úteis */}
          <div className="space-y-2">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-[#4B5563]">
              Informações Gerais
            </h3>
            <div className="bg-white border border-[#EBEEF2] rounded-xl p-3 divide-y divide-[#F4F5F7] space-y-1.5">
              <div className="flex justify-between items-center py-1">
                <span className="text-[#4B5563]">Conta / Meio</span>
                <span className="font-semibold text-[#111827]">
                  {selectedDrawerTx.accounts?.name || 'Geral'}
                </span>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-[#4B5563]">Categoria</span>
                <span className="font-semibold text-[#111827] flex items-center gap-1.5">
                  {selectedDrawerTx.categories?.color && (
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: selectedDrawerTx.categories.color }}
                    />
                  )}
                  <span>
                    {selectedDrawerTx.categories?.name ||
                      selectedDrawerTx.category ||
                      'Não categorizado'}
                  </span>
                </span>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-[#4B5563]">Forma de Pagamento</span>
                <span className="font-semibold text-[#111827]">
                  {selectedDrawerTx.payment_method || 'Não especificada'}
                </span>
              </div>
            </div>
          </div>

          {/* Recorrência */}
          {selectedDrawerTx.is_recurring && (
            <div className="bg-[#F9FAFB] border border-[#EBEEF2] rounded-xl p-3 flex items-center justify-between">
              <span className="flex items-center gap-1.5 font-medium text-[#111827]">
                <Repeat className="w-3.5 h-3.5 text-[#2F68FE]" />
                Despesa Recorrente
              </span>
              <span className="text-[11px] text-[#6B7280]">
                {selectedDrawerTx.recurrence_status === 'ended'
                  ? 'Encerrada'
                  : 'Ativa (Mensal)'}
              </span>
            </div>
          )}

          {/* Itens da Transação (se houver) */}
          {selectedDrawerTx.transaction_items && selectedDrawerTx.transaction_items.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-[#9CA3AF]">
                Itens ({selectedDrawerTx.transaction_items.length})
              </h3>
              <div className="bg-white border border-[#EBEEF2] rounded-xl overflow-hidden divide-y divide-[#F4F5F7]">
                {selectedDrawerTx.transaction_items.map((it: any) => (
                  <div key={it.id} className="p-2.5 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <span className="font-semibold text-[#111827] block truncate">
                        {it.canonical_products?.canonical_name || it.description}
                      </span>
                      <span className="text-[10px] text-[#6B7280]">
                        {it.quantity ? `${it.quantity}x` : '1x'}{' '}
                        {it.unit_price ? `• ${formatBRL(it.unit_price)}/un` : ''}
                      </span>
                    </div>
                    <span className="font-bold text-[#111827] shrink-0">
                      {formatBRL(it.total)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Rodapé Fixo de Ações do Modal */}
        <div className="p-4 pb-[max(1rem,env(safe-area-inset-bottom,0px))] border-t border-[#EBEEF2] bg-[#F9FAFB] flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={(e) => onStartEditing(e, selectedDrawerTx)}
            className="flex-1 py-2.5 px-3.5 rounded-xl bg-[#2F68FE] hover:bg-[#2557D6] active:scale-[0.98] text-white font-semibold text-xs transition-all flex items-center justify-center gap-1.5 shadow-sm shadow-blue-500/20 cursor-pointer"
          >
            <Edit2 className="w-3.5 h-3.5" />
            Editar lançamento
          </button>
          <button
            type="button"
            onClick={(e) => onDeleteTx(e, selectedDrawerTx.id, selectedDrawerTx.vendor)}
            disabled={deletingTxId === selectedDrawerTx.id || Boolean(deletingGroupId)}
            className="py-2.5 px-3.5 rounded-xl border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 active:scale-[0.98] font-semibold text-xs transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow-2xs shrink-0"
            title="Excluir este lançamento"
          >
            <Trash2 className="w-3.5 h-3.5" />
            {deletingTxId === selectedDrawerTx.id ? 'Excluindo…' : 'Excluir lançamento'}
          </button>
        </div>
      </div>
    </div>
  )
}
