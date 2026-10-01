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
    <div className="bg-white border border-[#EBEEF2] rounded-2xl p-4 sm:p-5 shadow-sm">
      <div className="flex items-center justify-between mb-2.5">
        <div>
          <h2 className="text-sm sm:text-base font-bold text-[#111827] flex items-center gap-2">
            <Store className="w-4 h-4 text-[#4B5563]" />
            Top Estabelecimentos
          </h2>
          <p className="text-[11px] text-[#4B5563]">Onde você mais gastou neste período</p>
        </div>
        <button
          onClick={onOpenAllVendors}
          className="text-xs font-bold text-[#1D52EB] hover:underline"
        >
          Ver todos
        </button>
      </div>

      {!topVendors || topVendors.length === 0 ? (
        <div className="text-center py-4 text-[#6B7280] text-xs">
          Nenhum estabelecimento registrado no período.
        </div>
      ) : (
        <div className="divide-y divide-[#F4F5F7] max-h-[220px] overflow-y-auto pr-1">
          {topVendors.slice(0, 6).map((ven: any, i: number) => {
            const avgTicket = ven.averageTicket || (ven.count > 0 ? Number((ven.total / ven.count).toFixed(2)) : 0)
            return (
              <div
                key={i}
                onClick={() => onOpenVendorFiltered(ven.vendor)}
                className="py-2 flex items-center justify-between gap-3 text-xs cursor-pointer hover:bg-[#F9FAFB] px-2 -mx-2 rounded-lg transition-all group"
                title={`Filtrar gastos em ${ven.vendor}`}
              >
                <div className="min-w-0 flex-1">
                  <span className="font-semibold text-[#111827] block truncate group-hover:text-[#2F68FE] transition-colors">
                    {ven.vendor}
                  </span>
                  <div className="flex items-center gap-2 mt-0.5 text-[10px] text-[#4B5563]">
                    <span>
                      {ven.count} compra{ven.count > 1 ? 's' : ''}
                    </span>
                    <span>•</span>
                    <span>
                      Méd. {formatBRL(avgTicket)}
                    </span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <span className="font-bold text-[#111827] block">
                    {formatBRL(ven.total)}
                  </span>
                  <span className="text-[10px] text-[#4B5563] font-semibold">
                    {ven.percentage}% dos gastos
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
      className="cursor-pointer bg-white border border-[#EBEEF2] hover:border-[#2F68FE]/40 rounded-2xl p-5 shadow-sm transition-all hover:shadow-md group flex flex-col justify-between"
      title="Ver detalhes dos próximos pagamentos"
    >
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-[#F4F5F7] text-[#4B5563] group-hover:bg-[#EBF2FE] group-hover:text-[#2F68FE] flex items-center justify-center transition-colors">
              <CalendarDays className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#4B5563]">
                Próximos Pagamentos
              </span>
              <p className="text-[11px] text-[#6B7280] font-medium">Próximos 30 dias</p>
            </div>
          </div>
          <div className="w-7 h-7 rounded-lg flex items-center justify-center text-[#6B7280] group-hover:text-[#2F68FE] group-hover:bg-[#F4F5F7] transition-all">
            <ChevronRight className="w-4 h-4" />
          </div>
        </div>

        <div className="mt-3">
          <div className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#111827]">
            {formatBRL(totalUpcoming)}
          </div>
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-[#F4F5F7] flex items-center justify-end text-xs text-[#4B5563]">
        <span className="text-[#1D52EB] font-bold group-hover:underline">
          Ver detalhes →
        </span>
      </div>
    </div>
  )
}
