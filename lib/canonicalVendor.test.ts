import { describe, it, expect } from 'vitest'
import {
  parseVendor,
  cleanVendorText,
  toVendorTitleCase,
} from './canonicalVendor'

describe('Canonical Vendors Deterministic Normalization', () => {
  describe('Legal Suffixes, Casing, and Accent Normalization', () => {
    it('normalizes uppercase, accents and legal suffixes into the same canonical identity', () => {
      const v1 = parseVendor('CARREFOUR')
      const v2 = parseVendor('Carrefour Ltda.')
      const v3 = parseVendor('Carrefour S/A')
      const v4 = parseVendor('Carrefour Hipermercado')

      expect(v1.canonicalName).toBe('Carrefour')
      expect(v2.canonicalName).toBe('Carrefour')
      expect(v3.canonicalName).toBe('Carrefour')
      expect(v4.canonicalName).toBe('Carrefour')

      expect(v1.normalizedKey).toBe('carrefour')
      expect(v2.normalizedKey).toBe('carrefour')
      expect(v3.normalizedKey).toBe('carrefour')
      expect(v4.normalizedKey).toBe('carrefour')
    })

    it('normalizes common supermarket chains and pharmacies', () => {
      const p1 = parseVendor('PÃO DE AÇÚCAR')
      const p2 = parseVendor('Pao de Acucar Supermercados')
      expect(p1.canonicalName).toBe('Pão de Açúcar')
      expect(p2.canonicalName).toBe('Pão de Açúcar')
      expect(p1.normalizedKey).toBe('pao de acucar')

      const d1 = parseVendor('DROGASIL S.A.')
      const d2 = parseVendor('Drogaria Drogasil')
      expect(d1.canonicalName).toBe('Drogasil')
      expect(d2.canonicalName).toBe('Drogasil')

      const m1 = parseVendor('MC DONALDS')
      const m2 = parseVendor('McDonald\'s Comércio de Alimentos Ltda')
      expect(m1.canonicalName).toBe('McDonald\'s')
      expect(m2.canonicalName).toBe('McDonald\'s')
    })
  })

  describe('Separation of Distinct Branches and Locations', () => {
    it('keeps distinct store units/branches separated when branch info is present', () => {
      const store1 = parseVendor('Carrefour - Loja 12')
      const store2 = parseVendor('Carrefour - Loja 45')
      const storeShopping = parseVendor('Carrefour Shopping Iguatemi')

      expect(store1.canonicalName).toBe('Carrefour (Loja 12)')
      expect(store2.canonicalName).toBe('Carrefour (Loja 45)')
      expect(storeShopping.canonicalName).toContain('Shopping Iguatemi')

      expect(store1.normalizedKey).not.toBe(store2.normalizedKey)
      expect(store1.normalizedKey).toBe('carrefour:loja 12')
      expect(store2.normalizedKey).toBe('carrefour:loja 45')
    })

    it('keeps legitimately different stores separated', () => {
      const v1 = parseVendor('Padaria Central')
      const v2 = parseVendor('Padaria do Bairro')
      const v3 = parseVendor('Farmácia São Bento')

      expect(v1.canonicalName).toBe('Padaria Central')
      expect(v2.canonicalName).toBe('Padaria do Bairro')
      expect(v3.canonicalName).toBe('Farmacia Sao Bento')

      expect(v1.normalizedKey).toBe('padaria central')
      expect(v2.normalizedKey).toBe('padaria do bairro')
      expect(v1.normalizedKey).not.toBe(v2.normalizedKey)
    })
  })

  describe('Empty and Fallback Handling', () => {
    it('handles null, undefined or empty vendor gracefully', () => {
      expect(parseVendor('')).toEqual({
        canonicalName: 'Outros',
        normalizedKey: 'outros',
        branchInfo: null,
      })
      expect(parseVendor('   ')).toEqual({
        canonicalName: 'Outros',
        normalizedKey: 'outros',
        branchInfo: null,
      })
    })
  })
})
