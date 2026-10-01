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
    '#2F68FE', // Azul Copilot
    '#10B981', // Verde
    '#F59E0B', // Âmbar
    '#EC4899', // Rosa
    '#8B5CF6', // Roxo suave
    '#94A3B8', // Cinza slate para 'Outros'
  ]

  return (
    <div className="lg:col-span-6 bg-white border border-[#EBEEF2] rounded-2xl p-5 shadow-sm flex flex-col h-full justify-between">
      <div>
        <div className="flex items-center justify-between gap-1.5 mb-3">
          <div>
            <h2 className="text-sm sm:text-base font-bold text-[#111827]">Composição dos Gastos</h2>
            <p className="text-[11px] text-[#4B5563]">Distribuição por categoria</p>
          </div>
        </div>

        {!topCategories || topCategories.length === 0 ? (
          <div className="text-center py-12 text-[#6B7280] text-xs">
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
                color: '#94A3B8',
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
              <div className="flex flex-col sm:flex-row gap-5 items-center sm:items-start pt-1">
                {/* Donut Chart Compacto com Total ao Centro (Top 5 + Outros) */}
                <div className="shrink-0 flex flex-col items-center justify-center pt-1">
                  <div className="relative w-36 h-36 rounded-full flex items-center justify-center p-2.5 shadow-inner" style={conicStyle}>
                    <div className="w-24 h-24 bg-white rounded-full flex flex-col items-center justify-center p-1.5 text-center shadow-sm">
                      <span className="text-[9px] font-semibold uppercase tracking-wider text-[#4B5563]">
                        Total Gasto
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

                {/* Lista das Categorias com barra horizontal discreta de proporção */}
                <div className="w-full space-y-1 min-w-0">
                  <div className="text-[10px] text-[#4B5563] font-semibold pb-1 flex justify-between uppercase tracking-wider border-b border-[#F4F5F7]">
                    <span>Categoria</span>
                    <span>Total</span>
                  </div>
                  <div className="space-y-1.5 max-h-[230px] overflow-y-auto pr-1">
                    {allCategories.map((cat: any, i: number) => {
                      const pct = cat.percentage ?? (totalExpenses > 0 ? Number(((cat.total / totalExpenses) * 100).toFixed(1)) : 0)
                      const catColor = cat.color || colors[i % colors.length]
                      return (
                        <button
                          key={i}
                          type="button"
                          onClick={() => onOpenCategoryDetail(cat)}
                          className="w-full flex flex-col py-1.5 px-2 rounded-lg hover:bg-[#F9FAFB] border border-transparent hover:border-[#EBEEF2] transition-all text-left group"
                          title={`Ver detalhes de ${cat.category}`}
                        >
                          <div className="w-full flex items-center justify-between gap-2 text-xs">
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <span
                                className="w-2 h-2 rounded-full shrink-0"
                                style={{ backgroundColor: catColor }}
                              />
                              <span className="font-medium text-[#111827] group-hover:text-[#2F68FE] transition-colors truncate">
                                {cat.category}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="font-semibold text-[#111827]">
                                {formatBRL(cat.total)}
                              </span>
                              <span className="text-[10px] font-semibold text-[#374151] bg-[#F4F5F7] px-1.5 py-0.2 rounded min-w-[34px] text-right border border-[#E5E7EB]/70">
                                {pct}%
                              </span>
                            </div>
                          </div>

                          <div className="w-full h-1 bg-[#F4F5F7] rounded-full mt-1.5 overflow-hidden">
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
