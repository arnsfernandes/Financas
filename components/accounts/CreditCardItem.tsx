'use client'

import React from 'react'
import { getInstitutionInfo } from '@/lib/institutions'
import { InstitutionLogo } from './InstitutionLogo'
import { formatBRL } from '@/lib/formatters'
import { ChevronRight } from 'lucide-react'

export type CreditCardSkin = 'solid' | 'gradient' | 'dark' | 'light' | 'minimal'

export const CREDIT_CARD_SKINS: {
  id: CreditCardSkin
  label: string
  desc: string
}[] = [
  { id: 'gradient', label: 'Gradiente', desc: 'Profundidade suave com a cor do cartão' },
  { id: 'solid', label: 'Sólido', desc: 'Cor pura e uniforme' },
  { id: 'dark', label: 'Escuro', desc: 'Fundo escuro premium com toque da cor' },
  { id: 'light', label: 'Claro', desc: 'Base clara e sofisticada com reflexo da cor' },
  { id: 'minimal', label: 'Minimalista', desc: 'Design sutil e essencial com borda de destaque' },
]

export function getContrastTextColor(hexColor?: string | null): '#FFFFFF' | '#111827' {
  if (!hexColor || !hexColor.startsWith('#')) return '#FFFFFF'
  const hex = hexColor.replace('#', '')
  if (hex.length !== 6) return '#FFFFFF'
  const r = parseInt(hex.substring(0, 2), 16)
  const g = parseInt(hex.substring(2, 4), 16)
  const b = parseInt(hex.substring(4, 6), 16)
  const yiq = (r * 299 + g * 587 + b * 114) / 1000
  return yiq >= 170 ? '#111827' : '#FFFFFF'
}

export interface CreditCardItemProps {
  id?: string
  name: string
  institution?: string | null
  color?: string | null
  skin?: CreditCardSkin | string | null
  customLogo?: string | null
  currentMonthExpenses?: number
  futureInstallmentsTotal?: number
  futureInstallmentsCount?: number
  closingDay?: number | null
  dueDay?: number | null
  inactive?: boolean
  onClick?: () => void
  isPreview?: boolean
}

export function CreditCardItem({
  name,
  institution,
  color,
  skin = 'gradient',
  customLogo,
  currentMonthExpenses = 0,
  futureInstallmentsTotal = 0,
  futureInstallmentsCount = 0,
  closingDay = 5,
  dueDay = 15,
  inactive = false,
  onClick,
  isPreview = false,
}: CreditCardItemProps) {
  const activeSkin: CreditCardSkin =
    skin === 'solid' || skin === 'gradient' || skin === 'dark' || skin === 'light' || skin === 'minimal'
      ? skin
      : 'gradient'

  const instInfo = getInstitutionInfo(institution || name)
  const accentColor = color || instInfo?.primaryColor || '#7C3AED'
  const contrastText = getContrastTextColor(accentColor)
  const isDarkSkin =
    activeSkin === 'dark'
      ? true
      : activeSkin === 'light' || activeSkin === 'minimal'
      ? false
      : contrastText === '#FFFFFF'

  // Estilo visual moderno de Apple Wallet com atmosfera escura
  const baseDarkBg = '#141416'
  const isInter = institution?.toLowerCase().includes('inter') || name?.toLowerCase().includes('inter')
  const isNubank = institution?.toLowerCase().includes('nu') || name?.toLowerCase().includes('nu')
  
  // Gradiente atmosférico sofisticado com glow radial suave
  const cardGradient = isInter
    ? `radial-gradient(ellipse at 85% 15%, rgba(255, 122, 0, 0.45) 0%, rgba(255, 90, 0, 0.15) 45%, rgba(20, 20, 22, 0.95) 85%), linear-gradient(145deg, #1F1916 0%, #121214 100%)`
    : isNubank
    ? `radial-gradient(ellipse at 85% 15%, rgba(130, 10, 209, 0.45) 0%, rgba(100, 20, 180, 0.15) 45%, rgba(20, 20, 22, 0.95) 85%), linear-gradient(145deg, #1C1524 0%, #121214 100%)`
    : `radial-gradient(ellipse at 85% 15%, color-mix(in srgb, ${accentColor} 45%, transparent) 0%, color-mix(in srgb, ${accentColor} 15%, transparent) 45%, rgba(20, 20, 22, 0.95) 85%), linear-gradient(145deg, #1A1A1E 0%, #121214 100%)`

  return (
    <div
      onClick={onClick}
      style={{ background: cardGradient }}
      className={`group relative rounded-[22px] p-4 sm:p-5 transition-all select-none overflow-hidden flex flex-col justify-between gap-3 border border-white/[0.06] shadow-lg ${
        onClick ? 'cursor-pointer active:scale-[0.98] transition-transform duration-100' : ''
      } ${inactive ? 'opacity-40 grayscale-[40%]' : ''}`}
    >
      {/* 1. LINHA SUPERIOR DO CARTÃO */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <InstitutionLogo
            institution={institution}
            accountName={name}
            accountType="credit_card"
            customLogo={customLogo}
            color={color}
            size="md"
          />
          <div className="min-w-0">
            <h3 className="font-medium text-sm text-white/95 truncate">
              {name || 'Cartão'}
            </h3>
            <p className="text-[11px] text-white/45 font-light truncate">
              {institution || 'Cartão de Crédito'}
            </p>
          </div>
        </div>

        {/* Chip "Crédito" translúcido + Chevron */}
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/[0.08] backdrop-blur-md border border-white/[0.06] text-[11px] font-medium text-white/80">
            <span>Crédito</span>
            <ChevronRight className="w-3 h-3 text-white/40" />
          </div>
          {inactive && (
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-white/10 text-white/60">
              Inativa
            </span>
          )}
        </div>
      </div>

      {/* 2. CORPO DO CARTÃO: FATURA ATUAL & DADOS COMPLEMENTARES */}
      <div className="pt-2 flex items-baseline justify-between gap-4">
        <div className="space-y-0.5">
          <span className="text-[11px] font-light text-white/50 block">
            Fatura atual
          </span>
          <div className="text-2xl sm:text-3xl font-light tracking-tight text-white tabular-nums">
            {formatBRL(currentMonthExpenses)}
          </div>
        </div>

        {futureInstallmentsTotal > 0 && (
          <div className="text-right space-y-0.5">
            <span className="text-[11px] font-light text-white/40 block">
              Parcelas futuras
            </span>
            <div className="text-xs sm:text-sm font-light text-white/80 tabular-nums">
              {formatBRL(futureInstallmentsTotal)}
            </div>
            {futureInstallmentsCount > 0 && (
              <span className="text-[10px] text-white/35 block">
                {futureInstallmentsCount} {futureInstallmentsCount === 1 ? 'parcela' : 'parcelas'}
              </span>
            )}
          </div>
        )}
      </div>

      {/* 3. RODAPÉ DO CARTÃO: CICLO & VER DETALHES */}
      <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between text-xs text-white/50">
        <div className="flex items-center gap-1.5 text-[11px] font-light">
          <svg
            className="w-3.5 h-3.5 text-white/40"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          <span>Fecha dia {closingDay || 5} • Vence dia {dueDay || 15}</span>
        </div>

        {!isPreview && (
          <div className="inline-flex items-center gap-0.5 text-[11px] font-medium text-white/70 group-hover:text-white transition-colors">
            <span>Ver detalhes</span>
            <ChevronRight className="w-3 h-3 text-white/40 group-hover:translate-x-0.5 transition-transform" />
          </div>
        )}
      </div>
    </div>
  )
}
