'use client'

import React, { useState, useEffect, useRef } from 'react'
import {
  CreditCard,
  Plus,
  Check,
  ChevronDown,
  Loader2,
  Landmark,
  Banknote,
  Smartphone,
  Wallet,
  Building2,
} from 'lucide-react'
import type { Account, AccountType } from '@/lib/schema'
import { getAccountTypeLabel, getAccountTypeLucideIcon } from '@/lib/formatters'
import { useTelegramWebApp } from '@/lib/useTelegramWebApp'

export interface AccountSelectProps {
  accounts: Account[]
  value?: string | null
  onChange: (accountId: string | null) => void
  onAccountCreated?: (newAccount: Account) => void
  placeholder?: string
  className?: string
}

export function AccountSelect({
  accounts,
  value,
  onChange,
  onAccountCreated,
  placeholder = 'Sem conta vinculada (Geral)',
  className = '',
}: AccountSelectProps) {
  const { fetchWithAuth } = useTelegramWebApp()
  const [isOpen, setIsOpen] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState<AccountType>('bank_account')
  const [newInstitution, setNewInstitution] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [createError, setCreateError] = useState('')

  const containerRef = useRef<HTMLDivElement>(null)

  // Fecha o dropdown ao clicar fora
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
        setIsCreating(false)
        setCreateError('')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const visibleAccounts = accounts.filter((a) => a.name?.trim().toLowerCase() !== 'pix')
  const selectedAccount = accounts.find((a) => a.id === value)

  async function handleCreateAccount(e: React.FormEvent) {
    e.preventDefault()
    e.stopPropagation()
    const trimmed = newName.trim()
    if (!trimmed) {
      setCreateError('Nome da conta é obrigatório.')
      return
    }

    setSubmitting(true)
    setCreateError('')

    try {
      const res = await fetchWithAuth('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmed,
          type: newType,
          institution: newInstitution.trim() || null,
        }),
      })

      const data = await res.json()
      if (data.ok && data.account) {
        if (onAccountCreated) {
          onAccountCreated(data.account)
        }
        onChange(data.account.id)
        setNewName('')
        setNewInstitution('')
        setIsCreating(false)
        setIsOpen(false)
      } else {
        setCreateError(data.error || 'Falha ao cadastrar conta.')
      }
    } catch {
      setCreateError('Erro de conexão ao cadastrar.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Botão de Disparo do Seletor */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full bg-[#F9FAFB] border border-[#E5E7EB] hover:border-[#D1D5DB] focus:bg-white rounded-xl px-3 py-2 text-xs text-left text-[#111827] flex items-center justify-between gap-2 transition-all shadow-sm"
      >
        <div className="flex items-center gap-2 min-w-0">
          {selectedAccount ? (
            (() => {
              const Icon = getAccountTypeLucideIcon(selectedAccount.type)
              return (
                <>
                  <Icon className="w-3.5 h-3.5 text-[#2F68FE] shrink-0" />
                  <span className="font-semibold truncate text-[#111827]">
                    {selectedAccount.name}
                  </span>
                  {selectedAccount.institution && (
                    <span className="text-[10px] text-[#6B7280] bg-[#EBF2FF] px-1.5 py-0.2 rounded shrink-0">
                      {selectedAccount.institution}
                    </span>
                  )}
                  <span className="text-[10px] text-[#4B5563] shrink-0 font-medium">
                    ({getAccountTypeLabel(selectedAccount.type)})
                  </span>
                </>
              )
            })()
          ) : (
            <>
              <CreditCard className="w-3.5 h-3.5 text-[#6B7280] shrink-0" />
              <span className="text-[#6B7280] truncate">{placeholder}</span>
            </>
          )}
        </div>
        <ChevronDown className="w-3.5 h-3.5 text-[#6B7280] shrink-0" />
      </button>

      {/* Popover / Dropdown */}
      {isOpen && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-[#EBEEF2] rounded-2xl shadow-xl overflow-hidden animate-in fade-in duration-100">
          {!isCreating ? (
            <div className="p-1.5 max-h-60 overflow-y-auto space-y-1">
              {/* Opção "Sem conta" */}
              <button
                type="button"
                onClick={() => {
                  onChange(null)
                  setIsOpen(false)
                }}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs text-left transition-colors ${
                  !value ? 'bg-[#F4F5F7] text-[#111827] font-semibold' : 'text-[#6B7280] hover:bg-[#F9FAFB] hover:text-[#111827]'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Wallet className="w-3.5 h-3.5 text-[#9CA3AF]" />
                  <span>Sem conta específica (Geral)</span>
                </div>
                {!value && <Check className="w-3.5 h-3.5 text-[#2F68FE]" />}
              </button>

              {/* Lista de Contas Cadastradas */}
              {visibleAccounts.map((acc) => {
                const isSelected = value === acc.id
                const Icon = getAccountTypeLucideIcon(acc.type)
                return (
                  <button
                    key={acc.id}
                    type="button"
                    onClick={() => {
                      onChange(acc.id)
                      setIsOpen(false)
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs text-left transition-colors ${
                      isSelected ? 'bg-[#EBF2FF] text-[#2F68FE] font-semibold' : 'text-[#111827] hover:bg-[#F9FAFB]'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Icon className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-[#2F68FE]' : 'text-[#6B7280]'}`} />
                      <span className="truncate">{acc.name}</span>
                      {acc.institution && (
                        <span className="text-[10px] text-[#6B7280] bg-[#F4F5F7] px-1.5 py-0.2 rounded shrink-0">
                          {acc.institution}
                        </span>
                      )}
                      <span className="text-[10px] text-[#9CA3AF] shrink-0">
                        ({getAccountTypeLabel(acc.type)})
                      </span>
                    </div>
                    {isSelected && <Check className="w-3.5 h-3.5 text-[#2F68FE] shrink-0" />}
                  </button>
                )
              })}

              {/* Botão para Criar Nova Conta Inline */}
              <div className="pt-1 border-t border-[#F4F5F7]">
                <button
                  type="button"
                  onClick={() => {
                    setIsCreating(true)
                    setCreateError('')
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-[#2F68FE] hover:bg-[#EBF2FF] transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ Cadastrar nova conta / cartão</span>
                </button>
              </div>
            </div>
          ) : (
            /* Formulário Inline de Nova Conta */
            <form onSubmit={handleCreateAccount} className="p-3 space-y-3">
              <div className="flex items-center justify-between pb-1.5 border-b border-[#EBEEF2]">
                <span className="text-xs font-bold text-[#111827]">Nova Conta / Cartão</span>
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="text-[11px] text-[#6B7280] hover:text-[#111827]"
                >
                  Cancelar
                </button>
              </div>

              {createError && (
                <div className="text-[11px] text-red-600 bg-red-50 p-1.5 rounded-lg border border-red-100">
                  {createError}
                </div>
              )}

              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-[#6B7280]">Tipo</label>
                <div className="grid grid-cols-2 gap-1">
                  {[
                    { type: 'bank_account' as const, label: 'Conta Bancária', icon: Landmark },
                    { type: 'credit_card' as const, label: 'Cartão de Crédito', icon: CreditCard },
                    { type: 'debit_card' as const, label: 'Cartão de Débito', icon: CreditCard },
                    { type: 'cash' as const, label: 'Dinheiro', icon: Banknote },
                  ].map((t) => {
                    const TIcon = t.icon
                    const isSel = newType === t.type
                    return (
                      <button
                        key={t.type}
                        type="button"
                        onClick={() => setNewType(t.type)}
                        className={`flex items-center gap-1.5 p-1.5 rounded-lg text-[11px] border text-left transition-all ${
                          isSel
                            ? 'bg-[#2F68FE]/10 border-[#2F68FE] text-[#2F68FE] font-semibold'
                            : 'bg-[#F9FAFB] border-[#E5E7EB] text-[#6B7280] hover:text-[#111827]'
                        }`}
                      >
                        <TIcon className="w-3 h-3" />
                        <span className="truncate">{t.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-[#6B7280]">Nome da Conta / Cartão</label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Ex: Nubank, Cartão XP, Carteira..."
                  className="w-full bg-[#F9FAFB] border border-[#E5E7EB] rounded-lg px-2.5 py-1.5 text-xs text-[#111827] focus:outline-none focus:border-[#2F68FE]"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-[#6B7280]">Instituição / Banco (opcional)</label>
                <input
                  type="text"
                  value={newInstitution}
                  onChange={(e) => setNewInstitution(e.target.value)}
                  placeholder="Ex: Itaú, Bradesco, Inter..."
                  className="w-full bg-[#F9FAFB] border border-[#E5E7EB] rounded-lg px-2.5 py-1.5 text-xs text-[#111827] focus:outline-none focus:border-[#2F68FE]"
                />
              </div>

              <button
                type="submit"
                disabled={submitting || !newName.trim()}
                className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-[#2F68FE] hover:bg-[#2557D6] text-white font-semibold text-xs transition-colors disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Salvando...</span>
                  </>
                ) : (
                  <span>Salvar e Selecionar</span>
                )}
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  )
}
