'use client'

import React, { useState, FormEvent } from 'react'
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Plus,
  Trash2,
  Calendar,
  Repeat,
  Layers,
  FileText,
  SlidersHorizontal,
  X,
  CreditCard,
  Building2,
  Wallet,
  Banknote,
  Landmark,
  Smartphone,
} from 'lucide-react'
import type { Account, TransactionRecord } from '@/lib/schema'
import { CategorySelect } from '@/components/categories/CategorySelect'
import { formatBRL, getAccountTypeLabel, getAccountTypeLucideIcon } from '@/lib/formatters'
import { useTelegramWebApp } from '@/lib/useTelegramWebApp'

export interface EditItemState {
  id?: string
  description: string
  quantity: string | number
  unit_price: string | number
  total: string | number
  category: string
}

export interface EditFormState {
  id: string
  type: 'expense' | 'income'
  account_id: string
  payment_method: string
  vendor: string
  date: string
  time: string
  category: string
  category_id: string | null
  total: string | number
  is_recurring: boolean
  recurrence_frequency: string
  recurrence_next_date: string
  recurrence_status: 'active' | 'ended'
  installment_current: string | number
  installment_total: string | number
  installment_amount: string | number
  notes?: string
  review_status: 'confirmed' | 'needs_review'
  review_reasons: string[]
  items: EditItemState[]
}

export interface EditTransactionModalProps {
  transaction: TransactionRecord
  accounts: Account[]
  onClose: () => void
  onSaveSuccess: (updatedTx: TransactionRecord) => void
}

const COMMON_PAYMENT_METHODS = [
  'PIX',
  'Cartão de Crédito',
  'Cartão de Débito',
  'Dinheiro',
  'Boleto',
  'Transferência',
  'Outros',
]

export function EditTransactionModal({
  transaction: tx,
  accounts: initialAccounts,
  onClose,
  onSaveSuccess,
}: EditTransactionModalProps) {
  const { fetchWithAuth } = useTelegramWebApp()
  const [localAccounts] = useState<Account[]>(initialAccounts)
  const [isEstimated, setIsEstimated] = useState<boolean>(
    Boolean((tx as any).notes?.includes('[Estimado]') || (tx as any).is_estimated)
  )
  const [recurrenceDueDay, setRecurrenceDueDay] = useState<string>(
    tx.recurrence_next_date ? String(parseInt(tx.recurrence_next_date.slice(8, 10), 10)) : ''
  )

  const [editingTx, setEditingTx] = useState<EditFormState>({
    id: tx.id,
    type: tx.type === 'income' ? 'income' : 'expense',
    account_id: tx.account_id || '',
    payment_method: (tx as any).payment_method || '',
    vendor: tx.vendor || '',
    date: tx.date || '',
    time: tx.time || '',
    category: tx.category || '',
    category_id: tx.category_id || tx.categories?.id || null,
    total: tx.total != null ? String(tx.total) : '',
    is_recurring: tx.is_recurring ?? false,
    recurrence_frequency: tx.recurrence_frequency || 'monthly',
    recurrence_next_date: tx.recurrence_next_date || '',
    recurrence_status: tx.recurrence_status || 'active',
    installment_current: tx.installment_current != null ? String(tx.installment_current) : '',
    installment_total: tx.installment_total != null ? String(tx.installment_total) : '',
    installment_amount: tx.installment_amount != null ? String(tx.installment_amount) : '',
    notes: (tx as any).notes || '',
    review_status: tx.review_status || 'confirmed',
    review_reasons: tx.review_reasons || [],
    items: (tx.transaction_items || []).map((it) => ({
      id: it.id,
      description: it.description || '',
      quantity: it.quantity != null ? String(it.quantity) : '1',
      unit_price: it.unit_price != null ? String(it.unit_price) : '',
      total: it.total != null ? String(it.total) : '',
      category: it.category || '',
    })),
  })

  // UI state for progressive disclosure
  const [showMoreOptions, setShowMoreOptions] = useState(false)
  const [showItemsEditor, setShowItemsEditor] = useState(false)
  const [showInstallmentEditor, setShowInstallmentEditor] = useState(false)
  const [showRecurrenceEditor, setShowRecurrenceEditor] = useState(false)
  const [showNotesEditor, setShowNotesEditor] = useState(Boolean((tx as any).notes && (tx as any).notes.trim()))

  const [savingEdit, setSavingEdit] = useState(false)
  const [editError, setEditError] = useState('')

  // Helper for "Pago com" selection parsing
  // Serialized as either "acc:<id>" or "pm:<method>" or "acc_pm:<id>::<method>"
  function getCombinedPaymentValue(): string {
    if (editingTx.account_id && editingTx.payment_method) {
      return `acc_pm:${editingTx.account_id}::${editingTx.payment_method}`
    }
    if (editingTx.account_id) {
      return `acc:${editingTx.account_id}`
    }
    if (editingTx.payment_method) {
      return `pm:${editingTx.payment_method}`
    }
    return ''
  }

  function handleCombinedPaymentChange(val: string) {
    if (!val) {
      setEditingTx((prev) => ({ ...prev, account_id: '', payment_method: '' }))
      return
    }

    if (val.startsWith('acc_pm:')) {
      const rest = val.replace('acc_pm:', '')
      const [accId, pm] = rest.split('::')
      setEditingTx((prev) => ({ ...prev, account_id: accId || '', payment_method: pm || '' }))
    } else if (val.startsWith('acc:')) {
      const accId = val.replace('acc:', '')
      const acc = localAccounts.find((a) => a.id === accId)
      // If account has an obvious method like credit_card or debit_card, set default or keep
      let defaultPm = editingTx.payment_method
      if (acc?.type === 'credit_card') defaultPm = 'Cartão de Crédito'
      else if (acc?.type === 'debit_card') defaultPm = 'Cartão de Débito'
      else if (acc?.type === 'cash') defaultPm = 'Dinheiro'
      else if (acc?.type === 'bank_account' && !defaultPm) defaultPm = 'PIX'
      setEditingTx((prev) => ({ ...prev, account_id: accId, payment_method: defaultPm }))
    } else if (val.startsWith('pm:')) {
      const pm = val.replace('pm:', '')
      setEditingTx((prev) => ({ ...prev, payment_method: pm }))
    }
  }

  function handleEditItemChange(index: number, field: keyof EditItemState, value: string) {
    const newItems = [...editingTx.items]
    const updated = { ...newItems[index], [field]: value }

    // Auto-calculate total if quantity and unit_price are provided
    if (field === 'quantity' || field === 'unit_price') {
      const q = parseFloat(field === 'quantity' ? value : String(updated.quantity))
      const p = parseFloat(field === 'unit_price' ? value : String(updated.unit_price))
      if (!isNaN(q) && !isNaN(p)) {
        updated.total = (q * p).toFixed(2)
      }
    }

    newItems[index] = updated
    setEditingTx({ ...editingTx, items: newItems })
  }

  function handleAddEditItem() {
    setEditingTx({
      ...editingTx,
      items: [
        ...editingTx.items,
        {
          description: '',
          quantity: '1',
          unit_price: '',
          total: '',
          category: '',
        },
      ],
    })
    setShowItemsEditor(true)
  }

  function handleRemoveEditItem(index: number) {
    const newItems = editingTx.items.filter((_, i) => i !== index)
    setEditingTx({ ...editingTx, items: newItems })
  }

  async function handleSaveEdit(e: FormEvent) {
    e.preventDefault()

    setSavingEdit(true)
    setEditError('')

    const parsedTotal = parseFloat(String(editingTx.total))
    if (isNaN(parsedTotal)) {
      setEditError('O valor total da transação deve ser um número válido.')
      setSavingEdit(false)
      return
    }

    let finalNotes = (editingTx as any).notes || (tx as any).notes || ''
    if (editingTx.is_recurring) {
      if (isEstimated && !finalNotes.includes('[Estimado]')) {
        finalNotes = finalNotes ? `${finalNotes} [Estimado]` : '[Estimado]'
      } else if (!isEstimated && finalNotes.includes('[Estimado]')) {
        finalNotes = finalNotes.replace('[Estimado]', '').trim()
      }
    }

    const payload: any = {
      type: editingTx.type,
      account_id: editingTx.account_id || null,
      payment_method: editingTx.payment_method.trim() || null,
      vendor: editingTx.vendor.trim() || null,
      date: editingTx.date.trim() || null,
      time: editingTx.time.trim() || null,
      category: editingTx.category.trim() || null,
      category_id: editingTx.category_id || null,
      notes: finalNotes || null,
      total: parsedTotal,
      is_recurring: editingTx.is_recurring,
      recurrence_frequency: editingTx.is_recurring ? (editingTx.recurrence_frequency || 'monthly') : null,
      recurrence_next_date: editingTx.is_recurring ? (editingTx.recurrence_next_date.trim() || null) : null,
      recurrence_status: editingTx.recurrence_status || 'active',
      installment_current: editingTx.installment_current ? parseInt(String(editingTx.installment_current), 10) : null,
      installment_total: editingTx.installment_total ? parseInt(String(editingTx.installment_total), 10) : null,
      installment_amount: editingTx.installment_amount ? parseFloat(String(editingTx.installment_amount)) : null,
      review_status: editingTx.review_status,
      review_reasons: editingTx.review_status === 'confirmed' ? [] : editingTx.review_reasons,
      items: editingTx.items
        .filter((item) => item.description.trim() !== '')
        .map((item) => {
          const qty = parseFloat(String(item.quantity))
          const unit = parseFloat(String(item.unit_price))
          const itemTot = parseFloat(String(item.total))
          return {
            description: item.description.trim(),
            quantity: isNaN(qty) ? 1 : qty,
            unit_price: isNaN(unit) ? (isNaN(itemTot) ? null : itemTot) : unit,
            total: isNaN(itemTot) ? (isNaN(unit) ? null : unit * (isNaN(qty) ? 1 : qty)) : itemTot,
            category: item.category.trim() || null,
          }
        }),
    }

    try {
      const res = await fetchWithAuth(`/api/transactions/${editingTx.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json()

      if (data.ok && data.transaction) {
        onSaveSuccess(data.transaction)
      } else {
        setEditError(data.error || 'Erro ao salvar alterações na transação')
      }
    } catch {
      setEditError('Erro de conexão ao salvar alterações.')
    } finally {
      setSavingEdit(false)
    }
  }

  // Summary calculations
  const isInstallment =
    editingTx.installment_total !== '' &&
    parseInt(String(editingTx.installment_total), 10) > 1

  const installmentTotalNum = parseInt(String(editingTx.installment_total), 10) || 1
  const installmentCurrentNum = parseInt(String(editingTx.installment_current), 10) || 1
  const currentAmountNum = parseFloat(String(editingTx.total)) || 0
  const installmentPerPiece = editingTx.installment_amount
    ? parseFloat(String(editingTx.installment_amount))
    : currentAmountNum > 0
    ? currentAmountNum
    : 0

  const itemsCount = editingTx.items.length
  const itemsTotalSum = editingTx.items.reduce((acc, it) => acc + (parseFloat(String(it.total)) || 0), 0)

  return (
    <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white border-t sm:border border-[#EBEEF2] rounded-t-3xl sm:rounded-2xl max-w-lg w-full max-h-[92vh] sm:max-h-[88vh] flex flex-col shadow-2xl overflow-hidden animate-in slide-in-from-bottom sm:zoom-in-95 duration-200">
        {/* Mobile Grab Handle */}
        <div className="sm:hidden pt-2.5 pb-1 bg-white flex justify-center shrink-0">
          <div className="w-10 h-1 bg-slate-300 rounded-full" />
        </div>

        {/* Cabeçalho */}
        <div className="px-4 sm:px-5 py-3 sm:py-4 border-b border-[#EBEEF2] flex items-center justify-between bg-white sticky top-0 z-10">
          <div>
            <h3 className="text-base font-bold text-[#111827]">Editar Transação</h3>
            <p className="text-xs text-[#6B7280]">Ajuste os dados principais do lançamento.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[#9CA3AF] hover:text-[#111827] text-lg p-2 sm:p-1.5 rounded-xl hover:bg-[#F4F5F7] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSaveEdit} className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1 text-xs text-[#374151]">
          {editError && (
            <div className="border border-red-200 bg-red-50 text-red-700 rounded-xl px-4 py-2.5 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
              <span>{editError}</span>
            </div>
          )}

          {/* 1. SELEÇÃO DE TIPO (Despesa / Receita) & VALOR */}
          <div className="space-y-3">
            <div className="flex gap-1.5 bg-[#F4F5F7] p-1 rounded-xl border border-[#E5E7EB]">
              <button
                type="button"
                onClick={() => setEditingTx({ ...editingTx, type: 'expense' })}
                className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  editingTx.type === 'expense'
                    ? 'bg-white text-rose-600 shadow-sm'
                    : 'text-[#6B7280] hover:text-[#111827]'
                }`}
              >
                Despesa
              </button>
              <button
                type="button"
                onClick={() => setEditingTx({ ...editingTx, type: 'income' })}
                className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  editingTx.type === 'income'
                    ? 'bg-white text-emerald-600 shadow-sm'
                    : 'text-[#6B7280] hover:text-[#111827]'
                }`}
              >
                Receita
              </button>
            </div>

            <div>
              <label className="text-xs text-[#374151] font-semibold block mb-1">
                Valor Total (R$) <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-[#6B7280]">
                  R$
                </span>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={editingTx.total}
                  onChange={(e) => setEditingTx({ ...editingTx, total: e.target.value })}
                  placeholder="0,00"
                  className={`w-full bg-[#F9FAFB] focus:bg-white border border-[#E5E7EB] rounded-xl pl-9 pr-3 py-2.5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-[#2F68FE]/20 focus:border-[#2F68FE] transition-all ${
                    editingTx.type === 'income' ? 'text-emerald-600' : 'text-[#111827]'
                  }`}
                />
              </div>
            </div>
          </div>

          {/* 2. ESTABELECIMENTO / FONTE */}
          <div>
            <label className="text-xs text-[#374151] font-semibold block mb-1">
              {editingTx.type === 'income' ? 'Fonte / Pagador' : 'Estabelecimento'}
            </label>
            <input
              type="text"
              value={editingTx.vendor}
              onChange={(e) => setEditingTx({ ...editingTx, vendor: e.target.value })}
              placeholder={editingTx.type === 'income' ? 'Ex: Empresa XYZ, Cliente...' : 'Ex: Supermercado XYZ'}
              className="w-full bg-white border border-[#E5E7EB] rounded-xl px-3 py-2 text-xs text-[#111827] placeholder-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#2F68FE]/20 focus:border-[#2F68FE]"
            />
          </div>

          {/* 3. CATEGORIA */}
          <div>
            <label className="text-xs text-[#374151] font-semibold block mb-1">Categoria</label>
            <CategorySelect
              type={editingTx.type}
              value={editingTx.category_id}
              fallbackName={editingTx.category}
              onChange={(id, name) => {
                setEditingTx({ ...editingTx, category_id: id, category: name })
              }}
              placeholder="Selecione uma categoria..."
            />
          </div>

          {/* 4. UM ÚNICO CAMPO "PAGO COM" (combina Conta + Forma de Pagamento) */}
          <div>
            <label className="text-xs text-[#374151] font-semibold block mb-1">Pago com</label>
            <div className="relative">
              <select
                value={getCombinedPaymentValue()}
                onChange={(e) => handleCombinedPaymentChange(e.target.value)}
                className="w-full bg-white border border-[#E5E7EB] rounded-xl px-3 py-2 text-xs text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#2F68FE]/20 focus:border-[#2F68FE] appearance-none pr-8 cursor-pointer"
              >
                <option value="">Não especificado</option>

                {/* Contas Cadastradas (esconde PIX legado de Conta/Cartão) */}
                {localAccounts.filter((a) => a.name?.trim().toLowerCase() !== 'pix').length > 0 && (
                  <optgroup label="Contas / Cartões">
                    {localAccounts
                      .filter((a) => a.name?.trim().toLowerCase() !== 'pix')
                      .map((acc) => {
                        const typeLabel = getAccountTypeLabel(acc.type)
                        const instSuffix = acc.institution ? ` • ${acc.institution}` : ''
                        return (
                          <option key={`acc:${acc.id}`} value={`acc:${acc.id}`}>
                            {acc.name} ({typeLabel}{instSuffix})
                          </option>
                        )
                      })}
                  </optgroup>
                )}

                {/* Formas de Pagamento Gerais */}
                <optgroup label="Outros Métodos">
                  {COMMON_PAYMENT_METHODS.map((pm) => (
                    <option key={`pm:${pm}`} value={`pm:${pm}`}>
                      {pm}
                    </option>
                  ))}
                </optgroup>
              </select>
              <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#9CA3AF]">
                <ChevronDown className="w-4 h-4" />
              </div>
            </div>
          </div>

          {/* 5. LINHA-RESUMO DE PARCELAMENTO (se parcelado ou sob demanda) */}
          {isInstallment ? (
            <div className="bg-[#F9FAFB] border border-[#EBEEF2] rounded-xl p-3 transition-all">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <Layers className="w-4 h-4 text-[#2F68FE] shrink-0" />
                  <span className="font-semibold text-xs text-[#111827] truncate">
                    Parcelado · {installmentTotalNum}x de {formatBRL(installmentPerPiece)} · parcela {installmentCurrentNum}/{installmentTotalNum}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowInstallmentEditor(!showInstallmentEditor)}
                  className="text-xs font-semibold text-[#2F68FE] hover:underline shrink-0 ml-2"
                >
                  {showInstallmentEditor ? 'Recolher' : 'Editar parcelamento'}
                </button>
              </div>

              {showInstallmentEditor && (
                <div className="mt-3 pt-3 border-t border-[#EBEEF2] space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] text-[#6B7280] block mb-1">Parcela Atual:</label>
                      <input
                        type="number"
                        min="1"
                        value={editingTx.installment_current}
                        onChange={(e) => setEditingTx({ ...editingTx, installment_current: e.target.value })}
                        className="w-full bg-white border border-[#E5E7EB] rounded-lg px-2.5 py-1.5 text-xs text-[#111827] focus:outline-none focus:border-[#2F68FE]"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-[#6B7280] block mb-1">Total de Parcelas:</label>
                      <input
                        type="number"
                        min="2"
                        value={editingTx.installment_total}
                        onChange={(e) => setEditingTx({ ...editingTx, installment_total: e.target.value })}
                        className="w-full bg-white border border-[#E5E7EB] rounded-lg px-2.5 py-1.5 text-xs text-[#111827] focus:outline-none focus:border-[#2F68FE]"
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingTx({
                        ...editingTx,
                        installment_current: '',
                        installment_total: '',
                        installment_amount: '',
                      })
                      setShowInstallmentEditor(false)
                    }}
                    className="text-[11px] text-rose-600 hover:text-rose-700 font-medium hover:underline"
                  >
                    Remover parcelamento
                  </button>
                </div>
              )}
            </div>
          ) : null}

          {/* 6. LINHA-RESUMO DE ITENS (se existirem itens ou botão compacto) */}
          <div className="bg-[#F9FAFB] border border-[#EBEEF2] rounded-xl p-3 transition-all">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="w-4 h-4 text-[#6B7280] shrink-0" />
                <span className="text-xs font-semibold text-[#111827] truncate">
                  {itemsCount > 0
                    ? `${itemsCount} ${itemsCount === 1 ? 'item' : 'itens'} · ${formatBRL(itemsTotalSum > 0 ? itemsTotalSum : currentAmountNum)}`
                    : 'Nenhum item discriminado'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {itemsCount > 0 ? (
                  <button
                    type="button"
                    onClick={() => setShowItemsEditor(!showItemsEditor)}
                    className="text-xs font-semibold text-[#2F68FE] hover:underline shrink-0"
                  >
                    {showItemsEditor ? 'Ocultar itens' : 'Ver / Editar itens'}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleAddEditItem}
                    className="text-xs font-semibold text-[#2F68FE] hover:underline shrink-0"
                  >
                    + Adicionar itens
                  </button>
                )}
              </div>
            </div>

            {/* Editor de itens expandido sob demanda */}
            {showItemsEditor && (
              <div className="mt-3 pt-3 border-t border-[#EBEEF2] space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-[#6B7280] uppercase tracking-wider">
                    Lista de Itens
                  </span>
                  <button
                    type="button"
                    onClick={handleAddEditItem}
                    className="text-[11px] px-2 py-0.5 rounded-lg bg-[#EBF2FE] text-[#2F68FE] hover:bg-[#D5E2FD] font-semibold transition-colors flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Adicionar</span>
                  </button>
                </div>

                {editingTx.items.map((item, idx) => (
                  <div
                    key={idx}
                    className="bg-white border border-[#E5E7EB] rounded-xl p-2.5 space-y-2 relative shadow-2xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-bold text-[#9CA3AF] uppercase">
                        Item #{idx + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveEditItem(idx)}
                        className="text-[11px] text-rose-600 hover:text-rose-700 p-1 rounded hover:bg-rose-50 transition-colors flex items-center gap-0.5"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>Remover</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] text-[#6B7280] block mb-0.5">Descrição</label>
                        <input
                          type="text"
                          value={item.description}
                          onChange={(e) => handleEditItemChange(idx, 'description', e.target.value)}
                          placeholder="Ex: Leite Integral"
                          className="w-full bg-[#F9FAFB] focus:bg-white border border-[#E5E7EB] rounded-lg px-2 py-1 text-xs text-[#111827] focus:outline-none focus:border-[#2F68FE]"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] text-[#6B7280] block mb-0.5">Categoria do Item</label>
                        <input
                          type="text"
                          value={item.category}
                          onChange={(e) => handleEditItemChange(idx, 'category', e.target.value)}
                          placeholder="Ex: Laticínios"
                          className="w-full bg-[#F9FAFB] focus:bg-white border border-[#E5E7EB] rounded-lg px-2 py-1 text-xs text-[#111827] focus:outline-none focus:border-[#2F68FE]"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="text-[10px] text-[#6B7280] block mb-0.5">Qtd</label>
                        <input
                          type="number"
                          step="any"
                          value={item.quantity}
                          onChange={(e) => handleEditItemChange(idx, 'quantity', e.target.value)}
                          placeholder="1"
                          className="w-full bg-[#F9FAFB] focus:bg-white border border-[#E5E7EB] rounded-lg px-2 py-1 text-xs text-[#111827] focus:outline-none focus:border-[#2F68FE]"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] text-[#6B7280] block mb-0.5">Unitário (R$)</label>
                        <input
                          type="number"
                          step="0.01"
                          value={item.unit_price}
                          onChange={(e) => handleEditItemChange(idx, 'unit_price', e.target.value)}
                          placeholder="0.00"
                          className="w-full bg-[#F9FAFB] focus:bg-white border border-[#E5E7EB] rounded-lg px-2 py-1 text-xs text-[#111827] focus:outline-none focus:border-[#2F68FE]"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] text-[#6B7280] block mb-0.5">Total (R$)</label>
                        <input
                          type="number"
                          step="0.01"
                          value={item.total}
                          onChange={(e) => handleEditItemChange(idx, 'total', e.target.value)}
                          placeholder="0.00"
                          className="w-full bg-[#F9FAFB] focus:bg-white border border-[#E5E7EB] rounded-lg px-2 py-1 text-xs text-[#111827] focus:outline-none focus:border-[#2F68FE]"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 7. SEÇÃO RECOLHIDA "MAIS OPÇÕES" */}
          <div className="border border-[#EBEEF2] rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setShowMoreOptions(!showMoreOptions)}
              className="w-full flex items-center justify-between px-3.5 py-2.5 bg-[#F9FAFB] hover:bg-[#F4F5F7] text-xs font-semibold text-[#4B5563] transition-colors"
            >
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="w-3.5 h-3.5 text-[#6B7280]" />
                <span>Mais opções (Data, Recorrência, Observação)</span>
              </div>
              {showMoreOptions ? (
                <ChevronUp className="w-4 h-4 text-[#9CA3AF]" />
              ) : (
                <ChevronDown className="w-4 h-4 text-[#9CA3AF]" />
              )}
            </button>

            {showMoreOptions && (
              <div className="p-4 bg-white border-t border-[#EBEEF2] space-y-4 animate-in fade-in duration-100">
                {/* Data */}
                <div>
                  <label className="text-xs text-[#6B7280] font-medium block mb-1">
                    Data do Lançamento
                  </label>
                  <div className="relative">
                    <input
                      type="date"
                      value={editingTx.date}
                      onChange={(e) => setEditingTx({ ...editingTx, date: e.target.value })}
                      className="w-full bg-white border border-[#E5E7EB] rounded-xl px-3 py-2 text-xs text-[#111827] focus:outline-none focus:border-[#2F68FE]"
                    />
                  </div>
                </div>

                {/* Recorrência */}
                <div className="pt-3 border-t border-[#F4F5F7] space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-[#111827] flex items-center gap-1.5">
                      <Repeat className="w-3.5 h-3.5 text-[#2F68FE]" />
                      <span>Recorrência</span>
                    </label>

                    {!editingTx.is_recurring ? (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingTx({
                            ...editingTx,
                            is_recurring: true,
                            installment_current: '',
                            installment_total: '',
                          })
                          setShowRecurrenceEditor(true)
                        }}
                        className="text-xs text-[#2F68FE] font-semibold hover:underline"
                      >
                        + Tornar recorrente
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setShowRecurrenceEditor(!showRecurrenceEditor)}
                        className="text-xs text-[#2F68FE] font-semibold hover:underline"
                      >
                        {showRecurrenceEditor ? 'Recolher detalhes' : 'Editar recorrência'}
                      </button>
                    )}
                  </div>

                  {editingTx.is_recurring && (
                    <div className="bg-[#F9FAFB] border border-[#EBEEF2] rounded-xl p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-[#111827]">
                          Recorrente mensal {recurrenceDueDay ? `· vence dia ${recurrenceDueDay}` : ''}
                        </span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            editingTx.recurrence_status === 'active'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-gray-100 text-gray-700 border border-gray-200'
                          }`}
                        >
                          {editingTx.recurrence_status === 'active' ? 'Ativa' : 'Encerrada'}
                        </span>
                      </div>

                      {showRecurrenceEditor && (
                        <div className="pt-2 border-t border-[#EBEEF2] space-y-2.5">
                          <div>
                            <label className="text-[11px] text-[#6B7280] block mb-1">Status:</label>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => setEditingTx({ ...editingTx, recurrence_status: 'active' })}
                                className={`flex-1 py-1 rounded-lg text-xs font-semibold transition-colors ${
                                  editingTx.recurrence_status === 'active'
                                    ? 'bg-emerald-600 text-white'
                                    : 'bg-white border border-[#E5E7EB] text-[#6B7280]'
                                }`}
                              >
                                Ativa
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingTx({ ...editingTx, recurrence_status: 'ended' })}
                                className={`flex-1 py-1 rounded-lg text-xs font-semibold transition-colors ${
                                  editingTx.recurrence_status === 'ended'
                                    ? 'bg-[#374151] text-white'
                                    : 'bg-white border border-[#E5E7EB] text-[#6B7280]'
                                }`}
                              >
                                Encerrada
                              </button>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-[11px] text-[#6B7280] block mb-1">Dia do Vencimento:</label>
                              <input
                                type="number"
                                min="1"
                                max="31"
                                placeholder="Ex: 10, 25"
                                value={recurrenceDueDay}
                                onChange={(e) => {
                                  const val = e.target.value
                                  setRecurrenceDueDay(val)
                                  const num = parseInt(val, 10)
                                  if (num >= 1 && num <= 31) {
                                    const base = editingTx.date ? new Date(editingTx.date + 'T12:00:00') : new Date()
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
                                    setEditingTx((prev) => ({
                                      ...prev,
                                      recurrence_next_date: `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
                                    }))
                                  }
                                }}
                                className="w-full bg-white border border-[#E5E7EB] rounded-lg px-2 py-1 text-xs text-[#111827] focus:outline-none focus:border-[#2F68FE]"
                              />
                            </div>

                            <div>
                              <label className="text-[11px] text-[#6B7280] block mb-1">Próxima Data:</label>
                              <input
                                type="date"
                                value={editingTx.recurrence_next_date}
                                onChange={(e) => {
                                  setEditingTx({ ...editingTx, recurrence_next_date: e.target.value })
                                  if (e.target.value) {
                                    setRecurrenceDueDay(String(parseInt(e.target.value.slice(8, 10), 10)))
                                  }
                                }}
                                className="w-full bg-white border border-[#E5E7EB] rounded-lg px-2 py-1 text-xs text-[#111827] focus:outline-none focus:border-[#2F68FE]"
                              />
                            </div>
                          </div>

                          <label className="flex items-center gap-2 text-xs text-[#374151] cursor-pointer pt-1 select-none">
                            <input
                              type="checkbox"
                              checked={isEstimated}
                              onChange={(e) => setIsEstimated(e.target.checked)}
                              className="rounded border-[#D1D5DB] text-[#2F68FE] focus:ring-[#2F68FE] w-3.5 h-3.5 accent-[#2F68FE]"
                            />
                            <span className="font-medium">Valor estimado mensal (ex: água, luz)</span>
                          </label>

                          <button
                            type="button"
                            onClick={() => {
                              setEditingTx({
                                ...editingTx,
                                is_recurring: false,
                                recurrence_next_date: '',
                              })
                              setShowRecurrenceEditor(false)
                            }}
                            className="text-[11px] text-rose-600 hover:text-rose-700 font-medium hover:underline pt-1"
                          >
                            Remover recorrência
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Se não for parcelado ainda, permitir parcelar dentro de Mais Opções */}
                {!isInstallment && (
                  <div className="pt-3 border-t border-[#F4F5F7]">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingTx({
                          ...editingTx,
                          is_recurring: false,
                          installment_current: '1',
                          installment_total: '2',
                        })
                        setShowInstallmentEditor(true)
                      }}
                      className="text-xs text-[#2F68FE] font-semibold hover:underline flex items-center gap-1.5"
                    >
                      <Layers className="w-3.5 h-3.5" />
                      <span>+ Tornar compra parcelada</span>
                    </button>
                  </div>
                )}

                {/* Observações */}
                <div className="pt-3 border-t border-[#F4F5F7] space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-[#6B7280] font-medium">Observação</label>
                    {!showNotesEditor && (
                      <button
                        type="button"
                        onClick={() => setShowNotesEditor(true)}
                        className="text-xs text-[#2F68FE] font-semibold hover:underline"
                      >
                        + Adicionar observação
                      </button>
                    )}
                  </div>

                  {showNotesEditor && (
                    <textarea
                      rows={2}
                      value={(editingTx as any).notes || ''}
                      onChange={(e) => setEditingTx({ ...editingTx, notes: e.target.value })}
                      placeholder="Adicione anotações ou detalhes sobre este lançamento..."
                      className="w-full bg-[#F9FAFB] focus:bg-white border border-[#E5E7EB] rounded-xl px-3 py-2 text-xs text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#2F68FE]/20 focus:border-[#2F68FE]"
                    />
                  )}
                </div>
              </div>
            )}
          </div>

          {/* 8. BOTÕES DO MODAL (Salvar evidente, Cancelar secundário) */}
          <div className="pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] border-t border-[#EBEEF2] flex items-center justify-end gap-2.5 sticky bottom-0 bg-white z-10">
            <button
              type="button"
              onClick={onClose}
              disabled={savingEdit}
              className="py-2.5 px-4 rounded-xl text-xs font-semibold text-[#4B5563] hover:text-[#111827] bg-white border border-[#E5E7EB] hover:bg-[#F4F5F7] transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={savingEdit}
              className="flex-1 sm:flex-initial py-2.5 px-6 rounded-xl bg-[#2F68FE] hover:bg-[#2557D6] disabled:opacity-50 text-white font-semibold text-xs transition-all shadow-md shadow-blue-500/20 active:scale-[0.98] text-center"
            >
              {savingEdit ? 'Salvando…' : 'Salvar Alterações'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
