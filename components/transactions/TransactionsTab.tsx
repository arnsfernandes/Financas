'use client'

import React, { useState, useMemo, useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'
import type { Account, TransactionItem, TransactionRecord } from '@/lib/schema'
import { EditTransactionModal } from '@/components/modals/EditTransactionModal'
import { useTelegramWebApp } from '@/lib/useTelegramWebApp'
import { TransactionsFilterBar } from './TransactionsFilterBar'
import { TransactionListItem } from './TransactionListItem'
import { InstallmentGroupModal } from './InstallmentGroupModal'
import { TransactionDetailModal } from './TransactionDetailModal'
export type { TransactionItem, TransactionRecord } from '@/lib/schema'

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
  loadingMoreTx?: boolean
  hasMoreTx?: boolean
  loadMoreTransactions?: () => Promise<void>
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
    search?: string
  }) => Promise<void>
  onDeleteTransaction: (id: string, vendor?: string | null) => Promise<void>
  onDeleteInstallmentGroup?: (groupId: string) => Promise<void>
  onTransactionUpdated: (updatedTx: TransactionRecord) => void
  className?: string
}

export function TransactionsTab({
  transactions,
  loadingTx,
  loadingMoreTx = false,
  hasMoreTx = false,
  loadMoreTransactions,
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
  onDeleteInstallmentGroup,
  onTransactionUpdated,
  className,
}: TransactionsTabProps) {
  const { fetchWithAuth } = useTelegramWebApp()

  // Filtros e busca textual
  const [txSearchText, setTxSearchText] = useState('')
  const searchTimeoutRef = React.useRef<NodeJS.Timeout | null>(null)
  const isInitialMount = React.useRef(true)

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false
      return
    }
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }
    searchTimeoutRef.current = setTimeout(() => {
      fetchTransactions({ search: txSearchText.trim() || undefined })
    }, 350)

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
      }
    }
  }, [txSearchText, fetchTransactions])

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
  }, [fetchWithAuth])

  // Modal de Edição Completa
  const [editingTx, setEditingTx] = useState<TransactionRecord | null>(null)

  // Drawer de Compra Parcelada Agrupada
  const [selectedInstallmentGroup, setSelectedInstallmentGroup] = useState<InstallmentGroupItem | null>(null)
  const [selectedGroupDetails, setSelectedGroupDetails] = useState<TransactionRecord[]>([])
  const [loadingGroupInstallments, setLoadingGroupInstallments] = useState(false)

  // Fechar com tecla Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (editingTx) {
          setEditingTx(null)
        } else if (selectedDrawerTx) {
          setSelectedDrawerTx(null)
        } else if (selectedInstallmentGroup) {
          setSelectedInstallmentGroup(null)
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [editingTx, selectedDrawerTx, selectedInstallmentGroup, setSelectedDrawerTx])

  // Estado de exclusão
  const [deletingTxId, setDeletingTxId] = useState<string | null>(null)
  const [deletingGroupId, setDeletingGroupId] = useState<string | null>(null)
  const [groupDeleteError, setGroupDeleteError] = useState<string | null>(null)

  // 1. Agrupamento visual das compras parceladas por installment_group_id
  const displayItems = useMemo(() => {
    const items: DisplayListItem[] = []
    const groupsMap = new Map<string, InstallmentGroupItem>()

    for (const tx of transactions) {
      if (tx.installment_group_id && (tx.installment_total || 0) > 1) {
        const gId = tx.installment_group_id
        if (groupsMap.has(gId)) {
          const group = groupsMap.get(gId)!
          if (!group.installments.some((inst) => inst.id === tx.id)) {
            group.installments.push(tx)
          }
        } else {
          const totalInst = tx.installment_total || 1
          const instAmount = Number(tx.installment_amount) || Number(tx.total)
          const totalPurchaseAmount = tx.subtotal
            ? Number(tx.subtotal)
            : tx.installment_amount
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
    if (deletingTxId || deletingGroupId) return

    setDeletingTxId(id)
    try {
      await onDeleteTransaction(id, vendor)
      if (selectedDrawerTx?.id === id) {
        setSelectedDrawerTx(null)
      }
      setSelectedGroupDetails((prev) => prev.filter((p) => p.id !== id))
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao excluir lançamento'
      alert(msg)
    } finally {
      setDeletingTxId(null)
    }
  }

  async function handleDeleteGroup(groupId: string) {
    if (!groupId || deletingGroupId || deletingTxId) return

    setDeletingGroupId(groupId)
    setGroupDeleteError(null)
    try {
      if (onDeleteInstallmentGroup) {
        await onDeleteInstallmentGroup(groupId)
      } else {
        const res = await fetchWithAuth(`/api/transactions/installments/${groupId}`, { method: 'DELETE' })
        const data = await res.json()
        if (!data.ok) {
          throw new Error(data.error || 'Erro ao excluir compra parcelada')
        }
        await fetchTransactions()
      }
      setSelectedInstallmentGroup(null)
      setSelectedGroupDetails([])
      if (selectedDrawerTx?.installment_group_id === groupId) {
        setSelectedDrawerTx(null)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao excluir compra parcelada'
      setGroupDeleteError(msg)
      alert(msg)
    } finally {
      setDeletingGroupId(null)
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
    <section className={`max-w-4xl mx-auto space-y-5 pb-12 ${className || ''}`}>
      {/* 1. CABEÇALHO (Oculto no mobile pois o MobileHeader já exibe o contexto "Extrato de Lançamentos") */}
      <div className="hidden md:flex items-center justify-between gap-3 pb-3 border-b border-[#EBEEF2]">
        <h1 className="text-2xl font-bold tracking-tight text-[#111827]">
          Transações
        </h1>
        <button
          onClick={() => fetchTransactions({ search: txSearchText.trim() || undefined })}
          disabled={loadingTx}
          className="p-2 rounded-xl border border-[#E5E7EB] bg-white text-[#6B7280] hover:text-[#111827] hover:border-[#D1D5DB] transition-all disabled:opacity-40 shadow-2xs cursor-pointer"
          title="Atualizar lista"
        >
          <span className={`inline-block text-sm leading-none ${loadingTx ? 'animate-spin' : ''}`}>↻</span>
        </button>
      </div>

      {/* 2. BARRA DE FERRAMENTAS E FILTROS */}
      <TransactionsFilterBar
        txSearchText={txSearchText}
        setTxSearchText={setTxSearchText}
        onSearchSubmit={(text) => fetchTransactions({ search: text || undefined })}
        filterType={filterType}
        setFilterType={setFilterType}
        filterAccount={filterAccount}
        setFilterAccount={setFilterAccount}
        accounts={accounts}
        filterCategory={filterCategory}
        setFilterCategory={setFilterCategory}
        categoriesList={categoriesList}
        filterPaymentMethod={filterPaymentMethod}
        setFilterPaymentMethod={setFilterPaymentMethod}
        isPaymentMethodHidden={isPaymentMethodHidden}
        filterStartDate={filterStartDate}
        setFilterStartDate={setFilterStartDate}
        filterEndDate={filterEndDate}
        setFilterEndDate={setFilterEndDate}
        isAnyFilterActive={isAnyFilterActive}
        handleClearAllFilters={handleClearAllFilters}
        searchTimeoutRef={searchTimeoutRef}
        fetchTransactions={fetchTransactions}
      />

      {txError && (
        <div className="border border-red-200 bg-red-50 text-red-700 rounded-xl px-4 py-2.5 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
          <span>{txError}</span>
        </div>
      )}

      {/* 3. LISTA DE TRANSAÇÕES: COMPACTA, FÁCIL DE ESCANEAR E COM VALOR PRÓXIMO */}
      {loadingTx && filteredDisplayItems.length === 0 ? (
        <div className="text-center py-16 text-[#98A2B3] text-xs font-normal animate-pulse">
          Carregando transações…
        </div>
      ) : filteredDisplayItems.length === 0 ? (
        <div className="text-center py-12 border border-[#EBEEF2] rounded-2xl text-[#98A2B3] text-xs bg-white">
          Nenhuma transação encontrada com os filtros atuais.
        </div>
      ) : (
        <div className="bg-white border border-[#EBEEF2] rounded-2xl shadow-2xs overflow-hidden">
          <div className="divide-y divide-[#F2F4F7]">
            {filteredDisplayItems.map((item) => {
              const isSelected =
                item.type === 'installment_group'
                  ? selectedInstallmentGroup?.groupId === item.groupId
                  : selectedDrawerTx?.id === item.tx.id

              return (
                <TransactionListItem
                  key={item.type === 'installment_group' ? `group-${item.groupId}` : item.tx.id}
                  item={item}
                  isSelected={isSelected}
                  onSelectGroup={(group) => handleOpenInstallmentGroup(group)}
                  onSelectTx={(tx) => {
                    setSelectedInstallmentGroup(null)
                    setSelectedDrawerTx(tx)
                  }}
                />
              )
            })}
          </div>
        </div>
      )}

      {/* Botão de Carregamento Incremental */}
      {hasMoreTx && (
        <div className="flex justify-center pt-2">
          <button
            type="button"
            onClick={() => loadMoreTransactions && loadMoreTransactions()}
            disabled={loadingMoreTx}
            className="flex items-center justify-center gap-2 px-6 py-2.5 bg-white border border-[#E5E7EB] hover:border-[#D1D5DB] text-sm font-semibold text-[#374151] hover:text-[#111827] rounded-xl transition-all shadow-2xs hover:shadow-xs disabled:opacity-50 cursor-pointer"
          >
            {loadingMoreTx ? (
              <>
                <span className="w-4 h-4 border-2 border-[#6B7280] border-t-transparent rounded-full animate-spin" />
                <span>Carregando mais...</span>
              </>
            ) : (
              <span>Carregar mais lançamentos</span>
            )}
          </button>
        </div>
      )}

      {/* 4. MODAL: DETALHES DE COMPRA PARCELADA */}
      <InstallmentGroupModal
        selectedInstallmentGroup={selectedInstallmentGroup}
        selectedGroupDetails={selectedGroupDetails}
        loadingGroupInstallments={loadingGroupInstallments}
        groupDeleteError={groupDeleteError}
        deletingGroupId={deletingGroupId}
        deletingTxId={deletingTxId}
        onClose={() => setSelectedInstallmentGroup(null)}
        onStartEditing={handleStartEditing}
        onDeleteSingleInstallment={handleDelete}
        onDeleteGroup={handleDeleteGroup}
      />

      {/* 5. MODAL / DETALHES DE LANÇAMENTO INDIVIDUAL */}
      <TransactionDetailModal
        selectedDrawerTx={selectedDrawerTx}
        deletingTxId={deletingTxId}
        deletingGroupId={deletingGroupId}
        onClose={() => setSelectedDrawerTx(null)}
        onStartEditing={handleStartEditing}
        onDeleteTx={handleDelete}
        onDeleteGroup={handleDeleteGroup}
      />

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
