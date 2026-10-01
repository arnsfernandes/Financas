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

// Known payment gateway / processor prefixes that are placed before an actual merchant
// (e.g. "PAG*PADARIA", "STONE*LOJA", "SUMUP*MERCADO", "IFOOD *RESTAURANTE")
const PROCESSOR_PREFIXES: RegExp[] = [
  /^(pag\s*\*+|pagseguro\s*\*+|pagar\s*\.?\s*me\s*\*+)\s*/i,
  /^(stone\s*\*+|ton\s*\*+|sumup\s*\*+|cielo\s*\*+|rede\s*\*+|getnet\s*\*+|infinitepay\s*\*+)\s*/i,
  /^(paypal\s*\*+|stripe\s*\*+|hotmart\s*\*+|kiwify\s*\*+|edzz\s*\*+|monetizze\s*\*+|dl\s*\*+)\s*/i,
  /^(ifood\s*\*+)\s*/i,
  /^(mp\s*\*+)\s*/i,
]

// Trailing random alphanumeric transaction / terminal codes like "*ABC123", "*1234", "- ECOMMERCE"
const TRANSACTION_SUFFIXES: RegExp[] = [
  /\*+[a-z0-9_\-]{2,}$/i,
  /\s+-\s+(ecommerce|internet|app|web|online|pos|tef)$/i,
]

// Common known chains / franchises / stores and their main canonical identity
const KNOWN_CHAINS: { name: string; aliases: string[] }[] = [
  { name: 'Carrefour', aliases: ['carrefour', 'carrefur', 'hipermercado carrefour', 'supermercado carrefour'] },
  { name: 'Pão de Açúcar', aliases: ['pao de acucar', 'pão de açúcar', 'pao de acucar supermercados', 'gpa', 'minuto pao de acucar', 'minuto pão de açúcar'] },
  { name: 'Extra Supermercados', aliases: ['extra', 'extra supermercados', 'extra hiper', 'mercardo extra'] },
  { name: 'Assaí Atacadista', aliases: ['assai', 'assaí', 'assai atacadista', 'assaí atacadista'] },
  { name: 'Atacadão', aliases: ['atacadao', 'atacadão'] },
  { name: 'Dia Supermercado', aliases: ['dia', 'supermercado dia', 'dia supermercados', 'dia brasil'] },
  { name: 'St. Marche', aliases: ['st marche', 'st. marche', 'saint marche', 'stmarche'] },
  { name: 'Mambo Supermercados', aliases: ['mambo', 'supermercados mambo', 'mambo supermercados'] },
  { name: 'Natural da Terra / Hortifruti', aliases: ['natural da terra', 'hortifruti', 'hortifruti natural da terra', 'hortifruti/natural da terra'] },
  { name: 'Sam\'s Club', aliases: ['sams club', 'sam\'s club', 'sams', 'samsclub'] },
  { name: 'Mercado Livre', aliases: ['mercado livre', 'mercadolivre', 'meli', 'mercadopago', 'mercado pago', 'envios mercado livre', 'mp mercadolivre'] },
  { name: 'Amazon', aliases: ['amazon', 'amazon brasil', 'amazon.com.br', 'amazon mktp', 'amazon marketplace', 'amzn mktp'] },
  { name: 'Shopee', aliases: ['shopee', 'shopee brasil', 'shopee pay'] },
  { name: 'Magalu', aliases: ['magazine luiza', 'magalu', 'magazineluiza'] },
  { name: 'Drogasil', aliases: ['drogasil', 'drogaria drogasil', 'drogasil s.a.'] },
  { name: 'Droga Raia', aliases: ['droga raia', 'raia', 'drogaraia', 'rd raiadrogasil'] },
  { name: 'Drogaria Pacheco', aliases: ['pacheco', 'drogaria pacheco', 'drogarias pacheco'] },
  { name: 'Drogaria São Paulo', aliases: ['drogaria sao paulo', 'drogaria são paulo', 'drogarias sao paulo', 'dpsp'] },
  { name: 'Panvel Farmácias', aliases: ['panvel', 'panvel farmacias', 'dimed panvel'] },
  { name: 'McDonald\'s', aliases: ['mcdonalds', 'mcdonald\'s', 'mc donalds', 'arcos dourados', 'mcdonald'] },
  { name: 'Burger King', aliases: ['burger king', 'bk brasil', 'bk', 'burgerking'] },
  { name: 'Subway', aliases: ['subway'] },
  { name: 'Starbucks', aliases: ['starbucks', 'starbucks brasil'] },
  { name: 'iFood', aliases: ['ifood', 'i food', 'ifood brasil', 'ifood com'] },
  { name: 'Rappi', aliases: ['rappi', 'rappi brasil'] },
  { name: 'Uber', aliases: ['uber', 'uber trip', 'uber *trip', 'uber *eats', 'uber eats', 'uber bv', 'uber br', 'uber do brasil'] },
  { name: '99 App', aliases: ['99app', '99 pop', '99 táxi', '99 taxi', '99', '99pay', '99 tecnologia'] },
  { name: 'Posto Shell', aliases: ['shell', 'posto shell', 'postos shell', 'raizen shell', 'shell box'] },
  { name: 'Posto Ipiranga', aliases: ['ipiranga', 'posto ipiranga', 'postos ipiranga', 'abastece ai', 'abastece aí'] },
  { name: 'Posto Petrobras (BR)', aliases: ['petrobras', 'posto petrobras', 'posto br', 'vibra energia', 'premmia'] },
  { name: 'Netflix', aliases: ['netflix', 'netflix.com', 'netflix entretenimento'] },
  { name: 'Spotify', aliases: ['spotify', 'spotify ab', 'spotify brasil'] },
  { name: 'Apple', aliases: ['apple.com/bill', 'apple', 'apple services', 'itunes', 'apple store'] },
  { name: 'Google', aliases: ['google play', 'google cloud', 'google storage', 'google workspace', 'google', 'google pay', 'google brasil'] },
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
 * Compact normalized key for matching variants without spaces/punctuation (e.g. "mercadolivre" === "mercado livre")
 */
export function compactVendorText(text: string): string {
  return cleanVendorText(text).replace(/\s+/g, '')
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

  // Helper function to match a string against KNOWN_CHAINS
  const matchKnownChain = (str: string, branch: string | null): ParsedVendorInfo | null => {
    let norm = cleanVendorText(str)
    for (const suffix of LEGAL_SUFFIXES) {
      norm = norm.replace(suffix, ' ')
    }
    norm = norm.replace(/\s+/g, ' ').trim()
    const compact = norm.replace(/\s+/g, '')

    for (const chain of KNOWN_CHAINS) {
      for (const alias of chain.aliases) {
        const aliasClean = cleanVendorText(alias)
        const aliasCompact = aliasClean.replace(/\s+/g, '')

        if (
          norm === aliasClean ||
          compact === aliasCompact ||
          norm.startsWith(`${aliasClean} `) ||
          norm.endsWith(` ${aliasClean}`) ||
          norm.includes(` ${aliasClean} `)
        ) {
          if (branch) {
            return {
              canonicalName: `${chain.name} (${toVendorTitleCase(branch)})`,
              normalizedKey: `${cleanVendorText(chain.name)}:${cleanVendorText(branch)}`,
              branchInfo: branch,
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
    return null
  }

  // 1. Strip processor prefixes first (e.g. "MP * MERCADOLIVRE" -> "MERCADOLIVRE", "PAG*PADARIA" -> "PADARIA", "IFOOD *RESTAURANTE" -> "RESTAURANTE")
  let stripped = rawClean
  for (const prefix of PROCESSOR_PREFIXES) {
    const after = stripped.replace(prefix, '').trim()
    if (after.length > 0) {
      stripped = after
    }
  }

  // 2. Strip trailing transaction codes (e.g. "*ABC123", "*12345", "- ECOMMERCE")
  for (const suffix of TRANSACTION_SUFFIXES) {
    const after = stripped.replace(suffix, '').trim()
    if (after.length > 0) {
      stripped = after
    }
  }

  // 3. Check for branch information (e.g. "Loja 12", "Shopping Morumbi", "Av. Paulista")
  let branchInfo: string | null = null
  let normalizedClean = cleanVendorText(stripped)
  for (const pattern of BRANCH_PATTERNS) {
    const match = stripped.match(pattern)
    if (match) {
      branchInfo = match[0].trim()
      normalizedClean = normalizedClean.replace(cleanVendorText(match[0]), ' ').replace(/\s+/g, ' ').trim()
      break
    }
  }

  // 4. Remove legal suffixes
  for (const suffix of LEGAL_SUFFIXES) {
    normalizedClean = normalizedClean.replace(suffix, ' ')
  }
  normalizedClean = normalizedClean.replace(/\s+/g, ' ').trim()

  // 5. Match against known chains (with or without branch)
  const chainMatch = matchKnownChain(normalizedClean, branchInfo)
  if (chainMatch) {
    return chainMatch
  }

  // 6. Default standard fallback
  if (!normalizedClean || normalizedClean.length < 2) {
    normalizedClean = cleanVendorText(rawClean)
  }

  let canonicalName = toVendorTitleCase(normalizedClean)
  let normalizedKey = cleanVendorText(normalizedClean)

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
