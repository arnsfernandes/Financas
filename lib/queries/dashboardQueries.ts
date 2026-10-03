import { getSupabaseClient } from '../persist'
import {
  projectRecurringTransactions,
  getUpcomingRecurringCommitments,
} from '../recurrence'
import { getCardInvoiceDates, isImmediatePayment } from '../billingCycles'
import { listCategories, normalizeCategoryName, translateCategory } from './categoryQueries'
import { getEffectiveDate, buildEffectiveDateOrFilter } from './transactionQueries'

export interface DashboardFilter {
  userId?: string
  periodType?: 'week' | 'month' | 'year' | 'custom'
  accountId?: string // Filter dashboard by specific account
  paymentMethod?: string // Filter dashboard by payment method (e.g. 'PIX')
  startDate?: string
  endDate?: string
  monthOffset?: number // For navigating months (0 = current, -1 = last, +1 = next)
  referenceDate?: string // YYYY-MM-DD
}

export interface AccountMetric {
  id: string
  name: string
  type: string
  institution: string | null
  totalExpenses: number
  totalIncome: number
  balance: number
  expensePercentage: number
  incomePercentage: number
  transactionCount: number
}

export interface UpcomingCommitment {
  id: string
  kind: 'recurring' | 'installment' | 'card_invoice'
  title: string
  vendor: string | null
  category: string
  accountName: string | null
  accountType: string | null
  amount: number
  date: string // YYYY-MM-DD
  dueDay?: number | null
  dueDayLabel?: string
  isEstimated?: boolean
  installmentInfo?: {
    current: number
    total: number
    groupId: string | null
  }
  frequency?: string | null
  invoiceItems?: any[]
  rawTx?: any
}


export interface TopCategoryItem {
  category: string
  rawCategory: string
  total: number
  percentage: number
  count: number
  averageTicket: number
  previousTotal: number
  differencePercentage: number | null
  color?: string | null
  icon?: string | null
}

export interface TopIncomeSourceItem {
  source: string
  category: string
  total: number
  percentage: number
  count: number
}

export interface TopVendorItem {
  vendor: string
  total: number
  percentage: number
  count: number
  averageTicket: number
  rawVendors?: string[]
}

export interface DailyExpenseItem {
  date: string
  label: string
  day: number
  total: number
  income: number
  expense: number
}

export interface DashboardInsight {
  type: 'positive' | 'warning' | 'neutral' | 'info'
  title: string
  description: string
}

export interface DashboardSummary {
  period: {
    type: 'week' | 'month' | 'year' | 'custom'
    label: string
    startDate: string
    endDate: string
    previousLabel: string
    previousStartDate: string
    previousEndDate: string
  }
  selectedAccountId?: string | null
  selectedPaymentMethod?: string | null
  metrics: {
    totalIncome: number
    totalExpenses: number
    balance: number
    totalSpent: number // Backward compatibility: equals totalExpenses
    expenseTransactionCount: number
    incomeTransactionCount: number
    transactionCount: number // Total transactions in period
    dailyAverage: number // Expense daily average
    activeDaysCount: number
    totalDaysInPeriod: number
    averageTicket: number // Expense average ticket
    maxExpense: {
      id: string
      vendor: string | null
      total: number
      date: string
      category: string
    } | null
    peakDay: {
      date: string
      formattedDate: string
      total: number
    } | null
    comparison: {
      previousTotalSpent: number // Previous total expenses
      previousTotalIncome: number
      previousBalance: number
      differenceAmount: number // Expense diff vs previous
      differencePercentage: number | null
    }
  }
  topCategories: TopCategoryItem[]
  topIncomeSources: TopIncomeSourceItem[]
  topVendors: TopVendorItem[]
  accountMetrics: AccountMetric[]
  recentTransactions: any[]
  dailyExpenses: DailyExpenseItem[]
  // Upcoming Financial Commitments in next 30 days
  upcomingCommitments: {
    forecastTotal30Days: number
    recurringTotal30Days: number
    installmentsTotal30Days: number
    upcomingRecurring: UpcomingCommitment[]
    upcomingInstallments: UpcomingCommitment[]
    allUpcoming: UpcomingCommitment[]
  }
  forecastTotal30Days: number
  recurringTotal30Days: number
  installmentsTotal30Days: number
  upcomingRecurring: UpcomingCommitment[]
  upcomingInstallments: UpcomingCommitment[]
  allUpcoming: UpcomingCommitment[]
  insights: DashboardInsight[]
}

/**
 * Computes comprehensive dashboard financial metrics based on real database records
 */
export async function getDashboardSummary(options: DashboardFilter = {}): Promise<DashboardSummary> {
  const supabase = getSupabaseClient()

  let ref = new Date()
  if (options.referenceDate) {
    ref = new Date(options.referenceDate)
    if (isNaN(ref.getTime())) {
      ref = new Date()
    }
  }
  const periodType = options.periodType || 'month'
  const monthOffset = options.monthOffset || 0

  let startStr = ''
  let endStr = ''
  let prevStartStr = ''
  let prevEndStr = ''
  let periodLabel = ''
  let prevPeriodLabel = ''

  const monthNames = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ]

  if (periodType === 'custom' && options.startDate && options.endDate) {
    startStr = options.startDate
    endStr = options.endDate
    periodLabel = `${startStr.slice(8, 10)}/${startStr.slice(5, 7)} até ${endStr.slice(8, 10)}/${endStr.slice(5, 7)}`

    // Compute previous interval with same duration
    const dStart = new Date(startStr + 'T00:00:00Z')
    const dEnd = new Date(endStr + 'T23:59:59Z')
    const durationMs = dEnd.getTime() - dStart.getTime()
    const pEnd = new Date(dStart.getTime() - 1)
    const pStart = new Date(pEnd.getTime() - durationMs)
    prevStartStr = pStart.toISOString().slice(0, 10)
    prevEndStr = pEnd.toISOString().slice(0, 10)
    prevPeriodLabel = 'Período anterior equivalente'
  } else if (periodType === 'week') {
    const dayOfWeek = ref.getDay()
    const distanceToMonday = (dayOfWeek + 6) % 7
    const monday = new Date(ref)
    monday.setDate(ref.getDate() - distanceToMonday)
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)

    startStr = monday.toISOString().slice(0, 10)
    endStr = sunday.toISOString().slice(0, 10)
    periodLabel = `Esta Semana (${startStr.slice(8, 10)}/${startStr.slice(5, 7)} a ${endStr.slice(8, 10)}/${endStr.slice(5, 7)})`

    const prevMonday = new Date(monday)
    prevMonday.setDate(monday.getDate() - 7)
    const prevSunday = new Date(sunday)
    prevSunday.setDate(sunday.getDate() - 7)
    prevStartStr = prevMonday.toISOString().slice(0, 10)
    prevEndStr = prevSunday.toISOString().slice(0, 10)
    prevPeriodLabel = 'Semana anterior'
  } else if (periodType === 'year') {
    const year = ref.getFullYear()
    startStr = `${year}-01-01`
    endStr = `${year}-12-31`
    periodLabel = `Ano de ${year}`

    prevStartStr = `${year - 1}-01-01`
    prevEndStr = `${year - 1}-12-31`
    prevPeriodLabel = `Ano de ${year - 1}`
  } else {
    // Default: 'month' (with monthOffset support)
    const targetDate = new Date(ref)
    targetDate.setMonth(targetDate.getMonth() + monthOffset)
    const year = targetDate.getFullYear()
    const monthIndex = targetDate.getMonth()

    const firstDay = new Date(Date.UTC(year, monthIndex, 1))
    const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0))
    startStr = firstDay.toISOString().slice(0, 10)
    endStr = lastDay.toISOString().slice(0, 10)
    periodLabel = `${monthNames[monthIndex]} de ${year}`

    const prevFirstDay = new Date(Date.UTC(year, monthIndex - 1, 1))
    const prevLastDay = new Date(Date.UTC(year, monthIndex, 0))
    prevStartStr = prevFirstDay.toISOString().slice(0, 10)
    prevEndStr = prevLastDay.toISOString().slice(0, 10)
    const prevMonthIdx = (monthIndex + 11) % 12
    prevPeriodLabel = `${monthNames[prevMonthIdx]} de ${prevFirstDay.getFullYear()}`
  }

  // Calculate days in period
  const startDateObj = new Date(startStr + 'T00:00:00Z')
  const endDateObj = new Date(endStr + 'T00:00:00Z')
  const totalDaysInPeriod = Math.max(1, Math.round((endDateObj.getTime() - startDateObj.getTime()) / (1000 * 60 * 60 * 24)) + 1)

  const isPixFilter =
    options.paymentMethod?.toLowerCase().includes('pix') ||
    options.accountId?.toLowerCase() === 'pix'

  const effectiveAccountId = isPixFilter ? undefined : (options.accountId || undefined)
  const effectivePaymentMethod = isPixFilter ? 'PIX' : (options.paymentMethod || undefined)

  if (!supabase) {
    return {
      period: {
        type: periodType,
        label: periodLabel,
        startDate: startStr,
        endDate: endStr,
        previousLabel: prevPeriodLabel,
        previousStartDate: prevStartStr,
        previousEndDate: prevEndStr,
      },
      selectedAccountId: effectiveAccountId || null,
      selectedPaymentMethod: effectivePaymentMethod || null,
      metrics: {
        totalIncome: 0,
        totalExpenses: 0,
        balance: 0,
        totalSpent: 0,
        expenseTransactionCount: 0,
        incomeTransactionCount: 0,
        transactionCount: 0,
        dailyAverage: 0,
        activeDaysCount: 0,
        totalDaysInPeriod,
        averageTicket: 0,
        maxExpense: null,
        peakDay: null,
        comparison: {
          previousTotalSpent: 0,
          previousTotalIncome: 0,
          previousBalance: 0,
          differenceAmount: 0,
          differencePercentage: null,
        },
      },
      topCategories: [],
      topIncomeSources: [],
      topVendors: [],
      accountMetrics: [],
      recentTransactions: [],
      dailyExpenses: [],
      upcomingCommitments: {
        forecastTotal30Days: 0,
        recurringTotal30Days: 0,
        installmentsTotal30Days: 0,
        upcomingRecurring: [],
        upcomingInstallments: [],
        allUpcoming: [],
      },
      forecastTotal30Days: 0,
      recurringTotal30Days: 0,
      installmentsTotal30Days: 0,
      upcomingRecurring: [],
      upcomingInstallments: [],
      allUpcoming: [],
      insights: [
        {
          type: 'info',
          title: 'Pronto para começar',
          description: 'Nenhum lançamento encontrado neste período. Adicione despesas ou receitas para gerar estatísticas automáticas.',
        },
      ],
    }
  }

  // Fetch all accounts to compute account-level metrics
  let accountsQuery = supabase
    .from('accounts')
    .select('id, name, type, institution, active, closing_day, due_day, custom_logo, color, skin')
    .order('name', { ascending: true })

  if (options.userId) {
    accountsQuery = accountsQuery.eq('user_id', options.userId)
  }

  const { data: accountsData } = await accountsQuery

  const accountsMap: Record<string, { id: string; name: string; type: string; institution: string | null; closing_day?: number | null; due_day?: number | null; custom_logo?: string | null; color?: string | null; skin?: string | null }> = {}
  for (const acc of accountsData || []) {
    accountsMap[acc.id] = {
      id: acc.id,
      name: acc.name,
      type: acc.type,
      institution: acc.institution || null,
      closing_day: acc.closing_day !== undefined && acc.closing_day !== null ? acc.closing_day : (acc.type === 'credit_card' ? 5 : null),
      due_day: acc.due_day !== undefined && acc.due_day !== null ? acc.due_day : (acc.type === 'credit_card' ? 15 : null),
      custom_logo: acc.custom_logo || null,
      color: acc.color || null,
      skin: acc.skin || null,
    }
  }

  // ----------------------------------------------------
  // UPCOMING COMMITMENTS BOUNDARIES
  // ----------------------------------------------------
  const upcomingStartIso = endStr
  const upcomingEnd = new Date(endStr + 'T00:00:00Z')
  upcomingEnd.setUTCDate(upcomingEnd.getUTCDate() + 30)
  const upcomingEndIso = upcomingEnd.toISOString().slice(0, 10)

  const todayIso = ref.toISOString().slice(0, 10)
  const in30Days = new Date(ref)
  in30Days.setDate(in30Days.getDate() + 30)
  const in30DaysIso = in30Days.toISOString().slice(0, 10)

  // Determine overall minimum and maximum date boundaries for database filtering
  const allStartCandidates = [prevStartStr, startStr, todayIso].filter(Boolean)
  allStartCandidates.sort()
  const queryMinDate = allStartCandidates[0]

  const allEndCandidates = [in30DaysIso, upcomingEndIso, endStr, prevEndStr].filter(Boolean)
  allEndCandidates.sort()
  const queryMaxDate = allEndCandidates[allEndCandidates.length - 1]

  const effectiveFilter = buildEffectiveDateOrFilter(queryMinDate, queryMaxDate)
  const dateOrFilter = effectiveFilter ? `${effectiveFilter},is_recurring.eq.true,installment_total.gt.1` : 'is_recurring.eq.true,installment_total.gt.1'

  // Fetch only transactions within relevant date boundaries plus active recurrences and installments
  let txQuery = supabase
    .from('transactions')
    .select('id, type, account_id, category_id, vendor, vendor_id, date, time, currency, category, total, payment_method, notes, created_at, is_recurring, recurrence_frequency, recurrence_next_date, recurrence_status, recurrence_parent_id, recurrence_cycle_date, installment_group_id, installment_current, installment_total, installment_amount, categories(id, name, icon, color), accounts(id, name, type, institution), canonical_vendors(id, canonical_name, normalized_key)')
    .or(dateOrFilter)
    .order('created_at', { ascending: false })

  if (options.userId) {
    txQuery = txQuery.eq('user_id', options.userId)
  }

  if (effectiveAccountId) {
    txQuery = txQuery.eq('account_id', effectiveAccountId)
  }

  if (effectivePaymentMethod) {
    const pm = effectivePaymentMethod.trim()
    const isCreditCard =
      pm === 'credit_card' ||
      pm.toLowerCase().includes('crédito') ||
      pm.toLowerCase().includes('credito') ||
      pm.toLowerCase().includes('cartão') ||
      pm.toLowerCase().includes('cartao') ||
      pm.toLowerCase() === 'card'

    if (isCreditCard) {
      const { data: ccAccounts } = await supabase
        .from('accounts')
        .select('id')
        .eq('type', 'credit_card')
      const ccIds = (ccAccounts || []).map((a) => a.id)

      const conditions = [
        `payment_method.ilike.%crédito%`,
        `payment_method.ilike.%credito%`,
        `payment_method.ilike.%cartão%`,
        `payment_method.ilike.%cartao%`,
        `payment_method.eq.credit_card`,
      ]
      if (ccIds.length > 0) {
        conditions.push(`account_id.in.(${ccIds.join(',')})`)
      }
      txQuery = txQuery.or(conditions.join(','))
    } else {
      txQuery = txQuery.ilike('payment_method', `%${pm}%`)
    }
  }

  const { data: allTxs, error } = await txQuery

  if (error) {
    throw new Error(`Failed to load dashboard data: ${error.message}`)
  }

  const allCategories = await listCategories({ activeOnly: false })
  const catMap = new Map(allCategories.map((c) => [c.id, c]))
  const catNormMap = new Map(allCategories.map((c) => [c.normalized_name, c]))

  const txList = (allTxs || []).map((t) => {
    const rawT = t as any
    let catObj = rawT.categories
    if (!catObj && rawT.category_id && catMap.has(rawT.category_id)) {
      const c = catMap.get(rawT.category_id)!
      catObj = { id: c.id, name: c.name, icon: c.icon, color: c.color }
    } else if (!catObj && rawT.category) {
      const norm = normalizeCategoryName(rawT.category)
      if (catNormMap.has(norm)) {
        const c = catNormMap.get(norm)!
        catObj = { id: c.id, name: c.name, icon: c.icon, color: c.color }
      }
    }

    return {
      ...t,
      categories: catObj || null,
      type: t.type === 'income' ? 'income' : 'expense',
    }
  })

  // -------------------------------------------------------------------------
  // PROJEÇÃO DE RECORRÊNCIAS PARA O PERÍODO CONSULTADO (Meses Futuros / Histórico)
  // Se o período consultado contém ciclos de uma recorrência ativa que ainda não
  // foram concretizados no banco, projetamos a ocorrência para aquele período.
  // -------------------------------------------------------------------------
  const projectedRecurringTxs = projectRecurringTransactions(txList, startStr, endStr, getEffectiveDate)

  // Agrega as projeções de recorrência à lista de transações
  if (projectedRecurringTxs.length > 0) {
    txList.push(...projectedRecurringTxs)
  }

  // -------------------------------------------------------------------------
  // PROJEÇÃO DE PARCELAS CASO AINDA NÃO MATERIALIZADAS NO BANCO
  // -------------------------------------------------------------------------
  const projectedInstallmentTxs: any[] = []
  const { addMonthsToDate: addMonthsHelper } = await import('../dateUtils')

  for (const t of txList) {
    if (t.installment_total && t.installment_total > 1 && !(t as any).is_projected) {
      const totalInst = t.installment_total
      const currentInst = t.installment_current || 1
      const baseDate = t.date || getEffectiveDate(t)
      const instAmount = Number(t.installment_amount) || Number((Number(t.total) / totalInst).toFixed(2))

      for (let i = 1; i <= totalInst; i++) {
        if (i === currentInst) continue
        const cycleDate = addMonthsHelper(baseDate, i - currentInst)
        if (cycleDate >= startStr && cycleDate <= endStr) {
          const alreadyExists = txList.some(
            (other) =>
              other.id !== t.id &&
              (
                (other.installment_group_id && t.installment_group_id && other.installment_group_id === t.installment_group_id && other.installment_current === i) ||
                (getEffectiveDate(other) === cycleDate && other.notes?.includes(t.id))
              )
          )

          if (!alreadyExists) {
            projectedInstallmentTxs.push({
              ...t,
              id: `proj_inst_${t.id}_${i}`,
              date: cycleDate,
              total: instAmount,
              installment_current: i,
              installment_total: totalInst,
              installment_amount: instAmount,
              is_projected: true,
            })
          }
        }
      }
    }
  }

  if (projectedInstallmentTxs.length > 0) {
    txList.push(...projectedInstallmentTxs)
  }

  let currentExpenses = 0
  let currentIncome = 0
  let expenseCount = 0
  let incomeCount = 0

  let prevExpenses = 0
  let prevIncome = 0

  const expenseCategoryTotals: Record<string, { total: number; count: number; rawCategory: string; color?: string | null; icon?: string | null }> = {}
  const prevExpenseCategoryTotals: Record<string, number> = {}
  const incomeCategoryTotals: Record<string, { total: number; count: number; rawCategory: string; color?: string | null; icon?: string | null }> = {}
  const vendorTotals: Record<string, { total: number; count: number; rawVendors: Set<string> }> = {}
  const dayExpenseTotals: Record<string, number> = {}
  const dayIncomeTotals: Record<string, number> = {}

  // Account-level metrics accumulation for current period
  const accountTotals: Record<string, {
    id: string
    name: string
    type: string
    institution: string | null
    totalExpenses: number
    totalIncome: number
    transactionCount: number
  }> = {}

  let maxExpense: { id: string; vendor: string | null; total: number; date: string; category: string } | null = null
  const periodTransactions: any[] = []

  const { parseVendor } = await import('../canonicalVendor')

  for (const tx of txList) {
    const effDate = getEffectiveDate(tx)
    const amount = Number(tx.total) || 0
    const isIncome = tx.type === 'income'
    const cv = tx.canonical_vendors ? (Array.isArray(tx.canonical_vendors) ? tx.canonical_vendors[0] : tx.canonical_vendors) : null
    
    // Deterministic canonical vendor normalization for display & consolidation
    let displayVendor = cv?.canonical_name
    if (!displayVendor) {
      const rawV = tx.vendor?.trim()
      if (rawV) {
        const parsed = parseVendor(rawV)
        displayVendor = parsed.canonicalName !== 'Outros' ? parsed.canonicalName : rawV
      } else {
        displayVendor = 'Não Identificado'
      }
    }

    const catRel = tx.categories ? (Array.isArray(tx.categories) ? tx.categories[0] : tx.categories) : null
    const categoryName = catRel?.name || (tx.category ? translateCategory(tx.category) : 'Outros')

    // Check if in current period
    if (effDate >= startStr && effDate <= endStr) {
      periodTransactions.push({
        ...tx,
        vendor: displayVendor,
        category: categoryName,
      })

      // Account accumulation
      const accId = tx.account_id || 'unassigned'
      if (!accountTotals[accId]) {
        const rawAcc = Array.isArray(tx.accounts) ? tx.accounts[0] : tx.accounts
        const accInfo = rawAcc || (tx.account_id ? accountsMap[tx.account_id] : null)
        accountTotals[accId] = {
          id: accId,
          name: accInfo?.name || (accId === 'unassigned' ? 'Sem conta definida' : 'Conta Removida'),
          type: accInfo?.type || 'other',
          institution: accInfo?.institution || null,
          totalExpenses: 0,
          totalIncome: 0,
          transactionCount: 0,
        }
      }
      accountTotals[accId].transactionCount += 1

      if (isIncome) {
        currentIncome += amount
        incomeCount += 1
        accountTotals[accId].totalIncome += amount
        dayIncomeTotals[effDate] = (dayIncomeTotals[effDate] || 0) + amount

        // Income Source Breakdown
        const sourceLabel = displayVendor !== 'Não Identificado' ? displayVendor : categoryName
        if (!incomeCategoryTotals[sourceLabel]) {
          incomeCategoryTotals[sourceLabel] = { total: 0, count: 0, rawCategory: categoryName }
        }
        incomeCategoryTotals[sourceLabel].total += amount
        incomeCategoryTotals[sourceLabel].count += 1
      } else {
        currentExpenses += amount
        expenseCount += 1
        accountTotals[accId].totalExpenses += amount
        dayExpenseTotals[effDate] = (dayExpenseTotals[effDate] || 0) + amount

        // Expense Category breakdown (using categories table name, icon, color or translated fallback)
        if (!expenseCategoryTotals[categoryName]) {
          expenseCategoryTotals[categoryName] = {
            total: 0,
            count: 0,
            rawCategory: categoryName,
            color: catRel?.color || null,
            icon: catRel?.icon || null,
          }
        }
        expenseCategoryTotals[categoryName].total += amount
        expenseCategoryTotals[categoryName].count += 1

        // Vendor breakdown (expenses only) using canonical vendor
        const ven = displayVendor
        if (!vendorTotals[ven]) {
          vendorTotals[ven] = { total: 0, count: 0, rawVendors: new Set<string>() }
        }
        vendorTotals[ven].total += amount
        vendorTotals[ven].count += 1
        if (tx.vendor && tx.vendor.trim()) {
          vendorTotals[ven].rawVendors.add(tx.vendor.trim())
        }

        // Max single expense
        if (!maxExpense || amount > maxExpense.total) {
          maxExpense = {
            id: tx.id,
            vendor: displayVendor !== 'Não Identificado' ? displayVendor : (tx.vendor || null),
            total: amount,
            date: effDate,
            category: categoryName,
          }
        }
      }
    }

    // Check if in previous period
    if (effDate >= prevStartStr && effDate <= prevEndStr) {
      if (isIncome) {
        prevIncome += amount
      } else {
        prevExpenses += amount
        prevExpenseCategoryTotals[categoryName] = (prevExpenseCategoryTotals[categoryName] || 0) + amount
      }
    }
  }

  const activeDaysCount = Object.keys(dayExpenseTotals).length
  const dailyAverage = currentExpenses > 0 ? Number((currentExpenses / totalDaysInPeriod).toFixed(2)) : 0
  const averageTicket = expenseCount > 0 ? Number((currentExpenses / expenseCount).toFixed(2)) : 0
  const balance = Number((currentIncome - currentExpenses).toFixed(2))

  // Compute Account Metrics ranking (sorted by total usage: expenses + income, then expenses)
  const accountMetrics: AccountMetric[] = Object.values(accountTotals)
    .map((acc) => {
      const exp = Number(acc.totalExpenses.toFixed(2))
      const inc = Number(acc.totalIncome.toFixed(2))
      return {
        id: acc.id,
        name: acc.name,
        type: acc.type,
        institution: acc.institution,
        totalExpenses: exp,
        totalIncome: inc,
        balance: Number((inc - exp).toFixed(2)),
        expensePercentage: currentExpenses > 0 ? Number(((exp / currentExpenses) * 100).toFixed(1)) : 0,
        incomePercentage: currentIncome > 0 ? Number(((inc / currentIncome) * 100).toFixed(1)) : 0,
        transactionCount: acc.transactionCount,
      }
    })
    .sort((a, b) => b.totalExpenses + b.totalIncome - (a.totalExpenses + a.totalIncome))

  // Peak expense day
  let peakDay: { date: string; formattedDate: string; total: number } | null = null
  let maxDaySpend = 0
  for (const [dStr, total] of Object.entries(dayExpenseTotals)) {
    if (total > maxDaySpend) {
      maxDaySpend = total
      const [y, m, d] = dStr.split('-')
      peakDay = {
        date: dStr,
        formattedDate: `${d}/${m}/${y}`,
        total: Number(total.toFixed(2)),
      }
    }
  }

  // Comparison with previous period (for expenses)
  const differenceAmount = Number((currentExpenses - prevExpenses).toFixed(2))
  const differencePercentage =
    prevExpenses > 0
      ? Number((((currentExpenses - prevExpenses) / prevExpenses) * 100).toFixed(1))
      : null

  const prevBalance = Number((prevIncome - prevExpenses).toFixed(2))

  // Top Expense Categories sorted
  const topCategories = Object.entries(expenseCategoryTotals)
    .map(([category, info]: [string, any]) => {
      const catTot = Number(info.total.toFixed(2))
      const catCnt = info.count
      const catAvg = catCnt > 0 ? Number((catTot / catCnt).toFixed(2)) : 0
      const prevCatTot = prevExpenseCategoryTotals[category] || 0
      const diffPct = prevCatTot > 0 ? Number((((catTot - prevCatTot) / prevCatTot) * 100).toFixed(1)) : null
      return {
        category,
        rawCategory: info.rawCategory,
        color: info.color || null,
        icon: info.icon || null,
        total: catTot,
        count: catCnt,
        averageTicket: catAvg,
        previousTotal: Number(prevCatTot.toFixed(2)),
        differencePercentage: diffPct,
        percentage: currentExpenses > 0 ? Number(((info.total / currentExpenses) * 100).toFixed(1)) : 0,
      }
    })
    .sort((a, b) => b.total - a.total)

  // Top Income Sources sorted
  const topIncomeSources = Object.entries(incomeCategoryTotals)
    .map(([source, info]) => ({
      source,
      category: translateCategory(info.rawCategory),
      total: Number(info.total.toFixed(2)),
      count: info.count,
      percentage: currentIncome > 0 ? Number(((info.total / currentIncome) * 100).toFixed(1)) : 0,
    }))
    .sort((a, b) => b.total - a.total)

  // Top Vendors sorted (expenses)
  const topVendors = Object.entries(vendorTotals)
    .map(([vendor, info]) => {
      const tot = Number(info.total.toFixed(2))
      const cnt = info.count
      const avg = cnt > 0 ? Number((tot / cnt).toFixed(2)) : 0
      return {
        vendor,
        total: tot,
        count: cnt,
        percentage: currentExpenses > 0 ? Number(((info.total / currentExpenses) * 100).toFixed(1)) : 0,
        averageTicket: avg,
        rawVendors: Array.from(info.rawVendors),
      }
    })
    .sort((a, b) => b.total - a.total)

  // Daily evolution list for all days in the period
  const dailyExpenses: { date: string; label: string; day: number; total: number; income: number; expense: number }[] = []
  const curr = new Date(startDateObj)
  while (curr <= endDateObj) {
    const dStr = curr.toISOString().slice(0, 10)
    const day = curr.getUTCDate()
    const dayExp = dayExpenseTotals[dStr] || 0
    const dayInc = dayIncomeTotals[dStr] || 0
    dailyExpenses.push({
      date: dStr,
      label: `${String(day).padStart(2, '0')}/${String(curr.getUTCMonth() + 1).padStart(2, '0')}`,
      day,
      total: Number(dayExp.toFixed(2)),
      expense: Number(dayExp.toFixed(2)),
      income: Number(dayInc.toFixed(2)),
    })
    curr.setUTCDate(curr.getUTCDate() + 1)
  }

  // Deterministic Insights Generation
  const insights: { type: 'positive' | 'warning' | 'neutral' | 'info'; title: string; description: string }[] = []
  const totalOperations = expenseCount + incomeCount

  if (totalOperations === 0) {
    insights.push({
      type: 'info',
      title: 'Nenhum lançamento no período',
      description: `Não há despesas ou receitas registradas entre ${startStr} e ${endStr}.`,
    })
  } else {
    // 1. Balance Insight
    if (currentIncome > 0 || currentExpenses > 0) {
      if (balance > 0) {
        insights.push({
          type: 'positive',
          title: `Superávit do período: +R$ ${balance.toFixed(2)}`,
          description: `Suas receitas superaram as despesas em R$ ${balance.toFixed(2)} no período selecionado.`,
        })
      } else if (balance < 0) {
        insights.push({
          type: 'warning',
          title: `Déficit do período: -R$ ${Math.abs(balance).toFixed(2)}`,
          description: `Você gastou R$ ${Math.abs(balance).toFixed(2)} a mais do que recebeu no período.`,
        })
      } else {
        insights.push({
          type: 'neutral',
          title: 'Saldo equilibrado no período',
          description: `Receitas e despesas estão exatamente empatadas em R$ ${currentIncome.toFixed(2)}.`,
        })
      }
    }

    // 2. Top Category Insight
    if (topCategories.length > 0) {
      const topCat = topCategories[0]
      insights.push({
        type: topCat.percentage > 40 ? 'warning' : 'neutral',
        title: `Maior concentração: ${topCat.category}`,
        description: `Representa ${topCat.percentage}% do total gasto no período (R$ ${topCat.total.toFixed(2)} em ${topCat.count} compra(s)).`,
      })
    }

    // 3. Comparison Insight for expenses
    if (prevExpenses > 0 && differencePercentage !== null) {
      if (differenceAmount > 0) {
        insights.push({
          type: 'warning',
          title: 'Gastos acima do período anterior',
          description: `Você gastou R$ ${differenceAmount.toFixed(2)} a mais (+${differencePercentage}%) em relação a ${prevPeriodLabel}.`,
        })
      } else if (differenceAmount < 0) {
        insights.push({
          type: 'positive',
          title: 'Economia em relação ao período anterior',
          description: `Você economizou R$ ${Math.abs(differenceAmount).toFixed(2)} (${differencePercentage}%) comparado a ${prevPeriodLabel}.`,
        })
      }
    }

    // 4. Top Income Source Insight
    if (topIncomeSources.length > 0) {
      const topInc = topIncomeSources[0]
      insights.push({
        type: 'info',
        title: `Principal fonte de receita: ${topInc.source}`,
        description: `Gerou R$ ${topInc.total.toFixed(2)} (${topInc.percentage}% das receitas do período).`,
      })
    }

    // 5. Account insight (most used account)
    if (accountMetrics.length > 0 && accountMetrics[0].transactionCount > 0) {
      const mainAcc = accountMetrics[0]
      insights.push({
        type: 'info',
        title: `Meio mais utilizado: ${mainAcc.name}`,
        description: `${mainAcc.name} concentrou ${mainAcc.transactionCount} transação(ões), somando ${mainAcc.expensePercentage}% das despesas do período.`,
      })
    }

    // 6. Top Vendor Insight
    if (topVendors.length > 0) {
      const topVen = topVendors[0]
      insights.push({
        type: 'info',
        title: `Estabelecimento principal: ${topVen.vendor}`,
        description: `Concentrou ${topVen.percentage}% dos gastos (R$ ${topVen.total.toFixed(2)} em ${topVen.count} compra(s)).`,
      })
    }

    // 7. Peak day insight
    if (peakDay && peakDay.total > 0 && activeDaysCount > 1) {
      insights.push({
        type: 'neutral',
        title: `Pico de gastos em ${peakDay.formattedDate}`,
        description: `O dia de maior desembolso somou R$ ${peakDay.total.toFixed(2)}.`,
      })
    }
  }

  // ----------------------------------------------------
  // UPCOMING COMMITMENTS (Compromissos Futuros Reais - Próximos 30 dias)
  // ----------------------------------------------------
  const windowStart = todayIso
  const windowEnd = in30DaysIso

  // 1. Credit Card Invoices (Faturas Consolidadas)
  const invoiceGroups: Record<string, {
    acc: any
    dueDate: string
    total: number
    items: Array<{
      id: string
      date: string
      vendor: string | null
      category: string | null
      amount: number
      installmentCurrent?: number | null
      installmentTotal?: number | null
      isInstallment?: boolean
      notes?: string | null
      rawTx?: any
    }>
  }> = {}

  for (const tx of txList) {
    if (isPixFilter) continue // PIX does not have credit card invoices
    if (tx.type !== 'expense') continue
    if (tx.is_recurring) continue
    const rawAcc = Array.isArray(tx.accounts) ? tx.accounts[0] : tx.accounts
    const accountId = tx.account_id || (rawAcc as any)?.id
    const acc: any = (accountId && accountsMap[accountId]) ? accountsMap[accountId] : rawAcc
    if (!acc || acc.type !== 'credit_card') continue
    if (effectiveAccountId && acc.id !== effectiveAccountId) continue
    if (isImmediatePayment(tx.payment_method, acc.type)) continue

    const closingDay = acc.closing_day || 5
    const dueDay = acc.due_day || 15
    const txDate = getEffectiveDate(tx)
    const cycle = getCardInvoiceDates(txDate, closingDay, dueDay)

    // Check if invoice due date falls within the next 30 days
    if (cycle.dueDate >= windowStart && cycle.dueDate <= windowEnd) {
      const groupKey = `${acc.id}-${cycle.dueDate}`
      if (!invoiceGroups[groupKey]) {
        invoiceGroups[groupKey] = {
          acc,
          dueDate: cycle.dueDate,
          total: 0,
          items: [],
        }
      }

      const amount = Number(tx.installment_amount) || Number(tx.total) || 0
      invoiceGroups[groupKey].total = Number((invoiceGroups[groupKey].total + amount).toFixed(2))
      invoiceGroups[groupKey].items.push({
        id: tx.id,
        date: txDate,
        vendor: tx.vendor || null,
        category: translateCategory(tx.category) || 'Outros',
        amount,
        installmentCurrent: tx.installment_current || null,
        installmentTotal: tx.installment_total || null,
        isInstallment: Boolean(tx.installment_total && tx.installment_total > 1),
        notes: tx.notes || null,
        rawTx: tx,
      })
    }
  }

  const upcomingInvoices: UpcomingCommitment[] = Object.values(invoiceGroups).map((grp) => {
    const cardName = grp.acc.institution ? `Fatura ${grp.acc.institution}` : `Fatura ${grp.acc.name}`
    const dueDay = grp.acc.due_day || parseInt(grp.dueDate.slice(8, 10), 10)
    return {
      id: `invoice-${grp.acc.id}-${grp.dueDate}`,
      kind: 'card_invoice',
      title: cardName,
      vendor: cardName,
      category: 'Fatura de Cartão',
      accountName: grp.acc.name,
      accountType: 'credit_card',
      amount: grp.total,
      date: grp.dueDate,
      dueDay,
      dueDayLabel: `vence dia ${dueDay}`,
      invoiceItems: grp.items.sort((a, b) => a.date.localeCompare(b.date)),
    }
  })

  // 2. Fixed & Recurring Commitments (Despesas Recorrentes a Vencer)
  const rawUpcomingRecurring: UpcomingCommitment[] = getUpcomingRecurringCommitments(
    txList,
    windowStart,
    windowEnd,
    {
      getEffectiveDateFn: getEffectiveDate,
      accountsMap,
      translateCategoryFn: translateCategory,
    }
  )

  const upcomingRecurring: UpcomingCommitment[] = []
  for (const item of rawUpcomingRecurring) {
    const rawAcc = item.rawTx?.accounts
    const accInfo = rawAcc || (item.rawTx?.account_id ? accountsMap[item.rawTx.account_id] : null)
    const accType = accInfo?.type || null

    // Rule 3: Exclude immediate payments
    if (isImmediatePayment(item.rawTx?.payment_method, accType)) {
      continue
    }

    // Rule 4: If real transaction already launched for this cycle, substitute/replace forecast
    const itemCycleMonth = item.date.slice(0, 7)
    const alreadyLaunched = txList.some((t) => {
      if (t.id === item.id) return false
      if (t.type !== 'expense') return false
      // Matching via recurrence parent tracking
      if (t.recurrence_parent_id === item.id && t.recurrence_cycle_date === item.date) {
        return true
      }
      // Matching via vendor/category and cycle month (not recurring)
      if (!t.is_recurring && t.date && t.date.slice(0, 7) === itemCycleMonth) {
        const tVend = (t.vendor || '').trim().toLowerCase()
        const iVend = (item.vendor || '').trim().toLowerCase()
        if (tVend && iVend && tVend === iVend) {
          return true
        }
      }
      return false
    })

    if (alreadyLaunched) {
      continue
    }

    const dueDay = parseInt(item.date.slice(8, 10), 10)
    const isEstimated = Boolean(
      item.rawTx?.notes?.includes('[Estimado]') ||
      (item.rawTx as any)?.is_estimated
    )

    upcomingRecurring.push({
      ...item,
      dueDay,
      dueDayLabel: `vence dia ${dueDay}`,
      isEstimated,
    })
  }

  // 3. Installments (Loose / Standalone)
  const upcomingInstallments: UpcomingCommitment[] = []
  const standaloneInstallments: UpcomingCommitment[] = []

  for (const tx of txList) {
    if (tx.type !== 'expense') continue
    const rawAcc = Array.isArray(tx.accounts) ? tx.accounts[0] : tx.accounts
    const accInfo = rawAcc || (tx.account_id ? accountsMap[tx.account_id] : null)
    const accName = accInfo?.name || (tx.account_id ? 'Conta' : null)
    const accType = accInfo?.type || null
    const amount = Number(tx.total) || 0
    const cat = translateCategory(tx.category)

    if (tx.installment_total && tx.installment_total > 1 && !(tx as any).is_projected) {
      const currentInst = tx.installment_current || 1
      const totalInst = tx.installment_total
      const txDate = getEffectiveDate(tx)
      const instAmount = Number(tx.installment_amount) || amount

      if (txDate > windowStart && txDate <= windowEnd) {
        const instCommitment: UpcomingCommitment = {
          id: tx.id,
          kind: 'installment',
          title: `${tx.vendor || cat || 'Parcela'} (${currentInst}/${totalInst})`,
          vendor: tx.vendor || null,
          category: cat,
          accountName: accName,
          accountType: accType,
          amount: instAmount,
          date: txDate,
          installmentInfo: {
            current: currentInst,
            total: totalInst,
            groupId: tx.installment_group_id || null,
          },
          rawTx: tx,
        }

        upcomingInstallments.push(instCommitment)

        // Only include in standalone if not already consolidated into a card invoice
        if (accType !== 'credit_card' && !isImmediatePayment(tx.payment_method, accType)) {
          standaloneInstallments.push(instCommitment)
        }
      }
    }
  }

  // Sort upcoming commitments by date ascending
  upcomingInvoices.sort((a, b) => a.date.localeCompare(b.date))
  upcomingRecurring.sort((a, b) => a.date.localeCompare(b.date))
  upcomingInstallments.sort((a, b) => a.date.localeCompare(b.date))

  // Consolidated allUpcoming for UI Home: card invoices + recurring bills + standalone non-card installments
  const allUpcoming = [...upcomingInvoices, ...upcomingRecurring, ...standaloneInstallments].sort(
    (a, b) => a.date.localeCompare(b.date)
  )

  const recurringTotal30Days = Number(
    upcomingRecurring.reduce((sum, item) => sum + item.amount, 0).toFixed(2)
  )
  const invoicesTotal30Days = Number(
    upcomingInvoices.reduce((sum, item) => sum + item.amount, 0).toFixed(2)
  )
  const standaloneInstallmentsTotal = Number(
    standaloneInstallments.reduce((sum, item) => sum + item.amount, 0).toFixed(2)
  )
  const installmentsTotal30Days = Number(
    upcomingInstallments.reduce((sum, item) => sum + item.amount, 0).toFixed(2)
  )
  const forecastTotal30Days = Number(
    allUpcoming.reduce((sum, item) => sum + item.amount, 0).toFixed(2)
  )

  return {
    period: {
      type: periodType,
      label: periodLabel,
      startDate: startStr,
      endDate: endStr,
      previousLabel: prevPeriodLabel,
      previousStartDate: prevStartStr,
      previousEndDate: prevEndStr,
    },
    selectedAccountId: effectiveAccountId || null,
    selectedPaymentMethod: effectivePaymentMethod || null,
    metrics: {
      totalIncome: Number(currentIncome.toFixed(2)),
      totalExpenses: Number(currentExpenses.toFixed(2)),
      balance,
      totalSpent: Number(currentExpenses.toFixed(2)),
      expenseTransactionCount: expenseCount,
      incomeTransactionCount: incomeCount,
      transactionCount: totalOperations,
      dailyAverage,
      activeDaysCount,
      totalDaysInPeriod,
      averageTicket,
      maxExpense,
      peakDay,
      comparison: {
        previousTotalSpent: Number(prevExpenses.toFixed(2)),
        previousTotalIncome: Number(prevIncome.toFixed(2)),
        previousBalance: prevBalance,
        differenceAmount,
        differencePercentage,
      },
    },
    topCategories,
    topIncomeSources,
    topVendors,
    accountMetrics,
    recentTransactions: periodTransactions.slice(0, 5),
    dailyExpenses,
    upcomingCommitments: {
      forecastTotal30Days,
      recurringTotal30Days,
      installmentsTotal30Days,
      upcomingRecurring,
      upcomingInstallments,
      allUpcoming,
    },
    forecastTotal30Days,
    recurringTotal30Days,
    installmentsTotal30Days,
    upcomingRecurring,
    upcomingInstallments,
    allUpcoming,
    insights,
  }
}
