'use client'

import React from 'react'
import {
  X,
  Store,
  ShoppingBag,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
} from 'lucide-react'
import { formatBRL } from '@/lib/formatters'
import type { TopCategoryItem } from '@/lib/queries'
import type { TransactionRecord } from '@/lib/schema'

export interface CategoryDetailPanelProps {
  category: TopCategoryItem | {
    category: string
    total: number
    percentage: number
    count: number
    averageTicket?: number
    differencePercentage?: number | null
    previousTotal?: number | null
  } | null
  onClose: () => void
  categoryTxList: TransactionRecord[]
  loadingCategoryTx: boolean
  categoryTxError: string
  onEditTx: (tx: TransactionRecord) => void
}

export function CategoryDetailPanel({
  category,
  onClose,
  categoryTxList,
  loadingCategoryTx,
  categoryTxError,
  onEditTx,
}: CategoryDetailPanelProps) {
  if (!category) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-stretch sm:justify-end bg-black/40 backdrop-blur-xs transition-opacity"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-none h-[90vh] sm:h-full shadow-2xl flex flex-col sm:border-l border-[#EBEEF2] overflow-hidden animate-in slide-in-from-bottom sm:slide-in-from-right duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile Grab Handle */}
        <div className="sm:hidden pt-2.5 pb-1 bg-white flex justify-center shrink-0">
          <div className="w-10 h-1 bg-slate-300 rounded-full" />
        </div>

        {/* Cabeçalho do Painel */}
        <div className="p-4 sm:p-5 border-b border-[#EBEEF2] flex items-center justify-between bg-white sticky top-0 z-10">
          <div className="min-w-0 flex-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#6B7280] block mb-0.5">
              Detalhamento de Categoria
            </span>
            <h2 className="text-lg sm:text-xl font-bold text-[#111827] truncate">
              {category.category}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-xl text-[#9CA3AF] hover:text-[#111827] hover:bg-[#F4F5F7] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Resumo de Métricas Principais da Categoria */}
        <div className="p-5 bg-[#F9FAFB] border-b border-[#EBEEF2] grid grid-cols-2 gap-3">
          <div className="p-3 bg-white border border-[#EBEEF2] rounded-xl">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280] block">
              Total no Período
            </span>
            <span className="text-lg font-extrabold text-[#111827] block mt-0.5">
              {formatBRL(category.total)}
            </span>
            <span className="text-[11px] font-semibold text-[#2F68FE] mt-0.5 block">
              {category.percentage}% dos gastos totais
            </span>
          </div>

          <div className="p-3 bg-white border border-[#EBEEF2] rounded-xl">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280] block">
              Compras & Média
            </span>
            <span className="text-lg font-extrabold text-[#111827] block mt-0.5">
              {category.count} {category.count === 1 ? 'compra' : 'compras'}
            </span>
            <span className="text-[11px] text-[#4B5563] font-medium mt-0.5 block">
              Ticket médio: {formatBRL(category.averageTicket || (category.count > 0 ? category.total / category.count : 0))}
            </span>
          </div>

          {/* Variação vs período anterior se disponível */}
          {category.differencePercentage !== undefined && category.differencePercentage !== null && (
            <div className="col-span-2 p-3 bg-white border border-[#EBEEF2] rounded-xl flex items-center justify-between">
              <span className="text-xs font-semibold text-[#374151]">
                Variação vs período anterior:
              </span>
              <div className="flex items-center gap-1.5 text-xs">
                {category.differencePercentage > 0 ? (
                  <span className="inline-flex items-center gap-0.5 text-rose-600 font-bold">
                    <TrendingUp className="w-3.5 h-3.5" />
                    +{category.differencePercentage}%
                  </span>
                ) : category.differencePercentage < 0 ? (
                  <span className="inline-flex items-center gap-0.5 text-emerald-600 font-bold">
                    <TrendingDown className="w-3.5 h-3.5" />
                    {category.differencePercentage}%
                  </span>
                ) : (
                  <span className="text-[#374151] font-bold">0% (estável)</span>
                )}
                <span className="text-[11px] text-[#6B7280]">
                  (anterior: {formatBRL(category.previousTotal || 0)})
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Conteúdo Rolável: Principais Estabelecimentos + Últimas Transações */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5">
          {/* 1. Principais Estabelecimentos na Categoria */}
          {(() => {
            const categoryVendorsMap: Record<string, { total: number; count: number }> = {}
            for (const tx of categoryTxList) {
              const ven = tx.canonical_vendors?.canonical_name || tx.vendor || 'Não Identificado'
              if (!categoryVendorsMap[ven]) categoryVendorsMap[ven] = { total: 0, count: 0 }
              categoryVendorsMap[ven].total += Number(tx.total) || 0
              categoryVendorsMap[ven].count += 1
            }
            const topCatVendors = Object.entries(categoryVendorsMap)
              .map(([vendor, info]) => ({ vendor, ...info }))
              .sort((a, b) => b.total - a.total)
              .slice(0, 4)

            if (topCatVendors.length === 0) return null

            return (
              <div>
                <h3 className="text-xs font-bold text-[#111827] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Store className="w-3.5 h-3.5 text-[#4B5563]" />
                  Principais Estabelecimentos
                </h3>
                <div className="divide-y divide-[#F4F5F7] border border-[#EBEEF2] rounded-xl bg-white overflow-hidden shadow-sm">
                  {topCatVendors.map((item, idx) => (
                    <div key={idx} className="p-2.5 flex items-center justify-between text-xs hover:bg-[#F9FAFB]">
                      <div className="min-w-0 flex-1">
                        <span className="font-semibold text-[#111827] block truncate">
                          {item.vendor}
                        </span>
                        <span className="text-[10px] text-[#4B5563] font-medium">
                          {item.count} compra{item.count > 1 ? 's' : ''}
                        </span>
                      </div>
                      <span className="font-bold text-[#111827] shrink-0">
                        {formatBRL(item.total)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}

          {/* 2. Últimas Transações da Categoria */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-bold text-[#111827] uppercase tracking-wider flex items-center gap-1.5">
                <ShoppingBag className="w-3.5 h-3.5 text-[#4B5563]" />
                Últimas Transações
              </h3>
              <span className="text-[11px] text-[#4B5563] font-medium">
                {categoryTxList.length} lançamento{categoryTxList.length !== 1 ? 's' : ''}
              </span>
            </div>

            {categoryTxError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                <span>{categoryTxError}</span>
              </div>
            )}

            {loadingCategoryTx ? (
              <div className="text-center py-10 text-[#4B5563] text-xs font-medium animate-pulse">
                Carregando transações da categoria…
              </div>
            ) : categoryTxList.length === 0 ? (
              <div className="text-center py-10 px-4 border border-dashed border-[#E5E7EB] rounded-2xl bg-[#FAFAFA]">
                <p className="text-xs font-semibold text-[#111827]">Nenhuma transação encontrada</p>
                <p className="text-[11px] text-[#6B7280] mt-1">
                  Não há transações cadastradas para esta categoria no período selecionado.
                </p>
              </div>
            ) : (
              <div className="border border-[#EBEEF2] rounded-2xl bg-white overflow-hidden shadow-sm divide-y divide-[#F4F5F7] max-h-[300px] overflow-y-auto pr-0.5">
                {categoryTxList.map((tx) => {
                  const displayDate = tx.date
                    ? new Date(tx.date + 'T00:00:00').toLocaleDateString('pt-BR')
                    : new Date(tx.created_at).toLocaleDateString('pt-BR')

                  const displayVendor = tx.canonical_vendors?.canonical_name || tx.vendor || 'Sem estabelecimento'

                  return (
                    <div
                      key={tx.id}
                      onClick={() => onEditTx(tx)}
                      className="p-3 hover:bg-[#F9FAFB] cursor-pointer transition-colors flex items-center justify-between gap-3 text-xs group"
                      title="Clique para editar"
                    >
                      <div className="min-w-0 flex-1">
                        <span className="font-semibold text-[#111827] block truncate group-hover:text-[#2F68FE] transition-colors">
                          {displayVendor}
                        </span>
                        <span className="text-[11px] text-[#4B5563] block mt-0.5">
                          {displayDate}
                        </span>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="font-bold text-[#DC2626] block">
                          -{formatBRL(tx.total)}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Rodapé do Painel */}
        <div className="p-4 pb-[max(1rem,env(safe-area-inset-bottom,0px))] border-t border-[#EBEEF2] bg-[#F9FAFB] flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 px-4 rounded-xl border border-[#E5E7EB] bg-white text-xs font-semibold text-[#374151] hover:bg-[#F3F4F6] transition-colors text-center"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}
