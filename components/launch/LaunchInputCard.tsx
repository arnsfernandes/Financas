'use client'

import React from 'react'
import {
  FileText,
  Paperclip,
  Camera,
  Plus,
  X,
  AlertCircle,
} from 'lucide-react'
import { formatBRL } from '@/lib/formatters'
import { AccountSelect } from '@/components/accounts/AccountSelect'
import type { AccountOption } from './NewLaunchTab'

export interface LaunchInputCardProps {
  quickTextInput: string
  setQuickTextInput: (v: string) => void
  selectedFile: File | null
  filePreviewUrl: string | null
  isDraggingFile: boolean
  setIsDraggingFile: (v: boolean) => void
  interpreting: boolean
  selectedAccountId: string
  setSelectedAccountId: (v: string) => void
  showAccountSelector: boolean
  setShowAccountSelector: (v: boolean) => void
  localAccounts: AccountOption[]
  setLocalAccounts: React.Dispatch<React.SetStateAction<AccountOption[]>>
  fileInputRef: React.RefObject<HTMLInputElement>
  cameraInputRef: React.RefObject<HTMLInputElement>
  handleFileSelected: (file: File) => void
  handleRemoveFile: () => void
  handleUnifiedSubmit: () => Promise<void>
  handleStartManual: () => void
  duplicateWarning: {
    type: 'exact' | 'probable'
    message: string
    existingTransaction?: any
  } | null
  setDuplicateWarning: (v: any) => void
  onReviewDuplicate: () => void
}

export function LaunchInputCard({
  quickTextInput,
  setQuickTextInput,
  selectedFile,
  filePreviewUrl,
  isDraggingFile,
  setIsDraggingFile,
  interpreting,
  selectedAccountId,
  setSelectedAccountId,
  showAccountSelector,
  setShowAccountSelector,
  localAccounts,
  setLocalAccounts,
  fileInputRef,
  cameraInputRef,
  handleFileSelected,
  handleRemoveFile,
  handleUnifiedSubmit,
  handleStartManual,
  duplicateWarning,
  setDuplicateWarning,
  onReviewDuplicate,
}: LaunchInputCardProps) {
  return (
    <div className="max-w-xl mx-auto space-y-4">
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setIsDraggingFile(true)
        }}
        onDragLeave={() => setIsDraggingFile(false)}
        onDrop={(e) => {
          e.preventDefault()
          setIsDraggingFile(false)
          const file = e.dataTransfer.files?.[0]
          if (file) handleFileSelected(file)
        }}
        className={`bg-white border rounded-2xl p-4 sm:p-5 shadow-2xs space-y-4 transition-all ${
          isDraggingFile ? 'border-[#2F68FE] ring-2 ring-[#2F68FE]/20 bg-[#EBF2FF]/30' : 'border-[#EBEEF2]'
        }`}
      >
        {/* Inputs de arquivo/câmera ocultos */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) handleFileSelected(file)
          }}
        />
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) handleFileSelected(file)
          }}
        />

        {/* Campo Principal: "O que aconteceu?" */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-[#0F172A] block">O que aconteceu?</label>
          <textarea
            value={quickTextInput}
            onChange={(e) => setQuickTextInput(e.target.value)}
            disabled={interpreting}
            rows={3}
            placeholder="Ex.: Comprei R$ 480 no cartão Inter em 4x"
            className="w-full bg-[#F2F4F7] border border-transparent hover:border-[#E4E7EC] focus:border-[#2F68FE] focus:bg-white rounded-xl p-3 text-xs sm:text-sm text-[#0F172A] placeholder:text-[#98A2B3] focus:outline-none transition-all resize-none disabled:opacity-50 leading-relaxed"
          />
        </div>

        {/* Badge de Arquivo Anexado (se selecionado) */}
        {selectedFile && (
          <div className="flex items-center justify-between p-2.5 bg-[#F2F4F7] border border-transparent rounded-xl text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <FileText className="w-4 h-4 text-[#2F68FE] shrink-0" />
              <span className="font-normal text-[#0F172A] truncate">{selectedFile.name}</span>
              <span className="text-[10px] text-[#667085] shrink-0">
                ({(selectedFile.size / 1024).toFixed(0)} KB)
              </span>
            </div>
            <button
              type="button"
              onClick={handleRemoveFile}
              className="p-1 text-[#98A2B3] hover:text-rose-500 rounded-lg transition-colors cursor-pointer"
              title="Remover arquivo"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Ações Secundárias Logo Abaixo do Campo */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={interpreting}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#EBEEF2] bg-white hover:bg-[#F2F4F7] text-xs font-medium text-[#475467] transition-all disabled:opacity-50 cursor-pointer shadow-2xs"
          >
            <Paperclip className="w-3.5 h-3.5 text-[#667085]" />
            <span>Anexar arquivo</span>
          </button>

          <button
            type="button"
            onClick={() => cameraInputRef.current?.click()}
            disabled={interpreting}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#EBEEF2] bg-white hover:bg-[#F2F4F7] text-xs font-medium text-[#475467] transition-all disabled:opacity-50 cursor-pointer shadow-2xs"
          >
            <Camera className="w-3.5 h-3.5 text-[#667085]" />
            <span>Tirar foto</span>
          </button>

          {!showAccountSelector && !selectedAccountId ? (
            <button
              type="button"
              onClick={() => setShowAccountSelector(true)}
              disabled={interpreting}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#EBEEF2] bg-white hover:bg-[#F2F4F7] text-xs font-medium text-[#475467] transition-all disabled:opacity-50 cursor-pointer shadow-2xs"
            >
              <Plus className="w-3.5 h-3.5 text-[#667085]" />
              <span>Vincular conta</span>
            </button>
          ) : null}
        </div>

        {/* Seletor de Conta Expandido Sob Demanda */}
        {(showAccountSelector || selectedAccountId) && (
          <div className="pt-1 flex items-center gap-2 animate-in fade-in duration-150">
            <div className="flex-1">
              <AccountSelect
                accounts={localAccounts as any}
                value={selectedAccountId || null}
                onChange={(id) => setSelectedAccountId(id || '')}
                onAccountCreated={(newAcc) => {
                  setLocalAccounts((prev) => [...prev, newAcc])
                }}
                placeholder="Selecione a conta ou cartão (opcional)"
                className="text-xs"
              />
            </div>
            <button
              type="button"
              onClick={() => {
                setSelectedAccountId('')
                setShowAccountSelector(false)
              }}
              className="p-2 text-[#98A2B3] hover:text-[#0F172A] rounded-xl hover:bg-[#F2F4F7] transition-colors cursor-pointer"
              title="Remover vínculo de conta"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Botão Principal: "Continuar" */}
        <div className="pt-1">
          <button
            type="button"
            disabled={interpreting || (!quickTextInput.trim() && !selectedFile)}
            onClick={handleUnifiedSubmit}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-[#2F68FE] hover:bg-[#2554D0] active:scale-[0.99] text-white font-medium text-xs transition-all disabled:bg-slate-200 disabled:text-slate-400 cursor-pointer disabled:cursor-not-allowed shadow-2xs touch-manipulation min-h-[42px]"
          >
            {interpreting ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Processando lançamento...</span>
              </>
            ) : (
              <span>Continuar</span>
            )}
          </button>
        </div>

        {/* Ação secundária discreta: "Preencher manualmente" */}
        <div className="text-center pt-1">
          <button
            type="button"
            onClick={handleStartManual}
            disabled={interpreting}
            className="text-xs text-[#667085] hover:text-[#0F172A] transition-colors font-medium py-1 cursor-pointer"
          >
            Preencher manualmente
          </button>
        </div>
      </div>

      {/* Alerta de Lançamento Duplicado no Estado 1 */}
      {duplicateWarning && (
        <div
          className={`border rounded-2xl p-4 space-y-3 ${
            duplicateWarning.type === 'exact'
              ? 'border-red-200 bg-red-50 text-red-900'
              : 'border-amber-200 bg-amber-50 text-amber-900'
          }`}
        >
          <div className="flex items-start gap-3">
            <AlertCircle
              className={`w-5 h-5 shrink-0 mt-0.5 ${
                duplicateWarning.type === 'exact' ? 'text-red-600' : 'text-amber-600'
              }`}
            />
            <div className="space-y-1 text-xs flex-1">
              <span className="font-semibold block text-sm">
                {duplicateWarning.type === 'exact'
                  ? 'Duplicata Exata Detectada'
                  : 'Possível Lançamento Duplicado'}
              </span>
              <p className="leading-relaxed text-[#4B5563]">{duplicateWarning.message}</p>
              {duplicateWarning.existingTransaction && (
                <div className="mt-2 bg-white/80 border border-black/5 rounded-xl p-2.5 text-[11px] text-[#374151] space-y-1">
                  <div>
                    <span className="text-[#6B7280]">Estabelecimento: </span>
                    <span className="font-medium text-[#111827]">
                      {duplicateWarning.existingTransaction.vendor || '—'}
                    </span>
                  </div>
                  <div className="flex gap-4">
                    <div>
                      <span className="text-[#6B7280]">Data: </span>
                      <span className="font-medium text-[#111827]">
                        {duplicateWarning.existingTransaction.date ||
                          duplicateWarning.existingTransaction.created_at?.slice(0, 10) ||
                          '—'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[#6B7280]">Valor: </span>
                      <span className="font-medium text-[#111827]">
                        {formatBRL(duplicateWarning.existingTransaction.total)}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-black/5">
            <button
              type="button"
              onClick={() => setDuplicateWarning(null)}
              className="px-3 py-1.5 rounded-xl text-xs font-medium text-[#6B7280] hover:text-[#111827] bg-white border border-[#E5E7EB] transition-colors"
            >
              Fechar
            </button>
            {duplicateWarning.type === 'probable' && (
              <button
                type="button"
                onClick={onReviewDuplicate}
                className="px-4 py-1.5 rounded-xl text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-white transition-colors"
              >
                Revisar e Continuar
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
