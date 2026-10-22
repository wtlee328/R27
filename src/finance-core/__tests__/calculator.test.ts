import { describe, it, expect } from 'vitest'
import {
  getContractPaymentInfo,
  getContractCategoryKey,
  calculatePrepaidAndRealized,
  calculateProfitLoss,
  isDateInPeriod,
} from '../calculator'
import { reconcileFinancialMetrics } from '../reconcile'
import type { RawContract, RawLessonRecord, RawCashFlowRecord } from '../types'

describe('finance-core calculator & domain logic', () => {
  it('correctly handles single payment contracts with totalAmount as paid', () => {
    const singleContract: RawContract = {
      id: 'c1',
      contractNo: '115080802',
      paymentType: 'single',
      totalAmount: 18200,
      totalSessions: 14,
      paidAmount: 19500, // Legacy dirty field in database
    }

    const info = getContractPaymentInfo(singleContract)
    expect(info.total).toBe(18200)
    // Non-installment contracts strictly recognize totalAmount as paid
    expect(info.paid).toBe(18200)
    expect(info.pending).toBe(0)
    expect(info.lumpSumAmount).toBe(18200)
    expect(info.installmentPaidAmount).toBe(0)
    expect(info.unitPrice).toBe(1300)
  })

  it('correctly calculates installment contracts and pending receivables', () => {
    const installmentContract: RawContract = {
      id: 'c2',
      contractNo: '115090301',
      paymentType: 'installments',
      totalAmount: 67200,
      totalSessions: 48,
      installments: [
        { id: 'i1', amount: 11200, status: 'paid' },
        { id: 'i2', amount: 11200, status: 'paid' },
        { id: 'i3', amount: 11200, status: 'pending' },
        { id: 'i4', amount: 11200, status: 'pending' },
        { id: 'i5', amount: 11200, status: 'pending' },
        { id: 'i6', amount: 11200, status: 'pending' },
      ],
    }

    const info = getContractPaymentInfo(installmentContract)
    expect(info.total).toBe(67200)
    expect(info.paid).toBe(22400)
    expect(info.pending).toBe(44800)
    expect(info.isInstallment).toBe(true)
    expect(info.lumpSumAmount).toBe(0)
    expect(info.installmentPaidAmount).toBe(22400)
    expect(info.unitPrice).toBe(1400)
  })

  it('correctly classifies contract categories', () => {
    expect(getContractCategoryKey({ id: '1', contractType: 'single' })).toBe('single')
    expect(getContractCategoryKey({ id: '2', contractType: 'dual' })).toBe('dual')
    expect(getContractCategoryKey({ id: '3', contractType: 'shared' })).toBe('shared')
    expect(getContractCategoryKey({ id: '4', contractType: 'group' })).toBe('group')
    expect(getContractCategoryKey({ id: '5', sharedWithCustomerId: 'custB' })).toBe('dual')
  })

  it('computes realized revenue accurately using contract unit prices', () => {
    const contracts: RawContract[] = [
      {
        id: 'c1',
        totalAmount: 18200,
        totalSessions: 14, // 1300/session
        remainingSessions: 4,
        createdAt: new Date('2026-08-01T10:00:00+08:00'),
      },
      {
        id: 'c2',
        totalAmount: 67200,
        totalSessions: 48, // 1400/session
        remainingSessions: 40,
        createdAt: new Date('2026-09-01T10:00:00+08:00'),
      },
    ]

    const lessonRecords: RawLessonRecord[] = [
      {
        id: 'l1',
        sessionDate: new Date('2026-08-05T10:00:00+08:00'),
        contractId: 'c1',
        sessionAmount: 2, // 2 * 1300 = 2600
      },
      {
        id: 'l2',
        sessionDate: new Date('2026-09-05T10:00:00+08:00'),
        contractId: 'c2',
        sessionAmount: 1, // 1 * 1400 = 1400
      },
    ]

    const summary = calculatePrepaidAndRealized(contracts, lessonRecords, { year: 2026 })

    expect(summary.realizedRevenueTotal).toBe(4000) // 2600 + 1400
    expect(summary.totalSessionsUsed).toBe(3)
    expect(summary.averageSessionPrice).toBe(Math.round(4000 / 3))

    // Unearned liability balance: 4 * 1300 + 40 * 1400 = 5200 + 56000 = 61200
    expect(summary.unearnedLiabilityBalance).toBe(61200)
    expect(summary.remainingSessionsCount).toBe(44)
  })

  it('reconciles contracts total vs paid and highlights pending installments', () => {
    const contracts: RawContract[] = [
      {
        id: 'c1',
        contractNo: '115080802',
        paymentType: 'single',
        totalAmount: 18200,
      },
      {
        id: 'c2',
        contractNo: '115090301',
        paymentType: 'installments',
        totalAmount: 67200,
        installments: [
          { id: 'i1', amount: 11200, status: 'paid' },
          { id: 'i2', amount: 11200, status: 'pending' },
        ],
      },
    ]

    const result = reconcileFinancialMetrics({
      reconcileType: 'contracts_total_vs_paid',
      contracts,
    })

    expect(result.isBalanced).toBe(false)
    expect(result.sideATotal).toBe(18200 + 67200)
    expect(result.sideBTotal).toBe(18200 + 11200)
    expect(result.differenceTotal).toBe(56000)
    expect(result.discrepancies.length).toBe(1)
    expect(result.discrepancies[0].code).toBe('115090301')
    expect(result.discrepancies[0].difference).toBe(56000)
  })

  it('computes Operating Accrual Profit & Loss vs Cash Flow Net', () => {
    const contracts: RawContract[] = [
      {
        id: 'c1',
        totalAmount: 18200,
        totalSessions: 14,
        remainingSessions: 12,
        createdAt: new Date('2026-08-01T10:00:00+08:00'),
      },
    ]

    const lessonRecords: RawLessonRecord[] = [
      {
        id: 'l1',
        sessionDate: new Date('2026-08-05T10:00:00+08:00'),
        contractId: 'c1',
        sessionAmount: 2, // Realized = 2 * 1300 = 2600
      },
    ]

    const cashFlowRecords: RawCashFlowRecord[] = [
      {
        id: 'cf1',
        date: new Date('2026-08-01T10:00:00+08:00'),
        type: 'income',
        category: '課程收入',
        amount: 18200, // Prepaid Tuition in cash
      },
      {
        id: 'cf2',
        date: new Date('2026-08-02T10:00:00+08:00'),
        type: 'income',
        category: '場租收入',
        amount: 5000, // Non-tuition operating income
      },
      {
        id: 'cf3',
        date: new Date('2026-08-10T10:00:00+08:00'),
        type: 'expense',
        category: '場館房租',
        amount: 10000,
      },
    ]

    const pnl = calculateProfitLoss(cashFlowRecords, contracts, lessonRecords, { year: 2026, month: 8 })

    // Accrual operating income: 2600 (realized lessons) + 5000 (venue rent) = 7600
    expect(pnl.realizedLessonRevenue).toBe(2600)
    expect(pnl.otherOperatingIncome).toBe(5000)
    expect(pnl.totalOperatingIncome).toBe(7600)
    expect(pnl.totalOperatingExpense).toBe(10000)
    expect(pnl.accrualNetProfit).toBe(-2400) // 7600 - 10000

    // Cash Net Flow: 18200 + 5000 - 10000 = 13200
    expect(pnl.totalCashIncome).toBe(23200)
    expect(pnl.totalCashExpense).toBe(10000)
    expect(pnl.cashNetFlow).toBe(13200)
  })
})
