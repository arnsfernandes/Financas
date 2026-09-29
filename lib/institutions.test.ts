import { describe, it, expect } from 'vitest'
import {
  normalizeInstitutionKey,
  getInstitutionInfo,
  getFallbackInitials,
  KNOWN_INSTITUTIONS,
} from './institutions'

describe('lib/institutions', () => {
  describe('normalizeInstitutionKey', () => {
    it('normalizes common banks accurately regardless of case or accents', () => {
      expect(normalizeInstitutionKey('Nubank')).toBe('nubank')
      expect(normalizeInstitutionKey('nu')).toBe('nubank')
      expect(normalizeInstitutionKey('Cartão Nubank Roxinho')).toBe('nubank')

      expect(normalizeInstitutionKey('Inter')).toBe('inter')
      expect(normalizeInstitutionKey('Banco Inter S.A.')).toBe('inter')

      expect(normalizeInstitutionKey('Itaú')).toBe('itau')
      expect(normalizeInstitutionKey('Itau Unibanco')).toBe('itau')
      expect(normalizeInstitutionKey('iti')).toBe('itau')

      expect(normalizeInstitutionKey('Bradesco')).toBe('bradesco')
      expect(normalizeInstitutionKey('Banco Bradesco')).toBe('bradesco')

      expect(normalizeInstitutionKey('Santander')).toBe('santander')
      expect(normalizeInstitutionKey('Banco Santander')).toBe('santander')

      expect(normalizeInstitutionKey('Caixa')).toBe('caixa')
      expect(normalizeInstitutionKey('Caixa Econômica Federal')).toBe('caixa')
      expect(normalizeInstitutionKey('CEF')).toBe('caixa')

      expect(normalizeInstitutionKey('Banco do Brasil')).toBe('bb')
      expect(normalizeInstitutionKey('BB')).toBe('bb')
      expect(normalizeInstitutionKey('Ourocard')).toBe('bb')

      expect(normalizeInstitutionKey('C6')).toBe('c6')
      expect(normalizeInstitutionKey('C6 Bank')).toBe('c6')

      expect(normalizeInstitutionKey('PicPay')).toBe('picpay')
      expect(normalizeInstitutionKey('Pic Pay')).toBe('picpay')

      expect(normalizeInstitutionKey('Mercado Pago')).toBe('mercadopago')
      expect(normalizeInstitutionKey('MercadoPago')).toBe('mercadopago')
      expect(normalizeInstitutionKey('Mercado Livre')).toBe('mercadopago')
    })

    it('returns null for unknown institutions and invalid inputs', () => {
      expect(normalizeInstitutionKey('Banco Desconhecido XYZ')).toBeNull()
      expect(normalizeInstitutionKey('')).toBeNull()
      expect(normalizeInstitutionKey(null)).toBeNull()
      expect(normalizeInstitutionKey(undefined)).toBeNull()
    })
  })

  describe('getInstitutionInfo', () => {
    it('returns brand metadata for recognized institutions', () => {
      const nu = getInstitutionInfo('Nubank')
      expect(nu).toBeDefined()
      expect(nu?.key).toBe('nubank')
      expect(nu?.primaryColor).toBe('#820AD1')

      const inter = getInstitutionInfo('Banco Inter')
      expect(inter).toBeDefined()
      expect(inter?.primaryColor).toBe('#FF7A00')
    })

    it('returns null for unrecognized institutions', () => {
      expect(getInstitutionInfo('Fintech Desconhecida')).toBeNull()
    })
  })

  describe('getFallbackInitials', () => {
    it('produces 1-2 clean uppercase characters from account or institution name', () => {
      expect(getFallbackInitials('Banco Safra')).toBe('BS')
      expect(getFallbackInitials('XP')).toBe('XP')
      expect(getFallbackInitials('Sicredi')).toBe('SI')
      expect(getFallbackInitials('')).toBe('?')
      expect(getFallbackInitials(null)).toBe('?')
    })
  })
})
