import * as admin from 'firebase-admin'

function getDb() {
  return admin.firestore()
}

// Helper to normalize cash flow record
function normalizeCashFlowRecord(data: any) {
  if (data.type && data.category && typeof data.amount === 'number') {
    return {
      type: data.type as 'income' | 'expense',
      category: data.category as string,
      amount: Number(data.amount) || 0,
      account: data.account || '預收款帳號',
      description: data.description || '',
      notes: data.notes || '',
      date: data.date,
    }
  }

  // Legacy schema compatibility
  const isCashOrBank = (cat?: string) =>
    cat && ['現金', '銀行存款', '公司存款', '預收款', '預收款帳號'].some((a) => cat.includes(a))

  const isDebitCash = isCashOrBank(data.debitCategory)
  const isCreditCash = isCashOrBank(data.creditCategory)

  if (isDebitCash && !isCreditCash) {
    return {
      type: 'income' as const,
      category: data.creditCategory || '其他收入',
      amount: Number(data.debitAmount || data.creditAmount || 0),
      account: data.debitCategory || '預收款帳號',
      description: data.description || '',
      notes: data.notes || '',
      date: data.date,
    }
  } else if (!isDebitCash && isCreditCash) {
    return {
      type: 'expense' as const,
      category: data.debitCategory || '其他支出',
      amount: Number(data.debitAmount || data.creditAmount || 0),
      account: data.creditCategory || '預收款帳號',
      description: data.description || '',
      notes: data.notes || '',
      date: data.date,
    }
  }

  return {
    type: 'income' as const,
    category: data.category || '一般收支',
    amount: Number(data.amount || data.creditAmount || data.debitAmount || 0),
    account: data.account || '預收款帳號',
    description: data.description || '',
    notes: data.notes || '',
    date: data.date,
  }
}

/**
 * Tool 1: query_cash_flow_records
 */
export async function queryCashFlowRecords(params: {
  centerId: string
  year: number
  month?: number
  type?: 'income' | 'expense' | 'all'
  category?: string
  searchTerm?: string
  limit?: number
}) {
  const db = getDb()
  const { centerId, year, month, type = 'all', category, searchTerm, limit = 50 } = params

  const snap = await db.collection('cashFlowRecords').where('centerId', '==', centerId).get()

  let list = snap.docs.map((d) => {
    const data = d.data()
    const norm = normalizeCashFlowRecord(data)
    let dateStr = ''
    let dateObj: Date | null = null

    if (data.date?.toDate) {
      dateObj = data.date.toDate()
    } else if (data.date) {
      dateObj = new Date(data.date)
    }

    if (dateObj && !isNaN(dateObj.getTime())) {
      dateStr = dateObj.toISOString().split('T')[0]
    }

    return {
      id: d.id,
      date: dateStr,
      dateObj,
      type: norm.type,
      category: norm.category,
      amount: norm.amount,
      account: norm.account,
      description: norm.description,
      notes: norm.notes,
    }
  })

  // Filter by year & month
  list = list.filter((r) => {
    if (!r.dateObj) return false
    if (r.dateObj.getFullYear() !== year) return false
    if (month && month !== 0 && r.dateObj.getMonth() + 1 !== month) return false
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

  // Sort by date desc
  list.sort((a, b) => (b.dateObj?.getTime() || 0) - (a.dateObj?.getTime() || 0))

  const totalCount = list.length
  let totalIncome = 0
  let totalExpense = 0

  list.forEach((r) => {
    if (r.type === 'income') totalIncome += r.amount
    else totalExpense += r.amount
  })

  const pagedList = list.slice(0, limit).map(({ id, date, type, category, amount, account, description, notes }) => ({
    id,
    date,
    type: type === 'income' ? '收入' : '支出',
    category,
    amount,
    account,
    description: description || '-',
    notes: notes || '-',
  }))

  return {
    year,
    month: month || 'all',
    totalRecordsFound: totalCount,
    totalIncome,
    totalExpense,
    netCashFlow: totalIncome - totalExpense,
    returnedCount: pagedList.length,
    records: pagedList,
  }
}

/**
 * Tool 2: get_profit_loss_summary
 */
export async function getProfitLossSummary(params: {
  centerId: string
  year: number
  month?: number | 'all'
}) {
  const db = getDb()
  const { centerId, year, month = 'all' } = params

  const snap = await db.collection('cashFlowRecords').where('centerId', '==', centerId).get()

  const incomeCategories: Record<string, number> = {}
  const expenseCategories: Record<string, number> = {}
  let totalIncome = 0
  let totalExpense = 0
  let recordCount = 0

  snap.docs.forEach((d) => {
    const data = d.data()
    const norm = normalizeCashFlowRecord(data)
    let dateObj: Date | null = null

    if (data.date?.toDate) dateObj = data.date.toDate()
    else if (data.date) dateObj = new Date(data.date)

    if (!dateObj || isNaN(dateObj.getTime())) return
    if (dateObj.getFullYear() !== year) return
    if (month !== 'all' && typeof month === 'number' && dateObj.getMonth() + 1 !== month) return

    recordCount++
    const cat = norm.category || '其他'
    if (norm.type === 'income') {
      incomeCategories[cat] = (incomeCategories[cat] || 0) + norm.amount
      totalIncome += norm.amount
    } else {
      expenseCategories[cat] = (expenseCategories[cat] || 0) + norm.amount
      totalExpense += norm.amount
    }
  })

  // Format category breakdowns
  const topIncomeCategories = Object.entries(incomeCategories)
    .map(([name, amount]) => ({ category: name, amount, percentage: totalIncome > 0 ? ((amount / totalIncome) * 100).toFixed(1) + '%' : '0%' }))
    .sort((a, b) => b.amount - a.amount)

  const topExpenseCategories = Object.entries(expenseCategories)
    .map(([name, amount]) => ({ category: name, amount, percentage: totalExpense > 0 ? ((amount / totalExpense) * 100).toFixed(1) + '%' : '0%' }))
    .sort((a, b) => b.amount - a.amount)

  return {
    year,
    month,
    recordCount,
    totalIncome,
    totalExpense,
    netProfit: totalIncome - totalExpense,
    topIncomeCategories,
    topExpenseCategories,
  }
}

/**
 * Tool 3: get_prepaid_and_realized_metrics
 */
export async function getPrepaidAndRealizedMetrics(params: {
  centerId: string
  year: number
  month?: number | 'all'
}) {
  const db = getDb()
  const { centerId, year, month = 'all' } = params

  // 1. Fetch contracts
  const contractsSnap = await db.collection('contracts').where('centerId', '==', centerId).get()

  let totalContractedAmount = 0
  let totalPaidAmount = 0
  let lumpSumTotal = 0
  let installmentPaidTotal = 0
  let totalContractSessions = 0
  let remainingContractSessions = 0

  contractsSnap.docs.forEach((doc) => {
    const c = doc.data()
    let createdAtObj: Date | null = null
    if (c.createdAt?.toDate) createdAtObj = c.createdAt.toDate()
    else if (c.createdAt) createdAtObj = new Date(c.createdAt)

    const isMatchPeriod =
      createdAtObj &&
      createdAtObj.getFullYear() === year &&
      (month === 'all' || createdAtObj.getMonth() + 1 === month)

    const total = Number(c.totalAmount || 0)
    const isInstallment =
      c.paymentType === 'installment' ||
      c.paymentType === 'installments' ||
      (Array.isArray(c.installments) && c.installments.length > 0)

    let paid = Number(c.paidAmount || 0)
    if (isInstallment && Array.isArray(c.installments) && c.installments.length > 0) {
      const installmentSum = c.installments
        .filter((inst: any) => inst.status === 'paid')
        .reduce((sum: number, inst: any) => sum + Number(inst.amount || 0), 0)
      if (installmentSum > 0) paid = installmentSum
    } else if (!isInstallment && paid === 0) {
      paid = total
    }

    if (isMatchPeriod) {
      totalContractedAmount += total
      totalPaidAmount += paid
      if (isInstallment) installmentPaidTotal += paid
      else lumpSumTotal += total
    }

    // Cumulative active sessions
    if (c.status === 'active' || c.status === 'expiring') {
      totalContractSessions += Number(c.totalSessions || 0)
      remainingContractSessions += Number(c.remainingSessions || 0)
    }
  })

  // 2. Fetch lessonRecords to compute realized revenue
  const lessonsSnap = await db.collection('lessonRecords').where('centerId', '==', centerId).get()

  let realizedLessonRevenue = 0
  let realizedLessonCount = 0

  lessonsSnap.docs.forEach((doc) => {
    const l = doc.data()
    let sessionDateObj: Date | null = null
    if (l.sessionDate?.toDate) sessionDateObj = l.sessionDate.toDate()
    else if (l.sessionDate) sessionDateObj = new Date(l.sessionDate)

    if (!sessionDateObj) return
    if (sessionDateObj.getFullYear() !== year) return
    if (month !== 'all' && sessionDateObj.getMonth() + 1 !== month) return

    realizedLessonRevenue += Number(l.sessionAmount || 0)
    realizedLessonCount++
  })

  // Unearned revenue estimate (預收學費負債餘額)
  const unearnedRevenueEstimate = Math.max(0, totalPaidAmount - realizedLessonRevenue)

  return {
    year,
    month,
    periodContractedAmount: totalContractedAmount,
    periodTotalPaidAmount: totalPaidAmount,
    lumpSumPaidAmount: lumpSumTotal,
    installmentPaidAmount: installmentPaidTotal,
    realizedLessonRevenue,
    realizedLessonCount,
    unearnedRevenueEstimate,
    activeContractsRemainingSessions: remainingContractSessions,
    activeContractsTotalSessions: totalContractSessions,
  }
}

/**
 * Tool 4: query_contract_payments
 */
export async function queryContractPayments(params: {
  centerId: string
  studentName?: string
  paymentStatus?: 'paid' | 'pending' | 'overdue' | 'all'
  limit?: number
}) {
  const db = getDb()
  const { centerId, studentName, paymentStatus = 'all', limit = 30 } = params

  // Fetch customers to map name to customerId
  const customersSnap = await db.collection('customers').where('centerId', '==', centerId).get()
  const customerMap = new Map<string, string>()
  customersSnap.docs.forEach((d) => {
    const data = d.data()
    customerMap.set(d.id, data.name || '')
  })

  // Fetch contracts
  const contractsSnap = await db.collection('contracts').where('centerId', '==', centerId).get()

  let results: any[] = []

  contractsSnap.docs.forEach((doc) => {
    const c = doc.data()
    const custName = customerMap.get(c.customerId) || c.customerId || '未知學員'

    if (studentName && !custName.toLowerCase().includes(studentName.toLowerCase())) {
      return
    }

    const total = Number(c.totalAmount || 0)
    const isInstallment =
      c.paymentType === 'installment' ||
      c.paymentType === 'installments' ||
      (Array.isArray(c.installments) && c.installments.length > 0)

    let paid = Number(c.paidAmount || 0)
    let overdueCount = 0
    let pendingCount = 0

    if (isInstallment && Array.isArray(c.installments)) {
      paid = c.installments
        .filter((inst: any) => inst.status === 'paid')
        .reduce((sum: number, inst: any) => sum + Number(inst.amount || 0), 0)

      overdueCount = c.installments.filter((inst: any) => inst.status === 'overdue').length
      pendingCount = c.installments.filter((inst: any) => inst.status === 'pending').length
    } else if (!isInstallment && paid === 0) {
      paid = total
    }

    let status: 'paid' | 'pending' | 'overdue' = 'paid'
    if (overdueCount > 0) status = 'overdue'
    else if (paid < total || pendingCount > 0) status = 'pending'

    if (paymentStatus !== 'all' && status !== paymentStatus) {
      return
    }

    let startDateStr = ''
    if (c.startDate?.toDate) startDateStr = c.startDate.toDate().toISOString().split('T')[0]

    results.push({
      contractNo: c.contractNo || doc.id.substring(0, 8),
      studentName: custName,
      contractType: c.contractType || 'single',
      totalSessions: Number(c.totalSessions || 0),
      remainingSessions: Number(c.remainingSessions || 0),
      totalAmount: total,
      paidAmount: paid,
      unpaidAmount: Math.max(0, total - paid),
      paymentType: isInstallment ? '分期付款' : '全額躉繳',
      paymentStatus: status === 'paid' ? '已付清' : status === 'overdue' ? '有逾期' : '分期中',
      startDate: startDateStr || '-',
    })
  })

  // Sort by unpaidAmount desc
  results.sort((a, b) => b.unpaidAmount - a.unpaidAmount)

  return {
    totalFound: results.length,
    contracts: results.slice(0, limit),
  }
}
