'use client'

/**
 * Puxar para atualizar (padrão de apps no celular): com a página no topo, arrastar para baixo
 * mostra um indicador; soltando depois do limite, recarrega os dados.
 * Não age dentro de janelas (role="dialog") nem quando há algo rolável acima do topo.
 */
import React, { useEffect, useRef, useState } from 'react'
import { ArrowDown, Loader2 } from 'lucide-react'

const THRESHOLD = 70 // px puxados (já com resistência) para disparar
const MAX_PULL = 110

function blockedByScrollable(target: EventTarget | null): boolean {
  let el = target as HTMLElement | null
  while (el && el !== document.body) {
    if (el.getAttribute?.('role') === 'dialog' || el.dataset?.noPullRefresh !== undefined) return true
    const style = window.getComputedStyle(el)
    if (/(auto|scroll)/.test(style.overflowY) && el.scrollHeight > el.clientHeight && el.scrollTop > 0) return true
    el = el.parentElement
  }
  return false
}

export function PullToRefresh({ onRefresh }: { onRefresh: () => Promise<unknown> }) {
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const start = useRef<{ x: number; y: number } | null>(null)
  const active = useRef(false)
  const pullRef = useRef(0)
  const refreshingRef = useRef(false)
  const onRefreshRef = useRef(onRefresh)
  onRefreshRef.current = onRefresh

  useEffect(() => {
    const setP = (v: number) => {
      pullRef.current = v
      setPull(v)
    }
    const onStart = (e: TouchEvent) => {
      if (refreshingRef.current || e.touches.length !== 1) return
      if (window.scrollY > 0 || document.body.style.overflow === 'hidden' || blockedByScrollable(e.target)) {
        start.current = null
        return
      }
      start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
      active.current = false
    }
    const onMove = (e: TouchEvent) => {
      if (!start.current) return
      const dy = e.touches[0].clientY - start.current.y
      const dx = e.touches[0].clientX - start.current.x
      if (!active.current) {
        if (dy < 8 || Math.abs(dx) > dy || window.scrollY > 0) {
          if (dy < 0 || Math.abs(dx) > 8) start.current = null
          return
        }
        active.current = true
      }
      if (e.cancelable) e.preventDefault()
      setP(Math.min(MAX_PULL, Math.max(0, dy - 8) * 0.5))
    }
    const onEnd = async () => {
      const wasActive = active.current
      start.current = null
      active.current = false
      if (!wasActive) return
      if (pullRef.current >= THRESHOLD) {
        refreshingRef.current = true
        setRefreshing(true)
        setP(THRESHOLD * 0.7)
        try {
          await onRefreshRef.current()
        } catch {
          /* os próprios fetchs mostram os erros */
        } finally {
          refreshingRef.current = false
          setRefreshing(false)
          setP(0)
        }
      } else {
        setP(0)
      }
    }
    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('touchend', onEnd)
    window.addEventListener('touchcancel', onEnd)
    return () => {
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
      window.removeEventListener('touchcancel', onEnd)
    }
  }, [])

  const visible = pull > 0 || refreshing
  const ready = pull >= THRESHOLD
  return (
    <div
      aria-live="polite"
      className="md:hidden fixed left-0 right-0 z-[60] flex justify-center pointer-events-none"
      style={{
        top: 'env(safe-area-inset-top, 0px)',
        transform: `translateY(${visible ? pull - 8 : -48}px)`,
        transition: start.current && !refreshing ? 'none' : 'transform 200ms ease-out',
        opacity: visible ? Math.min(1, pull / 30 + (refreshing ? 1 : 0)) : 0,
      }}
    >
      <div className="mt-2 w-9 h-9 rounded-full bg-white shadow-md border border-slate-100 flex items-center justify-center">
        {refreshing ? (
          <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
        ) : (
          <ArrowDown
            className={`w-4 h-4 transition-transform ${ready ? 'text-blue-600 rotate-180' : 'text-slate-400'}`}
          />
        )}
      </div>
      <span className="sr-only">{refreshing ? 'Atualizando' : ''}</span>
    </div>
  )
}
