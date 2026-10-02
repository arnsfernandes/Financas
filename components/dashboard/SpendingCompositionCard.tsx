'use client'

import React from 'react'
import { formatBRL } from '@/lib/formatters'
import type { TopCategoryItem } from '@/lib/queries'

export interface SpendingCompositionCardProps {
  topCategories: TopCategoryItem[]
  totalExpenses: number
  expenseTransactionCount: number
  onOpenCategoryDetail: (cat: TopCategoryItem) => void
}

export function SpendingCompositionCard({
  topCategories,
  totalExpenses,
  expenseTransactionCount,
  onOpenCategoryDetail,
}: SpendingCompositionCardProps) {
  const colors = [
    '#6366F1', // Indigo suave
    '#10B981', // Verde esmeralda
    '#F59E0B', // Âmbar
    '#EC4899', // Rosa
    '#8B5CF6', // Roxo suave
    '#71717A', // Cinza neutro
  ]

  return (
    <div className="lg:col-span-6 bg-[#151518] sm:bg-white border border-white/[0.06] sm:border-[#EBEEF2] rounded-3xl p-4 sm:p-5 shadow-xs flex flex-col h-full justify-between">
      <div>
        <div className="flex items-center justify-between gap-1.5 mb-3">
          <div>
            <h2 className="text-xs sm:text-base font-semibold text-white sm:text-[#111827] tracking-tight">Onde você gastou</h2>
            <p className="text-[10px] sm:text-[11px] text-neutral-400 sm:text-[#4B5563]">Distribuição por categoria</p>
          </div>
        </div>

        {!topCategories || topCategories.length === 0 ? (
          <div className="text-center py-6 text-neutral-400 sm:text-[#6B7280] text-xs">
            Nenhuma despesa categorizada neste período.
          </div>
        ) : (
          (() => {
            const allCategories = topCategories || []
            const top5 = allCategories.slice(0, 5)
            const rest = allCategories.slice(5)

            const donutSegments: any[] = top5.map((cat: any, i: number) => ({
              name: cat.category,
              total: cat.total,
              color: cat.color || colors[i % colors.length],
            }))

            if (rest.length > 0) {
              const restTotal = rest.reduce((sum: number, c: any) => sum + (Number(c.total) || 0), 0)
              donutSegments.push({
                name: 'Outros',
                total: Number(restTotal.toFixed(2)),
                color: '#71717A',
              })
            }

            let cumulativeAngle = 0
            const donutSlices = donutSegments.map((seg: any) => {
              const pct = totalExpenses > 0 ? (seg.total / totalExpenses) * 100 : 0
              const angle = (pct / 100) * 360
              const start = cumulativeAngle
              cumulativeAngle += angle
              return {
                ...seg,
                percentage: Number(pct.toFixed(1)),
                startAngle: start,
                endAngle: cumulativeAngle,
              }
            })

            const conicGradientParts = donutSlices.map((seg: any) => `${seg.color} ${seg.startAngle}deg ${seg.endAngle}deg`)
            const conicStyle = {
              background: `conic-gradient(${conicGradientParts.join(', ')})`,
            }

            return (
              <div className="flex flex-col sm:flex-row gap-4 sm:gap-5 items-center sm:items-start pt-1">
                {/* Donut Chart apenas no Desktop (oculto no mobile) */}
                <div className="hidden sm:flex shrink-0 flex-col items-center justify-center pt-0.5">
                  <div className="relative w-36 h-36 rounded-full flex items-center justify-center p-2.5 shadow-inner" style={conicStyle}>
                    <div className="w-24 h-24 bg-white rounded-full flex flex-col items-center justify-center p-1 text-center shadow-xs">
                      <span className="text-[9px] font-semibold uppercase tracking-wider text-[#4B5563]">
                        Total
                      </span>
                      <span className="text-sm font-extrabold text-[#111827] tracking-tight mt-0.5">
                        {formatBRL(totalExpenses)}
                      </span>
                      <span className="text-[9px] text-[#6B7280] font-medium">
                        {expenseTransactionCount} lançamentos
                      </span>
                    </div>
                  </div>
                </div>

                {/* Lista Compacta de Categorias no Mobile estilo Apple */}
                <div className="w-full space-y-2 min-w-0">
                  <div className="space-y-1.5 max-h-[260px] sm:max-h-[210px] overflow-y-auto pr-0.5">
                    {allCategories.slice(0, 5).map((cat: any, i: number) => {
                      const pct = cat.percentage ?? (totalExpenses > 0 ? Number(((cat.total / totalExpenses) * 100).toFixed(1)) : 0)
                      const catColor = cat.color || colors[i % colors.length]
                      return (
                        <button
                          key={i}
                          type="button"
                          onClick={() => onOpenCategoryDetail(cat)}
                          className="w-full flex flex-col py-1.5 px-2 rounded-xl hover:bg-white/[0.03] sm:hover:bg-[#F9FAFB] border border-transparent transition-all text-left group active:scale-[0.99]"
                          title={`Ver detalhes de ${cat.category}`}
                        >
                          <div className="w-full flex items-center justify-between gap-2 text-xs">
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <span
                                className="w-1.5 h-1.5 rounded-full shrink-0"
                                style={{ backgroundColor: catColor }}
                              />
                              <span className="font-normal text-white sm:text-[#111827] group-hover:text-indigo-400 sm:group-hover:text-[#2F68FE] transition-colors truncate text-xs tracking-tight">
                                {cat.category}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="font-light sm:font-semibold text-white sm:text-[#111827] text-xs tabular-nums">
                                {formatBRL(cat.total)}
                              </span>
                              <span className="text-[10px] font-normal text-neutral-400 min-w-[28px] text-right">
                                {pct}%
                              </span>
                            </div>
                          </div>

                          {/* Barra horizontal fina e proporcional */}
                          <div className="w-full h-1 bg-white/[0.06] sm:bg-[#F4F5F7] rounded-full mt-1.5 overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-300"
                              style={{
                                width: `${Math.min(100, Math.max(2, pct))}%`,
                                backgroundColor: catColor,
                              }}
                            />
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            )
          })()
        )}
      </div>
    </div>
  )
}
