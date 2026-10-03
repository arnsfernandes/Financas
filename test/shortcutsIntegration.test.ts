import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { generateShortcutsToken, verifyShortcutsAuth } from '../lib/shortcutsAuth'
import { NextRequest, NextResponse } from 'next/server'
import { POST as handleShortcutTransaction } from '../app/api/shortcuts/transaction/route'
import { formatBRL } from '../lib/formatters'
import * as queries from '../lib/queries'
import * as persist from '../lib/persist'
import * as shortcutsAuth from '../lib/shortcutsAuth'

describe('Shortcuts & Siri iPhone Integration Suite', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'test',
    }
  })

  afterEach(() => {
    process.env = originalEnv
    vi.restoreAllMocks()
  })

  describe('Token Generation & Format', () => {
    it('generates secure bearer token with fnc_st_ prefix', () => {
      const token1 = generateShortcutsToken()
      const token2 = generateShortcutsToken()

      expect(token1.startsWith('fnc_st_')).toBe(true)
      expect(token2.startsWith('fnc_st_')).toBe(true)
      expect(token1).not.toBe(token2)
      expect(token1.length).toBeGreaterThanOrEqual(40)
    })
  })

  describe('Authentication Guard', () => {
    it('rejects request without authorization header', async () => {
      const req = new NextRequest('http://localhost:3000/api/shortcuts/transaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'gastei 50 no mercado' }),
      })

      const res = await handleShortcutTransaction(req)
      expect(res.status).toBe(401)
      const data = await res.json()
      expect(data.ok).toBe(false)
      expect(data.error).toContain('Token de autorização não fornecido')
    })

    it('rejects request with invalid or nonexistent token', async () => {
      vi.spyOn(shortcutsAuth, 'verifyShortcutsAuth').mockResolvedValueOnce({
        authorized: false,
        error: 'Token de Atalhos inválido ou revogado.',
      })

      const req = new NextRequest('http://localhost:3000/api/shortcuts/transaction', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer fnc_st_invalid_fake_token',
        },
        body: JSON.stringify({ text: 'gastei 50 no mercado' }),
      })

      const res = await handleShortcutTransaction(req)
      expect(res.status).toBe(401)
      const data = await res.json()
      expect(data.ok).toBe(false)
      expect(data.error).toContain('Token de Atalhos inválido ou revogado')
    })
  })

  describe('Transaction Processing via Shortcuts', () => {
    const mockUser = {
      id: 'usr_12345',
      username: 'arnaldo',
      name: 'Arnaldo Fernandes',
    }

    const mockAccounts = [
      { id: 'acc_inter', name: 'Inter', institution: 'Inter', type: 'credit_card', active: true },
      { id: 'acc_nubank', name: 'Nubank', institution: 'Nubank', type: 'bank_account', active: true },
    ]

    const mockCategories = [
      { id: 'cat_transp', name: 'Transporte', type: 'expense', active: true },
      { id: 'cat_mercado', name: 'Mercado', type: 'expense', active: true },
    ]

    beforeEach(() => {
      vi.spyOn(shortcutsAuth, 'verifyShortcutsAuth').mockResolvedValue({
        authorized: true,
        user: mockUser,
      })
      vi.spyOn(queries, 'listAccounts').mockResolvedValue(mockAccounts as any)
      vi.spyOn(queries, 'listCategories').mockResolvedValue(mockCategories as any)
    })

    it('rejects empty input text with status 400', async () => {
      const req = new NextRequest('http://localhost:3000/api/shortcuts/transaction', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer fnc_st_valid_token',
        },
        body: JSON.stringify({ text: '   ' }),
      })

      const res = await handleShortcutTransaction(req)
      expect(res.status).toBe(400)
      const data = await res.json()
      expect(data.ok).toBe(false)
      expect(data.error).toContain('Nenhum texto informado')
    })

    it('rejects multiple expenses in voice input with status 422', async () => {
      const req = new NextRequest('http://localhost:3000/api/shortcuts/transaction', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer fnc_st_valid_token',
        },
        body: JSON.stringify({ text: 'gastei 50 no mercado e mais 30 na farmácia' }),
      })

      const res = await handleShortcutTransaction(req)
      expect(res.status).toBe(422)
      const data = await res.json()
      expect(data.ok).toBe(false)
      expect(data.error).toContain('múltiplos lançamentos')
    })

    it('processes single expense successfully and returns voice summary for Siri', async () => {
      vi.spyOn(persist, 'save').mockResolvedValueOnce({
        id: 'tx_999',
        type: 'expense',
        total: 45,
        vendor: 'Gasolina',
        category: 'Transporte',
        payment_method: 'Cartão de Crédito',
        account_id: 'acc_inter',
        date: '2026-10-02',
        source_type: 'text',
        created_at: '2026-10-02T23:00:00Z',
      } as any)

      const req = new NextRequest('http://localhost:3000/api/shortcuts/transaction', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer fnc_st_valid_token',
        },
        body: JSON.stringify({ text: 'gastei 45 reais de gasolina no Inter' }),
      })

      const res = await handleShortcutTransaction(req)
      expect(res.status).toBe(200)
      const data = await res.json()

      expect(data.ok).toBe(true)
      expect(data.message).toContain('Despesa de')
      expect(data.message).toContain('Gasolina')
      expect(data.message).toContain('Inter')
      expect(data.transaction).toBeDefined()
      expect(data.transaction.total).toBe(45)
      expect(data.transaction.totalFormatted).toBe(formatBRL(45))
      expect(data.transaction.vendor).toBe('Gasolina')
      expect(data.transaction.category).toBe('Transporte')
      expect(data.user.username).toBe('arnaldo')
    })
  })
})
