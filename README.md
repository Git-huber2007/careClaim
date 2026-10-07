# CareClaim AI — Autonomous Hospital Discharge Claims Adjudication

> **Eliminating the 6-to-8 hour discharge bottleneck.**  
> CareClaim AI is an Agentic AI system that ingests itemized hospital bills, cross-references patient insurance policies, uses Google Gemini as an autonomous adjudicator to detect exclusions and anomalies, and streams real-time reasoning to an interactive dark-mode terminal.

---

## 🌟 Key Features

- **Autonomous Agentic Adjudication**: Powered by Google GenAI (`@google/genai`) with structured JSON schema outputs (`chain_of_thought`, `final_status`, `approved_amount`, `denied_items`).
- **Interactive Agent Terminal UI**: Dark-mode terminal with CRT scanline animations, line-by-line typewriter streaming, and color-coded reasoning steps (green for approved items, red for exclusions/fraud, amber for warnings, cyan for system operations).
- **Deterministic Math Verification**: Independent audit layer that verifies the agent's line-by-line decisions against policy constraints (`Total Billed − Exclusions − Copay = Approved Payout`).
- **Secure Supabase Authentication**: Hospital staff authentication with JWT verification middleware protecting all backend endpoints.
- **Mock Insurance Policy Matrix**: Pre-seeded policies (Gold, Silver, Platinum, Basic) supporting instant testing of edge cases (uncovered procedures, copay calculations, coverage caps, fraud/mismatched patient IDs).
- **Quick-Load Demo Scenarios**: One-click scenario loading in the frontend for live demonstrations and audits.

---

## 🏗️ System Architecture

```
/careClaim
  ├── backend/
  │    ├── controllers/
  │    │    └── claimsController.js    # Claim CRUD and agent adjudication orchestration
  │    ├── middleware/
  │    │    ├── auth.js                # Supabase JWT verification
  │    │    └── errorHandler.js        # Global error & Zod validation handler
  │    ├── routes/
  │    │    └── claims.js              # /api/claims & /api/policies routes
  │    ├── services/
  │    │    ├── adjudicationMath.js    # Deterministic payout math & line item matcher
  │    │    ├── geminiService.js       # @google/genai SDK integration & system prompt
  │    │    └── supabase.js            # Supabase service-role admin client
  │    ├── utils/
  │    │    └── http.js                # HttpError & async wrapper helpers
  │    ├── validation/
  │    │    └── schemas.js             # Zod validation schemas
  │    ├── .env.example
  │    ├── config.js
  │    └── index.js                    # Express server entry point
  ├── frontend/
  │    ├── src/
  │    │    ├── components/
  │    │    │    ├── AdjudicationSummary.jsx  # Payout waterfall math & breakdown
  │    │    │    ├── AgentTerminal.jsx        # Live streaming terminal UI
  │    │    │    ├── AuthForm.jsx             # Supabase Auth sign-in / registration
  │    │    │    ├── ClaimTable.jsx           # Dashboard claims queue table
  │    │    │    ├── ClaimUploader.jsx        # Bill ingestion form with quick demos
  │    │    │    ├── DashboardLayout.jsx      # Navigation sidebar & header layout
  │    │    │    ├── Icons.jsx                # Curated SVG icons
  │    │    │    ├── ProtectedRoute.jsx       # Route guard for authenticated staff
  │    │    │    └── StatusBadge.jsx          # Color-coded status badges
  │    │    ├── context/
  │    │    │    └── AuthContext.jsx          # Supabase auth session provider
  │    │    ├── lib/
  │    │    │    ├── api.js                   # Authenticated API client
  │    │    │    ├── format.js                # Currency, dates, and bill parsers
  │    │    │    ├── sampleBills.js           # 4 test scenarios matching mock policies
  │    │    │    └── supabase.js              # Supabase anon client
  │    │    ├── pages/
  │    │    │    ├── ClaimDetailPage.jsx     # Command center & live terminal execution
  │    │    │    ├── DashboardPage.jsx       # Claims queue & KPI metrics
  │    │    │    ├── LoginPage.jsx           # Staff authentication page
  │    │    │    └── NewClaimPage.jsx        # Claim ingestion page
  │    │    ├── App.jsx
  │    │    ├── index.css                    # Tailwind CSS v4 design system
  │    │    └── main.jsx
  │    ├── .env.example
  │    ├── index.html
  │    └── vite.config.js
  └── supabase/
       └── schema.sql                  # PostgreSQL tables, RLS policies & seed data
```

---

## 🚀 Getting Started

### 1. Database Setup (Supabase)

1. Open your [Supabase Dashboard](https://supabase.com).
2. Go to the **SQL Editor**.
3. Copy and run the contents of [`supabase/schema.sql`](supabase/schema.sql).
   - Creates the `policies` and `claims` tables.
   - Sets up Row Level Security (RLS) policies.
   - Seeds 4 mock policies (`POL-402-GOLD`, `POL-118-SILVER`, `POL-777-PLATINUM`, `POL-055-BASIC`).

### 2. Configure Environment Variables

**Backend (`backend/.env`)**:
```env
PORT=5000
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-2.5-flash
CORS_ORIGIN=http://localhost:5173
```

**Frontend (`frontend/.env`)**:
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key
VITE_API_BASE_URL=http://localhost:5000
```

### 3. Run the Backend

```bash
cd backend
npm run dev
# Server starts on http://localhost:5000
```

### 4. Run the Frontend

```bash
cd frontend
npm run dev
# Web application starts on http://localhost:5173
```

---

## 🧪 Demo Scenarios

On the **New Claim** page (`/claims/new`), select any of the pre-configured demo scenarios:

1. **Appendectomy + Cosmetic Add-on (`POL-402-GOLD`)**:
   - Tests clinical coverage alongside excluded procedures (`Cosmetic Scar Revision Surgery`, `Vitamin Supplements Pack`).
   - Outcome: `PARTIAL` approval with excluded line items deducted and 10% copay applied.
2. **Clean Pneumonia Admission (`POL-118-SILVER`)**:
   - Clean in-policy medical treatments.
   - Outcome: `APPROVED` with 20% copay applied.
3. **Cardiac Stent High-Value (`POL-777-PLATINUM`)**:
   - High-cost angioplasty with experimental gene therapy.
   - Outcome: Gene therapy excluded; 0% copay applied to covered items.
4. **Mismatched Patient / Fraud (`POL-055-BASIC`)**:
   - Patient ID (`PAT-9999`) does not match policy holder (`PAT-1004`).
   - Outcome: `DENIED` with fraud warning emitted in terminal reasoning.

---

## 🔒 Security Principles

- **Zero Secrets in Frontend**: `GEMINI_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are only stored in `backend/.env`.
- **JWT Verification**: Every request to `/api/claims` verifies the Supabase token. The user ID is retrieved directly from the verified token (`req.user.id`), never accepted from request body payloads.
- **Row-Level Security (RLS)**: Hospital staff accounts are partitioned and can only query or alter claims associated with their account.
