'use client'

import React from 'react'
import {
  LayoutDashboard,
  ReceiptText,
  CreditCard,
  Layers,
  Plus,
} from 'lucide-react'
import type { TabType } from '@/app/page'

export interface TelegramMiniAppNavProps {
  activeTab: TabType
  onSelectTab: (tab: TabType) => void
  transactionsCount?: number
}

export function TelegramMiniAppNav({
  activeTab,
  onSelectTab,
  transactionsCount,
}: TelegramMiniAppNavProps) {
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

  const navTabs = [
    {
      id: 'dashboard' as TabType,
      label: 'Visão Geral',
      icon: LayoutDashboard,
    },
    {
      id: 'transactions' as TabType,
      label: 'Extrato',
      icon: ReceiptText,
      badge: transactionsCount,
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
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-xl border-t border-[#EBEEF2] px-2 pt-1 pb-[max(0.35rem,env(safe-area-inset-bottom))] shadow-[0_-4px_20px_rgba(0,0,0,0.04)] select-none">
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
                className="flex flex-col items-center justify-center -mt-5 group focus:outline-none focus:ring-0 active:scale-95 transition-transform"
              >
                <div
                  className={`w-12 h-12 rounded-full flex items-center justify-center shadow-md transition-all duration-200 ${
                    isActive
                      ? 'bg-[#1D52EB] text-white ring-4 ring-[#EBF2FF] shadow-blue-500/30 scale-105'
                      : 'bg-[#2F68FE] hover:bg-[#1D52EB] text-white shadow-blue-500/25 ring-2 ring-white'
                  }`}
                  style={{ color: '#FFFFFF' }}
                >
                  <Icon className="w-6 h-6 stroke-[2.5]" style={{ color: '#FFFFFF' }} />
                </div>
                <span
                  className={`text-[10px] tracking-tight mt-0.5 font-bold ${
                    isActive ? 'text-[#2F68FE]' : 'text-[#4B5563]'
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
              className={`flex-1 flex flex-col items-center justify-center py-1 px-1 rounded-xl transition-all duration-150 relative active:scale-95 focus:outline-none min-h-[46px] ${
                isActive
                  ? 'text-[#2F68FE]'
                  : 'text-[#6B7280] hover:text-[#111827]'
              }`}
            >
              <div className="relative flex items-center justify-center">
                <div
                  className={`p-1 rounded-xl transition-all duration-150 ${
                    isActive ? 'bg-[#EBF2FF]' : 'bg-transparent'
                  }`}
                >
                  <Icon
                    className={`w-5 h-5 transition-transform ${
                      isActive ? 'stroke-[2.3] text-[#2F68FE] scale-105' : 'stroke-[1.8]'
                    }`}
                  />
                </div>

                {typeof tab.badge === 'number' && tab.badge > 0 ? (
                  <span className="absolute -top-0.5 -right-2 bg-[#2F68FE] text-white text-[9px] font-extrabold px-1.5 py-0.2 rounded-full min-w-[15px] text-center border-2 border-white leading-tight shadow-xs">
                    {tab.badge > 99 ? '99+' : tab.badge}
                  </span>
                ) : null}
              </div>

              <span
                className={`text-[10px] tracking-tight transition-colors ${
                  isActive ? 'font-bold text-[#2F68FE]' : 'font-medium text-[#4B5563]'
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

