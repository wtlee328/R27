import { z } from 'zod'

// ─── Customer Schemas ─────────────────────────────────────────

export const emergencyContactSchema = z.object({
  name: z.string().min(1, '請輸入緊急聯絡人姓名'),
  relation: z.string().min(1, '請輸入關係'),
  phone: z.string().min(1, '請輸入緊急聯絡人電話'),
})

export const medicalHistorySchema = z.object({
  chronicConditions: z.array(z.string()),
  injuries: z.array(z.string()),
  notes: z.string().optional(),
})

export const customerFormSchema = z.object({
  name: z.string().min(1, '請輸入姓名'),
  idNumber: z.string().min(1, '請輸入身分證字號'),
  phone: z.string().min(1, '請輸入電話'),
  email: z.string().email('請輸入有效的電子郵件').or(z.literal('')),
  dateOfBirth: z.date({
    required_error: '請選擇出生年月日',
  }),
  historicalSessions: z.coerce.number().min(0).default(0),
  emergencyContact: emergencyContactSchema,
  sharedContractCustomerId: z.string().nullable().default(null),
  medicalHistory: medicalHistorySchema,
})

export type CustomerFormValues = z.infer<typeof customerFormSchema>

// ─── Contract Schemas ─────────────────────────────────────────

export const installmentSchema = z.object({
  id: z.string(),
  amount: z.coerce.number().min(0, '金額不能為負數'),
  dueDate: z.date({
    required_error: '請選擇應付日期',
  }),
  paidDate: z.date().nullable(),
  status: z.enum(['pending', 'paid', 'overdue']),
})

export const contractFormSchema = z.object({
  customerId: z.string().min(1, '請選擇客戶'),
  sharedWithCustomerId: z.string().nullable().default(null),
  totalSessions: z.coerce.number().min(1, '堂數必須大於 0'),
  remainingSessions: z.coerce.number().min(0, '剩餘堂數不能為負數'),
  pricePerSession: z.coerce.number().min(0, '單堂價格不能為負數'),
  totalAmount: z.coerce.number().min(0, '總金額不能為負數'),
  paidAmount: z.coerce.number().min(0, '已付金額不能為負數'),
  installments: z.array(installmentSchema),
  startDate: z.date({
    required_error: '請選擇合約開始日期',
  }),
  endDate: z.date({
    required_error: '請選擇合約結束日期',
  }),
  status: z.enum(['active', 'expiring', 'expired', 'completed']),
  signatureDataUrl: z.string().nullable().default(null),
  secondarySignatureDataUrl: z.string().nullable().default(null),
  isAgreed: z.boolean().default(false),
  contractType: z.enum(['single', 'dual']).default('single'),
  customerIds: z.array(z.string()).optional(),
  primaryCustomerId: z.string().optional(),
})

export type ContractFormValues = z.infer<typeof contractFormSchema>

export const combinedCustomerContractSchema = customerFormSchema.extend({
  contract: contractFormSchema.omit({ customerId: true }).optional(),
  partnerMode: z.enum(['none', 'existing', 'new']).optional().default('none'),
  partnerId: z.string().nullable().optional().default(null),
  partnerCustomerData: customerFormSchema.nullable().optional().default(null),
})
export type CombinedCustomerContractValues = z.infer<typeof combinedCustomerContractSchema>


// ─── Cash Flow Schemas ────────────────────────────────────────

export const cashFlowFormSchema = z.object({
  date: z.date({
    required_error: '請選擇日期',
  }),
  debitCategory: z.string().min(1, '請輸入借方科目 (現金/銀行存款等)'),
  debitAmount: z.coerce.number().min(0, '金額不能為負數'),
  creditCategory: z.string().min(1, '請輸入貸方科目 (收入/負債等)'),
  creditAmount: z.coerce.number().min(0, '金額不能為負數'),
  description: z.string().min(1, '請輸入摘要'),
  notes: z.string().optional().default(''),
  source: z.enum(['manual', 'venue_rental', 'csv_import', 'lesson']).optional().default('manual'),
  sourceId: z.string().nullable().optional().default(null),
})

export type CashFlowFormValues = z.infer<typeof cashFlowFormSchema>

// ─── Lesson Record Schemas ─────────────────────────────────────

export const lessonRecordFormSchema = z.object({
  customerId: z.string().min(1, '請選擇客戶'),
  customerName: z.string().min(1, '無效的客戶名稱'),
  contractId: z.string().min(1, '請選擇合約'),
  sessionDate: z.date({
    required_error: '請選擇上課日期',
  }),
  sessionAmount: z.coerce.number().min(0.5, '消耗堂數必須大於 0'),
  notes: z.string().optional().default(''),
  attendingCustomerIds: z.array(z.string()).optional(),
})

export type LessonRecordFormValues = z.infer<typeof lessonRecordFormSchema>

// ─── Venue Rental Schemas ────────────────────────────────────

export const venueRentalFormSchema = z.object({
  renterName: z.string().min(1, '請輸入承租人名稱'),
  date: z.date({
    required_error: '請選擇場租日期',
  }),
  amount: z.coerce.number().min(0, '金額不能為負數'),
  notes: z.string().optional().default(''),
})

export type VenueRentalFormValues = z.infer<typeof venueRentalFormSchema>

// ─── Trial Record Schemas ────────────────────────────────────

export const trialRecordFormSchema = z.object({
  clientName: z.string().min(1, '請輸入體驗客姓名'),
  phone: z.string().min(1, '請輸入聯絡電話'),
  email: z.string().email('請輸入有效的電子郵件').or(z.literal('')),
  date: z.date({
    required_error: '請選擇體驗日期',
  }),
  outcome: z.enum(['pending', 'converted', 'not_converted']).default('pending'),
  notes: z.string().optional().default(''),
})

export type TrialRecordFormValues = z.infer<typeof trialRecordFormSchema>
