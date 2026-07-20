import type { Timestamp } from 'firebase/firestore'

// ─── User / Auth ──────────────────────────────────────────────
export type UserRole = 'admin' | 'trainer'

export interface AppUser {
  uid: string
  email: string
  displayName: string
  role: UserRole
  centerId?: string
  isSharedTrainerAccount?: boolean
  createdAt: Timestamp
  updatedAt: Timestamp
}

// ─── Trainer ──────────────────────────────────────────────────
export interface Trainer {
  id: string
  centerId?: string
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
  centerId?: string
  trainerId: string
  name: string
  idNumber: string
  phone: string
  email: string
  dateOfBirth: Timestamp
  ageGroup?: string
  gender?: 'male' | 'female' | 'other'
  exerciseHabit?: 'none' | 'weekly_1_2' | 'weekly_3_plus'
  source?: string
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
  centerId?: string
  contractNo?: string
  trainerId: string
  secondaryTrainerId?: string
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
  centerId?: string
  trainerId: string
  contractTrainerId?: string
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
  centerId?: string
  trainerId: string
  date: Timestamp
  type?: 'income' | 'expense'
  category?: string
  amount?: number
  account?: string
  debitCategory?: string
  debitAmount?: number
  creditCategory?: string
  creditAmount?: number
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
  centerId?: string
  trainerId: string // Record owner
  trialTrainerId?: string // The trainer who provided the trial class (making optional for backward compatibility)
  clientName: string
  phone: string
  email: string
  date: Timestamp
  outcome: TrialOutcome
  notes: string
  createdAt: Timestamp
  updatedAt: Timestamp
}

export interface VenueRental {
  id: string
  centerId?: string
  trainerId: string // Record owner
  renterTrainerId?: string // Chosen renter trainer
  renterCustomerId?: string // Chosen renter customer (from custom sub-list)
  renterName: string // Display name or custom name
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

// ─── Notifications ─────────────────────────────────────────────
export type NotificationType = 'installment_due' | 'installment_overdue' | 'contract_expiring' | 'general'

export interface AppNotification {
  id: string
  centerId?: string
  userId: string
  type: NotificationType
  title: string
  message: string
  isRead: boolean
  contractId?: string
  customerId?: string
  customerName?: string
  dueDate?: Timestamp
  createdAt: Timestamp
}

// ─── Venue Booking ─────────────────────────────────────────────
export type BookingStatus = 'pending' | 'approved' | 'rejected'

export interface VenueBooking {
  id: string
  centerId?: string
  trainerId: string
  trainerName: string
  date: Timestamp
  startTime: string
  endTime: string
  purpose: string
  renterCustomerId?: string
  renterName?: string
  status: BookingStatus
  adminNotes?: string
  venueRentalId?: string
  createdAt: Timestamp
  updatedAt: Timestamp
}

// ─── Activity Log ──────────────────────────────────────────────
export type ActivityAction = 'create' | 'update' | 'delete'
export type ActivityModule = 'lessonRecords' | 'trialRecords' | 'venueBookings' | 'customers'

export interface ActivityLog {
  id: string
  centerId?: string
  timestamp: Timestamp
  trainerAuthUid: string
  trainerName: string
  trainerId: string
  action: ActivityAction
  module: ActivityModule
  recordId: string
  recordSummary: string
  previousValue?: Record<string, any>
  newValue?: Record<string, any>
}

// ─── Operating Hours ───────────────────────────────────────────
export interface OperatingHours {
  startTime: string
  endTime: string
}
