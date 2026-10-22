/**
 * Financial Core Engine - Common Domain Types
 * Single Source of Truth for all financial & accounting logic across Frontend and AI.
 */

export type ContractPaymentType = 'single' | 'installment' | 'installments'
export type ContractCategoryKey = 'single' | 'dual' | 'shared' | 'group'
export type AccountingBasis = 'accrual' | 'cash' | 'hybrid'

export interface RawInstallment {
  id: string
  amount: number
  status: 'paid' | 'pending' | 'overdue'
  dueDate?: any
  paidDate?: any
}

export interface RawContract {
  id: string
  contractNo?: string
  customerId?: string
  customerName?: string
  customerIds?: string[]
  studentName?: string
  totalAmount?: number
  paidAmount?: number
  totalSessions?: number
  remainingSessions?: number
  paymentType?: string
  contractType?: string
  status?: string
  installments?: RawInstallment[]
  sharedWithCustomerId?: string | null
  groupMemberQuotas?: Record<string, any>
  createdAt?: any
  startDate?: any
  endDate?: any
  centerId?: string
  trainerId?: string
}

export interface RawLessonDeduction {
  customerId?: string
  customerName?: string
  contractId: string
  sessionAmount: number
}

export interface RawLessonRecord {
  id: string
  sessionDate?: any
  customerId?: string
  customerName?: string
  contractId?: string
  sessionAmount?: number
  deductions?: RawLessonDeduction[]
  centerId?: string
  trainerId?: string
  notes?: string
}

export interface RawCashFlowRecord {
  id: string
  date?: any
  amount?: number
  type?: 'income' | 'expense' | string
  category?: string
  debitCategory?: string
  creditCategory?: string
  debitAmount?: number
  creditAmount?: number
  account?: string
  description?: string
  notes?: string
  centerId?: string
}

export interface PeriodFilter {
  year?: number
  month?: number | 'all'
  startDate?: string // YYYY-MM-DD
  endDate?: string   // YYYY-MM-DD
}

export interface ContractPaymentInfo {
  total: number
  paid: number
  pending: number
  isInstallment: boolean
  lumpSumAmount: number
  installmentPaidAmount: number
  categoryKey: ContractCategoryKey
  unitPrice: number
}

export interface CategoryMetricBreakdown {
  key: ContractCategoryKey
  label: string
  newAmount: number
  newContractsCount: number
  lumpSum: number
  installmentPaid: number
  realizedRevenue: number
  realizedSessions: number
  liabilityBalance: number
  remainingSessions: number
}

export interface PrepaidAndRealizedSummary {
  periodLabel: string
  // Contract metrics
  newContractsTotalValue: number
  totalCollectedAmount: number
  lumpSumTotal: number
  installmentPaidTotal: number
  pendingInstallmentsTotal: number
  allTimeCollected: number
  // Realized revenue metrics
  realizedRevenueTotal: number
  totalSessionsUsed: number
  averageSessionPrice: number
  allTimeRealized: number
  // Liability metrics
  unearnedLiabilityBalance: number
  remainingSessionsCount: number
  allTimeNetCollectedMinusRealized: number
  // Breakdowns
  categoryList: CategoryMetricBreakdown[]
}

export interface ProfitLossSummary {
  periodLabel: string
  // Accrual basis (經營損益 - 損益表標準)
  realizedLessonRevenue: number
  otherOperatingIncome: number
  totalOperatingIncome: number
  totalOperatingExpense: number
  accrualNetProfit: number
  // Cash basis (收付實現 - 現金流量標準)
  totalCashIncome: number
  totalCashExpense: number
  cashNetFlow: number
  // Detailed lists
  topIncomeCategories: Array<{ category: string; amount: number; percentage: string }>
  topExpenseCategories: Array<{ category: string; amount: number; percentage: string }>
}

export interface ReconcileItem {
  id: string
  code?: string
  name: string
  description: string
  sideAValue: number
  sideBValue: number
  difference: number
  reason: string
}

export interface ReconcileResult {
  reconcileType: string
  title: string
  sideAName: string
  sideBName: string
  sideATotal: number
  sideBTotal: number
  differenceTotal: number
  isBalanced: boolean
  summary: string
  discrepancies: ReconcileItem[]
}

export interface MetricDefinition {
  id: string
  label: string
  category: 'contract' | 'lesson' | 'liability' | 'pnl' | 'cashflow'
  basis: AccountingBasis
  definition: string
  formula: string
  uiLocations: string[]
  format: 'currency' | 'number' | 'percentage'
}
