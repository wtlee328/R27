import * as admin from 'firebase-admin'
import {
  parseDateToTaipei,
  normalizeCashFlow,
  calculatePrepaidAndRealized,
  calculateProfitLoss,
  getContractPaymentInfo,
  METRIC_REGISTRY,
  reconcileFinancialMetrics,
  isDateInPeriod,
  RawContract,
  RawLessonRecord,
  RawCashFlowRecord,
  PeriodFilter,
} from '../../finance-core'

function getDb() {
  return admin.firestore()
}

/**
 * Fetch domain datasets from Firestore for a given centerId
 */
async function fetchCenterDatasets(centerId: string) {
  const db = getDb()
  const [contractsSnap, lessonsSnap, cashFlowSnap, customersSnap] = await Promise.all([
    db.collection('contracts').where('centerId', '==', centerId).get(),
    db.collection('lessonRecords').where('centerId', '==', centerId).get(),
    db.collection('cashFlowRecords').where('centerId', '==', centerId).get(),
    db.collection('customers').where('centerId', '==', centerId).get(),
  ])

  const customerMap = new Map<string, string>()
  customersSnap.docs.forEach((d) => {
    customerMap.set(d.id, d.data().name || '')
  })

  const contracts: RawContract[] = contractsSnap.docs.map((doc) => {
    const data = doc.data()
    return {
      id: doc.id,
      centerId: data.centerId,
      customerId: data.customerId,
      customerName: customerMap.get(data.customerId) || data.customerName,
      studentName: customerMap.get(data.customerId) || data.studentName,
      contractNo: data.contractNo || doc.id.substring(0, 8),
      contractType: data.contractType,
      totalAmount: data.totalAmount,
      paidAmount: data.paidAmount,
      totalSessions: data.totalSessions,
      remainingSessions: data.remainingSessions,
      paymentType: data.paymentType,
      installments: data.installments,
      sharedWithCustomerId: data.sharedWithCustomerId,
      createdAt: data.createdAt,
      startDate: data.startDate,
      status: data.status,
    }
  })

  const lessonRecords: RawLessonRecord[] = lessonsSnap.docs.map((doc) => {
    const data = doc.data()
    return {
      id: doc.id,
      centerId: data.centerId,
      customerId: data.customerId,
      contractId: data.contractId,
      sessionAmount: data.sessionAmount,
      sessionDate: data.sessionDate,
      deductions: data.deductions,
      trainerId: data.trainerId,
      trainerName: data.trainerName,
      courseName: data.courseName,
      status: data.status,
    }
  })

  const cashFlowRecords: RawCashFlowRecord[] = cashFlowSnap.docs.map((doc) => {
    const data = doc.data()
    return {
      id: doc.id,
      centerId: data.centerId,
      date: data.date,
      type: data.type,
      category: data.category,
      amount: data.amount,
      account: data.account,
      description: data.description,
      notes: data.notes,
      debitCategory: data.debitCategory,
      creditCategory: data.creditCategory,
      debitAmount: data.debitAmount,
      creditAmount: data.creditAmount,
    }
  })

  return { contracts, lessonRecords, cashFlowRecords, customerMap }
}

function buildPeriodFilter(params: {
  year?: number
  month?: number | 'all'
  startDate?: string
  endDate?: string
}): PeriodFilter | undefined {
  if (params.startDate || params.endDate) {
    return { startDate: params.startDate, endDate: params.endDate }
  }
  if (params.year) {
    return { year: params.year, month: params.month }
  }
  return undefined
}

/**
 * Metric-Driven Tool 1: get_financial_metrics
 * Queries canonical metrics from METRIC_REGISTRY powered by finance-core
 */
export async function getFinancialMetrics(params: {
  centerId: string
  year?: number
  month?: number | 'all'
  startDate?: string
  endDate?: string
}) {
  const { centerId, year, month = 'all', startDate, endDate } = params
  const period = buildPeriodFilter({ year, month, startDate, endDate })
  const { contracts, lessonRecords, cashFlowRecords } = await fetchCenterDatasets(centerId)

  const prepaidSummary = calculatePrepaidAndRealized(contracts, lessonRecords, period)

  const profitLossSummary = calculateProfitLoss(
    cashFlowRecords,
    contracts,
    lessonRecords,
    period
  )

  const dateRangeLabel =
    startDate && endDate
      ? `${startDate} 至 ${endDate}`
      : year
        ? month && month !== 'all'
          ? `${year}年${month}月`
          : `${year}全年度`
        : '全期（歷史至今）'

  return {
    centerId,
    year,
    month,
    startDate,
    endDate,
    dateRangeLabel,
    // Canonical Metrics
    metrics: {
      contractedAmount: prepaidSummary.newContractsTotalValue,
      totalCollectedAmount: prepaidSummary.totalCollectedAmount,
      lumpSumPaidAmount: prepaidSummary.lumpSumTotal,
      installmentPaidAmount: prepaidSummary.installmentPaidTotal,
      pendingInstallmentsAmount: prepaidSummary.pendingInstallmentsTotal,
      allTimeCollectedAmount: prepaidSummary.allTimeCollected,
      realizedLessonRevenue: prepaidSummary.realizedRevenueTotal,
      realizedLessonSessions: prepaidSummary.totalSessionsUsed,
      averageSessionPrice: prepaidSummary.averageSessionPrice,
      unearnedRevenueLiabilityBalance: prepaidSummary.unearnedLiabilityBalance,
      allTimeNetCollectedMinusRealized: prepaidSummary.allTimeNetCollectedMinusRealized,
      cashFlowTotalIncome: profitLossSummary.totalCashIncome,
      cashFlowTotalExpense: profitLossSummary.totalCashExpense,
      cashFlowNetProfit: profitLossSummary.cashNetFlow,
      operatingAccrualRevenue: profitLossSummary.totalOperatingIncome,
      operatingAccrualNetProfit: profitLossSummary.accrualNetProfit,
    },
    prepaidSummary,
    profitLossSummary,
  }
}

/**
 * Metric-Driven Tool 2: reconcile_financial_metrics
 * Performs deep accounting reconciliation between diverging metric concepts.
 */
export async function reconcileMetrics(params: {
  centerId: string
  reconcileType: 'contracts_total_vs_paid' | 'collected_vs_realized' | 'cashflow_tuition_vs_contracts'
  year?: number
  month?: number | 'all'
  startDate?: string
  endDate?: string
}) {
  const { centerId, reconcileType, year, month = 'all', startDate, endDate } = params
  const period = buildPeriodFilter({ year, month, startDate, endDate })
  const { contracts, lessonRecords, cashFlowRecords } = await fetchCenterDatasets(centerId)

  const result = reconcileFinancialMetrics({
    reconcileType,
    contracts,
    lessonRecords,
    cashFlowRecords,
    period,
  })

  const dateRangeLabel =
    startDate && endDate
      ? `${startDate} 至 ${endDate}`
      : year
        ? month && month !== 'all'
          ? `${year}年${month}月`
          : `${year}全年度`
        : '全期（歷史至今）'

  return {
    centerId,
    year,
    month,
    startDate,
    endDate,
    dateRangeLabel,
    ...result,
  }
}

/**
 * Metric-Driven Tool 3: drilldown_financial_metric
 * Returns line-item transaction breakdowns and underlying formula for any canonical metric.
 */
export async function drilldownMetric(params: {
  centerId: string
  metricId: string
  year?: number
  month?: number | 'all'
  startDate?: string
  endDate?: string
  limit?: number
}) {
  const { centerId, metricId, year, month = 'all', startDate, endDate, limit = 50 } = params
  const period = buildPeriodFilter({ year, month, startDate, endDate })
  const metricDef = METRIC_REGISTRY[metricId]

  if (!metricDef) {
    return {
      error: `未知的指標代碼: "${metricId}"。支援的指標包括: ${Object.keys(METRIC_REGISTRY).join(', ')}`,
    }
  }

  const { contracts, cashFlowRecords } = await fetchCenterDatasets(centerId)

  // Dispatch drilldown based on metric definition
  if (metricDef.category === 'cashflow') {
    const items = cashFlowRecords
      .filter((raw) => isDateInPeriod(raw.date, period))
      .map(normalizeCashFlow)
      .filter((r) => {
        if (metricId === 'cashFlowTotalIncome') return r.type === 'income'
        if (metricId === 'cashFlowTotalExpense') return r.type === 'expense'
        return true
      })
      .slice(0, limit)

    return {
      metricDef,
      totalCount: items.length,
      items,
    }
  }

  if (metricDef.category === 'contract') {
    const items = contracts.map((c) => {
      const info = getContractPaymentInfo(c)
      return {
        id: c.id,
        contractNo: c.contractNo,
        studentName: c.studentName || c.customerName,
        totalAmount: info.total,
        paidAmount: info.paid,
        isInstallment: info.isInstallment,
        unpaid: Math.max(0, info.total - info.paid),
      }
    }).slice(0, limit)

    return {
      metricDef,
      totalCount: items.length,
      items,
    }
  }

  return {
    metricDef,
    message: `指標 ${metricDef.label} 查詢成功，其計算公式為: ${metricDef.formula}`,
  }
}

/**
 * Backwards-Compatible Tool 1: query_cash_flow_records
 */
export async function queryCashFlowRecords(params: {
  centerId: string
  year?: number
  month?: number | 'all'
  startDate?: string
  endDate?: string
  type?: 'income' | 'expense' | 'all'
  category?: string
  searchTerm?: string
  limit?: number
}) {
  const {
    centerId,
    year,
    month,
    startDate,
    endDate,
    type = 'all',
    category,
    searchTerm,
    limit = 50,
  } = params

  const { cashFlowRecords } = await fetchCenterDatasets(centerId)

  // Map with normalized structure & Taipei date
  const allRecords = cashFlowRecords.map((raw) => {
    const norm = normalizeCashFlow(raw)
    const taipeiDate = parseDateToTaipei(raw.date)

    return {
      id: raw.id,
      date: taipeiDate?.dateStr || '',
      taipeiDate,
      type: norm.type,
      category: norm.category,
      amount: norm.amount,
      account: norm.account,
      description: norm.description,
      notes: (raw.notes || '') as string,
    }
  })

  // Filter records strictly within the DATE RANGE
  const periodRecords = allRecords.filter((r) => {
    if (!r.taipeiDate || !r.date) return false

    if (startDate && r.date < startDate) return false
    if (endDate && r.date > endDate) return false

    if (!startDate && !endDate) {
      if (year && r.taipeiDate.year !== year) return false
      if (month && month !== 'all' && month !== 0 && r.taipeiDate.month !== month) return false
    }

    return true
  })

  let periodTotalIncome = 0
  let periodTotalExpense = 0
  periodRecords.forEach((r) => {
    if (r.type === 'income') periodTotalIncome += r.amount
    else periodTotalExpense += r.amount
  })
  const periodNetCashFlow = periodTotalIncome - periodTotalExpense
  const periodTotalCount = periodRecords.length

  const filteredList = periodRecords.filter((r) => {
    if (type !== 'all' && r.type !== type) return false
    if (category && !r.category.includes(category)) return false
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      const descMatch = (r.description || '').toLowerCase().includes(term)
      const noteMatch = (r.notes || '').toLowerCase().includes(term)
      const catMatch = (r.category || '').toLowerCase().includes(term)
      if (!descMatch && !noteMatch && !catMatch) return false
    }
    return true
  })

  filteredList.sort((a, b) => b.date.localeCompare(a.date))

  const filteredCount = filteredList.length
  let filteredIncome = 0
  let filteredExpense = 0
  filteredList.forEach((r) => {
    if (r.type === 'income') filteredIncome += r.amount
    else filteredExpense += r.amount
  })

  const pagedList = filteredList
    .slice(0, limit)
    .map(({ id, date, type: rType, category: rCategory, amount, account, description, notes }) => ({
      id,
      date,
      type: rType === 'income' ? '收入' : '支出',
      category: rCategory,
      amount,
      account,
      description: description || '-',
      notes: notes || '-',
    }))

  const dateRangeLabel =
    startDate && endDate
      ? `${startDate} 至 ${endDate}`
      : year
        ? month && month !== 'all'
          ? `${year}年${month}月`
          : `${year}全年度`
        : undefined

  return {
    year,
    month: month || 'all',
    startDate,
    endDate,
    dateRangeLabel,
    filterCategory: category || undefined,
    filterType: type !== 'all' ? type : undefined,
    filterSearchTerm: searchTerm || undefined,
    totalRecordsFound: filteredCount,
    filteredTotalAmount: filteredIncome + filteredExpense,
    filteredIncome,
    filteredExpense,
    filteredNet: filteredIncome - filteredExpense,
    periodTotalIncome,
    periodTotalExpense,
    periodNetCashFlow,
    periodTotalCount,
    totalIncome: category ? filteredIncome : periodTotalIncome,
    totalExpense: category ? filteredExpense : periodTotalExpense,
    netCashFlow: category ? filteredIncome - filteredExpense : periodNetCashFlow,
    returnedCount: pagedList.length,
    records: pagedList,
  }
}

/**
 * Backwards-Compatible Tool 2: get_profit_loss_summary
 */
export async function getProfitLossSummary(params: {
  centerId: string
  year?: number
  month?: number | 'all'
  startDate?: string
  endDate?: string
}) {
  const { centerId, year, month = 'all', startDate, endDate } = params
  const period = buildPeriodFilter({ year, month, startDate, endDate })
  const { contracts, lessonRecords, cashFlowRecords } = await fetchCenterDatasets(centerId)

  const pnl = calculateProfitLoss(
    cashFlowRecords,
    contracts,
    lessonRecords,
    period
  )

  const totalIncome = pnl.totalCashIncome
  const totalExpense = pnl.totalCashExpense
  const netProfit = pnl.cashNetFlow

  const topIncomeCategories = pnl.topIncomeCategories
  const topExpenseCategories = pnl.topExpenseCategories

  const incomeCategories: Record<string, number> = {}
  topIncomeCategories.forEach((item) => {
    incomeCategories[item.category] = item.amount
  })

  const expenseCategories: Record<string, number> = {}
  topExpenseCategories.forEach((item) => {
    expenseCategories[item.category] = item.amount
  })

  const dateRangeLabel =
    startDate && endDate
      ? `${startDate} 至 ${endDate}`
      : year
        ? month && month !== 'all'
          ? `${year}年${month}月`
          : `${year}全年度`
        : undefined

  return {
    year,
    month,
    startDate,
    endDate,
    dateRangeLabel,
    totalIncome,
    totalExpense,
    netProfit,
    operatingAccrualRevenue: pnl.totalOperatingIncome,
    operatingAccrualNetProfit: pnl.accrualNetProfit,
    incomeCategories,
    expenseCategories,
    topIncomeCategories,
    topExpenseCategories,
  }
}

/**
 * Backwards-Compatible Tool 3: get_prepaid_and_realized_metrics
 */
export async function getPrepaidAndRealizedMetrics(params: {
  centerId: string
  year?: number
  month?: number | 'all'
  startDate?: string
  endDate?: string
}) {
  const { centerId, year, month = 'all', startDate, endDate } = params
  const period = buildPeriodFilter({ year, month, startDate, endDate })
  const { contracts, lessonRecords } = await fetchCenterDatasets(centerId)

  const summary = calculatePrepaidAndRealized(
    contracts,
    lessonRecords,
    period
  )

  const dateRangeLabel =
    startDate && endDate
      ? `${startDate} 至 ${endDate}`
      : year
        ? month && month !== 'all'
          ? `${year}年${month}月`
          : `${year}全年度`
        : '全期（歷史至今）'

  return {
    year,
    month,
    startDate,
    endDate,
    dateRangeLabel,
    periodContractedAmount: summary.newContractsTotalValue,
    periodTotalPaidAmount: summary.totalCollectedAmount,
    lumpSumPaidAmount: summary.lumpSumTotal,
    installmentPaidAmount: summary.installmentPaidTotal,
    pendingInstallmentsAmount: summary.pendingInstallmentsTotal,
    allTimeCollectedAmount: summary.allTimeCollected,
    realizedLessonRevenue: summary.realizedRevenueTotal,
    realizedLessonSessions: summary.totalSessionsUsed,
    realizedLessonRecordsCount: summary.totalSessionsUsed,
    averageSessionPrice: summary.averageSessionPrice,
    unearnedRevenueLiabilityBalance: summary.unearnedLiabilityBalance,
    activeContractsRemainingSessions: summary.remainingSessionsCount,
    activeContractsTotalSessions: summary.remainingSessionsCount + summary.totalSessionsUsed,
    allTimeNetCollectedMinusRealized: summary.allTimeNetCollectedMinusRealized,
  }
}

/**
 * Backwards-Compatible Tool 4: query_contract_payments
 */
export async function queryContractPayments(params: {
  centerId: string
  studentName?: string
  paymentStatus?: 'paid' | 'pending' | 'overdue' | 'all'
  limit?: number
}) {
  const { centerId, studentName, paymentStatus = 'all', limit = 30 } = params
  const { contracts } = await fetchCenterDatasets(centerId)

  const results: any[] = []

  contracts.forEach((c) => {
    const custName = c.studentName || c.customerName || '未知學員'

    if (studentName && !custName.toLowerCase().includes(studentName.toLowerCase())) {
      return
    }

    const info = getContractPaymentInfo(c)
    let overdueCount = 0
    let pendingCount = 0

    if (info.isInstallment && Array.isArray(c.installments)) {
      overdueCount = c.installments.filter((inst: any) => inst.status === 'overdue').length
      pendingCount = c.installments.filter((inst: any) => inst.status === 'pending').length
    }

    let status: 'paid' | 'pending' | 'overdue' = 'paid'
    if (overdueCount > 0) status = 'overdue'
    else if (info.paid < info.total || pendingCount > 0) status = 'pending'

    if (paymentStatus !== 'all' && status !== paymentStatus) {
      return
    }

    const taipeiDate = parseDateToTaipei(c.startDate)
    const startDateStr = taipeiDate?.dateStr || '-'

    results.push({
      contractNo: c.contractNo || c.id.substring(0, 8),
      studentName: custName,
      contractType: c.contractType || 'single',
      totalSessions: Number(c.totalSessions || 0),
      remainingSessions: Number(c.remainingSessions || 0),
      totalAmount: info.total,
      paidAmount: info.paid,
      unpaidAmount: Math.max(0, info.total - info.paid),
      paymentType: info.isInstallment ? '分期付款' : '全額躉繳',
      paymentStatus: status === 'paid' ? '已付清' : status === 'overdue' ? '有逾期' : '分期中',
      startDate: startDateStr,
    })
  })

  results.sort((a, b) => b.unpaidAmount - a.unpaidAmount)

  return {
    totalFound: results.length,
    contracts: results.slice(0, limit),
  }
}
