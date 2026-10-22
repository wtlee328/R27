import type { MetricDefinition } from './types'

/**
 * Metric Registry - The Canonical Financial Metrics of the System
 * Used to power AI knowledge injection, documentation, and frontend validation.
 */
export const METRIC_REGISTRY: Record<string, MetricDefinition> = {
  contractedAmount: {
    id: 'contractedAmount',
    label: '合約總簽約額',
    category: 'contract',
    basis: 'accrual',
    definition: '查詢期間內新簽約之所有合約總金額（代表場館銷售簽約總規模）。',
    formula: 'Σ (新簽合約之 totalAmount)',
    uiLocations: ['財務 > 預收與銷課 > 新合約簽約額卡片', '客戶管理 > 合約總額'],
    format: 'currency',
  },
  totalCollectedAmount: {
    id: 'totalCollectedAmount',
    label: '期間合約實收款',
    category: 'contract',
    basis: 'cash',
    definition: '查詢期間內合約實際收取之款項總計（一次付清以全額計，分期付款以期間內已繳期數加總）。',
    formula: 'Σ (一次付清全額 + 分期已繳期數金額)',
    uiLocations: ['財務 > 預收與銷課 > 實收金額副標題'],
    format: 'currency',
  },
  lumpSumPaidAmount: {
    id: 'lumpSumPaidAmount',
    label: '一次付清實收金額',
    category: 'contract',
    basis: 'cash',
    definition: '查詢期間內所有全額躉繳（一次付清）合約之總金額。',
    formula: 'Σ (paymentType === "single" 之 totalAmount)',
    uiLocations: ['財務 > 預收與銷課 > 一次付清副標題'],
    format: 'currency',
  },
  installmentPaidAmount: {
    id: 'installmentPaidAmount',
    label: '分期付款已收款',
    category: 'contract',
    basis: 'cash',
    definition: '查詢期間內分期付款合約中已收訖各期之金額加總。',
    formula: 'Σ (installments 中 status === "paid" 之金額)',
    uiLocations: ['財務 > 預收與銷課 > 分期已付副標題', '分期收款管理 > 已收金額'],
    format: 'currency',
  },
  pendingInstallmentsAmount: {
    id: 'pendingInstallmentsAmount',
    label: '待收分期款帳款',
    category: 'contract',
    basis: 'accrual',
    definition: '所有分期合約中尚未繳款之剩餘未收期數總額（屬於場館之應收帳款債權）。',
    formula: 'Σ (分期合約 totalAmount - 分期已收金額)',
    uiLocations: ['財務 > 預收與銷課 > 待收分期副標題', '資產負債表 > 流動資產 > 待收分期款'],
    format: 'currency',
  },
  realizedLessonRevenue: {
    id: 'realizedLessonRevenue',
    label: '銷課實現營收',
    category: 'lesson',
    basis: 'accrual',
    definition: '查詢期間內教練實際完成授課之已履約營收。每筆扣課嚴格按該學員合約之單堂均價換算。',
    formula: 'Σ (扣課堂數 sessionAmount × [合約總額 totalAmount ÷ 合約總堂數 totalSessions])，若無對應合約則每堂以 1500 計。',
    uiLocations: ['財務 > 預收與銷課 > 銷課金額卡片', '財務 > 損益表 > 銷課收入 (已實現履約營收)'],
    format: 'currency',
  },
  realizedLessonSessions: {
    id: 'realizedLessonSessions',
    label: '銷課總堂數',
    category: 'lesson',
    basis: 'hybrid',
    definition: '查詢期間內場館教練實際扣課履約之總堂數。',
    formula: 'Σ (扣課紀錄之 sessionAmount 堂數)',
    uiLocations: ['財務 > 預收與銷課 > 已履約堂數卡片', '教練銷課 > 銷課總堂數'],
    format: 'number',
  },
  averageSessionPrice: {
    id: 'averageSessionPrice',
    label: '平均單堂均價',
    category: 'lesson',
    basis: 'accrual',
    definition: '查詢期間內平均每堂課之實現營收單價。',
    formula: '銷課實現營收 realizedLessonRevenue ÷ 銷課總堂數 realizedLessonSessions',
    uiLocations: ['財務 > 預收與銷課 > 均堂價副標題'],
    format: 'currency',
  },
  unearnedLiabilityBalance: {
    id: 'unearnedLiabilityBalance',
    label: '預收學費負債餘額',
    category: 'liability',
    basis: 'accrual',
    definition: '全場館所有有效或履約中合約之剩餘待履約義務金額（屬於場館之流動負債，學員上課後才轉為營收）。',
    formula: 'Σ (有效合約剩餘堂數 remainingSessions × [合約總額 ÷ 合約總堂數])',
    uiLocations: ['財務 > 預收與銷課 > 預收學費負債餘額卡片', '資產負債表 > 流動負債 > 預收學費'],
    format: 'currency',
  },
  remainingSessionsCount: {
    id: 'remainingSessionsCount',
    label: '剩餘待履約堂數',
    category: 'liability',
    basis: 'hybrid',
    definition: '全場館所有有效合約中尚未上完、等待教練履約之總剩餘堂數。',
    formula: 'Σ (有效合約之 remainingSessions)',
    uiLocations: ['財務 > 預收與銷課 > 剩餘堂數待履約副標題'],
    format: 'number',
  },
  allTimeCollected: {
    id: 'allTimeCollected',
    label: '全期實收款總額',
    category: 'contract',
    basis: 'cash',
    definition: '自創立至今全場合約之累計實收款總額（一次付清合約以總額計，分期合約以已繳各期加總）。',
    formula: 'Σ (全場所有合約的實收款項)',
    uiLocations: ['財務 > 預收與銷課 > 總已收款項扣銷課金額卡片之副標題「全期實收」'],
    format: 'currency',
  },
  allTimeRealized: {
    id: 'allTimeRealized',
    label: '全期銷課營收總額',
    category: 'lesson',
    basis: 'accrual',
    definition: '自創立至今全場教練累計已完成銷課履約之總金額。',
    formula: 'Σ (全場所有銷課扣課之均堂價營收)',
    uiLocations: ['財務 > 預收與銷課 > 總已收款項扣銷課金額卡片之副標題「銷課」'],
    format: 'currency',
  },
  operatingIncome: {
    id: 'operatingIncome',
    label: '權責制營業總收入',
    category: 'pnl',
    basis: 'accrual',
    definition: '場館損益表標準之營業收入（已實現銷課營收 + 場租收入 + 體驗課收入 + 其他非學費營業收入）。預收學費未上課前不列入收入。',
    formula: '銷課實現營收 + 其他非課程營業現金收入',
    uiLocations: ['財務 > 損益表 > 總收入合計'],
    format: 'currency',
  },
  operatingExpense: {
    id: 'operatingExpense',
    label: '營業總支出',
    category: 'pnl',
    basis: 'accrual',
    definition: '查詢期間內場館所有營運支出（薪資、房租、水電、耗材、行銷等各項費用）。',
    formula: 'Σ (現金流中 type === "expense" 之支出金額)',
    uiLocations: ['財務 > 損益表 > 總支出合計', '收支流水帳 > 總支出'],
    format: 'currency',
  },
  accrualNetProfit: {
    id: 'accrualNetProfit',
    label: '權責制經營淨損益',
    category: 'pnl',
    basis: 'accrual',
    definition: '場館損益表之淨利潤（營業總收入扣除各項營業支出）。真實反映場館之營運獲利能力。',
    formula: '權責制營業總收入 operatingIncome - 營業總支出 operatingExpense',
    uiLocations: ['財務 > 損益表 > 淨收益 (Net Income)'],
    format: 'currency',
  },
  cashNetFlow: {
    id: 'cashNetFlow',
    label: '收付實現現金流淨額',
    category: 'cashflow',
    basis: 'cash',
    definition: '查詢期間內銀行與現金帳戶之實際進出淨差額（實際進帳現金扣除實際支出現金）。',
    formula: '期間實收現金流水總額 - 期間實際支現流水總額',
    uiLocations: ['收支流水帳 > 收支淨額'],
    format: 'currency',
  },
}

/**
 * Generates formatted prompt instruction for AI from the Registry
 */
export function generateRegistryPromptSnippet(): string {
  const lines: string[] = [
    '【會計核心指標註冊表（Semantic Metric Registry）與官方計算規則】：',
    '你必須嚴格遵循以下官方指標定義與計算公式回答，絕不可自行發明算法或混淆指標：',
  ]

  Object.values(METRIC_REGISTRY).forEach((m) => {
    lines.push(`- 【${m.label}】(${m.id})：`)
    lines.push(`  * 定義：${m.definition}`)
    lines.push(`  * 公式：${m.formula}`)
    lines.push(`  * 認列基礎：${m.basis === 'accrual' ? '權責發生制' : m.basis === 'cash' ? '收付實現制' : '混合制'}`)
    lines.push(`  * 前端報表對應位置：${m.uiLocations.join('、')}`)
  })

  return lines.join('\n')
}
