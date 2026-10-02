'use client'

import React from 'react'
import {
  Sparkles,
  Plus,
  X,
  LayoutDashboard,
  ReceiptText,
  CreditCard,
  Layers,
  LogOut,
} from 'lucide-react'
import type { TabType } from '@/app/page'
import { useTelegramWebApp } from '@/lib/useTelegramWebApp'

export interface SidebarProps {
  activeTab: TabType
  setActiveTab: (tab: TabType) => void
  mobileMenuOpen: boolean
  setMobileMenuOpen: (open: boolean) => void
  transactionsCount: number
  onNavigateTab?: (tab: TabType) => void
}

export function Sidebar({
  activeTab,
  setActiveTab,
  mobileMenuOpen,
  setMobileMenuOpen,
  transactionsCount,
  onNavigateTab,
}: SidebarProps) {
  const { isTelegram, logoutWeb } = useTelegramWebApp()

  const navItemsFinanceiro = [
    { id: 'dashboard' as TabType, label: 'Visão Geral', icon: LayoutDashboard },
    { id: 'transactions' as TabType, label: 'Transações', icon: ReceiptText },
    { id: 'accounts' as TabType, label: 'Contas e Cartões', icon: CreditCard },
    { id: 'categories' as TabType, label: 'Categorias', icon: Layers },
  ]

  const handleTabClick = (tabId: TabType) => {
    setActiveTab(tabId)
    setMobileMenuOpen(false)
    onNavigateTab?.(tabId)
  }

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {mobileMenuOpen && (
        <div
          onClick={() => setMobileMenuOpen(false)}
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-xs md:hidden transition-opacity animate-in fade-in"
        />
      )}

      <aside
        className={`fixed md:sticky top-0 left-0 z-50 h-screen w-64 bg-white border-r border-[#EBEEF2] flex flex-col justify-between p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] transition-transform duration-200 ease-out md:translate-x-0 ${
          mobileMenuOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'
        }`}
      >
        <div className="space-y-6">
          {/* Logo Brand */}
          <div className="flex items-center justify-between px-2 pt-1">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#2F68FE] flex items-center justify-center text-white shadow-copilot-button">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <span className="font-bold text-base tracking-tight text-[#111827] block leading-none">Finanças</span>
              <span className="text-[11px] font-medium text-[#9CA3AF] tracking-wide">Inteligência Financeira</span>
            </div>
          </div>
          <button
            onClick={() => setMobileMenuOpen(false)}
            className="md:hidden p-1 rounded-lg text-[#9CA3AF] hover:text-[#111827]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Botão Global de Ação Rápida */}
        <div className="px-1">
          <button
            onClick={() => {
              setActiveTab('new')
              setMobileMenuOpen(false)
            }}
            className="w-full py-2.5 px-3.5 rounded-xl bg-[#2F68FE] hover:bg-[#1D52EB] text-white font-medium text-xs flex items-center justify-center gap-2 shadow-copilot-button transition-all hover:scale-[1.01] active:scale-[0.99]"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Novo Lançamento</span>
          </button>
        </div>

        {/* Navegação Principal */}
        <nav className="space-y-5">
          <div className="space-y-1">
            <span className="px-3 text-[11px] font-semibold text-[#9CA3AF] uppercase tracking-wider block">
              Menu Principal
            </span>
            <div className="space-y-0.5 pt-1">
              {navItemsFinanceiro.map((item) => {
                const Icon = item.icon
                const isActive = activeTab === item.id
                return (
                  <button
                    key={item.id}
                    onClick={() => handleTabClick(item.id)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                      isActive
                        ? 'bg-[#EBF2FF] text-[#2F68FE] font-semibold'
                        : 'text-[#4B5563] hover:text-[#111827] hover:bg-[#F2F4F7]'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon className={`w-4 h-4 ${isActive ? 'text-[#2F68FE]' : 'text-[#6B7280]'}`} />
                      <span>{item.label}</span>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </nav>
      </div>

      {/* Footer / Logout Web Button */}
      {!isTelegram && (
        <div className="pt-3 border-t border-[#F3F4F6]">
          <button
            onClick={() => logoutWeb()}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-[#6B7280] hover:text-red-600 hover:bg-red-50 transition-all cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>Sair da Sessão</span>
          </button>
        </div>
      )}
    </aside>
  </>
)
}
