import { beforeEach, describe, expect, it, vi } from 'vitest'
import { saveBatch, setSupabaseClientForTesting } from './persist'
import { detectDuplicateTransaction } from './duplicate'
import { parseSingleTransactionLocally } from './textRouter'
vi.mock('./duplicate', () => ({ detectDuplicateTransaction: vi.fn(async () => ({ isDuplicate: false, type: 'none' })) }))
vi.mock('./canonicalVendor', () => ({ getOrCreateCanonicalVendor: vi.fn(async () => ({ vendorId: null })) }))
vi.mock('./canonical', () => ({ getOrCreateCanonicalProduct: vi.fn(async () => ({ productId: null })) }))
vi.mock('./queries', () => ({ listCategories: vi.fn(async () => []), normalizeCategoryName: (s: string) => s.toLowerCase() }))
const insert = vi.fn(async (_rows: unknown) => ({ error: null as null | { message: string } }))
const itemInsert = vi.fn(async (_rows: unknown) => ({ error: null }))
function inputs() {
  return [45, 80, 32].map(total => ({ receipt: parseSingleTransactionLocally(`gastei ${total} no mercado em dinheiro`, [], []).receipt!, imageKey: null, imageSha256: null, sourceType: 'text' as const }))
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(detectDuplicateTransaction).mockResolvedValue({ isDuplicate: false, type: 'none' })
  insert.mockResolvedValue({ error: null })
  setSupabaseClientForTesting({ from: (table: string) => ({ insert: table === 'transactions' ? insert : itemInsert }) } as any)
})
describe('batch persistence uses existing financial preparation', () => {
  it('inserts all financial rows once and attaches original items', async () => {
    const saved = await saveBatch(inputs())
    expect(saved).toHaveLength(3)
    expect(insert).toHaveBeenCalledTimes(1)
    expect((insert.mock.calls[0][0] as any[]).map(row => row.total)).toEqual([45, 80, 32])
    expect(itemInsert).toHaveBeenCalledTimes(1)
    expect((itemInsert.mock.calls[0][0] as any[]).map(row => row.transaction_id)).toEqual(saved.map(row => row.id))
  })
  it('preflights every duplicate before any financial write', async () => {
    vi.mocked(detectDuplicateTransaction).mockResolvedValueOnce({ isDuplicate: false, type: 'none' }).mockResolvedValueOnce({ isDuplicate: true, type: 'exact', reason: 'duplicado' })
    await expect(saveBatch(inputs())).rejects.toThrow('duplicado')
    expect(insert).not.toHaveBeenCalled()
    expect(itemInsert).not.toHaveBeenCalled()
  })
  it('uses one insert also for installments and never writes items on failure', async () => {
    const data = inputs(); data[1].receipt.installment_total = 3
    insert.mockResolvedValue({ error: { message: 'failed' } })
    await expect(saveBatch(data)).rejects.toThrow('failed')
    expect(insert).toHaveBeenCalledTimes(1)
    expect(insert.mock.calls[0][0]).toHaveLength(5)
    expect(itemInsert).not.toHaveBeenCalled()
  })
})
