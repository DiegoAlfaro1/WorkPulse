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
- [ ] Backend: `PATCH /api/entries/:id` (same ownership rule as delete; same validation as create).
- [ ] Frontend: edit desc / project / task / tags / billable / start / end from `EntryRow`.

**Why:** biggest gap for a time tracker. Today a wrong time can only be deleted.

### 3.2 Manual entries
- [ ] Frontend form to add a past block (date, start, end). Backend already accepts `start`/`end`.

### 3.3 Server-side running timer
- [ ] Store the running timer on the server (e.g. an entry with null `end`, or a `running_timers` row) instead of
  `localStorage` (`frontend/src/application/useTimeTracker.js:169`).

**Why:** today it's lost on cleared storage or switching device/browser, and managers can't see who's tracking.

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

- [ ] **CSV export** of entries, using the current Insights filters (needed for invoicing billable time).
- [ ] **Forgotten-timer guard:** if the timer runs > 10h, offer to stop it at a chosen time.
- [ ] **Description autocomplete** from recent entries; picking one fills project/task/tags (Resume already does half of this).
- [ ] **Undo toast** instead of `window.confirm` on delete.
- [ ] **Hash routing** (`#/insights`) so back button and links work; the page currently lives only in `localStorage`.
- [ ] **Retry button** on the full-page "Can't reach the WorkPulse API" error (`services.jsx`).
- [ ] **Weekly timesheet grid** (projects × days) for people who log time at the end of the week.

---

## Already good (keep it this way)

- Bearer tokens stored only as SHA-256; bcrypt with a 72-byte cap; dummy hash on unknown emails (no user enumeration).
- Company id always from the session, never the body; NOCASE unique indexes; FK + check constraints in SQLite.
- Deactivation instead of deletion; password change/reset and deactivation revoke sessions.
- Backend runs distroless as nonroot, not published to the host; same-origin API (no CORS, no CSRF surface with bearer headers).
- Login throttled in nginx; server timeouts and graceful shutdown set.
