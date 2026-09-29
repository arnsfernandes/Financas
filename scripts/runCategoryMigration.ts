import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY

if (!url || !key) {
  console.error('Missing Supabase credentials in .env.local')
  process.exit(1)
}

const supabase = createClient(url, key)

export function normalizeCategoryName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

async function run() {
  console.log('--- Executando Migração de Categorias ---')

  // 1. Criar tabela categories e FK caso ainda não existam via PostgREST/RPC ou inserção direta
  // Verificar se a tabela categories já existe
  const { data: existingCategories, error: checkCatError } = await supabase.from('categories').select('*').limit(1)

  if (checkCatError) {
    console.error('Tabela categories não parece acessível diretamente via PostgREST:', checkCatError.message)
    console.log('Execute a migration SQL no Supabase Dashboard ou via CLI se necessário.')
    process.exit(1)
  }

  console.log('Tabela categories acessível.')

  // 2. Buscar todas as categorias ativas
  const { data: allCategories, error: listCatError } = await supabase.from('categories').select('*')
  if (listCatError || !allCategories) {
    console.error('Erro ao listar categorias:', listCatError)
    process.exit(1)
  }

  console.log(`Categorias cadastradas: ${allCategories.length}`)
  const expenseCategories = allCategories.filter((c) => c.type === 'expense')
  const incomeCategories = allCategories.filter((c) => c.type === 'income')

  const outrosExpense = expenseCategories.find((c) => c.normalized_name === 'outros')
  const outrosIncome = incomeCategories.find((c) => c.normalized_name === 'outros')

  // Mapeamento de equivalências conhecidas -> normalized_name da categoria canônica
  const expenseMapping: Record<string, string> = {
    groceries: 'mercado',
    grocery: 'mercado',
    supermarket: 'mercado',
    supermercado: 'mercado',
    mercado: 'mercado',
    'mercado / supermercado': 'mercado',
    dining: 'alimentacao',
    restaurant: 'alimentacao',
    restaurante: 'alimentacao',
    food: 'alimentacao',
    alimentacao: 'alimentacao',
    'alimentacao & restaurante': 'alimentacao',
    lanche: 'alimentacao',
    refeicao: 'alimentacao',
    health: 'saude',
    pharmacy: 'saude',
    farmacia: 'saude',
    saude: 'saude',
    'saude & farmacia': 'saude',
    medico: 'saude',
    transportation: 'transporte',
    transport: 'transporte',
    fuel: 'transporte',
    gas: 'transporte',
    combustivel: 'transporte',
    transporte: 'transporte',
    'transporte & combustivel': 'transporte',
    uber: 'transporte',
    utilities: 'moradia',
    bills: 'moradia',
    contas: 'moradia',
    'contas & servicos': 'moradia',
    moradia: 'moradia',
    aluguel: 'moradia',
    luz: 'moradia',
    agua: 'moradia',
    internet: 'moradia',
    'office supplies': 'servicos',
    office: 'servicos',
    papelaria: 'servicos',
    entertainment: 'lazer',
    lazer: 'lazer',
    'lazer & entretenimento': 'lazer',
    cinema: 'lazer',
    jogos: 'lazer',
    electronics: 'compras',
    eletronicos: 'compras',
    'eletronicos & tecnologia': 'compras',
    tecnologia: 'compras',
    shopping: 'compras',
    clothing: 'compras',
    vestuario: 'compras',
    'compras & vestuario': 'compras',
    educacao: 'educacao',
    cursos: 'educacao',
    livros: 'educacao',
    escola: 'educacao',
    assinaturas: 'assinaturas',
    software: 'assinaturas',
    servicos: 'servicos',
    impostos: 'impostos e tarifas',
    'impostos & tarifas': 'impostos e tarifas',
    tarifas: 'impostos e tarifas',
    outros: 'outros',
    other: 'outros',
    miscellaneous: 'outros',
  }

  const incomeMapping: Record<string, string> = {
    salario: 'salario',
    salary: 'salario',
    pagamento: 'salario',
    freelance: 'freelance',
    bico: 'freelance',
    consultoria: 'freelance',
    venda: 'vendas',
    vendas: 'vendas',
    sale: 'vendas',
    sales: 'vendas',
    reembolso: 'reembolsos',
    reembolsos: 'reembolsos',
    refund: 'reembolsos',
    reimbursement: 'reembolsos',
    estorno: 'reembolsos',
    rendimentos: 'rendimentos',
    investimentos: 'rendimentos',
    investments: 'rendimentos',
    dividendos: 'rendimentos',
    yield: 'rendimentos',
    outros: 'outros',
    other: 'outros',
  }

  // 3. Buscar todas as transações
  const { data: transactions, error: txError } = await supabase.from('transactions').select('id, type, category, category_id')

  if (txError || !transactions) {
    console.error('Erro ao buscar transações:', txError)
    process.exit(1)
  }

  console.log(`Total de transações no banco: ${transactions.length}`)

  let mappedCount = 0
  let fallbackOutrosCount = 0
  let alreadySetCount = 0

  for (const tx of transactions) {
    const isIncome = tx.type === 'income'
    const currentCategoryString = tx.category ? normalizeCategoryName(tx.category) : ''
    const mapping = isIncome ? incomeMapping : expenseMapping
    const categoriesPool = isIncome ? incomeCategories : expenseCategories
    const fallbackCategory = isIncome ? outrosIncome : outrosExpense

    let targetCategoryId: string | null = null

    if (currentCategoryString) {
      const canonicalNorm = mapping[currentCategoryString]
      if (canonicalNorm) {
        const found = categoriesPool.find((c) => c.normalized_name === canonicalNorm)
        if (found) {
          targetCategoryId = found.id
        }
      } else {
        // Tentar match direto por normalized_name na lista de categorias
        const found = categoriesPool.find((c) => c.normalized_name === currentCategoryString)
        if (found) {
          targetCategoryId = found.id
        }
      }
    }

    if (!targetCategoryId) {
      targetCategoryId = fallbackCategory?.id || null
      fallbackOutrosCount++
    } else {
      mappedCount++
    }

    if (targetCategoryId && targetCategoryId !== tx.category_id) {
      await supabase
        .from('transactions')
        .update({
          category_id: targetCategoryId,
        })
        .eq('id', tx.id)
    } else {
      alreadySetCount++
    }
  }

  console.log('\n--- Relatório da Migração ---')
  console.log(`Transações mapeadas para categorias canônicas: ${mappedCount}`)
  console.log(`Transações atribuídas a "Outros" (fallback/desconhecidas): ${fallbackOutrosCount}`)
  console.log(`Total processado com sucesso: ${transactions.length}`)
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
