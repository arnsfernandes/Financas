'use client'

import React from 'react'
import { Sparkles, Plus, Menu } from 'lucide-react'
import type { TabType } from '@/app/page'

export interface MobileHeaderProps {
  setActiveTab: (tab: TabType) => void
  mobileMenuOpen: boolean
  setMobileMenuOpen: (open: boolean | ((prev: boolean) => boolean)) => void
  activeTabTitle?: string
}

export function MobileHeader({
  setActiveTab,
  mobileMenuOpen,
  setMobileMenuOpen,
  activeTabTitle,
}: MobileHeaderProps) {
  return (
    <header className="md:hidden flex items-center justify-between px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 bg-white/95 backdrop-blur-md border-b border-[#EBEEF2] sticky top-0 z-30 shadow-xs select-none">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="w-8 h-8 rounded-xl bg-[#2F68FE] flex items-center justify-center text-white shadow-copilot-button shrink-0" style={{ color: '#FFFFFF' }}>
          <Sparkles className="w-4 h-4 fill-white/20" style={{ color: '#FFFFFF' }} />
        </div>
        <div className="min-w-0">
          <span className="font-extrabold text-sm tracking-tight text-[#111827] block leading-none">
            Finanças
          </span>
          {activeTabTitle && (
            <span className="text-[10px] font-semibold text-[#6B7280] tracking-wide block truncate mt-0.5">
              {activeTabTitle}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={() => setActiveTab('new')}
          className="min-h-[38px] px-3 py-1.5 rounded-xl bg-[#2F68FE] hover:bg-[#1D52EB] active:scale-95 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm shadow-blue-500/20 transition-all cursor-pointer"
          style={{ color: '#FFFFFF' }}
        >
          <Plus className="w-3.5 h-3.5 stroke-[2.5]" style={{ color: '#FFFFFF' }} />
          <span>Novo</span>
        </button>
        <button
          type="button"
          onClick={() => setMobileMenuOpen((prev) => !prev)}
          aria-label="Menu"
          className="min-h-[38px] min-w-[38px] p-2 rounded-xl text-[#4B5563] hover:text-[#111827] hover:bg-[#F2F4F7] active:bg-[#E5E7EB] transition-colors flex items-center justify-center cursor-pointer"
        >
          <Menu className="w-5 h-5" />
        </button>
      </div>
    </header>
  )
}

