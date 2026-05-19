# R27+ Fitness Platform — Redevelopment Plan (Part 1/3)

> **Site Audit & System Architecture**

---

## 1. Demo Site Analysis

### 1.1 Application Overview

| Property | Value |
|---|---|
| **Name** | R27+ FITNESS 健身房管理系統 |
| **Language** | Traditional Chinese (zh-TW) |
| **Current Stack** | React 19.1.1, Vite (SPA), client-side localStorage |
| **Auth Model** | Simple admin password (bcrypt, `admin1234` default) |
| **Hosting** | Manus.space (static deploy) |
| **Data Persistence** | `localStorage` only — no backend/database |

### 1.2 Navigation & Pages (8 Modules)

| # | Route | Chinese Name | English Name | Purpose |
|---|---|---|---|---|
| 1 | `/` | 客戶檔案 | Customer Profiles | Dashboard + client CRUD |
| 2 | `/coach-lesson-records` | 教練銷課 | Coach Lesson Records | Track trainer lesson completions |
| 3 | `/cash-flow` | 現金流量表 | Cash Flow Statement | Double-entry income/expense ledger |
| 4 | `/profit-loss` | 損益表 | Profit & Loss Statement | Monthly P&L report (auto-calculated) |
| 5 | `/backup` | 數據備份 | Data Backup | Google Drive JSON export/import |
| 6 | `/trial-clients` | 體驗客 | Trial Clients | Track trial session leads & conversion |
| 7 | `/venue-rental` | 場租管理 | Venue Rental | Studio sub-lease income tracking |
| 8 | `/system-settings` | 系統設定 | System Settings | Admin password management |

### 1.3 Detailed Page Analysis

#### Page 1: Customer Profiles (Homepage `/`)

**Dashboard Cards:**
- Total Customers (總客戶數量)
- Pending Contracts (待收合約) — installment payment tracking, pending amount in NT$
- Expiring Contracts (即將到期合約) — within 30 days
- Monthly Birthdays (本月壽星) — current month

**Key Feature:** "+ 新增客戶" (Add New Customer) button opens a **5-tab modal**:

| Tab | Chinese | Fields |
|---|---|---|
| 基本資料 | Basic Info | Name*, ID Number*, Phone*, Email*, DOB*, Historical Lesson Count, Emergency Contact (Name*, Relation*, Phone*), Linked Shared Contract Customer |
| 合約內容 | Contract | Contract terms, pricing, installment details |
| 慢性病史 | Chronic Illness | Medical history checklist |
| 傷病史 | Injury History | Past injuries and conditions |
| 簽署合約 | Sign Contract | Digital signature capture |

**Special Feature:** Shared contract linking — supports couples/pairs sharing a contract. Two options: "Select from existing customers" or "Create new customer simultaneously."

**Bottom Section:** Purchase Session Statistics (購買堂數統計) — Lifetime Total Sessions (LTV) chart.

#### Page 2: Coach Lesson Records (`/coach-lesson-records`)

- **Summary cards:** Total Sessions (總堂數), Total Revenue (總銷課金額)
- **Add Record Flow (3-step wizard):**
  1. Select Coach (選教練) — dropdown
  2. Select Student + Contract (選學生+合約) — link to customer contracts
  3. Confirm Lesson (確認銷課) — record the session
- **Statistics section:** Monthly filter (date picker), lesson records table
- **Cancel button** at each step

#### Page 3: Cash Flow Statement (`/cash-flow`)

- **Month filter** dropdown + "Import CSV" button + "+ New Record" button
- **Summary cards:** Total Debit (總借方金額), Total Credit (總貸方金額)
- **Record list** with count
- **Add Record Modal fields:**
  - Date* (date picker, defaults to today)
  - Debit Category* (借方科目) — dropdown
  - Debit Amount* ($)
  - Credit Category* (貸方科目) — dropdown
  - Credit Amount* ($)
  - Description (說明) — e.g., "課程收入、租金支付"
  - Notes (備註) — "額外說明或發票資訊"
- **CSV Import** for historical data migration

#### Page 4: Profit & Loss Statement (`/profit-loss`)

**Auto-generated from Cash Flow data.** Year selector + 12-month column table.

**Income Categories (一、收入):**
- 課程收入（實際收入） — Lesson Income (Actual)
- 體驗收入 — Trial Income
- 場租 — Venue Rental
- 拳擊團課/贈與課程 — Boxing Group/Gift Lessons
- **實際總收入** — Total Actual Income (green highlight)

**Expense Categories (二、費用):**
攤提, 房租, 雜項, 水電, 行銷, 會計, 網路, 器材, 新光AED, 公司福利, 保險, 薪資, 營業稅
- **費用小計** — Expense Subtotal (red highlight)

**Bottom Line:** 三、收支淨額 — Net Income/Loss (green)

#### Page 5: Data Backup (`/backup`)

- Year/Month filter dropdowns
- Google Drive integration for JSON export
- Import/restore functionality
- Backup history log

#### Page 6: Trial Clients (`/trial-clients`)

- Year/Month filter dropdowns
- "+ 新增體驗記錄" (Add Trial Record) button
- Summary cards (4 empty cards for KPIs — trial count, conversion rate, etc.)
- Trial records table

#### Page 7: Venue Rental (`/venue-rental`)

- Year/Month filter dropdowns
- "+ 新增場租記錄" (Add Venue Rental Record) button
- **Important Notice:** "Every rental record automatically creates a 'Venue Rental Income' entry in the Cash Flow Statement. When deleting a rental record, the corresponding cash flow record is also removed."
- Summary cards (3 cards — likely total income, count, etc.)
- Rental records table

#### Page 8: System Settings (`/system-settings`)

- Change Admin Password form:
  - Old Password (with show/hide toggle)
  - New Password (min 6 chars, with show/hide toggle)
  - Confirm New Password (with show/hide toggle)
- **Security Notice (安全提示):**
  - Admin password authorizes high-risk operations (e.g., deleting customers)
  - Do not share with unauthorized personnel
  - Recommend periodic password changes
  - Passwords stored with bcrypt (irreversible)

### 1.4 Cross-Cutting Observations

| Area | Current State | Issues |
|---|---|---|
| **Auth** | Single admin password, no user accounts | No role-based access, no trainer isolation |
| **Data** | localStorage only | Data loss risk, no multi-device sync, no backup integrity |
| **State** | React useState/context | Adequate for current scale |
| **Responsive** | Basic responsive layout | Functional but minimal mobile optimization |
| **Design** | Clean, warm orange/coral theme | Good foundation, some empty states need polish |
| **Validation** | Client-side only | No server-side validation |
| **i18n** | Hardcoded Traditional Chinese | No i18n framework |
| **Cross-module** | Venue Rental → Cash Flow auto-sync | Good pattern, needs to be preserved |

---

## 2. Full Feature Breakdown

### Core Modules (MVP — Phase 1)

| Module | CRUD | Key Features |
|---|---|---|
| **Auth** | — | Firebase Auth, email/password login, role-based access |
| **Customer Profiles** | CRUD | 5-tab form, shared contracts, LTV tracking, birthday alerts |
| **Coach Lesson Records** | CRD | 3-step wizard, monthly stats, auto-decrement contract sessions |
| **Cash Flow** | CRUD | Double-entry ledger, CSV import, month filter |
| **Profit & Loss** | R | Auto-computed from cash flow, yearly 12-month grid |

### Secondary Modules (Phase 2)

| Module | CRUD | Key Features |
|---|---|---|
| **Trial Clients** | CRUD | Lead tracking, conversion KPIs, year/month filter |
| **Venue Rental** | CRUD | Auto-sync to cash flow, summary stats |
| **Data Backup** | — | Firestore export/import (replaces Google Drive) |
| **System Settings** | U | Password change, user management (admin only) |

---

## 3. Recommended System Architecture

```
┌─────────────────────────────────────────────────┐
│                   Frontend                       │
│  React + Tailwind CSS + shadcn/ui               │
│  Firebase Hosting (CDN)                          │
│  Vite Build                                      │
├─────────────────────────────────────────────────┤
│              Firebase Services                   │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────┐ │
│  │  Auth    │ │ Firestore│ │ Cloud Functions  │ │
│  │(Email/PW)│ │ (NoSQL)  │ │ (v2, Node 20)   │ │
│  └──────────┘ └──────────┘ └──────────────────┘ │
│  ┌──────────┐ ┌──────────────────────────────┐  │
│  │ Storage  │ │ Firebase Hosting             │  │
│  │(Backups) │ │ (SPA + Cloud Functions)      │  │
│  └──────────┘ └──────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

### Architecture Decisions

| Decision | Choice | Rationale |
|---|---|---|
| **Database** | Firestore | Real-time sync, offline support, scales to zero, generous free tier |
| **Auth** | Firebase Auth | Built-in, no custom backend needed, supports custom claims for roles |
| **Hosting** | Firebase Hosting | CDN, SSL, CI/CD integration, free tier sufficient |
| **Functions** | Cloud Functions v2 | Only for: admin operations, CSV import, scheduled backups, P&L computation |
| **Storage** | Firebase Storage | Backup JSON files, future: contract PDFs |
| **State Mgmt** | Zustand | Lightweight, no boilerplate, perfect for <15 users |
| **Forms** | React Hook Form + Zod | Best DX, schema-based validation, performant |
| **Routing** | React Router v7 | Standard, well-supported |

---

## 4. Database Schema (Firestore)

### Collection Structure

```
firestore-root/
├── users/                          # Auth-linked user profiles
│   └── {userId}/
│       ├── email: string
│       ├── displayName: string
│       ├── role: "admin" | "trainer"
│       ├── createdAt: timestamp
│       └── updatedAt: timestamp
│
├── customers/                      # Client profiles
│   └── {customerId}/
│       ├── trainerId: string       # Owner trainer's userId
│       ├── name: string
│       ├── idNumber: string
│       ├── phone: string
│       ├── email: string
│       ├── dateOfBirth: timestamp
│       ├── historicalSessions: number
│       ├── emergencyContact: {
│       │     name: string,
│       │     relation: string,
│       │     phone: string
│       │   }
│       ├── sharedContractCustomerId: string | null
│       ├── medicalHistory: {
│       │     chronicConditions: string[],
│       │     injuries: string[],
│       │     notes: string
│       │   }
│       ├── createdAt: timestamp
│       └── updatedAt: timestamp
│
├── contracts/                      # Customer contracts
│   └── {contractId}/
│       ├── customerId: string
│       ├── trainerId: string
│       ├── sharedWithCustomerId: string | null
│       ├── totalSessions: number
│       ├── remainingSessions: number
│       ├── pricePerSession: number
│       ├── totalAmount: number
│       ├── paidAmount: number
│       ├── installments: [{
│       │     amount: number,
│       │     dueDate: timestamp,
│       │     paidDate: timestamp | null,
│       │     status: "pending" | "paid" | "overdue"
│       │   }]
│       ├── startDate: timestamp
│       ├── endDate: timestamp
│       ├── status: "active" | "expiring" | "expired" | "completed"
│       ├── signatureDataUrl: string | null
│       ├── createdAt: timestamp
│       └── updatedAt: timestamp
│
├── lessonRecords/                  # Coach session completions
│   └── {recordId}/
│       ├── trainerId: string
│       ├── customerId: string
│       ├── contractId: string
│       ├── sessionDate: timestamp
│       ├── sessionAmount: number
│       ├── notes: string
│       ├── createdAt: timestamp
│       └── updatedAt: timestamp
│
├── cashFlowRecords/                # Double-entry ledger
│   └── {recordId}/
│       ├── trainerId: string       # For trainer-scoped queries
│       ├── date: timestamp
│       ├── debitCategory: string
│       ├── debitAmount: number
│       ├── creditCategory: string
│       ├── creditAmount: number
│       ├── description: string
│       ├── notes: string
│       ├── source: "manual" | "venue_rental" | "csv_import" | "lesson"
│       ├── sourceId: string | null
│       ├── createdAt: timestamp
│       └── updatedAt: timestamp
│
├── trialRecords/                   # Trial/experience sessions
│   └── {recordId}/
│       ├── trainerId: string
│       ├── clientName: string
│       ├── phone: string
│       ├── date: timestamp
│       ├── converted: boolean
│       ├── notes: string
│       ├── createdAt: timestamp
│       └── updatedAt: timestamp
│
├── venueRentals/                   # Studio sub-lease records
│   └── {rentalId}/
│       ├── trainerId: string
│       ├── renterName: string
│       ├── date: timestamp
│       ├── amount: number
│       ├── cashFlowRecordId: string  # Auto-created reference
│       ├── notes: string
│       ├── createdAt: timestamp
│       └── updatedAt: timestamp
│
└── systemConfig/                   # App-level configuration
    └── settings/
        ├── cashFlowCategories: {
        │     debit: string[],
        │     credit: string[]
        │   }
        ├── profitLossMapping: {
        │     incomeCategories: string[],
        │     expenseCategories: string[]
        │   }
        └── updatedAt: timestamp
```

### Firestore Indexes Required

```
# Composite indexes for common queries
customers:    trainerId ASC, name ASC
contracts:    trainerId ASC, status ASC, endDate ASC
lessonRecords: trainerId ASC, sessionDate DESC
cashFlowRecords: trainerId ASC, date DESC
trialRecords: trainerId ASC, date DESC
venueRentals: trainerId ASC, date DESC
```

### Cash Flow Categories (Seed Data)

**Debit (借方):** 現金, 銀行存款, 應收帳款
**Credit (貸方):** 課程收入, 體驗收入, 場租收入, 拳擊團課/贈與課程
**Expense Credit:** 攤提, 房租, 雜項, 水電, 行銷, 會計, 網路, 器材, 新光AED, 公司福利, 保險, 薪資, 營業稅
