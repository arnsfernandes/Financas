'use client'

import React from 'react'
import { Search, X } from 'lucide-react'
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
  return (
    <div className="bg-[#F9FAFB] border border-[#EBEEF2] rounded-2xl p-3.5 space-y-2.5 shadow-2xs">
      {/* Linha 1: Busca sozinha ocupando toda a largura */}
      <div className="relative w-full">
        <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
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
          placeholder="Buscar por estabelecimento, categoria ou descrição..."
          className="w-full bg-white border border-slate-300 hover:border-slate-400 focus:border-[#2F68FE] rounded-xl pl-10 pr-9 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2F68FE]/20 transition-all shadow-2xs"
        />
        {txSearchText && (
          <button
            onClick={() => {
              setTxSearchText('')
              if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
              fetchTransactions({ search: undefined })
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-900 p-1 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Linha 2: Filtros secundários compactos e organizados */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {/* Seletor de Tipo: Todas / Despesas / Receitas */}
        <div className="flex items-center bg-slate-200/80 p-0.5 rounded-lg shrink-0 border border-slate-300/60">
          {(
            [
              { id: 'all', label: 'Todas' },
              { id: 'expense', label: 'Despesas' },
              { id: 'income', label: 'Receitas' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setFilterType(tab.id)
                fetchTransactions({ type: tab.id })
              }}
              className={`px-2.5 py-1 rounded-md text-xs transition-all cursor-pointer ${
                filterType === tab.id
                  ? 'bg-white text-slate-900 font-bold shadow-2xs'
                  : 'text-slate-700 hover:text-slate-950 font-medium'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

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
          className="bg-white border border-slate-300 hover:border-slate-400 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-800 focus:outline-none focus:border-[#2F68FE] focus:ring-1 focus:ring-[#2F68FE]/20 cursor-pointer shadow-2xs max-w-full"
        >
          <option value="">Todas as contas / cartões</option>
          {accounts.map((acc) => (
            <option key={acc.id} value={acc.id}>
              {acc.name} {acc.type === 'credit_card' ? '(Cartão)' : acc.institution ? `(${acc.institution})` : ''}
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
          className="bg-white border border-slate-300 hover:border-slate-400 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-800 focus:outline-none focus:border-[#2F68FE] focus:ring-1 focus:ring-[#2F68FE]/20 cursor-pointer shadow-2xs max-w-full"
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
            className="bg-white border border-slate-300 hover:border-slate-400 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-800 focus:outline-none focus:border-[#2F68FE] focus:ring-1 focus:ring-[#2F68FE]/20 cursor-pointer shadow-2xs max-w-full"
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
        <div className="flex items-center gap-1.5 text-xs text-slate-700 bg-white border border-slate-300 rounded-lg px-2.5 py-1 shadow-2xs">
          <input
            type="date"
            value={filterStartDate}
            onChange={(e) => {
              setFilterStartDate(e.target.value)
              fetchTransactions({ startDate: e.target.value })
            }}
            className="bg-transparent text-xs font-medium text-slate-800 focus:outline-none cursor-pointer max-w-[108px]"
            title="Data início"
          />
          <span className="text-slate-400 text-[11px] font-bold">-</span>
          <input
            type="date"
            value={filterEndDate}
            onChange={(e) => {
              setFilterEndDate(e.target.value)
              fetchTransactions({ endDate: e.target.value })
            }}
            className="bg-transparent text-xs font-medium text-slate-800 focus:outline-none cursor-pointer max-w-[108px]"
            title="Data fim"
          />
        </div>

        {/* Botão para limpar filtros */}
        {isAnyFilterActive && (
          <button
            onClick={handleClearAllFilters}
            className="text-xs text-slate-700 hover:text-slate-950 font-bold px-2.5 py-1 hover:bg-slate-200/70 rounded-lg transition-colors ml-auto cursor-pointer border border-slate-300"
          >
            Limpar filtros ✕
          </button>
        )}
      </div>
    </div>
  )
}
