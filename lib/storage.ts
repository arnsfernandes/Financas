import { createHash } from 'node:crypto'
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'

/**
 * Original-image storage on Cloudflare R2.
 *
 * R2 speaks the S3 API, so I use the AWS S3 client pointed at the R2 endpoint.
 * Storage is optional: when the R2 environment variables are absent, `store`
 * is a no-op that returns a null key, so the scanner still runs end to end
 * without any object store configured. Wire R2 in when you need an audit trail
 * of the originals an auditor or tax office can ask for.
 */

export interface StoredImage {
  key: string | null
  sha256: string
}

const BUCKET = process.env.R2_BUCKET
const ACCOUNT = process.env.R2_ACCOUNT_ID
const ACCESS_KEY = process.env.R2_ACCESS_KEY_ID
const SECRET_KEY = process.env.R2_SECRET_ACCESS_KEY

export function isStorageConfigured(): boolean {
  return Boolean(BUCKET && ACCOUNT && ACCESS_KEY && SECRET_KEY)
}

let cachedClient: S3Client | null = null

function client(): S3Client {
  if (!cachedClient) {
    cachedClient = new S3Client({
      region: 'auto',
      endpoint: `https://${ACCOUNT}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: ACCESS_KEY!, secretAccessKey: SECRET_KEY! },
    })
  }
  return cachedClient
}

export function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex')
}

/**
 * Build the object key for an image. Content-addressed by hash so the same
 * receipt photographed twice lands on the same key, which doubles as cheap
 * deduplication.
 */
export function imageKey(hash: string, contentType: string): string {
  const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg'
  return `receipts/${hash}.${ext}`
}

/**
 * Store an original image and return its key plus content hash. When R2 is not
 * configured the key is null but the hash is still computed, so deduplication
 * and audit hashing work regardless of whether an object store is present.
 *
 * Pass a client to inject a stub in tests; production omits it.
 */
export async function store(
  buffer: Buffer,
  contentType: string,
  s3: S3Client | null = isStorageConfigured() ? client() : null,
): Promise<StoredImage> {
  const hash = sha256(buffer)
  if (!s3) {
    return { key: null, sha256: hash }
  }
  const key = imageKey(hash, contentType)
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    }),
  )
  return { key, sha256: hash }
}

/**
 * Fetch a stored original back as a Buffer. Throws if storage is not
 * configured, since there is nothing to fetch from.
 */
export async function fetch(
  key: string,
  s3: S3Client = client(),
): Promise<Buffer> {
  if (!isStorageConfigured()) {
    throw new Error('R2 storage is not configured')
  }
  const res = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }))
  const bytes = await res.Body!.transformToByteArray()
  return Buffer.from(bytes)
}

/**
 * Remove an image from storage by key. Safe no-op if storage is not configured
 * or key is null/empty.
 */
export async function remove(
  key: string | null | undefined,
  s3: S3Client | null = isStorageConfigured() ? client() : null,
): Promise<void> {
  if (!key || !s3) {
    return
  }
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }))
}
