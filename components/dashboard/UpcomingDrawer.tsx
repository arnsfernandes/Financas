'use client'

import React, { useState } from 'react'
import {
  X,
  CreditCard,
  CalendarDays,
  ChevronDown,
  Repeat,
  Edit2,
  Trash2,
} from 'lucide-react'
import { formatBRL } from '@/lib/formatters'
import { InstitutionLogo } from '@/components/accounts/InstitutionLogo'
import type { DashboardSummary } from '@/lib/queries'
import type { TransactionRecord } from '@/lib/schema'

export interface UpcomingDrawerProps {
  isOpen: boolean
  onClose: () => void
  dashboardData: DashboardSummary | null
  onEditTx: (tx: TransactionRecord) => void
  onDeleteCommitment: (e: React.MouseEvent, id: string, name: string) => void
  deletingCommitmentId: string | null
}

export function UpcomingDrawer({
  isOpen,
  onClose,
  dashboardData,
  onEditTx,
  onDeleteCommitment,
  deletingCommitmentId,
}: UpcomingDrawerProps) {
  const [expandedInvoices, setExpandedInvoices] = useState<Record<string, boolean>>({})

  if (!isOpen) return null

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

        {/* Cabeçalho do Drawer */}
        <div className="p-4 sm:p-5 border-b border-[#EBEEF2] flex items-center justify-between bg-white sticky top-0 z-10">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 bg-[#EBF2FE] text-[#2F68FE]">
              <CalendarDays className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-base text-[#111827] truncate">
                Próximos Pagamentos
              </h3>
              <p className="text-xs text-[#6B7280]">
                Próximos 30 dias • Total:{' '}
                {formatBRL(
                  dashboardData?.allUpcoming?.length
                    ? dashboardData.allUpcoming.reduce((sum: number, it: any) => sum + (Number(it.amount) || 0), 0)
                    : (dashboardData?.forecastTotal30Days || 0)
                )}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-[#6B7280] hover:text-[#111827] hover:bg-[#F3F4F6] transition-colors"
            title="Fechar painel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Lista detalhada */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3">
          {(!dashboardData?.allUpcoming || dashboardData.allUpcoming.length === 0) ? (
            <div className="text-center py-16 text-[#9CA3AF] text-xs">
              Nenhum pagamento previsto para os próximos 30 dias.
            </div>
          ) : (
            dashboardData.allUpcoming.map((item: any) => {
              const isCardInvoice = item.kind === 'card_invoice'
              const isInst = item.kind === 'installment'
              const isRec = item.kind === 'recurring'
              const isExpanded = Boolean(expandedInvoices[item.id])

              // 1. FATURA CONSOLIDADA DE CARTÃO DE CRÉDITO
              if (isCardInvoice) {
                return (
                  <div
                    key={item.id}
                    className="bg-white border border-[#E5E7EB] rounded-xl overflow-hidden shadow-sm hover:border-[#D1D5DB] transition-all flex flex-col"
                  >
                    <div className="p-4 flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <InstitutionLogo
                          institution={item.accountName || item.title}
                          accountName={item.title}
                          accountType="credit_card"
                          size="md"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="font-semibold text-sm text-[#111827]">
                              {item.title}
                            </span>
                            <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md bg-[#2F68FE]/10 text-[#2F68FE] font-medium border border-[#2F68FE]/20">
                              <CreditCard className="w-3 h-3" />
                              Fatura de Cartão
                            </span>
                            {item.dueDayLabel && (
                              <span className="inline-flex items-center text-[10px] px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200">
                                {item.dueDayLabel}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2 text-xs text-[#6B7280] flex-wrap mt-0.5">
                            <span className="font-medium text-[#374151]">
                              Vencimento: {item.date ? new Date(item.date + 'T00:00:00').toLocaleDateString('pt-BR') : 'Data não informada'}
                            </span>
                            <span>•</span>
                            <span>{item.accountName || 'Cartão de Crédito'}</span>
                            <span>•</span>
                            <span>{item.invoiceItems?.length || 0} compras / parcelas</span>
                          </div>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="font-bold text-base text-[#EF4444] block">
                          -{formatBRL(item.amount)}
                        </span>
                      </div>
                    </div>

                    {/* Botão para alternar detalhes da fatura */}
                    <div className="px-4 py-2 bg-[#F9FAFB] border-t border-[#EBEEF2] flex items-center justify-between text-xs">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedInvoices((prev) => ({
                            ...prev,
                            [item.id]: !prev[item.id],
                          }))
                        }
                        className="text-[#1D52EB] hover:text-[#1D4ED8] font-bold flex items-center gap-1.5 transition-colors"
                      >
                        <span>{isExpanded ? 'Ocultar compras da fatura' : `Ver compras da fatura (${item.invoiceItems?.length || 0})`}</span>
                        <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                      </button>
                      <span className="text-[11px] text-[#4B5563] font-medium">
                        Consolidado na fatura
                      </span>
                    </div>

                    {/* Itens detalhados que compõem a fatura */}
                    {isExpanded && item.invoiceItems && item.invoiceItems.length > 0 && (
                      <div className="border-t border-[#EBEEF2] divide-y divide-[#F3F4F6] bg-white">
                        {item.invoiceItems.map((invItem: any) => (
                          <div
                            key={invItem.id}
                            className="px-4 py-2.5 flex items-center justify-between gap-3 text-xs hover:bg-[#F9FAFB] transition-colors"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-semibold text-[#111827] truncate">
                                  {invItem.vendor || 'Compra sem nome'}
                                </span>
                                {invItem.installmentInfo && (
                                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-50 text-amber-800 border border-amber-300 font-semibold">
                                    {invItem.installmentInfo.current}/{invItem.installmentInfo.total}
                                  </span>
                                )}
                                <span className="text-[10px] text-[#4B5563] font-medium">
                                  {invItem.category || 'Geral'}
                                </span>
                              </div>
                              <div className="text-[11px] text-[#4B5563] mt-0.5">
                                Data da compra: {invItem.date ? new Date(invItem.date + 'T00:00:00').toLocaleDateString('pt-BR') : 'Data não informada'}
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <span className="font-semibold text-[#111827]">
                                {formatBRL(invItem.amount)}
                              </span>
                              {invItem.rawTx && (
                                <button
                                  type="button"
                                  onClick={() => onEditTx(invItem.rawTx)}
                                  className="p-1 text-[#4B5563] hover:text-[#2F68FE] hover:bg-[#EBF2FE] rounded transition-colors"
                                  title="Editar esta compra"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              }

              // 2. DESPESAS FIXAS / RECORRENTES & COMPROMISSOS INDIVIDUAIS
              return (
                <div
                  key={item.id}
                  className="bg-white border border-[#EBEEF2] rounded-xl p-3.5 shadow-sm hover:border-[#D1D5DB] transition-all flex flex-col gap-2.5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <InstitutionLogo
                        institution={item.accountName}
                        accountName={item.title || item.vendor}
                        accountType={item.accountType}
                        size="md"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="font-semibold text-sm text-[#111827] truncate">
                            {item.title || item.vendor || 'Compromisso'}
                          </span>
                          {item.dueDayLabel && (
                            <span className="inline-flex items-center text-[10px] px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 font-semibold border border-blue-200">
                              {item.dueDayLabel}
                            </span>
                          )}
                          {isInst && item.installmentInfo && (
                            <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200 font-medium">
                              <CreditCard className="w-3 h-3" />
                              Parcela {item.installmentInfo.current}/{item.installmentInfo.total}
                            </span>
                          )}
                          {isRec && (
                            <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 border border-purple-200 font-medium">
                              <Repeat className="w-3 h-3" />
                              Recorrência
                            </span>
                          )}
                          {item.isEstimated && (
                            <span className="inline-flex items-center text-[10px] px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-300 font-medium">
                              Valor estimado
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2 text-xs text-[#6B7280] flex-wrap">
                          <span className="font-medium text-[#374151]">
                            Vencimento: {item.date ? new Date(item.date + 'T00:00:00').toLocaleDateString('pt-BR') : 'Data não informada'}
                          </span>
                          <span>•</span>
                          <span>{item.accountName || 'Conta não definida'}</span>
                          <span>•</span>
                          <span className="px-1.5 py-0.5 rounded bg-[#F4F5F7] text-[#4B5563] text-[11px]">
                            {item.category || 'Outros'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="font-bold text-sm text-[#EF4444] block">
                        -{formatBRL(item.amount)}
                      </span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-[#F4F5F7] flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const raw = item.rawTx || {
                          id: item.id,
                          type: 'expense',
                          vendor: item.vendor || item.title,
                          total: item.amount,
                          date: item.date,
                          category: item.category,
                          account_id: item.rawTx?.account_id,
                          installment_group_id: item.installmentInfo?.groupId,
                          installment_current: item.installmentInfo?.current,
                          installment_total: item.installmentInfo?.total,
                          is_recurring: isRec,
                          recurrence_frequency: item.frequency,
                        }
                        onEditTx(raw)
                      }}
                      className="px-2.5 py-1 text-xs font-medium text-[#2F68FE] bg-[#EBF2FE] hover:bg-[#DDE9FD] rounded-lg transition-colors flex items-center gap-1.5"
                      title="Visualizar ou atualizar valor real"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                      {item.isEstimated ? 'Lançar valor real / Editar' : 'Visualizar / Editar'}
                    </button>

                    <button
                      type="button"
                      disabled={deletingCommitmentId === item.id}
                      onClick={(e) => onDeleteCommitment(e, item.id, item.title || item.vendor)}
                      className="px-2.5 py-1 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50"
                      title="Excluir este compromisso"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      {deletingCommitmentId === item.id ? 'Excluindo…' : 'Excluir'}
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Rodapé do Drawer */}
        <div className="p-4 pb-[max(1rem,env(safe-area-inset-bottom,0px))] border-t border-[#EBEEF2] bg-[#F9FAFB] flex items-center justify-between gap-3">
          <button
            onClick={onClose}
            className="w-full sm:w-auto py-2.5 px-5 rounded-xl border border-[#E5E7EB] bg-white text-xs font-semibold text-[#374151] hover:bg-[#F3F4F6] transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}
