'use client'

import React from 'react'
import {
  X,
  Plus,
  Edit2,
  Trash2,
  AlertTriangle,
} from 'lucide-react'
import type { TransactionRecord } from '@/lib/schema'
import type { DashboardSummary } from '@/lib/queries'
import { formatBRL } from '@/lib/formatters'

export interface CashFlowDrawerProps {
  drawerType: 'income' | 'expense' | null
  onClose: () => void
  dashboardData: DashboardSummary | null
  drawerTxList: TransactionRecord[]
  loadingDrawerTx: boolean
  drawerError: string
  onEditTx: (tx: TransactionRecord) => void
  onDeleteTx: (e: React.MouseEvent, id: string, vendor?: string | null) => void
  deletingTxId: string | null
  onOpenNewLaunch?: (type: 'expense' | 'income') => void
}

export function CashFlowDrawer({
  drawerType,
  onClose,
  dashboardData,
  drawerTxList,
  loadingDrawerTx,
  drawerError,
  onEditTx,
  onDeleteTx,
  deletingTxId,
  onOpenNewLaunch,
}: CashFlowDrawerProps) {
  if (!drawerType) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex justify-end bg-black/40 backdrop-blur-[2px] transition-opacity"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-white h-full shadow-2xl flex flex-col border-l border-[#EBEEF2] animate-in slide-in-from-right duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabeçalho do Drawer */}
        <div className="p-5 border-b border-[#EBEEF2] flex items-center justify-between bg-white sticky top-0 z-10">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
                drawerType === 'income'
                  ? 'bg-emerald-50 text-emerald-600'
                  : 'bg-rose-50 text-rose-600'
              }`}
            >
              {drawerType === 'income' ? '+' : '-'}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-[#111827] truncate">
                  {drawerType === 'income' ? 'Receitas Detalhadas' : 'Despesas Detalhadas'}
                </h2>
                <span className="text-[11px] font-semibold text-[#6B7280] bg-[#F4F5F7] px-2 py-0.5 rounded-lg shrink-0">
                  {dashboardData?.period?.label || 'Período atual'}
                </span>
              </div>
              <p className="text-[11px] text-[#6B7280]">
                {drawerType === 'income'
                  ? 'Entradas registradas no período selecionado'
                  : 'Saídas registradas no período selecionado'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl hover:bg-[#F4F5F7] text-[#9CA3AF] hover:text-[#111827] transition-colors"
              title="Fechar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Resumo no Topo do Drawer */}
        <div className="p-5 bg-[#F9FAFB] border-b border-[#EBEEF2] flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold text-[#6B7280] uppercase tracking-wider block">
              {drawerType === 'income' ? 'Total Recebido' : 'Total Gasto'}
            </span>
            <span
              className={`text-2xl font-extrabold tracking-tight ${
                drawerType === 'income' ? 'text-[#10B981]' : 'text-[#EF4444]'
              }`}
            >
              {formatBRL(
                drawerType === 'income'
                  ? dashboardData?.metrics?.totalIncome ?? 0
                  : dashboardData?.metrics?.totalExpenses ?? dashboardData?.metrics?.totalSpent ?? 0
              )}
            </span>
          </div>
          <div className="text-right">
            <span className="text-[11px] font-semibold text-[#6B7280] uppercase tracking-wider block">
              Lançamentos
            </span>
            <span className="text-base font-bold text-[#111827]">
              {loadingDrawerTx ? '...' : drawerTxList.length}
            </span>
          </div>
        </div>

        {/* Conteúdo da Lista de Lançamentos */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-2">
          {drawerError && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
              <span>{drawerError}</span>
            </div>
          )}

          {loadingDrawerTx ? (
            <div className="text-center py-16 text-[#9CA3AF] text-xs font-medium animate-pulse">
              Carregando lançamentos…
            </div>
          ) : drawerTxList.length === 0 ? (
            <div className="text-center py-16 px-4 border border-dashed border-[#E5E7EB] rounded-2xl bg-[#FAFAFA]">
              <p className="text-xs font-semibold text-[#374151]">Nenhum lançamento encontrado</p>
              <p className="text-[11px] text-[#9CA3AF] mt-1">
                Não há {drawerType === 'income' ? 'receitas' : 'despesas'} cadastradas para o período e conta selecionados.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[#F4F5F7] border border-[#EBEEF2] rounded-2xl bg-white overflow-hidden shadow-sm">
              {drawerTxList.map((tx) => {
                const isIncome = tx.type === 'income'
                const isRecurring = tx.is_recurring
                const isInstallment = tx.installment_total != null && tx.installment_total > 1

                return (
                  <div
                    key={tx.id}
                    onClick={() => onEditTx(tx)}
                    className="p-3.5 hover:bg-[#F9FAFB] cursor-pointer transition-colors flex items-center justify-between gap-3 group"
                    title="Clique para editar este lançamento"
                  >
                    {/* Lado Esquerdo: Identificação compacta */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-[#111827] group-hover:text-[#2F68FE] transition-colors truncate">
                          {tx.canonical_vendors?.canonical_name || tx.vendor || (isIncome ? 'Receita sem pagador' : 'Despesa sem local')}
                        </span>
                        {isRecurring && (
                          <span className="text-[9px] px-1.5 py-0.2 rounded font-medium bg-blue-50 text-blue-700 border border-blue-200 shrink-0">
                            Recorrente
                          </span>
                        )}
                        {isInstallment && (
                          <span className="text-[9px] px-1.5 py-0.2 rounded font-medium bg-amber-50 text-amber-700 border border-amber-200 shrink-0">
                            {tx.installment_current || 1}/{tx.installment_total}x
                          </span>
                        )}
                      </div>

                      {/* Metadados: Categoria • Data • Conta */}
                      <div className="flex items-center gap-1.5 text-[11px] text-[#6B7280] mt-1 flex-wrap">
                        <span className="font-medium text-[#374151]">
                          {tx.category || 'Geral'}
                        </span>
                        <span>•</span>
                        <span>
                          {tx.date
                            ? new Date(tx.date + 'T00:00:00').toLocaleDateString('pt-BR')
                            : new Date(tx.created_at).toLocaleDateString('pt-BR')}
                        </span>
                        {tx.accounts && (
                          <>
                            <span>•</span>
                            <span className="text-[#9CA3AF] truncate max-w-[120px]">
                              {tx.accounts.name}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Lado Direito: Valor e Ações Rápidas */}
                    <div className="flex items-center gap-2.5 shrink-0">
                      <span
                        className={`text-xs sm:text-sm font-bold whitespace-nowrap ${
                          isIncome ? 'text-[#10B981]' : 'text-[#111827]'
                        }`}
                      >
                        {isIncome ? '+' : '-'} {formatBRL(tx.total)}
                      </span>

                      <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            onEditTx(tx)
                          }}
                          className="p-1 rounded-lg hover:bg-white text-[#6B7280] hover:text-[#2F68FE] hover:shadow-sm border border-transparent hover:border-[#EBEEF2] transition-all"
                          title="Editar"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => onDeleteTx(e, tx.id, tx.vendor)}
                          disabled={deletingTxId === tx.id}
                          className="p-1 rounded-lg hover:bg-red-50 text-[#9CA3AF] hover:text-red-600 transition-colors disabled:opacity-40"
                          title="Excluir"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Rodapé do Drawer com Botão Contextual de Novo Lançamento */}
        <div className="p-4 border-t border-[#EBEEF2] bg-[#F9FAFB] flex items-center justify-between gap-3">
          <button
            onClick={onClose}
            className="py-2 px-3.5 rounded-xl border border-[#E5E7EB] bg-white text-xs font-semibold text-[#374151] hover:bg-[#F3F4F6] transition-colors"
          >
            Fechar
          </button>

          <button
            onClick={() => {
              const typeToAdd = drawerType
              onClose()
              if (onOpenNewLaunch) {
                onOpenNewLaunch(typeToAdd)
              }
            }}
            className={`flex-1 py-2.5 px-4 rounded-xl text-white font-semibold text-xs transition-colors flex items-center justify-center gap-1.5 shadow-sm ${
              drawerType === 'income'
                ? 'bg-[#10B981] hover:bg-[#059669]'
                : 'bg-[#2F68FE] hover:bg-[#2557D6]'
            }`}
          >
            <Plus className="w-4 h-4" />
            {drawerType === 'income' ? '+ Adicionar Receita' : '+ Adicionar Despesa'}
          </button>
        </div>
      </div>
    </div>
  )
}
