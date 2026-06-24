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

export const baseContractFormSchema = z.object({
  customerId: z.string().min(1, '請選擇客戶'),
  sharedWithCustomerId: z.string().nullable().default(null),
  customerIds: z.array(z.string()).default([]),
  contractType: z.enum(['single', 'dual']).default('single'),
  primaryCustomerId: z.string().default(''),
  trainerId: z.string().min(1, '請選擇教練'),
  secondaryTrainerId: z.string().nullable().optional().default(null),
  totalSessions: z.coerce.number().min(1, '堂數必須大於 0'),
  remainingSessions: z.coerce.number().min(0, '剩餘堂數不能為負數'),
  pricePerSession: z.coerce.number().min(0, '單堂價格不能為負數'),
  totalAmount: z.coerce.number().min(1, '總金額必須大於 0'),
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
  partnerMode: z.enum(['none', 'existing', 'new']).optional().default('none'),
  partnerId: z.string().nullable().optional().default(null),
  partnerCustomerData: customerFormSchema.nullable().optional().default(null),
  paymentType: z.enum(['single', 'installments']).default('single'),
  installmentCount: z.coerce.number().min(2).max(6).default(2),
})

export const contractFormSchema = baseContractFormSchema.superRefine((data, ctx) => {
  if (data.remainingSessions > data.totalSessions) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['remainingSessions'],
      message: '剩餘堂數不能超過總堂數',
    });
  }

  if (data.startDate && data.endDate && new Date(data.startDate) > new Date(data.endDate)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['endDate'],
      message: '結束日期不能早於開始日期',
    });
  }

  if (data.paymentType === 'installments') {
    if (!data.installments || data.installments.length !== data.installmentCount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['installments'],
        message: `分期期數必須為 ${data.installmentCount} 期`,
      });
    }
    const sum = (data.installments || []).reduce((acc, curr) => acc + curr.amount, 0);
    if (Math.abs(sum - data.totalAmount) > 0.01) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['installments'],
        message: `分期金額總和 (${sum}元) 必須等於合約總金額 (${data.totalAmount}元)`,
      });
    }
    const insts = data.installments || [];
    for (let i = 0; i < insts.length - 1; i++) {
      const currentVal = insts[i];
      const nextVal = insts[i + 1];
      if (currentVal && nextVal && currentVal.dueDate && nextVal.dueDate && new Date(currentVal.dueDate) > new Date(nextVal.dueDate)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['installments', i + 1, 'dueDate'],
          message: `第 ${i + 2} 期的應付日期不能早於第 ${i + 1} 期`,
        });
      }
    }
  }
})

export type ContractFormValues = z.infer<typeof contractFormSchema>

export const combinedCustomerContractSchema = customerFormSchema.extend({
  contract: baseContractFormSchema.omit({ customerId: true }).extend({
    trainerId: z.string().optional().or(z.literal('')),
    totalSessions: z.coerce.number().optional(),
    totalAmount: z.coerce.number().optional(),
    startDate: z.date().optional(),
    endDate: z.date().optional(),
  }).optional(),
  partnerMode: z.enum(['none', 'existing', 'new']).optional().default('none'),
  partnerId: z.string().nullable().optional().default(null),
  partnerCustomerData: customerFormSchema.nullable().optional().default(null),
  bindExistingContractMode: z.boolean().optional().default(false),
  existingContractId: z.string().nullable().optional().default(null),
}).superRefine((data, ctx) => {
  if (data.bindExistingContractMode) {
    if (!data.existingContractId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['existingContractId'],
        message: '請選擇要連結的現有合約',
      });
    }
    return;
  }

  if (data.contract) {
    const dataCon = data.contract;
    if (!dataCon.trainerId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['contract', 'trainerId'],
        message: '請選擇教練',
      });
    }
    if (dataCon.totalSessions === undefined || dataCon.totalSessions === null || Number(dataCon.totalSessions) < 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['contract', 'totalSessions'],
        message: '堂數必須大於 0',
      });
    }
    if (dataCon.totalAmount === undefined || dataCon.totalAmount === null || Number(dataCon.totalAmount) < 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['contract', 'totalAmount'],
        message: '總金額必須大於 0',
      });
    }
    if (!dataCon.startDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['contract', 'startDate'],
        message: '請選擇合約開始日期',
      });
    }
    if (!dataCon.endDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['contract', 'endDate'],
        message: '請選擇合約結束日期',
      });
    }
    if (dataCon.startDate && dataCon.endDate && new Date(dataCon.startDate) > new Date(dataCon.endDate)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['contract', 'endDate'],
        message: '結束日期不能早於開始日期',
      });
    }

    if (dataCon.paymentType === 'installments') {
      if (!dataCon.installments || dataCon.installments.length !== dataCon.installmentCount) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['contract', 'installments'],
          message: `分期期數必須為 ${dataCon.installmentCount} 期`,
        });
      }
      const sum = (dataCon.installments || []).reduce((acc, curr) => acc + curr.amount, 0);
      if (Math.abs(sum - (Number(dataCon.totalAmount) || 0)) > 0.01) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['contract', 'installments'],
          message: `分期金額總和 (${sum}元) 必須等於合約總金額 (${dataCon.totalAmount}元)`,
        });
      }
      const insts = dataCon.installments || [];
      for (let i = 0; i < insts.length - 1; i++) {
        const currentVal = insts[i];
        const nextVal = insts[i + 1];
        if (currentVal && nextVal && currentVal.dueDate && nextVal.dueDate && new Date(currentVal.dueDate) > new Date(nextVal.dueDate)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['contract', 'installments', i + 1, 'dueDate'],
            message: `第 ${i + 2} 期的應付日期不能早於第 ${i + 1} 期`,
          });
        }
      }
    }
  }
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
  trainerId: z.string().optional(),
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
  trialTrainerId: z.string().min(1, '請選擇體驗課教練'),
  outcome: z.enum(['pending', 'converted', 'not_converted']).default('pending'),
  notes: z.string().optional().default(''),
})

export type TrialRecordFormValues = z.infer<typeof trialRecordFormSchema>

// ─── Trainer Onboarding Schemas ────────────────────────────────
export const trainerFormSchema = z.object({
  name: z.string().min(1, '請輸入教練姓名'),
  email: z.string().email('請輸入有效的電子郵件'),
  phone: z.string().min(1, '請輸入聯絡電話'),
})

export type TrainerFormValues = z.infer<typeof trainerFormSchema>

