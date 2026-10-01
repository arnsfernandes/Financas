'use client'

import React from 'react'
import { X, Trash2, Plus } from 'lucide-react'
import { formatBRL } from '@/lib/formatters'

export interface ItemsDrawerProps {
  showItemsDrawer: boolean
  setShowItemsDrawer: (v: boolean) => void
  reviewItems: {
    id?: string
    description: string
    quantity?: number | null
    unit_price?: number | null
    total?: number | null
    category?: string | null
  }[]
  setReviewItems: React.Dispatch<
    React.SetStateAction<
      {
        id?: string
        description: string
        quantity?: number | null
        unit_price?: number | null
        total?: number | null
        category?: string | null
      }[]
    >
  >
}

export function ItemsDrawer({
  showItemsDrawer,
  setShowItemsDrawer,
  reviewItems,
  setReviewItems,
}: ItemsDrawerProps) {
  if (!showItemsDrawer) return null

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex justify-end animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-white h-full shadow-2xl flex flex-col">
        <div className="p-4 sm:p-5 border-b border-[#EBEEF2] flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-[#111827]">Itens do Lançamento</h2>
            <p className="text-xs text-[#6B7280] mt-0.5">
              {reviewItems.length} {reviewItems.length === 1 ? 'item listado' : 'itens listados'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowItemsDrawer(false)}
            className="p-1.5 rounded-xl text-[#6B7280] hover:text-[#111827] hover:bg-[#F4F5F7] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {reviewItems.length === 0 ? (
            <div className="text-center py-8 text-xs text-[#6B7280]">
              Nenhum item adicionado ainda. Clique abaixo para começar.
            </div>
          ) : (
            reviewItems.map((item, index) => (
              <div key={index} className="p-3.5 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl space-y-3 text-xs">
                <div className="flex items-start justify-between gap-2">
                  <input
                    type="text"
                    value={item.description}
                    onChange={(e) => {
                      const updated = [...reviewItems]
                      updated[index] = { ...updated[index], description: e.target.value }
                      setReviewItems(updated)
                    }}
                    placeholder="Descrição do produto ou serviço"
                    className="flex-1 bg-white border border-[#E5E7EB] rounded-lg px-2.5 py-1.5 text-xs text-[#111827] focus:outline-none focus:border-[#2F68FE]"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setReviewItems(reviewItems.filter((_, i) => i !== index))
                    }}
                    className="p-1.5 text-[#9CA3AF] hover:text-red-600 transition-colors"
                    title="Remover item"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-[10px] text-[#6B7280] block mb-0.5">Qtd:</label>
                    <input
                      type="number"
                      step="any"
                      value={item.quantity ?? 1}
                      onChange={(e) => {
                        const updated = [...reviewItems]
                        const qty = parseFloat(e.target.value) || 1
                        const unit = item.unit_price || 0
                        updated[index] = {
                          ...updated[index],
                          quantity: qty,
                          total: unit * qty,
                        }
                        setReviewItems(updated)
                      }}
                      className="w-full bg-white border border-[#E5E7EB] rounded-lg px-2 py-1 text-xs text-[#111827] focus:outline-none focus:border-[#2F68FE]"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-[#6B7280] block mb-0.5">Unitário:</label>
                    <input
                      type="number"
                      step="0.01"
                      value={item.unit_price ?? ''}
                      onChange={(e) => {
                        const updated = [...reviewItems]
                        const unit = parseFloat(e.target.value) || 0
                        const qty = item.quantity || 1
                        updated[index] = {
                          ...updated[index],
                          unit_price: unit,
                          total: unit * qty,
                        }
                        setReviewItems(updated)
                      }}
                      className="w-full bg-white border border-[#E5E7EB] rounded-lg px-2 py-1 text-xs text-[#111827] focus:outline-none focus:border-[#2F68FE]"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-[#6B7280] block mb-0.5">Total:</label>
                    <input
                      type="number"
                      step="0.01"
                      value={item.total ?? ''}
                      onChange={(e) => {
                        const updated = [...reviewItems]
                        updated[index] = {
                          ...updated[index],
                          total: parseFloat(e.target.value) || 0,
                        }
                        setReviewItems(updated)
                      }}
                      className="w-full bg-white border border-[#E5E7EB] rounded-lg px-2 py-1 text-xs font-semibold text-[#111827] focus:outline-none focus:border-[#2F68FE]"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] text-[#6B7280] block mb-0.5">Categoria do Item:</label>
                  <input
                    type="text"
                    value={item.category || ''}
                    onChange={(e) => {
                      const updated = [...reviewItems]
                      updated[index] = { ...updated[index], category: e.target.value }
                      setReviewItems(updated)
                    }}
                    placeholder="Ex: Laticínios, Limpeza..."
                    className="w-full bg-white border border-[#E5E7EB] rounded-lg px-2.5 py-1 text-xs text-[#111827] focus:outline-none focus:border-[#2F68FE]"
                  />
                </div>
              </div>
            ))
          )}

          <button
            type="button"
            onClick={() => {
              setReviewItems([
                ...reviewItems,
                {
                  description: '',
                  quantity: 1,
                  unit_price: null,
                  total: null,
                  category: '',
                },
              ])
            }}
            className="w-full py-2.5 rounded-xl border border-dashed border-[#D1D5DB] hover:border-[#2F68FE] text-xs font-semibold text-[#2F68FE] hover:bg-[#2F68FE]/5 transition-all flex items-center justify-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            Adicionar Novo Item
          </button>
        </div>

        <div className="p-4 sm:p-5 border-t border-[#EBEEF2] bg-[#F9FAFB] flex items-center justify-between">
          <div>
            <span className="text-[11px] text-[#6B7280] block">Soma dos Itens:</span>
            <span className="text-sm font-bold text-[#111827]">
              {formatBRL(reviewItems.reduce((acc, it) => acc + (Number(it.total) || 0), 0))}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShowItemsDrawer(false)}
            className="px-5 py-2 rounded-xl bg-[#2F68FE] hover:bg-[#2557D6] text-white text-xs font-semibold shadow-sm transition-colors"
          >
            Concluir e Voltar
          </button>
        </div>
      </div>
    </div>
  )
}
