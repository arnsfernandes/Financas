/**
 * Canonical product parser & identifier module
 * Extracts brand, product type, unit size, and computes a deterministic normalized key.
 */

export interface ParsedProductInfo {
  brand: string | null
  productType: string
  unitSize: string | null
  canonicalName: string
  normalizedKey: string
}

// Known common brands in Portuguese receipts/supermarkets
const KNOWN_BRANDS: { brand: string; aliases: string[] }[] = [
  { brand: 'Barilla', aliases: ['barilla'] },
  { brand: 'Nestlé', aliases: ['nestle', 'nestlé'] },
  { brand: 'Qualy', aliases: ['qualy'] },
  { brand: 'Sadia', aliases: ['sadia'] },
  { brand: 'Perdigão', aliases: ['perdigao', 'perdigão'] },
  { brand: 'Seara', aliases: ['seara'] },
  { brand: 'Pilão', aliases: ['pilao', 'pilão'] },
  { brand: '3 Corações', aliases: ['3 coracoes', '3 corações', 'tres coracoes', 'tres corações'] },
  { brand: 'Melitta', aliases: ['melitta'] },
  { brand: 'Coca-Cola', aliases: ['coca cola', 'coca-cola', 'coca'] },
  { brand: 'Pepsi', aliases: ['pepsi'] },
  { brand: 'Guaraná Antarctica', aliases: ['guarana antarctica', 'guaraná antarctica', 'antartica', 'antarctica'] },
  { brand: 'Heineken', aliases: ['heineken'] },
  { brand: 'Amstel', aliases: ['amstel'] },
  { brand: 'Stella Artois', aliases: ['stella artois', 'stella'] },
  { brand: 'Corona', aliases: ['corona'] },
  { brand: 'Danone', aliases: ['danone'] },
  { brand: 'Italac', aliases: ['italac'] },
  { brand: 'Piracanjuba', aliases: ['piracanjuba'] },
  { brand: 'Parmalat', aliases: ['parmalat'] },
  { brand: 'Elegê', aliases: ['elege', 'elegê'] },
  { brand: 'Ninho', aliases: ['ninho'] },
  { brand: 'Omo', aliases: ['omo'] },
  { brand: 'Ariel', aliases: ['ariel'] },
  { brand: 'Brilhante', aliases: ['brilhante'] },
  { brand: 'Ypê', aliases: ['ype', 'ypê'] },
  { brand: 'Veja', aliases: ['veja'] },
  { brand: 'Downy', aliases: ['downy'] },
  { brand: 'Comfort', aliases: ['comfort'] },
  { brand: 'Colgate', aliases: ['colgate'] },
  { brand: 'Oral-B', aliases: ['oral b', 'oral-b', 'oralb'] },
  { brand: 'Sensodyne', aliases: ['sensodyne'] },
  { brand: 'Dove', aliases: ['dove'] },
  { brand: 'Rexona', aliases: ['rexona'] },
  { brand: 'Nivea', aliases: ['nivea', 'nívea'] },
  { brand: 'Hellmanns', aliases: ['hellmanns', 'hellmann\'s', 'hellmans'] },
  { brand: 'Heinz', aliases: ['heinz'] },
  { brand: 'Quero', aliases: ['quero'] },
  { brand: 'Fugini', aliases: ['fugini'] },
  { brand: 'Camil', aliases: ['camil'] },
  { brand: 'Tio João', aliases: ['tio joao', 'tio joão'] },
  { brand: 'Dona Benta', aliases: ['dona benta'] },
  { brand: 'Adria', aliases: ['adria'] },
  { brand: 'Renata', aliases: ['renata'] },
  { brand: 'Bauducco', aliases: ['bauducco'] },
  { brand: 'Marilan', aliases: ['marilan'] },
  { brand: 'Mococa', aliases: ['mococa'] },
  { brand: 'Liza', aliases: ['liza'] },
  { brand: 'Soya', aliases: ['soya'] },
  { brand: 'Coqueiro', aliases: ['coqueiro'] },
  { brand: 'Gomes da Costa', aliases: ['gomes da costa', 'gdc'] },
  { brand: 'Doritos', aliases: ['doritos'] },
  { brand: 'Ruffles', aliases: ['ruffles'] },
  { brand: 'Cheetos', aliases: ['cheetos'] },
  { brand: 'Lays', aliases: ['lays', 'lay\'s'] },
  { brand: 'Pringles', aliases: ['pringles'] },
  { brand: 'Halls', aliases: ['halls'] },
  { brand: 'Trident', aliases: ['trident'] },
  { brand: 'Garoto', aliases: ['garoto'] },
  { brand: 'Lacta', aliases: ['lacta'] },
  { brand: 'Kopenhagen', aliases: ['kopenhagen'] },
  { brand: 'Lindt', aliases: ['lindt'] },
  { brand: 'Neve', aliases: ['neve'] },
  { brand: 'Personal', aliases: ['personal'] },
  { brand: 'Pampers', aliases: ['pampers'] },
  { brand: 'Huggies', aliases: ['huggies'] },
]

// Common abbreviations expansion and synonyms in supermarket receipts
const ABBREVIATIONS: [RegExp, string][] = [
  [/\b(mac|maca|macar|macarr)\b/gi, 'macarrao'],
  [/\b(esp|espag|espaguet|espaguete)\b/gi, 'espaguete'],
  [/\b(paraf|parafuso)\b/gi, 'parafuso'],
  [/\b(pen|penne)\b/gi, 'penne'],
  [/\b(molh|molho)\b/gi, 'molho'],
  [/\b(tom|tomat|tomate)\b/gi, 'tomate'],
  [/\b(ext|extrat|extrato)\b/gi, 'extrato'],
  [/\b(refrig|refri|refrigerante)\b/gi, 'refrigerante'],
  [/\b(cerv|cerveja)\b/gi, 'cerveja'],
  [/\b(choc|chocol|chocolate)\b/gi, 'chocolate'],
  [/\b(bisc|biscoit|biscoito|bolach|bolacha)\b/gi, 'biscoito'],
  [/\b(margar|margarina)\b/gi, 'margarina'],
  [/\b(manteig|manteiga)\b/gi, 'manteiga'],
  [/\b(req|requeij|requeijao)\b/gi, 'requeijao'],
  [/\b(queij|queijo)\b/gi, 'queijo'],
  [/\b(pres|presunt|presunto)\b/gi, 'presunto'],
  [/\b(sabon|sabonete)\b/gi, 'sabonete'],
  [/\b(shamp|shampoo|xampu)\b/gi, 'shampoo'],
  [/\b(condic|condicionador)\b/gi, 'condicionador'],
  [/\b(desod|desodorante)\b/gi, 'desodorante'],
  [/\b(deterg|detergente)\b/gi, 'detergente'],
  [/\b(amaciant|amaciante)\b/gi, 'amaciante'],
  [/\b(desinf|desinfetante)\b/gi, 'desinfetante'],
  [/\b(agua|água)\s+sanit(aria|ária)?\b/gi, 'agua sanitaria'],
  [/\b(papel\s+hig|papel\s+higienico|papel\s+higiênico|pap\s+hig)\b/gi, 'papel higienico'],
  [/\b(creme\s+dent|creme\s+dental|pasta\s+dent|pasta\s+de\s+dente)\b/gi, 'creme dental'],
  [/\b(feij|feijao|feijão)\b/gi, 'feijao'],
  [/\b(arr|arroz)\b/gi, 'arroz'],
  [/\b(acuc|acucar|açucar|açúcar)\b/gi, 'acucar'],
  [/\b(sal\s+ref|sal\s+refinado)\b/gi, 'sal refinado'],
  [/\b(oleo|óleo)\s+(soya|soja)?\b/gi, 'oleo de soja'],
  [/\b(azeit|azeite)\b/gi, 'azeite'],
  [/\b(leit|leite)\b/gi, 'leite'],
  [/\b(int|integ|integral)\b/gi, 'integral'],
  [/\b(desn|desnat|desnatado)\b/gi, 'desnatado'],
  [/\b(semi|semidesn|semidesnatado)\b/gi, 'semidesnatado'],
]

/**
 * Normalise string: lowercase, remove accents, remove punctuation/symbols
 */
export function cleanRawText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Extract weight or volume (e.g. 500g, 1kg, 2l, 350ml, 1,5l, 200 g)
 */
export function extractUnitSize(rawText: string): { unitSize: string | null; cleanedText: string } {
  // Regex to match e.g. 500g, 500 g, 1kg, 1.5kg, 1,5kg, 350ml, 2l, 2 litros, 100un, 100 un, 100 caps
  const unitRegex = /\b(\d+(?:[.,]\d+)?)\s*(kg|g|gr|gramas|l|lt|litros|ml|un|und|caps|cps)\b/i
  const match = rawText.match(unitRegex)

  if (!match) {
    return { unitSize: null, cleanedText: rawText }
  }

  const num = match[1].replace(',', '.')
  let unit = match[2].toLowerCase()

  // Standardize units
  if (unit === 'gr' || unit === 'gramas') unit = 'g'
  if (unit === 'lt' || unit === 'litros') unit = 'l'
  if (unit === 'und') unit = 'un'
  if (unit === 'caps' || unit === 'cps') unit = 'caps'

  // Normalise 1000g -> 1kg, 1000ml -> 1l
  let numVal = parseFloat(num)
  let standardSize = `${numVal}${unit}`

  if (unit === 'g' && numVal >= 1000 && numVal % 1000 === 0) {
    standardSize = `${numVal / 1000}kg`
  } else if (unit === 'ml' && numVal >= 1000 && numVal % 1000 === 0) {
    standardSize = `${numVal / 1000}l`
  }

  const cleanedText = rawText.replace(match[0], ' ').replace(/\s+/g, ' ').trim()
  return { unitSize: standardSize, cleanedText }
}

/**
 * Extract brand from text
 */
export function extractBrand(rawText: string): { brand: string | null; cleanedText: string } {
  const norm = cleanRawText(rawText)
  
  for (const b of KNOWN_BRANDS) {
    for (const alias of b.aliases) {
      const regex = new RegExp(`\\b${alias}\\b`, 'i')
      if (regex.test(norm)) {
        const cleanedText = norm.replace(regex, ' ').replace(/\s+/g, ' ').trim()
        return { brand: b.brand, cleanedText }
      }
    }
  }

  return { brand: null, cleanedText: norm }
}

/**
 * Capitalize words nicely for user display
 */
export function toTitleCase(str: string): string {
  return str
    .toLowerCase()
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

/**
 * Parses raw description into canonical representation.
 * Deterministic and audit-friendly.
 */
export function parseProductDescription(rawDescription: string): ParsedProductInfo {
  if (!rawDescription || !rawDescription.trim()) {
    return {
      brand: null,
      productType: 'Produto',
      unitSize: null,
      canonicalName: 'Produto Não Identificado',
      normalizedKey: 'produto',
    }
  }

  // 1. Extract Unit Size
  const { unitSize, cleanedText: textWithoutSize } = extractUnitSize(rawDescription)

  // 2. Extract Brand
  const { brand, cleanedText: textWithoutBrand } = extractBrand(textWithoutSize)

  // 3. Clean and expand abbreviations for product type
  let productText = cleanRawText(textWithoutBrand)
  for (const [regex, replacement] of ABBREVIATIONS) {
    productText = productText.replace(regex, replacement)
  }

  // Remove stopwords/fillers
  const stopwords = ['de', 'do', 'da', 'dos', 'das', 'com', 'sem', 'para', 'em', 'tipo', 'sabor', 'pct', 'pacote', 'cx', 'caixa', 'un', 'unid', 'unidade']
  let words = productText
    .split(' ')
    .filter((w) => w.length > 1 && !stopwords.includes(w))

  // If specific pasta or specific subtype is present alongside genus (e.g. 'macarrao' + 'espaguete'), prioritize specific term
  if (words.includes('espaguete') || words.includes('parafuso') || words.includes('penne')) {
    words = words.filter((w) => w !== 'macarrao')
  }

  // Eliminate duplicate adjacent terms and sort words for stable key matching
  const uniqueWords: string[] = []
  for (const w of words) {
    if (!uniqueWords.includes(w)) {
      uniqueWords.push(w)
    }
  }

  // Sort canonical tokens for deterministic key matching regardless of token order
  const sortedTokens = [...uniqueWords].sort()
  const productType = uniqueWords.length > 0 ? toTitleCase(uniqueWords.join(' ')) : 'Produto'

  // 4. Build canonical name: e.g. "Espaguete Barilla 500g" or "Leite Integral Piracanjuba 1l"
  const nameParts: string[] = [productType]
  if (brand) {
    nameParts.push(brand)
  }
  if (unitSize) {
    nameParts.push(unitSize.toUpperCase())
  }
  const canonicalName = nameParts.join(' ')

  // 5. Build unique deterministic normalized key
  // e.g. "espaguete:barilla:500g" or "arroz:camil:5kg" or "integral_leite:italac:1l"
  const keyType = sortedTokens.join('_') || 'produto'
  const keyBrand = brand ? cleanRawText(brand).replace(/\s+/g, '_') : 'generico'
  const keySize = unitSize ? cleanRawText(unitSize) : 'padrao'
  const normalizedKey = `${keyType}:${keyBrand}:${keySize}`

  return {
    brand,
    productType,
    unitSize,
    canonicalName,
    normalizedKey,
  }
}

/**
 * Find or create a canonical product in Supabase and return its ID
 */
export async function getOrCreateCanonicalProduct(
  supabase: any,
  rawDescription: string,
  category?: string | null
): Promise<{ productId: string | null; parsed: ParsedProductInfo }> {
  const parsed = parseProductDescription(rawDescription)
  if (!supabase) {
    return { productId: null, parsed }
  }

  try {
    const tableRef = supabase.from('canonical_products')
    if (!tableRef || typeof tableRef.select !== 'function') {
      return { productId: null, parsed }
    }

    // 1. Try to find existing canonical product by normalized_key
    const { data: existing } = await tableRef
      .select('id')
      .eq('normalized_key', parsed.normalizedKey)
      .maybeSingle()

    if (existing?.id) {
      return { productId: existing.id, parsed }
    }

    if (typeof tableRef.upsert !== 'function') {
      return { productId: null, parsed }
    }

    // 2. Insert new canonical product if not exists
    const { data: inserted, error: insertError } = await tableRef
      .upsert(
        {
          canonical_name: parsed.canonicalName,
          normalized_key: parsed.normalizedKey,
          brand: parsed.brand,
          product_type: parsed.productType,
          unit_size: parsed.unitSize,
          category: category || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'normalized_key' }
      )
      .select('id')
      .single()

    if (inserted?.id) {
      return { productId: inserted.id, parsed }
    }

    if (insertError) {
      console.warn('Could not upsert canonical_product:', insertError.message)
    }
  } catch (err) {
    // Graceful fallback without throwing or logging in mock environments
  }

  return { productId: null, parsed }
}
