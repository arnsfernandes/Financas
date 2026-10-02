'use client'

import React from 'react'
import {
  Landmark,
  CreditCard,
  Banknote,
  X,
  Loader2,
  Upload,
} from 'lucide-react'
import type { AccountType } from '@/lib/schema'
import { InstitutionLogo } from './InstitutionLogo'
import { CreditCardItem, CREDIT_CARD_SKINS, type CreditCardSkin } from './CreditCardItem'
import { KNOWN_INSTITUTIONS, getInstitutionInfo } from '@/lib/institutions'
import { COLOR_PRESETS } from './accountConstants'

export interface CreateAccountModalProps {
  isOpen: boolean
  onClose: () => void
  formName: string
  setFormName: (val: string) => void
  formType: AccountType
  setFormType: (val: AccountType) => void
  formInstitution: string
  setFormInstitution: (val: string) => void
  formClosingDay: string
  setFormClosingDay: (val: string) => void
  formDueDay: string
  setFormDueDay: (val: string) => void
  formCustomLogo: string
  setFormCustomLogo: (val: string) => void
  formColor: string
  setFormColor: (val: string) => void
  formSkin: CreditCardSkin
  setFormSkin: (val: CreditCardSkin) => void
  savingAccount: boolean
  accountError: string
  onCreateAccount: (e: React.FormEvent) => void
  onLogoUpload: (file: File | undefined, onDone: (url: string) => void) => void
}

export function CreateAccountModal({
  isOpen,
  onClose,
  formName,
  setFormName,
  formType,
  setFormType,
  formInstitution,
  setFormInstitution,
  formClosingDay,
  setFormClosingDay,
  formDueDay,
  setFormDueDay,
  formCustomLogo,
  setFormCustomLogo,
  formColor,
  setFormColor,
  formSkin,
  setFormSkin,
  savingAccount,
  accountError,
  onCreateAccount,
  onLogoUpload,
}: CreateAccountModalProps) {
  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl border border-[#EBEEF2] overflow-hidden max-h-[92vh] flex flex-col animate-in slide-in-from-bottom sm:zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile Grab Handle */}
        <div className="sm:hidden pt-2.5 pb-1 bg-white flex justify-center shrink-0">
          <div className="w-10 h-1 bg-slate-300 rounded-full" />
        </div>

        <div className="p-4 sm:p-5 border-b border-[#EBEEF2] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#EBF2FF] text-[#2F68FE] flex items-center justify-center shrink-0">
              <CreditCard className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-[#111827]">Nova Conta / Cartão</h3>
              <p className="text-[11px] text-[#6B7280]">
                Cadastre uma nova conta ou cartão para seus lançamentos
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-[#9CA3AF] hover:text-[#111827] hover:bg-[#F4F5F7] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={onCreateAccount} className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1">
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
                  onChange={(e) => onLogoUpload(e.target.files?.[0], setFormCustomLogo)}
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
          <div className="flex items-center justify-end gap-2 pt-3 pb-[max(1rem,env(safe-area-inset-bottom,0px))] sm:pb-0 border-t border-[#EBEEF2]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 sm:py-2 rounded-xl text-xs font-semibold text-[#6B7280] hover:bg-[#F4F5F7] active:bg-[#E5E7EB] transition-colors touch-manipulation min-h-[44px] sm:min-h-0"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={savingAccount || !formName.trim()}
              className="flex items-center justify-center gap-1.5 px-5 py-2.5 sm:py-2 rounded-xl bg-[#2F68FE] hover:bg-[#2557D6] active:bg-[#1E4ECC] text-white text-xs font-semibold shadow-sm transition-colors disabled:opacity-50 touch-manipulation min-h-[44px] sm:min-h-0"
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
  )
}
