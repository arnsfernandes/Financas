'use client'

import { useEffect } from 'react'

/**
 * Converts a base64 string to a Uint8Array suitable for applicationServerKey
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

/**
 * Automatically subscribes the current browser/PWA to Web Push notifications
 * when permission is granted.
 */
export async function subscribeToWebPush(): Promise<boolean> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    return false
  }

  try {
    const registration = await navigator.serviceWorker.ready
    if (!registration) return false

    // Check existing subscription
    let subscription = await registration.pushManager.getSubscription()

    if (!subscription) {
      // Fetch VAPID public key
      const keyRes = await fetch('/api/push/subscribe')
      const keyData = await keyRes.json()
      const publicKey = keyData.publicKey || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY

      if (!publicKey) {
        console.warn('VAPID public key not found for push subscription.')
        return false
      }

      const convertedKey = urlBase64ToUint8Array(publicKey)
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertedKey as unknown as BufferSource,
      })
    }

    // Send subscription to server
    const saveRes = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: subscription.toJSON() }),
    })

    const saveData = await saveRes.json()
    return saveData.ok === true
  } catch (error) {
    console.warn('Error subscribing to push notifications:', error)
    return false
  }
}

/**
 * Hook to request notification permission exactly once upon first meaningful interaction
 * after opening the PWA on iOS / Safari / Chrome.
 *
 * iOS 16.4+ Requirement:
 * `Notification.requestPermission()` MUST be called directly inside a user gesture (tap/click).
 * We listen for the first user click/tap anywhere on the screen if permission is 'default' and not yet prompted.
 */
export function usePwaPushPrompt(enabled: boolean = true) {
  useEffect(() => {
    if (!enabled) return
    if (typeof window === 'undefined') return
    if (!('Notification' in window) || !('serviceWorker' in navigator)) return

    // If permission already decided (granted or denied), handle accordingly
    if (Notification.permission === 'granted') {
      subscribeToWebPush().catch(() => {})
      return
    }

    if (Notification.permission === 'denied') {
      return
    }

    // Check if user already dismissed or prompted in this device storage
    const hasPrompted = localStorage.getItem('financas_pwa_push_prompted')
    if (hasPrompted) {
      return
    }

    // Register user interaction handler to trigger iOS native permission prompt
    const handleFirstUserInteraction = async () => {
      // Remove listeners immediately so it runs only once
      window.removeEventListener('click', handleFirstUserInteraction)
      window.removeEventListener('touchend', handleFirstUserInteraction)

      localStorage.setItem('financas_pwa_push_prompted', 'true')

      try {
        const permission = await Notification.requestPermission()
        if (permission === 'granted') {
          await subscribeToWebPush()
        }
      } catch (err) {
        console.debug('Notification permission request error:', err)
      }
    }

    window.addEventListener('click', handleFirstUserInteraction, { once: true })
    window.addEventListener('touchend', handleFirstUserInteraction, { once: true })

    return () => {
      window.removeEventListener('click', handleFirstUserInteraction)
      window.removeEventListener('touchend', handleFirstUserInteraction)
    }
  }, [enabled])
}
