'use client'

import React, { useState, useEffect, useRef } from 'react'
import { ChevronLeft, ChevronRight, Calendar, Check } from 'lucide-react'

export interface MonthPickerProps {
  monthOffset: number
  onSelectMonthOffset: (offset: number) => void
  currentLabel?: string
  disabled?: boolean
  className?: string
}

const MONTH_NAMES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
]

const MONTH_SHORT_NAMES = [
  'Jan',
  'Fev',
  'Mar',
  'Abr',
  'Mai',
  'Jun',
  'Jul',
  'Ago',
  'Set',
  'Out',
  'Nov',
  'Dez',
]

export function MonthPicker({
  monthOffset,
  onSelectMonthOffset,
  currentLabel,
  disabled = false,
  className = '',
}: MonthPickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Determine current active date from monthOffset
  const now = new Date()
  const currentActualYear = now.getFullYear()
  const currentActualMonth = now.getMonth()

  const activeDate = new Date(currentActualYear, currentActualMonth + monthOffset, 1)
  const activeYear = activeDate.getFullYear()
  const activeMonth = activeDate.getMonth()

  // Year being viewed in the picker popup
  const [viewYear, setViewYear] = useState<number>(activeYear)

  // Sync viewYear whenever monthOffset or activeDate changes when popup opens
  useEffect(() => {
    if (isOpen) {
      setViewYear(activeYear)
    }
  }, [isOpen, activeYear])

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function handleSelectMonth(monthIndex: number) {
    // Calculate new offset relative to current actual date
    const targetMonths = viewYear * 12 + monthIndex
    const currentMonths = currentActualYear * 12 + currentActualMonth
    const newOffset = targetMonths - currentMonths
    onSelectMonthOffset(newOffset)
    setIsOpen(false)
  }

  function handleQuickGoToday() {
    onSelectMonthOffset(0)
    setViewYear(currentActualYear)
    setIsOpen(false)
  }

  const displayLabel = currentLabel || `${MONTH_NAMES[activeMonth]} de ${activeYear}`

  return (
    <div ref={containerRef} className={`relative flex items-center ${className}`}>
      {/* Botão do Mês Atual (estilo "Outubro 2026 ▾" conforme referência) */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled}
        className="text-xs sm:text-sm font-normal text-[#667085] hover:text-[#0F172A] transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-40"
        title="Clique para selecionar o mês"
      >
        <span>{displayLabel}</span>
        <ChevronRight className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-90' : 'rotate-90'}`} />
      </button>

      {/* Popover compacto de seleção de mês */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-2 z-50 w-64 max-w-[calc(100vw-2rem)] bg-white border border-slate-200/80 rounded-2xl shadow-xl p-3 animate-in fade-in zoom-in-95 duration-100">
          {/* Navegação de Ano */}
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
            <button
              type="button"
              onClick={() => setViewYear((y) => y - 1)}
              className="p-1 rounded-lg hover:bg-[#F2F4F7] text-[#667085] hover:text-[#0F172A] transition-colors cursor-pointer"
              title="Ano anterior"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <span className="text-xs font-semibold text-[#0F172A]">{viewYear}</span>

            <button
              type="button"
              onClick={() => setViewYear((y) => y + 1)}
              className="p-1 rounded-lg hover:bg-[#F2F4F7] text-[#667085] hover:text-[#0F172A] transition-colors cursor-pointer"
              title="Próximo ano"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Grid de 12 Meses */}
          <div className="grid grid-cols-3 gap-1.5">
            {MONTH_NAMES.map((name, idx) => {
              const isSelected = viewYear === activeYear && idx === activeMonth
              const isActualCurrentMonth = viewYear === currentActualYear && idx === currentActualMonth

              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => handleSelectMonth(idx)}
                  className={`px-2 py-1.5 rounded-xl text-xs font-medium transition-all relative flex items-center justify-center gap-1 cursor-pointer ${
                    isSelected
                      ? 'bg-[#2F68FE] text-white font-semibold shadow-xs'
                      : isActualCurrentMonth
                      ? 'bg-[#EBF2FF] text-[#2F68FE] font-medium hover:bg-[#DDE9FF]'
                      : 'text-[#344054] hover:bg-[#F2F4F7] hover:text-[#0F172A]'
                  }`}
                >
                  <span>{MONTH_SHORT_NAMES[idx]}</span>
                  {isSelected && <Check className="w-3 h-3 shrink-0 ml-0.5" />}
                </button>
              )
            })}
          </div>

          {/* Rodapé: Ir para Mês Atual */}
          {monthOffset !== 0 && (
            <div className="mt-2.5 pt-2 border-t border-slate-100 flex justify-center">
              <button
                type="button"
                onClick={handleQuickGoToday}
                className="text-[11px] font-medium text-[#2F68FE] hover:underline flex items-center gap-1 cursor-pointer"
              >
                <Calendar className="w-3 h-3" />
                <span>Ir para mês atual ({MONTH_SHORT_NAMES[currentActualMonth]}/{currentActualYear})</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
