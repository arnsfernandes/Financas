'use client'

import React, { useState, useEffect } from 'react'
import {
  Landmark,
  CreditCard,
  Banknote,
  Plus,
  Minus,
  X,
  Loader2,
  Edit3,
  Check,
  Power,
  ChevronRight,
  ArrowRight,
  Calendar,
  Layers,
  Wallet,
  Building2,
  PiggyBank,
  Target,
  ShieldCheck,
  ArrowDownLeft,
  ArrowUpRight,
  TrendingUp,
  Trash2,
  Info,
  CalendarDays,
  Upload,
  Palette,
} from 'lucide-react'
import type { AccountType } from '@/lib/schema'
import type { AccountWithStats } from '@/lib/queries'
import type { Reserve, ReserveMovement } from '@/lib/reserves'
import { getCardInvoiceDates } from '@/lib/billingCycles'
import { InstitutionLogo } from './InstitutionLogo'
import { CreditCardItem, CREDIT_CARD_SKINS, type CreditCardSkin } from './CreditCardItem'
import { KNOWN_INSTITUTIONS, getInstitutionInfo } from '@/lib/institutions'
import {
  formatBRL,
  getAccountTypeLabel,
  getAccountTypeLucideIcon,
} from '@/lib/formatters'
import { useTelegramWebApp } from '@/lib/useTelegramWebApp'

export const COLOR_PRESETS = [
  { name: 'Padrão / Automático', hex: '' },
  { name: 'Roxo Nubank', hex: '#820AD1' },
  { name: 'Laranja Inter', hex: '#FF7A00' },
  { name: 'Azul Itaú / Caixa', hex: '#005CA9' },
  { name: 'Vermelho Bradesco', hex: '#CC092F' },
  { name: 'Vermelho Santander', hex: '#EC0000' },
  { name: 'Amarelo BB', hex: '#EAB308' },
  { name: 'Verde PicPay', hex: '#11C76F' },
  { name: 'Azul Mercado Pago', hex: '#009EE3' },
  { name: 'Preto C6 / Carbon', hex: '#1E293B' },
  { name: 'Verde Esmeralda', hex: '#10B981' },
  { name: 'Azul Petróleo', hex: '#0284C7' },
  { name: 'Rosa Magenta', hex: '#E11D48' },
]

export function getAccountTypeBadge(type: AccountType | string) {
  switch (type) {
    case 'credit_card':
      return {
        label: 'Crédito',
        className: 'bg-purple-50 text-purple-700 border-purple-200/60',
      }
    case 'bank_account':
      return {
        label: 'Conta',
        className: 'bg-blue-50 text-blue-700 border-blue-200/60',
      }
    case 'cash':
      return {
        label: 'Dinheiro',
        className: 'bg-emerald-50 text-emerald-700 border-emerald-200/60',
      }
    case 'debit_card':
      return {
        label: 'Débito',
        className: 'bg-indigo-50 text-indigo-700 border-indigo-200/60',
      }
    case 'digital_wallet':
      return {
        label: 'Carteira',
        className: 'bg-cyan-50 text-cyan-700 border-cyan-200/60',
      }
    default:
      return {
        label: 'Outro',
        className: 'bg-gray-50 text-gray-700 border-gray-200/60',
      }
  }
}


export interface AccountsTabProps {
  accounts: (AccountWithStats & {
    transactionCount?: number
    currentMonthExpenses?: number
    futureInstallmentsTotal?: number
    futureInstallmentsCount?: number
  })[]
  loadingAccounts: boolean
  fetchAccounts: () => void
  navigateToTransactionsFiltered: (filters: {
    accountId?: string
    startDate?: string
    endDate?: string
  }) => void
  dashboardData?: any
  loadingDashboard?: boolean
  fetchDashboard?: () => void
  periodType?: any
  handlePeriodTypeChange?: any
  handleMonthNavigate?: any
  customStartDate?: any
  setCustomStartDate?: any
  customEndDate?: any
  setCustomEndDate?: any
  handleApplyCustomPeriod?: any
}

export function AccountsTab({
  accounts,
  loadingAccounts,
  fetchAccounts,
  navigateToTransactionsFiltered,
}: AccountsTabProps) {
  // Modal de Criação de Nova Conta / Cartão
  const [modalOpen, setModalOpen] = useState(false)
  const [formName, setFormName] = useState('')
  const [formType, setFormType] = useState<AccountType>('bank_account')
  const [formInstitution, setFormInstitution] = useState('')
  const [formClosingDay, setFormClosingDay] = useState('5')
  const [formDueDay, setFormDueDay] = useState('15')
  const [formCustomLogo, setFormCustomLogo] = useState('')
  const [formColor, setFormColor] = useState('')
  const [formSkin, setFormSkin] = useState<CreditCardSkin>('gradient')
  const [savingAccount, setSavingAccount] = useState(false)
  const [accountError, setAccountError] = useState('')

  // Drawer de Detalhes da Conta / Cartão
  const [selectedAccount, setSelectedAccount] = useState<AccountWithStats | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerTransactions, setDrawerTransactions] = useState<any[]>([])
  const [loadingDrawerTx, setLoadingDrawerTx] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const [editType, setEditType] = useState<AccountType>('bank_account')
  const [editInstitution, setEditInstitution] = useState('')
  const [editClosingDay, setEditClosingDay] = useState('5')
  const [editDueDay, setEditDueDay] = useState('15')
  const [editCustomLogo, setEditCustomLogo] = useState('')
  const [editColor, setEditColor] = useState('')
  const [editSkin, setEditSkin] = useState<CreditCardSkin>('gradient')
  const [cardInvoiceFilter, setCardInvoiceFilter] = useState<'invoice' | 'future' | 'all'>('invoice')
  const [savingEdit, setSavingEdit] = useState(false)
  const [togglingActive, setTogglingActive] = useState(false)
  const [drawerError, setDrawerError] = useState('')

  // ==========================================
  // ESTADO DE RESERVAS (DINHEIRO GUARDADO)
  // ==========================================
  const [reserves, setReserves] = useState<Reserve[]>([])
  const [loadingReserves, setLoadingReserves] = useState(false)
  const [totalSaved, setTotalSaved] = useState<number>(0)

  // Helper de Upload de Logo
  function handleLogoUpload(file: File | undefined, onDone: (url: string) => void) {
    if (!file) return
    if (file.size > 2 * 1024 * 1024) {
      alert('A imagem do logo deve ter no máximo 2MB.')
      return
    }
    const reader = new FileReader()
    reader.onload = (e) => {
      const res = e.target?.result
      if (typeof res === 'string') {
        onDone(res)
      }
    }
    reader.readAsDataURL(file)
  }

  // Modal de Nova Reserva
  const [reserveModalOpen, setReserveModalOpen] = useState(false)
  const [reserveFormName, setReserveFormName] = useState('')
  const [reserveFormInitialBalance, setReserveFormInitialBalance] = useState('')
  const [reserveFormTargetAmount, setReserveFormTargetAmount] = useState('')
  const [reserveFormNotes, setReserveFormNotes] = useState('')
  const [reserveFormFromAccount, setReserveFormFromAccount] = useState('')
  const [savingReserve, setSavingReserve] = useState(false)
  const [reserveError, setReserveError] = useState('')

  // Drawer de Detalhes da Reserva
  const [selectedReserve, setSelectedReserve] = useState<Reserve | null>(null)
  const [reserveDrawerOpen, setReserveDrawerOpen] = useState(false)

  // Edição da Reserva
  const [isEditingReserve, setIsEditingReserve] = useState(false)
  const [editReserveName, setEditReserveName] = useState('')
  const [editReserveTarget, setEditReserveTarget] = useState('')
  const [savingReserveEdit, setSavingReserveEdit] = useState(false)
  const [deletingReserve, setDeletingReserve] = useState(false)

  // Modal de Movimentação (Aporte / Retirada)
  const [movementModalOpen, setMovementModalOpen] = useState(false)
  const [movementType, setMovementType] = useState<'deposit' | 'withdrawal'>('deposit')
  const [movementAmount, setMovementAmount] = useState('')
  const [movementNotes, setMovementNotes] = useState('')
  const [movementAccount, setMovementAccount] = useState('')
  const [movementDate, setMovementDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [savingMovement, setSavingMovement] = useState(false)
  const [movementError, setMovementError] = useState('')

  const { fetchWithAuth } = useTelegramWebApp()
  const [reservesError, setReservesError] = useState('')

  async function fetchReserves() {
    setLoadingReserves(true)
    setReservesError('')
    try {
      const res = await fetchWithAuth(`/api/reserves?_t=${Date.now()}`)
      const data = await res.json()
      if (data.ok && Array.isArray(data.reserves)) {
        setReserves(data.reserves)
        setTotalSaved(data.totalSaved || 0)
        if (selectedReserve) {
          const updated = data.reserves.find((r: Reserve) => r.id === selectedReserve.id)
          if (updated) setSelectedReserve(updated)
        }
      } else {
        setReservesError(data.error || 'Erro ao carregar reservas.')
      }
    } catch (e) {
      console.error('Erro ao carregar reservas:', e)
      setReservesError('Erro de conexão ao carregar reservas.')
    } finally {
      setLoadingReserves(false)
    }
  }

  useEffect(() => {
    fetchReserves()
  }, [])

  // ------------------------------------------
  // Handlers para Contas
  // ------------------------------------------
  async function handleCreateAccount(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = formName.trim()
    if (!trimmed) {
      setAccountError('Nome da conta ou cartão é obrigatório.')
      return
    }

    setSavingAccount(true)
    setAccountError('')

    try {
      const payload: any = {
        name: trimmed,
        type: formType,
        institution: formInstitution.trim() || null,
        custom_logo: formCustomLogo.trim() || null,
        color: formColor.trim() || null,
      }
      if (formType === 'credit_card') {
        payload.closing_day = parseInt(formClosingDay, 10) || 5
        payload.due_day = parseInt(formDueDay, 10) || 15
        payload.skin = formSkin
      }

      const res = await fetchWithAuth('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json()
      if (data.ok && data.account) {
        fetchAccounts()
        setModalOpen(false)
        setFormName('')
        setFormInstitution('')
        setFormCustomLogo('')
        setFormColor('')
        setFormSkin('gradient')
        setFormType('bank_account')
        setFormClosingDay('5')
        setFormDueDay('15')
      } else {
        setAccountError(data.error || 'Erro ao cadastrar conta.')
      }
    } catch {
      setAccountError('Erro de conexão ao cadastrar.')
    } finally {
      setSavingAccount(false)
    }
  }

  async function handleOpenDetails(acc: AccountWithStats) {
    setSelectedAccount(acc)
    setIsEditing(false)
    setEditName(acc.name)
    setEditType((acc.type as AccountType) || 'bank_account')
    setEditInstitution(acc.institution || '')
    setEditClosingDay(String(acc.closing_day || 5))
    setEditDueDay(String(acc.due_day || 15))
    setEditCustomLogo(acc.custom_logo || '')
    setEditColor(acc.color || '')
    setEditSkin(((acc as any).skin as CreditCardSkin) || 'gradient')
    setCardInvoiceFilter('invoice')
    setDrawerError('')
    setDrawerOpen(true)
    setLoadingDrawerTx(true)

    try {
      const res = await fetchWithAuth(`/api/accounts/${acc.id}?_t=${Date.now()}`)
      const data = await res.json()
      if (data.ok && data.account) {
        setSelectedAccount(data.account)
        setDrawerTransactions(Array.isArray(data.transactions) ? data.transactions : (data.account.transactions || []))
      } else {
        setDrawerTransactions([])
        setDrawerError(data.error || 'Erro ao carregar movimentações da conta.')
      }
    } catch {
      setDrawerTransactions([])
      setDrawerError('Erro de conexão ao carregar movimentações.')
    } finally {
      setLoadingDrawerTx(false)
    }
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedAccount) return
    const trimmed = editName.trim()
    if (!trimmed) {
      setDrawerError('Nome da conta ou cartão é obrigatório.')
      return
    }

    setSavingEdit(true)
    setDrawerError('')
    try {
      const payload: any = {
        name: trimmed,
        type: editType,
        institution: editInstitution.trim() || null,
        custom_logo: editCustomLogo.trim() || null,
        color: editColor.trim() || null,
      }
      if (editType === 'credit_card') {
        payload.closing_day = parseInt(editClosingDay, 10) || 5
        payload.due_day = parseInt(editDueDay, 10) || 15
        payload.skin = editSkin
      }

      const res = await fetchWithAuth(`/api/accounts/${selectedAccount.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (data.ok && data.account) {
        setIsEditing(false)
        setSelectedAccount((prev) => (prev ? { ...prev, ...data.account } : null))
        fetchAccounts()
      } else {
        setDrawerError(data.error || 'Erro ao salvar alterações.')
      }
    } catch {
      setDrawerError('Erro de conexão ao salvar.')
    } finally {
      setSavingEdit(false)
    }
  }

  async function handleToggleActive() {
    if (!selectedAccount) return
    const newActive = !selectedAccount.active
    setTogglingActive(true)
    setDrawerError('')
    try {
      const res = await fetchWithAuth(`/api/accounts/${selectedAccount.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: newActive }),
      })
      const data = await res.json()
      if (data.ok && data.account) {
        setSelectedAccount((prev) => (prev ? { ...prev, active: newActive } : null))
        fetchAccounts()
      } else {
        setDrawerError(data.error || 'Erro ao alterar status da conta.')
      }
    } catch {
      setDrawerError('Erro de conexão ao alterar status.')
    } finally {
      setTogglingActive(false)
    }
  }

  // ------------------------------------------
  // Handlers para Reservas
  // ------------------------------------------
  async function handleCreateReserve(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = reserveFormName.trim()
    if (!trimmed) {
      setReserveError('Nome da reserva é obrigatório.')
      return
    }

    setSavingReserve(true)
    setReserveError('')
    try {
      const res = await fetchWithAuth('/api/reserves', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmed,
          initialBalance: reserveFormInitialBalance ? parseFloat(reserveFormInitialBalance.replace(',', '.')) : 0,
          targetAmount: reserveFormTargetAmount ? parseFloat(reserveFormTargetAmount.replace(',', '.')) : null,
          notes: reserveFormNotes.trim() || undefined,
          fromAccount: reserveFormFromAccount || undefined,
        }),
      })

      const data = await res.json()
      if (data.ok && data.reserve) {
        await fetchReserves()
        setReserveModalOpen(false)
        setReserveFormName('')
        setReserveFormInitialBalance('')
        setReserveFormTargetAmount('')
        setReserveFormNotes('')
        setReserveFormFromAccount('')
      } else {
        setReserveError(data.error || 'Erro ao cadastrar reserva.')
      }
    } catch {
      setReserveError('Erro de conexão ao cadastrar reserva.')
    } finally {
      setSavingReserve(false)
    }
  }

  function handleOpenReserveDetails(reserve: Reserve) {
    setSelectedReserve(reserve)
    setIsEditingReserve(false)
    setEditReserveName(reserve.name)
    setEditReserveTarget(reserve.targetAmount ? String(reserve.targetAmount) : '')
    setReserveDrawerOpen(true)
  }

  function handleOpenMovementModal(type: 'deposit' | 'withdrawal') {
    setMovementType(type)
    setMovementAmount('')
    setMovementNotes('')
    setMovementAccount('')
    setMovementDate(new Date().toISOString().slice(0, 10))
    setMovementError('')
    setMovementModalOpen(true)
  }

  async function handleSaveMovement(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedReserve) return
    const amountVal = parseFloat(movementAmount.replace(',', '.'))
    if (!amountVal || amountVal <= 0) {
      setMovementError('Valor deve ser maior que zero.')
      return
    }

    if (movementType === 'withdrawal' && amountVal > selectedReserve.currentBalance) {
      setMovementError(`Saldo insuficiente (disponível: ${formatBRL(selectedReserve.currentBalance)}).`)
      return
    }

    setSavingMovement(true)
    setMovementError('')
    try {
      const res = await fetchWithAuth(`/api/reserves/${selectedReserve.id}/movements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: movementType,
          amount: amountVal,
          date: movementDate,
          notes: movementNotes.trim() || undefined,
          fromAccount: movementAccount || undefined,
        }),
      })

      const data = await res.json()
      if (data.ok && data.reserve) {
        setSelectedReserve(data.reserve)
        await fetchReserves()
        setMovementModalOpen(false)
        setMovementAmount('')
        setMovementNotes('')
        setMovementAccount('')
      } else {
        setMovementError(data.error || 'Erro ao registrar movimentação.')
      }
    } catch {
      setMovementError('Erro de conexão ao registrar movimentação.')
    } finally {
      setSavingMovement(false)
    }
  }

  async function handleSaveReserveEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedReserve) return
    const trimmed = editReserveName.trim()
    if (!trimmed) return

    setSavingReserveEdit(true)
    try {
      const res = await fetchWithAuth(`/api/reserves/${selectedReserve.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmed,
          targetAmount: editReserveTarget ? parseFloat(editReserveTarget.replace(',', '.')) : null,
        }),
      })

      const data = await res.json()
      if (data.ok && data.reserve) {
        setSelectedReserve(data.reserve)
        setIsEditingReserve(false)
        await fetchReserves()
      }
    } catch (err) {
      console.error('Erro ao editar reserva:', err)
    } finally {
      setSavingReserveEdit(false)
    }
  }

  async function handleDeleteReserve() {
    if (!selectedReserve) return
    if (!window.confirm(`Deseja realmente excluir a reserva "${selectedReserve.name}"?`)) return

    setDeletingReserve(true)
    try {
      const res = await fetchWithAuth(`/api/reserves/${selectedReserve.id}`, {
        method: 'DELETE',
      })
      const data = await res.json()
      if (data.ok) {
        setReserveDrawerOpen(false)
        setSelectedReserve(null)
        await fetchReserves()
      }
    } catch (err) {
      console.error('Erro ao excluir reserva:', err)
    } finally {
      setDeletingReserve(false)
    }
  }

  return (
    <section className="space-y-10">
      {/* ======================================================== */}
      {/* SEÇÃO 1: CONTAS E CARTÕES                                */}
      {/* ======================================================== */}
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#EBEEF2]">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-[#111827]">Contas e Cartões</h1>
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-[#F4F5F7] text-[#6B7280]">
                {accounts.length} {accounts.length === 1 ? 'cadastrado' : 'cadastrados'}
              </span>
            </div>
            <p className="text-xs text-[#6B7280] mt-1">
              Gerencie onde o dinheiro entra/sai e os cartões usados nos lançamentos.
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              setModalOpen(true)
              setAccountError('')
            }}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-[#2F68FE] hover:bg-[#2557D6] text-white text-xs font-semibold shadow-sm transition-all self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>Nova Conta / Cartão</span>
          </button>
        </div>

        {/* Lista de Cards de Contas e Cartões */}
        {loadingAccounts && accounts.length === 0 ? (
          <div className="bg-white border border-[#EBEEF2] rounded-2xl p-10 text-center text-xs text-[#9CA3AF]">
            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-[#2F68FE]" />
            Carregando contas e cartões...
          </div>
        ) : accounts.length === 0 ? (
          <div className="bg-white border border-[#EBEEF2] rounded-2xl p-10 text-center space-y-3">
            <Wallet className="w-10 h-10 text-[#9CA3AF] mx-auto stroke-1" />
            <h3 className="text-sm font-bold text-[#111827]">Nenhuma conta ou cartão cadastrado</h3>
            <p className="text-xs text-[#6B7280] max-w-sm mx-auto">
              Cadastre suas contas bancárias, cartões de crédito ou dinheiro para organizar suas movimentações.
            </p>
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#2F68FE] hover:bg-[#2557D6] text-white text-xs font-semibold shadow-sm transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Cadastrar primeira conta</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {accounts.map((acc) => {
              const isInactive = acc.active === false
              const isCreditCard = acc.type === 'credit_card'

              // Cartões de Crédito possuem skin própria elegante inspirada em cartão real
              if (isCreditCard) {
                return (
                  <CreditCardItem
                    key={acc.id}
                    id={acc.id}
                    name={acc.name}
                    institution={acc.institution}
                    color={acc.color}
                    skin={(acc as any).skin}
                    customLogo={acc.custom_logo}
                    currentMonthExpenses={acc.currentMonthExpenses}
                    futureInstallmentsTotal={acc.futureInstallmentsTotal}
                    futureInstallmentsCount={acc.futureInstallmentsCount}
                    closingDay={acc.closing_day}
                    dueDay={acc.due_day}
                    inactive={isInactive}
                    onClick={() => handleOpenDetails(acc)}
                  />
                )
              }

              const isBankAccount = acc.type === 'bank_account'
              const isCash = acc.type === 'cash'

              // Identidade visual e cor de destaque para contas convencionais
              const instInfo = getInstitutionInfo(acc.institution || acc.name)
              const cardAccentColor =
                acc.color ||
                instInfo?.primaryColor ||
                (isCash ? '#10B981' : '#2F68FE')

              const badge = getAccountTypeBadge(acc.type)

              return (
                <div
                  key={acc.id}
                  onClick={() => handleOpenDetails(acc)}
                  className={`group bg-white border rounded-2xl p-5 transition-all cursor-pointer flex flex-col justify-between gap-4 relative overflow-hidden hover:shadow-md hover:border-[#2F68FE]/40 ${
                    isInactive ? 'opacity-65 border-[#E5E7EB] bg-[#FAFAFA]' : 'border-[#EBEEF2]'
                  }`}
                >
                  {/* Linha discreta de destaque no topo com a cor da conta */}
                  <div
                    className="h-1 w-full absolute top-0 left-0"
                    style={{ backgroundColor: cardAccentColor }}
                  />

                  <div>
                    {/* Topo do Card */}
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <InstitutionLogo
                          institution={acc.institution}
                          accountName={acc.name}
                          accountType={acc.type}
                          customLogo={acc.custom_logo}
                          color={acc.color}
                          size="lg"
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="font-bold text-sm text-[#111827] group-hover:text-[#2F68FE] transition-colors truncate">
                              {acc.name}
                            </h3>
                          </div>
                          {acc.institution && (
                            <p className="text-xs text-[#6B7280] font-medium truncate mt-0.5">
                              {acc.institution}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Badges do topo: Tipo + Inativa */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${badge.className}`}
                        >
                          {badge.label}
                        </span>

                        {isInactive && (
                          <span className="text-[10px] font-semibold text-[#6B7280] bg-[#F4F5F7] border border-[#E5E7EB] px-2 py-0.5 rounded-full">
                            Inativa
                          </span>
                        )}
                      </div>
                    </div>

                    {isBankAccount && (
                      <div className="mt-4 pt-3 border-t border-[#F4F5F7] space-y-2">
                        <div>
                          <span className="text-[10px] font-medium uppercase tracking-wider text-[#9CA3AF] block">
                            Movimentações
                          </span>
                          <div className="text-lg font-bold text-[#111827] tracking-tight mt-0.5">
                            {acc.transactionCount || 0}{' '}
                            <span className="text-xs font-normal text-[#6B7280]">
                              {(acc.transactionCount || 0) === 1
                                ? 'lançamento vinculado'
                                : 'lançamentos vinculados'}
                            </span>
                          </div>
                        </div>

                        {acc.institution && (
                          <div className="flex items-center justify-between text-xs text-[#6B7280]">
                            <span>Instituição:</span>
                            <span className="font-semibold text-[#374151] truncate max-w-[170px]">
                              {acc.institution}
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    {isCash && (
                      <div className="mt-4 pt-3 border-t border-[#F4F5F7] space-y-2">
                        <div>
                          <span className="text-[10px] font-medium uppercase tracking-wider text-[#9CA3AF] block">
                            Movimentações
                          </span>
                          <div className="text-lg font-bold text-[#111827] tracking-tight mt-0.5">
                            {acc.transactionCount || 0}{' '}
                            <span className="text-xs font-normal text-[#6B7280]">
                              {(acc.transactionCount || 0) === 1
                                ? 'lançamento em espécie'
                                : 'lançamentos em espécie'}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-xs text-[#6B7280]">
                          <span>Identificação:</span>
                          <span className="font-medium text-[#4B5563]">Dinheiro em espécie</span>
                        </div>
                      </div>
                    )}

                    {!isCreditCard && !isBankAccount && !isCash && (
                      <div className="mt-4 pt-3 border-t border-[#F4F5F7] space-y-2">
                        <div>
                          <span className="text-[10px] font-medium uppercase tracking-wider text-[#9CA3AF] block">
                            Movimentações
                          </span>
                          <div className="text-lg font-bold text-[#111827] tracking-tight mt-0.5">
                            {acc.transactionCount || 0}{' '}
                            <span className="text-xs font-normal text-[#6B7280]">
                              {(acc.transactionCount || 0) === 1
                                ? 'lançamento vinculado'
                                : 'lançamentos vinculados'}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Rodapé do Card */}
                  <div className="pt-2 flex items-center justify-between text-xs text-[#6B7280] group-hover:text-[#2F68FE] transition-colors border-t border-[#F9FAFB]">
                    <span className="text-[11px] font-medium">
                      {acc.transactionCount || 0}{' '}
                      {(acc.transactionCount || 0) === 1 ? 'lançamento' : 'lançamentos'}
                    </span>
                    <span className="inline-flex items-center gap-1 font-semibold text-[11px]">
                      Ver detalhes
                      <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ======================================================== */}
      {/* SEÇÃO 2: RESERVAS (DINHEIRO GUARDADO)                    */}
      {/* ======================================================== */}
      <div className="pt-8 border-t border-[#EBEEF2] space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <PiggyBank className="w-4 h-4" />
              </div>
              <h2 className="text-xl font-bold tracking-tight text-[#111827]">Reservas</h2>
            </div>
            <p className="text-xs text-[#6B7280] mt-1">
              Controle seu dinheiro guardado e metas sem misturar com receitas e despesas.
            </p>
          </div>

          <div className="flex items-center gap-3 self-start sm:self-auto">
            {/* Total Guardado Card/Pill */}
            <div className="px-3.5 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200/60 flex items-center gap-2">
              <span className="text-xs font-medium text-emerald-700">Total guardado:</span>
              <span className="text-sm font-bold text-emerald-700 tracking-tight">
                {formatBRL(totalSaved)}
              </span>
            </div>

            <button
              type="button"
              onClick={() => {
                setReserveModalOpen(true)
                setReserveError('')
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#111827] hover:bg-[#1F2937] text-white text-xs font-semibold shadow-sm transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Nova Reserva</span>
            </button>
          </div>
        </div>

        {/* Alerta de Erro de Carregamento de Reservas */}
        {reservesError && (
          <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-xs text-rose-700 flex items-center justify-between">
            <span>{reservesError}</span>
            <button
              type="button"
              onClick={fetchReserves}
              className="text-xs font-semibold underline hover:no-underline ml-2"
            >
              Tentar novamente
            </button>
          </div>
        )}

        {/* Cards das Reservas */}
        {loadingReserves && reserves.length === 0 ? (
          <div className="bg-white border border-[#EBEEF2] rounded-2xl p-8 text-center text-xs text-[#9CA3AF]">
            <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-emerald-600" />
            Carregando reservas...
          </div>
        ) : reserves.length === 0 ? (
          <div className="bg-white border border-[#EBEEF2] rounded-2xl p-10 text-center space-y-3">
            <PiggyBank className="w-10 h-10 text-[#9CA3AF] mx-auto stroke-1" />
            <h3 className="text-sm font-bold text-[#111827]">Nenhuma reserva criada ainda</h3>
            <p className="text-xs text-[#6B7280] max-w-sm mx-auto">
              Crie reservas para emergência, viagens, objetivos ou compras futuras sem distorcer o fluxo de caixa.
            </p>
            <button
              type="button"
              onClick={() => setReserveModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Criar primeira reserva</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {reserves.map((res) => {
              const hasTarget = Boolean(res.targetAmount && res.targetAmount > 0)
              const percentage = hasTarget
                ? Math.min(100, Math.round(((res.currentBalance || 0) / res.targetAmount!) * 100))
                : null

              return (
                <div
                  key={res.id}
                  onClick={() => handleOpenReserveDetails(res)}
                  className="group bg-white border border-[#EBEEF2] hover:border-emerald-500/50 hover:shadow-md rounded-2xl p-5 transition-all cursor-pointer flex flex-col justify-between gap-4 relative overflow-hidden"
                >
                  {/* Linha discreta de destaque no topo */}
                  <div className="h-1 w-full absolute top-0 left-0 bg-emerald-500" />

                  <div>
                    {/* Topo do Card */}
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-emerald-50 group-hover:bg-emerald-600 text-emerald-600 group-hover:text-white flex items-center justify-center shrink-0 transition-colors">
                          <Target className="w-4 h-4" />
                        </div>
                        <h3 className="font-bold text-sm text-[#111827] group-hover:text-emerald-700 transition-colors truncate">
                          {res.name}
                        </h3>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                          Reserva
                        </span>
                        {hasTarget && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                            {percentage}%
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Saldo Atual */}
                    <div className="mt-3">
                      <span className="text-[10px] font-medium uppercase tracking-wider text-[#9CA3AF] block">
                        Saldo Guardado
                      </span>
                      <div className="text-xl font-bold text-[#111827] tracking-tight mt-0.5">
                        {formatBRL(res.currentBalance || 0)}
                      </div>
                    </div>

                    {/* Meta Opcional & Barra de Progresso */}
                    {hasTarget ? (
                      <div className="mt-3 pt-3 border-t border-[#F4F5F7] space-y-1.5">
                        <div className="flex items-center justify-between text-xs text-[#6B7280]">
                          <span>Meta: {formatBRL(res.targetAmount!)}</span>
                          <span className="font-medium text-emerald-700">{percentage}% atingido</span>
                        </div>
                        <div className="w-full h-1.5 bg-[#F4F5F7] rounded-full overflow-hidden">
                          <div
                            className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="mt-3 pt-3 border-t border-[#F4F5F7]">
                        <span className="text-xs text-[#9CA3AF]">Sem meta estipulada</span>
                      </div>
                    )}
                  </div>

                  {/* Rodapé do Card */}
                  <div className="pt-2 flex items-center justify-between text-xs text-[#6B7280] group-hover:text-emerald-700 transition-colors border-t border-[#F9FAFB]">
                    <span className="text-[11px] font-medium">
                      {res.movements.length} {res.movements.length === 1 ? 'movimentação' : 'movimentações'}
                    </span>
                    <span className="inline-flex items-center gap-1 font-semibold text-[11px]">
                      Ver detalhes
                      <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ======================================================== */}
      {/* DRAWER DE DETALHES DA CONTA / CARTÃO                     */}
      {/* ======================================================== */}
      {drawerOpen && selectedAccount && (
        <div
          className="fixed inset-0 z-[100] flex justify-end bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setDrawerOpen(false)}
        >
          <div
            className="w-full max-w-lg bg-white h-full shadow-2xl flex flex-col justify-between overflow-hidden animate-in slide-in-from-right duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-[#EBEEF2] flex items-start justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <InstitutionLogo
                  institution={selectedAccount.institution}
                  accountName={selectedAccount.name}
                  accountType={selectedAccount.type}
                  customLogo={selectedAccount.custom_logo}
                  color={selectedAccount.color}
                  size="xl"
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-lg font-bold text-[#111827] truncate">
                      {selectedAccount.name}
                    </h2>
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                        getAccountTypeBadge(selectedAccount.type).className
                      }`}
                    >
                      {getAccountTypeBadge(selectedAccount.type).label}
                    </span>
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                        selectedAccount.active !== false
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-gray-100 text-gray-600 border border-gray-200'
                      }`}
                    >
                      {selectedAccount.active !== false ? 'Ativa' : 'Inativa'}
                    </span>
                  </div>
                  <p className="text-xs text-[#6B7280] mt-0.5">
                    {getAccountTypeLabel(selectedAccount.type)}
                    {selectedAccount.institution ? ` • ${selectedAccount.institution}` : ''}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
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

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsEditing(!isEditing)}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-semibold border transition-all ${
                    isEditing
                      ? 'bg-[#F4F5F7] text-[#111827] border-[#D1D5DB]'
                      : 'bg-white text-[#4B5563] border-[#E5E7EB] hover:border-[#2F68FE] hover:text-[#2F68FE]'
                  }`}
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>{isEditing ? 'Cancelar Edição' : 'Editar'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleToggleActive}
                  disabled={togglingActive}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-semibold border transition-all disabled:opacity-50 ${
                    selectedAccount.active !== false
                      ? 'bg-white text-[#EF4444] border-[#FCA5A5]/60 hover:bg-red-50'
                      : 'bg-white text-[#10B981] border-[#A7F3D0] hover:bg-emerald-50'
                  }`}
                >
                  {togglingActive ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Power className="w-3.5 h-3.5" />
                  )}
                  <span>{selectedAccount.active !== false ? 'Desativar' : 'Reativar'}</span>
                </button>
              </div>

              {isEditing && (
                <form onSubmit={handleSaveEdit} className="p-4 bg-[#F9FAFB] rounded-2xl border border-[#EBEEF2] space-y-3.5">
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
                          onChange={(e) => handleLogoUpload(e.target.files?.[0], setEditCustomLogo)}
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
                          currentMonthExpenses={selectedAccount.currentMonthExpenses}
                          futureInstallmentsTotal={selectedAccount.futureInstallmentsTotal}
                          futureInstallmentsCount={selectedAccount.futureInstallmentsCount}
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

              {selectedAccount.type === 'credit_card' && (() => {
                const today = new Date().toISOString().slice(0, 10)
                const cDay = selectedAccount.closing_day || 5
                const dDay = selectedAccount.due_day || 15
                const activeCycle = getCardInvoiceDates(today, cDay, dDay)

                const invoiceTxs = drawerTransactions.filter((tx) => {
                  const cycle = getCardInvoiceDates(tx.date || today, cDay, dDay)
                  return cycle.dueDate === activeCycle.dueDate
                })
                const futureTxs = drawerTransactions.filter((tx) => {
                  const cycle = getCardInvoiceDates(tx.date || today, cDay, dDay)
                  return cycle.dueDate > activeCycle.dueDate
                })
                const invoiceTotal = selectedAccount.currentMonthExpenses || 0
                const futureTotal = selectedAccount.futureInstallmentsTotal || 0

                return (
                  <div className="space-y-4">
                    <div className="p-4 bg-[#F9FAFB] rounded-2xl border border-[#EBEEF2] space-y-3">
                      <div className="flex items-center justify-between text-xs border-b border-[#EBEEF2] pb-2.5">
                        <span className="font-semibold text-[#4B5563] flex items-center gap-1.5">
                          <CalendarDays className="w-4 h-4 text-[#2F68FE]" />
                          Fatura Atual (em aberto)
                        </span>
                        <span className="text-[11px] text-[#6B7280]">
                          Fecha dia {cDay} • Vence dia {dDay}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <span className="text-[10px] uppercase font-bold text-[#6B7280] tracking-wider block">
                            Total da Fatura Atual
                          </span>
                          <span className="text-lg font-extrabold text-[#111827] block mt-0.5">
                            {formatBRL(invoiceTotal)}
                          </span>
                          <span className="text-[10px] text-[#9CA3AF] block mt-0.5">
                            Vencimento: {activeCycle.dueDate.slice(8, 10)}/{activeCycle.dueDate.slice(5, 7)}/{activeCycle.dueDate.slice(0, 4)}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] uppercase font-bold text-[#6B7280] tracking-wider block">
                            Parcelas Futuras
                          </span>
                          <span className="text-lg font-extrabold text-[#4B5563] block mt-0.5">
                            {formatBRL(futureTotal)}
                          </span>
                          <span className="text-[10px] text-[#9CA3AF] block mt-0.5">
                            {selectedAccount.futureInstallmentsCount !== undefined
                              ? `${selectedAccount.futureInstallmentsCount} lançamento(s) futuro(s)`
                              : `${futureTxs.length} lançamento(s) futuro(s)`}
                          </span>
                        </div>
                      </div>
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
                const isCreditCard = selectedAccount.type === 'credit_card'
                const today = new Date().toISOString().slice(0, 10)
                const cDay = selectedAccount.closing_day || 5
                const dDay = selectedAccount.due_day || 15
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
                          setDrawerOpen(false)
                          navigateToTransactionsFiltered({ accountId: selectedAccount.id })
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
                onClick={() => setDrawerOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-[#4B5563] hover:text-[#111827] hover:bg-white transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* DRAWER DE DETALHES DA RESERVA (DINHEIRO GUARDADO)        */}
      {/* ======================================================== */}
      {reserveDrawerOpen && selectedReserve && (
        <div
          className="fixed inset-0 z-[100] flex justify-end bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setReserveDrawerOpen(false)}
        >
          <div
            className="w-full max-w-lg bg-white h-full shadow-2xl flex flex-col justify-between overflow-hidden animate-in slide-in-from-right duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header do Drawer da Reserva */}
            <div className="p-6 border-b border-[#EBEEF2] flex items-start justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                  <PiggyBank className="w-6 h-6" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold text-[#111827] truncate">
                      {selectedReserve.name}
                    </h2>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                      Reserva
                    </span>
                  </div>
                  <p className="text-xs text-[#6B7280] mt-0.5">
                    Dinheiro guardado • Transferências internas
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setReserveDrawerOpen(false)}
                className="p-1.5 rounded-xl text-[#9CA3AF] hover:text-[#111827] hover:bg-[#F4F5F7] transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Conteúdo do Drawer da Reserva */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Banner de Saldo e Meta */}
              <div className="p-5 rounded-2xl bg-gradient-to-br from-emerald-50/70 to-emerald-100/30 border border-emerald-200/70 space-y-4">
                <div>
                  <span className="text-[11px] uppercase font-bold text-emerald-800 tracking-wider block">
                    Saldo Atual
                  </span>
                  <div className="text-2xl font-black text-emerald-900 tracking-tight mt-0.5">
                    {formatBRL(selectedReserve.currentBalance)}
                  </div>
                </div>

                {selectedReserve.targetAmount && selectedReserve.targetAmount > 0 ? (
                  <div className="space-y-1.5 pt-3 border-t border-emerald-200/50">
                    <div className="flex items-center justify-between text-xs text-emerald-800">
                      <span>Meta: {formatBRL(selectedReserve.targetAmount)}</span>
                      <span className="font-bold">
                        {Math.min(100, Math.round((selectedReserve.currentBalance / selectedReserve.targetAmount) * 100))}% atingido
                      </span>
                    </div>
                    <div className="w-full h-2 bg-emerald-200/60 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-600 rounded-full transition-all duration-300"
                        style={{
                          width: `${Math.min(100, Math.round((selectedReserve.currentBalance / selectedReserve.targetAmount) * 100))}%`,
                        }}
                      />
                    </div>
                    {selectedReserve.targetAmount > selectedReserve.currentBalance && (
                      <p className="text-[11px] text-emerald-700">
                        Faltam {formatBRL(selectedReserve.targetAmount - selectedReserve.currentBalance)} para atingir a meta.
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="text-xs text-emerald-700 pt-2 border-t border-emerald-200/50">
                    Sem meta estipulada para esta reserva.
                  </div>
                )}
              </div>

              {/* Aviso da Regra Fundamental */}
              <div className="flex items-start gap-2.5 p-3 rounded-xl bg-[#F9FAFB] border border-[#EBEEF2] text-xs text-[#6B7280]">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Movimentação interna:</strong> aportes não contam como despesas e retiradas não contam como receitas na sua Visão Geral.
                </span>
              </div>

              {/* Botões de Ação: Aporte, Retirada, Editar, Excluir */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <button
                  type="button"
                  onClick={() => handleOpenMovementModal('deposit')}
                  className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm transition-all"
                >
                  <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>Aporte</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleOpenMovementModal('withdrawal')}
                  disabled={selectedReserve.currentBalance <= 0}
                  className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold shadow-sm transition-all disabled:opacity-40"
                >
                  <Minus className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>Retirada</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsEditingReserve(!isEditingReserve)}
                  className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-white border border-[#E5E7EB] hover:border-[#2F68FE] text-[#4B5563] hover:text-[#2F68FE] text-xs font-semibold transition-all"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>{isEditingReserve ? 'Cancelar' : 'Editar'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleDeleteReserve}
                  disabled={deletingReserve}
                  className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-white border border-[#FCA5A5]/60 hover:bg-red-50 text-red-600 text-xs font-semibold transition-all disabled:opacity-40"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Excluir</span>
                </button>
              </div>

              {/* Formulário de Edição da Reserva */}
              {isEditingReserve && (
                <form onSubmit={handleSaveReserveEdit} className="p-4 bg-[#F9FAFB] rounded-2xl border border-[#EBEEF2] space-y-3">
                  <h4 className="text-xs font-bold text-[#111827] uppercase tracking-wider">
                    Editar Reserva
                  </h4>

                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-[#4B5563]">Nome da Reserva</label>
                    <input
                      type="text"
                      required
                      value={editReserveName}
                      onChange={(e) => setEditReserveName(e.target.value)}
                      className="w-full bg-white border border-[#E5E7EB] rounded-xl px-3 py-1.5 text-xs text-[#111827] focus:outline-none focus:border-emerald-600"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-[#4B5563]">Meta (R$, opcional)</label>
                    <input
                      type="text"
                      value={editReserveTarget}
                      onChange={(e) => setEditReserveTarget(e.target.value)}
                      placeholder="Ex: 10000"
                      className="w-full bg-white border border-[#E5E7EB] rounded-xl px-3 py-1.5 text-xs text-[#111827] focus:outline-none focus:border-emerald-600"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setIsEditingReserve(false)}
                      className="px-3 py-1.5 text-xs font-semibold text-[#6B7280] hover:text-[#111827]"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={savingReserveEdit}
                      className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-all disabled:opacity-50"
                    >
                      {savingReserveEdit && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      Salvar Alterações
                    </button>
                  </div>
                </form>
              )}

              {/* Histórico de Movimentações */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#9CA3AF]">
                    Histórico de Movimentações ({selectedReserve.movements?.length || 0})
                  </h3>
                </div>

                {!selectedReserve.movements || selectedReserve.movements.length === 0 ? (
                  <div className="p-8 text-center text-xs text-[#9CA3AF] bg-[#F9FAFB] rounded-2xl border border-[#EBEEF2]">
                    Nenhuma movimentação registrada nesta reserva ainda.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {selectedReserve.movements.map((mov) => {
                      const isDeposit = mov.type === 'deposit'
                      return (
                        <div
                          key={mov.id}
                          className="p-3 bg-[#F9FAFB] hover:bg-white border border-[#EBEEF2] rounded-xl flex items-center justify-between gap-3 transition-colors"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div
                              className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                                isDeposit ? 'bg-emerald-100/70 text-emerald-700' : 'bg-slate-200 text-slate-700'
                              }`}
                            >
                              {isDeposit ? <ArrowDownLeft className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-bold text-[#111827]">
                                  {isDeposit ? 'Aporte' : 'Retirada'}
                                </span>
                                {mov.fromAccount && (
                                  <span className="text-[10px] text-[#6B7280] bg-white border border-[#E5E7EB] px-1.5 py-0.2 rounded">
                                    {mov.fromAccount}
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-[#9CA3AF] mt-0.5 truncate">
                                {mov.date} {mov.notes ? `• ${mov.notes}` : ''}
                              </div>
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <span
                              className={`text-xs font-bold block ${
                                isDeposit ? 'text-emerald-700' : 'text-slate-800'
                              }`}
                            >
                              {isDeposit ? `+${formatBRL(mov.amount)}` : `-${formatBRL(mov.amount)}`}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="p-4 border-t border-[#EBEEF2] bg-[#F9FAFB] flex items-center justify-end">
              <button
                type="button"
                onClick={() => setReserveDrawerOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-[#4B5563] hover:text-[#111827] hover:bg-white transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL DE APORTE OU RETIRADA NA RESERVA                   */}
      {/* ======================================================== */}
      {movementModalOpen && selectedReserve && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={() => setMovementModalOpen(false)}
        >
          <div
            className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-[#EBEEF2] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 border-b border-[#EBEEF2] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                    movementType === 'deposit'
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-slate-100 text-slate-800'
                  }`}
                >
                  {movementType === 'deposit' ? <Plus className="w-4 h-4" /> : <Minus className="w-4 h-4" />}
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#111827]">
                    {movementType === 'deposit' ? 'Adicionar Aporte' : 'Realizar Retirada'}
                  </h3>
                  <p className="text-[11px] text-[#6B7280]">
                    Reserva: <strong>{selectedReserve.name}</strong> • Saldo atual: {formatBRL(selectedReserve.currentBalance)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMovementModalOpen(false)}
                className="p-1 rounded-xl text-[#9CA3AF] hover:text-[#111827] hover:bg-[#F4F5F7] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveMovement} className="p-5 space-y-4">
              {movementError && (
                <div className="text-xs text-red-600 bg-red-50 p-2.5 rounded-xl border border-red-100">
                  {movementError}
                </div>
              )}

              {/* Seletor Rápido de Tipo */}
              <div className="grid grid-cols-2 gap-2 bg-[#F4F5F7] p-1 rounded-xl border border-[#E5E7EB]">
                <button
                  type="button"
                  onClick={() => setMovementType('deposit')}
                  className={`py-1.5 text-xs font-semibold rounded-lg transition-all ${
                    movementType === 'deposit'
                      ? 'bg-white text-emerald-700 shadow-sm'
                      : 'text-[#6B7280] hover:text-[#111827]'
                  }`}
                >
                  + Aporte (Guardar)
                </button>
                <button
                  type="button"
                  onClick={() => setMovementType('withdrawal')}
                  className={`py-1.5 text-xs font-semibold rounded-lg transition-all ${
                    movementType === 'withdrawal'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-[#6B7280] hover:text-[#111827]'
                  }`}
                >
                  - Retirada (Resgatar)
                </button>
              </div>

              {/* Valor */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#111827]">Valor (R$) *</label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={movementAmount}
                  onChange={(e) => setMovementAmount(e.target.value)}
                  placeholder="0,00"
                  className="w-full bg-[#F9FAFB] border border-[#E5E7EB] hover:border-[#D1D5DB] focus:bg-white rounded-xl px-3 py-2 text-sm font-bold text-[#111827] focus:outline-none focus:border-emerald-600 transition-all"
                />
              </div>

              {/* Data */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#111827]">Data da Movimentação</label>
                <input
                  type="date"
                  required
                  value={movementDate}
                  onChange={(e) => setMovementDate(e.target.value)}
                  className="w-full bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl px-3 py-2 text-xs text-[#111827] focus:outline-none focus:border-emerald-600 transition-all"
                />
              </div>

              {/* Conta de Origem/Destino (opcional) */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#111827]">
                  {movementType === 'deposit' ? 'Origem do dinheiro (opcional)' : 'Destino do dinheiro (opcional)'}
                </label>
                <select
                  value={movementAccount}
                  onChange={(e) => setMovementAccount(e.target.value)}
                  className="w-full bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl px-3 py-2 text-xs text-[#111827] focus:outline-none focus:border-emerald-600 transition-all cursor-pointer"
                >
                  <option value="">Não informado (Geral)</option>
                  {accounts
                    .filter((a) => a.active !== false && a.type !== 'credit_card')
                    .map((a) => (
                      <option key={a.id} value={a.name}>
                        {a.name} ({getAccountTypeLabel(a.type)})
                      </option>
                    ))}
                </select>
              </div>

              {/* Nota / Descrição */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#111827]">Descrição ou Motivo (opcional)</label>
                <input
                  type="text"
                  value={movementNotes}
                  onChange={(e) => setMovementNotes(e.target.value)}
                  placeholder={movementType === 'deposit' ? 'Ex: Economia do mês, Sobra...' : 'Ex: Manutenção do carro, Emergência...'}
                  className="w-full bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl px-3 py-2 text-xs text-[#111827] focus:outline-none focus:border-emerald-600 transition-all"
                />
              </div>

              {/* Botões de Ação */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#EBEEF2]">
                <button
                  type="button"
                  onClick={() => setMovementModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-[#6B7280] hover:bg-[#F4F5F7] transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingMovement || !movementAmount.trim()}
                  className={`flex items-center gap-1.5 px-5 py-2 rounded-xl text-white text-xs font-semibold shadow-sm transition-colors disabled:opacity-50 ${
                    movementType === 'deposit'
                      ? 'bg-emerald-600 hover:bg-emerald-700'
                      : 'bg-slate-900 hover:bg-black'
                  }`}
                >
                  {savingMovement ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Processando...</span>
                    </>
                  ) : (
                    <span>Confirmar {movementType === 'deposit' ? 'Aporte' : 'Retirada'}</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL DE CRIAÇÃO DE NOVA RESERVA                         */}
      {/* ======================================================== */}
      {reserveModalOpen && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={() => setReserveModalOpen(false)}
        >
          <div
            className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-[#EBEEF2] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 border-b border-[#EBEEF2] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <PiggyBank className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#111827]">Nova Reserva</h3>
                  <p className="text-[11px] text-[#6B7280]">
                    Guarde dinheiro para objetivos específicos
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setReserveModalOpen(false)}
                className="p-1 rounded-xl text-[#9CA3AF] hover:text-[#111827] hover:bg-[#F4F5F7] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateReserve} className="p-5 space-y-4">
              {reserveError && (
                <div className="text-xs text-red-600 bg-red-50 p-2.5 rounded-xl border border-red-100">
                  {reserveError}
                </div>
              )}

              {/* Nome */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#111827]">
                  Nome da Reserva *
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={reserveFormName}
                  onChange={(e) => setReserveFormName(e.target.value)}
                  placeholder="Ex: Reserva de emergência, Viagem, Entrada do carro..."
                  className="w-full bg-[#F9FAFB] border border-[#E5E7EB] hover:border-[#D1D5DB] focus:bg-white rounded-xl px-3 py-2 text-xs text-[#111827] focus:outline-none focus:border-emerald-600 transition-all"
                />
              </div>

              {/* Saldo Inicial */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#111827]">
                  Saldo Inicial (R$, opcional)
                </label>
                <input
                  type="text"
                  value={reserveFormInitialBalance}
                  onChange={(e) => setReserveFormInitialBalance(e.target.value)}
                  placeholder="0,00"
                  className="w-full bg-[#F9FAFB] border border-[#E5E7EB] hover:border-[#D1D5DB] focus:bg-white rounded-xl px-3 py-2 text-xs text-[#111827] focus:outline-none focus:border-emerald-600 transition-all"
                />
              </div>

              {/* Meta Opcional */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#111827]">
                  Meta Financeira (R$, opcional)
                </label>
                <input
                  type="text"
                  value={reserveFormTargetAmount}
                  onChange={(e) => setReserveFormTargetAmount(e.target.value)}
                  placeholder="Ex: 5000, 10000..."
                  className="w-full bg-[#F9FAFB] border border-[#E5E7EB] hover:border-[#D1D5DB] focus:bg-white rounded-xl px-3 py-2 text-xs text-[#111827] focus:outline-none focus:border-emerald-600 transition-all"
                />
              </div>

              {/* Conta de Origem (se houver saldo inicial) */}
              {Boolean(reserveFormInitialBalance && parseFloat(reserveFormInitialBalance.replace(',', '.')) > 0) && (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[#111827]">
                    Conta de Origem do Saldo Inicial
                  </label>
                  <select
                    value={reserveFormFromAccount}
                    onChange={(e) => setReserveFormFromAccount(e.target.value)}
                    className="w-full bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl px-3 py-2 text-xs text-[#111827] focus:outline-none focus:border-emerald-600 transition-all cursor-pointer"
                  >
                    <option value="">Não informado</option>
                    {accounts
                      .filter((a) => a.active !== false && a.type !== 'credit_card')
                      .map((a) => (
                        <option key={a.id} value={a.name}>
                          {a.name} ({getAccountTypeLabel(a.type)})
                        </option>
                      ))}
                  </select>
                </div>
              )}

              {/* Botões de Ação */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#EBEEF2]">
                <button
                  type="button"
                  onClick={() => setReserveModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-[#6B7280] hover:bg-[#F4F5F7] transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingReserve || !reserveFormName.trim()}
                  className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm transition-colors disabled:opacity-50"
                >
                  {savingReserve ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Criando...</span>
                    </>
                  ) : (
                    <span>Criar Reserva</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL DE CADASTRO DE NOVA CONTA / CARTÃO                 */}
      {/* ======================================================== */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={() => setModalOpen(false)}
        >
          <div
            className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-[#EBEEF2] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 border-b border-[#EBEEF2] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-[#EBF2FF] text-[#2F68FE] flex items-center justify-center">
                  <CreditCard className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#111827]">Nova Conta / Cartão</h3>
                  <p className="text-[11px] text-[#6B7280]">
                    Cadastre uma nova conta ou cartão para seus lançamentos
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1 rounded-xl text-[#9CA3AF] hover:text-[#111827] hover:bg-[#F4F5F7] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateAccount} className="p-5 space-y-4">
              {accountError && (
                <div className="text-xs text-red-600 bg-red-50 p-2.5 rounded-xl border border-red-100">
                  {accountError}
                </div>
              )}

              {/* Seletor de Tipo (Sem PIX!) */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#111827]">Tipo de Conta</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    {
                      type: 'bank_account' as const,
                      label: 'Conta Bancária',
                      icon: Landmark,
                      desc: 'Corrente / Poupança',
                    },
                    {
                      type: 'credit_card' as const,
                      label: 'Cartão de Crédito',
                      icon: CreditCard,
                      desc: 'Fatura e parcelamento',
                    },
                    {
                      type: 'cash' as const,
                      label: 'Dinheiro',
                      icon: Banknote,
                      desc: 'Dinheiro em espécie',
                    },
                    {
                      type: 'debit_card' as const,
                      label: 'Cartão de Débito',
                      icon: CreditCard,
                      desc: 'Débito em conta',
                    },
                  ].map((t) => {
                    const TIcon = t.icon
                    const isSel = formType === t.type
                    return (
                      <button
                        key={t.type}
                        type="button"
                        onClick={() => setFormType(t.type)}
                        className={`flex flex-col p-2.5 rounded-xl border text-left transition-all ${
                          isSel
                            ? 'bg-[#2F68FE]/10 border-[#2F68FE] text-[#2F68FE] shadow-sm'
                            : 'bg-[#F9FAFB] border-[#E5E7EB] text-[#6B7280] hover:text-[#111827]'
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          <TIcon className="w-3.5 h-3.5" />
                          <span className="text-xs font-bold">{t.label}</span>
                        </div>
                        <span className="text-[10px] text-[#9CA3AF] mt-0.5">{t.desc}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Nome da Conta / Apelido */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#111827]">
                  Nome / Apelido *
                </label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Ex: Nubank, Cartão XP, Carteira Física, Itaú..."
                  className="w-full bg-[#F9FAFB] border border-[#E5E7EB] hover:border-[#D1D5DB] focus:bg-white rounded-xl px-3 py-2 text-xs text-[#111827] focus:outline-none focus:border-[#2F68FE] transition-all"
                />
              </div>

              {/* Instituição e Identidade Visual */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-[#111827]">
                    Instituição Financeira / Banco (opcional)
                  </label>
                  {formCustomLogo && (
                    <button
                      type="button"
                      onClick={() => setFormCustomLogo('')}
                      className="text-[10px] text-red-600 hover:underline font-medium"
                    >
                      Remover logo manual
                    </button>
                  )}
                </div>

                {/* Preview da Identidade Visual */}
                <div className="flex items-center gap-3 p-2.5 bg-[#F9FAFB] rounded-xl border border-[#E5E7EB]">
                  <InstitutionLogo
                    institution={formInstitution}
                    accountName={formName}
                    accountType={formType}
                    customLogo={formCustomLogo}
                    color={formColor}
                    size="md"
                  />
                  <div className="min-w-0 flex-1">
                    <span className="text-xs font-semibold text-[#111827] block truncate">
                      {formCustomLogo
                        ? 'Logo personalizado (upload manual)'
                        : getInstitutionInfo(formInstitution || formName)?.name
                        ? `Identificado: ${getInstitutionInfo(formInstitution || formName)?.name}`
                        : 'Logo padrão / Monograma'}
                    </span>
                    <span className="text-[10px] text-[#6B7280] block">
                      {formCustomLogo
                        ? 'Usando imagem enviada por você'
                        : getInstitutionInfo(formInstitution || formName)
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
                      onChange={(e) => handleLogoUpload(e.target.files?.[0], setFormCustomLogo)}
                    />
                  </label>
                </div>

                <input
                  type="text"
                  value={formInstitution}
                  onChange={(e) => {
                    const val = e.target.value
                    setFormInstitution(val)
                    if (!formName.trim() && val.trim()) {
                      setFormName(val.trim())
                    }
                  }}
                  placeholder="Ex: Nubank, Itaú, Inter, Bradesco, Santander..."
                  className="w-full bg-[#F9FAFB] border border-[#E5E7EB] hover:border-[#D1D5DB] focus:bg-white rounded-xl px-3 py-2 text-xs text-[#111827] focus:outline-none focus:border-[#2F68FE] transition-all"
                />

                {/* Chips de instituições comuns */}
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {KNOWN_INSTITUTIONS.slice(0, 10).map((inst) => (
                    <button
                      key={inst.key}
                      type="button"
                      onClick={() => {
                        setFormInstitution(inst.shortName)
                        if (!formName.trim()) {
                          setFormName(inst.name)
                        }
                      }}
                      className={`px-2.5 py-1 rounded-lg text-xs transition-colors border ${
                        getInstitutionInfo(formInstitution)?.key === inst.key
                          ? 'bg-[#2F68FE] text-white border-[#2F68FE] font-semibold'
                          : 'bg-white text-[#4B5563] border-[#E5E7EB] hover:bg-[#F4F5F7]'
                      }`}
                    >
                      {inst.shortName}
                    </button>
                  ))}
                </div>
              </div>

              {/* Cor Personalizada de Destaque */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-[#111827]">
                    Cor de Destaque (opcional)
                  </label>
                  {formColor && (
                    <button
                      type="button"
                      onClick={() => setFormColor('')}
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
                      onClick={() => setFormColor(item.hex)}
                      className={`w-6 h-6 rounded-full border transition-all ${
                        formColor.toLowerCase() === item.hex.toLowerCase()
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
                      value={formColor || '#2F68FE'}
                      onChange={(e) => setFormColor(e.target.value)}
                      className="w-6 h-6 p-0 border-0 rounded cursor-pointer bg-transparent"
                      title="Escolher cor personalizada"
                    />
                    <span className="text-[10px] font-mono text-[#6B7280]">
                      {formColor || 'Automático'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Fechamento e Vencimento da Fatura (Apenas para Cartão de Crédito) */}
              {formType === 'credit_card' && (
                <div className="grid grid-cols-2 gap-3 p-3 bg-[#F9FAFB] rounded-xl border border-[#E5E7EB]">
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-[#4B5563]">
                      Dia de Fechamento *
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="31"
                      required
                      value={formClosingDay}
                      onChange={(e) => setFormClosingDay(e.target.value)}
                      placeholder="Ex: 5"
                      className="w-full bg-white border border-[#E5E7EB] rounded-lg px-2.5 py-1.5 text-xs text-[#111827] focus:outline-none focus:border-[#2F68FE]"
                    />
                    <span className="text-[10px] text-[#9CA3AF] block">Melhor dia de compra</span>
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
                      value={formDueDay}
                      onChange={(e) => setFormDueDay(e.target.value)}
                      placeholder="Ex: 15"
                      className="w-full bg-white border border-[#E5E7EB] rounded-lg px-2.5 py-1.5 text-xs text-[#111827] focus:outline-none focus:border-[#2F68FE]"
                    />
                    <span className="text-[10px] text-[#9CA3AF] block">Dia do pagamento</span>
                  </div>
                </div>
              )}

              {/* Opções de Skin e Prévia (Apenas para Cartão de Crédito) */}
              {formType === 'credit_card' && (
                <div className="space-y-3 pt-1">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-[#111827]">
                      Estilo do Cartão (Skin)
                    </label>
                    <div className="grid grid-cols-5 gap-1.5">
                      {CREDIT_CARD_SKINS.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => setFormSkin(s.id)}
                          className={`py-1.5 px-1 rounded-xl text-center text-xs font-semibold border transition-all ${
                            formSkin === s.id
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
                      name={formName || 'Nome do Cartão'}
                      institution={formInstitution}
                      color={formColor}
                      skin={formSkin}
                      customLogo={formCustomLogo}
                      currentMonthExpenses={0}
                      futureInstallmentsTotal={0}
                      futureInstallmentsCount={0}
                      closingDay={parseInt(formClosingDay, 10) || 5}
                      dueDay={parseInt(formDueDay, 10) || 15}
                      isPreview={true}
                    />
                  </div>
                </div>
              )}

              {/* Botões de Ação */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#EBEEF2]">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-[#6B7280] hover:bg-[#F4F5F7] transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingAccount || !formName.trim()}
                  className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-[#2F68FE] hover:bg-[#2557D6] text-white text-xs font-semibold shadow-sm transition-colors disabled:opacity-50"
                >
                  {savingAccount ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Salvando...</span>
                    </>
                  ) : (
                    <span>Cadastrar Conta</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  )
}
