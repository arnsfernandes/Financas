'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'

export interface TelegramWebAppUser {
  id: number
  first_name?: string
  last_name?: string
  username?: string
  language_code?: string
  is_premium?: boolean
}

export interface TelegramWebAppContextType {
  isReady: boolean
  isTelegram: boolean
  initData: string
  user: TelegramWebAppUser | null
  themeParams: Record<string, string>
  colorScheme: 'light' | 'dark'
  authHeader: string
  fetchWithAuth: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  logoutWeb: () => Promise<void>
  closeApp: () => void
  expandApp: () => void
  showMainButton: (text: string, onClick: () => void) => void
  hideMainButton: () => void
}

export function buildAuthenticatedFetch(initData: string) {
  const authHeader = initData ? `Bearer ${initData}` : ''
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const headers = new Headers(init?.headers)
    if (authHeader) {
      headers.set('Authorization', authHeader)
      headers.set('x-telegram-init-data', initData)
    }
    return fetch(input, {
      ...init,
      headers,
    })
  }
}

const TelegramWebAppContext = createContext<TelegramWebAppContextType>({
  isReady: false,
  isTelegram: false,
  initData: '',
  user: null,
  themeParams: {},
  colorScheme: 'dark',
  authHeader: '',
  fetchWithAuth: fetch,
  logoutWeb: async () => {},
  closeApp: () => {},
  expandApp: () => {},
  showMainButton: () => {},
  hideMainButton: () => {},
})

export function TelegramWebAppProvider({ children }: { children: ReactNode }) {
  const [isReady, setIsReady] = useState(false)
  const [isTelegram, setIsTelegram] = useState(false)
  const [initData, setInitData] = useState<string>('')
  const [user, setUser] = useState<TelegramWebAppUser | null>(null)
  const [themeParams, setThemeParams] = useState<Record<string, string>>({})
  const [colorScheme, setColorScheme] = useState<'light' | 'dark'>('dark')

  useEffect(() => {
    // Check if running inside Telegram WebApp
    const tg = typeof window !== 'undefined' ? (window as any).Telegram?.WebApp : null

    if (tg && tg.initData) {
      setIsTelegram(true)
      setInitData(tg.initData)
      setUser(tg.initDataUnsafe?.user || null)
      setThemeParams(tg.themeParams || {})
      setColorScheme(tg.colorScheme || 'dark')

      try {
        tg.ready()
        tg.expand()
      } catch {
        // Silently continue
      }
    }

    setIsReady(true)
  }, [])

  const authHeader = initData ? `Bearer ${initData}` : ''
  const fetchWithAuth = buildAuthenticatedFetch(initData)

  const logoutWeb = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
      if (typeof window !== 'undefined') {
        window.location.reload()
      }
    } catch (e) {
      console.error('Falha ao fazer logout:', e)
    }
  }

  const closeApp = () => {
    if (typeof window !== 'undefined' && (window as any).Telegram?.WebApp?.close) {
      (window as any).Telegram.WebApp.close()
    }
  }

  const expandApp = () => {
    if (typeof window !== 'undefined' && (window as any).Telegram?.WebApp?.expand) {
      (window as any).Telegram.WebApp.expand()
    }
  }

  const showMainButton = (text: string, onClick: () => void) => {
    const tg = typeof window !== 'undefined' ? (window as any).Telegram?.WebApp : null
    if (tg?.MainButton) {
      tg.MainButton.setText(text)
      tg.MainButton.show()
      tg.MainButton.onClick(onClick)
    }
  }

  const hideMainButton = () => {
    const tg = typeof window !== 'undefined' ? (window as any).Telegram?.WebApp : null
    if (tg?.MainButton) {
      tg.MainButton.hide()
    }
  }

  return (
    <TelegramWebAppContext.Provider
      value={{
        isReady,
        isTelegram,
        initData,
        user,
        themeParams,
        colorScheme,
        authHeader,
        fetchWithAuth,
        logoutWeb,
        closeApp,
        expandApp,
        showMainButton,
        hideMainButton,
      }}
    >
      {children}
    </TelegramWebAppContext.Provider>
  )
}

export function useTelegramWebApp() {
  return useContext(TelegramWebAppContext)
}
