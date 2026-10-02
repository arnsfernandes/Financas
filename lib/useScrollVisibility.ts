'use client'

import { useState, useEffect, useRef } from 'react'

export interface ScrollDirectionOptions {
  threshold?: number // minimum scroll distance before triggering a change (default: 8px)
  initialVisible?: boolean
}

/**
 * Hook to manage auto-hiding navigation / floating widgets on mobile scroll.
 * - Scrolling DOWN: hides the navigation.
 * - Scrolling UP: shows the navigation immediately.
 * - Reaching top of the page (< 30px): always shows navigation.
 * - Handles fast direction switches and prevents jitter.
 */
export function useScrollVisibility(options: ScrollDirectionOptions = {}) {
  const { threshold = 8, initialVisible = true } = options
  const [isVisible, setIsVisible] = useState(initialVisible)
  const lastScrollY = useRef(0)
  const isUpdating = useRef(false)

  useEffect(() => {
    // Only run in browser
    if (typeof window === 'undefined') return

    lastScrollY.current = window.scrollY

    const handleScroll = () => {
      if (isUpdating.current) return

      isUpdating.current = true
      requestAnimationFrame(() => {
        const currentScrollY = window.scrollY
        const diff = currentScrollY - lastScrollY.current

        // Near top of page: always show
        if (currentScrollY <= 25) {
          setIsVisible(true)
          lastScrollY.current = currentScrollY
          isUpdating.current = false
          return
        }

        // Check if delta exceeds threshold to avoid micro-jitters
        if (Math.abs(diff) >= threshold) {
          if (diff > 0 && currentScrollY > 60) {
            // Scrolling DOWN
            setIsVisible(false)
          } else if (diff < 0) {
            // Scrolling UP
            setIsVisible(true)
          }
          lastScrollY.current = currentScrollY
        }

        isUpdating.current = false
      })
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', handleScroll)
    }
  }, [threshold])

  return isVisible
}
