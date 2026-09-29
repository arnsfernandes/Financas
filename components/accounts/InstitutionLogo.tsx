'use client'

import React from 'react'
import {
  normalizeInstitutionKey,
  getInstitutionInfo,
  getFallbackInitials,
} from '@/lib/institutions'
import { Building2, CreditCard, Banknote, Wallet } from 'lucide-react'

export interface InstitutionLogoProps {
  institution?: string | null
  accountName?: string | null
  accountType?: string | null
  customLogo?: string | null
  color?: string | null
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
  alt?: string
}

const SIZE_MAP = {
  sm: 'w-6 h-6 text-[10px] rounded-lg',
  md: 'w-8 h-8 text-xs rounded-xl',
  lg: 'w-10 h-10 text-sm rounded-xl',
  xl: 'w-14 h-14 text-base rounded-2xl',
}

export function InstitutionLogo({
  institution,
  accountName,
  accountType,
  customLogo,
  color,
  size = 'lg',
  className = '',
  alt,
}: InstitutionLogoProps) {
  const sizeClass = SIZE_MAP[size] || SIZE_MAP.lg

  // 1. Manual / Custom uploaded logo override
  if (customLogo && customLogo.trim() !== '') {
    return (
      <div
        className={`relative overflow-hidden shrink-0 flex items-center justify-center bg-white border border-[#E5E7EB] shadow-xs ${sizeClass} ${className}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={customLogo}
          alt={alt || institution || accountName || 'Logo da instituição'}
          className="w-full h-full object-cover"
        />
      </div>
    )
  }

  // 2. Built-in recognized institution logo
  const instKey = normalizeInstitutionKey(institution || accountName)

  if (instKey) {
    return (
      <div
        className={`shrink-0 overflow-hidden flex items-center justify-center shadow-xs select-none ${sizeClass} ${className}`}
        title={institution || accountName || instKey}
      >
        {renderBuiltinLogo(instKey)}
      </div>
    )
  }

  // 3. Fallback: Monogram or generic clean type icon
  const initials = getFallbackInitials(institution || accountName)
  const isCard = accountType === 'credit_card'
  const isCash = accountType === 'cash'

  const bgGradient = color
    ? ''
    : isCard
    ? 'bg-gradient-to-br from-[#4F46E5] to-[#7C3AED] text-white'
    : isCash
    ? 'bg-gradient-to-br from-[#059669] to-[#10B981] text-white'
    : 'bg-gradient-to-br from-[#1E293B] to-[#334155] text-white'

  return (
    <div
      style={color ? { backgroundColor: color, color: '#FFFFFF' } : undefined}
      className={`shrink-0 flex items-center justify-center font-bold tracking-wider shadow-xs select-none ${bgGradient} ${sizeClass} ${className}`}
      title={institution || accountName || 'Conta'}
    >
      {initials !== '?' ? (
        <span>{initials}</span>
      ) : isCard ? (
        <CreditCard className="w-1/2 h-1/2" />
      ) : isCash ? (
        <Banknote className="w-1/2 h-1/2" />
      ) : (
        <Building2 className="w-1/2 h-1/2" />
      )}
    </div>
  )
}

/**
 * High-fidelity vector logos for recognized institutions
 */
function renderBuiltinLogo(key: string) {
  switch (key) {
    case 'nubank':
      return (
        <svg viewBox="0 0 48 48" className="w-full h-full" fill="none">
          <rect width="48" height="48" rx="10" fill="#820AD1" />
          <path
            d="M14 31V17H18.2L23.8 25.5V17H27.5V31H23.3L17.7 22.5V31H14ZM30 31V17H34V26.5C34 27.6 34.4 28.2 35.3 28.2C36.2 28.2 36.6 27.6 36.6 26.5V17H40.5V26.4C40.5 29.8 38.6 31.4 35.3 31.4C32 31.4 30 29.8 30 26.4V31Z"
            fill="#FFFFFF"
          />
        </svg>
      )

    case 'inter':
      return (
        <svg viewBox="0 0 48 48" className="w-full h-full" fill="none">
          <rect width="48" height="48" rx="10" fill="#FF7A00" />
          {/* Logo Inter typographic mark */}
          <text
            x="24"
            y="29"
            textAnchor="middle"
            fill="#FFFFFF"
            fontFamily="system-ui, -apple-system, sans-serif"
            fontWeight="800"
            fontSize="15"
            letterSpacing="-0.5px"
          >
            inter
          </text>
        </svg>
      )

    case 'itau':
      return (
        <svg viewBox="0 0 48 48" className="w-full h-full" fill="none">
          <rect width="48" height="48" rx="10" fill="#EC7000" />
          <rect x="9" y="9" width="30" height="30" rx="8" fill="#003399" />
          <text
            x="24"
            y="29"
            textAnchor="middle"
            fill="#FED100"
            fontFamily="system-ui, -apple-system, sans-serif"
            fontWeight="900"
            fontSize="14"
            letterSpacing="-0.5px"
          >
            Itaú
          </text>
        </svg>
      )

    case 'bradesco':
      return (
        <svg viewBox="0 0 48 48" className="w-full h-full" fill="none">
          <rect width="48" height="48" rx="10" fill="#CC092F" />
          {/* Bradesco tree/concentric arches */}
          <path
            d="M24 12V36M18 36C18 29.5 20.8 23.5 25.5 19.5M30 36C30 31.5 28.5 27 25.5 23.5"
            stroke="#FFFFFF"
            strokeWidth="3.2"
            strokeLinecap="round"
          />
          <circle cx="25.5" cy="19.5" r="2.2" fill="#FFFFFF" />
          <circle cx="25.5" cy="23.5" r="1.8" fill="#FFFFFF" />
        </svg>
      )

    case 'santander':
      return (
        <svg viewBox="0 0 48 48" className="w-full h-full" fill="none">
          <rect width="48" height="48" rx="10" fill="#EC0000" />
          {/* Santander Flame Symbol */}
          <path
            d="M24 13C25 17 28 19 28 23C28 27.5 24.5 30 20 28C22 26 23 23 22 20C21.2 17.5 23 15 24 13ZM24 23C25 24 26 25.5 26 27C26 29.5 24 31 22 30C23 29 23.5 27.5 23 26C22.5 24.5 23.5 23.5 24 23ZM27 20C28.5 22 30 24 29.5 27C29 30 26.5 32 23 32C26.5 32 32 30 31.5 25C31 21 28.5 19 27 20Z"
            fill="#FFFFFF"
          />
        </svg>
      )

    case 'caixa':
      return (
        <svg viewBox="0 0 48 48" className="w-full h-full" fill="none">
          <rect width="48" height="48" rx="10" fill="#005CA9" />
          {/* Caixa iconic 'X' chevron */}
          <path
            d="M14 15L23 24L14 33H19L25.5 26.5L32 33H37L28 24L37 15H32L25.5 21.5L19 15H14Z"
            fill="#FFFFFF"
          />
          <path
            d="M27 21L34 14H29L24.5 18.5L27 21Z"
            fill="#F37021"
          />
          <path
            d="M20 26.5L14 32.5H19L22.5 29L20 26.5Z"
            fill="#F37021"
          />
        </svg>
      )

    case 'bb':
      return (
        <svg viewBox="0 0 48 48" className="w-full h-full" fill="none">
          <rect width="48" height="48" rx="10" fill="#FFF159" />
          {/* Banco do Brasil intertwined geometric ribbons */}
          <path
            d="M17 17H31V23H23V31H17V17Z"
            fill="#003882"
          />
          <path
            d="M31 31H17V25H25V17H31V31Z"
            fill="#003882"
            opacity="0.85"
          />
          <circle cx="24" cy="24" r="2.5" fill="#FFF159" />
        </svg>
      )

    case 'c6':
      return (
        <svg viewBox="0 0 48 48" className="w-full h-full" fill="none">
          <rect width="48" height="48" rx="10" fill="#242424" />
          <text
            x="24"
            y="29"
            textAnchor="middle"
            fill="#FFFFFF"
            fontFamily="system-ui, -apple-system, sans-serif"
            fontWeight="900"
            fontSize="16"
            letterSpacing="-0.5px"
          >
            C6
          </text>
        </svg>
      )

    case 'picpay':
      return (
        <svg viewBox="0 0 48 48" className="w-full h-full" fill="none">
          <rect width="48" height="48" rx="10" fill="#11C76F" />
          {/* PicPay P rounded monogram */}
          <path
            d="M19 15H27C30.3 15 33 17.7 33 21C33 24.3 30.3 27 27 27H23.5V33H19V15ZM23.5 23H26.8C27.9 23 28.8 22.1 28.8 21C28.8 19.9 27.9 19 26.8 19H23.5V23Z"
            fill="#FFFFFF"
          />
        </svg>
      )

    case 'mercadopago':
      return (
        <svg viewBox="0 0 48 48" className="w-full h-full" fill="none">
          <rect width="48" height="48" rx="10" fill="#009EE3" />
          {/* Mercado Pago handshake symbol */}
          <path
            d="M15 22L21 16L27 22L33 16L35 18L27 26L21 20L17 24L15 22Z"
            fill="#FFFFFF"
          />
          <path
            d="M17 27L21 23L27 29L33 23L35 25L27 33L21 27L19 29L17 27Z"
            fill="#FFFFFF"
            opacity="0.9"
          />
        </svg>
      )

    case 'btg':
      return (
        <svg viewBox="0 0 48 48" className="w-full h-full" fill="none">
          <rect width="48" height="48" rx="10" fill="#0B1E36" />
          <text
            x="24"
            y="28"
            textAnchor="middle"
            fill="#FFFFFF"
            fontFamily="system-ui, -apple-system, sans-serif"
            fontWeight="800"
            fontSize="13"
            letterSpacing="0.5px"
          >
            BTG
          </text>
        </svg>
      )

    case 'pagbank':
      return (
        <svg viewBox="0 0 48 48" className="w-full h-full" fill="none">
          <rect width="48" height="48" rx="10" fill="#00A859" />
          <circle cx="24" cy="24" r="11" stroke="#FFFFFF" strokeWidth="3" fill="none" />
          <path d="M24 18V30M18 24H30" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" />
        </svg>
      )

    case 'xp':
      return (
        <svg viewBox="0 0 48 48" className="w-full h-full" fill="none">
          <rect width="48" height="48" rx="10" fill="#000000" />
          <text
            x="24"
            y="29"
            textAnchor="middle"
            fill="#FFFFFF"
            fontFamily="system-ui, -apple-system, sans-serif"
            fontWeight="900"
            fontSize="15"
            letterSpacing="-0.5px"
          >
            XP
          </text>
        </svg>
      )

    default:
      return null
  }
}
