import type {
  RawContract,
  RawLessonRecord,
  RawCashFlowRecord,
  PeriodFilter,
  ContractPaymentInfo,
  ContractCategoryKey,
  CategoryMetricBreakdown,
  PrepaidAndRealizedSummary,
  ProfitLossSummary,
} from './types'

/**
 * Universal date parser that handles Firestore Timestamps, Dates, ISO strings, and numbers
 * using Taipei Timezone (+08:00)
 */
export function parseDateToTaipei(dateVal: any): { year: number; month: number; day: number; dateStr: string } | null {
  if (!dateVal) return null

  let d: Date
  if (dateVal instanceof Date) {
    d = dateVal
  } else if (typeof dateVal?.toDate === 'function') {
    d = dateVal.toDate()
  } else if (typeof dateVal?._seconds === 'number') {
    d = new Date(dateVal._seconds * 1000)
  } else if (typeof dateVal === 'string' || typeof dateVal === 'number') {
    d = new Date(dateVal)
  } else {
    return null
  }

  if (isNaN(d.getTime())) return null

  // Format to Asia/Taipei string
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const parts = formatter.formatToParts(d)
  const y = Number(parts.find((p) => p.type === 'year')?.value)
  const m = Number(parts.find((p) => p.type === 'month')?.value)
  const day = Number(parts.find((p) => p.type === 'day')?.value)

  const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`

  return { year: y, month: m, day, dateStr }
}

/**
 * Checks if a given date satisfies the period filter
 */
export function isDateInPeriod(dateVal: any, filter?: PeriodFilter): boolean {
  if (!filter || (!filter.year && !filter.startDate && !filter.endDate)) {
    return true // All time / no filter
  }

  const parsed = parseDateToTaipei(dateVal)
  if (!parsed) return false

  if (filter.startDate && filter.endDate) {
    return parsed.dateStr >= filter.startDate && parsed.dateStr <= filter.endDate
  }

  if (filter.year) {
    if (parsed.year !== filter.year) return false
    if (filter.month && filter.month !== 'all') {
      return parsed.month === filter.month
    }
    return true
  }

  return true
}

/**
 * Categorizes a contract into single / dual / shared / group
 */
export function getContractCategoryKey(c: RawContract): ContractCategoryKey {
  if (c.contractType === 'shared') return 'shared'
  if (c.contractType === 'group') return 'group'
  if (
    c.contractType === 'dual' ||
    (!!c.sharedWithCustomerId && c.contractType !== 'shared' && c.contractType !== 'group')
  ) {
    return 'dual'
  }
  return 'single'
}

/**
 * Canonical contract payment calculator
 * Handles single vs installment payment types strictly according to accounting rules.
 */
export function getContractPaymentInfo(c: RawContract): ContractPaymentInfo {
  const total = Number(c.totalAmount || 0)
  const isInstallment =
    c.paymentType === 'installment' ||
    c.paymentType === 'installments' ||
    (Array.isArray(c.installments) && c.installments.length > 0)

  let paid = Number(c.paidAmount || 0)
  if (isInstallment) {
    if (Array.isArray(c.installments) && c.installments.length > 0) {
      const installmentSum = c.installments
        .filter((inst) => inst && inst.status === 'paid')
        .reduce((sum, inst) => sum + Number(inst.amount || 0), 0)
      if (installmentSum > 0) {
        paid = installmentSum
      }
    }
  } else {
    // For non-installment (single payment) contracts, the revenue recognized / collected
    // is the total contract amount.
    paid = total
  }

  const pending = Math.max(0, total - paid)
  const categoryKey = getContractCategoryKey(c)
  const totSessions = Number(c.totalSessions || 0)
  const unitPrice = totSessions > 0 ? Math.round((total / totSessions) * 100) / 100 : 1500

  return {
    total,
    paid,
    pending,
    isInstallment,
    lumpSumAmount: isInstallment ? 0 : total,
    installmentPaidAmount: isInstallment ? paid : 0,
    categoryKey,
    unitPrice,
  }
}

/**
 * Calculates comprehensive Prepaid & Realized Metrics
 */
export function calculatePrepaidAndRealized(
  contracts: RawContract[],
  lessonRecords: RawLessonRecord[],
  period?: PeriodFilter,
  contractMap?: Map<string, RawContract>
): PrepaidAndRealizedSummary {
  const cMap = contractMap || new Map<string, RawContract>()
  if (!contractMap) {
    contracts.forEach((c) => cMap.set(c.id, c))
  }

  let newContractsTotalValue = 0
  let totalCollectedAmount = 0
  let lumpSumTotal = 0
  let installmentPaidTotal = 0
  let pendingInstallmentsTotal = 0

  const catMetrics: Record<ContractCategoryKey, CategoryMetricBreakdown> = {
    single: { key: 'single', label: '單人合約', newAmount: 0, newContractsCount: 0, lumpSum: 0, installmentPaid: 0, realizedRevenue: 0, realizedSessions: 0, liabilityBalance: 0, remainingSessions: 0 },
    dual:   { key: 'dual',   label: '雙人合約', newAmount: 0, newContractsCount: 0, lumpSum: 0, installmentPaid: 0, realizedRevenue: 0, realizedSessions: 0, liabilityBalance: 0, remainingSessions: 0 },
    shared: { key: 'shared', label: '共享合約', newAmount: 0, newContractsCount: 0, lumpSum: 0, installmentPaid: 0, realizedRevenue: 0, realizedSessions: 0, liabilityBalance: 0, remainingSessions: 0 },
    group:  { key: 'group',  label: '團體合約', newAmount: 0, newContractsCount: 0, lumpSum: 0, installmentPaid: 0, realizedRevenue: 0, realizedSessions: 0, liabilityBalance: 0, remainingSessions: 0 },
  }

  // 1. Period Contracts
  contracts.forEach((c) => {
    if (!isDateInPeriod(c.createdAt, period)) return

    const { total, paid, isInstallment, lumpSumAmount, installmentPaidAmount, pending, categoryKey } =
      getContractPaymentInfo(c)

    newContractsTotalValue += total
    totalCollectedAmount += paid

    catMetrics[categoryKey].newAmount += total
    catMetrics[categoryKey].newContractsCount += 1

    if (isInstallment) {
      installmentPaidTotal += installmentPaidAmount
      pendingInstallmentsTotal += pending
      catMetrics[categoryKey].installmentPaid += installmentPaidAmount
    } else {
      lumpSumTotal += lumpSumAmount
      catMetrics[categoryKey].lumpSum += lumpSumAmount
    }
  })

  // 2. Period Lesson Records (Realized Revenue)
  let realizedRevenueTotal = 0
  let totalSessionsUsed = 0

  lessonRecords.forEach((r) => {
    if (!isDateInPeriod(r.sessionDate, period)) return

    const deductions =
      r.deductions && r.deductions.length > 0
        ? r.deductions
        : [
            {
              customerId: r.customerId,
              customerName: r.customerName,
              contractId: r.contractId || '',
              sessionAmount: r.sessionAmount || 1,
            },
          ]

    deductions.forEach((d) => {
      const c = cMap.get(d.contractId)
      const catKey = c ? getContractCategoryKey(c) : 'single'
      const sessions = Number(d.sessionAmount || 1)
      totalSessionsUsed += sessions
      catMetrics[catKey].realizedSessions += sessions

      const rev =
        c && Number(c.totalSessions) > 0
          ? sessions * (Number(c.totalAmount || 0) / Number(c.totalSessions))
          : sessions * 1500

      realizedRevenueTotal += rev
      catMetrics[catKey].realizedRevenue += rev
    })
  })

  // 3. Unearned Tuition Liability Balance across ALL Active Contracts
  let unearnedLiabilityBalance = 0
  let remainingSessionsCount = 0

  contracts.forEach((c) => {
    const catKey = getContractCategoryKey(c)
    const rem = Number(c.remainingSessions || 0)
    const tot = Number(c.totalSessions || 0)
    if (rem > 0 && tot > 0) {
      const avgPrice = Number(c.totalAmount || 0) / tot
      const liab = rem * avgPrice
      unearnedLiabilityBalance += liab
      remainingSessionsCount += rem

      catMetrics[catKey].liabilityBalance += liab
      catMetrics[catKey].remainingSessions += rem
    }
  })

  // 4. All-time cumulative collected and realized
  let allTimeCollected = 0
  contracts.forEach((c) => {
    const { paid } = getContractPaymentInfo(c)
    allTimeCollected += paid
  })

  let allTimeRealized = 0
  lessonRecords.forEach((r) => {
    const deductions =
      r.deductions && r.deductions.length > 0
        ? r.deductions
        : [
            {
              customerId: r.customerId,
              contractId: r.contractId || '',
              sessionAmount: r.sessionAmount || 1,
            },
          ]

    deductions.forEach((d) => {
      const c = cMap.get(d.contractId)
      const sessions = Number(d.sessionAmount || 1)
      if (c && Number(c.totalSessions) > 0) {
        allTimeRealized += sessions * (Number(c.totalAmount || 0) / Number(c.totalSessions))
      } else {
        allTimeRealized += sessions * 1500
      }
    })
  })

  const averageSessionPrice =
    totalSessionsUsed > 0 ? Math.round(realizedRevenueTotal / totalSessionsUsed) : 0

  const periodLabel =
    period?.startDate && period?.endDate
      ? `${period.startDate} 至 ${period.endDate}`
      : period?.year
        ? period.month && period.month !== 'all'
          ? `${period.year}年${period.month}月`
          : `${period.year}全年度`
        : '全期（歷史至今）'

  return {
    periodLabel,
    newContractsTotalValue: Math.round(newContractsTotalValue),
    totalCollectedAmount: Math.round(totalCollectedAmount),
    lumpSumTotal: Math.round(lumpSumTotal),
    installmentPaidTotal: Math.round(installmentPaidTotal),
    pendingInstallmentsTotal: Math.round(pendingInstallmentsTotal),
    allTimeCollected: Math.round(allTimeCollected),
    realizedRevenueTotal: Math.round(realizedRevenueTotal),
    totalSessionsUsed,
    averageSessionPrice,
    allTimeRealized: Math.round(allTimeRealized),
    unearnedLiabilityBalance: Math.round(unearnedLiabilityBalance),
    remainingSessionsCount,
    allTimeNetCollectedMinusRealized: Math.round(allTimeCollected - allTimeRealized),
    categoryList: [
      catMetrics.single,
      catMetrics.dual,
      catMetrics.shared,
      catMetrics.group,
    ].map((cat) => ({
      ...cat,
      newAmount: Math.round(cat.newAmount),
      lumpSum: Math.round(cat.lumpSum),
      installmentPaid: Math.round(cat.installmentPaid),
      realizedRevenue: Math.round(cat.realizedRevenue),
      liabilityBalance: Math.round(cat.liabilityBalance),
    })),
  }
}

/**
 * Normalizes raw Cash Flow records from Firestore
 */
export function normalizeCashFlow(data: RawCashFlowRecord): {
  type: 'income' | 'expense'
  category: string
  amount: number
  account: string
  description: string
  date: any
} {
  if (data.type && data.category && typeof data.amount === 'number') {
    return {
      type: data.type === 'income' ? 'income' : 'expense',
      category: data.category,
      amount: Number(data.amount) || 0,
      account: data.account || '預收款帳號',
      description: data.description || '',
      date: data.date,
    }
  }

  // Legacy schema fallback
  const isCashOrBank = (cat?: string) =>
    cat && ['現金', '銀行存款', '公司存款', '預收款', '預收款帳號'].some((a) => cat.includes(a))

  const isDebitCash = isCashOrBank(data.debitCategory)
  const isCreditCash = isCashOrBank(data.creditCategory)

  if (isDebitCash && !isCreditCash) {
    return {
      type: 'income',
      category: data.creditCategory || '其他收入',
      amount: Number(data.debitAmount || data.creditAmount || 0),
      account: data.debitCategory || '預收款帳號',
      description: data.description || '',
      date: data.date,
    }
  } else if (!isDebitCash && isCreditCash) {
    return {
      type: 'expense',
      category: data.debitCategory || '其他支出',
      amount: Number(data.debitAmount || data.creditAmount || 0),
      account: data.creditCategory || '預收款帳號',
      description: data.description || '',
      date: data.date,
    }
  }

  const amt = Number(data.amount || data.debitAmount || data.creditAmount || 0)
  return {
    type: (data.type as any) || 'expense',
    category: data.category || data.debitCategory || data.creditCategory || '其他',
    amount: amt,
    account: data.account || '一般帳號',
    description: data.description || '',
    date: data.date,
  }
}

/**
 * Calculates Profit and Loss (Operating Accrual vs Cash Flow)
 */
export function calculateProfitLoss(
  cashFlowRecords: RawCashFlowRecord[],
  contracts: RawContract[],
  lessonRecords: RawLessonRecord[],
  period?: PeriodFilter
): ProfitLossSummary {
  // 1. Calculate Realized Lesson Revenue in period
  const prepaidSummary = calculatePrepaidAndRealized(contracts, lessonRecords, period)
  const realizedLessonRevenue = prepaidSummary.realizedRevenueTotal

  // 2. Classify Cash Flow Records
  let totalCashIncome = 0
  let totalCashExpense = 0
  let otherOperatingIncome = 0
  let totalOperatingExpense = 0

  const isTuitionCat = (cat: string) =>
    ['學費', '課程', '教練課', '預收'].some((k) => cat.includes(k))

  const incomeMap: Record<string, number> = {}
  const expenseMap: Record<string, number> = {}

  cashFlowRecords.forEach((raw) => {
    if (!isDateInPeriod(raw.date, period)) return

    const norm = normalizeCashFlow(raw)
    const cat = norm.category || '其他'

    if (norm.type === 'income') {
      totalCashIncome += norm.amount
      incomeMap[cat] = (incomeMap[cat] || 0) + norm.amount

      // Non-tuition income counts towards operating income
      if (!isTuitionCat(cat)) {
        otherOperatingIncome += norm.amount
      }
    } else {
      totalCashExpense += norm.amount
      totalOperatingExpense += norm.amount
      expenseMap[cat] = (expenseMap[cat] || 0) + norm.amount
    }
  })

  const totalOperatingIncome = realizedLessonRevenue + otherOperatingIncome
  const accrualNetProfit = totalOperatingIncome - totalOperatingExpense
  const cashNetFlow = totalCashIncome - totalCashExpense

  const topIncomeCategories = Object.entries(incomeMap)
    .map(([category, amount]) => ({
      category,
      amount,
      percentage: totalCashIncome > 0 ? ((amount / totalCashIncome) * 100).toFixed(1) + '%' : '0%',
    }))
    .sort((a, b) => b.amount - a.amount)

  const topExpenseCategories = Object.entries(expenseMap)
    .map(([category, amount]) => ({
      category,
      amount,
      percentage: totalCashExpense > 0 ? ((amount / totalCashExpense) * 100).toFixed(1) + '%' : '0%',
    }))
    .sort((a, b) => b.amount - a.amount)

  return {
    periodLabel: prepaidSummary.periodLabel,
    realizedLessonRevenue,
    otherOperatingIncome,
    totalOperatingIncome: Math.round(totalOperatingIncome),
    totalOperatingExpense: Math.round(totalOperatingExpense),
    accrualNetProfit: Math.round(accrualNetProfit),
    totalCashIncome: Math.round(totalCashIncome),
    totalCashExpense: Math.round(totalCashExpense),
    cashNetFlow: Math.round(cashNetFlow),
    topIncomeCategories,
    topExpenseCategories,
  }
}
