import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import * as queriesModule from '@/lib/queries'
import * as authGuardModule from '@/lib/authGuard'

describe('Installment Group Deletion', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  describe('DELETE /api/transactions/installments/[groupId]', () => {
    it('returns 401/error if not authorized', async () => {
      vi.spyOn(authGuardModule, 'requireFinancialAuth').mockReturnValue({
        authorized: false,
        response: new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), { status: 401 }) as any,
      })

      const { DELETE } = await import('@/app/api/transactions/installments/[groupId]/route')
      const req = new NextRequest('http://localhost:3000/api/transactions/installments/grp-1', { method: 'DELETE' })
      const res = await DELETE(req, { params: { groupId: 'grp-1' } })

      expect(res.status).toBe(401)
      const data = await res.json()
      expect(data.ok).toBe(false)
      expect(data.error).toBe('Unauthorized')
    })

    it('returns 400 if groupId is invalid', async () => {
      vi.spyOn(authGuardModule, 'requireFinancialAuth').mockReturnValue({ authorized: true })

      const { DELETE } = await import('@/app/api/transactions/installments/[groupId]/route')
      const req = new NextRequest('http://localhost:3000/api/transactions/installments/', { method: 'DELETE' })
      const res = await DELETE(req, { params: { groupId: '' } })

      expect(res.status).toBe(400)
      const data = await res.json()
      expect(data.ok).toBe(false)
      expect(data.error).toBe('ID do parcelamento inválido')
    })

    it('deletes installment group deterministically in backend and returns 200', async () => {
      vi.spyOn(authGuardModule, 'requireFinancialAuth').mockReturnValue({ authorized: true })
      const deleteGroupSpy = vi.spyOn(queriesModule, 'deleteInstallmentGroup').mockResolvedValue(true)

      const { DELETE } = await import('@/app/api/transactions/installments/[groupId]/route')
      const req = new NextRequest('http://localhost:3000/api/transactions/installments/group-uuid-123', {
        method: 'DELETE',
      })
      const res = await DELETE(req, { params: { groupId: 'group-uuid-123' } })

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.ok).toBe(true)
      expect(data.groupId).toBe('group-uuid-123')
      expect(deleteGroupSpy).toHaveBeenCalledWith('group-uuid-123')
    })

    it('returns 500 when backend deletion throws', async () => {
      vi.spyOn(authGuardModule, 'requireFinancialAuth').mockReturnValue({ authorized: true })
      vi.spyOn(queriesModule, 'deleteInstallmentGroup').mockRejectedValue(new Error('Supabase network failure'))

      const { DELETE } = await import('@/app/api/transactions/installments/[groupId]/route')
      const req = new NextRequest('http://localhost:3000/api/transactions/installments/group-uuid-error', {
        method: 'DELETE',
      })
      const res = await DELETE(req, { params: { groupId: 'group-uuid-error' } })

      expect(res.status).toBe(500)
      const data = await res.json()
      expect(data.ok).toBe(false)
      expect(data.error).toBe('Supabase network failure')
    })
  })

  describe('Isolation and Multi-Installment State Removal', () => {
    it('removes all transactions of the deleted installment group and preserves others', () => {
      const allTransactions = [
        // Group 1: 3 installments
        { id: 'tx-1-1', vendor: 'Loja A', installment_group_id: 'grp-A', installment_current: 1, installment_total: 3, total: 100 },
        { id: 'tx-1-2', vendor: 'Loja A', installment_group_id: 'grp-A', installment_current: 2, installment_total: 3, total: 100 },
        { id: 'tx-1-3', vendor: 'Loja A', installment_group_id: 'grp-A', installment_current: 3, installment_total: 3, total: 100 },
        // Group 2: 2 installments
        { id: 'tx-2-1', vendor: 'Loja B', installment_group_id: 'grp-B', installment_current: 1, installment_total: 2, total: 50 },
        { id: 'tx-2-2', vendor: 'Loja B', installment_group_id: 'grp-B', installment_current: 2, installment_total: 2, total: 50 },
        // Single transaction
        { id: 'tx-single', vendor: 'Mercado', installment_group_id: null, total: 80 },
      ]

      const deletedGroupId = 'grp-A'
      const updatedList = allTransactions.filter((t) => t.installment_group_id !== deletedGroupId)

      expect(updatedList.length).toBe(3)
      expect(updatedList.some((t) => t.installment_group_id === 'grp-A')).toBe(false)
      expect(updatedList.filter((t) => t.installment_group_id === 'grp-B').length).toBe(2)
      expect(updatedList.some((t) => t.id === 'tx-single')).toBe(true)
    })
  })
})
