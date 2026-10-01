import { getSupabaseClient } from './persist'

export interface AccountMetadata {
  closing_day?: number | null
  due_day?: number | null
  custom_logo?: string | null
  institution_key?: string | null
  color?: string | null
  skin?: string | null
}

/**
 * Reads all account metadata directly from Supabase accounts table.
 * Preserved for backwards compatibility with any existing callers.
 */
export async function readAccountsMetadata(): Promise<Record<string, AccountMetadata>> {
  const supabase = getSupabaseClient()
  if (!supabase) return {}

  try {
    const { data, error } = await supabase
      .from('accounts')
      .select('id, closing_day, due_day, custom_logo, color, skin')

    if (error || !data) return {}

    const result: Record<string, AccountMetadata> = {}
    for (const acc of data) {
      result[acc.id] = {
        closing_day: acc.closing_day,
        due_day: acc.due_day,
        custom_logo: acc.custom_logo,
        color: acc.color,
        skin: acc.skin,
      }
    }
    return result
  } catch {
    return {}
  }
}

/**
 * Deprecated no-op for file writing, kept for signature backwards-compatibility.
 */
export async function writeAccountsMetadata(_data: Record<string, AccountMetadata>): Promise<void> {
  // No-op: Supabase is the single source of truth
}

export async function getAccountMetadata(accountId: string): Promise<AccountMetadata> {
  const supabase = getSupabaseClient()
  if (!supabase) return {}

  try {
    const { data, error } = await supabase
      .from('accounts')
      .select('closing_day, due_day, custom_logo, color, skin')
      .eq('id', accountId)
      .single()

    if (error || !data) return {}
    return {
      closing_day: data.closing_day,
      due_day: data.due_day,
      custom_logo: data.custom_logo,
      color: data.color,
      skin: data.skin,
    }
  } catch {
    return {}
  }
}

export async function updateAccountMetadata(
  accountId: string,
  metadata: AccountMetadata
): Promise<AccountMetadata> {
  const supabase = getSupabaseClient()
  if (!supabase) return metadata

  try {
    const updates: Record<string, any> = {}
    if (metadata.closing_day !== undefined) updates.closing_day = metadata.closing_day
    if (metadata.due_day !== undefined) updates.due_day = metadata.due_day
    if (metadata.custom_logo !== undefined) updates.custom_logo = metadata.custom_logo
    if (metadata.color !== undefined) updates.color = metadata.color
    if (metadata.skin !== undefined) updates.skin = metadata.skin

    if (Object.keys(updates).length > 0) {
      await supabase.from('accounts').update(updates).eq('id', accountId)
    }

    return await getAccountMetadata(accountId)
  } catch {
    return metadata
  }
}

export async function removeAccountMetadata(accountId: string): Promise<void> {
  const supabase = getSupabaseClient()
  if (!supabase) return

  try {
    await supabase.from('accounts').update({
      closing_day: null,
      due_day: null,
      custom_logo: null,
      color: null,
      skin: null,
    }).eq('id', accountId)
  } catch {
    // Ignore cleanup failure
  }
}
