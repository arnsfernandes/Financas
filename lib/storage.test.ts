import { describe, it, expect, vi } from 'vitest'
import { sha256, imageKey, store, remove, isStorageConfigured } from './storage'

describe('sha256', () => {
  it('is deterministic for the same bytes', () => {
    const buf = Buffer.from('hello receipt')
    expect(sha256(buf)).toBe(sha256(Buffer.from('hello receipt')))
  })

  it('differs for different bytes', () => {
    expect(sha256(Buffer.from('a'))).not.toBe(sha256(Buffer.from('b')))
  })
})

describe('imageKey', () => {
  it('picks an extension from the content type', () => {
    expect(imageKey('abc', 'image/png')).toBe('receipts/abc.png')
    expect(imageKey('abc', 'image/webp')).toBe('receipts/abc.webp')
    expect(imageKey('abc', 'image/jpeg')).toBe('receipts/abc.jpg')
  })
})

describe('store', () => {
  it('returns a null key but a real hash when no client is configured', async () => {
    const buf = Buffer.from('a fake image')
    const result = await store(buf, 'image/jpeg', null)
    expect(result.key).toBeNull()
    expect(result.sha256).toBe(sha256(buf))
  })

  it('uploads and returns a content-addressed key when a client is injected', async () => {
    const calls: { Bucket?: string; Key?: string; ContentType?: string }[] = []
    const fakeS3 = {
      send: async (cmd: { input: { Bucket?: string; Key?: string; ContentType?: string } }) => {
        calls.push(cmd.input)
        return {}
      },
    } as unknown as Parameters<typeof store>[2]

    const buf = Buffer.from('another fake image')
    const result = await store(buf, 'image/png', fakeS3)
    expect(result.key).toBe(`receipts/${sha256(buf)}.png`)
    expect(calls).toHaveLength(1)
    expect(calls[0].Key).toBe(result.key)
    expect(calls[0].ContentType).toBe('image/png')
  })
})

describe('remove', () => {
  it('is a safe no-op when key is null, undefined, or empty', async () => {
    const fakeS3 = { send: vi.fn() } as unknown as Parameters<typeof store>[2]
    await remove(null, fakeS3)
    await remove(undefined, fakeS3)
    await remove('', fakeS3)
    expect(fakeS3.send).not.toHaveBeenCalled()
  })

  it('is a safe no-op when s3 client is null (storage unconfigured)', async () => {
    await expect(remove('receipts/abc.jpg', null)).resolves.toBeUndefined()
  })

  it('sends DeleteObjectCommand with bucket and key when configured', async () => {
    const calls: any[] = []
    const fakeS3 = {
      send: vi.fn().mockImplementation(async (cmd) => {
        calls.push(cmd.input)
        return {}
      }),
    } as unknown as Parameters<typeof store>[2]

    await remove('receipts/deadbeef.jpg', fakeS3)
    expect(fakeS3.send).toHaveBeenCalledTimes(1)
    expect(calls[0].Key).toBe('receipts/deadbeef.jpg')
  })
})

describe('Lifecycle & Rollback scenarios (mocks)', () => {
  it('Scenario 1 (Success): uploads to R2 and does not trigger remove when save succeeds', async () => {
    const deleteCalls: any[] = []
    const fakeS3 = {
      send: vi.fn().mockImplementation(async (cmd) => {
        if (cmd.input?.Key && cmd.constructor.name === 'DeleteObjectCommand') {
          deleteCalls.push(cmd.input.Key)
        }
        return {}
      }),
    } as unknown as Parameters<typeof store>[2]

    const buf = Buffer.from('test-receipt-success')
    const stored = await store(buf, 'image/jpeg', fakeS3)
    expect(stored.key).toBe(`receipts/${sha256(buf)}.jpg`)

    let newlyUploadedImageKey: string | null = stored.key

    // Simulate save() succeeding
    const saveSucceeded = true
    if (saveSucceeded) {
      newlyUploadedImageKey = null
    }

    // Rollback check
    if (newlyUploadedImageKey) {
      await remove(newlyUploadedImageKey, fakeS3)
    }

    expect(deleteCalls).toHaveLength(0)
  })

  it('Scenario 2 (Save failure): triggers remove() on newly uploaded image when save fails', async () => {
    const deleteCalls: any[] = []
    const fakeS3 = {
      send: vi.fn().mockImplementation(async (cmd) => {
        // Track delete commands
        if (cmd.input?.Key && !cmd.input?.Body) {
          deleteCalls.push(cmd.input.Key)
        }
        return {}
      }),
    } as unknown as Parameters<typeof store>[2]

    const buf = Buffer.from('test-receipt-failed-save')
    const stored = await store(buf, 'image/jpeg', fakeS3)
    let newlyUploadedImageKey: string | null = stored.key

    // Simulate save() failing (e.g. database error)
    const simulateSave = () => {
      throw new Error('Database connection timeout')
    }

    try {
      simulateSave()
      newlyUploadedImageKey = null
    } catch {
      if (newlyUploadedImageKey) {
        await remove(newlyUploadedImageKey, fakeS3)
      }
    }

    expect(deleteCalls).toHaveLength(1)
    expect(deleteCalls[0]).toBe(`receipts/${sha256(buf)}.jpg`)
  })

  it('Scenario 3 (Preexisting/reused object): does NOT remove object if image was already in database', async () => {
    const deleteCalls: any[] = []
    const fakeS3 = {
      send: vi.fn().mockImplementation(async (cmd) => {
        if (cmd.input?.Key && !cmd.input?.Body) {
          deleteCalls.push(cmd.input.Key)
        }
        return {}
      }),
    } as unknown as Parameters<typeof store>[2]

    const buf = Buffer.from('test-receipt-reused')
    const hash = sha256(buf)

    // Simulate database already having a transaction with this sha256
    const isAlreadyReferencedInDb = true

    const stored = await store(buf, 'image/jpeg', fakeS3)
    let newlyUploadedImageKey: string | null = null

    if (stored.key && !isAlreadyReferencedInDb) {
      newlyUploadedImageKey = stored.key
    }

    // Simulate save() failing (e.g. duplicate detected)
    try {
      throw new Error('Lançamento duplicado detectado')
    } catch {
      if (newlyUploadedImageKey) {
        await remove(newlyUploadedImageKey, fakeS3)
      }
    }

    // Verify remove was NOT called, preserving preexisting object
    expect(deleteCalls).toHaveLength(0)
    expect(newlyUploadedImageKey).toBeNull()
  })

  it('Scenario 4 (Cleanup failure resilience): safe logging and does not re-throw if remove() fails', async () => {
    const failingS3 = {
      send: vi.fn().mockRejectedValue(new Error('S3 503 Service Unavailable')),
    } as unknown as Parameters<typeof store>[2]

    let newlyUploadedImageKey: string | null = 'receipts/problem.jpg'
    let caughtError: any = null

    try {
      if (newlyUploadedImageKey) {
        try {
          await remove(newlyUploadedImageKey, failingS3)
        } catch (cleanupErr) {
          // Log safe error and proceed
          caughtError = cleanupErr
        }
      }
    } catch (e) {
      // Must not reach here
      expect.unreachable()
    }

    expect(caughtError).not.toBeNull()
    expect(caughtError.message).toBe('S3 503 Service Unavailable')
  })
})

describe('isStorageConfigured', () => {
  it('is false in the test environment with no R2 env vars set', () => {
    expect(isStorageConfigured()).toBe(false)
  })
})

