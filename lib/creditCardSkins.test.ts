import { describe, it, expect } from 'vitest'
import {
  CREDIT_CARD_SKINS,
  getContrastTextColor,
} from '@/components/accounts/CreditCardItem'

describe('Credit Card Skins & Color Utilities', () => {
  it('defines all required skin options', () => {
    const skinIds = CREDIT_CARD_SKINS.map((s) => s.id)
    expect(skinIds).toContain('solid')
    expect(skinIds).toContain('gradient')
    expect(skinIds).toContain('dark')
    expect(skinIds).toContain('light')
    expect(skinIds).toContain('minimal')
  })

  it('determines high-contrast text color correctly for dark brand colors', () => {
    // Nubank purple
    expect(getContrastTextColor('#820AD1')).toBe('#FFFFFF')
    // Carbon black
    expect(getContrastTextColor('#1E293B')).toBe('#FFFFFF')
    // Itaú blue
    expect(getContrastTextColor('#005CA9')).toBe('#FFFFFF')
    // Bradesco red
    expect(getContrastTextColor('#CC092F')).toBe('#FFFFFF')
  })

  it('determines high-contrast text color correctly for light brand colors', () => {
    // Banco do Brasil yellow
    expect(getContrastTextColor('#FFF159')).toBe('#111827')
    // Pure white
    expect(getContrastTextColor('#FFFFFF')).toBe('#111827')
    // Pale grey
    expect(getContrastTextColor('#E2E8F0')).toBe('#111827')
  })

  it('handles null, undefined or empty colors gracefully', () => {
    expect(getContrastTextColor(null)).toBe('#FFFFFF')
    expect(getContrastTextColor(undefined)).toBe('#FFFFFF')
    expect(getContrastTextColor('')).toBe('#FFFFFF')
  })
})
