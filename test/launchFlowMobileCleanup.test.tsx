import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { LaunchInputCard } from '@/components/launch/LaunchInputCard'
import { SingleReviewForm } from '@/components/launch/SingleReviewForm'
import { CategorySelect } from '@/components/categories/CategorySelect'
import { AccountSelect } from '@/components/accounts/AccountSelect'
import type { AccountOption } from '@/components/launch/NewLaunchTab'
import type { Category } from '@/lib/schema'

// Mock useTelegramWebApp
vi.mock('@/lib/useTelegramWebApp', () => ({
  useTelegramWebApp: () => ({
    fetchWithAuth: vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ ok: true, categories: [] }),
    }),
  }),
}))

const mockAccounts: AccountOption[] = [
  { id: 'acc-1', name: 'Inter', type: 'credit_card', institution: 'Banco Inter' },
  { id: 'acc-2', name: 'Nubank', type: 'bank_account', institution: 'Nu Pagamentos' },
  { id: 'acc-3', name: 'Carteira', type: 'cash' },
]

describe('Launch & IA Clean Theme, Time Removal, and Clean Account Names', () => {
  it('renders LaunchInputCard in light theme without dark backgrounds and with clean Vincular Conta button', () => {
    const html = renderToStaticMarkup(
      <LaunchInputCard
        quickTextInput=""
        setQuickTextInput={vi.fn()}
        selectedFile={null}
        filePreviewUrl={null}
        isDraggingFile={false}
        setIsDraggingFile={vi.fn()}
        interpreting={false}
        selectedAccountId=""
        setSelectedAccountId={vi.fn()}
        showAccountSelector={false}
        setShowAccountSelector={vi.fn()}
        localAccounts={mockAccounts}
        setLocalAccounts={vi.fn()}
        fileInputRef={{ current: null } as any}
        cameraInputRef={{ current: null } as any}
        handleFileSelected={vi.fn()}
        handleRemoveFile={vi.fn()}
        handleUnifiedSubmit={vi.fn().mockResolvedValue(undefined)}
        handleStartManual={vi.fn()}
        duplicateWarning={null}
        setDuplicateWarning={vi.fn()}
        onReviewDuplicate={vi.fn()}
      />
    )

    // Verify Light theme classes
    expect(html).toContain('bg-white')
    expect(html).not.toContain('bg-[#141415]')
    expect(html).not.toContain('bg-[#1C1C1E]')

    // Verify "Vincular conta" action text
    expect(html).toContain('Vincular conta')
  })

  it('renders SingleReviewForm with only Date input and no Time input', () => {
    const html = renderToStaticMarkup(
      <SingleReviewForm
        draft={null}
        duplicateWarning={null}
        reviewNeedsReview={false}
        reviewValidationReasons={[]}
        reviewType="expense"
        setReviewType={vi.fn()}
        reviewTotal="150,00"
        setReviewTotal={vi.fn()}
        reviewVendor="Supermercado"
        setReviewVendor={vi.fn()}
        reviewCategory="Alimentação"
        setReviewCategory={vi.fn()}
        reviewCategoryId="cat-1"
        setReviewCategoryId={vi.fn()}
        reviewAccountId="acc-1"
        setReviewAccountId={vi.fn()}
        reviewPaymentMethod="Cartão de Crédito"
        setReviewPaymentMethod={vi.fn()}
        localAccounts={mockAccounts}
        setLocalAccounts={vi.fn()}
        reviewDate="2026-10-02"
        setReviewDate={vi.fn()}
        reviewTime="14:30"
        setReviewTime={vi.fn()}
        reviewItems={[]}
        setShowItemsDrawer={vi.fn()}
        reviewIsRecurring={false}
        setReviewIsRecurring={vi.fn()}
        reviewRecurrenceDueDay=""
        setReviewRecurrenceDueDay={vi.fn()}
        reviewRecurrenceNextDate=""
        setReviewRecurrenceNextDate={vi.fn()}
        reviewIsEstimated={false}
        setReviewIsEstimated={vi.fn()}
        reviewIsInstallment={false}
        setReviewIsInstallment={vi.fn()}
        reviewInstallmentCurrent="1"
        setReviewInstallmentCurrent={vi.fn()}
        reviewInstallmentTotal="2"
        setReviewInstallmentTotal={vi.fn()}
        reviewNotes=""
        setReviewNotes={vi.fn()}
        savingLaunch={false}
        handleDiscardLaunch={vi.fn()}
        handleSaveFinalLaunch={vi.fn().mockResolvedValue(undefined)}
      />
    )

    // Verify Date input is present
    expect(html).toContain('type="date"')
    // Verify Time input is absent
    expect(html).not.toContain('type="time"')
  })

  it('renders AccountSelect without parenthesized type annotations', () => {
    const html = renderToStaticMarkup(
      <AccountSelect
        accounts={mockAccounts as any}
        value="acc-1"
        onChange={vi.fn()}
      />
    )

    // Account name should be clean
    expect(html).toContain('Inter')
    // No "(Cartão de Crédito)" or "(Crédito)" in parenthesized form
    expect(html).not.toContain('(Cartão de Crédito)')
    expect(html).not.toContain('(Conta Corrente)')
    expect(html).not.toContain('(Dinheiro)')
  })
})
