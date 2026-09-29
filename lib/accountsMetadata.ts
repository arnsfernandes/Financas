export interface AccountMetadata {
  closing_day?: number | null
  due_day?: number | null
  custom_logo?: string | null
  institution_key?: string | null
  color?: string | null
  skin?: string | null
}

async function getFs() {
  if (typeof window !== 'undefined') return null
  try {
    return await import('fs/promises')
  } catch {
    return null
  }
}

async function getPath() {
  if (typeof window !== 'undefined') return null
  try {
    return await import('path')
  } catch {
    return null
  }
}

async function getMetadataFilePath(): Promise<string | null> {
  const pathModule = await getPath()
  if (!pathModule) return null
  return pathModule.join(process.cwd(), 'data', 'accounts_metadata.json')
}

async function ensureDataDir(): Promise<void> {
  const fsModule = await getFs()
  const pathModule = await getPath()
  if (!fsModule || !pathModule) return
  try {
    await fsModule.mkdir(pathModule.join(process.cwd(), 'data'), { recursive: true })
  } catch {
    // Directory already exists or cannot be created
  }
}

export async function readAccountsMetadata(): Promise<Record<string, AccountMetadata>> {
  if (typeof window !== 'undefined') return {}
  const fsModule = await getFs()
  const filePath = await getMetadataFilePath()
  if (!fsModule || !filePath) return {}

  await ensureDataDir()
  try {
    const raw = await fsModule.readFile(filePath, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

export async function writeAccountsMetadata(data: Record<string, AccountMetadata>): Promise<void> {
  if (typeof window !== 'undefined') return
  const fsModule = await getFs()
  const filePath = await getMetadataFilePath()
  if (!fsModule || !filePath) return

  await ensureDataDir()
  await fsModule.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8')
}

export async function getAccountMetadata(accountId: string): Promise<AccountMetadata> {
  const all = await readAccountsMetadata()
  return all[accountId] || {}
}

export async function updateAccountMetadata(
  accountId: string,
  metadata: AccountMetadata
): Promise<AccountMetadata> {
  const all = await readAccountsMetadata()
  const existing = all[accountId] || {}
  const updated: AccountMetadata = {
    ...existing,
    ...metadata,
  }
  all[accountId] = updated
  await writeAccountsMetadata(all)
  return updated
}
