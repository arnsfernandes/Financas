'use client'

import React from 'react'
import {
  Sparkles,
  Trash2,
  Store,
  Tag,
  CreditCard,
  Calendar,
  Check,
} from 'lucide-react'
import { formatBRL } from '@/lib/formatters'
import { CategorySelect } from '@/components/categories/CategorySelect'
import { AccountSelect } from '@/components/accounts/AccountSelect'
import type { Receipt } from '@/lib/schema'
import type { AccountOption } from './NewLaunchTab'
import { getCardPaymentMethod } from './NewLaunchTab'

export interface BatchReviewSectionProps {
  batchDrafts: {
    receipt: Receipt
    sourceType: 'text' | 'image'
    rawText: string | null
    originalExtractedData: Record<string, any>
  }[]
  setBatchDrafts: React.Dispatch<
    React.SetStateAction<
      | {
          receipt: Receipt
          sourceType: 'text' | 'image'
          rawText: string | null
          originalExtractedData: Record<string, any>
        }[]
      | null
    >
  >
  localAccounts: AccountOption[]
  setLocalAccounts: React.Dispatch<React.SetStateAction<AccountOption[]>>
  savingLaunch: boolean
  onDiscard: () => void
  onSaveBatch: () => Promise<void>
}

export function BatchReviewSection({
  batchDrafts,
  setBatchDrafts,
  localAccounts,
  setLocalAccounts,
  savingLaunch,
  onDiscard,
  onSaveBatch,
}: BatchReviewSectionProps) {
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Cabeçalho do Lote */}
      <div className="bg-blue-50/70 border border-blue-200 rounded-2xl p-4 sm:p-5 text-xs text-blue-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
        <div className="flex items-center gap-2.5">
          <Sparkles className="w-5 h-5 text-[#2F68FE] shrink-0" />
          <div>
            <span className="font-bold text-sm block text-[#111827]">
              {batchDrafts.length} lançamentos identificados
            </span>
            <p className="text-[#4B5563] mt-0.5">
              Revise e ajuste cada transação individualmente antes de confirmar.
            </p>
          </div>
        </div>
        <div className="text-right sm:text-right border-t sm:border-t-0 pt-2 sm:pt-0 border-blue-200/60">
          <span className="text-[11px] text-[#6B7280] block">Total Geral:</span>
          <span className="text-base font-extrabold text-[#111827]">
            {formatBRL(batchDrafts.reduce((acc, it) => acc + (Number(it.receipt.total) || 0), 0))}
          </span>
        </div>
      </div>

      {/* Lista de Transações em Lote */}
      <div className="space-y-4">
        {batchDrafts.map((item, index) => (
          <div
            key={index}
            className="bg-white border border-[#EBEEF2] rounded-2xl p-5 shadow-sm space-y-4 transition-all hover:border-[#D1D5DB]"
          >
            <div className="flex items-center justify-between border-b border-[#F4F5F7] pb-3">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-[#F4F5F7] text-[#111827] font-bold text-xs flex items-center justify-center border border-[#E5E7EB]">
                  {index + 1}
                </span>
                <span className="font-bold text-sm text-[#111827]">
                  {item.receipt.vendor || `Lançamento ${index + 1}`}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-sm text-[#111827]">
                  {formatBRL(item.receipt.total || 0)}
                </span>
                {batchDrafts.length > 1 && (
                  <button
                    type="button"
                    onClick={() => {
                      setBatchDrafts(batchDrafts.filter((_, i) => i !== index))
                    }}
                    className="p-1.5 text-[#9CA3AF] hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                    title="Remover este lançamento"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {/* Estabelecimento / Descrição */}
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-[#111827] flex items-center gap-1">
                  <Store className="w-3 h-3 text-[#6B7280]" />
                  Estabelecimento / Descrição
                </label>
                <input
                  type="text"
                  value={item.receipt.vendor || ''}
                  onChange={(e) => {
                    const updated = [...batchDrafts]
                    updated[index].receipt.vendor = e.target.value
                    setBatchDrafts(updated)
                  }}
                  placeholder="Ex: Google One, Combustível..."
                  className="w-full bg-[#F9FAFB] border border-[#E5E7EB] focus:bg-white rounded-xl px-3 py-1.5 text-xs text-[#111827] focus:outline-none focus:border-[#2F68FE]"
                />
              </div>

              {/* Valor */}
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-[#111827]">
                  Valor (R$)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={item.receipt.total ?? ''}
                  onChange={(e) => {
                    const updated = [...batchDrafts]
                    const val = parseFloat(e.target.value) || 0
                    updated[index].receipt.total = val
                    setBatchDrafts(updated)
                  }}
                  className="w-full bg-[#F9FAFB] border border-[#E5E7EB] focus:bg-white rounded-xl px-3 py-1.5 text-xs font-semibold text-[#111827] focus:outline-none focus:border-[#2F68FE]"
                />
              </div>

              {/* Categoria */}
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-[#111827] flex items-center gap-1">
                  <Tag className="w-3 h-3 text-[#6B7280]" />
                  Categoria
                </label>
                <CategorySelect
                  type={item.receipt.type || 'expense'}
                  value={item.receipt.category_id || null}
                  fallbackName={item.receipt.category || ''}
                  onChange={(id, name) => {
                    const updated = [...batchDrafts]
                    updated[index].receipt.category_id = id
                    updated[index].receipt.category = name
                    setBatchDrafts(updated)
                  }}
                  placeholder="Selecionar categoria..."
                  className="text-xs"
                />
              </div>

              {/* Conta / Cartão */}
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-[#111827] flex items-center gap-1">
                  <CreditCard className="w-3 h-3 text-[#6B7280]" />
                  Conta / Cartão
                </label>
                <AccountSelect
                  accounts={localAccounts as any}
                  value={item.receipt.account_id || null}
                  onChange={(id) => {
                    const updated = [...batchDrafts]
                    const newAccId = id || null
                    updated[index].receipt.account_id = newAccId
                    const inferredPm = getCardPaymentMethod(newAccId, localAccounts)
                    if (inferredPm) {
                      updated[index].receipt.payment_method = inferredPm
                    }
                    setBatchDrafts(updated)
                  }}
                  onAccountCreated={(newAcc) => {
                    setLocalAccounts((prev) => [...prev, newAcc])
                  }}
                  placeholder="Sem conta vinculada"
                  className="text-xs"
                />
              </div>

              {/* Forma de Pagamento (somente exibida quando a conta não for cartão) */}
              {!getCardPaymentMethod(item.receipt.account_id, localAccounts) && (
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-[#111827]">
                    Forma de Pagamento
                  </label>
                  <select
                    value={item.receipt.payment_method || ''}
                    onChange={(e) => {
                      const updated = [...batchDrafts]
                      updated[index].receipt.payment_method = e.target.value || null
                      setBatchDrafts(updated)
                    }}
                    className="w-full bg-[#F9FAFB] border border-[#E5E7EB] focus:bg-white rounded-xl px-3 py-1.5 text-xs text-[#111827] focus:outline-none focus:border-[#2F68FE]"
                  >
                    <option value="">Não especificada</option>
                    <option value="PIX">PIX</option>
                    <option value="Cartão de Crédito">Cartão de Crédito</option>
                    <option value="Cartão de Débito">Cartão de Débito</option>
                    <option value="Dinheiro">Dinheiro</option>
                    <option value="Boleto">Boleto</option>
                    <option value="Transferência">Transferência</option>
                    <option value="Outros">Outros</option>
                  </select>
                </div>
              )}

              {/* Data */}
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-[#111827] flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-[#6B7280]" />
                  Data
                </label>
                <input
                  type="date"
                  value={item.receipt.date || new Date().toISOString().slice(0, 10)}
                  onChange={(e) => {
                    const updated = [...batchDrafts]
                    updated[index].receipt.date = e.target.value
                    setBatchDrafts(updated)
                  }}
                  className="w-full bg-[#F9FAFB] border border-[#E5E7EB] focus:bg-white rounded-xl px-3 py-1.5 text-xs text-[#111827] focus:outline-none focus:border-[#2F68FE]"
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Ações do Lote */}
      <div className="pt-4 border-t border-[#EBEEF2] flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 pb-[max(1rem,env(safe-area-inset-bottom,0px))] sm:pb-0">
        <button
          type="button"
          onClick={onDiscard}
          disabled={savingLaunch}
          className="flex-1 sm:flex-initial px-4 py-3 sm:py-2.5 rounded-xl border border-[#E5E7EB] text-[#6B7280] hover:text-[#111827] active:bg-[#F4F5F7] bg-white text-xs font-medium transition-colors shadow-sm touch-manipulation min-h-[44px]"
        >
          Descartar Todos
        </button>

        <button
          type="button"
          disabled={savingLaunch || batchDrafts.length === 0}
          onClick={onSaveBatch}
          className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-6 py-3 sm:py-2.5 rounded-xl bg-[#2F68FE] hover:bg-[#2557D6] active:bg-[#1E4ECC] disabled:opacity-50 text-white font-semibold text-xs transition-colors shadow-sm touch-manipulation min-h-[44px]"
        >
          {savingLaunch ? (
            <>
              <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              <span>Salvando Lançamentos...</span>
            </>
          ) : (
            <>
              <Check className="w-4 h-4" />
              <span>Confirmar Todos ({batchDrafts.length})</span>
            </>
          )}
        </button>
      </div>
    </div>
  )
}
