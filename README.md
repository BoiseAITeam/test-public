# InsureTrack — Subcontractor Insurance Compliance

A web app for managing subcontractor insurance compliance, built with Node.js/Express and PostgreSQL (Supabase). Designed to deploy to **Vercel** (backend) and **Supabase** (database).

---

## Quick Start (Local Development)

### Prerequisites
- Node.js 18+
- A Supabase project (free tier works) or local PostgreSQL instance

### Setup

1. **Clone the repo** and install dependencies:
   ```bash
   npm install
   ```

2. **Create your database**: Run the SQL files in your Supabase SQL Editor (or any PostgreSQL):
   ```
   supabase/schema.sql   ← creates all tables and indexes
   supabase/seed.sql     ← inserts demo data (update password hashes first)
   ```

3. **Generate password hashes** for the seed data:
   ```bash
   node supabase/hash-passwords.js
   ```
   Copy the output hashes and replace `__ADMIN_HASH__`, `__GC_HASH__`, `__AGENT_HASH__` in `supabase/seed.sql`.

4. **Configure environment**: Copy `.env.example` to `.env` and fill in your values:
   ```bash
   cp .env.example .env
   ```
   Set `DATABASE_URL` to your Supabase connection string and `JWT_SECRET` to a random 32+ character string.

5. **Start the server**:
   ```bash
   npm start
   ```
   Or use the startup script:
   ```bash
   ./start.sh
   ```

6. Open `http://localhost:3001` in your browser.

---

## Deploying to Vercel + Supabase

### Supabase Setup
1. Create a new project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** → run `supabase/schema.sql`, then `supabase/seed.sql`
3. Get your **Connection Pooler** string from: Project Settings → Database → Connection Pooling (Transaction mode, port 6543)

### Vercel Setup
1. Push this repo to GitHub
2. Import the repo in [vercel.com](https://vercel.com)
3. Add environment variables:
   - `DATABASE_URL` — your Supabase connection string
   - `JWT_SECRET` — a random secret (32+ characters)
   - `NODE_ENV` — `production`
4. Deploy — Vercel will use `vercel.json` to route all requests through `server.js`

---

## Demo Accounts

| Role | Email | Password | What They See |
|------|-------|----------|---------------|
| **Admin / Consultant** | `dawn@insuretrack.com` | `admin123` | Everything — all GCs, all subs, all reports |
| **General Contractor** | `tom@apexbuilding.com` | `gc123` | Only Apex Building Group's subcontractors |
| **General Contractor** | `sarah@mountaincrest.com` | `gc123` | Only Mountain Crest Construction's subcontractors |
| **Insurance Agent** | `mike@idahofirst.com` | `agent123` | Dashboard + email tools |

---

## Standalone HTML Version

A standalone version of the app (`public/InsureTrack.html`) is also included that runs entirely in the browser using `localStorage` — no server or database required. Open it directly in Chrome, Edge, or Firefox.

> **Note:** The standalone version is for demo/evaluation purposes. For production use with multiple users, use the server version with Supabase.

---

## Pre-Loaded Demo Data

### Subcontractors (5)

| Company | Trade | Status | Notes |
|---------|-------|--------|-------|
| Peak Electrical LLC | Electrical | ✅ Active | Full GL + WC, W9 on file, Additional Insured confirmed |
| Rocky Mountain Plumbing | Plumbing | 🔴 Non-Compliant | WC expired 15 days ago; GL expiring in ~22 days |
| Dave's Drywall | Drywall | ⏳ Pending | No W9 on file; sole proprietor (Idaho WC exemption note) |
| Summit Roofing Inc | Roofing | ✅ Active | GL only; W9 from 2023 (renewal note) |
| Clearwater HVAC | HVAC | 🟡 Expiring Soon | Both policies expire in ~58 days |

### General Contractors (2)
- **Apex Building Group** (Tom Reynolds) — requires Additional Insured on all policies
- **Mountain Crest Construction** (Sarah Johnson) — no Additional Insured requirement

### Insurance Agents (3)
- **Mike Torres** — Idaho First Insurance
- **Linda Park** — Statewide Coverage
- **Robert Chen** — Peak Coverage Insurance

---

## Features by Section

### Dashboard
Shows a live compliance summary with stat cards:
- Total subcontractors
- Active / Expiring / Non-Compliant / Pending counts
- Compliance progress bar
- Quick table of all subs with status
- GC view shows only their assigned subs

### Subcontractors
The main working area. Click any row to open the detail panel, which has four tabs:

- **Overview** — contact info, status badge, quick policy summary
- **Policies** — each GL/WC policy with coverage amounts, carrier, dates, expiration status, Additional Insured flag, Ghost Policy option; verify button marks the certificate as reviewed
- **W9 Info** — tax ID (masked), entity type, signature date, on-file status, year; warning if expired year
- **GC Links** — which GCs this sub is assigned to

**Add Subcontractor** — form includes all contact fields, trade, sole proprietor toggle, W9 fields, and notes.

**Filters** (Admin view):
- Search by company name
- Filter by GC
- Filter by status (All / Active / Expiring / Non-Compliant / Pending)

### General Contractors
Admin-only section. View and manage GC profiles:
- Company details, contact, license number
- **Require Additional Insured** toggle — when checked, flags any sub under this GC that hasn't confirmed AI on their policy

### Insurance Agents
Admin-only section. Manage agent records:
- Name, agency, email, phone
- Agents are linked to policies

### Email Log
All outbound emails generated by the app are logged with:
- Sent date/time, recipient, subject, body preview
- Status (sent / pending)
- Click any row to preview the full email

### Email Templates
Admin can create and edit reusable email templates:
1. Certificate Request — sent to agents when a new certificate is needed
2. Policy Validation — sent to confirm coverage status
3. Expiration Warning — sent when a policy is near expiry
4. Onboarding Welcome — sent to new subcontractors

Templates support variables: `{{sub_name}}`, `{{agent_name}}`, `{{gc_name}}`, `{{admin_name}}`, `{{gl_policy_number}}`, `{{wc_policy_number}}`

### Compliance Report
Full tabular report with CSV export.

### Notifications
Alert badges for expiring policies, expired policies, and missing W9s.

---

## Business Rules

| Rule | Behavior |
|------|----------|
| **GL minimum** | $1,000,000 coverage required |
| **WC minimum** | $500,000 coverage required |
| **30-day warning** | Policies within 30 days of expiry show "Expiring" status |
| **W9 required** | No W9 on file → status is "Pending" regardless of policies |
| **Sole proprietor** | Idaho exemption flag; WC optional, noted in record |
| **Additional Insured** | Per-GC toggle; flags sub if not confirmed on their policy |
| **Ghost Policy** | Checkbox on each policy for tracking ghost/shell policies |
| **Status priority** | Expired → Non-Compliant; no W9 → Pending; ≤30 days → Expiring Soon; else → Active |

---

## Folder Structure

```
insuretrack/
├── public/
│   ├── index.html           ← Server-backed SPA (frontend)
│   └── InsureTrack.html     ← Standalone localStorage version
├── supabase/
│   ├── schema.sql           ← Database schema
│   ├── seed.sql             ← Demo data
│   └── hash-passwords.js    ← Generate bcrypt hashes for seeds
├── server.js                ← Express + PostgreSQL backend
├── package.json             ← Dependencies and scripts
├── vercel.json              ← Vercel deployment config
├── start.sh                 ← Local startup script
├── .env.example             ← Environment variable template
└── README.md                ← This file
```

---

## Testing Checklist

- [ ] Log in as Admin (`dawn@insuretrack.com / admin123`)
- [ ] Dashboard shows 5 subs total with correct status breakdown
- [ ] Click Rocky Mountain Plumbing row → verify Non-Compliant badge + expired WC policy shown in red
- [ ] Click Clearwater HVAC → verify "Expiring" badge + ~58 days remaining on both policies
- [ ] Click Dave's Drywall → verify Pending status + W9 tab shows "No" with warning
- [ ] Add a new subcontractor → fill out form → verify it appears in the list
- [ ] Open a sub → Policies tab → click "Request Certificate" → check Email Log for the sent email
- [ ] Open Compliance Report → Export CSV → verify file downloads with all subs
- [ ] Open Notifications → mark all as read → verify bell badge clears
- [ ] Log out → log in as GC (`tom@apexbuilding.com / gc123`) → verify only Apex's subs are visible
- [ ] Log out → log in as Agent (`mike@idahofirst.com / agent123`) → verify dashboard loads
