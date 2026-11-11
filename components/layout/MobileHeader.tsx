'use client'

import React from 'react'
import { Search, Smartphone } from 'lucide-react'
import type { TabType } from '@/app/page'

export interface MobileHeaderProps {
  setActiveTab?: (tab: TabType) => void
  mobileMenuOpen?: boolean
  setMobileMenuOpen?: (open: boolean | ((prev: boolean) => boolean)) => void
  activeTabTitle?: string
  /** Abre a configuração de Atalhos & Siri (no celular o menu lateral não aparece) */
  onOpenShortcuts?: () => void
}

export function MobileHeader({
  setActiveTab,
  onOpenShortcuts,
}: MobileHeaderProps) {
  return (
    <header className="md:hidden flex items-center justify-between px-4 pt-[max(0.6rem,env(safe-area-inset-top))] pb-1 bg-[#F7F8FA] select-none">
      <div className="flex items-center gap-2">
        <h1 className="font-semibold text-2xl tracking-tight text-[#0F172A]">
          Finanças
        </h1>
      </div>

      <div className="flex items-center gap-2">
      {onOpenShortcuts && (
        <button
          type="button"
          onClick={onOpenShortcuts}
          className="h-9 px-3 rounded-full bg-[#EBF2FF] hover:bg-[#DCE8FF] active:scale-95 flex items-center gap-1.5 text-[#2F68FE] text-xs font-semibold transition-all cursor-pointer shadow-xs"
          title="Atalhos & Siri do iPhone"
          aria-label="Atalhos e Siri do iPhone"
        >
          <Smartphone className="w-4 h-4 stroke-[2]" />
          <span>Atalhos</span>
        </button>
      )}
      {/* Ícone de busca circular discreto conforme a referência */}
      <button
        type="button"
        onClick={() => setActiveTab?.('transactions')}
        className="w-9 h-9 rounded-full bg-[#F2F4F7] hover:bg-[#E4E7EC] active:scale-95 flex items-center justify-center text-[#667085] transition-all cursor-pointer shadow-xs"
        title="Buscar lançamentos"
        aria-label="Buscar lançamentos"
      >
        <Search className="w-4 h-4 stroke-[2]" />
      </button>
      </div>
    </header>
  )
}


