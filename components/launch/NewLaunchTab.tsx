'use client'

import React, { useState, useRef } from 'react'
import {
  ChevronLeft,
  CheckCircle2,
  AlertCircle,
  X,
  Paperclip,
  Camera,
  Plus,
  CreditCard,
  Sparkles,
  ZoomIn,
  Store,
  Tag,
  Calendar,
  Clock,
  Package,
  Eye,
  Repeat,
  Check,
  Trash2,
  ArrowDownLeft,
  ArrowUpRight,
  FileText,
  Image as ImageIcon,
} from 'lucide-react'
import type { Receipt } from '@/lib/schema'
import { formatBRL } from '@/lib/formatters'
import { CategorySelect } from '@/components/categories/CategorySelect'
import { AccountSelect } from '@/components/accounts/AccountSelect'
import { resolveInstallmentPlan } from '@/lib/installments'
import { resolveRecurrenceUpdate } from '@/lib/recurrence'
import { useTelegramWebApp } from '@/lib/useTelegramWebApp'

export interface AccountOption {
  id: string
  name: string
  type: string
  institution?: string | null
  active?: boolean
  created_at?: string
}

export interface NewLaunchTabProps {
  accounts: AccountOption[]
  onSaveSuccess?: () => void | Promise<void>
  className?: string
  initialType?: 'expense' | 'income'
  initialMode?: 'text' | 'image' | 'manual'
}

type LaunchStep = 'input' | 'review'

export function NewLaunchTab({
  accounts: initialAccounts,
  onSaveSuccess,
  className,
  initialType = 'expense',
  initialMode = 'text',
}: NewLaunchTabProps) {
  const { fetchWithAuth } = useTelegramWebApp()
  // Contas locais para permitir criação inline
  const [localAccounts, setLocalAccounts] = useState<AccountOption[]>(initialAccounts)

  // Passos do Fluxo: Entrada → Revisão → Salvar
  const [launchStep, setLaunchStep] = useState<LaunchStep>(initialMode === 'manual' ? 'review' : 'input')

  // Estado da Tela 1 (Entrada Unificada)
  const [quickTextInput, setQuickTextInput] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null)
  const [isDraggingFile, setIsDraggingFile] = useState(false)
  const [interpreting, setInterpreting] = useState(false)
  const [launchError, setLaunchError] = useState('')
  const [selectedAccountId, setSelectedAccountId] = useState<string>('')
  const [showAccountSelector, setShowAccountSelector] = useState<boolean>(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  // Estado da Tela 2 (Revisão / Staging)
  const [draft, setDraft] = useState<{
    receipt: Receipt; sourceType: 'text' | 'image'; rawText: string | null;
    originalExtractedData: Record<string, any>;
  } | null>(null)
  // Estado para Múltiplas Transações em Lote (ex: texto com várias compras separadas)
  const [batchDrafts, setBatchDrafts] = useState<{
    receipt: Receipt
    sourceType: 'text' | 'image'
    rawText: string | null
    originalExtractedData: Record<string, any>
  }[] | null>(null)
  const savingRef = useRef(false)
  const [reviewType, setReviewType] = useState<'expense' | 'income'>(initialType)
  const [reviewTotal, setReviewTotal] = useState<string>('')
  const [reviewVendor, setReviewVendor] = useState<string>('')
  const [reviewCategory, setReviewCategory] = useState<string>('')
  const [reviewCategoryId, setReviewCategoryId] = useState<string | null>(null)
  const [reviewAccountId, setReviewAccountId] = useState<string>('')
  const [reviewPaymentMethod, setReviewPaymentMethod] = useState<string>('')
  const [reviewDate, setReviewDate] = useState<string>(() => new Date().toISOString().slice(0, 10))
  const [reviewTime, setReviewTime] = useState<string>(() => new Date().toTimeString().slice(0, 5))
  const [reviewNotes, setReviewNotes] = useState<string>('')
  const [reviewItems, setReviewItems] = useState<{
    id?: string
    description: string
    quantity?: number | null
    unit_price?: number | null
    total?: number | null
    category?: string | null
  }[]>([])
  const [reviewIsRecurring, setReviewIsRecurring] = useState<boolean>(false)
  const [reviewRecurrenceNextDate, setReviewRecurrenceNextDate] = useState<string>('')
  const [reviewIsEstimated, setReviewIsEstimated] = useState<boolean>(false)
  const [reviewRecurrenceDueDay, setReviewRecurrenceDueDay] = useState<string>('')
  const [reviewIsInstallment, setReviewIsInstallment] = useState<boolean>(false)
  const [reviewInstallmentCurrent, setReviewInstallmentCurrent] = useState<string>('1')
  const [reviewInstallmentTotal, setReviewInstallmentTotal] = useState<string>('2')
  const [reviewNeedsReview, setReviewNeedsReview] = useState<boolean>(false)
  const [reviewValidationReasons, setReviewValidationReasons] = useState<string[]>([])
  const [savingLaunch, setSavingLaunch] = useState<boolean>(false)
  const [launchSuccessMessage, setLaunchSuccessMessage] = useState<string | null>(null)

  // Alerta de Duplicidade
  const [duplicateWarning, setDuplicateWarning] = useState<{
    type: 'exact' | 'probable'
    message: string
    existingTransaction?: any
  } | null>(null)

  // Drawer de Itens
  const [showItemsDrawer, setShowItemsDrawer] = useState<boolean>(false)

  // Modal de Zoom do Comprovante
  const [showImageZoom, setShowImageZoom] = useState<boolean>(false)

  // Disparo do Fluxo Unificado: Texto, Arquivo ou Texto + Arquivo
  async function handleUnifiedSubmit() {
    const trimmedText = quickTextInput.trim()
    if (!trimmedText && !selectedFile) {
      setLaunchError('Descreva a movimentação ou anexe um comprovante para continuar.')
      return
    }

    setInterpreting(true)
    setLaunchError('')
    setDuplicateWarning(null)

    try {
      if (selectedFile) {
        // Envio com arquivo (e texto opcional)
        const fd = new FormData()
        fd.append('file', selectedFile)
        if (trimmedText) {
          fd.append('text', trimmedText)
        }
        if (selectedAccountId) {
          fd.append('accountId', selectedAccountId)
        }

        const res = await fetchWithAuth('/api/scan', {
          method: 'POST',
          body: fd,
        })
        const data = await res.json()
        handleScanResponse(data)
      } else {
        // Envio somente texto via JSON
        const res = await fetchWithAuth('/api/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: trimmedText,
            accountId: selectedAccountId || undefined,
          }),
        })
        const data = await res.json()
        handleScanResponse(data)
      }
    } catch {
      setLaunchError('Erro de conexão ao processar lançamento.')
    } finally {
      setInterpreting(false)
    }
  }

  function handleScanResponse(data: any) {
    if (data.ok && data.isBatch && Array.isArray(data.items) && data.items.length > 1) {
      setDraft(null)
      setBatchDrafts(data.items)
      setLaunchStep('review')
    } else if (data.ok && data.receipt) {
      setBatchDrafts(null)
      setDraft({ receipt: data.receipt, sourceType: data.sourceType,
        rawText: data.rawText || null, originalExtractedData: data.originalExtractedData })
      setReviewType(data.receipt.type || 'expense')
      setReviewTotal(
        data.receipt.total !== null && data.receipt.total !== undefined ? String(data.receipt.total) : ''
      )
      setReviewVendor(data.receipt.vendor || '')
      setReviewCategory(data.receipt.category || '')
      setReviewCategoryId(data.receipt.category_id || null)
      setReviewAccountId(data.receipt.account_id || selectedAccountId || '')
      setReviewPaymentMethod(data.receipt.payment_method || '')
      setReviewDate(data.receipt.date || new Date().toISOString().slice(0, 10))
      setReviewTime(data.receipt.time || new Date().toTimeString().slice(0, 5))
      setReviewNotes(data.receipt.notes || '')
      setReviewItems(data.receipt.items || [])
      setReviewIsRecurring(Boolean(data.receipt.is_recurring))
      setReviewRecurrenceNextDate(data.receipt.recurrence_next_date || '')
      setReviewIsEstimated(Boolean(data.receipt.notes?.includes('[Estimado]') || (data.receipt as any)?.is_estimated))
      if (data.receipt.recurrence_next_date) {
        setReviewRecurrenceDueDay(String(parseInt(data.receipt.recurrence_next_date.slice(8, 10), 10)))
      } else {
        setReviewRecurrenceDueDay('')
      }
      setReviewIsInstallment(Boolean(data.receipt.installment_total && data.receipt.installment_total > 1))
      setReviewInstallmentCurrent(String(data.receipt.installment_current || 1))
      setReviewInstallmentTotal(String(data.receipt.installment_total || 2))
      setReviewNeedsReview(data.receipt.review_status === 'needs_review')
      setReviewValidationReasons(data.receipt.review_reasons || [])
      setLaunchStep('review')
    } else if (data.isDuplicate) {
      setDuplicateWarning({
        type: data.duplicateType || 'probable',
        message: data.error || 'Lançamento duplicado detectado.',
        existingTransaction: data.existingTransaction,
      })
    } else {
      setLaunchError(data.error || 'Falha ao interpretar lançamento.')
    }
  }

  // Ação secundária: Preencher manualmente (mesma tela de revisão)
  function handleStartManual() {
    setDraft(null)
    setBatchDrafts(null)
    setReviewType('expense')
    setReviewTotal('')
    setReviewVendor('')
    setReviewCategory('')
    setReviewCategoryId(null)
    setReviewAccountId(selectedAccountId || '')
    setReviewPaymentMethod('')
    setReviewDate(new Date().toISOString().slice(0, 10))
    setReviewTime(new Date().toTimeString().slice(0, 5))
    setReviewNotes('')
    setReviewItems([])
    setReviewIsRecurring(false)
    setReviewRecurrenceNextDate('')
    setReviewIsEstimated(false)
    setReviewRecurrenceDueDay('')
    setReviewIsInstallment(false)
    setReviewInstallmentCurrent('1')
    setReviewInstallmentTotal('2')
    setReviewNeedsReview(false)
    setReviewValidationReasons([])
    setFilePreviewUrl(null)
    setSelectedFile(null)
    setDuplicateWarning(null)
    setLaunchError('')
    setLaunchStep('review')
  }

  // Manipulação de Arquivo selecionado/arrastado
  function handleFileSelected(file: File) {
    setSelectedFile(file)
    setFilePreviewUrl(URL.createObjectURL(file))
    setLaunchError('')
  }

  function handleRemoveFile() {
    setSelectedFile(null)
    if (filePreviewUrl) {
      URL.revokeObjectURL(filePreviewUrl)
      setFilePreviewUrl(null)
    }
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (cameraInputRef.current) cameraInputRef.current.value = ''
  }

  // Salvar Batch de Múltiplos Lançamentos
  async function handleSaveBatchLaunches() {
    if (!batchDrafts || batchDrafts.length === 0 || savingRef.current) return
    savingRef.current = true
    setSavingLaunch(true)
    setLaunchError('')

    try {
      const payload = {
        items: batchDrafts.map((item) => ({
          sourceType: item.sourceType,
          rawText: item.rawText,
          originalExtractedData: item.originalExtractedData,
          receipt: item.receipt,
        })),
      }
      const response = await fetchWithAuth('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await response.json()
      if (!data.ok) {
        setLaunchError(data.error || 'Erro ao registrar lançamentos em lote.')
        return
      }

      setLaunchSuccessMessage(`${batchDrafts.length} lançamentos registrados com sucesso!`)
      setTimeout(() => setLaunchSuccessMessage(null), 4000)

      setLaunchStep('input')
      setQuickTextInput('')
      setSelectedFile(null)
      setFilePreviewUrl(null)
      setDraft(null)
      setBatchDrafts(null)
      setDuplicateWarning(null)
      setShowAccountSelector(false)

      if (onSaveSuccess) {
        await onSaveSuccess()
      }
    } catch {
      setLaunchError('Erro de conexão ao salvar lançamentos em lote.')
    } finally {
      savingRef.current = false
      setSavingLaunch(false)
    }
  }

  // Salvar Final do Lançamento no Estado 2 (Revisão)
  async function handleSaveFinalLaunch(forceAllowDuplicate = false) {
    if (savingRef.current) return
    if (!reviewTotal || isNaN(parseFloat(reviewTotal.replace(',', '.')))) {
      setLaunchError('Por favor, informe um valor válido.')
      return
    }

    savingRef.current = true
    setSavingLaunch(true)
    setLaunchError('')

    const parsedTotal = parseFloat(reviewTotal.replace(',', '.'))
    const plan = resolveInstallmentPlan({
      total: parsedTotal,
      installmentTotal: reviewIsInstallment ? parseInt(reviewInstallmentTotal, 10) || 2 : null,
      installmentCurrent: reviewIsInstallment ? parseInt(reviewInstallmentCurrent, 10) || 1 : null,
      installmentAmount: reviewIsInstallment ? parsedTotal : null,
      notes: reviewNotes,
      vendor: reviewVendor,
    })
    const instTotal = plan.installmentTotal
    const instCurrent = plan.installmentCurrent
    const calculatedSubtotal = plan.isMultiInstallment ? (plan.totalPurchaseAmount ?? undefined) : undefined
    const effectiveInstallmentAmount = plan.isMultiInstallment ? (plan.installmentAmount ?? undefined) : undefined
    const effectiveTotal = plan.isMultiInstallment && plan.installmentAmount ? plan.installmentAmount : parsedTotal

    const recPlan = resolveRecurrenceUpdate({
      is_recurring: reviewIsRecurring,
      recurrence_frequency: 'monthly',
      recurrence_next_date: reviewRecurrenceNextDate,
      date: reviewDate,
    })

    let finalNotes = reviewNotes.trim()
    if (reviewIsRecurring && reviewIsEstimated && !finalNotes.includes('[Estimado]')) {
      finalNotes = finalNotes ? `${finalNotes} [Estimado]` : '[Estimado]'
    } else if (!reviewIsEstimated && finalNotes.includes('[Estimado]')) {
      finalNotes = finalNotes.replace('[Estimado]', '').trim()
    }

    try {
      const payload = {
        sourceType: draft?.sourceType || 'manual',
        rawText: draft?.rawText || null,
        originalExtractedData: draft?.originalExtractedData || null,
        allowDuplicate: forceAllowDuplicate,
        receipt: {
          ...(draft?.receipt || {}),
          type: reviewType,
          vendor: reviewVendor.trim() || null,
          total: effectiveTotal,
          installment_amount: effectiveInstallmentAmount,
          subtotal: calculatedSubtotal,
          category: reviewCategory.trim() || null,
          category_id: reviewCategoryId || null,
          account_id: reviewAccountId || null,
          payment_method: reviewPaymentMethod.trim() || null,
          date: reviewDate || null,
          time: reviewTime || null,
          notes: finalNotes || null,
          is_recurring: recPlan.is_recurring,
          recurrence_frequency: recPlan.recurrence_frequency,
          recurrence_next_date: recPlan.recurrence_next_date,
          recurrence_status: recPlan.recurrence_status,
          installment_total: instTotal,
          installment_current: instCurrent,
          items: reviewItems.map((it) => ({
            description: it.description,
            quantity: it.quantity ?? 1,
            unit_price: it.unit_price ?? null,
            total: it.total ?? null,
            category: it.category ?? null,
          })),
        },
      }
      let request: RequestInit
      if (draft?.sourceType === 'image') {
        if (!selectedFile) {
          setLaunchError('Comprovante ausente. Anexe o arquivo novamente.')
          return
        }
        const form = new FormData()
        form.append('payload', JSON.stringify(payload))
        form.append('file', selectedFile)
        request = { method: 'POST', body: form }
      } else {
        request = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
      }
      const response = await fetchWithAuth('/api/transactions', request)
      const data = await response.json()
      if (data.isDuplicate && !forceAllowDuplicate) {
        setDuplicateWarning({ type: data.duplicateType || 'probable',
          message: data.error || 'Lançamento duplicado detectado.', existingTransaction: data.existingTransaction })
        return
      }
      if (!data.ok) {
        setLaunchError(data.error || 'Erro ao registrar lançamento.')
        return
      }

      // Sucesso
      setLaunchSuccessMessage(
        reviewType === 'income' ? 'Receita registrada com sucesso!' : 'Despesa registrada com sucesso!'
      )
      setTimeout(() => setLaunchSuccessMessage(null), 4000)

      setLaunchStep('input')
      setQuickTextInput('')
      setSelectedFile(null)
      setFilePreviewUrl(null)
      setDraft(null)
      setBatchDrafts(null)
      setDuplicateWarning(null)
      setShowAccountSelector(false)

      if (onSaveSuccess) {
        await onSaveSuccess()
      }
    } catch {
      setLaunchError('Erro de conexão ao salvar lançamento.')
    } finally {
      savingRef.current = false
      setSavingLaunch(false)
    }
  }

  // Descartar rascunho / Voltar ao Estado 1 (Entrada)
  function handleDiscardLaunch() {
    setLaunchStep('input')
    setQuickTextInput('')
    setSelectedFile(null)
    setFilePreviewUrl(null)
    setDraft(null)
    setBatchDrafts(null)
    setDuplicateWarning(null)
    setLaunchError('')
    setShowAccountSelector(false)
  }

  return (
    <section className={`space-y-6 pb-12 ${className || ''}`}>
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-[#EBEEF2]">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#111827]">Novo Lançamento</h1>
          <p className="text-xs text-[#6B7280] mt-0.5">
            {launchStep === 'input'
              ? 'Descreva a movimentação ou envie um comprovante.'
              : 'Revise os dados extraídos, valide informações e salve.'}
          </p>
        </div>
        {launchStep === 'review' && (
          <button
            type="button"
            onClick={handleDiscardLaunch}
            disabled={savingLaunch}
            className="self-start sm:self-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#E5E7EB] bg-white text-xs font-medium text-[#6B7280] hover:text-[#111827] shadow-sm transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            Descartar e Voltar
          </button>
        )}
      </div>

      {/* Notificação de Sucesso */}
      {launchSuccessMessage && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl px-4 py-3 text-xs font-medium flex items-center gap-2 shadow-sm animate-in fade-in duration-200">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{launchSuccessMessage}</span>
        </div>
      )}

      {/* Mensagem de Erro */}
      {launchError && (
        <div className="bg-red-50 border border-red-200 text-red-800 rounded-2xl px-4 py-3 text-xs font-medium flex items-center justify-between gap-2 shadow-sm animate-in fade-in duration-200">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{launchError}</span>
          </div>
          <button type="button" onClick={() => setLaunchError('')} className="text-red-500 hover:text-red-700">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ============================================================== */}
      {/* FLUXO ÚNICO - ESTADO 1: ENTRADA (Card Compacto & Clean)        */}
      {/* ============================================================== */}
      {launchStep === 'input' && (
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
            className={`bg-white border rounded-2xl p-5 shadow-xs space-y-4 transition-all ${
              isDraggingFile ? 'border-[#2F68FE] ring-2 ring-[#2F68FE]/20 bg-[#2F68FE]/5' : 'border-[#EBEEF2]'
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
              <label className="text-xs font-semibold text-[#111827] block">O que aconteceu?</label>
              <textarea
                value={quickTextInput}
                onChange={(e) => setQuickTextInput(e.target.value)}
                disabled={interpreting}
                rows={3}
                placeholder="Ex.: Comprei R$ 480 no cartão Inter em 4x"
                className="w-full bg-[#F9FAFB] border border-[#E5E7EB] hover:border-[#D1D5DB] focus:bg-white rounded-xl p-3 text-xs sm:text-sm text-[#111827] placeholder-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#2F68FE]/20 focus:border-[#2F68FE] transition-all resize-none disabled:opacity-50 leading-relaxed"
              />
            </div>

            {/* Badge de Arquivo Anexado (se selecionado) */}
            {selectedFile && (
              <div className="flex items-center justify-between p-2.5 bg-[#F4F5F7] border border-[#E5E7EB] rounded-xl text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="w-4 h-4 text-[#2F68FE] shrink-0" />
                  <span className="font-medium text-[#111827] truncate">{selectedFile.name}</span>
                  <span className="text-[10px] text-[#6B7280] shrink-0">
                    ({(selectedFile.size / 1024).toFixed(0)} KB)
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleRemoveFile}
                  className="p-1 text-[#9CA3AF] hover:text-red-600 rounded-lg hover:bg-white transition-colors"
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
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#E5E7EB] bg-white hover:bg-[#F9FAFB] text-xs font-medium text-[#4B5563] hover:text-[#111827] shadow-2xs transition-all disabled:opacity-50"
              >
                <Paperclip className="w-3.5 h-3.5 text-[#6B7280]" />
                <span>Anexar arquivo</span>
              </button>

              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                disabled={interpreting}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#E5E7EB] bg-white hover:bg-[#F9FAFB] text-xs font-medium text-[#4B5563] hover:text-[#111827] shadow-2xs transition-all disabled:opacity-50"
              >
                <Camera className="w-3.5 h-3.5 text-[#6B7280]" />
                <span>Tirar foto</span>
              </button>

              {!showAccountSelector && !selectedAccountId ? (
                <button
                  type="button"
                  onClick={() => setShowAccountSelector(true)}
                  disabled={interpreting}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#E5E7EB] bg-white hover:bg-[#F9FAFB] text-xs font-medium text-[#4B5563] hover:text-[#111827] shadow-2xs transition-all disabled:opacity-50"
                >
                  <Plus className="w-3.5 h-3.5 text-[#6B7280]" />
                  <span>Vincular conta/cartão</span>
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
                  className="p-2 text-[#9CA3AF] hover:text-[#111827] rounded-xl hover:bg-[#F4F5F7] transition-colors"
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
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-[#2F68FE] hover:bg-[#2557D6] disabled:opacity-50 text-white font-semibold text-xs transition-all shadow-sm active:scale-[0.99]"
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
                className="text-xs text-[#6B7280] hover:text-[#111827] underline underline-offset-4 decoration-[#D1D5DB] hover:decoration-[#111827] transition-colors font-medium py-1"
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
                    onClick={() => {
                      setLaunchStep('review')
                    }}
                    className="px-4 py-1.5 rounded-xl text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-white transition-colors"
                  >
                    Revisar e Continuar
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ============================================================== */}
      {/* FLUXO ÚNICO - ESTADO 2: REVISÃO E SALVAMENTO                   */}
      {/* ============================================================== */}
      {launchStep === 'review' && batchDrafts && batchDrafts.length > 0 && (
        <div className="max-w-3xl mx-auto space-y-6">
          {/* Cabeçalho do Lote */}
          <div className="bg-blue-50/70 border border-blue-200 rounded-2xl p-4 sm:p-5 text-xs text-blue-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
            <div className="flex items-center gap-2.5">
              <Sparkles className="w-5 h-5 text-[#2F68FE] shrink-0" />
              <div>
                <span className="font-bold text-sm block text-[#111827]">
                  {batchDrafts.length} lançamentos identificados
                </span>
                <p className="text-[#4B5563] mt-0.5">
                  Revise e ajuste cada transação individualmente antes de confirmar.
                </p>
              </div>
            </div>
            <div className="text-right sm:text-right border-t sm:border-t-0 pt-2 sm:pt-0 border-blue-200/60">
              <span className="text-[11px] text-[#6B7280] block">Total Geral:</span>
              <span className="text-base font-extrabold text-[#111827]">
                {formatBRL(batchDrafts.reduce((acc, it) => acc + (Number(it.receipt.total) || 0), 0))}
              </span>
            </div>
          </div>

          {/* Lista de Transações em Lote */}
          <div className="space-y-4">
            {batchDrafts.map((item, index) => (
              <div
                key={index}
                className="bg-white border border-[#EBEEF2] rounded-2xl p-5 shadow-sm space-y-4 transition-all hover:border-[#D1D5DB]"
              >
                <div className="flex items-center justify-between border-b border-[#F4F5F7] pb-3">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-[#F4F5F7] text-[#111827] font-bold text-xs flex items-center justify-center border border-[#E5E7EB]">
                      {index + 1}
                    </span>
                    <span className="font-bold text-sm text-[#111827]">
                      {item.receipt.vendor || `Lançamento ${index + 1}`}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-extrabold text-sm text-[#111827]">
                      {formatBRL(item.receipt.total || 0)}
                    </span>
                    {batchDrafts.length > 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          setBatchDrafts(batchDrafts.filter((_, i) => i !== index))
                        }}
                        className="p-1.5 text-[#9CA3AF] hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                        title="Remover este lançamento"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {/* Estabelecimento / Descrição */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-[#111827] flex items-center gap-1">
                      <Store className="w-3 h-3 text-[#6B7280]" />
                      Estabelecimento / Descrição
                    </label>
                    <input
                      type="text"
                      value={item.receipt.vendor || ''}
                      onChange={(e) => {
                        const updated = [...batchDrafts]
                        updated[index].receipt.vendor = e.target.value
                        setBatchDrafts(updated)
                      }}
                      placeholder="Ex: Google One, Combustível..."
                      className="w-full bg-[#F9FAFB] border border-[#E5E7EB] focus:bg-white rounded-xl px-3 py-1.5 text-xs text-[#111827] focus:outline-none focus:border-[#2F68FE]"
                    />
                  </div>

                  {/* Valor */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-[#111827]">
                      Valor (R$)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={item.receipt.total ?? ''}
                      onChange={(e) => {
                        const updated = [...batchDrafts]
                        const val = parseFloat(e.target.value) || 0
                        updated[index].receipt.total = val
                        setBatchDrafts(updated)
                      }}
                      className="w-full bg-[#F9FAFB] border border-[#E5E7EB] focus:bg-white rounded-xl px-3 py-1.5 text-xs font-semibold text-[#111827] focus:outline-none focus:border-[#2F68FE]"
                    />
                  </div>

                  {/* Categoria */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-[#111827] flex items-center gap-1">
                      <Tag className="w-3 h-3 text-[#6B7280]" />
                      Categoria
                    </label>
                    <CategorySelect
                      type={item.receipt.type || 'expense'}
                      value={item.receipt.category_id || null}
                      fallbackName={item.receipt.category || ''}
                      onChange={(id, name) => {
                        const updated = [...batchDrafts]
                        updated[index].receipt.category_id = id
                        updated[index].receipt.category = name
                        setBatchDrafts(updated)
                      }}
                      placeholder="Selecionar categoria..."
                      className="text-xs"
                    />
                  </div>

                  {/* Conta / Cartão */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-[#111827] flex items-center gap-1">
                      <CreditCard className="w-3 h-3 text-[#6B7280]" />
                      Conta / Cartão
                    </label>
                    <AccountSelect
                      accounts={localAccounts as any}
                      value={item.receipt.account_id || null}
                      onChange={(id) => {
                        const updated = [...batchDrafts]
                        updated[index].receipt.account_id = id || null
                        setBatchDrafts(updated)
                      }}
                      onAccountCreated={(newAcc) => {
                        setLocalAccounts((prev) => [...prev, newAcc])
                      }}
                      placeholder="Sem conta vinculada"
                      className="text-xs"
                    />
                  </div>

                  {/* Forma de Pagamento */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-[#111827]">
                      Forma de Pagamento
                    </label>
                    <select
                      value={item.receipt.payment_method || ''}
                      onChange={(e) => {
                        const updated = [...batchDrafts]
                        updated[index].receipt.payment_method = e.target.value || null
                        setBatchDrafts(updated)
                      }}
                      className="w-full bg-[#F9FAFB] border border-[#E5E7EB] focus:bg-white rounded-xl px-3 py-1.5 text-xs text-[#111827] focus:outline-none focus:border-[#2F68FE]"
                    >
                      <option value="">Não especificada</option>
                      <option value="PIX">PIX</option>
                      <option value="Cartão de Crédito">Cartão de Crédito</option>
                      <option value="Cartão de Débito">Cartão de Débito</option>
                      <option value="Dinheiro">Dinheiro</option>
                      <option value="Boleto">Boleto</option>
                      <option value="Transferência">Transferência</option>
                      <option value="Outros">Outros</option>
                    </select>
                  </div>

                  {/* Data */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-[#111827] flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-[#6B7280]" />
                      Data
                    </label>
                    <input
                      type="date"
                      value={item.receipt.date || new Date().toISOString().slice(0, 10)}
                      onChange={(e) => {
                        const updated = [...batchDrafts]
                        updated[index].receipt.date = e.target.value
                        setBatchDrafts(updated)
                      }}
                      className="w-full bg-[#F9FAFB] border border-[#E5E7EB] focus:bg-white rounded-xl px-3 py-1.5 text-xs text-[#111827] focus:outline-none focus:border-[#2F68FE]"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Ações do Lote */}
          <div className="pt-4 border-t border-[#EBEEF2] flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={handleDiscardLaunch}
              disabled={savingLaunch}
              className="px-4 py-2.5 rounded-xl border border-[#E5E7EB] text-[#6B7280] hover:text-[#111827] bg-white text-xs font-medium transition-colors shadow-sm"
            >
              Descartar Todos
            </button>

            <button
              type="button"
              disabled={savingLaunch || batchDrafts.length === 0}
              onClick={handleSaveBatchLaunches}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[#2F68FE] hover:bg-[#2557D6] disabled:opacity-50 text-white font-semibold text-xs transition-colors shadow-sm"
            >
              {savingLaunch ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Salvando Lançamentos...</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>Confirmar Todos ({batchDrafts.length})</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* FLUXO ÚNICO - ESTADO 2: REVISÃO E SALVAMENTO (Único Lançamento)*/}
      {/* ============================================================== */}
      {launchStep === 'review' && !batchDrafts && (
        <div
          className={
            filePreviewUrl
              ? 'grid grid-cols-1 lg:grid-cols-12 gap-6 items-start'
              : 'max-w-2xl mx-auto space-y-6'
          }
        >
          {/* COLUNA ESQUERDA (DESKTOP): Comprovante com Zoom */}
          {filePreviewUrl && (
            <div className="lg:col-span-5 bg-white border border-[#EBEEF2] rounded-2xl p-4 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#111827] flex items-center gap-1.5">
                  <ImageIcon className="w-3.5 h-3.5 text-[#2F68FE]" />
                  Comprovante Anexado
                </span>
                <button
                  type="button"
                  onClick={() => setShowImageZoom(true)}
                  className="text-xs text-[#2F68FE] hover:underline flex items-center gap-1 font-medium"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                  Ampliar
                </button>
              </div>
              <div
                onClick={() => setShowImageZoom(true)}
                className="relative rounded-xl overflow-hidden border border-[#E5E7EB] bg-[#F8FAFC] flex items-center justify-center max-h-[460px] cursor-pointer group"
              >
                <img
                  src={filePreviewUrl}
                  alt="Comprovante"
                  className="object-contain w-full max-h-[460px] rounded-lg transition-transform group-hover:scale-[1.02]"
                />
                <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <span className="bg-white/90 backdrop-blur text-[#111827] text-xs font-medium px-3 py-1.5 rounded-full shadow-md flex items-center gap-1.5">
                    <ZoomIn className="w-3.5 h-3.5" />
                    Ver comprovante em tela cheia
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* COLUNA PRINCIPAL: FORMULÁRIO DE REVISÃO E SALVAMENTO */}
          <div
            className={`${
              filePreviewUrl ? 'lg:col-span-7' : 'w-full'
            } bg-white border border-[#EBEEF2] rounded-2xl p-6 shadow-sm space-y-6`}
          >
            {/* 1. Alerta Contextual de Validação ou Duplicidade */}
            {duplicateWarning && (
              <div
                className={`border rounded-xl p-3.5 text-xs space-y-2 ${
                  duplicateWarning.type === 'exact'
                    ? 'border-red-200 bg-red-50 text-red-900'
                    : 'border-amber-200 bg-amber-50 text-amber-900'
                }`}
              >
                <div className="flex items-center gap-1.5 font-semibold">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>
                    {duplicateWarning.type === 'exact'
                      ? 'Duplicata exata detectada no banco de dados'
                      : 'Aviso: possível transação duplicada detectada'}
                  </span>
                </div>
                <p className="leading-relaxed text-[#4B5563]">{duplicateWarning.message}</p>
                {duplicateWarning.existingTransaction && (
                  <div className="bg-white/80 border border-black/5 rounded-lg p-2 text-[11px] text-[#374151] space-y-0.5">
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
            )}

            {reviewNeedsReview && (
              <div className="border border-amber-200 bg-amber-50/80 rounded-xl p-3.5 text-xs text-amber-900 space-y-1.5">
                <div className="flex items-center gap-1.5 font-semibold text-amber-900">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>Requer Atenção: verifique os dados antes de salvar</span>
                </div>
                {reviewValidationReasons.length > 0 && (
                  <div className="space-y-1 pl-5">
                    {reviewValidationReasons.map((reason, idx) => (
                      <div key={idx} className="text-[11px] text-[#4B5563] list-disc">
                        • {reason}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {!reviewNeedsReview && draft && !duplicateWarning && (
              <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-xl w-fit">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>Lançamento validado e consistente</span>
              </div>
            )}

            {/* 2. Valor em Destaque & Tipo (Despesa / Receita) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#6B7280] uppercase tracking-wider">
                  Valor do Lançamento
                </span>

                {/* Alternador Despesa / Receita */}
                <div className="flex items-center bg-[#F4F5F7] p-1 rounded-xl border border-[#E5E7EB]">
                  <button
                    type="button"
                    onClick={() => setReviewType('expense')}
                    className={`px-3 py-1 rounded-lg text-xs transition-all flex items-center gap-1.5 ${
                      reviewType === 'expense'
                        ? 'bg-red-50 text-red-700 border border-red-200 shadow-sm font-semibold'
                        : 'text-[#6B7280] hover:text-[#111827] font-medium'
                    }`}
                  >
                    <ArrowDownLeft className="w-3.5 h-3.5 text-red-600" />
                    Despesa
                  </button>
                  <button
                    type="button"
                    onClick={() => setReviewType('income')}
                    className={`px-3 py-1 rounded-lg text-xs transition-all flex items-center gap-1.5 ${
                      reviewType === 'income'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-sm font-semibold'
                        : 'text-[#6B7280] hover:text-[#111827] font-medium'
                    }`}
                  >
                    <ArrowUpRight className="w-3.5 h-3.5 text-emerald-600" />
                    Receita
                  </button>
                </div>
              </div>

              {/* Campo de Valor em Destaque */}
              <div className="flex items-center gap-2 p-3 bg-[#F9FAFB] border border-[#E5E7EB] rounded-2xl focus-within:border-[#2F68FE] focus-within:ring-2 focus-within:ring-[#2F68FE]/20 transition-all">
                <span className="text-2xl sm:text-3xl font-bold text-[#6B7280] pl-2">R$</span>
                <input
                  type="text"
                  value={reviewTotal}
                  onChange={(e) => setReviewTotal(e.target.value)}
                  placeholder="0,00"
                  className="w-full bg-transparent text-3xl sm:text-4xl font-bold tracking-tight text-[#111827] focus:outline-none placeholder-[#D1D5DB]"
                />
              </div>
            </div>

            {/* 3. Campos Vitais */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Estabelecimento / Fonte */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#111827] flex items-center gap-1.5">
                  <Store className="w-3.5 h-3.5 text-[#6B7280]" />
                  {reviewType === 'income' ? 'Fonte / Pagador' : 'Estabelecimento'}
                </label>
                <input
                  type="text"
                  value={reviewVendor}
                  onChange={(e) => setReviewVendor(e.target.value)}
                  placeholder={
                    reviewType === 'income' ? 'Empresa, cliente ou pagador' : 'Ex: Carrefour, Padaria, Uber...'
                  }
                  className="w-full bg-[#F9FAFB] border border-[#E5E7EB] hover:border-[#D1D5DB] focus:bg-white rounded-xl px-3 py-2 text-xs text-[#111827] placeholder-[#9CA3AF] focus:outline-none focus:border-[#2F68FE] transition-all"
                />
              </div>

              {/* Categoria Estruturada */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#111827] flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5 text-[#6B7280]" />
                    Categoria
                  </span>
                  {reviewNeedsReview && !reviewCategoryId && (
                    <span className="text-[10px] text-amber-600 font-semibold">Requer conferência</span>
                  )}
                </label>
                <CategorySelect
                  type={reviewType}
                  value={reviewCategoryId}
                  fallbackName={reviewCategory}
                  onChange={(id, name) => {
                    setReviewCategoryId(id)
                    setReviewCategory(name)
                  }}
                  highlightReview={
                    reviewNeedsReview && (!reviewCategoryId || reviewCategory.toLowerCase() === 'outros')
                  }
                  placeholder={
                    reviewType === 'income'
                      ? 'Selecionar categoria de receita...'
                      : 'Selecionar categoria de despesa...'
                  }
                />
              </div>

              {/* Conta / Cartão */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#111827] flex items-center gap-1.5">
                  <CreditCard className="w-3.5 h-3.5 text-[#6B7280]" />
                  Conta / Cartão
                </label>
                <AccountSelect
                  accounts={localAccounts as any}
                  value={reviewAccountId || null}
                  onChange={(id) => setReviewAccountId(id || '')}
                  onAccountCreated={(newAcc) => {
                    setLocalAccounts((prev) => [...prev, newAcc])
                  }}
                  placeholder="Sem conta vinculada (Geral)"
                />
              </div>

              {/* Forma de Pagamento */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#111827] flex items-center gap-1.5">
                  <CreditCard className="w-3.5 h-3.5 text-[#6B7280]" />
                  Forma de Pagamento
                </label>
                <select
                  value={reviewPaymentMethod}
                  onChange={(e) => setReviewPaymentMethod(e.target.value)}
                  className="w-full bg-[#F9FAFB] border border-[#E5E7EB] hover:border-[#D1D5DB] focus:bg-white rounded-xl px-3 py-2 text-xs text-[#111827] focus:outline-none focus:border-[#2F68FE] transition-all"
                >
                  <option value="">Não especificada</option>
                  <option value="PIX">PIX</option>
                  <option value="Cartão de Crédito">Cartão de Crédito</option>
                  <option value="Cartão de Débito">Cartão de Débito</option>
                  <option value="Dinheiro">Dinheiro</option>
                  <option value="Boleto">Boleto</option>
                  <option value="Transferência">Transferência</option>
                  <option value="Outros">Outros</option>
                </select>
              </div>

              {/* Data e Hora */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#111827] flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-[#6B7280]" />
                  Data
                </label>
                <input
                  type="date"
                  value={reviewDate}
                  onChange={(e) => setReviewDate(e.target.value)}
                  className="w-full bg-[#F9FAFB] border border-[#E5E7EB] hover:border-[#D1D5DB] focus:bg-white rounded-xl px-3 py-2 text-xs text-[#111827] focus:outline-none focus:border-[#2F68FE] transition-all"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#111827] flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-[#6B7280]" />
                  Hora
                </label>
                <input
                  type="time"
                  value={reviewTime}
                  onChange={(e) => setReviewTime(e.target.value)}
                  className="w-full bg-[#F9FAFB] border border-[#E5E7EB] hover:border-[#D1D5DB] focus:bg-white rounded-xl px-3 py-2 text-xs text-[#111827] focus:outline-none focus:border-[#2F68FE] transition-all"
                />
              </div>
            </div>

            {/* 4. Detalhes sob Demanda */}
            <div className="space-y-4 pt-3 border-t border-[#EBEEF2]">
              {/* Resumo de Itens */}
              {reviewItems.length > 0 ? (
                <div className="flex items-center justify-between p-3.5 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB]">
                  <div className="flex items-center gap-2.5">
                    <Package className="w-4 h-4 text-[#2F68FE] shrink-0" />
                    <span className="text-xs font-medium text-[#111827]">
                      {reviewItems.length} {reviewItems.length === 1 ? 'item extraído' : 'itens extraídos'} ·{' '}
                      {formatBRL(reviewItems.reduce((acc, it) => acc + (Number(it.total) || 0), 0))}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowItemsDrawer(true)}
                    className="text-xs font-semibold text-[#2F68FE] hover:underline flex items-center gap-1"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    Ver itens
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[#6B7280]">Nenhum item individual detalhado</span>
                  <button
                    type="button"
                    onClick={() => setShowItemsDrawer(true)}
                    className="text-xs text-[#2F68FE] hover:underline flex items-center gap-1 font-medium"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Adicionar itens (opcional)
                  </button>
                </div>
              )}

              {/* Recorrência e Parcelamento */}
              <div className="space-y-2">
                <span className="text-[11px] font-medium text-[#6B7280] block">Recorrência & Parcelamento:</span>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const nextVal = !reviewIsRecurring
                      setReviewIsRecurring(nextVal)
                      if (nextVal) setReviewIsInstallment(false)
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs transition-all flex items-center gap-1.5 border ${
                      reviewIsRecurring
                        ? 'bg-[#2F68FE]/10 text-[#2F68FE] border-[#2F68FE]/30 shadow-sm font-semibold'
                        : 'bg-white text-[#6B7280] border-[#E5E7EB] hover:text-[#111827] font-medium'
                    }`}
                  >
                    <Repeat className="w-3.5 h-3.5" />
                    Recorrente Mensal
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const nextVal = !reviewIsInstallment
                      setReviewIsInstallment(nextVal)
                      if (nextVal) setReviewIsRecurring(false)
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs transition-all flex items-center gap-1.5 border ${
                      reviewIsInstallment
                        ? 'bg-[#2F68FE]/10 text-[#2F68FE] border-[#2F68FE]/30 shadow-sm font-semibold'
                        : 'bg-white text-[#6B7280] border-[#E5E7EB] hover:text-[#111827] font-medium'
                    }`}
                  >
                    <FileText className="w-3.5 h-3.5" />
                    Compra Parcelada
                  </button>
                </div>

                {/* Expansão Recorrência */}
                {reviewIsRecurring && (
                  <div className="p-3 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl text-xs space-y-3 animate-in fade-in duration-150">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] text-[#4B5563] block mb-1 font-medium">Dia do Vencimento:</label>
                        <input
                          type="number"
                          min="1"
                          max="31"
                          placeholder="Ex: 10, 25"
                          value={reviewRecurrenceDueDay}
                          onChange={(e) => {
                            const dayVal = e.target.value
                            setReviewRecurrenceDueDay(dayVal)
                            const num = parseInt(dayVal, 10)
                            if (num >= 1 && num <= 31) {
                              const base = reviewDate ? new Date(reviewDate + 'T12:00:00') : new Date()
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
                              setReviewRecurrenceNextDate(
                                `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
                              )
                            }
                          }}
                          className="w-full bg-white border border-[#E5E7EB] rounded-lg px-2.5 py-1 text-xs text-[#111827] focus:outline-none focus:border-[#2F68FE]"
                        />
                      </div>

                      <div>
                        <label className="text-[11px] text-[#4B5563] block mb-1 font-medium">
                          Próxima Data Prevista:
                        </label>
                        <input
                          type="date"
                          value={reviewRecurrenceNextDate}
                          onChange={(e) => {
                            setReviewRecurrenceNextDate(e.target.value)
                            if (e.target.value) {
                              setReviewRecurrenceDueDay(String(parseInt(e.target.value.slice(8, 10), 10)))
                            }
                          }}
                          className="w-full bg-white border border-[#E5E7EB] rounded-lg px-2.5 py-1 text-xs text-[#111827] focus:outline-none focus:border-[#2F68FE]"
                        />
                      </div>
                    </div>

                    <label className="flex items-center gap-2 text-xs text-[#374151] cursor-pointer pt-1 border-t border-[#E5E7EB]/60 select-none">
                      <input
                        type="checkbox"
                        checked={reviewIsEstimated}
                        onChange={(e) => setReviewIsEstimated(e.target.checked)}
                        className="rounded border-[#D1D5DB] text-[#2F68FE] focus:ring-[#2F68FE] w-3.5 h-3.5 accent-[#2F68FE]"
                      />
                      <span className="font-medium">Valor estimado (varia todo mês, ex: água, luz, energia)</span>
                    </label>
                    <span className="text-[10px] text-[#9CA3AF] block">
                      Quando o valor real for lançado no mês, a previsão será automaticamente atualizada sem duplicar.
                    </span>
                  </div>
                )}

                {/* Expansão Parcelamento */}
                {reviewIsInstallment && (
                  <div className="p-3 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl text-xs space-y-2 animate-in fade-in duration-150">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] text-[#6B7280] block mb-1">Parcela Atual:</label>
                        <input
                          type="number"
                          min="1"
                          value={reviewInstallmentCurrent}
                          onChange={(e) => setReviewInstallmentCurrent(e.target.value)}
                          className="w-full bg-white border border-[#E5E7EB] rounded-lg px-2.5 py-1 text-xs text-[#111827] focus:outline-none focus:border-[#2F68FE]"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] text-[#6B7280] block mb-1">Total de Parcelas:</label>
                        <input
                          type="number"
                          min="2"
                          value={reviewInstallmentTotal}
                          onChange={(e) => setReviewInstallmentTotal(e.target.value)}
                          className="w-full bg-white border border-[#E5E7EB] rounded-lg px-2.5 py-1 text-xs text-[#111827] focus:outline-none focus:border-[#2F68FE]"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Observações */}
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-[#6B7280] block">Observações (Opcional):</label>
                <input
                  type="text"
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  placeholder="Anotações adicionais, tags ou detalhes..."
                  className="w-full bg-[#F9FAFB] border border-[#E5E7EB] hover:border-[#D1D5DB] focus:bg-white rounded-xl px-3 py-2 text-xs text-[#111827] placeholder-[#9CA3AF] focus:outline-none focus:border-[#2F68FE] transition-all"
                />
              </div>
            </div>

            {/* 5. Botões de Ação */}
            <div className="pt-4 border-t border-[#EBEEF2] flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={handleDiscardLaunch}
                disabled={savingLaunch}
                className="px-4 py-2.5 rounded-xl border border-[#E5E7EB] text-[#6B7280] hover:text-[#111827] bg-white text-xs font-medium transition-colors shadow-sm"
              >
                Descartar
              </button>

              <div className="flex items-center gap-2">
                {duplicateWarning?.type === 'probable' && (
                  <button
                    type="button"
                    disabled={savingLaunch}
                    onClick={() => handleSaveFinalLaunch(true)}
                    className="px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-medium text-xs transition-colors shadow-sm"
                  >
                    Salvar Mesmo Assim
                  </button>
                )}
                <button
                  type="button"
                  disabled={savingLaunch || !reviewTotal}
                  onClick={() => handleSaveFinalLaunch(false)}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[#2F68FE] hover:bg-[#2557D6] disabled:opacity-50 text-white font-medium text-xs transition-colors shadow-sm"
                >
                  {savingLaunch ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Salvando...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Salvar Lançamento</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DRAWER LATERAL DE ITENS */}
      {showItemsDrawer && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex justify-end animate-in fade-in duration-200">
          <div className="w-full max-w-lg bg-white h-full shadow-2xl flex flex-col">
            <div className="p-4 sm:p-5 border-b border-[#EBEEF2] flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-[#111827]">Itens do Lançamento</h2>
                <p className="text-xs text-[#6B7280] mt-0.5">
                  {reviewItems.length} {reviewItems.length === 1 ? 'item listado' : 'itens listados'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowItemsDrawer(false)}
                className="p-1.5 rounded-xl text-[#6B7280] hover:text-[#111827] hover:bg-[#F4F5F7] transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
              {reviewItems.length === 0 ? (
                <div className="text-center py-8 text-xs text-[#6B7280]">
                  Nenhum item adicionado ainda. Clique abaixo para começar.
                </div>
              ) : (
                reviewItems.map((item, index) => (
                  <div key={index} className="p-3.5 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl space-y-3 text-xs">
                    <div className="flex items-start justify-between gap-2">
                      <input
                        type="text"
                        value={item.description}
                        onChange={(e) => {
                          const updated = [...reviewItems]
                          updated[index] = { ...updated[index], description: e.target.value }
                          setReviewItems(updated)
                        }}
                        placeholder="Descrição do produto ou serviço"
                        className="flex-1 bg-white border border-[#E5E7EB] rounded-lg px-2.5 py-1.5 text-xs text-[#111827] focus:outline-none focus:border-[#2F68FE]"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setReviewItems(reviewItems.filter((_, i) => i !== index))
                        }}
                        className="p-1.5 text-[#9CA3AF] hover:text-red-600 transition-colors"
                        title="Remover item"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="text-[10px] text-[#6B7280] block mb-0.5">Qtd:</label>
                        <input
                          type="number"
                          step="any"
                          value={item.quantity ?? 1}
                          onChange={(e) => {
                            const updated = [...reviewItems]
                            const qty = parseFloat(e.target.value) || 1
                            const unit = item.unit_price || 0
                            updated[index] = {
                              ...updated[index],
                              quantity: qty,
                              total: unit * qty,
                            }
                            setReviewItems(updated)
                          }}
                          className="w-full bg-white border border-[#E5E7EB] rounded-lg px-2 py-1 text-xs text-[#111827] focus:outline-none focus:border-[#2F68FE]"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-[#6B7280] block mb-0.5">Unitário:</label>
                        <input
                          type="number"
                          step="0.01"
                          value={item.unit_price ?? ''}
                          onChange={(e) => {
                            const updated = [...reviewItems]
                            const unit = parseFloat(e.target.value) || 0
                            const qty = item.quantity || 1
                            updated[index] = {
                              ...updated[index],
                              unit_price: unit,
                              total: unit * qty,
                            }
                            setReviewItems(updated)
                          }}
                          className="w-full bg-white border border-[#E5E7EB] rounded-lg px-2 py-1 text-xs text-[#111827] focus:outline-none focus:border-[#2F68FE]"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-[#6B7280] block mb-0.5">Total:</label>
                        <input
                          type="number"
                          step="0.01"
                          value={item.total ?? ''}
                          onChange={(e) => {
                            const updated = [...reviewItems]
                            updated[index] = {
                              ...updated[index],
                              total: parseFloat(e.target.value) || 0,
                            }
                            setReviewItems(updated)
                          }}
                          className="w-full bg-white border border-[#E5E7EB] rounded-lg px-2 py-1 text-xs font-semibold text-[#111827] focus:outline-none focus:border-[#2F68FE]"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] text-[#6B7280] block mb-0.5">Categoria do Item:</label>
                      <input
                        type="text"
                        value={item.category || ''}
                        onChange={(e) => {
                          const updated = [...reviewItems]
                          updated[index] = { ...updated[index], category: e.target.value }
                          setReviewItems(updated)
                        }}
                        placeholder="Ex: Laticínios, Limpeza..."
                        className="w-full bg-white border border-[#E5E7EB] rounded-lg px-2.5 py-1 text-xs text-[#111827] focus:outline-none focus:border-[#2F68FE]"
                      />
                    </div>
                  </div>
                ))
              )}

              <button
                type="button"
                onClick={() => {
                  setReviewItems([
                    ...reviewItems,
                    {
                      description: '',
                      quantity: 1,
                      unit_price: null,
                      total: null,
                      category: '',
                    },
                  ])
                }}
                className="w-full py-2.5 rounded-xl border border-dashed border-[#D1D5DB] hover:border-[#2F68FE] text-xs font-semibold text-[#2F68FE] hover:bg-[#2F68FE]/5 transition-all flex items-center justify-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                Adicionar Novo Item
              </button>
            </div>

            <div className="p-4 sm:p-5 border-t border-[#EBEEF2] bg-[#F9FAFB] flex items-center justify-between">
              <div>
                <span className="text-[11px] text-[#6B7280] block">Soma dos Itens:</span>
                <span className="text-sm font-bold text-[#111827]">
                  {formatBRL(reviewItems.reduce((acc, it) => acc + (Number(it.total) || 0), 0))}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowItemsDrawer(false)}
                className="px-5 py-2 rounded-xl bg-[#2F68FE] hover:bg-[#2557D6] text-white text-xs font-semibold shadow-sm transition-colors"
              >
                Concluir e Voltar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE ZOOM DO COMPROVANTE */}
      {showImageZoom && filePreviewUrl && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="relative max-w-4xl w-full max-h-[90vh] flex flex-col items-center">
            <button
              type="button"
              onClick={() => setShowImageZoom(false)}
              className="absolute -top-12 right-0 p-2 text-white/80 hover:text-white bg-black/40 hover:bg-black/60 rounded-full transition-colors"
              title="Fechar zoom"
            >
              <X className="w-6 h-6" />
            </button>
            <img
              src={filePreviewUrl}
              alt="Comprovante em Alta Resolução"
              className="max-w-full max-h-[85vh] object-contain rounded-2xl shadow-2xl border border-white/10"
            />
          </div>
        </div>
      )}
    </section>
  )
}
