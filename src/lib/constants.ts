// ─── Roles ────────────────────────────────────────────────────
export const USER_ROLES = {
  ADMIN: 'admin',
  TRAINER: 'trainer',
} as const

// ─── Cash Flow Categories ─────────────────────────────────────
export const DEBIT_CATEGORIES = [
  '現金',
  '銀行存款',
  '應收帳款',
]

export const CREDIT_INCOME_CATEGORIES = [
  '課程收入（實際收入）',
  '體驗收入',
  '場租收入',
  '拳擊團課/贈與課程',
]

export const CREDIT_EXPENSE_CATEGORIES = [
  '攤提',
  '房租',
  '雜項',
  '水電',
  '行銷',
  '會計',
  '網路',
  '器材',
  '新光AED',
  '公司福利',
  '保險',
  '薪資',
  '營業稅',
]

export const ALL_CREDIT_CATEGORIES = [
  ...CREDIT_INCOME_CATEGORIES,
  ...CREDIT_EXPENSE_CATEGORIES,
]

// ─── P&L Income/Expense mapping ───────────────────────────────
export const PL_INCOME_CATEGORIES = [
  '課程收入（實際收入）',
  '體驗收入',
  '場租收入',
  '拳擊團課/贈與課程',
]

export const PL_EXPENSE_CATEGORIES = [
  '攤提',
  '房租',
  '雜項',
  '水電',
  '行銷',
  '會計',
  '網路',
  '器材',
  '新光AED',
  '公司福利',
  '保險',
  '薪資',
  '營業稅',
]

// ─── Contract / Installment statuses ─────────────────────────
export const CONTRACT_STATUS_LABELS: Record<string, string> = {
  active: '生效中',
  expiring: '即將到期',
  expired: '已到期',
  completed: '已完成',
}

export const INSTALLMENT_STATUS_LABELS: Record<string, string> = {
  pending: '待收款',
  paid: '已收款',
  overdue: '逾期',
}

// ─── Trial Outcomes ───────────────────────────────────────────
export const TRIAL_OUTCOME_LABELS: Record<string, string> = {
  pending: '待跟進',
  converted: '已成交',
  not_converted: '未成交',
}

// ─── Month names ──────────────────────────────────────────────
export const MONTH_NAMES = [
  '1月', '2月', '3月', '4月', '5月', '6月',
  '7月', '8月', '9月', '10月', '11月', '12月',
]

export const MONTH_OPTIONS = [
  { value: '', label: '全年' },
  ...MONTH_NAMES.map((m, i) => ({ value: String(i + 1), label: m })),
]

// ─── Emergency contact relation options ──────────────────────
export const RELATION_OPTIONS = [
  '母親', '父親', '配偶', '兄弟', '姐妹', '子女', '朋友', '其他',
]

// ─── Chronic conditions (checkbox list) ──────────────────────
export const CHRONIC_CONDITIONS = [
  '高血壓',
  '糖尿病',
  '心臟病',
  '氣喘',
  '骨質疏鬆',
  '甲狀腺疾病',
  '腎臟病',
  '癌症',
  '自體免疫疾病',
]

// ─── Centers ──────────────────────────────────────────────────
export const CENTERS = {
  R27: 'r27',
  COFFIT: 'coffit',
} as const

export const CENTER_LABELS = {
  [CENTERS.R27]: 'R27 Fitness',
  [CENTERS.COFFIT]: 'Coffit',
} as const

// ─── Firestore collection names ───────────────────────────────
export const COLLECTIONS = {
  USERS: 'users',
  CUSTOMERS: 'customers',
  CONTRACTS: 'contracts',
  LESSON_RECORDS: 'lessonRecords',
  CASH_FLOW_RECORDS: 'cashFlowRecords',
  TRIAL_RECORDS: 'trialRecords',
  VENUE_RENTALS: 'venueRentals',
  SYSTEM_CONFIG: 'systemConfig',
  TRAINERS: 'trainers',
  NOTIFICATIONS: 'notifications',
  RENTER_CUSTOMERS: 'renterCustomers',
  VENUE_BOOKINGS: 'venueBookings',
  ACTIVITY_LOGS: 'activityLogs',
} as const

// ─── Trainer Account Emails ──────────────────────────────────
export const TRAINER_EMAILS: Record<string, string> = {
  'trainer-r27@r27app.com': 'r27',
  'trainer-coffit@r27app.com': 'coffit',
}

// ─── Booking Status Labels ──────────────────────────────────
export const BOOKING_STATUS_LABELS: Record<string, string> = {
  pending: '待審核',
  approved: '已核准',
  rejected: '已駁回',
}

// ─── Activity Log Labels ────────────────────────────────────
export const ACTIVITY_ACTION_LABELS: Record<string, string> = {
  create: '新增',
  update: '編輯',
  delete: '刪除',
}

export const ACTIVITY_MODULE_LABELS: Record<string, string> = {
  lessonRecords: '教練銷課',
  trialRecords: '體驗客',
  venueBookings: '場租管理',
  customers: '學員管理',
}

// ─── Default Operating Hours ────────────────────────────────
export const DEFAULT_OPERATING_HOURS = {
  startTime: '09:00',
  endTime: '05:00',
} as const


