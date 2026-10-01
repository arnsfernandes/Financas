'use client'

import React from 'react'
import {
  X,
  Loader2,
  Edit3,
  Power,
  Trash2,
  Upload,
  CalendarDays,
  ArrowRight,
} from 'lucide-react'
import type { AccountType, Account, InvoicePayment } from '@/lib/schema'
import type { AccountWithStats } from '@/lib/queries'
import { getCardInvoiceDates } from '@/lib/billingCycles'
import { InstitutionLogo } from './InstitutionLogo'
import { CreditCardItem, CREDIT_CARD_SKINS, type CreditCardSkin } from './CreditCardItem'
import { KNOWN_INSTITUTIONS, getInstitutionInfo } from '@/lib/institutions'
import { formatBRL, getAccountTypeLabel } from '@/lib/formatters'
import { COLOR_PRESETS, getAccountTypeBadge } from './accountConstants'
import { CheckCircle2, AlertCircle, History, Receipt } from 'lucide-react'

export interface AccountDetailDrawerProps {
  isOpen: boolean
  account: AccountWithStats | null
  onClose: () => void
  drawerError: string
  isEditing: boolean
  setIsEditing: (editing: boolean) => void
  onToggleActive: () => void
  togglingActive: boolean
  onDeleteAccount: () => void
  deletingAccount: boolean
  editName: string
  setEditName: (val: string) => void
  editType: AccountType
  setEditType: (val: AccountType) => void
  editInstitution: string
  setEditInstitution: (val: string) => void
  editClosingDay: string
  setEditClosingDay: (val: string) => void
  editDueDay: string
  setEditDueDay: (val: string) => void
  editCustomLogo: string
  setEditCustomLogo: (val: string) => void
  editColor: string
  setEditColor: (val: string) => void
  editSkin: CreditCardSkin
  setEditSkin: (val: CreditCardSkin) => void
  savingEdit: boolean
  onSaveEdit: (e: React.FormEvent) => void
  drawerTransactions: any[]
  loadingDrawerTx: boolean
  cardInvoiceFilter: 'invoice' | 'future' | 'all'
  setCardInvoiceFilter: (filter: 'invoice' | 'future' | 'all') => void
  navigateToTransactionsFiltered: (filters: {
    accountId?: string
    startDate?: string
    endDate?: string
  }) => void
  onLogoUpload: (file: File | undefined, onDone: (url: string) => void) => void
  accounts?: Account[]
  invoiceStatus?: 'open' | 'partial' | 'paid'
  invoicePaidAmount?: number
  invoicePayments?: InvoicePayment[]
  onOpenPayInvoiceModal?: () => void
}

export function AccountDetailDrawer({
  isOpen,
  account,
  onClose,
  drawerError,
  isEditing,
  setIsEditing,
  onToggleActive,
  togglingActive,
  onDeleteAccount,
  deletingAccount,
  editName,
  setEditName,
  editType,
  setEditType,
  editInstitution,
  setEditInstitution,
  editClosingDay,
  setEditClosingDay,
  editDueDay,
  setEditDueDay,
  editCustomLogo,
  setEditCustomLogo,
  editColor,
  setEditColor,
  editSkin,
  setEditSkin,
  savingEdit,
  onSaveEdit,
  drawerTransactions,
  loadingDrawerTx,
  cardInvoiceFilter,
  setCardInvoiceFilter,
  navigateToTransactionsFiltered,
  onLogoUpload,
  invoiceStatus = 'open',
  invoicePaidAmount = 0,
  invoicePayments = [],
  onOpenPayInvoiceModal,
}: AccountDetailDrawerProps) {
  if (!isOpen || !account) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex justify-end bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-white h-full shadow-2xl flex flex-col justify-between overflow-hidden animate-in slide-in-from-right duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-[#EBEEF2] flex items-start justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <InstitutionLogo
              institution={account.institution}
              accountName={account.name}
              accountType={account.type}
              customLogo={account.custom_logo}
              color={account.color}
              size="xl"
            />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-bold text-[#111827] truncate">
                  {account.name}
                </h2>
                <span
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                    getAccountTypeBadge(account.type).className
                  }`}
                >
                  {getAccountTypeBadge(account.type).label}
                </span>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    account.active !== false
                      ? 'bg-emerald-100/90 text-emerald-900 border border-emerald-300'
                      : 'bg-slate-100 text-slate-700 border border-slate-300'
                  }`}
                >
                  {account.active !== false ? 'Ativa' : 'Inativa'}
                </span>
              </div>
              <p className="text-xs text-[#6B7280] mt-0.5">
                {getAccountTypeLabel(account.type)}
                {account.institution ? ` • ${account.institution}` : ''}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-[#9CA3AF] hover:text-[#111827] hover:bg-[#F4F5F7] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {drawerError && (
            <div className="text-xs text-red-600 bg-red-50 p-3 rounded-xl border border-red-100">
              {drawerError}
            </div>
          )}

          {/* Ações Rápidas da Conta */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsEditing(!isEditing)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-semibold border transition-all ${
                isEditing
                  ? 'bg-slate-200 text-slate-900 border-slate-400'
                  : 'bg-white text-slate-800 border-slate-300 hover:border-slate-500 hover:text-slate-950 hover:bg-slate-50'
              }`}
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>{isEditing ? 'Cancelar' : 'Editar'}</span>
            </button>

            <button
              type="button"
              onClick={onToggleActive}
              disabled={togglingActive}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-semibold border transition-all disabled:opacity-50 ${
                account.active !== false
                  ? 'bg-amber-50 border-amber-300 text-amber-900 hover:bg-amber-100'
                  : 'bg-emerald-50 border-emerald-300 text-emerald-900 hover:bg-emerald-100'
              }`}
            >
              {togglingActive ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Power className="w-3.5 h-3.5 stroke-[2.5]" />
              )}
              <span>{account.active !== false ? 'Desativar' : 'Reativar'}</span>
            </button>

            <button
              type="button"
              onClick={onDeleteAccount}
              disabled={deletingAccount}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-semibold border bg-rose-50 border-rose-300 text-rose-800 hover:bg-rose-100 hover:text-rose-950 transition-all disabled:opacity-50"
              title="Excluir definitivamente"
            >
              {deletingAccount ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Trash2 className="w-3.5 h-3.5" />
              )}
              <span>Excluir</span>
            </button>
          </div>

          {isEditing && (
            <form onSubmit={onSaveEdit} className="p-4 bg-[#F9FAFB] rounded-2xl border border-[#EBEEF2] space-y-3.5">
              <h4 className="text-xs font-bold text-[#111827] uppercase tracking-wider">
                Editar Conta / Cartão
              </h4>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-[#4B5563]">
                  Nome / Apelido *
                </label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Ex: Nubank, Cartão XP, Itaú Corrente..."
                  className="w-full bg-white border border-[#E5E7EB] rounded-xl px-3 py-1.5 text-xs text-[#111827] focus:outline-none focus:border-[#2F68FE]"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-[#4B5563]">Tipo</label>
                <select
                  value={editType}
                  onChange={(e) => setEditType(e.target.value as AccountType)}
                  className="w-full bg-white border border-[#E5E7EB] rounded-xl px-3 py-1.5 text-xs text-[#111827] focus:outline-none focus:border-[#2F68FE]"
                >
                  <option value="bank_account">Conta Bancária</option>
                  <option value="credit_card">Cartão de Crédito</option>
                  <option value="cash">Dinheiro</option>
                  <option value="debit_card">Cartão de Débito</option>
                  <option value="digital_wallet">Carteira Digital</option>
                  <option value="other">Outro</option>
                </select>
              </div>

              {/* Instituição e Identidade Visual */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-semibold text-[#4B5563]">
                    Instituição Financeira / Logo
                  </label>
                  {editCustomLogo && (
                    <button
                      type="button"
                      onClick={() => setEditCustomLogo('')}
                      className="text-[10px] text-red-600 hover:underline font-medium"
                    >
                      Remover logo manual
                    </button>
                  )}
                </div>

                {/* Preview da Identidade Visual */}
                <div className="flex items-center gap-3 p-2.5 bg-[#F9FAFB] rounded-xl border border-[#E5E7EB]">
                  <InstitutionLogo
                    institution={editInstitution}
                    accountName={editName}
                    accountType={editType}
                    customLogo={editCustomLogo}
                    color={editColor}
                    size="md"
                  />
                  <div className="min-w-0 flex-1">
                    <span className="text-xs font-semibold text-[#111827] block truncate">
                      {editCustomLogo
                        ? 'Logo personalizado (upload manual)'
                        : getInstitutionInfo(editInstitution || editName)?.name
                        ? `Identificado: ${getInstitutionInfo(editInstitution || editName)?.name}`
                        : 'Logo padrão / Monograma'}
                    </span>
                    <span className="text-[10px] text-[#6B7280] block">
                      {editCustomLogo
                        ? 'Usando imagem enviada por você'
                        : getInstitutionInfo(editInstitution || editName)
                        ? 'Logo oficial aplicado automaticamente'
                        : 'Escolha um banco abaixo ou envie um logo'}
                    </span>
                  </div>
                  <label className="cursor-pointer px-2.5 py-1 text-[11px] font-medium text-[#2F68FE] bg-[#EBF2FE] hover:bg-[#DDE9FD] rounded-lg transition-colors flex items-center gap-1 shrink-0">
                    <Upload className="w-3 h-3" />
                    <span>Upload</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => onLogoUpload(e.target.files?.[0], setEditCustomLogo)}
                    />
                  </label>
                </div>

                <input
                  type="text"
                  value={editInstitution}
                  onChange={(e) => setEditInstitution(e.target.value)}
                  placeholder="Ex: Nubank, Itaú, Inter, Bradesco..."
                  className="w-full bg-white border border-[#E5E7EB] rounded-xl px-3 py-1.5 text-xs text-[#111827] focus:outline-none focus:border-[#2F68FE]"
                />

                {/* Chips de instituições comuns */}
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {KNOWN_INSTITUTIONS.slice(0, 10).map((inst) => (
                    <button
                      key={inst.key}
                      type="button"
                      onClick={() => setEditInstitution(inst.shortName)}
                      className={`px-2 py-0.5 rounded-lg text-[10px] transition-colors border ${
                        getInstitutionInfo(editInstitution)?.key === inst.key
                          ? 'bg-[#2F68FE] text-white border-[#2F68FE] font-semibold'
                          : 'bg-white text-[#4B5563] border-[#E5E7EB] hover:bg-[#F4F5F7]'
                      }`}
                    >
                      {inst.shortName}
                    </button>
                  ))}
                </div>
              </div>

              {/* Cor Personalizada */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-semibold text-[#4B5563]">
                    Cor de Destaque (opcional)
                  </label>
                  {editColor && (
                    <button
                      type="button"
                      onClick={() => setEditColor('')}
                      className="text-[10px] text-[#6B7280] hover:text-[#111827] font-medium"
                    >
                      Redefinir para padrão
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {COLOR_PRESETS.map((item) => (
                    <button
                      key={item.hex || 'auto'}
                      type="button"
                      title={item.name}
                      onClick={() => setEditColor(item.hex)}
                      className={`w-6 h-6 rounded-full border transition-all ${
                        editColor.toLowerCase() === item.hex.toLowerCase()
                          ? 'ring-2 ring-offset-1 ring-[#2F68FE] scale-110 border-white'
                          : 'border-transparent hover:scale-105'
                      }`}
                      style={{
                        backgroundColor: item.hex || '#E5E7EB',
                        backgroundImage: item.hex
                          ? undefined
                          : 'linear-gradient(135deg, #E5E7EB 50%, #9CA3AF 50%)',
                      }}
                    />
                  ))}
                  <div className="flex items-center gap-1.5 ml-1">
                    <input
                      type="color"
                      value={editColor || '#2F68FE'}
                      onChange={(e) => setEditColor(e.target.value)}
                      className="w-6 h-6 p-0 border-0 rounded cursor-pointer bg-transparent"
                      title="Escolher cor personalizada"
                    />
                    <span className="text-[10px] font-mono text-[#6B7280]">
                      {editColor || 'Automático'}
                    </span>
                  </div>
                </div>
              </div>

              {editType === 'credit_card' && (
                <div className="grid grid-cols-2 gap-3 p-3 bg-white rounded-xl border border-[#E5E7EB]">
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-[#4B5563]">
                      Dia de Fechamento *
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="31"
                      required
                      value={editClosingDay}
                      onChange={(e) => setEditClosingDay(e.target.value)}
                      className="w-full bg-[#F9FAFB] border border-[#E5E7EB] rounded-lg px-2.5 py-1.5 text-xs text-[#111827] focus:outline-none focus:border-[#2F68FE]"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-[#4B5563]">
                      Dia de Vencimento *
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="31"
                      required
                      value={editDueDay}
                      onChange={(e) => setEditDueDay(e.target.value)}
                      className="w-full bg-[#F9FAFB] border border-[#E5E7EB] rounded-lg px-2.5 py-1.5 text-xs text-[#111827] focus:outline-none focus:border-[#2F68FE]"
                    />
                  </div>
                </div>
              )}

              {/* Seletor de Skin e Preview em Tempo Real para Cartão de Crédito */}
              {editType === 'credit_card' && (
                <div className="space-y-3 pt-1">
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold text-[#4B5563]">
                      Estilo do Cartão (Skin)
                    </label>
                    <div className="grid grid-cols-5 gap-1.5">
                      {CREDIT_CARD_SKINS.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => setEditSkin(s.id)}
                          className={`py-1.5 px-1 rounded-xl text-center text-[10px] font-semibold border transition-all ${
                            editSkin === s.id
                              ? 'bg-[#111827] text-white border-[#111827] shadow-xs'
                              : 'bg-white text-[#4B5563] border-[#E5E7EB] hover:bg-[#F9FAFB]'
                          }`}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Prévia do Cartão em Tempo Real */}
                  <div className="space-y-1">
                    <span className="text-[10px] font-medium text-[#6B7280]">
                      Prévia do Cartão
                    </span>
                    <CreditCardItem
                      name={editName || 'Nome do Cartão'}
                      institution={editInstitution}
                      color={editColor}
                      skin={editSkin}
                      customLogo={editCustomLogo}
                      currentMonthExpenses={account.currentMonthExpenses}
                      futureInstallmentsTotal={account.futureInstallmentsTotal}
                      futureInstallmentsCount={account.futureInstallmentsCount}
                      closingDay={parseInt(editClosingDay, 10) || 5}
                      dueDay={parseInt(editDueDay, 10) || 15}
                      isPreview={true}
                    />
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="px-3 py-1.5 text-xs font-semibold text-[#6B7280] hover:text-[#111827]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-[#2F68FE] hover:bg-[#2557D6] text-white text-xs font-semibold transition-all disabled:opacity-50"
                >
                  {savingEdit && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Salvar Alterações
                </button>
              </div>
            </form>
          )}

          {account.type === 'credit_card' && (() => {
            const today = new Date().toISOString().slice(0, 10)
            const cDay = account.closing_day || 5
            const dDay = account.due_day || 15
            const activeCycle = getCardInvoiceDates(today, cDay, dDay)

            const invoiceTxs = drawerTransactions.filter((tx) => {
              const cycle = getCardInvoiceDates(tx.date || today, cDay, dDay)
              return cycle.dueDate === activeCycle.dueDate
            })
            const futureTxs = drawerTransactions.filter((tx) => {
              const cycle = getCardInvoiceDates(tx.date || today, cDay, dDay)
              return cycle.dueDate > activeCycle.dueDate
            })
            const invoiceTotal = account.currentMonthExpenses || 0
            const futureTotal = account.futureInstallmentsTotal || 0

            const remainingAmount = Math.max(0, invoiceTotal - invoicePaidAmount)
            const isPaid = invoiceStatus === 'paid' || (invoiceTotal > 0 && remainingAmount <= 0.009)
            const isPartial = invoiceStatus === 'partial' || (invoicePaidAmount > 0 && remainingAmount > 0.009)

            return (
              <div className="space-y-4">
                <div className="p-4 bg-[#F9FAFB] rounded-2xl border border-[#EBEEF2] space-y-3.5 shadow-2xs">
                  {/* Topo do Bloco da Fatura */}
                  <div className="flex items-center justify-between text-xs border-b border-[#EBEEF2] pb-2.5">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-[#111827] flex items-center gap-1.5">
                        <CalendarDays className="w-4 h-4 text-[#2F68FE]" />
                        Fatura Atual
                      </span>
                      {isPaid ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-300">
                          <CheckCircle2 className="w-3 h-3 text-emerald-700" />
                          Paga
                        </span>
                      ) : isPartial ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300">
                          <AlertCircle className="w-3 h-3 text-amber-700" />
                          Paga Parcial
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-300">
                          Aberta
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] font-medium text-slate-600">
                      Fecha dia {cDay} • Vence dia {dDay}
                    </span>
                  </div>

                  {/* Valores da Fatura */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block">
                        Total da Fatura
                      </span>
                      <span className="text-lg font-extrabold text-[#111827] block mt-0.5">
                        {formatBRL(invoiceTotal)}
                      </span>
                      <span className="text-[10px] text-slate-500 block mt-0.5">
                        Vencimento: {activeCycle.dueDate.slice(8, 10)}/{activeCycle.dueDate.slice(5, 7)}/{activeCycle.dueDate.slice(0, 4)}
                      </span>
                    </div>

                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block">
                        {isPaid ? 'Total Pago' : isPartial ? 'Restante em Aberto' : 'Parcelas Futuras'}
                      </span>
                      {isPaid ? (
                        <span className="text-lg font-extrabold text-emerald-800 block mt-0.5">
                          {formatBRL(invoicePaidAmount || invoiceTotal)}
                        </span>
                      ) : isPartial ? (
                        <span className="text-lg font-extrabold text-amber-800 block mt-0.5">
                          {formatBRL(remainingAmount)}
                        </span>
                      ) : (
                        <span className="text-lg font-extrabold text-slate-700 block mt-0.5">
                          {formatBRL(futureTotal)}
                        </span>
                      )}
                      <span className="text-[10px] text-slate-500 block mt-0.5">
                        {isPartial
                          ? `Pago até agora: ${formatBRL(invoicePaidAmount)}`
                          : account.futureInstallmentsCount !== undefined
                          ? `${account.futureInstallmentsCount} lançamento(s) futuro(s)`
                          : `${futureTxs.length} lançamento(s) futuro(s)`}
                      </span>
                    </div>
                  </div>

                  {/* Ação de Pagamento */}
                  <div className="pt-2 border-t border-slate-200/80 flex items-center justify-between gap-2">
                    {isPaid ? (
                      <div className="text-xs text-emerald-800 font-medium flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        <span>Fatura quitada integralmente.</span>
                      </div>
                    ) : (
                      <div className="text-xs text-slate-600 font-medium">
                        {isPartial ? 'Fatura com pagamento parcial registrado.' : 'Fatura aguardando pagamento.'}
                      </div>
                    )}

                    {onOpenPayInvoiceModal && (
                      <button
                        type="button"
                        onClick={onOpenPayInvoiceModal}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-xs ${
                          isPaid
                            ? 'bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300'
                            : 'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white'
                        }`}
                      >
                        <Receipt className="w-3.5 h-3.5 stroke-[2.5]" />
                        <span>{isPaid ? 'Registrar Outro Pagamento' : isPartial ? 'Pagar Restante' : 'Pagar Fatura'}</span>
                      </button>
                    )}
                  </div>

                  {/* Histórico de Pagamentos se houver */}
                  {invoicePayments.length > 0 && (
                    <div className="pt-2 border-t border-slate-200/80 space-y-1.5">
                      <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider flex items-center gap-1">
                        <History className="w-3 h-3" />
                        Histórico de Pagamentos ({invoicePayments.length})
                      </span>
                      <div className="space-y-1">
                        {invoicePayments.map((pay) => (
                          <div
                            key={pay.id}
                            className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 flex items-center justify-between text-xs"
                          >
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-emerald-800">
                                {formatBRL(pay.amount)}
                              </span>
                              {pay.payment_method && (
                                <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-700 font-semibold">
                                  {pay.payment_method}
                                </span>
                              )}
                              {pay.notes && (
                                <span className="text-[11px] text-slate-500 truncate max-w-[120px]">
                                  • {pay.notes}
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] text-slate-500 font-medium">
                              {pay.payment_date.slice(8, 10)}/{pay.payment_date.slice(5, 7)}/{pay.payment_date.slice(0, 4)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Segmented filter */}
                <div className="flex items-center gap-1 p-1 bg-[#F4F5F7] rounded-xl text-xs">
                  <button
                    type="button"
                    onClick={() => setCardInvoiceFilter('invoice')}
                    className={`flex-1 py-1.5 px-2 rounded-lg font-medium transition-all ${
                      cardInvoiceFilter === 'invoice'
                        ? 'bg-white text-[#111827] shadow-sm font-semibold'
                        : 'text-[#6B7280] hover:text-[#111827]'
                    }`}
                  >
                    Compras da Fatura ({invoiceTxs.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setCardInvoiceFilter('future')}
                    className={`flex-1 py-1.5 px-2 rounded-lg font-medium transition-all ${
                      cardInvoiceFilter === 'future'
                        ? 'bg-white text-[#111827] shadow-sm font-semibold'
                        : 'text-[#6B7280] hover:text-[#111827]'
                    }`}
                  >
                    Parcelas Futuras ({futureTxs.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setCardInvoiceFilter('all')}
                    className={`flex-1 py-1.5 px-2 rounded-lg font-medium transition-all ${
                      cardInvoiceFilter === 'all'
                        ? 'bg-white text-[#111827] shadow-sm font-semibold'
                        : 'text-[#6B7280] hover:text-[#111827]'
                    }`}
                  >
                    Todas ({drawerTransactions.length})
                  </button>
                </div>
              </div>
            )
          })()}

          {/* Lista de Lançamentos Vinculados */}
          {(() => {
            const isCreditCard = account.type === 'credit_card'
            const today = new Date().toISOString().slice(0, 10)
            const cDay = account.closing_day || 5
            const dDay = account.due_day || 15
            const activeCycle = getCardInvoiceDates(today, cDay, dDay)

            let displayedTxs = drawerTransactions
            if (isCreditCard) {
              if (cardInvoiceFilter === 'invoice') {
                displayedTxs = drawerTransactions.filter((tx) => {
                  const cycle = getCardInvoiceDates(tx.date || today, cDay, dDay)
                  return cycle.dueDate === activeCycle.dueDate
                })
              } else if (cardInvoiceFilter === 'future') {
                displayedTxs = drawerTransactions.filter((tx) => {
                  const cycle = getCardInvoiceDates(tx.date || today, cDay, dDay)
                  return cycle.dueDate > activeCycle.dueDate
                })
              }
            }

            return (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#9CA3AF]">
                    {isCreditCard
                      ? cardInvoiceFilter === 'invoice'
                        ? `Compras da Fatura Atual (${displayedTxs.length})`
                        : cardInvoiceFilter === 'future'
                        ? `Parcelas Futuras (${displayedTxs.length})`
                        : `Todas as Compras (${displayedTxs.length})`
                      : `Lançamentos Vinculados (${displayedTxs.length})`}
                  </h3>
                  <button
                    type="button"
                    onClick={() => {
                      onClose()
                      navigateToTransactionsFiltered({ accountId: account.id })
                    }}
                    className="text-xs font-semibold text-[#2F68FE] hover:underline inline-flex items-center gap-1"
                  >
                    <span>Ver no Extrato</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>

                {loadingDrawerTx ? (
                  <div className="p-8 text-center text-xs text-[#9CA3AF] bg-[#F9FAFB] rounded-2xl border border-[#EBEEF2]">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-[#2F68FE]" />
                    Carregando lançamentos...
                  </div>
                ) : displayedTxs.length === 0 ? (
                  <div className="p-8 text-center text-xs text-[#9CA3AF] bg-[#F9FAFB] rounded-2xl border border-[#EBEEF2] space-y-1">
                    <p className="font-semibold text-[#4B5563]">
                      {isCreditCard && cardInvoiceFilter === 'invoice'
                        ? 'Nenhuma compra lançada nesta fatura atual'
                        : isCreditCard && cardInvoiceFilter === 'future'
                        ? 'Nenhuma parcela futura programada'
                        : 'Nenhum lançamento vinculado'}
                    </p>
                    <p className="text-[11px] text-[#9CA3AF]">
                      Ao realizar lançamentos com esta conta, eles aparecerão aqui.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {displayedTxs.map((tx) => {
                      const isIncome = tx.type === 'income'
                      const amount = Number(tx.installment_amount) || Number(tx.total) || 0
                      const cycle = isCreditCard
                        ? getCardInvoiceDates(tx.date || today, cDay, dDay)
                        : null

                      return (
                        <div
                          key={tx.id}
                          className="p-3 bg-[#F9FAFB] hover:bg-white border border-[#EBEEF2] hover:border-[#D1D5DB] rounded-xl flex items-center justify-between gap-3 transition-colors"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs font-bold text-[#111827] truncate">
                                {tx.vendor || 'Sem descrição'}
                              </span>
                              {tx.installment_total && tx.installment_total > 1 && (
                                <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-[#EBF2FF] text-[#2F68FE]">
                                  {tx.installment_current}/{tx.installment_total}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5 text-[11px] text-[#9CA3AF] flex-wrap">
                              <span>{tx.date || 'Sem data'}</span>
                              {tx.category && (
                                <>
                                  <span>•</span>
                                  <span className="truncate">{tx.category}</span>
                                </>
                              )}
                              {cycle && (
                                <>
                                  <span>•</span>
                                  <span className="text-[#6B7280]">
                                    Fatura vence dia {cycle.dueDate.slice(8, 10)}/{cycle.dueDate.slice(5, 7)}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <span
                              className={`text-xs font-bold block ${
                                isIncome ? 'text-[#10B981]' : 'text-[#111827]'
                              }`}
                            >
                              {isIncome ? `+${formatBRL(amount)}` : `-${formatBRL(amount)}`}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })()}
        </div>

        <div className="p-4 border-t border-[#EBEEF2] bg-[#F9FAFB] flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-[#4B5563] hover:text-[#111827] hover:bg-white transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}
