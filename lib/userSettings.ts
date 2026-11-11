/**
 * Preferências por usuário (orçamentos por categoria, destinos de extrato que não são gasto…).
 *
 * Onde ficam:
 *  1. tabela `user_settings` (migração 20261111090000), quando existir;
 *  2. senão, uma linha `app_setting` na tabela `reminder_logs`, que já existe e tem um campo JSON
 *     livre. Os lembretes só gravam nessa tabela (nunca leem dela), então essas linhas não interferem.
 */
import { getSupabaseClient } from './persist'

export type SettingKey = 'budgets' | 'bank_ignore'

function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  return Boolean(error && (error.code === '42P01' || error.code === 'PGRST205' || /user_settings/i.test(error.message || '')))
}

const fallbackKey = (userId: string, key: SettingKey) => `app_setting:${userId}:${key}`

export async function getSetting<T>(userId: string, key: SettingKey): Promise<{ value: T | null; available: boolean }> {
  const supabase = getSupabaseClient()
  if (!supabase) return { value: null, available: false }
  const { data, error } = await supabase.from('user_settings').select('value').eq('user_id', userId).eq('key', key).maybeSingle()
  if (!error) return { value: (data?.value as T) ?? null, available: true }
  if (!isMissingTable(error)) return { value: null, available: false }
  const fb = await supabase.from('reminder_logs').select('metadata').eq('dedup_key', fallbackKey(userId, key)).maybeSingle()
  if (fb.error) return { value: null, available: false }
  return { value: (fb.data?.metadata as T) ?? null, available: true }
}

export async function setSetting<T>(userId: string, key: SettingKey, value: T): Promise<{ ok: boolean; missingTable?: boolean; error?: string }> {
  const supabase = getSupabaseClient()
  if (!supabase) return { ok: false, error: 'Banco indisponível' }
  const now = new Date().toISOString()
  const { error } = await supabase
    .from('user_settings')
    .upsert({ user_id: userId, key, value, updated_at: now }, { onConflict: 'user_id,key' })
  if (!error) return { ok: true }
  if (!isMissingTable(error)) return { ok: false, error: error.message }
  const fb = await supabase.from('reminder_logs').upsert(
    {
      dedup_key: fallbackKey(userId, key),
      user_id: 0,
      auth_user_id: userId,
      type: 'app_setting',
      entity_id: key,
      stage: 'setting',
      status: 'stored',
      sent_at: now,
      metadata: value,
    },
    { onConflict: 'dedup_key' },
  )
  if (fb.error) return { ok: false, error: fb.error.message }
  return { ok: true }
}
