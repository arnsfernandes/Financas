import type { SupabaseClient } from '@supabase/supabase-js'

export interface ParsedVendorInfo {
  canonicalName: string
  normalizedKey: string
  branchInfo: string | null
}

// Known common legal suffix patterns to remove safely
const LEGAL_SUFFIXES: RegExp[] = [
  /\b(s\/?a|s\.a\.|sociedade\s+anonima|sociedade\s+anônima)\b/gi,
  /\b(ltda|ltd|limitada|eireli|me|epp|me\b|epp\b|eireli\b)\b/gi,
  /\b(comercio\s+varejista|comércio\s+varejista|comercio|comércio|supermercados?|hipermercados?)\b/gi,
  /\b(distribuidora|participacoes|participações|servicos|serviços|do\s+brasil|brasil)\b/gi,
]

// Common known chains / franchises / stores and their main canonical identity
const KNOWN_CHAINS: { name: string; aliases: string[] }[] = [
  { name: 'Carrefour', aliases: ['carrefour', 'carrefur'] },
  { name: 'Pão de Açúcar', aliases: ['pao de acucar', 'pão de açúcar', 'pao de acucar supermercados', 'gpa'] },
  { name: 'Extra Supermercados', aliases: ['extra', 'extra supermercados', 'extra hiper'] },
  { name: 'Assaí Atacadista', aliases: ['assai', 'assaí', 'assai atacadista', 'assaí atacadista'] },
  { name: 'Atacadão', aliases: ['atacadao', 'atacadão'] },
  { name: 'Dia Supermercado', aliases: ['dia', 'supermercado dia', 'dia supermercados', 'dia brasil'] },
  { name: 'St. Marche', aliases: ['st marche', 'st. marche', 'saint marche'] },
  { name: 'Mambo Supermercados', aliases: ['mambo', 'supermercados mambo', 'mambo supermercados'] },
  { name: 'Natural da Terra / Hortifruti', aliases: ['natural da terra', 'hortifruti', 'hortifruti natural da terra'] },
  { name: 'Sam\'s Club', aliases: ['sams club', 'sam\'s club', 'sams'] },
  { name: 'Mercado Livre', aliases: ['mercado livre', 'mercadolivre', 'meli'] },
  { name: 'Amazon', aliases: ['amazon', 'amazon brasil', 'amazon.com.br'] },
  { name: 'Shopee', aliases: ['shopee', 'shopee brasil'] },
  { name: 'Magalu', aliases: ['magazine luiza', 'magalu'] },
  { name: 'Drogasil', aliases: ['drogasil', 'drogaria drogasil', 'drogasil s.a.'] },
  { name: 'Droga Raia', aliases: ['droga raia', 'raia', 'drogaraia', 'rd raiadrogasil'] },
  { name: 'Drogaria Pacheco', aliases: ['pacheco', 'drogaria pacheco', 'drogarias pacheco'] },
  { name: 'Drogaria São Paulo', aliases: ['drogaria sao paulo', 'drogaria são paulo', 'drogarias sao paulo'] },
  { name: 'Panvel Farmácias', aliases: ['panvel', 'panvel farmacias', 'dimed panvel'] },
  { name: 'McDonald\'s', aliases: ['mcdonalds', 'mcdonald\'s', 'mc donalds', 'arcos dourados'] },
  { name: 'Burger King', aliases: ['burger king', 'bk brasil', 'bk'] },
  { name: 'Subway', aliases: ['subway'] },
  { name: 'Starbucks', aliases: ['starbucks', 'starbucks brasil'] },
  { name: 'iFood', aliases: ['ifood', 'i food'] },
  { name: 'Rappi', aliases: ['rappi'] },
  { name: 'Uber', aliases: ['uber', 'uber trip', 'uber *trip', 'uber *eats'] },
  { name: '99 App', aliases: ['99app', '99 pop', '99 táxi', '99 taxi', '99'] },
  { name: 'Posto Shell', aliases: ['shell', 'posto shell', 'postos shell', 'raizen shell'] },
  { name: 'Posto Ipiranga', aliases: ['ipiranga', 'posto ipiranga', 'postos ipiranga'] },
  { name: 'Posto Petrobras (BR)', aliases: ['petrobras', 'posto petrobras', 'posto br', 'vibra energia'] },
  { name: 'Netflix', aliases: ['netflix', 'netflix.com'] },
  { name: 'Spotify', aliases: ['spotify'] },
  { name: 'Apple', aliases: ['apple.com/bill', 'apple', 'apple services', 'itunes'] },
  { name: 'Google', aliases: ['google play', 'google cloud', 'google storage', 'google workspace', 'google'] },
]

// Patterns indicating a distinct branch/store unit (e.g. "Loja 12", "Shopping Iguatemi", "Filial Centro", "Unidade Moema", "Av. Paulista")
const BRANCH_PATTERNS: RegExp[] = [
  /\b(loja|lj|filial|unidade|unid|posto|agencia|agência)\s*([0-9a-zA-Z\-_]+)\b/i,
  /\b(shopping|shopp?|sh\.)\s+([a-zA-Z0-9\s\-_]+)/i,
  /\b(av|avenida|rua|r\.|alameda|al\.|estrada|rodovia|rod\.)\s+([a-zA-Z0-9\s\-_]+)/i,
]

/**
 * Normalises raw string: lowercases, strips accents and unwanted symbols
 */
export function cleanVendorText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Converts string to proper title case (e.g. "carrefour express" -> "Carrefour Express")
 */
export function toVendorTitleCase(str: string): string {
  const minorWords = ['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'para', 'com']
  return str
    .toLowerCase()
    .split(' ')
    .filter(Boolean)
    .map((word, index) => {
      if (index > 0 && minorWords.includes(word)) {
        return word
      }
      return word.charAt(0).toUpperCase() + word.slice(1)
    })
    .join(' ')
}

/**
 * Parses a raw vendor name into a canonical representation.
 * Deterministic and transparent without AI.
 */
export function parseVendor(rawVendor: string): ParsedVendorInfo {
  if (!rawVendor || !rawVendor.trim()) {
    return {
      canonicalName: 'Outros',
      normalizedKey: 'outros',
      branchInfo: null,
    }
  }

  const rawClean = rawVendor.trim()
  let cleaned = cleanVendorText(rawClean)

  // 1. Check for specific branch information (e.g. "Loja 12", "Shopping Morumbi")
  let branchInfo: string | null = null
  for (const pattern of BRANCH_PATTERNS) {
    const match = rawClean.match(pattern)
    if (match) {
      branchInfo = match[0].trim()
      // Remove branch string from core identifier so root matching can occur
      cleaned = cleaned.replace(cleanVendorText(match[0]), ' ').replace(/\s+/g, ' ').trim()
      break
    }
  }

  // 2. Remove legal suffixes (LTDA, S/A, EIRELI, etc.)
  for (const suffix of LEGAL_SUFFIXES) {
    cleaned = cleaned.replace(suffix, ' ')
  }
  cleaned = cleaned.replace(/\s+/g, ' ').trim()

  // 3. Match against known chains
  for (const chain of KNOWN_CHAINS) {
    for (const alias of chain.aliases) {
      const aliasClean = cleanVendorText(alias)
      // Check exact match or starts with / distinct word match
      const regex = new RegExp(`^${aliasClean}\\b|\\b${aliasClean}$|^${aliasClean}$`, 'i')
      if (regex.test(cleaned) || cleaned === aliasClean) {
        // If branchInfo exists, keep it in the key & name if specified
        if (branchInfo) {
          const canonicalWithBranch = `${chain.name} (${toVendorTitleCase(branchInfo)})`
          const normalizedKeyWithBranch = `${cleanVendorText(chain.name)}:${cleanVendorText(branchInfo)}`
          return {
            canonicalName: canonicalWithBranch,
            normalizedKey: normalizedKeyWithBranch,
            branchInfo,
          }
        }

        return {
          canonicalName: chain.name,
          normalizedKey: cleanVendorText(chain.name),
          branchInfo: null,
        }
      }
    }
  }

  // 4. Default: Standardize title casing and normalized key
  if (!cleaned || cleaned.length < 2) {
    cleaned = cleanVendorText(rawClean)
  }

  let canonicalName = toVendorTitleCase(cleaned)
  let normalizedKey = cleanVendorText(cleaned)

  if (branchInfo) {
    canonicalName = `${canonicalName} (${toVendorTitleCase(branchInfo)})`
    normalizedKey = `${normalizedKey}:${cleanVendorText(branchInfo)}`
  }

  return {
    canonicalName,
    normalizedKey,
    branchInfo,
  }
}

/**
 * Find or create a canonical vendor in Supabase and return its ID
 */
export async function getOrCreateCanonicalVendor(
  supabase: SupabaseClient | any,
  rawVendor?: string | null,
  category?: string | null
): Promise<{ vendorId: string | null; parsed: ParsedVendorInfo }> {
  if (!rawVendor || !rawVendor.trim()) {
    return {
      vendorId: null,
      parsed: {
        canonicalName: 'Outros',
        normalizedKey: 'outros',
        branchInfo: null,
      },
    }
  }

  const parsed = parseVendor(rawVendor)
  if (!supabase) {
    return { vendorId: null, parsed }
  }

  try {
    const tableRef = supabase.from('canonical_vendors')
    if (!tableRef || typeof tableRef.select !== 'function') {
      return { vendorId: null, parsed }
    }

    // 1. Try to find existing canonical vendor by normalized_key or by alias
    const { data: existing } = await tableRef
      .select('id, canonical_name, normalized_key, aliases')
      .or(`normalized_key.eq.${parsed.normalizedKey},aliases.cs.{${cleanVendorText(rawVendor)}}`)
      .maybeSingle()

    if (existing?.id) {
      return { vendorId: existing.id, parsed }
    }

    if (typeof tableRef.upsert !== 'function') {
      return { vendorId: null, parsed }
    }

    // 2. Insert new canonical vendor
    const rawClean = cleanVendorText(rawVendor)
    const aliases = rawClean !== parsed.normalizedKey ? [rawClean] : []

    const { data: inserted, error: insertError } = await tableRef
      .upsert(
        {
          canonical_name: parsed.canonicalName,
          normalized_key: parsed.normalizedKey,
          category: category || null,
          aliases,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'normalized_key' }
      )
      .select('id')
      .single()

    if (inserted?.id) {
      return { vendorId: inserted.id, parsed }
    }

    if (insertError) {
      console.warn('Could not upsert canonical_vendor:', insertError.message)
    }
  } catch {
    // Graceful fallback in mock environments
  }

  return { vendorId: null, parsed }
}
