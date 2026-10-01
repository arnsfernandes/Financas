'use client'

import React from 'react'
import {
  PiggyBank,
  Plus,
  Loader2,
  Target,
  ChevronRight,
} from 'lucide-react'
import type { Reserve } from '@/lib/reserves'
import { formatBRL } from '@/lib/formatters'

export interface ReservesSectionProps {
  reserves: Reserve[]
  loadingReserves: boolean
  totalSaved: number
  reservesError: string
  fetchReserves: () => void
  onOpenCreateModal: () => void
  onOpenReserveDetails: (reserve: Reserve) => void
}

export function ReservesSection({
  reserves,
  loadingReserves,
  totalSaved,
  reservesError,
  fetchReserves,
  onOpenCreateModal,
  onOpenReserveDetails,
}: ReservesSectionProps) {
  return (
    <div className="space-y-6 pt-4 border-t border-[#EBEEF2]">
      {/* Header da Seção de Reservas */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <PiggyBank className="w-4 h-4" />
            </div>
            <h2 className="text-xl font-bold tracking-tight text-[#111827]">Reservas</h2>
          </div>
          <p className="text-xs text-[#6B7280] mt-1">
            Controle seu dinheiro guardado e metas sem misturar com receitas e despesas.
          </p>
        </div>

        <div className="flex items-center gap-3 self-start sm:self-auto">
          {/* Total Guardado Card/Pill */}
          <div className="px-3.5 py-1.5 rounded-xl bg-emerald-50 border border-emerald-300 flex items-center gap-2 shadow-xs">
            <span className="text-xs font-semibold text-emerald-900">Total guardado:</span>
            <span className="text-sm font-bold text-emerald-800 tracking-tight">
              {formatBRL(totalSaved)}
            </span>
          </div>

          <button
            type="button"
            onClick={onOpenCreateModal}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#0F172A] hover:bg-[#1E293B] active:bg-[#020617] text-white text-xs font-semibold shadow-sm border border-slate-700/50 transition-all focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-1"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Nova Reserva</span>
          </button>
        </div>
      </div>

      {/* Alerta de Erro de Carregamento de Reservas */}
      {reservesError && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-xs text-rose-700 flex items-center justify-between">
          <span>{reservesError}</span>
          <button
            type="button"
            onClick={fetchReserves}
            className="text-xs font-semibold underline hover:no-underline ml-2"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {/* Cards das Reservas */}
      {loadingReserves && reserves.length === 0 ? (
        <div className="bg-white border border-[#EBEEF2] rounded-2xl p-8 text-center text-xs text-[#9CA3AF]">
          <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-emerald-600" />
          Carregando reservas...
        </div>
      ) : reserves.length === 0 ? (
        <div className="bg-white border border-[#EBEEF2] rounded-2xl p-10 text-center space-y-3">
          <PiggyBank className="w-10 h-10 text-[#9CA3AF] mx-auto stroke-1" />
          <h3 className="text-sm font-bold text-[#111827]">Nenhuma reserva criada ainda</h3>
          <p className="text-xs text-[#6B7280] max-w-sm mx-auto">
            Crie reservas para emergência, viagens, objetivos ou compras futuras sem distorcer o fluxo de caixa.
          </p>
          <button
            type="button"
            onClick={onOpenCreateModal}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Criar primeira reserva</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {reserves.map((res) => {
            const hasTarget = Boolean(res.targetAmount && res.targetAmount > 0)
            const percentage = hasTarget
              ? Math.min(100, Math.round(((res.currentBalance || 0) / res.targetAmount!) * 100))
              : null

            return (
              <div
                key={res.id}
                onClick={() => onOpenReserveDetails(res)}
                className="group bg-white border border-[#EBEEF2] hover:border-emerald-500/50 hover:shadow-md rounded-2xl p-5 transition-all cursor-pointer flex flex-col justify-between gap-4 relative overflow-hidden"
              >
                {/* Linha discreta de destaque no topo */}
                <div className="h-1 w-full absolute top-0 left-0 bg-emerald-500" />

                <div>
                  {/* Topo do Card */}
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-emerald-50 group-hover:bg-emerald-600 text-emerald-600 group-hover:text-white flex items-center justify-center shrink-0 transition-colors">
                        <Target className="w-4 h-4" />
                      </div>
                      <h3 className="font-bold text-sm text-[#111827] group-hover:text-emerald-700 transition-colors truncate">
                        {res.name}
                      </h3>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-100/80 text-emerald-900 border border-emerald-300">
                        Reserva
                      </span>
                      {hasTarget && (
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-700 text-white shadow-xs">
                          {percentage}%
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Saldo Atual */}
                  <div className="mt-3">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 block">
                      Saldo Guardado
                    </span>
                    <div className="text-xl font-bold text-slate-900 tracking-tight mt-0.5">
                      {formatBRL(res.currentBalance || 0)}
                    </div>
                  </div>

                  {/* Meta Opcional & Barra de Progresso */}
                  {hasTarget ? (
                    <div className="mt-3 pt-3 border-t border-slate-100 space-y-1.5">
                      <div className="flex items-center justify-between text-xs text-slate-600">
                        <span className="font-medium">Meta: {formatBRL(res.targetAmount!)}</span>
                        <span className="font-bold text-emerald-800">{percentage}% atingido</span>
                      </div>
                      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-600 rounded-full transition-all duration-300"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 pt-3 border-t border-slate-100">
                      <span className="text-xs font-medium text-slate-500">Sem meta estipulada</span>
                    </div>
                  )}
                </div>

                {/* Rodapé do Card */}
                <div className="pt-2 flex items-center justify-between text-xs text-slate-600 group-hover:text-emerald-800 transition-colors border-t border-slate-100">
                  <span className="text-[11px] font-medium text-slate-500">
                    {res.movements.length} {res.movements.length === 1 ? 'movimentação' : 'movimentações'}
                  </span>
                  <span className="inline-flex items-center gap-1 font-bold text-[11px] text-emerald-700 group-hover:text-emerald-900">
                    Ver detalhes
                    <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform stroke-[2.5]" />
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
