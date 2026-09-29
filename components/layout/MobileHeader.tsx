'use client'

import React from 'react'
import { Sparkles, Plus, Menu } from 'lucide-react'
import type { TabType } from '@/app/page'

export interface MobileHeaderProps {
  setActiveTab: (tab: TabType) => void
  mobileMenuOpen: boolean
  setMobileMenuOpen: (open: boolean | ((prev: boolean) => boolean)) => void
}

export function MobileHeader({
  setActiveTab,
  mobileMenuOpen,
  setMobileMenuOpen,
}: MobileHeaderProps) {
  return (
    <header className="md:hidden flex items-center justify-between px-4 py-3 bg-white border-b border-[#EBEEF2] sticky top-0 z-30 shadow-sm">
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-xl bg-[#2F68FE] flex items-center justify-center text-white shadow-copilot-button">
          <Sparkles className="w-4 h-4" />
        </div>
        <span className="font-bold text-base tracking-tight text-[#111827]">Finanças</span>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => setActiveTab('new')}
          className="px-3 py-1.5 rounded-lg bg-[#2F68FE] hover:bg-[#1D52EB] text-white text-xs font-semibold flex items-center gap-1 shadow-copilot-button transition-all"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Novo</span>
        </button>
        <button
          onClick={() => setMobileMenuOpen((prev) => !prev)}
          className="p-2 rounded-lg text-[#6B7280] hover:text-[#111827] hover:bg-[#F2F4F7]"
        >
          <Menu className="w-5 h-5" />
        </button>
      </div>
    </header>
  )
}
