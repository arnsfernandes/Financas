'use client'

/**
 * Folha que abre por cima da tela, no estilo dos apps da Apple.
 * Celular: sobe de baixo, cobre o rodapé e fecha arrastando para baixo, no X, no fundo ou com Esc.
 * Computador: janela centralizada.
 */
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'

const SheetCtx = createContext<() => void>(() => {})

/** Fecha a folha com a animação de saída. */
export function useSheetClose() {
  return useContext(SheetCtx)
}

export function SheetCloseButton({ className = '' }: { className?: string }) {
  const close = useSheetClose()
  return (
    <button
      type="button"
      onClick={close}
      aria-label="Fechar"
      className={`w-8 h-8 shrink-0 rounded-full bg-slate-100 text-slate-500 hover:text-slate-800 hover:bg-slate-200 flex items-center justify-center transition-colors ${className}`}
    >
      <X className="w-4 h-4" />
    </button>
  )
}

const CLOSE_DISTANCE = 110

function scrolledAncestor(target: EventTarget | null, stop: HTMLElement): boolean {
  let el = target as HTMLElement | null
  while (el && el !== stop) {
    if (el.scrollTop > 0) return true
    el = el.parentElement
  }
  return false
}

export function Sheet({
  open,
  onClose,
  label,
  children,
  className = '',
}: {
  open: boolean
  onClose: () => void
  label: string
  children: React.ReactNode
  className?: string
}) {
  const [shown, setShown] = useState(false)
  const [drag, setDrag] = useState(0)
  const panel = useRef<HTMLDivElement>(null)
  const start = useRef<number | null>(null)
  const dragging = useRef(false)
  const closing = useRef(false)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  const close = useCallback(() => {
    if (closing.current) return
    closing.current = true
    setShown(false)
    window.setTimeout(() => onCloseRef.current(), 220)
  }, [])

  useEffect(() => {
    if (!open) return
    closing.current = false
    setDrag(0)
    const raf = requestAnimationFrame(() => setShown(true))
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('keydown', onKey)
    return () => {
      cancelAnimationFrame(raf)
      document.body.style.overflow = prevOverflow
      window.removeEventListener('keydown', onKey)
      setShown(false)
    }
  }, [open, close])

  if (!open) return null

  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1 || !panel.current || scrolledAncestor(e.target, panel.current)) {
      start.current = null
      return
    }
    start.current = e.touches[0].clientY
    dragging.current = false
  }
  const onTouchMove = (e: React.TouchEvent) => {
    if (start.current === null) return
    const dy = e.touches[0].clientY - start.current
    if (!dragging.current) {
      if (dy < 6) {
        if (dy < 0) start.current = null
        return
      }
      dragging.current = true
    }
    setDrag(Math.max(0, dy))
  }
  const onTouchEnd = () => {
    if (dragging.current && drag > CLOSE_DISTANCE) close()
    else setDrag(0)
    start.current = null
    dragging.current = false
  }

  return (
    <SheetCtx.Provider value={close}>
      <div
        className={`fixed inset-0 z-[70] flex items-end sm:items-center justify-center sm:p-6 transition-colors duration-200 ${
          shown ? 'bg-slate-900/40' : 'bg-slate-900/0'
        }`}
        onClick={close}
        data-no-pull-refresh
      >
        <div
          ref={panel}
          role="dialog"
          aria-modal="true"
          aria-label={label}
          onClick={(e) => e.stopPropagation()}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onTouchCancel={onTouchEnd}
          style={{
            transform: shown ? `translateY(${drag}px)` : 'translateY(100%)',
            transition: dragging.current ? 'none' : 'transform 260ms cubic-bezier(0.32, 0.72, 0, 1), opacity 200ms',
          }}
          className={`relative bg-white w-full sm:max-w-2xl max-h-[calc(100dvh-env(safe-area-inset-top,0px)-12px)] sm:max-h-[85vh] rounded-t-[28px] sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden pb-[env(safe-area-inset-bottom,0px)] sm:pb-0 ${
            shown ? 'sm:opacity-100' : 'sm:opacity-0'
          } ${className}`}
        >
          <div className="sm:hidden absolute top-2 left-1/2 -translate-x-1/2 w-10 h-1.5 rounded-full bg-slate-200" aria-hidden="true" />
          {children}
        </div>
      </div>
    </SheetCtx.Provider>
  )
}
