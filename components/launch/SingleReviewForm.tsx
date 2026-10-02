'use client'

import React from 'react'
import {
  AlertCircle,
  Sparkles,
  ArrowUpRight,
  ArrowDownLeft,
  Store,
  Tag,
  Package,
  Eye,
  CreditCard,
  Repeat,
  Check,
} from 'lucide-react'
import { formatBRL } from '@/lib/formatters'
import { CategorySelect } from '@/components/categories/CategorySelect'
import { AccountSelect } from '@/components/accounts/AccountSelect'
import { generateInstallmentDates } from '@/lib/installments'
import type { Receipt } from '@/lib/schema'
import type { AccountOption } from './NewLaunchTab'
import { getCardPaymentMethod } from './NewLaunchTab'

export interface SingleReviewFormProps {
  draft: {
    receipt: Receipt
    sourceType: 'text' | 'image'
    rawText: string | null
    originalExtractedData: Record<string, any>
  } | null
  duplicateWarning: {
    type: 'exact' | 'probable'
    message: string
    existingTransaction?: any
  } | null
  reviewNeedsReview: boolean
  reviewValidationReasons: string[]
  reviewType: 'expense' | 'income'
  setReviewType: (v: 'expense' | 'income') => void
  reviewTotal: string
  setReviewTotal: (v: string) => void
  reviewVendor: string
  setReviewVendor: (v: string) => void
  reviewCategory: string
  setReviewCategory: (v: string) => void
  reviewCategoryId: string | null
  setReviewCategoryId: (v: string | null) => void
  reviewAccountId: string
  setReviewAccountId: (v: string) => void
  reviewPaymentMethod: string
  setReviewPaymentMethod: (v: string) => void
  localAccounts: AccountOption[]
  setLocalAccounts: React.Dispatch<React.SetStateAction<AccountOption[]>>
  reviewDate: string
  setReviewDate: (v: string) => void
  reviewTime: string
  setReviewTime: (v: string) => void
  reviewItems: any[]
  setShowItemsDrawer: (v: boolean) => void
  reviewIsRecurring: boolean
  setReviewIsRecurring: (v: boolean) => void
  reviewRecurrenceDueDay: string
  setReviewRecurrenceDueDay: (v: string) => void
  reviewRecurrenceNextDate: string
  setReviewRecurrenceNextDate: (v: string) => void
  reviewIsEstimated: boolean
  setReviewIsEstimated: (v: boolean) => void
  reviewIsInstallment: boolean
  setReviewIsInstallment: (v: boolean) => void
  reviewInstallmentCurrent: string
  setReviewInstallmentCurrent: (v: string) => void
  reviewInstallmentTotal: string
  setReviewInstallmentTotal: (v: string) => void
  reviewNotes: string
  setReviewNotes: (v: string) => void
  savingLaunch: boolean
  handleDiscardLaunch: () => void
  handleSaveFinalLaunch: (force?: boolean) => Promise<void>
}

export function SingleReviewForm({
  draft,
  duplicateWarning,
  reviewNeedsReview,
  reviewValidationReasons,
  reviewType,
  setReviewType,
  reviewTotal,
  setReviewTotal,
  reviewVendor,
  setReviewVendor,
  reviewCategory,
  setReviewCategory,
  reviewCategoryId,
  setReviewCategoryId,
  reviewAccountId,
  setReviewAccountId,
  reviewPaymentMethod,
  setReviewPaymentMethod,
  localAccounts,
  setLocalAccounts,
  reviewDate,
  setReviewDate,
  reviewTime,
  setReviewTime,
  reviewItems,
  setShowItemsDrawer,
  reviewIsRecurring,
  setReviewIsRecurring,
  reviewRecurrenceDueDay,
  setReviewRecurrenceDueDay,
  reviewRecurrenceNextDate,
  setReviewRecurrenceNextDate,
  reviewIsEstimated,
  setReviewIsEstimated,
  reviewIsInstallment,
  setReviewIsInstallment,
  reviewInstallmentCurrent,
  setReviewInstallmentCurrent,
  reviewInstallmentTotal,
  setReviewInstallmentTotal,
  reviewNotes,
  setReviewNotes,
  savingLaunch,
  handleDiscardLaunch,
  handleSaveFinalLaunch,
}: SingleReviewFormProps) {
  return (
    <div className="space-y-6">
      {/* 1. Alerta Contextual de Validação ou Duplicidade */}
      {duplicateWarning && (
        <div
          className={`border rounded-xl p-3.5 text-xs space-y-2 ${
            duplicateWarning.type === 'exact'
              ? 'border-red-200 bg-red-50 text-red-900'
              : 'border-amber-200 bg-amber-50 text-amber-900'
          }`}
        >
          <div className="flex items-center gap-1.5 font-semibold">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>
              {duplicateWarning.type === 'exact'
                ? 'Duplicata exata detectada no banco de dados'
                : 'Aviso: possível transação duplicada detectada'}
            </span>
          </div>
          <p className="text-[11px] leading-relaxed text-[#4B5563]">{duplicateWarning.message}</p>
        </div>
      )}

      {reviewNeedsReview && reviewValidationReasons.length > 0 && !duplicateWarning && (
        <div className="border border-amber-200 bg-amber-50/70 text-amber-900 rounded-xl p-3.5 text-xs space-y-1">
          <div className="flex items-center gap-1.5 font-semibold">
            <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
            <span>Por favor, confira os campos destacados antes de salvar:</span>
          </div>
          <ul className="list-disc list-inside text-[11px] text-amber-800 space-y-0.5 pt-1">
            {reviewValidationReasons.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      {/* 2. Tipo (Despesa / Receita) e Valor Principal */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-end">
        {/* Seletor Despesa / Receita */}
        <div className="sm:col-span-5 space-y-1.5">
          <label className="text-xs font-semibold text-[#111827] block">Tipo de Movimentação</label>
          <div className="flex p-1 bg-[#F4F5F7] rounded-xl border border-[#E5E7EB]">
            <button
              type="button"
              onClick={() => setReviewType('expense')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                reviewType === 'expense'
                  ? 'bg-white text-red-600 shadow-2xs'
                  : 'text-[#6B7280] hover:text-[#111827]'
              }`}
            >
              <ArrowUpRight className="w-3.5 h-3.5" />
              <span>Despesa</span>
            </button>
            <button
              type="button"
              onClick={() => setReviewType('income')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                reviewType === 'income'
                  ? 'bg-white text-emerald-600 shadow-2xs'
                  : 'text-[#6B7280] hover:text-[#111827]'
              }`}
            >
              <ArrowDownLeft className="w-3.5 h-3.5" />
              <span>Receita</span>
            </button>
          </div>
        </div>

        {/* Valor Total */}
        <div className="sm:col-span-7 space-y-1.5">
          <label className="text-xs font-semibold text-[#111827] block">
            {reviewIsInstallment ? 'Valor da Parcela (R$)' : 'Valor Total (R$)'}
          </label>
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-[#9CA3AF]">
              R$
            </span>
            <input
              type="text"
              inputMode="decimal"
              value={reviewTotal}
              onChange={(e) => setReviewTotal(e.target.value)}
              placeholder="0,00"
              className={`w-full bg-[#F9FAFB] border rounded-xl pl-10 pr-4 py-2 text-base font-extrabold text-[#111827] placeholder-[#9CA3AF] focus:bg-white focus:outline-none focus:ring-2 transition-all ${
                reviewType === 'income'
                  ? 'focus:ring-emerald-500/20 focus:border-emerald-500'
                  : 'focus:ring-[#2F68FE]/20 focus:border-[#2F68FE]'
              } ${!reviewTotal ? 'border-amber-300' : 'border-[#E5E7EB]'}`}
            />
          </div>
        </div>
      </div>

      {/* 3. Grade Principal de Campos: Estabelecimento, Categoria, Conta, Meio, Data */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Estabelecimento */}
        <div className="space-y-1">
          <label className="text-xs font-semibold text-[#111827] flex items-center gap-1">
            <Store className="w-3.5 h-3.5 text-[#6B7280]" />
            <span>{reviewType === 'income' ? 'Fonte / Pagador' : 'Estabelecimento / Local'}</span>
          </label>
          <input
            type="text"
            value={reviewVendor}
            onChange={(e) => setReviewVendor(e.target.value)}
            placeholder="Ex: Carrefour, Padaria, Uber..."
            className="w-full bg-[#F9FAFB] border border-[#E5E7EB] hover:border-[#D1D5DB] focus:bg-white rounded-xl px-3 py-2 text-xs text-[#111827] placeholder-[#9CA3AF] focus:outline-none focus:border-[#2F68FE] transition-all"
          />
        </div>

        {/* Categoria */}
        <div className="space-y-1">
          <label className="text-xs font-semibold text-[#111827] flex items-center gap-1">
            <Tag className="w-3.5 h-3.5 text-[#6B7280]" />
            <span>Categoria</span>
          </label>
          <CategorySelect
            type={reviewType}
            value={reviewCategoryId}
            fallbackName={reviewCategory}
            onChange={(id, name) => {
              setReviewCategoryId(id)
              setReviewCategory(name)
            }}
            placeholder="Selecionar categoria..."
            className="text-xs"
          />
        </div>

        {/* Conta / Cartão */}
        <div className="space-y-1">
          <label className="text-xs font-semibold text-[#111827] flex items-center gap-1">
            <CreditCard className="w-3.5 h-3.5 text-[#6B7280]" />
            <span>Conta / Cartão</span>
          </label>
          <AccountSelect
            accounts={localAccounts as any}
            value={reviewAccountId || null}
            onChange={(id) => {
              const newAccId = id || ''
              setReviewAccountId(newAccId)
              const inferredPm = getCardPaymentMethod(newAccId, localAccounts)
              if (inferredPm) {
                setReviewPaymentMethod(inferredPm)
              }
            }}
            onAccountCreated={(newAcc) => {
              setLocalAccounts((prev) => [...prev, newAcc])
            }}
            placeholder="Selecione a conta/cartão..."
            className="text-xs"
          />
        </div>

        {/* Forma de Pagamento (somente exibida quando a conta não for cartão) */}
        {!getCardPaymentMethod(reviewAccountId, localAccounts) && (
          <div className="space-y-1">
            <label className="text-xs font-semibold text-[#111827] block">
              Forma de Pagamento
            </label>
            <select
              value={reviewPaymentMethod}
              onChange={(e) => setReviewPaymentMethod(e.target.value)}
              className="w-full bg-[#F9FAFB] border border-[#E5E7EB] hover:border-[#D1D5DB] focus:bg-white rounded-xl px-3 py-2 text-xs text-[#111827] focus:outline-none focus:border-[#2F68FE] transition-all"
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

        {/* Data e Hora */}
        <div className="space-y-1">
          <label className="text-xs font-semibold text-[#111827] block">Data do Lançamento</label>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="date"
              value={reviewDate}
              onChange={(e) => setReviewDate(e.target.value)}
              className="w-full bg-[#F9FAFB] border border-[#E5E7EB] hover:border-[#D1D5DB] focus:bg-white rounded-xl px-3 py-2 text-xs text-[#111827] focus:outline-none focus:border-[#2F68FE] transition-all"
            />
            <input
              type="time"
              value={reviewTime}
              onChange={(e) => setReviewTime(e.target.value)}
              className="w-full bg-[#F9FAFB] border border-[#E5E7EB] hover:border-[#D1D5DB] focus:bg-white rounded-xl px-3 py-2 text-xs text-[#111827] focus:outline-none focus:border-[#2F68FE] transition-all"
            />
          </div>
        </div>
      </div>

      {/* 4. Opções Avançadas: Itens, Recorrência, Parcelamento e Notas */}
      <div className="space-y-3 pt-2 border-t border-[#EBEEF2]">
        {/* Botão de Drawer de Itens */}
        <div className="flex items-center justify-between p-3 bg-[#F9FAFB] border border-[#EBEEF2] rounded-xl">
          <div className="flex items-center gap-2">
            <Package className="w-4 h-4 text-[#6B7280]" />
            <span className="text-xs font-medium text-[#111827]">Itens Detalhados</span>
            <span className="text-[10px] text-[#6B7280]">({reviewItems.length} cadastrados)</span>
          </div>
          <button
            type="button"
            onClick={() => setShowItemsDrawer(true)}
            className="text-xs font-semibold text-[#2F68FE] hover:underline flex items-center gap-1"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>{reviewItems.length > 0 ? 'Ver / Editar Itens' : 'Adicionar Itens'}</span>
          </button>
        </div>

        {/* Botões: Recorrência & Parcelamento */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              const nextVal = !reviewIsRecurring
              setReviewIsRecurring(nextVal)
              if (nextVal) {
                setReviewIsInstallment(false)
                if (!reviewRecurrenceDueDay) {
                  const d = reviewDate ? parseInt(reviewDate.slice(8, 10), 10) : new Date().getDate()
                  setReviewRecurrenceDueDay(String(d))
                }
              }
            }}
            className={`px-3 py-1.5 rounded-xl text-xs transition-all flex items-center gap-1.5 border ${
              reviewIsRecurring
                ? 'bg-[#2F68FE]/10 text-[#2F68FE] border-[#2F68FE]/30 shadow-sm font-semibold'
                : 'bg-white text-[#6B7280] border-[#E5E7EB] hover:text-[#111827] font-medium'
            }`}
          >
            <Repeat className="w-3.5 h-3.5" />
            Recorrente Mensal
          </button>

          <button
            type="button"
            onClick={() => {
              const nextVal = !reviewIsInstallment
              setReviewIsInstallment(nextVal)
              if (nextVal) setReviewIsRecurring(false)
            }}
            className={`px-3 py-1.5 rounded-xl text-xs transition-all flex items-center gap-1.5 border ${
              reviewIsInstallment
                ? 'bg-[#2F68FE]/10 text-[#2F68FE] border-[#2F68FE]/30 shadow-sm font-semibold'
                : 'bg-white text-[#6B7280] border-[#E5E7EB] hover:text-[#111827] font-medium'
            }`}
          >
            <CreditCard className="w-3.5 h-3.5" />
            Compra Parcelada
          </button>
        </div>

        {/* Expansão Recorrência */}
        {reviewIsRecurring && (
          <div className="p-3.5 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl text-xs space-y-2.5 animate-in fade-in duration-150">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-[#4B5563] block mb-1 font-medium">
                  Dia Fixo do Vencimento:
                </label>
                <input
                  type="number"
                  min="1"
                  max="31"
                  placeholder="Ex: 10, 25"
                  value={reviewRecurrenceDueDay}
                  onChange={(e) => {
                    const dayVal = e.target.value
                    setReviewRecurrenceDueDay(dayVal)
                    const num = parseInt(dayVal, 10)
                    if (num >= 1 && num <= 31) {
                      const base = reviewDate ? new Date(reviewDate + 'T12:00:00') : new Date()
                      let y = base.getFullYear()
                      let m = base.getMonth()
                      if (num < base.getDate()) {
                        m += 1
                        if (m > 11) {
                          m = 0
                          y += 1
                        }
                      }
                      const maxD = new Date(y, m + 1, 0).getDate()
                      const d = Math.min(num, maxD)
                      setReviewRecurrenceNextDate(
                        `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
                      )
                    }
                  }}
                  className="w-full bg-white border border-[#E5E7EB] rounded-lg px-2.5 py-1 text-xs text-[#111827] focus:outline-none focus:border-[#2F68FE]"
                />
              </div>

              <div>
                <label className="text-[11px] text-[#4B5563] block mb-1 font-medium">
                  Próxima Data Prevista:
                </label>
                <input
                  type="date"
                  value={reviewRecurrenceNextDate}
                  onChange={(e) => {
                    setReviewRecurrenceNextDate(e.target.value)
                    if (e.target.value) {
                      setReviewRecurrenceDueDay(String(parseInt(e.target.value.slice(8, 10), 10)))
                    }
                  }}
                  className="w-full bg-white border border-[#E5E7EB] rounded-lg px-2.5 py-1 text-xs text-[#111827] focus:outline-none focus:border-[#2F68FE]"
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-xs text-[#374151] cursor-pointer pt-1 border-t border-[#E5E7EB]/60 select-none">
              <input
                type="checkbox"
                checked={reviewIsEstimated}
                onChange={(e) => setReviewIsEstimated(e.target.checked)}
                className="rounded border-[#D1D5DB] text-[#2F68FE] focus:ring-[#2F68FE] w-3.5 h-3.5 accent-[#2F68FE]"
              />
              <span className="font-medium">Valor estimado (varia todo mês, ex: água, luz, energia)</span>
            </label>
            <span className="text-[10px] text-[#9CA3AF] block">
              Quando o valor real for lançado no mês, a previsão será automaticamente atualizada sem duplicar.
            </span>
          </div>
        )}

        {/* Expansão Parcelamento */}
        {reviewIsInstallment && (
          <div className="p-3 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl text-xs space-y-2 animate-in fade-in duration-150">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-[#6B7280] block mb-1">Parcela Atual:</label>
                <input
                  type="number"
                  min="1"
                  value={reviewInstallmentCurrent}
                  onChange={(e) => setReviewInstallmentCurrent(e.target.value)}
                  className="w-full bg-white border border-[#E5E7EB] rounded-lg px-2.5 py-1 text-xs text-[#111827] focus:outline-none focus:border-[#2F68FE]"
                />
              </div>
              <div>
                <label className="text-[11px] text-[#6B7280] block mb-1">Total de Parcelas:</label>
                <input
                  type="number"
                  min="2"
                  value={reviewInstallmentTotal}
                  onChange={(e) => setReviewInstallmentTotal(e.target.value)}
                  className="w-full bg-white border border-[#E5E7EB] rounded-lg px-2.5 py-1 text-xs text-[#111827] focus:outline-none focus:border-[#2F68FE]"
                />
              </div>
            </div>
            {/* Linha do Tempo Prevista */}
            {reviewDate && parseInt(reviewInstallmentTotal, 10) > 1 && (() => {
              const tot = parseInt(reviewInstallmentTotal, 10) || 2
              const curr = parseInt(reviewInstallmentCurrent, 10) || 1
              const previewDates = generateInstallmentDates(reviewDate, tot, curr, 'purchase_date')
              const firstDate = previewDates[0]?.date
              const lastDate = previewDates[previewDates.length - 1]?.date
              const formatPreviewDate = (d?: string) => {
                if (!d) return ''
                const [y, m, day] = d.split('-')
                return `${day}/${m}/${y}`
              }
              return (
                <div className="pt-1 text-[11px] text-[#6B7280] flex items-center justify-between border-t border-[#E5E7EB]">
                  <span>Cronograma ({tot}x):</span>
                  <span className="font-medium text-[#111827]">
                    1/{tot}: {formatPreviewDate(firstDate)} → {tot}/{tot}: {formatPreviewDate(lastDate)}
                  </span>
                </div>
              )
            })()}
          </div>
        )}

        {/* Observações */}
        <div className="space-y-1">
          <label className="text-[11px] font-medium text-[#6B7280] block">Observações (Opcional):</label>
          <input
            type="text"
            value={reviewNotes}
            onChange={(e) => setReviewNotes(e.target.value)}
            placeholder="Anotações adicionais, tags ou detalhes..."
            className="w-full bg-[#F9FAFB] border border-[#E5E7EB] hover:border-[#D1D5DB] focus:bg-white rounded-xl px-3 py-2 text-xs text-[#111827] placeholder-[#9CA3AF] focus:outline-none focus:border-[#2F68FE] transition-all"
          />
        </div>
      </div>

      {/* 5. Botões de Ação */}
      <div className="pt-4 border-t border-[#EBEEF2] flex flex-wrap sm:flex-nowrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={handleDiscardLaunch}
          disabled={savingLaunch}
          className="flex-1 sm:flex-initial px-4 py-3 sm:py-2.5 rounded-xl border border-slate-300 text-slate-700 hover:text-slate-950 active:bg-slate-100 hover:bg-slate-50 bg-white text-xs font-semibold transition-all shadow-2xs disabled:opacity-50 disabled:bg-slate-100 touch-manipulation min-h-[44px]"
        >
          Descartar
        </button>

        <div className="flex-1 sm:flex-initial flex items-center gap-2">
          {duplicateWarning?.type === 'probable' && (
            <button
              type="button"
              disabled={savingLaunch}
              onClick={() => handleSaveFinalLaunch(true)}
              className="flex-1 sm:flex-initial px-4 py-3 sm:py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white font-bold text-xs transition-colors shadow-sm touch-manipulation min-h-[44px]"
            >
              Salvar Mesmo Assim
            </button>
          )}
          <button
            type="button"
            disabled={savingLaunch || !reviewTotal}
            onClick={() => handleSaveFinalLaunch(false)}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-6 py-3 sm:py-2.5 rounded-xl bg-[#2F68FE] hover:bg-[#2557D6] active:bg-[#1E4FD9] disabled:bg-slate-200 disabled:text-slate-500 disabled:border disabled:border-slate-300 text-white font-bold text-xs transition-all shadow-sm cursor-pointer disabled:cursor-not-allowed touch-manipulation min-h-[44px]"
          >
            {savingLaunch ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Salvando...</span>
              </>
            ) : (
              <>
                <Check className="w-4 h-4 stroke-[2.5]" />
                <span>Salvar Lançamento</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
