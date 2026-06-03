# R27+ Fitness Platform — Redevelopment Plan (Part 3/3)

> **Cost, Scale, Risks, Implementation Plan & Timeline**

---

## 12. Cost Optimization Recommendations

### Firebase Free Tier Coverage

| Resource | Free Tier Limit | Est. Daily Usage (15 users) | Headroom |
|---|---|---|---|
| Firestore Reads | 50,000/day | ~2,000 | 25x |
| Firestore Writes | 20,000/day | ~500 | 40x |
| Firestore Deletes | 20,000/day | ~50 | 400x |
| Firestore Storage | 1 GB | ~50 MB | 20x |
| Cloud Functions | 2M invocations/month | ~3,000 | 666x |
| Hosting Bandwidth | 10 GB/month | ~500 MB | 20x |
| Auth MAU | 10,000 | 15 | 666x |

### Cost Optimization Tactics

1. **Client-side P&L computation** — avoid Cloud Function calls for read-only reports
2. **Firestore query optimization** — always filter by `trainerId` to minimize reads
3. **Pagination** — limit list queries to 50 records per page
4. **Local caching** — Firestore persistence enabled by default (offline support)
5. **Lazy-load routes** — reduce initial bundle size
6. **Image-free design** — no Storage costs for profile images in v1
7. **No scheduled functions** — use client-side contract expiry checks instead of daily cron

> **Projected monthly cost: $0** for the foreseeable future at <15 users.

---

## 13. Scalability Considerations (<15 Users)

### What NOT to Over-Engineer

| Anti-Pattern | Why to Avoid | Do Instead |
|---|---|---|
| Redis caching layer | <15 users, Firestore has built-in caching | Use Firestore persistence |
| Message queues | No async workloads at this scale | Direct Firestore triggers |
| Microservices | Team of 1-2 devs | Monolithic Cloud Functions |
| GraphQL | Simple CRUD, no complex queries | Direct Firestore SDK |
| ElasticSearch | <1000 total records expected | Firestore compound queries |
| CDN for assets | Firebase Hosting includes CDN | Default hosting |
| Load balancer | Single Firebase project | Firebase handles this |

### Future Scaling Path (If Needed)

```
Phase 1 (Current): <15 users → Firebase free tier
Phase 2 (50 users): Add Firestore composite indexes, Cloud Function optimizations
Phase 3 (200+ users): Consider migrating to Supabase/Postgres if complex queries needed
```

### Design for Future Expansion

- **Every document has `trainerId`** → supports multi-tenant queries
- **Zustand stores are modular** → easy to add new modules
- **Component structure mirrors routes** → predictable file organization
- **Zod schemas centralized** → single source of truth for validation
- **Cloud Functions are independent** → deploy/update individually

---

## 14. Technical Risks & Mitigation

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| 1 | **Firestore query limitations** (no JOINs, no aggregation) | Medium | Medium | Denormalize data (e.g., customer name on lesson records), compute P&L client-side |
| 2 | **Custom claims propagation delay** | Low | Medium | Force token refresh after role change, show loading state |
| 3 | **Firebase vendor lock-in** | Low | High | Abstract Firestore behind hooks — swap implementation later if needed |
| 4 | **Offline data conflicts** | Low | Low | <15 concurrent users makes conflicts extremely unlikely. Firestore last-write-wins is acceptable |
| 5 | **CSV import malformed data** | Medium | Medium | Strict Zod validation on import, preview before commit, transaction rollback |
| 6 | **Cascading delete failures** (venue → cash flow) | Medium | Medium | Use Firestore transactions for atomic operations |
| 7 | **Security rule misconfiguration** | Medium | High | Write comprehensive rule tests using Firebase Emulator Suite |
| 8 | **Shared contract complexity** | Medium | Medium | Simplify: store reference only, query both customers when displaying contract |
| 9 | **Browser localStorage migration** | One-time | Medium | Build import tool to convert existing localStorage JSON to Firestore |
| 10 | **Signature canvas mobile issues** | Low | Low | Use tested library (react-signature-canvas), test on actual devices |

---

## 15. Recommended Tech Stack (Complete)

### Core Stack

| Category | Choice | Version | Rationale |
|---|---|---|---|
| **Framework** | React | 19.x | User requirement, ecosystem maturity |
| **Build** | Vite | 6.x | Fast dev server, optimized builds |
| **Styling** | Tailwind CSS | 4.x | User requirement, rapid prototyping |
| **UI Library** | shadcn/ui | latest | User requirement, accessible, customizable |
| **Routing** | React Router | 7.x | Standard SPA routing |
| **State** | Zustand | 5.x | Minimal boilerplate, tiny bundle |
| **Forms** | React Hook Form | 7.x | Performance, DX, validation integration |
| **Validation** | Zod | 3.x | TypeScript-first, composable schemas |
| **Backend** | Firebase | 11.x | User requirement, serverless |
| **Language** | TypeScript | 5.x | Type safety, DX |

### Additional Recommendations

| Category | Choice | Rationale |
|---|---|---|
| **File Storage** | Firebase Storage | Backups, future contract PDFs |
| **Analytics** | Firebase Analytics (free) | Basic usage tracking, zero cost |
| **Testing** | Vitest + Testing Library | Fast, Vite-native, component testing |
| **E2E Testing** | Playwright (v2 only) | Skip in MVP, add for critical flows later |
| **CI/CD** | GitHub Actions | User's existing workflow |
| **Monitoring** | Firebase Crashlytics (web) | Error tracking, free |
| **Logging** | Cloud Functions logger | Built-in, searchable in GCP Console |
| **Date Library** | date-fns | Tree-shakeable, locale support |
| **CSV Parsing** | Papa Parse | Robust, handles edge cases |
| **Signature** | react-signature-canvas | Mature, mobile-friendly |
| **Icons** | Lucide React | shadcn/ui default, comprehensive |
| **Toast/Notifications** | sonner | shadcn/ui recommended, elegant |

---

## 16. What Can Be Skipped in v1

| Feature | Skip? | Rationale | Add In |
|---|---|---|---|
| Email notifications | ✅ Skip | <15 users, use app directly | v2 |
| PWA / offline mode | ✅ Skip | Firestore has built-in offline | v2 |
| Dark mode | ✅ Skip | Not critical for internal tool | v2 |
| Multi-language (i18n) | ✅ Skip | All users speak Chinese | v2+ |
| User profile photos | ✅ Skip | Not in demo, no value add | v3 |
| Advanced reporting/charts | ✅ Skip | P&L table is sufficient | v2 |
| Scheduled functions | ✅ Skip | Client-side expiry check | v2 |
| E2E tests | ✅ Skip | Manual testing sufficient for MVP | v2 |
| Audit log | ✅ Skip | Not in demo | v2 |
| Print/PDF export | ✅ Skip | Not in demo | v2 |
| Data backup to Google Drive | ✅ Skip | Use Firestore export instead | v2 |
| Mobile app | ✅ Skip | Responsive web is sufficient | v3+ |

### Must-Have in v1

- ✅ Firebase Auth with admin/trainer roles
- ✅ Customer CRUD (all 5 tabs)
- ✅ Contract management with shared contracts
- ✅ Coach lesson recording with auto-decrement
- ✅ Cash flow ledger with CSV import
- ✅ P&L report (client-side computed)
- ✅ Trial client tracking
- ✅ Venue rental with cash flow auto-sync
- ✅ Firestore security rules
- ✅ Responsive design (mobile + desktop)

---

## 17. Phased Implementation Plan

### Phase 1: Foundation (Day 1 — 8 hours)

| Task | Time | Method |
|---|---|---|
| Firebase project setup (Auth, Firestore, Hosting) | 30 min | Manual |
| Vite + React + Tailwind + shadcn/ui scaffold | 30 min | AI-generate |
| TypeScript types + Zod schemas for all entities | 1 hr | AI-generate |
| Firebase config, auth helpers, Firestore helpers | 1 hr | AI-generate |
| Zustand stores (auth, UI, filters) | 30 min | AI-generate |
| Layout: Navbar, sidebar, PageHeader, routing | 1.5 hr | AI-generate + manual |
| Auth flow: Login page, ProtectedRoute, role guard | 1.5 hr | Manual + AI |
| Cloud Function: onUserCreate + setUserRole | 1 hr | Manual |

### Phase 2: Core Modules (Day 2 — 10 hours)

| Task | Time | Method |
|---|---|---|
| Customer CRUD: Dashboard + 5-tab form modal | 3 hr | AI-generate + manual |
| Contract management + shared contracts | 1.5 hr | AI-generate + manual |
| Coach lesson records: 3-step wizard + stats | 2 hr | AI-generate + manual |
| Cash flow: CRUD + CSV import modal | 2 hr | AI-generate + manual |
| Profit & Loss: 12-month computed table | 1.5 hr | AI-generate |

### Phase 3: Secondary Modules + Polish (Day 3 — 10 hours)

| Task | Time | Method |
|---|---|---|
| Trial clients: Dashboard + form | 1 hr | AI-generate |
| Venue rental: CRUD + cash flow sync | 1.5 hr | AI-generate + manual |
| Firestore security rules (write + test) | 1.5 hr | Manual |
| Backup: Firestore export/import | 1 hr | AI-generate |
| System settings: password change | 30 min | AI-generate |
| UI polish: empty states, loading, toasts, responsive | 2 hr | Manual |
| Cross-module testing (venue→cashflow, lesson→contract) | 1.5 hr | Manual |
| Deploy to Firebase Hosting + smoke test | 1 hr | Manual |

### Total: ~28 hours across 3 days

---

## 18. Realistic 3-Day MVP Timeline

```
┌──────────────────────────────────────────────────────────────┐
│ DAY 1: Foundation & Auth                                      │
│ ┌────────┬────────┬────────┬────────┬────────┬────────┬─────┐│
│ │Firebase│Scaffold│ Types  │ Auth   │ Layout │ Routes │Cloud││
│ │ Setup  │Vite+TW │ + Zod  │ Flow   │Nav+Page│+Guards │ Fn  ││
│ │ 0.5h   │ 0.5h   │ 1h    │ 1.5h   │ 1.5h   │ 1.5h  │ 1h  ││
│ └────────┴────────┴────────┴────────┴────────┴────────┴─────┘│
│ Deliverable: Working auth + empty module pages                │
├──────────────────────────────────────────────────────────────┤
│ DAY 2: Core CRUD Modules                                      │
│ ┌──────────────┬───────────┬──────────────┬──────────────────┐│
│ │  Customers   │  Lessons  │  Cash Flow   │     P&L          ││
│ │  + Contracts │  Wizard   │  + CSV       │   Table          ││
│ │    3h+1.5h   │   2h      │    2h        │   1.5h           ││
│ └──────────────┴───────────┴──────────────┴──────────────────┘│
│ Deliverable: All 5 core modules functional                    │
├──────────────────────────────────────────────────────────────┤
│ DAY 3: Secondary Modules + Polish + Deploy                    │
│ ┌────────┬────────┬────────┬────────┬────────┬──────────────┐│
│ │ Trials │ Venue  │Security│ Backup │ Polish │   Deploy     ││
│ │        │Rental  │ Rules  │Settings│ & Test │              ││
│ │  1h    │ 1.5h   │ 1.5h   │ 1.5h  │ 3.5h   │   1h        ││
│ └────────┴────────┴────────┴────────┴────────┴──────────────┘│
│ Deliverable: Production-ready MVP on Firebase Hosting         │
└──────────────────────────────────────────────────────────────┘
```

### Prerequisites Before Day 1

- [ ] Firebase project created with Blaze plan (pay-as-you-go, still free tier)
- [ ] GitHub repository initialized
- [ ] Firebase CLI installed and authenticated
- [ ] shadcn/ui documentation bookmarked
- [ ] Demo site open for reference

### Post-MVP (Week 2)

- [ ] User acceptance testing with actual trainers
- [ ] Data migration from existing localStorage app
- [ ] Bug fixes from UAT
- [ ] GitHub Actions CI/CD setup
- [ ] Firebase App Check enablement
- [ ] Documentation for admin operations

---

## 19. Project Structure for Future Expansion

### Adding a New Module

```
1. Define type in types/index.ts
2. Add Zod schema in lib/validators.ts
3. Create Firestore hook in hooks/useNewModule.ts
4. Add security rule in firestore.rules
5. Create components in components/newModule/
6. Add route in app/routes.tsx
7. Add nav item in components/layout/Navbar.tsx
```

### Feature Flags (Future)

```typescript
// lib/constants.ts
export const FEATURES = {
  DARK_MODE: false,
  PDF_EXPORT: false,
  NOTIFICATIONS: false,
  AUDIT_LOG: false,
} as const;
```

### Internationalization Path (Future)

```
1. Install react-i18next
2. Extract all Chinese strings to translation files
3. Add language switcher to settings
4. Wrap all text in t() function calls
```

---

## 21. Trainer Lesson Usage Redesign Specification

To enhance administrative oversight, the Trainer Lesson Usage (教練銷課) module has been refactored into a high-level **Admin Trainer Dashboard** with drill-down detailed reporting.

### 21.1 Database Schema Additions
1. **`trainers` Collection**:
   - `id`: Unique identifier (e.g., `trainer-a`, `trainer-b`, `trainer-c`).
   - `name`: Trainer's name.
   - `email`: Contact email address.
   - `phone`: Mobile number.
   - `createdAt` / `updatedAt`: Standard timestamps.
2. **Relationships & Associations**:
   - Each `Customer` holds a `trainerId` field mapping to a specific trainer document.
   - `Contract` and `LessonRecord` entities reference the corresponding `trainerId` to establish a relational link for transaction logs.

### 21.2 Admin Trainer Dashboard Features
- **Stat Cards**: Display system-wide aggregate metrics (Total remaining lessons, total history consumed lessons, and total trainers count).
- **Trainer Onboarding Workflow**:
  - A "+ 新增教練" (Add Trainer) button is provided on the dashboard page for administrators.
  - Opens a modal dialog collecting the trainer's Name, Email, and Phone with Zod validation.
  - Dynamically saves the new trainer as a real document in the database, automatically updating stats cards and directory list.
- **Interactive Trainer Directory**:
  - List layout displaying trainer profiles alongside their respective aggregated metrics:
    - **系統堂數 (System Lessons)**: Sum of all remaining sessions of active/ongoing contracts for assigned students.
    - **總堂數 (Total Used Lessons)**: Sum of all consumed lesson counts recorded under the trainer.
  - Sorting support on Trainer Name, System Lessons, and Total Used Lessons in ascending/descending order.
  - Interactive clickable rows/cards to navigate into the trainer's detail view.

### 21.3 Trainer Detail View & Drilling Down
- Navigates to a dedicated panel/view showing the selected trainer's student records.
- **Lesson Usage Ledger**:
  - Displays Student Name, Lesson Date, Lessons Used, and Current Remaining Lessons.
  - Features quick inline actions to edit or delete lesson records, recalculating contract allocations on the fly.
  - Houses the "+ 新增銷課" wizard, scoped automatically to only display students assigned to the active trainer.

---

## 20. Summary of Key Decisions

| Decision | Choice | Key Reason |
|---|---|---|
| Database | Firestore (not Postgres) | Zero-ops, real-time, free tier, offline support |
| State | Zustand (not Redux) | <15 users, minimal boilerplate |
| Forms | RHF + Zod (not Formik) | Performance, type-safe validation |
| Functions | Only for side effects | Keep client-side for reads, minimize cold starts |
| Testing | Vitest (not Jest) | Vite-native, faster |
| Staging env | Skip (use preview channels) | <15 users, cost optimization |
| P&L computation | Client-side | Avoid function invocations, data already loaded |
| i18n | Skip in v1 | All users speak Chinese |
| Mobile app | Skip (responsive web) | Sufficient for internal tool |

---

> **This plan is designed to be handed directly to an engineering team (or AI coding agent) for execution. Each section is self-contained and can be referenced independently during development.**
