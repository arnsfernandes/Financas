'use client'

import React from 'react'
import { Store, CalendarDays, ChevronRight } from 'lucide-react'
import { formatBRL } from '@/lib/formatters'
import type { TopVendorItem } from '@/lib/queries'

export interface TopVendorsCardProps {
  topVendors: TopVendorItem[]
  dashboardPeriod?: { startDate?: string; endDate?: string }
  dashboardAccountId: string
  onOpenVendorFiltered: (vendor: string) => void
  onOpenAllVendors: () => void
}

export function TopVendorsCard({
  topVendors,
  onOpenVendorFiltered,
  onOpenAllVendors,
}: TopVendorsCardProps) {
  return (
    <div className="bg-[#151518] sm:bg-white border border-white/[0.06] sm:border-[#EBEEF2] rounded-3xl p-4 sm:p-5 shadow-xs">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-xs sm:text-base font-semibold text-white sm:text-[#111827] flex items-center gap-1.5 sm:gap-2 tracking-tight">
            Transações recentes
          </h2>
          <p className="text-[10px] sm:text-[11px] text-neutral-400 sm:text-[#4B5563]">Principais gastos do período</p>
        </div>
        <button
          onClick={onOpenAllVendors}
          className="text-[11px] sm:text-xs font-medium text-indigo-400 sm:text-[#1D52EB] hover:underline"
        >
          Ver todas
        </button>
      </div>

      {!topVendors || topVendors.length === 0 ? (
        <div className="text-center py-5 text-neutral-400 sm:text-[#6B7280] text-xs">
          Nenhum estabelecimento registrado no período.
        </div>
      ) : (
        <div className="divide-y divide-white/[0.04] sm:divide-[#F4F5F7] max-h-[240px] sm:max-h-[220px] overflow-y-auto pr-1">
          {topVendors.slice(0, 4).map((ven: any, i: number) => {
            return (
              <div
                key={i}
                onClick={() => onOpenVendorFiltered(ven.vendor)}
                className="py-2.5 sm:py-2 flex items-center justify-between gap-3 text-xs cursor-pointer hover:bg-white/[0.03] sm:hover:bg-[#F9FAFB] px-1.5 sm:px-2 -mx-1.5 sm:-mx-2 rounded-xl transition-all group active:scale-[0.99]"
                title={`Filtrar gastos em ${ven.vendor}`}
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  {/* Ícone Outline Circular Discreto estilo Apple */}
                  <div className="w-8 h-8 rounded-full bg-white/[0.06] sm:bg-[#F4F5F7] flex items-center justify-center text-neutral-300 sm:text-[#4B5563] shrink-0 border border-white/[0.04] sm:border-transparent">
                    <Store className="w-3.5 h-3.5 stroke-[1.8]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="font-normal text-white sm:text-[#111827] block truncate group-hover:text-indigo-400 sm:group-hover:text-[#2F68FE] transition-colors text-xs tracking-tight">
                      {ven.vendor}
                    </span>
                    <span className="text-[10px] text-neutral-400 sm:text-[#6B7280] block">
                      {ven.count} {ven.count > 1 ? 'compras' : 'compra'}
                    </span>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <span className="font-light sm:font-bold text-white sm:text-[#111827] block text-xs sm:text-sm tabular-nums tracking-tight">
                    - {formatBRL(ven.total)}
                  </span>
                  <span className="text-[9px] sm:text-[10px] text-neutral-400 sm:text-[#4B5563] font-normal">
                    {ven.percentage}%
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export interface UpcomingCommitmentsCardProps {
  totalUpcoming: number
  onOpenUpcomingModal: () => void
}

export function UpcomingCommitmentsCard({
  totalUpcoming,
  onOpenUpcomingModal,
}: UpcomingCommitmentsCardProps) {
  return (
    <div
      onClick={onOpenUpcomingModal}
      className="cursor-pointer bg-[#151518] sm:bg-white border border-white/[0.06] sm:border-[#EBEEF2] hover:border-indigo-500/40 rounded-3xl p-4 sm:p-5 shadow-xs transition-all hover:shadow-md group flex flex-col justify-between active:scale-[0.99]"
      title="Ver detalhes dos próximos pagamentos"
    >
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-white/[0.06] sm:bg-[#F4F5F7] text-neutral-300 sm:text-[#4B5563] group-hover:bg-indigo-500/20 group-hover:text-indigo-400 flex items-center justify-center transition-colors shrink-0 border border-white/[0.04]">
              <CalendarDays className="w-3.5 h-3.5 stroke-[1.8]" />
            </div>
            <div>
              <span className="text-xs sm:text-sm font-semibold text-white sm:text-[#111827] block tracking-tight">
                Próximos Pagamentos
              </span>
              <p className="text-[10px] sm:text-[11px] text-neutral-400 sm:text-[#6B7280] font-normal">Compromissos para 30 dias</p>
            </div>
          </div>
          <div className="w-6 h-6 rounded-lg flex items-center justify-center text-neutral-400 sm:text-[#6B7280] group-hover:text-white transition-all">
            <ChevronRight className="w-3.5 h-3.5 stroke-[2]" />
          </div>
        </div>

        <div className="mt-2 sm:mt-3">
          <div className="text-xl sm:text-2xl font-light text-white sm:text-[#111827] tabular-nums tracking-tight">
            {formatBRL(totalUpcoming)}
          </div>
        </div>
      </div>

      <div className="mt-2.5 sm:mt-4 pt-2.5 sm:pt-3 border-t border-white/[0.04] sm:border-[#F4F5F7] flex items-center justify-end text-xs">
        <span className="text-indigo-400 sm:text-[#1D52EB] font-normal text-[11px] sm:text-xs group-hover:underline">
          Ver detalhes →
        </span>
      </div>
    </div>
  )
}
