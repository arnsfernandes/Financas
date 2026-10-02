'use client'

import React, { useState, useEffect, useCallback } from 'react'
import {
  Plus,
  Loader2,
  Wallet,
  ChevronRight,
} from 'lucide-react'
import type { AccountType } from '@/lib/schema'
import type { AccountWithStats } from '@/lib/queries'
import type { Reserve } from '@/lib/reserves'
import { InstitutionLogo } from './InstitutionLogo'
import { CreditCardItem, type CreditCardSkin } from './CreditCardItem'
import { getInstitutionInfo } from '@/lib/institutions'
import { useTelegramWebApp } from '@/lib/useTelegramWebApp'
import { getAccountTypeBadge } from './accountConstants'
import { CreateAccountModal } from './CreateAccountModal'
import { AccountDetailDrawer } from './AccountDetailDrawer'
import { ReservesSection } from './ReservesSection'
import { ReserveDetailDrawer } from './ReserveDetailDrawer'
import { ReserveMovementModal } from './ReserveMovementModal'
import { CreateReserveModal } from './CreateReserveModal'
import { PayInvoiceModal } from './PayInvoiceModal'
import type { InvoicePayment } from '@/lib/schema'
import { getCardInvoiceDates } from '@/lib/billingCycles'
import { formatBRL } from '@/lib/formatters'

export interface AccountsTabProps {
  accounts: AccountWithStats[]
  loadingAccounts: boolean
  fetchAccounts: () => void
  navigateToTransactionsFiltered: (filters: {
    accountId?: string
    startDate?: string
    endDate?: string
  }) => void
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
  const [deletingAccount, setDeletingAccount] = useState(false)
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

  // Modal e Estado de Pagamento de Fatura
  const [payInvoiceModalOpen, setPayInvoiceModalOpen] = useState(false)
  const [invoiceStatus, setInvoiceStatus] = useState<'open' | 'partial' | 'paid'>('open')
  const [invoicePaidAmount, setInvoicePaidAmount] = useState<number>(0)
  const [invoicePayments, setInvoicePayments] = useState<InvoicePayment[]>([])
  const [invoiceDueDate, setInvoiceDueDate] = useState<string>('')
  const [invoiceRemainingAmount, setInvoiceRemainingAmount] = useState<number>(0)
  const [invoiceTotalAmount, setInvoiceTotalAmount] = useState<number>(0)

  const { fetchWithAuth } = useTelegramWebApp()
  const [reservesError, setReservesError] = useState('')

  const fetchReserves = useCallback(async () => {
    setLoadingReserves(true)
    setReservesError('')
    try {
      const res = await fetchWithAuth(`/api/reserves?_t=${Date.now()}`)
      const data = await res.json()
      if (data.ok && Array.isArray(data.reserves)) {
        setReserves(data.reserves)
        setTotalSaved(data.totalSaved || 0)
        setSelectedReserve((prev) => {
          if (!prev) return null
          return data.reserves.find((r: Reserve) => r.id === prev.id) || null
        })
      } else {
        setReservesError(data.error || 'Erro ao carregar reservas.')
      }
    } catch (e) {
      console.error('Erro ao carregar reservas:', e)
      setReservesError('Erro de conexão ao carregar reservas.')
    } finally {
      setLoadingReserves(false)
    }
  }, [fetchWithAuth])

  useEffect(() => {
    fetchReserves()
  }, [fetchReserves])

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
        institution: formInstitution.trim() || undefined,
        customLogo: formCustomLogo.trim() || undefined,
        color: formColor.trim() || undefined,
      }

      if (formType === 'credit_card') {
        payload.closingDay = parseInt(formClosingDay, 10) || 5
        payload.dueDay = parseInt(formDueDay, 10) || 15
        payload.skin = formSkin || 'gradient'
      }

      const res = await fetchWithAuth('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json()
      if (data.ok) {
        setModalOpen(false)
        setFormName('')
        setFormType('bank_account')
        setFormInstitution('')
        setFormClosingDay('5')
        setFormDueDay('15')
        setFormCustomLogo('')
        setFormColor('')
        setFormSkin('gradient')
        fetchAccounts()
      } else {
        setAccountError(data.error || 'Erro ao cadastrar conta.')
      }
    } catch {
      setAccountError('Erro de conexão ao salvar conta.')
    } finally {
      setSavingAccount(false)
    }
  }

  async function handleOpenDetails(account: AccountWithStats) {
    setSelectedAccount(account)
    setIsEditing(false)
    setEditName(account.name)
    setEditType(account.type)
    setEditInstitution(account.institution || '')
    setEditClosingDay(account.closing_day ? String(account.closing_day) : '5')
    setEditDueDay(account.due_day ? String(account.due_day) : '15')
    setEditCustomLogo(account.custom_logo || '')
    setEditColor(account.color || '')
    setEditSkin((account as any).skin || 'gradient')
    setCardInvoiceFilter('invoice')
    setDrawerError('')
    setDrawerOpen(true)

    setLoadingDrawerTx(true)
    setInvoiceStatus('open')
    setInvoicePaidAmount(0)
    setInvoicePayments([])

    const todayStr = new Date().toISOString().slice(0, 10)
    const cDay = account.closing_day || 5
    const dDay = account.due_day || 15
    const activeCycle = getCardInvoiceDates(todayStr, cDay, dDay)
    setInvoiceDueDate(activeCycle.dueDate)
    setInvoiceTotalAmount(account.currentMonthExpenses || 0)
    setInvoiceRemainingAmount(account.currentMonthExpenses || 0)

    try {
      const [accRes, invRes] = await Promise.all([
        fetchWithAuth(`/api/accounts/${account.id}?_t=${Date.now()}`),
        account.type === 'credit_card'
          ? fetchWithAuth(`/api/invoices?accountId=${account.id}&dueDate=${activeCycle.dueDate}&closingDate=${activeCycle.closingDate}&_t=${Date.now()}`)
          : Promise.resolve(null),
      ])

      const data = await accRes.json()
      if (data.ok && Array.isArray(data.transactions)) {
        setDrawerTransactions(data.transactions)
      } else {
        setDrawerTransactions([])
      }

      if (invRes) {
        const invData = await invRes.json()
        if (invData.ok && invData.invoice) {
          setInvoiceStatus(invData.invoice.status || 'open')
          setInvoicePaidAmount(invData.invoice.paid_amount || 0)
          setInvoicePayments(invData.invoice.payments || [])
          setInvoiceRemainingAmount(invData.invoice.remainingAmount ?? (account.currentMonthExpenses || 0))
          setInvoiceTotalAmount(invData.invoice.total_amount ?? (account.currentMonthExpenses || 0))
        }
      }
    } catch {
      setDrawerTransactions([])
    } finally {
      setLoadingDrawerTx(false)
    }
  }

  async function handlePayInvoice(payData: {
    amount: number
    paymentDate: string
    fromAccountId?: string
    paymentMethod?: string
    notes?: string
  }): Promise<{ ok: boolean; error?: string }> {
    if (!selectedAccount || selectedAccount.type !== 'credit_card') {
      return { ok: false, error: 'Cartão não selecionado.' }
    }

    try {
      const res = await fetchWithAuth('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: selectedAccount.id,
          dueDate: invoiceDueDate,
          amount: payData.amount,
          paymentDate: payData.paymentDate,
          fromAccountId: payData.fromAccountId,
          paymentMethod: payData.paymentMethod,
          notes: payData.notes,
        }),
      })

      const data = await res.json()
      if (data.ok && data.invoice) {
        setInvoiceStatus(data.invoice.status || 'open')
        setInvoicePaidAmount(data.invoice.paid_amount || 0)
        setInvoicePayments(data.invoice.payments || [])
        setInvoiceRemainingAmount(data.invoice.remainingAmount || 0)
        setInvoiceTotalAmount(data.invoice.total_amount || 0)
        fetchAccounts()
        return { ok: true }
      } else {
        return { ok: false, error: data.error || 'Erro ao registrar pagamento.' }
      }
    } catch {
      return { ok: false, error: 'Erro de conexão ao processar pagamento.' }
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
        institution: editInstitution.trim() || undefined,
        customLogo: editCustomLogo.trim() || undefined,
        color: editColor.trim() || undefined,
      }

      if (editType === 'credit_card') {
        payload.closingDay = parseInt(editClosingDay, 10) || 5
        payload.dueDay = parseInt(editDueDay, 10) || 15
        payload.skin = editSkin || 'gradient'
      }

      const res = await fetchWithAuth(`/api/accounts/${selectedAccount.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json()
      if (data.ok && data.account) {
        setSelectedAccount(data.account)
        setIsEditing(false)
        fetchAccounts()
      } else {
        setDrawerError(data.error || 'Erro ao atualizar conta.')
      }
    } catch {
      setDrawerError('Erro de conexão ao atualizar conta.')
    } finally {
      setSavingEdit(false)
    }
  }

  async function handleToggleActive() {
    if (!selectedAccount) return
    const newStatus = selectedAccount.active === false ? true : false

    setTogglingActive(true)
    setDrawerError('')
    try {
      const res = await fetchWithAuth(`/api/accounts/${selectedAccount.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: newStatus }),
      })

      const data = await res.json()
      if (data.ok && data.account) {
        setSelectedAccount(data.account)
        fetchAccounts()
      } else {
        setDrawerError(data.error || 'Erro ao alterar status da conta.')
      }
    } catch {
      setDrawerError('Erro de conexão ao alterar status da conta.')
    } finally {
      setTogglingActive(false)
    }
  }

  async function handleDeleteAccount() {
    if (!selectedAccount) return

    const confirmMsg =
      selectedAccount.type === 'credit_card'
        ? `Tem certeza que deseja excluir o cartão "${selectedAccount.name}"? As transações vinculadas perderão o vínculo com este cartão.`
        : `Tem certeza que deseja excluir a conta "${selectedAccount.name}"? As transações vinculadas perderão o vínculo com esta conta.`

    if (!window.confirm(confirmMsg)) return

    setDeletingAccount(true)
    setDrawerError('')
    try {
      const res = await fetchWithAuth(`/api/accounts/${selectedAccount.id}`, {
        method: 'DELETE',
      })

      const data = await res.json()
      if (data.ok) {
        setDrawerOpen(false)
        setSelectedAccount(null)
        fetchAccounts()
      } else {
        setDrawerError(data.error || 'Erro ao excluir conta.')
      }
    } catch {
      setDrawerError('Erro de conexão ao excluir conta.')
    } finally {
      setDeletingAccount(false)
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
          targetAmount: reserveFormTargetAmount ? parseFloat(reserveFormTargetAmount.replace(',', '.')) : undefined,
          notes: reserveFormNotes.trim() || undefined,
          fromAccount: reserveFormFromAccount || undefined,
        }),
      })

      const data = await res.json()
      if (data.ok) {
        setReserveModalOpen(false)
        setReserveFormName('')
        setReserveFormInitialBalance('')
        setReserveFormTargetAmount('')
        setReserveFormNotes('')
        setReserveFormFromAccount('')
        await fetchReserves()
      } else {
        setReserveError(data.error || 'Erro ao criar reserva.')
      }
    } catch {
      setReserveError('Erro de conexão ao criar reserva.')
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
      setMovementError(`Saldo insuficiente.`)
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

  const creditCards = accounts.filter((a) => a.type === 'credit_card')
  const bankAndCashAccounts = accounts.filter((a) => a.type !== 'credit_card')

  return (
    <section className="space-y-6 pb-12 max-w-2xl mx-auto">
      {/* ======================================================== */}
      {/* 1. TOPO DA TELA (MOBILE NATIVE HEADER)                   */}
      {/* ======================================================== */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-normal tracking-tight text-[#0F172A]">
            Contas
          </h1>
          <p className="text-xs text-[#667085] mt-0.5 font-normal">
            Gerencie seus cartões, contas e reservas
          </p>
        </div>

        {/* Botão + circular discreto */}
        <button
          type="button"
          onClick={() => {
            setModalOpen(true)
            setAccountError('')
          }}
          className="w-9 h-9 rounded-full bg-white hover:bg-[#F2F4F7] active:scale-95 border border-[#EBEEF2] flex items-center justify-center text-[#0F172A] transition-all cursor-pointer shrink-0 shadow-2xs"
          title="Nova Conta / Cartão"
        >
          <Plus className="w-4 h-4 stroke-[2]" />
        </button>
      </div>

      {/* ======================================================== */}
      {/* 2. SEÇÃO CARTÕES DE CRÉDITO                              */}
      {/* ======================================================== */}
      <div className="space-y-3">
        <div className="px-0.5">
          <h2 className="text-base font-medium text-[#0F172A] tracking-tight">
            Cartões de crédito
          </h2>
        </div>

        {loadingAccounts && creditCards.length === 0 ? (
          <div className="bg-white border border-[#EBEEF2] rounded-2xl p-6 text-center text-xs text-[#98A2B3]">
            <Loader2 className="w-4 h-4 animate-spin mx-auto mb-1.5 text-[#2F68FE]" />
            Carregando cartões...
          </div>
        ) : creditCards.length === 0 ? (
          <div className="bg-white border border-[#EBEEF2] rounded-2xl p-5 text-center space-y-2">
            <p className="text-xs text-[#98A2B3] font-normal">
              Nenhum cartão de crédito cadastrado.
            </p>
            <button
              type="button"
              onClick={() => {
                setFormType('credit_card')
                setModalOpen(true)
              }}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[#EBF2FF] hover:bg-[#DCE7FE] text-[#2F68FE] text-xs font-medium transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Adicionar Cartão</span>
            </button>
          </div>
        ) : creditCards.length === 1 ? (
          <div>
            <CreditCardItem
              key={creditCards[0].id}
              id={creditCards[0].id}
              name={creditCards[0].name}
              institution={creditCards[0].institution}
              color={creditCards[0].color}
              skin={(creditCards[0] as any).skin}
              customLogo={creditCards[0].custom_logo}
              currentMonthExpenses={creditCards[0].currentMonthExpenses}
              futureInstallmentsTotal={creditCards[0].futureInstallmentsTotal}
              futureInstallmentsCount={creditCards[0].futureInstallmentsCount}
              closingDay={creditCards[0].closing_day}
              dueDay={creditCards[0].due_day}
              inactive={creditCards[0].active === false}
              onClick={() => handleOpenDetails(creditCards[0])}
            />
          </div>
        ) : (
          <div
            data-testid="credit-cards-carousel"
            className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-1 -mx-4 px-4 sm:mx-0 sm:px-0 scrollbar-none [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
          >
            {creditCards.map((acc) => (
              <div
                key={acc.id}
                className="w-[88%] sm:w-[360px] shrink-0 snap-start"
              >
                <CreditCardItem
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
                  inactive={acc.active === false}
                  onClick={() => handleOpenDetails(acc)}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ======================================================== */}
      {/* 3. SEÇÃO CONTAS (LISTA COMPACTA UNIFICADA)               */}
      {/* ======================================================== */}
      <div className="space-y-3">
        <div className="px-0.5">
          <h2 className="text-base font-medium text-[#0F172A] tracking-tight">
            Contas
          </h2>
        </div>

        {loadingAccounts && bankAndCashAccounts.length === 0 ? (
          <div className="bg-white border border-[#EBEEF2] rounded-2xl p-6 text-center text-xs text-[#98A2B3]">
            <Loader2 className="w-4 h-4 animate-spin mx-auto mb-1.5 text-[#2F68FE]" />
            Carregando contas...
          </div>
        ) : bankAndCashAccounts.length === 0 ? (
          <div className="bg-white border border-[#EBEEF2] rounded-2xl p-5 text-center space-y-2">
            <p className="text-xs text-[#98A2B3] font-normal">
              Nenhuma conta cadastrada.
            </p>
            <button
              type="button"
              onClick={() => {
                setFormType('bank_account')
                setModalOpen(true)
              }}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[#EBF2FF] hover:bg-[#DCE7FE] text-[#2F68FE] text-xs font-medium transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Adicionar Conta</span>
            </button>
          </div>
        ) : (
          <div className="bg-white border border-[#EBEEF2] rounded-2xl overflow-hidden divide-y divide-[#F2F4F7] shadow-2xs">
            {bankAndCashAccounts.map((acc) => {
              const isInactive = acc.active === false
              const isCash = acc.type === 'cash'
              const typeLabel = isCash ? 'Dinheiro' : acc.institution || 'Conta corrente'
              const txCount = acc.transactionCount || 0

              return (
                <div
                  key={acc.id}
                  onClick={() => handleOpenDetails(acc)}
                  className={`flex items-center justify-between p-3.5 sm:px-4 hover:bg-[#F2F4F7]/70 cursor-pointer transition-colors group active:scale-[0.99] min-h-[60px] ${
                    isInactive ? 'opacity-40' : ''
                  }`}
                >
                  {/* Lado Esquerdo: Ícone / Logo + Nome + Subtexto */}
                  <div className="flex items-center gap-3 min-w-0 pr-2">
                    <InstitutionLogo
                      institution={acc.institution}
                      accountName={acc.name}
                      accountType={acc.type}
                      customLogo={acc.custom_logo}
                      color={acc.color}
                      size="md"
                    />
                    <div className="min-w-0">
                      <h3 className="font-normal text-sm text-[#0F172A] group-hover:text-[#2F68FE] transition-colors truncate">
                        {acc.name}
                      </h3>
                      <p className="text-[11px] text-[#667085] font-normal truncate mt-0.5">
                        {typeLabel} • {txCount} {txCount === 1 ? 'lançamento' : 'lançamentos'}
                      </p>
                    </div>
                  </div>

                  {/* Lado Direito: Saldo/Resumo + Chevron */}
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs sm:text-sm font-normal tabular-nums text-[#0F172A]">
                      {acc.type === 'cash' ? 'R$ 0,00' : 'R$ 0,00'}
                    </span>
                    <ChevronRight className="w-3.5 h-3.5 text-[#98A2B3]" />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ======================================================== */}
      {/* 4. SEÇÃO RESERVAS (LISTA COMPACTA UNIFICADA)             */}
      {/* ======================================================== */}
      <div className="space-y-3">
        <div className="px-0.5">
          <h2 className="text-base font-medium text-[#0F172A] tracking-tight">
            Reservas
          </h2>
        </div>

        {loadingReserves && reserves.length === 0 ? (
          <div className="bg-white border border-[#EBEEF2] rounded-2xl p-6 text-center text-xs text-[#98A2B3]">
            <Loader2 className="w-4 h-4 animate-spin mx-auto mb-1.5 text-[#10B981]" />
            Carregando reservas...
          </div>
        ) : reserves.length === 0 ? (
          <div className="bg-white border border-[#EBEEF2] rounded-2xl p-5 text-center space-y-2">
            <p className="text-xs text-[#98A2B3] font-normal">
              Nenhuma reserva cadastrada.
            </p>
            <button
              type="button"
              onClick={() => {
                setReserveModalOpen(true)
                setReserveError('')
              }}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[#EBF2FF] hover:bg-[#DCE7FE] text-[#2F68FE] text-xs font-medium transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Criar Reserva</span>
            </button>
          </div>
        ) : (
          <div className="bg-white border border-[#EBEEF2] rounded-2xl overflow-hidden divide-y divide-[#F2F4F7] shadow-2xs">
            {reserves.map((res) => {
              const hasTarget = Boolean(res.targetAmount && res.targetAmount > 0)
              const percentage = hasTarget
                ? Math.min(100, Math.round(((res.currentBalance || 0) / res.targetAmount!) * 100))
                : null
              const subtitle = hasTarget ? `Meta: ${formatBRL(res.targetAmount!)} (${percentage}%)` : 'Reserva • Sem meta'

              return (
                <div
                  key={res.id}
                  onClick={() => handleOpenReserveDetails(res)}
                  className="flex items-center justify-between p-3.5 sm:px-4 hover:bg-[#F2F4F7]/70 cursor-pointer transition-colors group active:scale-[0.99] min-h-[60px]"
                >
                  {/* Lado Esquerdo: Ícone + Nome + Subtítulo */}
                  <div className="flex items-center gap-3 min-w-0 pr-2">
                    <div className="w-9 h-9 rounded-full bg-[#E8FDF3] text-[#10B981] flex items-center justify-center shrink-0">
                      <Wallet className="w-4 h-4 stroke-[1.8]" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-normal text-sm text-[#0F172A] group-hover:text-[#2F68FE] transition-colors truncate">
                        {res.name}
                      </h3>
                      <p className="text-[11px] text-[#667085] font-normal truncate mt-0.5">
                        {subtitle}
                      </p>
                    </div>
                  </div>

                  {/* Lado Direito: Saldo Guardado + Chevron */}
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs sm:text-sm font-normal tabular-nums text-[#0F172A]">
                      {formatBRL(res.currentBalance || 0)}
                    </span>
                    <ChevronRight className="w-3.5 h-3.5 text-[#98A2B3]" />
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
      <AccountDetailDrawer
        isOpen={drawerOpen}
        account={selectedAccount}
        onClose={() => setDrawerOpen(false)}
        drawerError={drawerError}
        isEditing={isEditing}
        setIsEditing={setIsEditing}
        onToggleActive={handleToggleActive}
        togglingActive={togglingActive}
        onDeleteAccount={handleDeleteAccount}
        deletingAccount={deletingAccount}
        editName={editName}
        setEditName={setEditName}
        editType={editType}
        setEditType={setEditType}
        editInstitution={editInstitution}
        setEditInstitution={setEditInstitution}
        editClosingDay={editClosingDay}
        setEditClosingDay={setEditClosingDay}
        editDueDay={editDueDay}
        setEditDueDay={setEditDueDay}
        editCustomLogo={editCustomLogo}
        setEditCustomLogo={setEditCustomLogo}
        editColor={editColor}
        setEditColor={setEditColor}
        editSkin={editSkin}
        setEditSkin={setEditSkin}
        savingEdit={savingEdit}
        onSaveEdit={handleSaveEdit}
        drawerTransactions={drawerTransactions}
        loadingDrawerTx={loadingDrawerTx}
        cardInvoiceFilter={cardInvoiceFilter}
        setCardInvoiceFilter={setCardInvoiceFilter}
        navigateToTransactionsFiltered={navigateToTransactionsFiltered}
        onLogoUpload={handleLogoUpload}
        accounts={accounts}
        invoiceStatus={invoiceStatus}
        invoicePaidAmount={invoicePaidAmount}
        invoicePayments={invoicePayments}
        onOpenPayInvoiceModal={() => setPayInvoiceModalOpen(true)}
      />

      {/* ======================================================== */}
      {/* MODAL DE PAGAMENTO DE FATURA DE CARTÃO                   */}
      {/* ======================================================== */}
      <PayInvoiceModal
        isOpen={payInvoiceModalOpen}
        onClose={() => setPayInvoiceModalOpen(false)}
        accountName={selectedAccount?.name || 'Cartão'}
        dueDate={invoiceDueDate}
        totalAmount={invoiceTotalAmount}
        remainingAmount={invoiceRemainingAmount}
        accounts={accounts}
        onPaySuccess={() => {
          fetchAccounts()
        }}
        onPayInvoice={handlePayInvoice}
      />

      {/* ======================================================== */}
      {/* DRAWER DE DETALHES DA RESERVA (DINHEIRO GUARDADO)        */}
      {/* ======================================================== */}
      <ReserveDetailDrawer
        isOpen={reserveDrawerOpen}
        reserve={selectedReserve}
        onClose={() => setReserveDrawerOpen(false)}
        onOpenMovementModal={handleOpenMovementModal}
        onDeleteReserve={handleDeleteReserve}
        deletingReserve={deletingReserve}
        onSaveReserveEdit={handleSaveReserveEdit}
        savingReserveEdit={savingReserveEdit}
        isEditingReserve={isEditingReserve}
        setIsEditingReserve={setIsEditingReserve}
        editReserveName={editReserveName}
        setEditReserveName={setEditReserveName}
        editReserveTarget={editReserveTarget}
        setEditReserveTarget={setEditReserveTarget}
      />

      {/* ======================================================== */}
      {/* MODAL DE APORTE OU RETIRADA NA RESERVA                   */}
      {/* ======================================================== */}
      <ReserveMovementModal
        isOpen={movementModalOpen}
        reserve={selectedReserve}
        onClose={() => setMovementModalOpen(false)}
        movementType={movementType}
        setMovementType={setMovementType}
        movementAmount={movementAmount}
        setMovementAmount={setMovementAmount}
        movementDate={movementDate}
        setMovementDate={setMovementDate}
        movementAccount={movementAccount}
        setMovementAccount={setMovementAccount}
        movementNotes={movementNotes}
        setMovementNotes={setMovementNotes}
        savingMovement={savingMovement}
        movementError={movementError}
        onSaveMovement={handleSaveMovement}
        accounts={accounts}
      />

      {/* ======================================================== */}
      {/* MODAL DE CRIAÇÃO DE NOVA RESERVA                         */}
      {/* ======================================================== */}
      <CreateReserveModal
        isOpen={reserveModalOpen}
        onClose={() => setReserveModalOpen(false)}
        name={reserveFormName}
        setName={setReserveFormName}
        initialBalance={reserveFormInitialBalance}
        setInitialBalance={setReserveFormInitialBalance}
        targetAmount={reserveFormTargetAmount}
        setTargetAmount={setReserveFormTargetAmount}
        fromAccount={reserveFormFromAccount}
        setFromAccount={setReserveFormFromAccount}
        saving={savingReserve}
        error={reserveError}
        onCreate={handleCreateReserve}
        accounts={accounts}
      />

      {/* ======================================================== */}
      {/* MODAL DE CADASTRO DE NOVA CONTA / CARTÃO                 */}
      {/* ======================================================== */}
      <CreateAccountModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        formName={formName}
        setFormName={setFormName}
        formType={formType}
        setFormType={setFormType}
        formInstitution={formInstitution}
        setFormInstitution={setFormInstitution}
        formClosingDay={formClosingDay}
        setFormClosingDay={setFormClosingDay}
        formDueDay={formDueDay}
        setFormDueDay={setFormDueDay}
        formCustomLogo={formCustomLogo}
        setFormCustomLogo={setFormCustomLogo}
        formColor={formColor}
        setFormColor={setFormColor}
        formSkin={formSkin}
        setFormSkin={setFormSkin}
        savingAccount={savingAccount}
        accountError={accountError}
        onCreateAccount={handleCreateAccount}
        onLogoUpload={handleLogoUpload}
      />
    </section>
  )
}
