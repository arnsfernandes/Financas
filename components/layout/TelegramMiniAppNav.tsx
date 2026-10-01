'use client'

import React from 'react'
import { LayoutDashboard, Receipt, CreditCard, Tags, PlusCircle } from 'lucide-react'
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
  const tabs = [
    {
      id: 'dashboard' as TabType,
      label: 'Visão Geral',
      icon: LayoutDashboard,
    },
    {
      id: 'transactions' as TabType,
      label: 'Extrato',
      icon: Receipt,
      badge: transactionsCount,
    },
    {
      id: 'new' as TabType,
      label: 'Novo',
      icon: PlusCircle,
      highlight: true,
    },
    {
      id: 'accounts' as TabType,
      label: 'Contas/Faturas',
      icon: CreditCard,
    },
    {
      id: 'categories' as TabType,
      label: 'Categorias',
      icon: Tags,
    },
  ]

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 px-2 py-1.5 flex items-center justify-around shadow-lg safe-area-bottom">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id
        const Icon = tab.icon

        if (tab.highlight) {
          return (
            <button
              key={tab.id}
              onClick={() => onSelectTab(tab.id)}
              className="flex flex-col items-center justify-center -mt-4 group focus:outline-none"
            >
              <div className={`w-12 h-12 rounded-full flex items-center justify-center shadow-lg transition-transform active:scale-95 ${
                isActive
                  ? 'bg-blue-600 text-white ring-4 ring-blue-100 dark:ring-blue-900/40'
                  : 'bg-gradient-to-tr from-blue-600 to-indigo-500 text-white shadow-blue-500/25'
              }`}>
                <Icon className="w-6 h-6" />
              </div>
              <span className={`text-[10px] font-medium mt-1 ${
                isActive ? 'text-blue-600 dark:text-blue-400 font-semibold' : 'text-slate-500 dark:text-slate-400'
              }`}>
                {tab.label}
              </span>
            </button>
          )
        }

        return (
          <button
            key={tab.id}
            onClick={() => onSelectTab(tab.id)}
            className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl transition-all relative ${
              isActive
                ? 'text-blue-600 dark:text-blue-400 font-semibold'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <div className="relative">
              <Icon className={`w-5 h-5 ${isActive ? 'stroke-[2.5]' : 'stroke-2'}`} />
              {typeof tab.badge === 'number' && tab.badge > 0 ? (
                <span className="absolute -top-1 -right-2 bg-blue-600 text-white text-[9px] font-bold px-1.5 py-0.2 rounded-full min-w-[14px] text-center">
                  {tab.badge > 99 ? '99+' : tab.badge}
                </span>
              ) : null}
            </div>
            <span className="text-[10px] tracking-tight mt-0.5">{tab.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
