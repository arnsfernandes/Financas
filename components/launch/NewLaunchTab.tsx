'use client'

import React, { useState, useRef } from 'react'
import {
  ChevronLeft,
  CheckCircle2,
  AlertCircle,
  X,
  ZoomIn,
  Image as ImageIcon,
} from 'lucide-react'
import type { Receipt } from '@/lib/schema'
import { resolveInstallmentPlan, type InstallmentDateAnchor } from '@/lib/installments'
import { resolveRecurrenceUpdate } from '@/lib/recurrence'
import { useTelegramWebApp } from '@/lib/useTelegramWebApp'
import { LaunchInputCard } from './LaunchInputCard'
import { BatchReviewSection } from './BatchReviewSection'
import { SingleReviewForm } from './SingleReviewForm'
import { ItemsDrawer } from './ItemsDrawer'

export interface AccountOption {
  id: string
  name: string
  type: string
  institution?: string | null
  active?: boolean
  created_at?: string
}

export function getCardPaymentMethod(accountId?: string | null, accounts: AccountOption[] = []): string | null {
  if (!accountId) return null
  const account = accounts.find((a) => a.id === accountId)
  if (!account) return null
  if (account.type === 'credit_card') return 'Cartão de Crédito'
  if (account.type === 'debit_card') return 'Cartão de Débito'
  return null
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
    receipt: Receipt
    sourceType: 'text' | 'image'
    rawText: string | null
    originalExtractedData: Record<string, any>
  } | null>(null)
  // Estado para Múltiplas Transações em Lote
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
  const [reviewInstallmentDateAnchor, setReviewInstallmentDateAnchor] = useState<InstallmentDateAnchor>('purchase_date')
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
  const [showMoreDetails, setShowMoreDetails] = useState<boolean>(false)

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
      setDraft({
        receipt: data.receipt,
        sourceType: data.sourceType,
        rawText: data.rawText || null,
        originalExtractedData: data.originalExtractedData,
      })
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
      setReviewInstallmentDateAnchor(data.receipt.installment_date_anchor || 'purchase_date')
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

  // Ação secundária: Preencher manualmente
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
    setReviewInstallmentDateAnchor('purchase_date')
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
        items: batchDrafts.map((item) => {
          const effectivePm =
            getCardPaymentMethod(item.receipt.account_id, localAccounts) ||
            item.receipt.payment_method ||
            null
          return {
            sourceType: item.sourceType,
            rawText: item.rawText,
            originalExtractedData: item.originalExtractedData,
            receipt: {
              ...item.receipt,
              payment_method: effectivePm,
            },
          }
        }),
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
    const isManualFlow = !draft
    const effectiveAnchor: InstallmentDateAnchor = isManualFlow
      ? 'purchase_date'
      : (draft?.receipt?.installment_date_anchor || reviewInstallmentDateAnchor || 'purchase_date')

    const plan = resolveInstallmentPlan({
      total: parsedTotal,
      installmentTotal: reviewIsInstallment ? parseInt(reviewInstallmentTotal, 10) || 2 : null,
      installmentCurrent: reviewIsInstallment ? parseInt(reviewInstallmentCurrent, 10) || 1 : null,
      installmentAmount: reviewIsInstallment ? parsedTotal : null,
      installmentDateAnchor: reviewIsInstallment ? effectiveAnchor : undefined,
      notes: reviewNotes,
      vendor: reviewVendor,
      rawText: draft?.rawText || null,
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

    const effectivePaymentMethod =
      getCardPaymentMethod(reviewAccountId, localAccounts) ||
      reviewPaymentMethod.trim() ||
      null

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
          payment_method: effectivePaymentMethod,
          date: reviewDate || null,
          time: reviewTime || null,
          notes: finalNotes || null,
          is_recurring: recPlan.is_recurring,
          recurrence_frequency: recPlan.recurrence_frequency,
          recurrence_next_date: recPlan.recurrence_next_date,
          recurrence_status: recPlan.recurrence_status,
          installment_total: instTotal,
          installment_current: instCurrent,
          installment_date_anchor: plan.installmentDateAnchor,
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
        setDuplicateWarning({
          type: data.duplicateType || 'probable',
          message: data.error || 'Lançamento duplicado detectado.',
          existingTransaction: data.existingTransaction,
        })
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
      <div className="hidden md:flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-[#EBEEF2]">
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

      {/* ESTADO 1: ENTRADA */}
      {launchStep === 'input' && (
        <LaunchInputCard
          quickTextInput={quickTextInput}
          setQuickTextInput={setQuickTextInput}
          selectedFile={selectedFile}
          filePreviewUrl={filePreviewUrl}
          isDraggingFile={isDraggingFile}
          setIsDraggingFile={setIsDraggingFile}
          interpreting={interpreting}
          selectedAccountId={selectedAccountId}
          setSelectedAccountId={setSelectedAccountId}
          showAccountSelector={showAccountSelector}
          setShowAccountSelector={setShowAccountSelector}
          localAccounts={localAccounts}
          setLocalAccounts={setLocalAccounts}
          fileInputRef={fileInputRef}
          cameraInputRef={cameraInputRef}
          handleFileSelected={handleFileSelected}
          handleRemoveFile={handleRemoveFile}
          handleUnifiedSubmit={handleUnifiedSubmit}
          handleStartManual={handleStartManual}
          duplicateWarning={duplicateWarning}
          setDuplicateWarning={setDuplicateWarning}
          onReviewDuplicate={() => setLaunchStep('review')}
        />
      )}

      {/* ESTADO 2: REVISÃO DE LOTE */}
      {launchStep === 'review' && batchDrafts && batchDrafts.length > 0 && (
        <BatchReviewSection
          batchDrafts={batchDrafts}
          setBatchDrafts={setBatchDrafts}
          localAccounts={localAccounts}
          setLocalAccounts={setLocalAccounts}
          savingLaunch={savingLaunch}
          onDiscard={handleDiscardLaunch}
          onSaveBatch={handleSaveBatchLaunches}
        />
      )}

      {/* ESTADO 2: REVISÃO DE LANÇAMENTO ÚNICO */}
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
            } bg-white border border-[#EBEEF2] rounded-2xl p-6 shadow-sm`}
          >
            {SingleReviewForm({
              draft,
              duplicateWarning,
              reviewNeedsReview,
              reviewValidationReasons,
              reviewType,
              setReviewType,
              reviewTotal,
              setReviewTotal,
              reviewVendor,
              setReviewVendor,
              reviewCategory,
              setReviewCategory,
              reviewCategoryId,
              setReviewCategoryId,
              reviewAccountId,
              setReviewAccountId,
              reviewPaymentMethod,
              setReviewPaymentMethod,
              localAccounts,
              setLocalAccounts,
              reviewDate,
              setReviewDate,
              reviewTime,
              setReviewTime,
              reviewItems,
              setShowItemsDrawer,
              reviewIsRecurring,
              setReviewIsRecurring,
              reviewRecurrenceDueDay,
              setReviewRecurrenceDueDay,
              reviewRecurrenceNextDate,
              setReviewRecurrenceNextDate,
              reviewIsEstimated,
              setReviewIsEstimated,
              reviewIsInstallment,
              setReviewIsInstallment,
              reviewInstallmentCurrent,
              setReviewInstallmentCurrent,
              reviewInstallmentTotal,
              setReviewInstallmentTotal,
              reviewNotes,
              setReviewNotes,
              showMoreDetails,
              setShowMoreDetails,
              savingLaunch,
              handleDiscardLaunch,
              handleSaveFinalLaunch,
            })}
          </div>
        </div>
      )}

      {/* DRAWER LATERAL DE ITENS */}
      <ItemsDrawer
        showItemsDrawer={showItemsDrawer}
        setShowItemsDrawer={setShowItemsDrawer}
        reviewItems={reviewItems}
        setReviewItems={setReviewItems}
      />

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
