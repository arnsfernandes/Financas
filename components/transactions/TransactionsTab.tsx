'use client'

import React, { useState, useMemo, useEffect } from 'react'
import {
  Search,
  X,
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Repeat,
  CreditCard,
  ChevronRight,
  Edit2,
  Trash2,
} from 'lucide-react'
import type { Account } from '@/lib/schema'
import { formatBRL } from '@/lib/formatters'
import { EditTransactionModal } from '@/components/modals/EditTransactionModal'
import { useTelegramWebApp } from '@/lib/useTelegramWebApp'

export interface TransactionItem {
  id: string
  product_id?: string | null
  description: string
  normalized_name?: string | null
  quantity?: number | null
  unit_price?: number | null
  total?: number | null
  category?: string | null
  canonical_products?: {
    id: string
    canonical_name: string
    brand?: string | null
    unit_size?: string | null
  } | null
}

export interface TransactionRecord {
  id: string
  type?: 'expense' | 'income'
  account_id?: string | null
  accounts?: Account | null
  vendor: string | null
  vendor_address: string | null
  date: string | null
  time: string | null
  currency: string
  category: string | null
  category_id?: string | null
  categories?: {
    id: string
    name: string
    icon?: string | null
    color?: string | null
  } | null
  subtotal: number | null
  tax: number | null
  tip: number | null
  total: number
  payment_method: string | null
  notes: string | null
  source_type: string
  origin_type?: 'text' | 'image' | 'manual' | null
  raw_text?: string | null
  original_filename?: string | null
  image_sha256?: string | null
  captured_at?: string | null
  original_extracted_data?: any | null
  is_recurring?: boolean
  recurrence_frequency?: string | null
  recurrence_next_date?: string | null
  recurrence_status?: 'active' | 'ended'
  installment_group_id?: string | null
  installment_current?: number | null
  installment_total?: number | null
  installment_amount?: number | null
  review_status?: 'confirmed' | 'needs_review'
  review_reasons?: string[]
  vendor_id?: string | null
  canonical_vendors?: {
    id: string
    canonical_name: string
    normalized_key?: string | null
  } | null
  created_at: string
  transaction_items?: TransactionItem[]
}

export interface InstallmentGroupItem {
  type: 'installment_group'
  groupId: string
  vendor: string
  totalPurchaseAmount: number
  installmentCount: number
  installmentAmount: number
  date: string
  category: string | null
  categories?: any
  accountName: string | null
  paymentMethod: string | null
  installments: TransactionRecord[]
}

export type DisplayListItem =
  | {
      type: 'single'
      tx: TransactionRecord
    }
  | InstallmentGroupItem

export interface TransactionsTabProps {
  transactions: TransactionRecord[]
  loadingTx: boolean
  txError?: string
  accounts: Account[]
  // Drawer compartilhado (usado por Transactions e Reports)
  selectedDrawerTx: TransactionRecord | null
  setSelectedDrawerTx: (tx: TransactionRecord | null) => void
  // Filtros compartilhados (podem ser definidos via Dashboard/navegação)
  filterType: 'all' | 'expense' | 'income'
  setFilterType: (v: 'all' | 'expense' | 'income') => void
  filterAccount: string
  setFilterAccount: (v: string) => void
  filterPaymentMethod?: string
  setFilterPaymentMethod?: (v: string) => void
  filterRecurring: 'all' | 'recurring' | 'installment'
  setFilterRecurring: (v: 'all' | 'recurring' | 'installment') => void
  filterStartDate: string
  setFilterStartDate: (v: string) => void
  filterEndDate: string
  setFilterEndDate: (v: string) => void
  filterVendor: string
  setFilterVendor: (v: string) => void
  filterCategory: string
  setFilterCategory: (v: string) => void
  fetchTransactions: (customFilters?: {
    type?: 'all' | 'expense' | 'income'
    accountId?: string
    paymentMethod?: string
    recurringFilter?: 'all' | 'recurring' | 'installment'
    isRecurring?: boolean
    isInstallment?: boolean
    startDate?: string
    endDate?: string
    vendor?: string
    category?: string
  }) => Promise<void>
  onDeleteTransaction: (id: string, vendor?: string | null) => Promise<void>
  onTransactionUpdated: (updatedTx: TransactionRecord) => void
  className?: string
}

export function TransactionsTab({
  transactions,
  loadingTx,
  txError,
  accounts,
  selectedDrawerTx,
  setSelectedDrawerTx,
  filterType,
  setFilterType,
  filterAccount,
  setFilterAccount,
  filterPaymentMethod = '',
  setFilterPaymentMethod,
  filterRecurring,
  setFilterRecurring,
  filterStartDate,
  setFilterStartDate,
  filterEndDate,
  setFilterEndDate,
  filterVendor,
  setFilterVendor,
  filterCategory,
  setFilterCategory,
  fetchTransactions,
  onDeleteTransaction,
  onTransactionUpdated,
  className,
}: TransactionsTabProps) {
  const { fetchWithAuth } = useTelegramWebApp()

  // Filtros e busca textual
  const [txSearchText, setTxSearchText] = useState('')

  // Lista de categorias para o filtro
  const [categoriesList, setCategoriesList] = useState<{ id: string; name: string }[]>([])

  useEffect(() => {
    fetchWithAuth('/api/categories?activeOnly=true')
      .then((res) => res.json())
      .then((data) => {
        if (data.ok && Array.isArray(data.categories)) {
          setCategoriesList(data.categories)
        }
      })
      .catch(() => {})
  }, [])

  // Modal de Edição Completa
  const [editingTx, setEditingTx] = useState<TransactionRecord | null>(null)

  // Drawer de Compra Parcelada Agrupada
  const [selectedInstallmentGroup, setSelectedInstallmentGroup] = useState<InstallmentGroupItem | null>(null)
  const [selectedGroupDetails, setSelectedGroupDetails] = useState<TransactionRecord[]>([])
  const [loadingGroupInstallments, setLoadingGroupInstallments] = useState(false)

  // Estado de exclusão
  const [deletingTxId, setDeletingTxId] = useState<string | null>(null)

  // 1. Agrupamento visual das compras parceladas por installment_group_id
  const displayItems = useMemo(() => {
    const items: DisplayListItem[] = []
    const groupsMap = new Map<string, InstallmentGroupItem>()

    for (const tx of transactions) {
      if (tx.installment_group_id && (tx.installment_total || 0) > 1) {
        const gId = tx.installment_group_id
        if (groupsMap.has(gId)) {
          const group = groupsMap.get(gId)!
          group.installments.push(tx)
        } else {
          const totalInst = tx.installment_total || 1
          const instAmount = Number(tx.installment_amount) || Number(tx.total)
          const totalPurchaseAmount = tx.installment_amount
            ? Number(tx.installment_amount) * totalInst
            : Number(tx.total) * totalInst

          const group: InstallmentGroupItem = {
            type: 'installment_group',
            groupId: gId,
            vendor: tx.canonical_vendors?.canonical_name || tx.vendor || 'Compra parcelada',
            totalPurchaseAmount,
            installmentCount: totalInst,
            installmentAmount: instAmount,
            date: tx.date || tx.created_at,
            category: tx.categories?.name || tx.category || null,
            categories: tx.categories,
            accountName: tx.accounts?.name || null,
            paymentMethod: tx.payment_method || 'Cartão de Crédito',
            installments: [tx],
          }
          groupsMap.set(gId, group)
          items.push(group)
        }
      } else {
        items.push({ type: 'single', tx })
      }
    }

    return items
  }, [transactions])

  // Conta selecionada e visibilidade do filtro de forma de pagamento
  const selectedAccountObj = useMemo(
    () => accounts.find((a) => a.id === filterAccount),
    [accounts, filterAccount]
  )
  // Mostrar forma de pagamento APENAS quando uma conta bancária com múltiplos meios estiver selecionada
  const isPaymentMethodHidden = Boolean(
    !selectedAccountObj ||
      selectedAccountObj.type === 'credit_card' ||
      selectedAccountObj.type === 'debit_card' ||
      selectedAccountObj.type === 'cash' ||
      selectedAccountObj.type !== 'bank_account'
  )

  // Quando o filtro de forma de pagamento for oculto, limpar qualquer valor anterior
  useEffect(() => {
    if (isPaymentMethodHidden && filterPaymentMethod) {
      if (setFilterPaymentMethod) setFilterPaymentMethod('')
      fetchTransactions({ paymentMethod: '' })
    }
  }, [isPaymentMethodHidden, filterPaymentMethod, setFilterPaymentMethod, fetchTransactions])

  // 2. Filtro local e refinamento
  const filteredDisplayItems = useMemo(() => {
    return displayItems.filter((item) => {
      // Busca textual
      if (txSearchText) {
        const q = txSearchText.toLowerCase()
        if (item.type === 'single') {
          const v = (item.tx.canonical_vendors?.canonical_name || item.tx.vendor || '').toLowerCase()
          const c = (item.tx.categories?.name || item.tx.category || '').toLowerCase()
          const n = (item.tx.notes || '').toLowerCase()
          if (!v.includes(q) && !c.includes(q) && !n.includes(q)) return false
        } else {
          const v = item.vendor.toLowerCase()
          const c = (item.category || '').toLowerCase()
          if (!v.includes(q) && !c.includes(q)) return false
        }
      }

      // Tipo: Todas / Despesas / Receitas
      if (filterType !== 'all') {
        if (item.type === 'single') {
          if (item.tx.type !== filterType) return false
        } else {
          if (filterType === 'income') return false
        }
      }

      // Forma de Pagamento (tratamento especial para Cartão de Crédito, somente se visível)
      if (filterPaymentMethod && !isPaymentMethodHidden) {
        const pmFilter = filterPaymentMethod.toLowerCase()
        const isCCFilter =
          pmFilter.includes('crédito') || pmFilter.includes('credito') || pmFilter === 'credit_card'

        if (item.type === 'single') {
          const txPm = (item.tx.payment_method || '').toLowerCase()
          const isTxCC =
            txPm.includes('crédito') ||
            txPm.includes('credito') ||
            txPm === 'credit_card' ||
            item.tx.accounts?.type === 'credit_card'

          if (isCCFilter) {
            if (!isTxCC) return false
          } else {
            if (!txPm.includes(pmFilter)) return false
          }
        } else {
          // Parcelamentos são cartão de crédito por padrão
          if (isCCFilter) {
            // Aceita o parcelamento
          } else {
            const grpPm = (item.paymentMethod || '').toLowerCase()
            if (!grpPm.includes(pmFilter)) return false
          }
        }
      }

      // Conta / Cartão
      if (filterAccount) {
        if (item.type === 'single') {
          if (item.tx.account_id !== filterAccount) return false
        } else {
          const hasAcc = item.installments.some((inst) => inst.account_id === filterAccount)
          if (!hasAcc) return false
        }
      }

      // Categoria
      if (filterCategory) {
        const catFilter = filterCategory.toLowerCase()
        if (item.type === 'single') {
          const c = (item.tx.categories?.name || item.tx.category || '').toLowerCase()
          if (!c.includes(catFilter)) return false
        } else {
          const c = (item.category || '').toLowerCase()
          if (!c.includes(catFilter)) return false
        }
      }

      return true
    })
  }, [displayItems, txSearchText, filterType, filterPaymentMethod, isPaymentMethodHidden, filterAccount, filterCategory])

  // Abertura do Drawer de Compra Parcelada Agrupada
  async function handleOpenInstallmentGroup(group: InstallmentGroupItem) {
    setSelectedDrawerTx(null)
    setSelectedInstallmentGroup(group)
    setSelectedGroupDetails(group.installments)

    // Se nem todas as parcelas estão no array local, busca todas no banco
    if (group.installments.length < group.installmentCount) {
      setLoadingGroupInstallments(true)
      try {
        const res = await fetchWithAuth(`/api/transactions?installmentGroupId=${group.groupId}&limit=100`)
        const data = await res.json()
        if (data.ok && Array.isArray(data.transactions) && data.transactions.length > 0) {
          const sorted = [...data.transactions].sort(
            (a, b) => (a.installment_current || 0) - (b.installment_current || 0)
          )
          setSelectedGroupDetails(sorted)
        }
      } catch (err) {
        console.warn('Erro ao carregar todas as parcelas do grupo:', err)
      } finally {
        setLoadingGroupInstallments(false)
      }
    } else {
      const sorted = [...group.installments].sort(
        (a, b) => (a.installment_current || 0) - (b.installment_current || 0)
      )
      setSelectedGroupDetails(sorted)
    }
  }

  async function handleDelete(e: React.MouseEvent, id: string, vendor?: string | null) {
    e.stopPropagation()
    const confirmMsg = vendor
      ? `Tem certeza que deseja excluir o lançamento de "${vendor}"?`
      : 'Tem certeza que deseja excluir este lançamento?'

    if (!window.confirm(confirmMsg)) return

    setDeletingTxId(id)
    try {
      await onDeleteTransaction(id, vendor)
      if (selectedDrawerTx?.id === id) {
        setSelectedDrawerTx(null)
      }
      setSelectedGroupDetails((prev) => prev.filter((p) => p.id !== id))
    } finally {
      setDeletingTxId(null)
    }
  }

  function handleStartEditing(e: React.MouseEvent, tx: TransactionRecord) {
    e.stopPropagation()
    setEditingTx(tx)
  }

  const isAnyFilterActive = Boolean(
    filterType !== 'all' ||
      filterAccount ||
      (filterPaymentMethod && !isPaymentMethodHidden) ||
      filterCategory ||
      filterStartDate ||
      filterEndDate ||
      txSearchText
  )

  function handleClearAllFilters() {
    setFilterType('all')
    setFilterAccount('')
    if (setFilterPaymentMethod) setFilterPaymentMethod('')
    setFilterCategory('')
    setFilterStartDate('')
    setFilterEndDate('')
    setFilterVendor('')
    setTxSearchText('')
    fetchTransactions({
      type: 'all',
      accountId: '',
      paymentMethod: '',
      category: '',
      startDate: '',
      endDate: '',
      vendor: '',
    })
  }

  return (
    <section className={`space-y-6 pb-12 ${className || ''}`}>
      {/* 1. CABEÇALHO */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#EBEEF2]">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#111827]">
            Transações
          </h1>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="text-xs text-[#6B7280] font-medium">
            {filteredDisplayItems.length} registro{filteredDisplayItems.length !== 1 ? 's' : ''}
          </span>
          <button
            onClick={() => fetchTransactions()}
            disabled={loadingTx}
            className="p-2 rounded-xl border border-[#E5E7EB] bg-white text-[#6B7280] hover:text-[#111827] hover:border-[#D1D5DB] transition-all disabled:opacity-40 shadow-2xs cursor-pointer"
            title="Atualizar lista"
          >
            <span className={`inline-block text-sm leading-none ${loadingTx ? 'animate-spin' : ''}`}>↻</span>
          </button>
        </div>
      </div>

      {/* 2. BARRA DE FERRAMENTAS E FILTROS */}
      <div className="bg-[#F9FAFB] border border-[#EBEEF2] rounded-2xl p-4 space-y-3.5 shadow-2xs">
        {/* Linha Principal: Busca Dominante + Seletor de Tipo */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          {/* Busca textual dominante */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-[#9CA3AF] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={txSearchText}
              onChange={(e) => setTxSearchText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  fetchTransactions({ vendor: txSearchText.trim() || undefined })
                }
              }}
              placeholder="Buscar por estabelecimento, categoria ou descrição..."
              className="w-full bg-white border border-[#E5E7EB] hover:border-[#D1D5DB] focus:border-[#2F68FE] rounded-xl pl-10 pr-9 py-2.5 text-sm text-[#111827] placeholder-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#2F68FE]/15 transition-all shadow-2xs"
            />
            {txSearchText && (
              <button
                onClick={() => {
                  setTxSearchText('')
                  fetchTransactions({ vendor: undefined })
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9CA3AF] hover:text-[#111827] p-1"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Filtro de Tipo: Todas / Despesas / Receitas */}
          <div className="flex items-center bg-[#ECEEF2] p-1 rounded-xl shrink-0">
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
                className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                  filterType === tab.id
                    ? 'bg-white text-[#111827] font-semibold shadow-2xs'
                    : 'text-[#6B7280] hover:text-[#111827]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Linha de Filtros Secundários: Conta, Categoria, Meio (se aplicável), Período e Limpar */}
        <div className="flex flex-wrap items-center gap-2.5 text-xs">
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
            className="bg-white border border-[#E5E7EB] hover:border-[#D1D5DB] rounded-xl px-3.5 py-2 text-xs font-medium text-[#374151] focus:outline-none focus:border-[#2F68FE] focus:ring-1 focus:ring-[#2F68FE]/20 cursor-pointer shadow-2xs"
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
            className="bg-white border border-[#E5E7EB] hover:border-[#D1D5DB] rounded-xl px-3.5 py-2 text-xs font-medium text-[#374151] focus:outline-none focus:border-[#2F68FE] focus:ring-1 focus:ring-[#2F68FE]/20 cursor-pointer shadow-2xs"
          >
            <option value="">Todas as categorias</option>
            {categoriesList.map((cat) => (
              <option key={cat.id} value={cat.name}>
                {cat.name}
              </option>
            ))}
          </select>

          {/* Forma de Pagamento (só exibida quando relevante: conta bancária com múltiplos meios) */}
          {!isPaymentMethodHidden && (
            <select
              value={filterPaymentMethod}
              onChange={(e) => {
                if (setFilterPaymentMethod) setFilterPaymentMethod(e.target.value)
                fetchTransactions({ paymentMethod: e.target.value })
              }}
              className="bg-white border border-[#E5E7EB] hover:border-[#D1D5DB] rounded-xl px-3.5 py-2 text-xs font-medium text-[#374151] focus:outline-none focus:border-[#2F68FE] focus:ring-1 focus:ring-[#2F68FE]/20 cursor-pointer shadow-2xs"
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

          {/* Período (De / Até) */}
          <div className="flex items-center gap-2 text-xs text-[#6B7280] bg-white border border-[#E5E7EB] rounded-xl px-3 py-1.5 shadow-2xs">
            <input
              type="date"
              value={filterStartDate}
              onChange={(e) => {
                setFilterStartDate(e.target.value)
                fetchTransactions({ startDate: e.target.value })
              }}
              className="bg-transparent text-xs text-[#374151] focus:outline-none cursor-pointer"
              title="Data início"
            />
            <span className="text-[#9CA3AF] text-xs font-medium">até</span>
            <input
              type="date"
              value={filterEndDate}
              onChange={(e) => {
                setFilterEndDate(e.target.value)
                fetchTransactions({ endDate: e.target.value })
              }}
              className="bg-transparent text-xs text-[#374151] focus:outline-none cursor-pointer"
              title="Data fim"
            />
          </div>

          {/* Botão discreto para limpar filtros */}
          {isAnyFilterActive && (
            <button
              onClick={handleClearAllFilters}
              className="text-xs text-[#6B7280] hover:text-[#111827] font-medium px-3 py-1.5 hover:bg-white rounded-xl transition-colors ml-auto cursor-pointer"
            >
              Limpar filtros ✕
            </button>
          )}
        </div>
      </div>

      {txError && (
        <div className="border border-red-200 bg-red-50 text-red-700 rounded-xl px-4 py-2.5 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
          <span>{txError}</span>
        </div>
      )}

      {/* 3. LISTA DE TRANSAÇÕES REFINADA E CONFORTÁVEL */}
      {loadingTx && filteredDisplayItems.length === 0 ? (
        <div className="text-center py-16 text-[#9CA3AF] text-sm font-medium animate-pulse">
          Carregando transações…
        </div>
      ) : filteredDisplayItems.length === 0 ? (
        <div className="text-center py-12 border border-[#EBEEF2] rounded-2xl text-[#9CA3AF] text-sm bg-white">
          Nenhuma transação encontrada com os filtros atuais.
        </div>
      ) : (
        <div className="bg-white border border-[#EBEEF2] rounded-2xl shadow-2xs overflow-hidden">
          <div className="divide-y divide-[#F4F5F7]">
            {filteredDisplayItems.map((item) => {
              // 1. Compra Parcelada Agrupada
              if (item.type === 'installment_group') {
                const isSelected = selectedInstallmentGroup?.groupId === item.groupId

                return (
                  <div
                    key={`group-${item.groupId}`}
                    onClick={() => handleOpenInstallmentGroup(item)}
                    className={`flex items-center justify-between px-4 py-3.5 sm:px-5 sm:py-4 hover:bg-[#F9FAFB] cursor-pointer transition-colors group ${
                      isSelected ? 'bg-[#F0F4FF] hover:bg-[#F0F4FF]' : ''
                    }`}
                  >
                    {/* Lado Esquerdo: Ícone + Título + Badge + Metadados */}
                    <div className="flex items-center gap-3.5 min-w-0 pr-3">
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-amber-50 text-amber-600">
                        <CreditCard className="w-4 h-4" />
                      </div>

                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap leading-tight">
                          <span className="text-sm font-semibold text-[#111827] group-hover:text-[#2F68FE] transition-colors truncate">
                            {item.vendor}
                          </span>
                          <span className="text-[11px] px-2 py-0.5 rounded-md font-medium bg-amber-50 text-amber-800 border border-amber-200/60">
                            {item.installmentCount}x de {formatBRL(item.installmentAmount)}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 text-xs text-[#9CA3AF] truncate">
                          <span className="text-[#6B7280]">
                            {item.date
                              ? new Date(item.date + 'T00:00:00').toLocaleDateString('pt-BR')
                              : '—'}
                          </span>
                          {item.category && (
                            <>
                              <span>•</span>
                              <span className="truncate text-[#6B7280]">
                                {item.category}
                              </span>
                            </>
                          )}
                          {(item.accountName || item.paymentMethod) && (
                            <>
                              <span>•</span>
                              <span className="truncate text-[#6B7280]">
                                {item.accountName || item.paymentMethod}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Lado Direito: Valor Total + Detalhe Parcela + Seta */}
                    <div className="flex items-center gap-3.5 shrink-0">
                      <div className="text-right leading-tight">
                        <span className="text-sm sm:text-base font-bold whitespace-nowrap text-[#111827] block">
                          - {formatBRL(item.totalPurchaseAmount)}
                        </span>
                        <span className="text-xs text-[#9CA3AF] block font-normal mt-0.5">
                          {item.installmentCount}x de {formatBRL(item.installmentAmount)}
                        </span>
                      </div>
                      <ChevronRight className="w-4 h-4 text-[#D1D5DB] group-hover:text-[#9CA3AF] transition-all" />
                    </div>
                  </div>
                )
              }

              // 2. Lançamento Individual (Não parcelado)
              const tx = item.tx
              const isIncome = tx.type === 'income'
              const isRecurring = tx.is_recurring
              const isSelected = selectedDrawerTx?.id === tx.id

              return (
                <div
                  key={tx.id}
                  onClick={() => {
                    setSelectedInstallmentGroup(null)
                    setSelectedDrawerTx(tx)
                  }}
                  className={`flex items-center justify-between px-4 py-3.5 sm:px-5 sm:py-4 hover:bg-[#F9FAFB] cursor-pointer transition-colors group ${
                    isSelected ? 'bg-[#F0F4FF] hover:bg-[#F0F4FF]' : ''
                  }`}
                >
                  {/* Lado Esquerdo: Ícone + Título + Metadados */}
                  <div className="flex items-center gap-3.5 min-w-0 pr-3">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                        isIncome
                          ? 'bg-emerald-50 text-emerald-600'
                          : isRecurring
                          ? 'bg-blue-50 text-blue-600'
                          : 'bg-[#F4F5F7] text-[#6B7280]'
                      }`}
                    >
                      {isIncome ? (
                        <ArrowDownLeft className="w-4 h-4" />
                      ) : isRecurring ? (
                        <Repeat className="w-4 h-4" />
                      ) : (
                        <ArrowUpRight className="w-4 h-4" />
                      )}
                    </div>

                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap leading-tight">
                        <span className="text-sm font-semibold text-[#111827] group-hover:text-[#2F68FE] transition-colors truncate">
                          {tx.canonical_vendors?.canonical_name ||
                            tx.vendor ||
                            (isIncome ? 'Receita' : 'Sem estabelecimento')}
                        </span>

                        {isRecurring && (
                          <span className="text-[11px] px-2 py-0.5 rounded-md font-medium bg-blue-50 text-blue-700 border border-blue-200/60">
                            Recorrente
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 text-xs text-[#9CA3AF] truncate">
                        <span className="text-[#6B7280]">
                          {tx.date
                            ? new Date(tx.date + 'T00:00:00').toLocaleDateString('pt-BR')
                            : new Date(tx.created_at).toLocaleDateString('pt-BR')}
                        </span>
                        {(tx.categories?.name || tx.category) && (
                          <>
                            <span>•</span>
                            <span className="inline-flex items-center gap-1.5 truncate text-[#6B7280]">
                              {tx.categories?.color && (
                                <span
                                  className="w-2 h-2 rounded-full shrink-0"
                                  style={{ backgroundColor: tx.categories.color }}
                                />
                              )}
                              <span className="truncate">{tx.categories?.name || tx.category}</span>
                            </span>
                          </>
                        )}
                        {(tx.accounts || tx.payment_method) && (
                          <>
                            <span>•</span>
                            <span className="truncate text-[#6B7280]">
                              {tx.accounts?.name || tx.payment_method}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Lado Direito: Valor em Destaque + Seta Suave */}
                  <div className="flex items-center gap-3.5 shrink-0">
                    <span
                      className={`text-sm sm:text-base font-bold whitespace-nowrap ${
                        isIncome ? 'text-[#10B981]' : 'text-[#111827]'
                      }`}
                    >
                      {isIncome ? '+' : '-'} {formatBRL(tx.total)}
                    </span>
                    <ChevronRight className="w-4 h-4 text-[#D1D5DB] group-hover:text-[#9CA3AF] transition-all" />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* 4. DRAWER / MODAL: DETALHES DE COMPRA PARCELADA */}
      {selectedInstallmentGroup && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-[2px] transition-opacity"
          onClick={() => setSelectedInstallmentGroup(null)}
        >
          <div
            className="w-full max-w-lg bg-white h-full shadow-2xl flex flex-col border-l border-[#EBEEF2] animate-in slide-in-from-right duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Cabeçalho do Drawer de Parcelamento */}
            <div className="p-5 border-b border-[#EBEEF2] flex items-center justify-between bg-white sticky top-0 z-10">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 bg-amber-50 text-amber-700">
                  <CreditCard className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-base text-[#111827] truncate">
                    {selectedInstallmentGroup.vendor}
                  </h3>
                  <p className="text-xs text-[#6B7280]">
                    Compra parcelada em {selectedInstallmentGroup.installmentCount}x • Total:{' '}
                    {formatBRL(selectedInstallmentGroup.totalPurchaseAmount)}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedInstallmentGroup(null)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-[#6B7280] hover:text-[#111827] hover:bg-[#F3F4F6] transition-colors"
                title="Fechar painel"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Conteúdo com a Lista de Parcelas */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* Card Resumo do Parcelamento */}
              <div className="p-4 bg-[#F9FAFB] border border-[#EBEEF2] rounded-2xl text-center">
                <span className="text-[11px] font-semibold text-[#6B7280] uppercase tracking-wider block mb-1">
                  Valor Total da Compra
                </span>
                <span className="text-2xl font-extrabold tracking-tight text-[#111827] block">
                  - {formatBRL(selectedInstallmentGroup.totalPurchaseAmount)}
                </span>
                <span className="text-xs text-[#6B7280] mt-1 block">
                  {selectedInstallmentGroup.installmentCount} parcelas de{' '}
                  {formatBRL(selectedInstallmentGroup.installmentAmount)}
                </span>
              </div>

              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#9CA3AF]">
                  Todas as Parcelas ({selectedGroupDetails.length}/{selectedInstallmentGroup.installmentCount})
                </h4>

                {loadingGroupInstallments && selectedGroupDetails.length === 0 ? (
                  <div className="text-center py-8 text-xs text-[#9CA3AF] animate-pulse">
                    Carregando parcelas…
                  </div>
                ) : (
                  <div className="space-y-3">
                    {selectedGroupDetails.map((inst) => {
                      const cur = inst.installment_current || 1
                      const tot = inst.installment_total || selectedInstallmentGroup.installmentCount

                      return (
                        <div
                          key={inst.id}
                          className="bg-white border border-[#EBEEF2] rounded-xl p-3.5 shadow-sm space-y-2.5"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-xs text-[#111827]">
                                  Parcela {cur} de {tot}
                                </span>
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 font-medium">
                                  {cur}/{tot}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 text-xs text-[#6B7280] mt-1 flex-wrap">
                                <span className="font-medium text-[#374151]">
                                  {inst.date
                                    ? new Date(inst.date + 'T00:00:00').toLocaleDateString('pt-BR')
                                    : 'Data não informada'}
                                </span>
                                <span>•</span>
                                <span>{inst.accounts?.name || selectedInstallmentGroup.accountName || 'Cartão de Crédito'}</span>
                                <span>•</span>
                                <span>{inst.payment_method || selectedInstallmentGroup.paymentMethod || 'Cartão de Crédito'}</span>
                                <span>•</span>
                                <span className="px-1.5 py-0.5 rounded bg-[#F4F5F7] text-[#4B5563] text-[11px]">
                                  {inst.categories?.name || inst.category || selectedInstallmentGroup.category || 'Outros'}
                                </span>
                              </div>
                            </div>

                            <div className="text-right shrink-0">
                              <span className="font-bold text-xs sm:text-sm text-[#EF4444] block">
                                - {formatBRL(inst.total || selectedInstallmentGroup.installmentAmount)}
                              </span>
                            </div>
                          </div>

                          {/* Ações por parcela: Editar e Excluir */}
                          <div className="pt-2 border-t border-[#F4F5F7] flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={(e) => handleStartEditing(e, inst)}
                              className="px-2.5 py-1 text-xs font-medium text-[#2F68FE] bg-[#EBF2FE] hover:bg-[#DDE9FD] rounded-lg transition-colors flex items-center gap-1.5"
                              title="Editar esta parcela"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                              Editar
                            </button>

                            <button
                              type="button"
                              disabled={deletingTxId === inst.id}
                              onClick={(e) => handleDelete(e, inst.id, `Parcela ${cur} de ${selectedInstallmentGroup.vendor}`)}
                              className="px-2.5 py-1 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50"
                              title="Excluir esta parcela"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              {deletingTxId === inst.id ? 'Excluindo…' : 'Excluir'}
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Rodapé do Drawer */}
            <div className="p-4 border-t border-[#EBEEF2] bg-[#F9FAFB] flex items-center justify-between gap-3">
              <button
                onClick={() => setSelectedInstallmentGroup(null)}
                className="py-2 px-4 rounded-xl border border-[#E5E7EB] bg-white text-xs font-semibold text-[#374151] hover:bg-[#F3F4F6] transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. DRAWER: DETALHES DE LANÇAMENTO INDIVIDUAL */}
      {selectedDrawerTx && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-[2px] transition-opacity"
          onClick={() => setSelectedDrawerTx(null)}
        >
          <div
            className="w-full max-w-md bg-white h-full shadow-2xl flex flex-col border-l border-[#EBEEF2] animate-in slide-in-from-right duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Cabeçalho do Drawer */}
            <div className="p-5 border-b border-[#EBEEF2] flex items-center justify-between">
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                    selectedDrawerTx.type === 'income'
                      ? 'bg-emerald-50 text-emerald-600'
                      : 'bg-[#F4F5F7] text-[#4B5563]'
                  }`}
                >
                  {selectedDrawerTx.type === 'income' ? (
                    <ArrowDownLeft className="w-4 h-4" />
                  ) : (
                    <ArrowUpRight className="w-4 h-4" />
                  )}
                </div>
                <div>
                  <h2 className="text-sm font-bold text-[#111827] truncate">
                    Detalhes do Lançamento
                  </h2>
                  <span className="text-[11px] text-[#6B7280]">
                    {selectedDrawerTx.date
                      ? new Date(selectedDrawerTx.date + 'T00:00:00').toLocaleDateString('pt-BR')
                      : new Date(selectedDrawerTx.created_at).toLocaleDateString('pt-BR')}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setSelectedDrawerTx(null)}
                className="p-1.5 rounded-xl hover:bg-[#F4F5F7] text-[#9CA3AF] hover:text-[#111827] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Conteúdo do Drawer */}
            <div className="flex-1 overflow-y-auto p-5 space-y-6 text-xs text-[#374151]">
              {/* Valor Principal em Destaque */}
              <div className="text-center py-2 bg-[#F9FAFB] rounded-2xl border border-[#EBEEF2] p-4">
                <span className="text-[11px] font-semibold text-[#6B7280] uppercase tracking-wider block mb-1">
                  {selectedDrawerTx.type === 'income' ? 'Valor Recebido' : 'Valor Total'}
                </span>
                <span
                  className={`text-2xl font-extrabold tracking-tight block ${
                    selectedDrawerTx.type === 'income' ? 'text-emerald-600' : 'text-[#111827]'
                  }`}
                >
                  {selectedDrawerTx.type === 'income' ? '+' : '-'} {formatBRL(selectedDrawerTx.total)}
                </span>
                <span className="text-[11px] text-[#6B7280] mt-1 block">
                  {selectedDrawerTx.canonical_vendors?.canonical_name ||
                    selectedDrawerTx.vendor ||
                    'Sem estabelecimento'}
                </span>
              </div>

              {/* Informações Gerais */}
              <div className="space-y-3">
                <h3 className="text-[11px] font-bold uppercase tracking-wider text-[#9CA3AF]">
                  Informações Gerais
                </h3>
                <div className="bg-white border border-[#EBEEF2] rounded-xl p-3 divide-y divide-[#F4F5F7] space-y-2">
                  <div className="flex justify-between items-center py-1">
                    <span className="text-[#6B7280]">Estabelecimento</span>
                    <span className="font-semibold text-[#111827]">
                      {selectedDrawerTx.canonical_vendors?.canonical_name ||
                        selectedDrawerTx.vendor ||
                        '—'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span className="text-[#6B7280]">Categoria</span>
                    <span className="font-semibold text-[#111827] flex items-center gap-1.5">
                      {selectedDrawerTx.categories?.color && (
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: selectedDrawerTx.categories.color }}
                        />
                      )}
                      <span>
                        {selectedDrawerTx.categories?.name ||
                          selectedDrawerTx.category ||
                          'Não categorizado'}
                      </span>
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span className="text-[#6B7280]">Conta / Meio</span>
                    <span className="font-semibold text-[#111827]">
                      {selectedDrawerTx.accounts?.name || 'Geral'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span className="text-[#6B7280]">Forma de Pagamento</span>
                    <span className="font-semibold text-[#111827]">
                      {selectedDrawerTx.payment_method || 'Não especificada'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span className="text-[#6B7280]">Tipo de Lançamento</span>
                    <span className="font-semibold text-[#111827] capitalize">
                      {selectedDrawerTx.type === 'income' ? 'Receita (Entrada)' : 'Despesa (Saída)'}
                    </span>
                  </div>
                  {selectedDrawerTx.time && (
                    <div className="flex justify-between items-center py-1">
                      <span className="text-[#6B7280]">Horário</span>
                      <span className="font-semibold text-[#111827]">
                        {selectedDrawerTx.time}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Recorrência */}
              {selectedDrawerTx.is_recurring && (
                <div className="space-y-3">
                  <h3 className="text-[11px] font-bold uppercase tracking-wider text-[#9CA3AF]">
                    Recorrência
                  </h3>
                  <div className="bg-[#F9FAFB] border border-[#EBEEF2] rounded-xl p-3.5 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 font-medium text-[#111827]">
                        <Repeat className="w-3.5 h-3.5 text-[#2F68FE]" />
                        Despesa Recorrente
                      </span>
                      <span className="text-[11px] text-[#6B7280]">
                        {selectedDrawerTx.recurrence_status === 'ended'
                          ? 'Encerrada'
                          : 'Ativa (Mensal)'}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Itens da Transação */}
              {selectedDrawerTx.transaction_items && selectedDrawerTx.transaction_items.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-[11px] font-bold uppercase tracking-wider text-[#9CA3AF]">
                      Itens ({selectedDrawerTx.transaction_items.length})
                    </h3>
                  </div>
                  <div className="bg-white border border-[#EBEEF2] rounded-xl overflow-hidden divide-y divide-[#F4F5F7]">
                    {selectedDrawerTx.transaction_items.map((it: any) => (
                      <div key={it.id} className="p-2.5 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <span className="font-semibold text-[#111827] block truncate">
                            {it.canonical_products?.canonical_name || it.description}
                          </span>
                          <span className="text-[10px] text-[#6B7280]">
                            {it.quantity ? `${it.quantity}x` : '1x'}{' '}
                            {it.unit_price ? `• ${formatBRL(it.unit_price)}/un` : ''}{' '}
                            {it.category ? `• ${it.category}` : ''}
                          </span>
                        </div>
                        <span className="font-bold text-[#111827] shrink-0">
                          {formatBRL(it.total)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Rastreabilidade / Origem */}
              {selectedDrawerTx.origin_type && (
                <div className="space-y-2 pt-2 border-t border-[#F4F5F7]">
                  <h3 className="text-[11px] font-bold uppercase tracking-wider text-[#9CA3AF]">
                    Origem do Registro
                  </h3>
                  <div className="p-3 bg-[#F9FAFB] rounded-xl border border-[#EBEEF2] text-[11px] space-y-1.5 text-[#6B7280]">
                    <div className="flex justify-between">
                      <span>Origem:</span>
                      <span className="font-medium text-[#111827] capitalize">
                        {selectedDrawerTx.origin_type === 'image'
                          ? 'Foto de Recibo'
                          : selectedDrawerTx.origin_type === 'text'
                          ? 'Texto / Descrição'
                          : 'Manual'}
                      </span>
                    </div>
                    {selectedDrawerTx.original_filename && (
                      <div className="flex justify-between truncate">
                        <span>Arquivo:</span>
                        <span
                          className="font-medium text-[#111827] truncate"
                          title={selectedDrawerTx.original_filename}
                        >
                          {selectedDrawerTx.original_filename}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Rodapé de Ações do Drawer */}
            <div className="p-4 border-t border-[#EBEEF2] bg-[#F9FAFB] flex items-center gap-3">
              <button
                onClick={(e) => handleStartEditing(e, selectedDrawerTx)}
                className="flex-1 py-2.5 px-4 rounded-xl bg-[#2F68FE] hover:bg-[#2557D6] text-white font-semibold text-xs transition-colors flex items-center justify-center gap-1.5 shadow-sm"
              >
                <Edit2 className="w-3.5 h-3.5" />
                Editar Lançamento
              </button>
              <button
                onClick={(e) => handleDelete(e, selectedDrawerTx.id, selectedDrawerTx.vendor)}
                disabled={deletingTxId === selectedDrawerTx.id}
                className="p-2.5 rounded-xl border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 transition-colors disabled:opacity-40"
                title="Excluir lançamento"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. MODAL DE EDIÇÃO COMPLETA */}
      {editingTx && (
        <EditTransactionModal
          transaction={editingTx}
          accounts={accounts}
          onClose={() => setEditingTx(null)}
          onSaveSuccess={(updatedTx) => {
            onTransactionUpdated(updatedTx)
            if (selectedDrawerTx?.id === updatedTx.id) {
              setSelectedDrawerTx(updatedTx)
            }
            setSelectedGroupDetails((prev) =>
              prev.map((p) => (p.id === updatedTx.id ? updatedTx : p))
            )
            setEditingTx(null)
          }}
        />
      )}
    </section>
  )
}
