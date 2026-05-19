# R27+ Fitness Platform — Redevelopment Plan (Part 2/3)

> **Frontend, Backend, Auth, Security & Deployment**

---

## 5. Frontend Structure & Components

### Project Structure

```
src/
├── app/
│   ├── layout.tsx                    # Root layout with nav
│   ├── routes.tsx                    # Route definitions
│   └── providers.tsx                 # Auth + Store providers
│
├── components/
│   ├── ui/                           # shadcn/ui components (auto-generated)
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── dialog.tsx
│   │   ├── input.tsx
│   │   ├── select.tsx
│   │   ├── table.tsx
│   │   ├── tabs.tsx
│   │   ├── badge.tsx
│   │   ├── calendar.tsx
│   │   ├── dropdown-menu.tsx
│   │   ├── form.tsx
│   │   ├── skeleton.tsx
│   │   ├── toast.tsx
│   │   └── ...
│   ├── layout/
│   │   ├── Navbar.tsx                # Top navigation bar
│   │   ├── Sidebar.tsx               # Mobile sidebar drawer
│   │   └── PageHeader.tsx            # Page title + description + action btn
│   ├── customers/
│   │   ├── CustomerDashboard.tsx     # Summary cards + customer list
│   │   ├── CustomerFormModal.tsx     # 5-tab add/edit modal
│   │   ├── BasicInfoTab.tsx
│   │   ├── ContractTab.tsx
│   │   ├── ChronicIllnessTab.tsx
│   │   ├── InjuryHistoryTab.tsx
│   │   ├── SignContractTab.tsx
│   │   ├── CustomerCard.tsx          # Individual customer display
│   │   ├── SharedContractPicker.tsx  # Linked customer selector
│   │   └── LTVChart.tsx             # Purchase session statistics
│   ├── lessons/
│   │   ├── LessonRecordWizard.tsx   # 3-step add flow
│   │   ├── LessonStats.tsx          # Monthly statistics
│   │   └── LessonTable.tsx          # Records list
│   ├── cashflow/
│   │   ├── CashFlowDashboard.tsx    # Summary + records list
│   │   ├── CashFlowFormModal.tsx    # Add/edit record modal
│   │   ├── CsvImportModal.tsx       # CSV upload + parse
│   │   └── CashFlowTable.tsx        # Records table
│   ├── profitloss/
│   │   └── ProfitLossTable.tsx      # 12-month grid (read-only)
│   ├── trials/
│   │   ├── TrialDashboard.tsx       # KPI cards + records
│   │   └── TrialFormModal.tsx       # Add trial record
│   ├── venue/
│   │   ├── VenueDashboard.tsx       # Summary + records
│   │   └── VenueFormModal.tsx       # Add rental record
│   ├── settings/
│   │   ├── ProfilePage.tsx          # User info page
│   │   ├── PasswordChangeForm.tsx
│   │   └── UserManagement.tsx       # Admin: manage trainers (v2)
│   ├── backup/
│   │   └── BackupManager.tsx        # Export/import controls
│   └── shared/
│       ├── EmptyState.tsx           # "No data" placeholder
│       ├── StatCard.tsx             # Dashboard metric card
│       ├── MonthYearFilter.tsx      # Year + month dropdown filter
│       ├── ConfirmDialog.tsx        # Delete confirmation
│       ├── LoadingSkeleton.tsx
│       └── ProtectedRoute.tsx       # Auth + role guard
│
├── hooks/
│   ├── useAuth.ts                   # Auth state + role checks
│   ├── useCustomers.ts              # Firestore CRUD for customers
│   ├── useContracts.ts
│   ├── useLessonRecords.ts
│   ├── useCashFlow.ts
│   ├── useTrials.ts
│   ├── useVenueRentals.ts
│   └── useFirestoreQuery.ts         # Generic query helper
│
├── stores/
│   ├── authStore.ts                 # Zustand auth state
│   ├── uiStore.ts                   # Sidebar, modals, filters
│   └── filterStore.ts              # Active month/year filters
│
├── lib/
│   ├── firebase.ts                  # Firebase app initialization
│   ├── firestore.ts                 # Firestore helpers
│   ├── auth.ts                      # Auth helpers
│   ├── validators.ts                # Zod schemas
│   ├── constants.ts                 # Categories, role enums
│   ├── utils.ts                     # Formatting, date helpers
│   └── csv.ts                       # CSV parse/export utilities
│
├── types/
│   └── index.ts                     # TypeScript interfaces
│
└── styles/
    └── globals.css                   # Tailwind + custom theme tokens
```

### Key Component Patterns

**Dashboard Cards** → Reusable `<StatCard>` with icon, title, value, subtitle, optional CTA

**Form Modals** → All use React Hook Form + Zod + shadcn Dialog + Tabs

**Data Tables** → shadcn Table + local sorting/filtering (no need for TanStack Table at <15 users)

**Filters** → Shared `<MonthYearFilter>` component, state in Zustand `filterStore`

---

## 6. Backend / API Architecture

### Strategy: Firestore-First, Cloud Functions for Side Effects

For <15 users, **direct Firestore reads/writes from the client** cover 90% of operations. Cloud Functions handle:

| Function | Trigger | Purpose |
|---|---|---|
| `onUserCreate` | Auth trigger | Set default custom claims (`role: "trainer"`) |
| `setUserRole` | Callable | Admin sets trainer role/permissions |
| `processLessonRecord` | Firestore trigger | Auto-decrement contract remaining sessions |
| `syncVenueRentalToCashFlow` | Firestore trigger | Auto-create/delete cash flow record |
| `deleteVenueRentalCascade` | Firestore trigger | Remove linked cash flow on venue rental delete |
| `computeProfitLoss` | Callable | Aggregate cash flow → P&L (or do client-side) |
| `importCsvCashFlow` | Callable | Parse + validate + batch-write CSV data |
| `exportBackup` | Callable | Generate JSON backup of all trainer data |
| `importBackup` | Callable | Restore from JSON backup |
| `scheduleContractExpiry` | Scheduled (daily) | Update contract statuses, flag expiring contracts |

### Cloud Functions Structure

```
functions/
├── src/
│   ├── index.ts                    # Function exports
│   ├── auth/
│   │   ├── onUserCreate.ts
│   │   └── setUserRole.ts
│   ├── lessons/
│   │   └── processLessonRecord.ts
│   ├── venue/
│   │   └── syncVenueRental.ts
│   ├── cashflow/
│   │   └── importCsv.ts
│   ├── backup/
│   │   ├── exportBackup.ts
│   │   └── importBackup.ts
│   ├── scheduled/
│   │   └── contractExpiry.ts
│   └── utils/
│       └── adminCheck.ts           # Verify admin role in callable
├── package.json
└── tsconfig.json
```

---

## 7. Authentication & Permissions Design

### User Roles

| Role | Scope | Capabilities |
|---|---|---|
| **Admin** | System-wide | All CRUD, manage all trainers' data, user management, system settings |
| **Trainer** | Own data only | CRUD on own customers, contracts, lessons, cash flow, trials, venue rentals |

### Firebase Auth Flow

```
1. Admin creates trainer account (email + temp password)
2. Trainer logs in → Firebase Auth issues ID token
3. Cloud Function sets custom claims: { role: "admin" | "trainer" }
4. Client reads claims → controls UI visibility
5. Firestore Security Rules enforce data isolation
```

### Firebase Security Rules

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Helper functions
    function isAuthenticated() {
      return request.auth != null;
    }

    function isAdmin() {
      return isAuthenticated() &&
             request.auth.token.role == 'admin';
    }

    function isTrainer() {
      return isAuthenticated() &&
             request.auth.token.role == 'trainer';
    }

    function isOwner(trainerId) {
      return isAuthenticated() &&
             request.auth.uid == trainerId;
    }

    function isOwnerOrAdmin(trainerId) {
      return isAdmin() || isOwner(trainerId);
    }

    // Users collection
    match /users/{userId} {
      allow read: if isAuthenticated() && (isAdmin() || request.auth.uid == userId);
      allow create: if isAdmin();
      allow update: if isAdmin() || request.auth.uid == userId;
      allow delete: if isAdmin();
    }

    // Customers — trainer sees own, admin sees all
    match /customers/{customerId} {
      allow read: if isOwnerOrAdmin(resource.data.trainerId);
      allow create: if isAuthenticated() &&
                       request.resource.data.trainerId == request.auth.uid;
      allow update: if isOwnerOrAdmin(resource.data.trainerId);
      allow delete: if isOwnerOrAdmin(resource.data.trainerId);
      allow list: if isAdmin() ||
                     (isTrainer() &&
                      request.auth.uid == resource.data.trainerId);
    }

    // Contracts — same pattern
    match /contracts/{contractId} {
      allow read: if isOwnerOrAdmin(resource.data.trainerId);
      allow create: if isAuthenticated() &&
                       request.resource.data.trainerId == request.auth.uid;
      allow update, delete: if isOwnerOrAdmin(resource.data.trainerId);
    }

    // Lesson Records
    match /lessonRecords/{recordId} {
      allow read: if isOwnerOrAdmin(resource.data.trainerId);
      allow create: if isAuthenticated() &&
                       request.resource.data.trainerId == request.auth.uid;
      allow update, delete: if isOwnerOrAdmin(resource.data.trainerId);
    }

    // Cash Flow Records
    match /cashFlowRecords/{recordId} {
      allow read: if isOwnerOrAdmin(resource.data.trainerId);
      allow create: if isAuthenticated() &&
                       request.resource.data.trainerId == request.auth.uid;
      allow update, delete: if isOwnerOrAdmin(resource.data.trainerId);
    }

    // Trial Records
    match /trialRecords/{recordId} {
      allow read: if isOwnerOrAdmin(resource.data.trainerId);
      allow create: if isAuthenticated() &&
                       request.resource.data.trainerId == request.auth.uid;
      allow update, delete: if isOwnerOrAdmin(resource.data.trainerId);
    }

    // Venue Rentals
    match /venueRentals/{rentalId} {
      allow read: if isOwnerOrAdmin(resource.data.trainerId);
      allow create: if isAuthenticated() &&
                       request.resource.data.trainerId == request.auth.uid;
      allow update, delete: if isOwnerOrAdmin(resource.data.trainerId);
    }

    // System Config — admin only write, authenticated read
    match /systemConfig/{docId} {
      allow read: if isAuthenticated();
      allow write: if isAdmin();
    }
  }
}
```

### Key Security Rule Patterns

1. **Every document has a `trainerId` field** → enables ownership checks
2. **Admin bypasses ownership** → can access all documents
3. **Trainer can only create documents with own `uid` as `trainerId`**
4. **List queries** require matching `trainerId` filter (enforced by Firestore)

---

## 8. Recommended Firebase Services

| Service | Usage | Free Tier | Est. Monthly Cost |
|---|---|---|---|
| **Firebase Auth** | User login, custom claims | 10K MAU | $0 |
| **Cloud Firestore** | Primary database | 1GB storage, 50K reads/day | $0 |
| **Cloud Functions v2** | Side effects, admin ops | 2M invocations/month | $0 |
| **Firebase Hosting** | SPA hosting, CDN | 10GB/month | $0 |
| **Firebase Storage** | Backup files | 5GB | $0 |
| **Firebase App Check** | API abuse protection | Free | $0 |

> **Estimated cost for <15 users: $0/month** (well within free tier)

---

## 9. AI-Assisted Development Workflow

### Recommended AI Coding Tools

| Tool | Purpose | Usage |
|---|---|---|
| **Gemini Code Assist** | Pair programming, code generation | Primary coding agent |
| **Claude/GPT** | Architecture review, complex logic | Second opinion |
| **v0.dev** | UI component prototyping | Rapid shadcn/ui component generation |
| **Cursor** | IDE-integrated AI | Real-time code completion |

### What to AI-Generate vs. Manually Engineer

| AI-Generate (80%) | Manually Engineer (20%) |
|---|---|
| shadcn/ui component installation | Firestore security rules |
| CRUD hooks for each collection | Complex business logic (P&L computation) |
| Zod validation schemas | Cross-module side effects (venue → cash flow) |
| Form components with RHF | Auth flow with custom claims |
| Dashboard layouts and stat cards | CSV parsing edge cases |
| TypeScript type definitions | Data migration scripts |
| Firestore query helpers | Backup/restore integrity checks |
| Basic Cloud Functions scaffolding | Role-based UI conditional rendering logic |
| CSS/Tailwind styling | Testing strategy and test cases |
| Router setup and guards | Firebase project configuration |

### AI Workflow per Feature

```
1. Define types/interfaces (AI-generate from schema)
2. Generate Zod validation schema (AI)
3. Generate Firestore CRUD hook (AI)
4. Generate form component with shadcn + RHF (AI or v0.dev)
5. Generate dashboard/list view (AI)
6. Wire up manually: auth guards, side effects, edge cases
7. Test manually + write key test cases
```

---

## 10. Security Considerations

### Authentication Security

- [x] Firebase Auth handles password hashing, rate limiting, brute-force protection
- [x] Custom claims for RBAC (cannot be modified client-side)
- [x] ID tokens expire after 1 hour, auto-refreshed
- [ ] **Implement:** Force password change on first login
- [ ] **Implement:** Session timeout after 30 min inactivity

### Data Security

- [x] Firestore Security Rules enforce row-level security
- [x] `trainerId` on every document prevents cross-trainer access
- [x] Admin-only write on system config
- [ ] **Implement:** Firebase App Check to prevent API abuse
- [ ] **Implement:** Input sanitization on all text fields

### Client-Side Security

- [ ] **Implement:** Environment variables for Firebase config (not secrets)
- [ ] **Implement:** CSP headers via Firebase Hosting config
- [ ] **Implement:** Hide admin-only UI elements for trainer role
- [ ] **Implement:** Disable DevTools in production (optional)

### Sensitive Data

| Data | Protection |
|---|---|
| Customer ID numbers | Store in Firestore (encrypted at rest by default) |
| Medical history | Same Firestore encryption, RBAC access |
| Contract signatures | Firebase Storage with security rules |
| Passwords | Firebase Auth handles all hashing |

### What NOT to Do

- ❌ Don't store Firebase Admin SDK credentials in the frontend
- ❌ Don't rely solely on client-side role checks
- ❌ Don't expose other trainers' customer lists in API responses
- ❌ Don't allow unauthenticated Firestore access

---

## 11. Deployment Strategy

### Environment Setup

| Environment | Firebase Project | Branch | Purpose |
|---|---|---|---|
| **Development** | `r27-fitness-dev` | `develop` | Local dev + preview channels |
| **Production** | `r27-fitness-prod` | `main` | Live app |

> Skip staging for <15 users. Use Firebase preview channels for PR review.

### CI/CD Pipeline (GitHub Actions)

```yaml
# .github/workflows/deploy.yml
name: Deploy to Firebase
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - run: npm ci
      - run: npm run lint
      - run: npm run build
      - run: npm run test -- --passWithNoTests

      # Deploy functions
      - name: Deploy Functions
        if: github.ref == 'refs/heads/main'
        run: npx firebase-tools deploy --only functions
        env:
          FIREBASE_TOKEN: ${{ secrets.FIREBASE_TOKEN }}

      # Deploy hosting
      - name: Deploy Hosting
        if: github.ref == 'refs/heads/main'
        run: npx firebase-tools deploy --only hosting
        env:
          FIREBASE_TOKEN: ${{ secrets.FIREBASE_TOKEN }}

      # Preview channel for PRs
      - name: Deploy Preview
        if: github.event_name == 'pull_request'
        run: npx firebase-tools hosting:channel:deploy pr-${{ github.event.number }}
        env:
          FIREBASE_TOKEN: ${{ secrets.FIREBASE_TOKEN }}
```

### Firebase Hosting Configuration

```json
// firebase.json
{
  "hosting": {
    "public": "dist",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "rewrites": [{ "source": "**", "destination": "/index.html" }],
    "headers": [{
      "source": "**",
      "headers": [{
        "key": "X-Content-Type-Options",
        "value": "nosniff"
      }, {
        "key": "X-Frame-Options",
        "value": "DENY"
      }]
    }]
  },
  "firestore": {
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  },
  "functions": {
    "source": "functions",
    "runtime": "nodejs20"
  }
}
```
