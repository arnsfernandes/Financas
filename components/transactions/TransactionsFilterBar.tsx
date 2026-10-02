'use client'

import React, { useState } from 'react'
import { Search, X, SlidersHorizontal } from 'lucide-react'
import type { Account } from '@/lib/schema'

export interface TransactionsFilterBarProps {
  txSearchText: string
  setTxSearchText: (v: string) => void
  onSearchSubmit: (text: string) => void
  filterType: 'all' | 'expense' | 'income'
  setFilterType: (v: 'all' | 'expense' | 'income') => void
  filterAccount: string
  setFilterAccount: (v: string) => void
  accounts: Account[]
  filterCategory: string
  setFilterCategory: (v: string) => void
  categoriesList: { id: string; name: string }[]
  filterPaymentMethod?: string
  setFilterPaymentMethod?: (v: string) => void
  isPaymentMethodHidden: boolean
  filterStartDate: string
  setFilterStartDate: (v: string) => void
  filterEndDate: string
  setFilterEndDate: (v: string) => void
  isAnyFilterActive: boolean
  handleClearAllFilters: () => void
  searchTimeoutRef: React.MutableRefObject<NodeJS.Timeout | null>
  fetchTransactions: (customFilters?: any) => Promise<void>
}

export function TransactionsFilterBar({
  txSearchText,
  setTxSearchText,
  onSearchSubmit,
  filterType,
  setFilterType,
  filterAccount,
  setFilterAccount,
  accounts,
  filterCategory,
  setFilterCategory,
  categoriesList,
  filterPaymentMethod,
  setFilterPaymentMethod,
  isPaymentMethodHidden,
  filterStartDate,
  setFilterStartDate,
  filterEndDate,
  setFilterEndDate,
  isAnyFilterActive,
  handleClearAllFilters,
  searchTimeoutRef,
  fetchTransactions,
}: TransactionsFilterBarProps) {
  const [showSecondaryFilters, setShowSecondaryFilters] = useState(false)

  // Quantidade de filtros secundários ativos (excluindo busca e tipo)
  const activeSecondaryCount = [
    Boolean(filterAccount),
    Boolean(filterCategory),
    Boolean(filterPaymentMethod && !isPaymentMethodHidden),
    Boolean(filterStartDate || filterEndDate),
  ].filter(Boolean).length

  return (
    <div className="bg-white border border-[#EBEEF2] rounded-2xl p-3 space-y-2.5 shadow-2xs select-none">
      {/* Segmented Control iOS: Todos / Gastos / Entradas */}
      <div className="flex bg-[#F2F4F7] p-1 rounded-xl border border-transparent">
        <button
          type="button"
          onClick={() => {
            setFilterType('all')
            fetchTransactions({ type: 'all' })
          }}
          className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-all ${
            filterType === 'all'
              ? 'bg-white text-[#0F172A] font-semibold shadow-2xs'
              : 'text-[#667085] hover:text-[#0F172A]'
          }`}
        >
          Todos
        </button>
        <button
          type="button"
          onClick={() => {
            setFilterType('expense')
            fetchTransactions({ type: 'expense' })
          }}
          className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-all ${
            filterType === 'expense'
              ? 'bg-white text-[#0F172A] font-semibold shadow-2xs'
              : 'text-[#667085] hover:text-[#0F172A]'
          }`}
        >
          Gastos
        </button>
        <button
          type="button"
          onClick={() => {
            setFilterType('income')
            fetchTransactions({ type: 'income' })
          }}
          className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-all ${
            filterType === 'income'
              ? 'bg-white text-[#0F172A] font-semibold shadow-2xs'
              : 'text-[#667085] hover:text-[#0F172A]'
          }`}
        >
          Entradas
        </button>
      </div>

      {/* Linha 2: Busca e Botão Filtros */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="w-3.5 h-3.5 text-[#98A2B3] absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={txSearchText}
            onChange={(e) => setTxSearchText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
                onSearchSubmit(txSearchText.trim())
              }
            }}
            placeholder="Buscar lançamentos..."
            className="w-full bg-[#F2F4F7] border border-transparent hover:border-[#E4E7EC] focus:border-[#2F68FE] focus:bg-white rounded-xl pl-9 pr-8 py-2 text-xs text-[#0F172A] placeholder:text-[#98A2B3] focus:outline-none transition-all"
          />
          {txSearchText && (
            <button
              onClick={() => {
                setTxSearchText('')
                if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
                fetchTransactions({ search: undefined })
              }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#98A2B3] hover:text-[#0F172A] p-1 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Botão Filtros Secundários */}
        <button
          type="button"
          onClick={() => setShowSecondaryFilters(!showSecondaryFilters)}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-normal transition-all shrink-0 cursor-pointer ${
            activeSecondaryCount > 0 || showSecondaryFilters
              ? 'bg-[#EBF2FF] border-[#2F68FE]/30 text-[#2F68FE] font-semibold'
              : 'bg-[#F2F4F7] border-transparent text-[#667085] hover:text-[#0F172A]'
          }`}
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          <span>Filtros</span>
          {activeSecondaryCount > 0 && (
            <span className="w-4 h-4 rounded-full bg-[#2F68FE] text-white text-[10px] flex items-center justify-center font-bold">
              {activeSecondaryCount}
            </span>
          )}
        </button>
        {isAnyFilterActive && (
          <button
            type="button"
            onClick={handleClearAllFilters}
            className="p-2 rounded-xl bg-[#F2F4F7] text-[#667085] hover:text-rose-500 border border-transparent transition-all shrink-0 cursor-pointer"
            title="Limpar todos os filtros"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Linha 3: Filtros secundários colapsáveis */}
      {showSecondaryFilters && (
        <div className="pt-2 border-t border-[#EBEEF2] flex flex-wrap items-center gap-2 text-xs animate-in fade-in duration-150">
          {/* Conta / Cartão */}
          <select
            value={filterAccount}
            onChange={(e) => {
              const newAccountId = e.target.value
              setFilterAccount(newAccountId)
              const targetAcc = accounts.find((a) => a.id === newAccountId)
              const shouldHide = Boolean(
                !targetAcc ||
                  targetAcc.type === 'credit_card' ||
                  targetAcc.type === 'debit_card' ||
                  targetAcc.type === 'cash' ||
                  targetAcc.type !== 'bank_account'
              )
              if (shouldHide && filterPaymentMethod) {
                if (setFilterPaymentMethod) setFilterPaymentMethod('')
                fetchTransactions({ accountId: newAccountId, paymentMethod: '' })
              } else {
                fetchTransactions({ accountId: newAccountId })
              }
            }}
            className="bg-[#F2F4F7] border border-transparent hover:border-[#E4E7EC] focus:border-[#2F68FE] focus:bg-white rounded-xl px-2.5 py-1.5 text-xs text-[#0F172A] focus:outline-none cursor-pointer max-w-full flex-1 sm:flex-initial"
          >
            <option value="">Todas as contas / cartões</option>
            {accounts.map((acc) => (
              <option key={acc.id} value={acc.id}>
                {acc.name}{acc.institution ? ` • ${acc.institution}` : ''}
              </option>
            ))}
          </select>

          {/* Categoria */}
          <select
            value={filterCategory}
            onChange={(e) => {
              setFilterCategory(e.target.value)
              fetchTransactions({ category: e.target.value })
            }}
            className="bg-[#F2F4F7] border border-transparent hover:border-[#E4E7EC] focus:border-[#2F68FE] focus:bg-white rounded-xl px-2.5 py-1.5 text-xs text-[#0F172A] focus:outline-none cursor-pointer max-w-full flex-1 sm:flex-initial"
          >
            <option value="">Todas as categorias</option>
            {categoriesList.map((cat) => (
              <option key={cat.id} value={cat.name}>
                {cat.name}
              </option>
            ))}
          </select>

          {/* Forma de Pagamento */}
          {!isPaymentMethodHidden && (
            <select
              value={filterPaymentMethod}
              onChange={(e) => {
                if (setFilterPaymentMethod) setFilterPaymentMethod(e.target.value)
                fetchTransactions({ paymentMethod: e.target.value })
              }}
              className="bg-[#F2F4F7] border border-transparent hover:border-[#E4E7EC] focus:border-[#2F68FE] focus:bg-white rounded-xl px-2.5 py-1.5 text-xs text-[#0F172A] focus:outline-none cursor-pointer max-w-full flex-1 sm:flex-initial"
            >
              <option value="">Todas as formas</option>
              <option value="PIX">PIX</option>
              <option value="Cartão de Débito">Débito</option>
              <option value="Cartão de Crédito">Crédito</option>
              <option value="Boleto">Boleto</option>
              <option value="Transferência">Transferência</option>
              <option value="Dinheiro">Dinheiro</option>
              <option value="Outros">Outros</option>
            </select>
          )}

          {/* Intervalo de Datas Compacto */}
          <div className="flex items-center gap-1.5 text-xs text-[#0F172A] bg-[#F2F4F7] border border-transparent rounded-xl px-2.5 py-1">
            <input
              type="date"
              value={filterStartDate}
              onChange={(e) => {
                setFilterStartDate(e.target.value)
                fetchTransactions({ startDate: e.target.value })
              }}
              className="bg-transparent text-xs font-normal text-[#0F172A] focus:outline-none cursor-pointer max-w-[108px]"
              title="Data início"
            />
            <span className="text-[#98A2B3] text-[11px] font-bold">-</span>
            <input
              type="date"
              value={filterEndDate}
              onChange={(e) => {
                setFilterEndDate(e.target.value)
                fetchTransactions({ endDate: e.target.value })
              }}
              className="bg-transparent text-xs font-normal text-[#0F172A] focus:outline-none cursor-pointer max-w-[108px]"
              title="Data fim"
            />
          </div>
        </div>
      )}
    </div>
  )
}
