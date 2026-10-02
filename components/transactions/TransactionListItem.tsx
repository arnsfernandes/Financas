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
        className={`px-3.5 py-3 sm:px-4 sm:py-2.5 hover:bg-[#F2F4F7]/70 active:bg-[#EAECF0] cursor-pointer transition-colors group select-none touch-manipulation ${
          isSelected ? 'bg-[#EBF2FF]' : ''
        }`}
      >
        {/* Bloco de conteúdo relevante */}
        <div className="flex items-center gap-3 sm:gap-3.5 w-full">
          {/* Ícone outline circular discreto */}
          <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 bg-[#FEF6E7] text-[#D97706]">
            <CreditCard className="w-4 h-4 stroke-[1.8]" />
          </div>

          {/* Bloco de Identificação e Metadados */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap leading-tight">
              <span className="text-xs sm:text-sm font-normal text-[#0F172A] group-hover:text-[#2F68FE] transition-colors truncate tracking-tight">
                {item.vendor}
              </span>
              <span className="text-[9px] px-1.5 py-0.2 rounded-md font-medium bg-[#FEF6E7] text-[#D97706] border border-[#FDE68A] shrink-0">
                {item.installmentCount}x de {formatBRL(item.installmentAmount)}
              </span>
            </div>

            <div className="text-[10px] sm:text-xs text-[#667085] truncate mt-0.5 font-normal">
              {dateStr} • {categoryStr} • {paymentStr}
            </div>
          </div>

          {/* Coluna de Valor + Chevron */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <div className="text-right">
              <span className="text-xs sm:text-sm font-normal whitespace-nowrap text-[#0F172A] block tabular-nums tracking-tight">
                - {formatBRL(item.totalPurchaseAmount)}
              </span>
            </div>
            <ChevronRight className="w-3.5 h-3.5 text-[#98A2B3] group-hover:text-[#2F68FE] transition-colors shrink-0" />
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
      className={`px-3.5 py-3 sm:px-4 sm:py-2.5 hover:bg-[#F2F4F7]/70 active:bg-[#EAECF0] cursor-pointer transition-colors group select-none touch-manipulation ${
        isSelected ? 'bg-[#EBF2FF]' : ''
      }`}
    >
      <div className="flex items-center gap-3 sm:gap-3.5 w-full">
        {/* Ícone Outline Circular */}
        <div
          className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
            isIncome
              ? 'bg-[#E8FDF3] text-[#10B981]'
              : isRecurring
              ? 'bg-[#EEF0FF] text-[#6366F1]'
              : 'bg-[#F2F4F7] text-[#667085]'
          }`}
        >
          {isIncome ? (
            <ArrowDownLeft className="w-4 h-4 stroke-[2]" />
          ) : isRecurring ? (
            <Repeat className="w-4 h-4 stroke-[1.8]" />
          ) : (
            <ArrowUpRight className="w-4 h-4 stroke-[2]" />
          )}
        </div>

        {/* Bloco de Identificação e Metadados */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap leading-tight">
            <span className="text-xs sm:text-sm font-normal text-[#0F172A] group-hover:text-[#2F68FE] transition-colors truncate tracking-tight">
              {vendorName}
            </span>

            {isRecurring && (
              <span className="text-[9px] px-1.5 py-0.2 rounded-md font-medium bg-[#EEF0FF] text-[#6366F1] border border-[#C7D2FE] shrink-0">
                Fixa
              </span>
            )}
          </div>

          <div className="text-[10px] sm:text-xs text-[#667085] truncate mt-0.5 flex items-center gap-1 font-normal">
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

        {/* Coluna de Valor + Chevron */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <div className="text-right">
            <span
              className={`text-xs sm:text-sm font-normal whitespace-nowrap block tabular-nums tracking-tight ${
                isIncome ? 'text-[#10B981]' : 'text-[#0F172A]'
              }`}
            >
              {isIncome ? '+ ' : '- '}
              {formatBRL(Number(tx.total))}
            </span>
          </div>
          <ChevronRight className="w-3.5 h-3.5 text-[#98A2B3] group-hover:text-[#2F68FE] transition-colors shrink-0" />
        </div>
      </div>
    </div>
  )
}
