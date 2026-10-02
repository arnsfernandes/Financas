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
  ChevronDown,
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
  showMoreDetails?: boolean
  setShowMoreDetails?: (v: boolean | ((prev: boolean) => boolean)) => void
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
  showMoreDetails: propShowMoreDetails,
  setShowMoreDetails: propSetShowMoreDetails,
  savingLaunch,
  handleDiscardLaunch,
  handleSaveFinalLaunch,
}: SingleReviewFormProps) {
  const isAutoExpanded = Boolean(
    reviewIsRecurring ||
      reviewIsInstallment ||
      reviewNotes ||
      (reviewItems && reviewItems.length > 0)
  )
  const showMore = propShowMoreDetails !== undefined ? (propShowMoreDetails || isAutoExpanded) : true

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* 1. Alerta Contextual de Validação ou Duplicidade */}
      {duplicateWarning && (
        <div
          className={`border rounded-2xl p-3.5 text-xs space-y-2 ${
            duplicateWarning.type === 'exact'
              ? 'border-red-200 bg-red-50 text-red-900'
              : 'border-amber-200 bg-amber-50 text-amber-900'
          }`}
        >
          <div className="flex items-center gap-1.5 font-semibold">
            <AlertCircle className={`w-4 h-4 shrink-0 ${duplicateWarning.type === 'exact' ? 'text-red-600' : 'text-amber-600'}`} />
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
        <div className="border border-amber-200 bg-amber-50 text-amber-900 rounded-2xl p-3.5 text-xs space-y-1">
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
      <div className="space-y-4">
        {/* Seletor Segmented Control Despesa / Receita */}
        <div className="flex p-1 bg-[#F2F4F7] rounded-xl border border-transparent">
          <button
            type="button"
            onClick={() => setReviewType('expense')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-all cursor-pointer ${
              reviewType === 'expense'
                ? 'bg-white text-[#0F172A] shadow-2xs font-semibold'
                : 'text-[#667085] hover:text-[#0F172A]'
            }`}
          >
            <ArrowUpRight className="w-3.5 h-3.5 text-rose-500" />
            <span>Despesa</span>
          </button>
          <button
            type="button"
            onClick={() => setReviewType('income')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-all cursor-pointer ${
              reviewType === 'income'
                ? 'bg-white text-[#0F172A] shadow-2xs font-semibold'
                : 'text-[#667085] hover:text-[#0F172A]'
            }`}
          >
            <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-500" />
            <span>Receita</span>
          </button>
        </div>

        {/* Valor Hero Grande e Limpo */}
        <div className="text-center py-5 px-3 bg-white rounded-2xl border border-[#EBEEF2] shadow-2xs space-y-1">
          <span className="text-[11px] font-normal text-[#667085] block tracking-wider uppercase">
            {reviewIsInstallment ? 'Valor da Parcela' : 'Valor Total'}
          </span>
          <div className="flex items-baseline justify-center gap-1">
            <span className="text-lg font-light text-[#98A2B3]">R$</span>
            <input
              type="text"
              inputMode="decimal"
              value={reviewTotal}
              onChange={(e) => setReviewTotal(e.target.value)}
              placeholder="0,00"
              className="w-48 bg-transparent text-center text-3xl sm:text-4xl font-light text-[#0F172A] tracking-tight tabular-nums focus:outline-none placeholder:text-[#98A2B3]"
            />
          </div>
        </div>
      </div>

      {/* 3. Grade Principal de Campos: Estabelecimento, Categoria, Conta, Meio, Data */}
      <div className="space-y-3">
        {/* Estabelecimento */}
        <div className="space-y-1">
          <label className="text-[11px] font-medium text-[#667085] flex items-center gap-1 px-1">
            <Store className="w-3.5 h-3.5 text-[#98A2B3]" />
            <span>{reviewType === 'income' ? 'Fonte / Pagador' : 'Estabelecimento'}</span>
          </label>
          <input
            type="text"
            value={reviewVendor}
            onChange={(e) => setReviewVendor(e.target.value)}
            placeholder="Ex: Carrefour, Padaria, Uber..."
            className="w-full bg-[#F2F4F7] border border-transparent hover:border-[#E4E7EC] focus:border-[#2F68FE] focus:bg-white rounded-xl px-3.5 py-2.5 text-xs text-[#0F172A] placeholder:text-[#98A2B3] focus:outline-none transition-all"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Categoria */}
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-[#667085] flex items-center gap-1 px-1">
              <Tag className="w-3.5 h-3.5 text-[#98A2B3]" />
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
              className="text-xs bg-[#F2F4F7] border-transparent text-[#0F172A]"
            />
          </div>

          {/* Conta / Cartão */}
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-[#667085] flex items-center gap-1 px-1">
              <CreditCard className="w-3.5 h-3.5 text-[#98A2B3]" />
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
              className="text-xs bg-[#F2F4F7] border-transparent text-[#0F172A]"
            />
          </div>
        </div>

        {/* Forma de Pagamento / Data */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {!getCardPaymentMethod(reviewAccountId, localAccounts) ? (
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-[#667085] block px-1">
                Forma de Pagamento
              </label>
              <select
                value={reviewPaymentMethod}
                onChange={(e) => setReviewPaymentMethod(e.target.value)}
                className="w-full bg-[#F2F4F7] border border-transparent hover:border-[#E4E7EC] focus:border-[#2F68FE] focus:bg-white rounded-xl px-3.5 py-2.5 text-xs text-[#0F172A] focus:outline-none transition-all"
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
          ) : null}

          <div className="space-y-1">
            <label className="text-[11px] font-medium text-[#667085] block px-1">Data do Lançamento</label>
            <input
              type="date"
              value={reviewDate}
              onChange={(e) => setReviewDate(e.target.value)}
              className="w-full bg-[#F2F4F7] border border-transparent hover:border-[#E4E7EC] focus:border-[#2F68FE] focus:bg-white rounded-xl px-3.5 py-2.5 text-xs text-[#0F172A] focus:outline-none transition-all"
            />
          </div>
        </div>
      </div>

      {/* 4. Opções: Recorrência & Parcelamento */}
      <div className="space-y-3 pt-2 border-t border-[#EBEEF2]">
        {/* Botões rápidos: Recorrência & Parcelamento */}
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
            className={`px-3 py-1.5 rounded-xl text-xs transition-all flex items-center gap-1.5 border cursor-pointer ${
              reviewIsRecurring
                ? 'bg-[#EBF2FF] text-[#2F68FE] border-[#2F68FE]/30 font-medium'
                : 'bg-[#F2F4F7] text-[#667085] border-transparent hover:text-[#0F172A]'
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
            className={`px-3 py-1.5 rounded-xl text-xs transition-all flex items-center gap-1.5 border cursor-pointer ${
              reviewIsInstallment
                ? 'bg-[#EBF2FF] text-[#2F68FE] border-[#2F68FE]/30 font-medium'
                : 'bg-[#F2F4F7] text-[#667085] border-transparent hover:text-[#0F172A]'
            }`}
          >
            <CreditCard className="w-3.5 h-3.5" />
            Compra Parcelada
          </button>
        </div>

        {/* Expansão Recorrência */}
        {reviewIsRecurring && (
          <div className="p-3.5 bg-white border border-[#EBEEF2] rounded-2xl text-xs space-y-3 animate-in fade-in duration-150 shadow-2xs">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-[#667085] block mb-1 font-medium">
                  Dia do Vencimento:
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
                  className="w-full bg-[#F2F4F7] border border-transparent rounded-xl px-3 py-1.5 text-xs text-[#0F172A] focus:outline-none focus:bg-white focus:border-[#2F68FE]"
                />
              </div>

              <div>
                <label className="text-[11px] text-[#667085] block mb-1 font-medium">
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
                  className="w-full bg-[#F2F4F7] border border-transparent rounded-xl px-3 py-1.5 text-xs text-[#0F172A] focus:outline-none focus:bg-white focus:border-[#2F68FE]"
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-xs text-[#667085] cursor-pointer pt-1 border-t border-[#EBEEF2] select-none">
              <input
                type="checkbox"
                checked={reviewIsEstimated}
                onChange={(e) => setReviewIsEstimated(e.target.checked)}
                className="rounded border-slate-300 text-[#2F68FE] focus:ring-[#2F68FE] w-3.5 h-3.5 accent-[#2F68FE]"
              />
              <span className="font-normal">Valor estimado (varia todo mês, ex: energia, água)</span>
            </label>
          </div>
        )}

        {/* Expansão Parcelamento */}
        {reviewIsInstallment && (
          <div className="p-3.5 bg-white border border-[#EBEEF2] rounded-2xl text-xs space-y-3 animate-in fade-in duration-150 shadow-2xs">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-[#667085] block mb-1">Parcela Atual:</label>
                <input
                  type="number"
                  min="1"
                  value={reviewInstallmentCurrent}
                  onChange={(e) => setReviewInstallmentCurrent(e.target.value)}
                  className="w-full bg-[#F2F4F7] border border-transparent rounded-xl px-3 py-1.5 text-xs text-[#0F172A] focus:outline-none focus:bg-white focus:border-[#2F68FE]"
                />
              </div>
              <div>
                <label className="text-[11px] text-[#667085] block mb-1">Total de Parcelas:</label>
                <input
                  type="number"
                  min="2"
                  value={reviewInstallmentTotal}
                  onChange={(e) => setReviewInstallmentTotal(e.target.value)}
                  className="w-full bg-[#F2F4F7] border border-transparent rounded-xl px-3 py-1.5 text-xs text-[#0F172A] focus:outline-none focus:bg-white focus:border-[#2F68FE]"
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
                <div className="pt-2 text-[11px] text-[#667085] flex items-center justify-between border-t border-[#EBEEF2]">
                  <span>Cronograma ({tot}x):</span>
                  <span className="font-medium text-[#0F172A]">
                    1/{tot}: {formatPreviewDate(firstDate)} → {tot}/{tot}: {formatPreviewDate(lastDate)}
                  </span>
                </div>
              )
            })()}
          </div>
        )}

        {/* Mais Detalhes (Itens & Observações) */}
        <div className="pt-1">
          <button
            type="button"
            onClick={() => {
              if (propSetShowMoreDetails) {
                propSetShowMoreDetails((prev) => !prev)
              }
            }}
            className="flex items-center gap-1.5 text-xs font-medium text-[#667085] hover:text-[#0F172A] py-1 select-none cursor-pointer"
          >
            <span>{showMore ? 'Ocultar itens e notas' : 'Mais detalhes (itens detalhados, observações)'}</span>
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showMore ? 'rotate-180' : ''}`} />
          </button>

          {showMore && (
            <div className="space-y-3 pt-2.5 border-t border-[#EBEEF2] mt-1.5 animate-in fade-in duration-150">
              {/* Botão de Drawer de Itens */}
              <div className="flex items-center justify-between p-3 bg-white border border-[#EBEEF2] rounded-2xl shadow-2xs">
                <div className="flex items-center gap-2">
                  <Package className="w-4 h-4 text-[#98A2B3]" />
                  <span className="text-xs font-medium text-[#0F172A]">Itens Detalhados</span>
                  <span className="text-[10px] text-[#667085]">({reviewItems.length} cadastrados)</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowItemsDrawer(true)}
                  className="text-xs font-medium text-[#2F68FE] hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>{reviewItems.length > 0 ? 'Ver / Editar' : 'Adicionar'}</span>
                </button>
              </div>

              {/* Observações */}
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-[#667085] block px-1">Observações (Opcional):</label>
                <input
                  type="text"
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  placeholder="Anotações adicionais ou tags..."
                  className="w-full bg-[#F2F4F7] border border-transparent hover:border-[#E4E7EC] focus:border-[#2F68FE] focus:bg-white rounded-xl px-3.5 py-2.5 text-xs text-[#0F172A] placeholder:text-[#98A2B3] focus:outline-none transition-all"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 5. Botões de Ação: Descartar discreto e Salvar destacado */}
      <div className="pt-4 border-t border-[#EBEEF2] flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={handleDiscardLaunch}
          disabled={savingLaunch}
          className="text-xs font-medium text-[#667085] hover:text-[#0F172A] px-3 py-2 transition-colors cursor-pointer"
        >
          Descartar
        </button>

        <div className="flex items-center gap-2">
          {duplicateWarning?.type === 'probable' && (
            <button
              type="button"
              disabled={savingLaunch}
              onClick={() => handleSaveFinalLaunch(true)}
              className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-medium text-xs transition-colors shadow-2xs touch-manipulation min-h-[42px]"
            >
              Salvar Mesmo Assim
            </button>
          )}
          <button
            type="button"
            disabled={savingLaunch || !reviewTotal}
            onClick={() => handleSaveFinalLaunch(false)}
            className="flex items-center justify-center gap-1.5 px-6 py-2.5 rounded-xl bg-[#2F68FE] hover:bg-[#2554D0] active:scale-95 disabled:bg-slate-200 disabled:text-slate-400 text-white font-medium text-xs transition-all shadow-2xs cursor-pointer disabled:cursor-not-allowed touch-manipulation min-h-[42px]"
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
