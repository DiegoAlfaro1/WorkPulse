# WorkPulse audit & roadmap

Audit of `development` @ `7cc3a3e` (2026-10-12). Work top to bottom; tick a box when it's merged.

**Baseline:** `go test` + `go vet` pass, frontend tests 6/6 pass, `npm audit` 0 vulnerabilities,
no raw-HTML sinks (`dangerouslySetInnerHTML` / `innerHTML` / `eval`), every company query is scoped by the session.
The gaps are mostly deployment hardening and missing features, not broken logic.

---

## Phase 1 — Security quick wins (~30 min)

### 1.1 HTTPS
- [x] Put TLS in front of the frontend container (Caddy reverse proxy, or nginx + certbot, or the host's load balancer).
- [x] Once TLS works, add HSTS: `add_header Strict-Transport-Security "max-age=31536000" always;`

**Why:** compose serves plain HTTP on `:8080`; passwords and bearer tokens travel in cleartext.
**Done when:** `http://` redirects to `https://` and the login request shows as HTTPS in devtools.

### 1.2 Security headers (`frontend/nginx.conf`, inside `server {}`)
- [x] Add:
  ```nginx
  server_tokens off;
  add_header Content-Security-Policy "default-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'" always;
  add_header X-Content-Type-Options nosniff always;
  add_header Referrer-Policy no-referrer always;
  ```
- [ ] Check the app still loads with no CSP errors in the console (inline `style={}` props need `'unsafe-inline'` for styles).

**Why:** the token lives in `localStorage` (`frontend/src/infrastructure/apiAdapter.js:317`), so any XSS = account takeover.
React escaping protects you today; CSP keeps it that way. `frame-ancestors` blocks clickjacking.

### 1.3 Dependency bumps
- [x] `cd backend && go get golang.org/x/net@latest golang.org/x/text@latest github.com/quic-go/quic-go@latest && go mod tidy`
- [x] Update the local Go toolchain past 1.26.0 (Docker's `golang:1.26-alpine` already pulls the latest patch).
- [x] Re-run `go run golang.org/x/vuln/cmd/govulncheck@latest ./...` → no reachable findings.

**Why:** govulncheck reports reachable vulns in `x/net` 0.51 (fixed 0.60), `x/text` 0.34 (fixed 0.39), `quic-go` 0.59 (fixed 0.59.1),
plus ~20 stdlib CVEs in the local Go 1.26.0.

### 1.4 Throttle password changes (`frontend/nginx.conf`)
- [x] Add a `location = /api/auth/password` block reusing `zone=login` (copy of the login block).

**Why:** a stolen token can brute-force the current password through `/api/auth/password`.
**Note for later:** if a load balancer ever sits in front of nginx, set `real_ip_header` / `set_real_ip_from`,
or every user shares one 10/min login bucket.

---

## Phase 2 — Security hardening (backend)

### 2.1 Impersonation
- [x] Short TTL for impersonation sessions (~1h) — `newSession` in `backend/auth.go` uses the 7-day `sessionTTL` for everything.
- [x] Audit table: `ImpersonationLog{SuperAdminID, UserID, At}` written in `impersonate`.
- [x] Decide whether entries created while impersonating should be flagged (e.g. `ImpersonatorID` on `Entry`).

**Why:** "Sign in as" sessions live 7 days and leave no trace; entries created while impersonating look like the user's own.

### 2.2 Entry time sanity (`backend/entries.go` `createEntry`)
- [x] Reject `end - start > 24h`.
- [x] Reject `end > now + 5 min` (clock skew allowance).
- [x] Test both in `router_test.go`.

**Why:** a client can post a 10-year or future entry and inflate every report.

### 2.3 Smaller items
- [x] Map `binding` errors to a friendly message instead of returning `err.Error()` verbatim (leaks Go field names).
- [ ] After first start, remove `SUPERADMIN_PASSWORD` from `.env` and change it through the UI (it's visible in `docker inspect`).
- [x] SQLite backups: Litestream, or a cron running `sqlite3 /data/workpulse.db ".backup ..."`. Today a lost `data` volume = all data lost.
- [x] Optional: `healthcheck` on the backend in `compose.yaml` (`/api/health` exists) and `depends_on: condition: service_healthy`.

---

## Phase 3 — Missing features (core)

### 3.1 Edit entries
- [x] Backend: `PATCH /api/entries/:id` (same ownership rule as delete; same validation as create).
- [x] Frontend: edit desc / project / task / tags / billable / start / end from `EntryRow`.
- [x] Reject overlapping entries of the same user, on create and edit (`start < other.end AND end > other.start`).

**Why:** biggest gap for a time tracker. Today a wrong time can only be deleted.
Overlaps count the same hour twice in every report; rejecting them at the source does most of what a "time audit" page would.

### 3.2 Manual entries & time for others
- [x] Frontend form to add a past block (date, start, end). Backend already accepts `start`/`end`.
- [x] Admins and managers can add an entry for someone they can see: honour `member` in the body (today it's ignored)
  when the caller may see that user (`visibleUsers`), and store who created it (`CreatedByID`, like `ImpersonatorID`).

**Why:** people forget to track. Today nobody but the person themselves can fix their week; the only way around it is
the super admin impersonating them.

### 3.3 Server-side running timer & team activity
- [ ] Store the running timer on the server (e.g. an entry with null `end`, or a `running_timers` row) instead of
  `localStorage` (`frontend/src/application/useTimeTracker.js:169`).
- [ ] Team activity: managers and admins see who is tracking right now (project, task, elapsed) on the users/team page.

**Why:** today the timer is lost on cleared storage or switching device/browser, and managers can't see who's tracking.
Team activity costs almost nothing once the timer lives on the server.

### 3.4 Paginate entries
- [ ] `GET /api/entries?from=&to=` (the `ponytail:` note in `backend/entries.go`); frontend fetches the last 26 weeks (covers the heatmap).

**Why:** admins download the whole company's history on every load.

### 3.5 Catalog management
- [ ] Projects: rename, change color, archive (hide from pickers, keep in reports).
- [ ] Tags: rename / delete.
- [ ] Tasks per company instead of the hard-coded list in `frontend/src/infrastructure/localCatalog.js` (default `'Design'` in `useTimeTracker.js`).

### 3.6 Company settings & super admin
- [ ] Per-company hours target (8h/40h is hard-coded in `useInsights.js` / `InsightsPage.jsx`).
- [ ] Rename company.
- [ ] Clear 409 on company creation: say whether the company name or the admin email is taken.

### 3.7 CI
- [ ] GitHub Action: `go test ./...`, `go vet`, `govulncheck`, `npm ci && npm test && npm audit`.

---

## Phase 4 — UX improvements

### 4.1 Exports (PDF + CSV), from the Insights page
Both export exactly what Insights shows: scope (me / team), range, and the member / client / project / billing filters.

- [ ] **Date ranges for invoicing:** add "Last month" and a custom from–to (two `<input type="date">`) to the range control.
  Today it only has this week / this month / last 90 days, but an invoice covers a closed period.
- [ ] **PDF report:** an "Export PDF" button that calls `window.print()`, plus an `@media print` stylesheet; the
  browser's "Save as PDF" produces the file. No PDF library and no server rendering; the text stays selectable and
  searchable, and the charts (HTML/SVG) print as they are on screen.
  - Header: company, period (exact dates, not "This month"), the active filters, generated date and who generated it.
  - Summary: total / billable / non-billable hours; hours by client, project and member (the existing `BarList`s).
  - Detail: a print-only table of the filtered entries, grouped by day: date, member, project, task, description,
    tags, billable, start–end, **decimal hours**; a subtotal per day and a grand total. `useInsights` has to expose the
    filtered entries (today it only returns the aggregated report).
  - Print CSS: hide the nav bar, filters and buttons; A4/Letter portrait; `break-inside: avoid` on rows and panels;
    the table header repeats on each page.
  - Once 5.1 lands: rate and amount columns, and amount totals per client.
- [ ] **CSV export:** the same filtered entries, one file with every column, including **decimal hours** (`7.50`, not `7:30`),
  which is what invoices and spreadsheets want. No export builder; people rearrange columns in their spreadsheet.

**Why:** billable time has to leave the app to become an invoice or a client report. The PDF is what the client sees;
the CSV is what accounting imports.
**Done when:** a PDF of "Last month · client X · billable" has the same totals as the screen, and no row is cut across pages.
**Later:** server-side PDFs (headless Chrome) only if reports must be emailed or scheduled; `window.print()` can't do that.

### 4.2 Other UX
Roughly in order of value.

- [ ] **Weekly timesheet grid** (projects × days) for people who log time at the end of the week. Needs 3.1 + 3.2.
- [ ] **Forgotten-timer guard & idle time:** if the timer runs > 10h, offer to stop it at a chosen time. If the tab was
  hidden for > 30 min while the timer ran, ask on return whether to keep or drop that time (`visibilitychange`, no permissions).
- [ ] **Bulk edit:** select several entries → change project / task / billable / tags, or delete them. Needs 3.1.
- [ ] **Description autocomplete** from recent entries; picking one fills project/task/tags (Resume already does half of this,
  which is why "favorite entries" isn't a separate feature).
- [ ] **Undo toast** instead of `window.confirm` on delete.
- [ ] **Hash routing** (`#/insights`) so back button and links work; the page currently lives only in `localStorage`.
- [ ] **Retry button** on the full-page "Can't reach the WorkPulse API" error (`services.jsx`).
- [ ] **Decimal display toggle** (`7:30` ↔ `7.50`) on the Account page, kept in `localStorage`.
- [ ] **Phone layout:** the CSS only steps down at 1100px/800px; make Track (timer + today's entries) usable at 375px.
  This is the "mobile app": a responsive web app, plus a web manifest so it can be added to the home screen.
- [ ] **Calendar view** (day/week, entries as blocks by time of day; drag on an empty slot to create an entry). Shows the
  gaps in a day at a glance. Do it after the timesheet grid, and only if people ask: the two overlap.

---

## Phase 5 — Billing, planning, onboarding

### 5.1 Billable rates (with history)
- [ ] Hourly rate per project (one currency per company), optional per-member override.
- [ ] Copy the rate onto each entry when it's created or edited (`RateCents`). Changing a rate then only affects new
  entries, so past invoices never change; add an explicit "apply to entries since <date>" for corrections.
- [ ] Amounts (hours × rate) per client / project in Insights and in the PDF and CSV exports.

**Why:** there's a billable flag but no money, so invoicing is done by hand. Storing the rate on the entry is the
simplest way to get historical rates without a rates-history table.

### 5.2 Time estimates
- [ ] Optional estimate (hours) per project; Insights shows tracked vs estimate with the existing `Meter` atom and
  flags projects past 80% / over.

**Why:** catches overruns while there's still time to act, using data you already have.

### 5.3 Import users
- [ ] Admins upload a CSV (name, email, role, teams): all rows created in one transaction, per-row errors shown, nothing
  created if any row fails. Until there is email, return a generated password per user once, for the admin to hand out.

**Why:** onboarding a 50-person company one form at a time is the first thing a new admin hits.

---

## Considered, not planned

| Feature | Why not (or what covers it) |
|---|---|
| Unlimited tracking, time tracker, reports | There are no limits; the timer and Insights already exist. |
| Export & share data, customize export | PDF + CSV export (4.1) cover it; a spreadsheet does the rest. Share links only if clients ask for them. |
| Time audit | Overlap rejection (3.1), entry limits (2.2) and the impersonation flag (2.1) cover it. If billing disputes appear, log entry edits. |
| Favorite entries | Resume + description autocomplete (Phase 4). |
| Split time | Edit (3.1) + manual entry (3.2) does it; too rare for its own UI. |
| Hide time & pages | Role visibility already does this: employees only see their own time. |
| Required fields | Description, project and task are already required. A per-company "tags required" toggle only if asked. |
| Reminders (email/push) | Need an email sender and a scheduler; the forgotten-timer guard covers the common case. |
| Import time | Only when a customer migrating from Toggl/Clockify asks; then a CSV import that maps projects by name. |
| Native mobile & desktop apps | A responsive web app + manifest (Phase 4) covers it without three codebases. |
| Auto tracker | Needs a native agent recording apps and websites: a different product, and a privacy problem for employees. |
| Tracking integrations (Jira, GitHub, …) | Each one is its own project. If needed, personal API tokens first, so integrations can be built on the API. |
| Pomodoro timer | Personal productivity; doesn't improve a company's timesheets. |
| Kiosk, breaks | Clock-in/out on a shared device and labour-law breaks are attendance tracking, a different product. Log a break as a non-billable task if needed. |
| Project templates | Projects are name, client, color and billable; there's nothing to template. |

---

## Already good (keep it this way)

- Bearer tokens stored only as SHA-256; bcrypt with a 72-byte cap; dummy hash on unknown emails (no user enumeration).
- Company id always from the session, never the body; NOCASE unique indexes; FK + check constraints in SQLite.
- Deactivation instead of deletion; password change/reset and deactivation revoke sessions.
- Backend runs distroless as nonroot, not published to the host; same-origin API (no CORS, no CSRF surface with bearer headers).
- Login throttled in nginx; server timeouts and graceful shutdown set.
