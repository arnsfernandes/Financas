'use client'

import React from 'react'
import {
  CreditCard,
  ArrowDownLeft,
  ArrowUpRight,
  Repeat,
  ChevronRight,
} from 'lucide-react'
import { formatBRL } from '@/lib/formatters'
import type { DisplayListItem, InstallmentGroupItem, TransactionRecord } from './TransactionsTab'

export interface TransactionListItemProps {
  item: DisplayListItem
  isSelected: boolean
  onSelectGroup: (group: InstallmentGroupItem) => void
  onSelectTx: (tx: TransactionRecord) => void
}

export function TransactionListItem({
  item,
  isSelected,
  onSelectGroup,
  onSelectTx,
}: TransactionListItemProps) {
  // 1. Compra Parcelada Agrupada
  if (item.type === 'installment_group') {
    const dateStr = item.date
      ? new Date(item.date + 'T00:00:00').toLocaleDateString('pt-BR')
      : '—'
    const categoryStr = item.category || 'Sem categoria'
    const paymentStr = item.accountName || item.paymentMethod || 'Cartão de Crédito'

    return (
      <div
        onClick={() => onSelectGroup(item)}
        className={`px-3.5 py-2.5 sm:px-4 sm:py-2.5 hover:bg-[#F9FAFB] cursor-pointer transition-colors group ${
          isSelected ? 'bg-[#F0F4FF] hover:bg-[#F0F4FF]' : ''
        }`}
      >
        {/* Bloco de conteúdo relevante (~650-700px no desktop) */}
        <div className="flex items-center gap-3.5 w-full md:max-w-[680px]">
          {/* Ícone discreto */}
          <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-amber-50 text-amber-700">
            <CreditCard className="w-4 h-4" />
          </div>

          {/* Bloco de Identificação e Metadados */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap leading-tight">
              <span className="text-sm font-semibold text-[#111827] group-hover:text-[#2F68FE] transition-colors truncate">
                {item.vendor}
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold bg-amber-50 text-amber-800 border border-amber-300 shrink-0">
                {item.installmentCount}x de {formatBRL(item.installmentAmount)}
              </span>
            </div>

            <div className="text-xs text-[#4B5563] truncate mt-0.5 font-medium">
              {dateStr} • {categoryStr} • {paymentStr}
            </div>
          </div>

          {/* Coluna de Valor com largura fixa e alinhada + Chevron colado */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-28 sm:w-32 text-right">
              <span className="text-sm font-bold whitespace-nowrap text-[#111827] block">
                - {formatBRL(item.totalPurchaseAmount)}
              </span>
            </div>
            <ChevronRight className="w-4 h-4 text-[#6B7280] group-hover:text-[#2F68FE] transition-colors shrink-0" />
          </div>
        </div>
      </div>
    )
  }

  // 2. Lançamento Individual (Não parcelado)
  const tx = item.tx
  const isIncome = tx.type === 'income'
  const isRecurring = tx.is_recurring

  const vendorName =
    tx.canonical_vendors?.canonical_name ||
    tx.vendor ||
    (isIncome ? 'Receita' : 'Sem estabelecimento')

  const dateStr = tx.date
    ? new Date(tx.date + 'T00:00:00').toLocaleDateString('pt-BR')
    : new Date(tx.created_at).toLocaleDateString('pt-BR')

  const categoryStr = tx.categories?.name || tx.category || 'Geral'
  const paymentStr = tx.accounts?.name || tx.payment_method || 'PIX'

  return (
    <div
      onClick={() => onSelectTx(tx)}
      className={`px-3.5 py-2.5 sm:px-4 sm:py-2.5 hover:bg-[#F9FAFB] cursor-pointer transition-colors group ${
        isSelected ? 'bg-[#F0F4FF] hover:bg-[#F0F4FF]' : ''
      }`}
    >
      {/* Bloco de conteúdo relevante (~650-700px no desktop) */}
      <div className="flex items-center gap-3.5 w-full md:max-w-[680px]">
        {/* Ícone */}
        <div
          className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
            isIncome
              ? 'bg-emerald-50 text-emerald-700'
              : isRecurring
              ? 'bg-blue-50 text-blue-700'
              : 'bg-[#F4F5F7] text-[#4B5563]'
          }`}
        >
          {isIncome ? (
            <ArrowDownLeft className="w-4 h-4" />
          ) : isRecurring ? (
            <Repeat className="w-4 h-4" />
          ) : (
            <ArrowUpRight className="w-4 h-4" />
          )}
        </div>

        {/* Bloco de Identificação e Metadados */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap leading-tight">
            <span className="text-sm font-semibold text-[#111827] group-hover:text-[#2F68FE] transition-colors truncate">
              {vendorName}
            </span>

            {isRecurring && (
              <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold bg-blue-50 text-blue-800 border border-blue-300 shrink-0">
                Recorrente
              </span>
            )}
          </div>

          <div className="text-xs text-[#4B5563] truncate mt-0.5 flex items-center gap-1 font-medium">
            <span>{dateStr}</span>
            <span>•</span>
            <span className="inline-flex items-center gap-1 truncate">
              {tx.categories?.color && (
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: tx.categories.color }}
                />
              )}
              <span className="truncate">{categoryStr}</span>
            </span>
            <span>•</span>
            <span className="truncate">{paymentStr}</span>
          </div>
        </div>

        {/* Coluna de Valor com largura fixa e alinhada + Chevron colado */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-28 sm:w-32 text-right">
            <span
              className={`text-sm font-bold whitespace-nowrap ${
                isIncome ? 'text-[#059669]' : 'text-[#111827]'
              }`}
            >
              {isIncome ? '+' : '-'} {formatBRL(tx.total)}
            </span>
          </div>
          <ChevronRight className="w-4 h-4 text-[#6B7280] group-hover:text-[#2F68FE] transition-colors shrink-0" />
        </div>
      </div>
    </div>
  )
}
