# CareClaim AI — Autonomous Hospital Discharge Claims Adjudication

> **Eliminating the 6-to-8 hour discharge bottleneck.**  
> CareClaim AI ingests itemized hospital bills, cross-references the patient's insurance policy, uses Google Gemini as an autonomous adjudicator to detect exclusions and billing anomalies, and streams its reasoning live to an agent terminal.

---

## 🌟 Key Features

- **Two Account Types**: Hospital billing staff file claims and run the agent; patients see the claims filed for them, check a bill themselves, and dispute charges that look wrong.
- **Per-Line Bill Flags**: Every bill line is flagged `OK`, `NOT_COVERED`, `DUPLICATE`, `OVERPRICED`, `UNBUNDLED` or `UNRELATED`, so a charge the policy simply does not cover is never confused with a charge that looks wrong.
- **Patient Disputes**: A patient can question a suspicious line on a hospital-filed claim; the hospital answers from its Disputes queue, and both see the thread on the claim.
- **Autonomous Agentic Adjudication**: Google GenAI (`@google/genai`) with a structured JSON schema (`chain_of_thought`, `line_items`, `final_status`, `approved_amount`).
- **Live Agent Terminal**: The run is streamed over Server-Sent Events and printed line by line. A run that loses its stream (a reload, a dropped connection) still finishes on the server, and the page picks the verdict up by itself.
- **Deterministic Verification**: The model only decides the flag on each line. The payout is recomputed in code (`Total Billed − Exclusions − Copay = Approved Payout`, capped at the policy limit), and three rules are enforced whatever the model says: exact duplicates, lines whose name opens with an excluded treatment, and a patient who is not the policy holder.
- **One Verdict Per Claim**: A claim is adjudicated once. A second run is refused while one is in flight and after a verdict is saved.
- **Bill Scanning**: Upload a PDF or photo of a bill and Gemini extracts the line items, total and diagnosis code. The scanned file is kept with the claim as its original bill.
- **Discharge Slip**: A printable discharge clearance and explanation-of-benefits slip for every adjudicated claim. A hospital-filed claim's slip carries a QR code that opens a public page confirming the slip's amounts.
- **Disputes Change the Bill**: When the hospital agrees with a dispute, that charge is withdrawn and comes off what the patient owes. The insurer's payout is unchanged, since a flagged charge was never part of it.
- **Rate Inspector**: Any bill line can be opened next to its entry on the reference price list, with how many times the reference it was charged.
- **Estimate Before Filing**: The claim form can work out what the policy would pay for a planned bill from the policy's terms alone, with no AI run and nothing saved.
- **In Simple Words**: Every verdict has a plain-language summary in English and Hindi, built from the flags and amounts.
- **Search, Export and Analytics**: The claims list can be searched, filtered, sorted and exported as CSV; an analytics page totals outcomes, flagged amounts and the most-flagged items.
- **Stalled-Run Recovery**: A run is marked in the database while it is in flight. If the server stops mid-run, the claim is offered for a new run after three minutes instead of staying stuck.
- **Mock Insurance Policies**: Twelve seeded Indian health policies (general, cardiac, oncology, orthopaedic, maternity, critical care, trauma, PM-JAY and more) for testing exclusions, copays, coverage caps and mismatched patient IDs.

---

## 🏗️ System Architecture

```
/careClaim
  ├── backend/                          # Express API (Node 20+)
  │    ├── controllers/
  │    │    ├── claimsController.js     # Claims, policy lookup, stats, adjudication orchestration
  │    │    ├── disputesController.js   # Patient disputes and hospital responses
  │    │    └── profileController.js    # Account setup (hospital or patient)
  │    ├── middleware/
  │    │    ├── auth.js                 # Supabase JWT verification + role loading
  │    │    └── errorHandler.js         # Global error & Zod validation handler
  │    ├── routes/claims.js             # /api/me, claims, disputes, policies, stats, analytics, estimate, verify
  │    ├── services/
  │    │    ├── adjudicationMath.js     # Deterministic payout math, line matching, enforced rules
  │    │    ├── geminiService.js        # @google/genai integration: adjudication and bill extraction
  │    │    └── supabase.js             # Supabase service-role client
  │    ├── test/                        # node:test unit tests
  │    ├── validation/schemas.js        # Zod schemas for every request body
  │    ├── config.js                    # Environment handling
  │    └── index.js                     # Server entry point
  ├── frontend/                         # React 19 + TypeScript + Vite + Tailwind CSS v4
  │    └── src/
  │         ├── components/
  │         │    ├── AppShell.tsx            # Navigation bar shared by every signed-in page
  │         │    ├── RequireAccount.tsx      # Gate: signed in and set up, else /login or /setup
  │         │    ├── AgentTerminal.tsx       # Live reasoning terminal
  │         │    ├── PayoutWaterfall.tsx     # Billed → exclusions → copay → payout
  │         │    ├── FlaggedLine.tsx         # A bill line that was not paid, with "Dispute this charge"
  │         │    ├── DisputeCard.tsx         # One dispute and the hospital's answer
  │         │    ├── NoteForm.tsx            # Note box shared by raising and answering a dispute
  │         │    ├── DischargeSlipModal.tsx  # Printable discharge / EOB slip, with a verification QR code
  │         │    ├── BenchmarkInspectorModal.tsx  # A bill line next to its reference price
  │         │    ├── PlainSummary.tsx        # The verdict in simple words, English or Hindi
  │         │    ├── PatientSmsModal.tsx     # Preview of the message a patient would get
  │         │    └── StatusStamp.tsx         # Claim status stamp
  │         ├── lib/                         # api client, claim helpers, formatting, Supabase client
  │         ├── pages/
  │         │    ├── Login.tsx               # Sign in, register, request a password reset
  │         │    ├── ResetPassword.tsx       # Where the emailed reset link lands
  │         │    ├── AccountSetup.tsx        # One-time choice of hospital or patient account
  │         │    ├── Dashboard.tsx           # Claims list and headline numbers
  │         │    ├── NewClaim.tsx            # Claim intake / patient bill check, with bill scanning and estimate
  │         │    ├── ClaimView.tsx           # Bill, agent terminal, verdict, disputes
  │         │    ├── Disputes.tsx            # Hospital queue / a patient's own disputes
  │         │    ├── Analytics.tsx           # Outcomes, flagged amounts, most-flagged items
  │         │    └── Verify.tsx              # Public page the slip's QR code opens
  │         ├── App.tsx                      # Routes (each page is a lazily loaded chunk)
  │         └── index.css                    # Design tokens ("Pine & Bone" theme)
  ├── supabase/schema.sql               # Tables, access lockdown and seed data
  ├── render.yaml                       # Backend deployment (Render)
  └── .github/workflows/ci.yml          # Lint, typecheck, tests and build on every push
```

---

## 🚀 Getting Started

### 1. Database Setup (Supabase)

1. Open your [Supabase Dashboard](https://supabase.com/dashboard) and go to the **SQL Editor**.
2. Run the contents of [`supabase/schema.sql`](supabase/schema.sql).
   - Creates the `policies`, `profiles`, `claims`, `disputes` and `reference_prices` tables.
   - Safe to re-run: it upgrades an existing database in place.
   - Locks the tables to the backend's service role; signed-in users have no direct table access.
   - Seeds twelve mock policies (`STAR-402-GOLD` for `PAT-1001`, `HDFC-118-SILVER` for `PAT-1002`, … `AYUSHMAN-101-PMJAY` for `PAT-1012`) and a mock reference price list.
3. Optional, for password resets: add `http://localhost:5173/reset-password` and your deployed `…/reset-password` URL under **Authentication → URL Configuration → Redirect URLs**. Without it Supabase sends the emailed link to the Site URL instead, and the app takes the user on to the new-password form from there.

### 2. Configure Environment Variables

**Backend (`backend/.env`)**:
```env
PORT=5000
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-2.5-flash
CORS_ORIGIN=http://localhost:5173
# Optional: require this code before an account can be set up as a hospital
# HOSPITAL_ACCESS_CODE=
```

`SUPABASE_URL` is the project's API URL (`https://<ref>.supabase.co`), not the dashboard address. If it is missing or unusable, the backend falls back to the project the service key belongs to and says so at startup.

**Frontend (`frontend/.env`)**:
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key
VITE_API_BASE_URL=http://localhost:5000
```

### 3. Run

```bash
cd backend && npm install && npm run dev     # http://localhost:5000
cd frontend && npm install && npm run dev    # http://localhost:5173
```

### 4. Checks

```bash
cd backend && npm test                                           # payout math and enforced rules
cd frontend && npm run lint && npm run typecheck && npm test     # oxlint, tsc, vitest
```

---

## 🧪 Demo Scenarios

Sign in with a hospital account, open **New Claim**, and pick one from **Load Sample Scenario**:

1. **Clean Approval** (`HDFC-118-SILVER`, `PAT-1002`): a pneumonia admission with in-policy treatments. Outcome: `APPROVED`, 15% copay applied.
2. **Partial (Cosmetic)** (`STAR-402-GOLD`, `PAT-1001`): an appendectomy with a cosmetic scar revision. Outcome: `PARTIAL`, the cosmetic line is not covered, 10% copay on the rest.
3. **Fraud/Overcharge** (`STAR-402-GOLD`, `PAT-1001`): anesthesia billed twice and an overpriced X-ray. Outcome: `PARTIAL`, with the repeat flagged `DUPLICATE` and the X-ray `OVERPRICED`.

To see the patient side, register a second account as a patient with `STAR-402-GOLD` / `PAT-1001`. The claims filed for that patient appear under **My Bills**, and the flagged lines can be disputed. To see a mismatch, file a claim against a policy with a patient ID that is not its holder: every line is denied.

---

## 📡 API Notes

- `POST /api/claims/:id/process` runs the agent. With `Accept: text/event-stream` it streams `stage_start`, `log`, then `result` (or `error`); otherwise it answers with JSON.
- `GET /api/claims/:id` includes `adjudicating: true` while a run for that claim is in flight.
- `GET /api/policies` returns a patient's own policy. A hospital must pass `?policy_number=` and gets that one policy, without the holder's patient ID.
- `POST /api/estimate` answers with the payout math for a planned bill against a policy; `GET /api/analytics` and `GET /api/reference-prices` are read-only views.
- `POST /api/claims/:id/document` attaches the scanned bill (once; it cannot be replaced) and `GET` answers with a link to it that works for an hour. The files live in a private Supabase Storage bucket, `claim-documents`, which the backend creates on first use.
- `GET /api/verify/:id` needs no sign-in. It confirms the status and amounts of an adjudicated, hospital-filed claim and nothing else.
- The Gemini free tier allows a small number of requests per model per day (20 for `gemini-2.5-flash` at the time of writing). Each adjudication and each bill scan is one request. When `GEMINI_MODEL` answers that its quota is spent, the request goes to `GEMINI_FALLBACK_MODEL` (default `gemini-3.5-flash-lite`); when that fails too, the caller is told the quota is used up. `AI_DAILY_LIMIT_PER_USER` optionally caps requests per account per day.

---

## 🔒 Security Principles

- **Zero Secrets in Frontend**: `GEMINI_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` live only in the backend's environment.
- **JWT Verification**: Every API request carries the Supabase token in the `Authorization` header. The user ID comes from the verified token, never from the request body, and the role from the `profiles` table.
- **Backend-Only Data Access**: RLS is enabled with no policies and all grants to `authenticated` are revoked, so a signed-in user cannot read or edit tables directly. Every query runs in the backend, scoped by role: a hospital account sees the claims it filed; a patient sees claims filed for their patient ID and the bills they checked themselves.
- **No Policy Directory**: A hospital account looks a policy up by its number and is never shown the holder's patient ID, and a patient is never shown the terms of a policy that is not theirs, including in the agent's reasoning.
- **Patient Account Takeover Protection**: A patient account is tied to a policy and verified against the registered policyholder email address on file (`holder_email`). On first registration, the policy binds to the verified user email, locking out impostors.
- **Shared Hospital Queues**: Hospital staff accounts belong to an organization (`hospital_org`). Colleagues within the same network or hospital share the intake claims queue and dispute review. Hospital account registration is guarded by `HOSPITAL_ACCESS_CODE`.
- **Database Concurrency Lock (`PROCESSING` Status)**: Adjudication double-run protection uses an atomic database status transition from `PENDING` to `PROCESSING`, surviving server restarts and multi-instance horizontal scaling.
- **Flags Are Not Accusations**: A flag marks a charge as worth reviewing. The "overpriced" flag compares against the mock values in `reference_prices`, which are not an official rate card.
