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

  // Configuração de estilo visual por skin
  let containerStyle: React.CSSProperties = {}
  let borderClass = ''
  let textClass = ''
  let subtextClass = ''
  let badgeClass = ''
  let cyclePillClass = ''
  let chipClass = ''

  if (activeSkin === 'gradient') {
    containerStyle = {
      background: `linear-gradient(135deg, ${accentColor} 0%, color-mix(in srgb, ${accentColor} 70%, #000000) 100%)`,
      backgroundColor: accentColor,
    }
    borderClass = 'border border-white/15'
    textClass = isDarkSkin ? 'text-white' : 'text-[#111827]'
    subtextClass = isDarkSkin ? 'text-white/75' : 'text-[#111827]/75'
    badgeClass = isDarkSkin
      ? 'bg-white/20 text-white border-white/25 backdrop-blur-xs'
      : 'bg-black/15 text-[#111827] border-black/20'
    cyclePillClass = isDarkSkin
      ? 'bg-black/20 text-white/90 border-white/15 backdrop-blur-xs'
      : 'bg-white/50 text-[#111827] border-black/10'
    chipClass = isDarkSkin ? 'border-white/30 text-white/50' : 'border-black/25 text-black/40'
  } else if (activeSkin === 'solid') {
    containerStyle = {
      backgroundColor: accentColor,
    }
    borderClass = 'border border-black/10'
    textClass = isDarkSkin ? 'text-white' : 'text-[#111827]'
    subtextClass = isDarkSkin ? 'text-white/75' : 'text-[#111827]/75'
    badgeClass = isDarkSkin
      ? 'bg-white/20 text-white border-white/25 backdrop-blur-xs'
      : 'bg-black/15 text-[#111827] border-black/20'
    cyclePillClass = isDarkSkin
      ? 'bg-black/20 text-white/90 border-white/15 backdrop-blur-xs'
      : 'bg-white/50 text-[#111827] border-black/10'
    chipClass = isDarkSkin ? 'border-white/30 text-white/50' : 'border-black/25 text-black/40'
  } else if (activeSkin === 'dark') {
    containerStyle = {
      background: `radial-gradient(ellipse 95% 85% at 90% 10%, color-mix(in srgb, ${accentColor} 40%, #0F172A) 0%, #0F172A 70%)`,
      backgroundColor: '#0F172A',
    }
    borderClass = 'border border-slate-800'
    textClass = 'text-white'
    subtextClass = 'text-slate-300'
    badgeClass = 'bg-slate-800/90 text-slate-200 border-slate-700'
    cyclePillClass = 'bg-slate-950/70 text-slate-300 border-slate-800'
    chipClass = 'border-slate-700 text-slate-400'
  } else if (activeSkin === 'light') {
    containerStyle = {
      background: `radial-gradient(ellipse 95% 85% at 90% 10%, color-mix(in srgb, ${accentColor} 15%, #FFFFFF) 0%, #FFFFFF 68%)`,
      backgroundColor: '#FFFFFF',
    }
    borderClass = 'border border-[#EBEEF2]'
    textClass = 'text-[#111827]'
    subtextClass = 'text-[#4B5563]'
    badgeClass = 'bg-slate-100 text-slate-700 border-slate-200'
    cyclePillClass = 'bg-slate-50 text-slate-700 border-slate-200/80'
    chipClass = 'border-slate-300 text-slate-400'
  } else {
    // minimal
    containerStyle = {
      backgroundColor: '#FFFFFF',
    }
    borderClass = 'border border-[#E2E8F0]'
    textClass = 'text-[#111827]'
    subtextClass = 'text-[#4B5563]'
    badgeClass = 'bg-purple-50 text-purple-700 border-purple-200/60'
    cyclePillClass = 'bg-slate-50 text-slate-700 border-slate-200/70'
    chipClass = 'border-slate-300 text-slate-400'
  }

  return (
    <div
      onClick={onClick}
      style={containerStyle}
      className={`group relative rounded-2xl p-5 transition-all select-none overflow-hidden flex flex-col justify-between gap-3 min-h-[200px] ${borderClass} ${
        onClick ? 'cursor-pointer hover:shadow-lg hover:-translate-y-0.5' : ''
      } ${inactive ? 'opacity-65 grayscale-[20%]' : ''}`}
    >
      {/* Filete decorativo sutil para skin minimalista */}
      {activeSkin === 'minimal' && (
        <div
          className="h-1 w-full absolute top-0 left-0"
          style={{ backgroundColor: accentColor }}
        />
      )}

      {/* TOPO DO CARTÃO */}
      <div>
        <div className="flex items-start justify-between gap-3 mb-2">
          {/* Logo e Instituição */}
          <div className="flex items-center gap-2.5 min-w-0">
            <InstitutionLogo
              institution={institution}
              accountName={name}
              accountType="credit_card"
              customLogo={customLogo}
              color={color}
              size="md"
            />
            <div className="min-w-0">
              <h3 className={`font-bold text-sm tracking-tight truncate ${textClass}`}>
                {name || 'Nome do Cartão'}
              </h3>
              {institution && (
                <p className={`text-[11px] font-medium truncate ${subtextClass}`}>
                  {institution}
                </p>
              )}
            </div>
          </div>

          {/* Símbolo Contactless (aproximação) + Badge "Crédito" */}
          <div className="flex items-center gap-1.5 shrink-0">
            <span
              title="Cartão por aproximação"
              className={`p-0.5 opacity-80 ${textClass}`}
            >
              <svg
                className="w-3.5 h-3.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M8.5 16.5a5 5 0 0 1 7 0" />
                <path d="M6 13.5a9 9 0 0 1 12 0" />
                <path d="M3.5 10.5a13 13 0 0 1 17 0" />
              </svg>
            </span>

            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${badgeClass}`}>
              Crédito
            </span>

            {inactive && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-black/30 text-white/90 border border-white/20">
                Inativa
              </span>
            )}
          </div>
        </div>

        {/* Detalhe sutil de Chip EMV físico sem dados fictícios */}
        <div className="flex items-center justify-between mt-1 mb-3">
          <div
            className={`w-7 h-5 rounded-[4px] border flex items-center justify-center shrink-0 ${chipClass}`}
            title="Chip de segurança"
          >
            <div className="w-4 h-3 border border-current rounded-xs grid grid-cols-2 gap-px p-px">
              <div className="border-r border-b border-current" />
              <div className="border-b border-current" />
              <div className="border-r border-current" />
              <div />
            </div>
          </div>
        </div>

        {/* VALOR PRINCIPAL: FATURA ATUAL */}
        <div className="space-y-0.5">
          <span className={`text-[10px] font-semibold uppercase tracking-wider block ${subtextClass}`}>
            Fatura Atual
          </span>
          <div className={`text-xl font-bold tracking-tight ${textClass}`}>
            {formatBRL(currentMonthExpenses)}
          </div>
        </div>
      </div>

      {/* RODAPÉ DO CARTÃO: PARCELAS E CICLO */}
      <div className="space-y-2 pt-2">
        <div className={`flex items-center justify-between text-xs ${subtextClass}`}>
          <span>Parcelas futuras:</span>
          <span className={`font-semibold ${textClass}`}>
            {formatBRL(futureInstallmentsTotal)}
            {futureInstallmentsCount > 0 && (
              <span className="text-[10px] opacity-75 ml-1">
                ({futureInstallmentsCount}x)
              </span>
            )}
          </span>
        </div>

        {/* Bloco discreto com Fechamento e Vencimento */}
        <div
          className={`flex items-center justify-between text-[11px] px-2.5 py-1 rounded-xl border ${cyclePillClass}`}
        >
          <span className="opacity-80">Ciclo da fatura:</span>
          <span className="font-semibold">
            Fecha dia {closingDay || 5} • Vence dia {dueDay || 15}
          </span>
        </div>

        {!isPreview && (
          <div className={`flex items-center justify-end text-[11px] font-semibold pt-0.5 ${subtextClass} group-hover:opacity-100 transition-opacity`}>
            <span className="inline-flex items-center gap-0.5">
              Ver detalhes
              <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
