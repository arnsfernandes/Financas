'use client'

import React from 'react'
import { Search } from 'lucide-react'
import type { TabType } from '@/app/page'

export interface MobileHeaderProps {
  setActiveTab?: (tab: TabType) => void
  mobileMenuOpen?: boolean
  setMobileMenuOpen?: (open: boolean | ((prev: boolean) => boolean)) => void
  activeTabTitle?: string
}

export function MobileHeader({
  setActiveTab,
}: MobileHeaderProps) {
  return (
    <header className="md:hidden flex items-center justify-between px-4 pt-[max(0.6rem,env(safe-area-inset-top))] pb-1 bg-[#F7F8FA] select-none">
      <div className="flex items-center gap-2">
        <h1 className="font-semibold text-2xl tracking-tight text-[#0F172A]">
          Finanças
        </h1>
      </div>

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
    </header>
  )
}


