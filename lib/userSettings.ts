/**
 * Preferências por usuário guardadas no banco (tabela user_settings).
 * Se a tabela ainda não existir (migração não aplicada), as leituras devolvem null e as gravações
 * devolvem { ok: false, missingTable: true } — as telas mostram como ativar, sem quebrar.
 */
import { getSupabaseClient } from './persist'

export type SettingKey = 'budgets' | 'bank_ignore'

function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  return Boolean(error && (error.code === '42P01' || error.code === 'PGRST205' || /user_settings/i.test(error.message || '')))
}

export async function getSetting<T>(userId: string, key: SettingKey): Promise<{ value: T | null; available: boolean }> {
  const supabase = getSupabaseClient()
  if (!supabase) return { value: null, available: false }
  const { data, error } = await supabase.from('user_settings').select('value').eq('user_id', userId).eq('key', key).maybeSingle()
  if (error) return { value: null, available: !isMissingTable(error) }
  return { value: (data?.value as T) ?? null, available: true }
}

export async function setSetting<T>(userId: string, key: SettingKey, value: T): Promise<{ ok: boolean; missingTable?: boolean; error?: string }> {
  const supabase = getSupabaseClient()
  if (!supabase) return { ok: false, error: 'Banco indisponível' }
  const { error } = await supabase
    .from('user_settings')
    .upsert({ user_id: userId, key, value, updated_at: new Date().toISOString() }, { onConflict: 'user_id,key' })
  if (error) return { ok: false, missingTable: isMissingTable(error), error: error.message }
  return { ok: true }
}
