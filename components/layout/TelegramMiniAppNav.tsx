'use client'

import React from 'react'
import {
  LayoutDashboard,
  ReceiptText,
  CreditCard,
  Layers,
  Plus,
  type LucideIcon,
} from 'lucide-react'
import type { TabType } from '@/app/page'
import { useScrollVisibility } from '@/lib/useScrollVisibility'

export interface TelegramMiniAppNavProps {
  activeTab: TabType
  onSelectTab: (tab: TabType) => void
  transactionsCount?: number
  isVisible?: boolean
}

export function TelegramMiniAppNav({
  activeTab,
  onSelectTab,
  transactionsCount,
  isVisible: controlledVisible,
}: TelegramMiniAppNavProps) {
  const isScrollVisible = useScrollVisibility({ threshold: 10, initialVisible: true })
  const isVisible = controlledVisible !== undefined ? controlledVisible : isScrollVisible

  const triggerHaptic = () => {
    try {
      if (typeof window !== 'undefined' && (window as any).Telegram?.WebApp?.HapticFeedback) {
        (window as any).Telegram.WebApp.HapticFeedback.impactOccurred('light')
      } else if (typeof window !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate(12)
      }
    } catch {
      // Haptics not available
    }
  }

  const handleTabPress = (tabId: TabType) => {
    triggerHaptic()
    onSelectTab(tabId)
  }

  interface NavTabItem {
    id: TabType
    label: string
    icon: LucideIcon
    isCenterAction?: boolean
    badge?: number
  }

  const navTabs: NavTabItem[] = [
    {
      id: 'dashboard' as TabType,
      label: 'Visão Geral',
      icon: LayoutDashboard,
    },
    {
      id: 'transactions' as TabType,
      label: 'Extrato',
      icon: ReceiptText,
    },
    {
      id: 'new' as TabType,
      label: 'Novo',
      icon: Plus,
      isCenterAction: true,
    },
    {
      id: 'accounts' as TabType,
      label: 'Contas',
      icon: CreditCard,
    },
    {
      id: 'categories' as TabType,
      label: 'Categorias',
      icon: Layers,
    },
  ]

  return (
    <nav
      className={`md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/85 backdrop-blur-2xl border-t border-slate-200/80 px-3 pt-1.5 pb-[max(0.4rem,env(safe-area-inset-bottom))] shadow-[0_-4px_24px_rgba(0,0,0,0.06)] select-none transition-transform duration-300 ease-out will-change-transform ${
        isVisible ? 'translate-y-0' : 'translate-y-full pointer-events-none'
      }`}
    >
      <div className="flex items-center justify-around max-w-md mx-auto relative">
        {navTabs.map((tab) => {
          const isActive = activeTab === tab.id
          const Icon = tab.icon

          // Center Elevated Action Button ("Novo")
          if (tab.isCenterAction) {
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleTabPress(tab.id)}
                aria-label="Novo Lançamento"
                className="flex flex-col items-center justify-center -mt-5 group focus:outline-none focus:ring-0 active:scale-95 transition-transform cursor-pointer"
              >
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center shadow-lg shadow-blue-500/25 ring-4 ring-white/90 bg-[#2F68FE] hover:bg-[#2557D6] text-white transition-all duration-200"
                  style={{ color: '#FFFFFF' }}
                >
                  <Icon className="w-5 h-5 stroke-[2.5]" style={{ color: '#FFFFFF' }} />
                </div>
                <span
                  className={`text-[9px] tracking-tight mt-0.5 font-medium ${
                    isActive ? 'text-[#2F68FE]' : 'text-[#667085]'
                  }`}
                >
                  {tab.label}
                </span>
              </button>
            )
          }

          // Standard Tab Item
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleTabPress(tab.id)}
              className={`flex-1 flex flex-col items-center justify-center py-1 px-1 rounded-xl transition-all duration-150 relative active:scale-95 focus:outline-none min-h-[44px] cursor-pointer ${
                isActive
                  ? 'text-[#2F68FE]'
                  : 'text-[#667085] hover:text-[#0F172A]'
              }`}
            >
              <div className="relative flex items-center justify-center">
                <div className="p-1 rounded-xl transition-all duration-150">
                  <Icon
                    className={`w-4 h-4 transition-transform ${
                      isActive ? 'stroke-[2.2] text-[#2F68FE] scale-105' : 'stroke-[1.5] text-[#667085]'
                    }`}
                  />
                </div>

                {typeof tab.badge === 'number' && tab.badge > 0 ? (
                  <span className="absolute -top-0.5 -right-2 bg-[#2F68FE] text-white text-[9px] font-bold px-1.5 py-0.2 rounded-full min-w-[15px] text-center border border-white leading-tight">
                    {tab.badge > 99 ? '99+' : tab.badge}
                  </span>
                ) : null}
              </div>

              <span
                className={`text-[9px] tracking-tight transition-colors ${
                  isActive ? 'font-semibold text-[#2F68FE]' : 'font-normal text-[#667085]'
                }`}
              >
                {tab.label}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}

