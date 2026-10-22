import type {
  RawContract,
  RawLessonRecord,
  RawCashFlowRecord,
  PeriodFilter,
  ReconcileResult,
  ReconcileItem,
} from './types'
import { getContractPaymentInfo, isDateInPeriod, normalizeCashFlow } from './calculator'

/**
 * Reconciles two financial concepts and returns itemized discrepancies with clear business reasons.
 */
export function reconcileFinancialMetrics(params: {
  reconcileType: 'contracts_total_vs_paid' | 'collected_vs_realized' | 'cashflow_tuition_vs_contracts'
  contracts: RawContract[]
  lessonRecords?: RawLessonRecord[]
  cashFlowRecords?: RawCashFlowRecord[]
  period?: PeriodFilter
}): ReconcileResult {
  const { reconcileType, contracts, lessonRecords = [], cashFlowRecords = [], period } = params

  if (reconcileType === 'contracts_total_vs_paid') {
    let sideATotal = 0 // Contract Total
    let sideBTotal = 0 // Collected Paid
    const discrepancies: ReconcileItem[] = []

    contracts.forEach((c) => {
      if (!isDateInPeriod(c.createdAt, period)) return

      const info = getContractPaymentInfo(c)
      sideATotal += info.total
      sideBTotal += info.paid

      if (info.total !== info.paid) {
        const diff = info.total - info.paid
        const reason = info.isInstallment
          ? `分期付款合約（共 ${c.installments?.length || 0} 期），尚有未收分期款 NT$ ${diff.toLocaleString()}。`
          : info.paid < info.total
            ? `一次付清合約，但實收金額少於合約總額 NT$ ${diff.toLocaleString()}。`
            : `實收金額大於合約總額 NT$ ${Math.abs(diff).toLocaleString()}。`

        discrepancies.push({
          id: c.id,
          code: c.contractNo || c.id,
          name: c.studentName || c.customerName || '學員合約',
          description: `合約總額 NT$ ${info.total.toLocaleString()}，已收 NT$ ${info.paid.toLocaleString()}`,
          sideAValue: info.total,
          sideBValue: info.paid,
          difference: diff,
          reason,
        })
      }
    })

    const diffTotal = sideATotal - sideBTotal
    return {
      reconcileType,
      title: '合約總簽約額 vs 實收款項 勾稽對帳表',
      sideAName: '合約總額 (Total Contracted)',
      sideBName: '已收款額 (Collected Paid)',
      sideATotal: Math.round(sideATotal),
      sideBTotal: Math.round(sideBTotal),
      differenceTotal: Math.round(diffTotal),
      isBalanced: discrepancies.length === 0,
      summary:
        discrepancies.length === 0
          ? '兩者完全一致，所有合約均已全額結清。'
          : `共發現 ${discrepancies.length} 筆差額合約，合計差異 NT$ ${Math.round(diffTotal).toLocaleString()}。主要原因為分期付款合約之待收分期帳款。`,
      discrepancies: discrepancies.sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference)),
    }
  }

  if (reconcileType === 'collected_vs_realized') {
    // Contract collected vs Realized
    const contractMap = new Map<string, RawContract>()
    contracts.forEach((c) => contractMap.set(c.id, c))

    const contractRealizedMap = new Map<string, number>()
    lessonRecords.forEach((r) => {
      if (!isDateInPeriod(r.sessionDate, period)) return
      const deductions =
        r.deductions && r.deductions.length > 0
          ? r.deductions
          : [{ contractId: r.contractId || '', sessionAmount: r.sessionAmount || 1 }]

      deductions.forEach((d) => {
        const c = contractMap.get(d.contractId)
        const sessions = Number(d.sessionAmount || 1)
        const unitPrice = c && Number(c.totalSessions) > 0 ? Number(c.totalAmount || 0) / Number(c.totalSessions) : 1500
        const current = contractRealizedMap.get(d.contractId) || 0
        contractRealizedMap.set(d.contractId, current + sessions * unitPrice)
      })
    })

    let sideATotal = 0 // Paid in period (or all-time)
    let sideBTotal = 0 // Realized in period (or all-time)
    const discrepancies: ReconcileItem[] = []
    const isAllTime = !period || (!period.year && !period.startDate && !period.endDate)

    contracts.forEach((c) => {
      // If a specific period is requested, only consider contracts created within that period for period reconciliation
      if (!isAllTime && !isDateInPeriod(c.createdAt, period)) {
        return
      }

      const info = getContractPaymentInfo(c)
      const realized = contractRealizedMap.get(c.id) || 0
      sideATotal += info.paid
      sideBTotal += realized

      const diff = info.paid - realized
      if (Math.abs(diff) > 1) {
        const remSessions = Number(c.remainingSessions || 0)
        const reason =
          diff > 0
            ? `預收款大於銷課實現 NT$ ${Math.round(diff).toLocaleString()}（剩餘待履約 ${remSessions} 堂課）。`
            : `銷課金額大於實收款項 NT$ ${Math.round(Math.abs(diff)).toLocaleString()}（超額履約或補課）。`

        discrepancies.push({
          id: c.id,
          code: c.contractNo || c.id,
          name: c.studentName || c.customerName || '學員合約',
          description: `實收 NT$ ${info.paid.toLocaleString()}，已履約實現 NT$ ${Math.round(realized).toLocaleString()}`,
          sideAValue: info.paid,
          sideBValue: Math.round(realized),
          difference: Math.round(diff),
          reason,
        })
      }
    })

    const diffTotal = sideATotal - sideBTotal
    const scopeLabel = isAllTime ? '全期（歷史至今）' : '指定期間'
    return {
      reconcileType,
      title: `${scopeLabel} 合約實收款項 vs 銷課實現營收 履約對帳表`,
      sideAName: isAllTime ? '全期實收款項 (All-Time Paid)' : '期間合約實收款 (Period Paid)',
      sideBName: isAllTime ? '全期銷課實現營收 (All-Time Realized)' : '期間銷課實現營收 (Period Realized)',
      sideATotal: Math.round(sideATotal),
      sideBTotal: Math.round(sideBTotal),
      differenceTotal: Math.round(diffTotal),
      isBalanced: Math.abs(diffTotal) < 1,
      summary: isAllTime
        ? `全期實收扣除銷課營收之淨差額為 NT$ ${Math.round(diffTotal).toLocaleString()}。差額正值代表學員已付款但尚未履約之「預收學費負債餘額」。`
        : `該期間新簽合約實收款 NT$ ${Math.round(sideATotal).toLocaleString()}，扣除期間內銷課營收 NT$ ${Math.round(sideBTotal).toLocaleString()}，差額為 NT$ ${Math.round(diffTotal).toLocaleString()}。`,
      discrepancies: discrepancies.sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference)).slice(0, 30),
    }
  }

  // cashflow_tuition_vs_contracts
  let cashFlowTuitionTotal = 0
  const isTuitionCat = (cat: string) =>
    ['學費', '課程', '教練課', '預收'].some((k) => cat.includes(k))

  cashFlowRecords.forEach((raw) => {
    if (!isDateInPeriod(raw.date, period)) return
    const norm = normalizeCashFlow(raw)
    if (norm.type === 'income' && isTuitionCat(norm.category)) {
      cashFlowTuitionTotal += norm.amount
    }
  })

  let contractCollectedTotal = 0
  contracts.forEach((c) => {
    if (!isDateInPeriod(c.createdAt, period)) return
    const info = getContractPaymentInfo(c)
    contractCollectedTotal += info.paid
  })

  const diff = cashFlowTuitionTotal - contractCollectedTotal
  return {
    reconcileType: 'cashflow_tuition_vs_contracts',
    title: '現金流學費入帳 vs 合約簽約實收款 稽核比對表',
    sideAName: '現金流水帳學費收入 (Cash Flow Records)',
    sideBName: '合約模組實收款項 (Contracts Paid)',
    sideATotal: Math.round(cashFlowTuitionTotal),
    sideBTotal: Math.round(contractCollectedTotal),
    differenceTotal: Math.round(diff),
    isBalanced: Math.abs(diff) < 1,
    summary:
      Math.abs(diff) < 1
        ? '現金流學費流水帳與合約模組實收款完全一致。'
        : `現金流水帳學費收入與合約模組實收相差 NT$ ${Math.round(diff).toLocaleString()}。原因在於：現金流紀錄代表銀行實際入帳日期，而合約實收款以合約建檔期計算。`,
    discrepancies: [],
  }
}
