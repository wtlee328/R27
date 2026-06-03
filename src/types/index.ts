import type { Timestamp } from 'firebase/firestore'

// ─── User / Auth ──────────────────────────────────────────────
export type UserRole = 'admin' | 'trainer'

export interface AppUser {
  uid: string
  email: string
  displayName: string
  role: UserRole
  createdAt: Timestamp
  updatedAt: Timestamp
}

// ─── Trainer ──────────────────────────────────────────────────
export interface Trainer {
  id: string
  name: string
  email: string
  phone: string
  createdAt: Timestamp
  updatedAt: Timestamp
}

// ─── Customer ─────────────────────────────────────────────────
export interface EmergencyContact {
  name: string
  relation: string
  phone: string
}

export interface MedicalHistory {
  chronicConditions: string[]
  injuries: string[]
  notes: string
}

export interface Customer {
  id: string
  trainerId: string
  name: string
  idNumber: string
  phone: string
  email: string
  dateOfBirth: Timestamp
  historicalSessions: number
  emergencyContact: EmergencyContact
  sharedContractCustomerId: string | null
  medicalHistory: MedicalHistory
  createdAt: Timestamp
  updatedAt: Timestamp
}

// ─── Contract ─────────────────────────────────────────────────
export type ContractStatus = 'active' | 'expiring' | 'expired' | 'completed'
export type InstallmentStatus = 'pending' | 'paid' | 'overdue'

export interface Installment {
  id: string
  amount: number
  dueDate: Timestamp
  paidDate: Timestamp | null
  status: InstallmentStatus
}

export interface Contract {
  id: string
  trainerId: string
  customerId: string
  sharedWithCustomerId: string | null
  customerIds: string[]
  contractType: 'single' | 'dual'
  primaryCustomerId: string
  totalSessions: number
  remainingSessions: number
  pricePerSession: number
  totalAmount: number
  paidAmount: number
  installments: Installment[]
  startDate: Timestamp
  endDate: Timestamp
  status: ContractStatus
  signatureDataUrl: string | null
  secondarySignatureDataUrl: string | null
  isAgreed: boolean
  paymentType?: 'single' | 'installments'
  installmentCount?: number
  createdAt: Timestamp
  updatedAt: Timestamp
}

// ─── Lesson Record ────────────────────────────────────────────
export interface LessonRecord {
  id: string
  trainerId: string
  customerId: string
  customerName: string  // Denormalized for display
  contractId: string
  sessionDate: Timestamp
  sessionAmount: number
  notes: string
  attendingCustomerIds?: string[]
  attendingCustomerNames?: string[]
  createdAt: Timestamp
  updatedAt: Timestamp
}

// ─── Cash Flow ────────────────────────────────────────────────
export type CashFlowSource = 'manual' | 'venue_rental' | 'csv_import' | 'lesson'

export interface CashFlowRecord {
  id: string
  trainerId: string
  date: Timestamp
  debitCategory: string
  debitAmount: number
  creditCategory: string
  creditAmount: number
  description: string
  notes: string
  source: CashFlowSource
  sourceId: string | null
  createdAt: Timestamp
  updatedAt: Timestamp
}

// ─── Trial Record ─────────────────────────────────────────────
export type TrialOutcome = 'pending' | 'converted' | 'not_converted'

export interface TrialRecord {
  id: string
  trainerId: string
  clientName: string
  phone: string
  email: string
  date: Timestamp
  outcome: TrialOutcome
  notes: string
  createdAt: Timestamp
  updatedAt: Timestamp
}

// ─── Venue Rental ─────────────────────────────────────────────
export interface VenueRental {
  id: string
  trainerId: string
  renterName: string
  date: Timestamp
  amount: number
  cashFlowRecordId: string
  notes: string
  createdAt: Timestamp
  updatedAt: Timestamp
}

// ─── P&L ──────────────────────────────────────────────────────
export interface ProfitLossRow {
  category: string
  months: (number | null)[]
  total: number | null
}

export interface ProfitLossData {
  year: number
  income: ProfitLossRow[]
  totalIncome: (number | null)[]
  expenses: ProfitLossRow[]
  totalExpenses: (number | null)[]
  netIncome: (number | null)[]
}

// ─── UI Helpers ───────────────────────────────────────────────
export interface SelectOption {
  value: string
  label: string
}

export interface MonthFilter {
  year: number
  month: number | null // null = all months
}
