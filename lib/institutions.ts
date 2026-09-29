/**
 * Institution visual identity registry and normalization logic.
 * Provides normalized keys, brand colors, SVG logo definitions, and fallback helpers
 * for Brazilian financial institutions without requiring real-time internet requests.
 */

export interface InstitutionInfo {
  key: string
  name: string
  shortName: string
  primaryColor: string
  secondaryColor?: string
  textColor: string
  keywords: string[]
}

export const KNOWN_INSTITUTIONS: InstitutionInfo[] = [
  {
    key: 'nubank',
    name: 'Nubank',
    shortName: 'Nu',
    primaryColor: '#820AD1',
    textColor: '#FFFFFF',
    keywords: ['nubank', 'nu', 'roxinho', 'nu pagamentos', 'nu finance'],
  },
  {
    key: 'inter',
    name: 'Banco Inter',
    shortName: 'Inter',
    primaryColor: '#FF7A00',
    textColor: '#FFFFFF',
    keywords: ['inter', 'banco inter', 'intermedium', 'inter pag'],
  },
  {
    key: 'itau',
    name: 'Itaú',
    shortName: 'Itaú',
    primaryColor: '#EC7000',
    secondaryColor: '#003399',
    textColor: '#FFFFFF',
    keywords: ['itau', 'itaú', 'itau unibanco', 'unibanco', 'iti', 'itaucard'],
  },
  {
    key: 'bradesco',
    name: 'Bradesco',
    shortName: 'Bradesco',
    primaryColor: '#CC092F',
    textColor: '#FFFFFF',
    keywords: ['bradesco', 'banco bradesco', 'bradescard', 'next'],
  },
  {
    key: 'santander',
    name: 'Santander',
    shortName: 'Santander',
    primaryColor: '#EC0000',
    textColor: '#FFFFFF',
    keywords: ['santander', 'banco santander', 'sx'],
  },
  {
    key: 'caixa',
    name: 'Caixa Econômica',
    shortName: 'Caixa',
    primaryColor: '#005CA9',
    secondaryColor: '#F37021',
    textColor: '#FFFFFF',
    keywords: ['caixa', 'caixa economica', 'caixa econômica', 'caixa economica federal', 'cef'],
  },
  {
    key: 'bb',
    name: 'Banco do Brasil',
    shortName: 'BB',
    primaryColor: '#FFF159',
    secondaryColor: '#003882',
    textColor: '#003882',
    keywords: ['banco do brasil', 'bb', 'bancodobrasil', 'ourocard'],
  },
  {
    key: 'c6',
    name: 'C6 Bank',
    shortName: 'C6',
    primaryColor: '#242424',
    textColor: '#FFFFFF',
    keywords: ['c6', 'c6 bank', 'c6bank'],
  },
  {
    key: 'picpay',
    name: 'PicPay',
    shortName: 'PicPay',
    primaryColor: '#11C76F',
    textColor: '#FFFFFF',
    keywords: ['picpay', 'pic pay'],
  },
  {
    key: 'mercadopago',
    name: 'Mercado Pago',
    shortName: 'Mercado Pago',
    primaryColor: '#009EE3',
    textColor: '#FFFFFF',
    keywords: ['mercado pago', 'mercadopago', 'mercado livre', 'mercadolivre'],
  },
  {
    key: 'btg',
    name: 'BTG Pactual',
    shortName: 'BTG',
    primaryColor: '#0B1E36',
    textColor: '#FFFFFF',
    keywords: ['btg', 'btg pactual'],
  },
  {
    key: 'pagbank',
    name: 'PagBank',
    shortName: 'PagBank',
    primaryColor: '#00A859',
    textColor: '#FFFFFF',
    keywords: ['pagbank', 'pagseguro', 'pag bank', 'pag seguro'],
  },
  {
    key: 'sicoob',
    name: 'Sicoob',
    shortName: 'Sicoob',
    primaryColor: '#003641',
    textColor: '#FFFFFF',
    keywords: ['sicoob', 'bancoob'],
  },
  {
    key: 'sicredi',
    name: 'Sicredi',
    shortName: 'Sicredi',
    primaryColor: '#007A33',
    textColor: '#FFFFFF',
    keywords: ['sicredi'],
  },
  {
    key: 'xp',
    name: 'XP Investimentos',
    shortName: 'XP',
    primaryColor: '#000000',
    textColor: '#FFFFFF',
    keywords: ['xp', 'xp investimentos', 'xpi'],
  },
  {
    key: 'neon',
    name: 'Neon',
    shortName: 'Neon',
    primaryColor: '#00E5FF',
    textColor: '#0A2540',
    keywords: ['neon', 'banco neon'],
  },
]

/**
 * Normalizes an arbitrary text (e.g. from user input, institution name, or account name)
 * to match one of the known institution keys.
 */
export function normalizeInstitutionKey(input?: string | null): string | null {
  if (!input || typeof input !== 'string') return null

  // Strip diacritics, lowercase and clean special chars
  const clean = input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()

  if (!clean) return null

  // 1. Direct match on key or keywords
  for (const inst of KNOWN_INSTITUTIONS) {
    if (inst.key === clean) return inst.key
    for (const kw of inst.keywords) {
      if (clean === kw) return inst.key
    }
  }

  // 2. Substring / Token match (e.g. "Cartão Nubank Roxinho", "Banco Inter S.A.", "Itaú Unibanco")
  const tokens = clean.split(/[\s\-_.,/]+/).filter(Boolean)

  for (const inst of KNOWN_INSTITUTIONS) {
    for (const kw of inst.keywords) {
      // If kw is single token like 'nubank', 'inter', check if tokens contain it
      if (!kw.includes(' ')) {
        if (tokens.includes(kw)) return inst.key
      } else {
        // Multi-word keyword, check if clean string contains it as phrase
        if (clean.includes(kw)) return inst.key
      }
    }
  }

  return null
}

/**
 * Get institution details by normalized key or raw string
 */
export function getInstitutionInfo(input?: string | null): InstitutionInfo | null {
  const key = normalizeInstitutionKey(input)
  if (!key) return null
  return KNOWN_INSTITUTIONS.find((i) => i.key === key) || null
}

/**
 * Extracts 1-2 uppercase characters from a name to serve as clean monogram fallback
 */
export function getFallbackInitials(name?: string | null): string {
  if (!name || typeof name !== 'string') return '?'
  const clean = name.trim().replace(/[^a-zA-Z0-9À-ÿ\s]/g, '')
  const parts = clean.split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase()
  }
  return (parts[0][0] + parts[1][0]).toUpperCase()
}
