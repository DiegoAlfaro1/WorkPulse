# WorkPulse

Time tracking + insights. Monolith repo: each tier lives in its own top-level folder.

```
frontend/   React (Vite) web app
backend/    Go (Gin) HTTP API
```

## Frontend

```
cd frontend
npm install
npm run dev     # local dev server
npm test        # domain unit tests (node --test)
npm run build
```

Docker (multi-stage: tests + build on Node, served by nginx), from the repo root:

```
docker compose up --build   # https://localhost (Caddy: TLS → nginx: app + /api proxy → backend)
docker compose up --watch   # same, plus rebuilds a service when its folder changes (tests run on each rebuild)
```

Only Caddy is published (ports 80/443; http redirects to https). Set `DOMAIN` in `.env` to a public hostname for a
Let's Encrypt cert (and HSTS); the default `localhost` uses Caddy's own CA, so the browser warns. nginx adds a CSP and
other security headers. The `backup` service copies the database to `./backups/` once a day (keeps 14 days).

### Structure (hexagonal + atomic design)

```
frontend/src/
  domain/          pure business logic — no React, no browser APIs (time math, grouping, reports)
  application/     ports (ports.js), DI context + use-case hooks (useTimeTracker, useInsights)
  infrastructure/  adapters implementing the ports (API with bearer-token session, localStorage, static task list)
  ui/              primary adapter
    atoms/ molecules/ organisms/ templates/ pages/
    styles/        modernist.css (design system) + app.css (WorkPulse theme/layout)
  main.jsx         composition root — the only file that picks adapters
```

Dependencies point inward: `ui → application → domain`; `infrastructure` implements `application/ports.js`.
To back the app with a real API, write a new adapter for `CatalogPort` / `StoragePort` and swap it in `main.jsx`.

## Backend

```
cd backend
go run .        # http://localhost:8080; `npm run dev` proxies /api here
go test ./...
```

Config (env vars): `PORT` (default `8080`), `DB_PATH` (default `workpulse.db`), `GIN_MODE` (`release` in Docker),
`SUPERADMIN_EMAIL` + `SUPERADMIN_PASSWORD` (create the super admin on first start; required until one exists, ignored after).
With Docker, put the two `SUPERADMIN_*` values in a `.env` file at the repo root (gitignored); compose passes them through.
After the first start, remove `SUPERADMIN_PASSWORD` from `.env` and change it in the app (env values show in `docker inspect`).

SQLite through GORM with `github.com/glebarez/sqlite` (pure Go, no CGO), opened in WAL mode with foreign keys on.
The schema comes from the models in `models.go` via `AutoMigrate` at startup (adds tables/columns/indexes only).
In Docker the database lives in the `data` volume at `/data/workpulse.db`. The backend isn't published
to the host; the browser reaches it only through nginx at `/api`, so no CORS is needed.

Flat `package main`: `main.go` (config, server, graceful shutdown), `db.go` (connection + migration), `models.go` (GORM models, also the JSON shapes), `router.go` (routes under `/api`), `auth.go` (sessions, login, super admin), `users.go` (users, teams, companies, who-sees-whom), `catalog.go` (projects, tags), `entries.go` (time entries).
`GET /api/health` pings the DB and returns `{"status":"ok"}` (503 if the DB is unavailable).

### Users and permissions

Roles (see `documentation/users.md`): one **super admin** (seeded from env, can't be deleted, never listed), and per company
**admins** (whole company), **managers** (themselves + everyone in their teams) and **employees** (only themselves).
Users can be in several teams; a manager manages every team they're in. Projects and tags are shared by the whole company.
Every company's data is isolated: company ids always come from the session, never from a request body.
Nothing is deleted: users and companies are **deactivated** (signed out, can't sign in or be impersonated) and keep all their
time entries, which still count in reports. They can be reactivated.

Auth: `POST /api/auth/login` returns an opaque bearer token (128 random bits, stored only as a SHA-256 hash, valid 7 days).
Send it as `Authorization: Bearer <token>` on every other route; without a valid one they answer 401.
Passwords are bcrypt-hashed, 8–72 bytes. nginx throttles logins and password changes to 10/minute per IP (burst 5, shared).
Bad request bodies get a 400 naming the JSON field (`{"error":"task is required"}`).

| Route | Who | Body | Notes |
|---|---|---|---|
| `POST /api/auth/login` | anyone | `{"email","password"}` | `{"token","expiresAt","user"}`; 401 on a wrong email or password (same answer for both); 403 if deactivated (only after a correct password) |
| `GET /api/auth/me` | signed in | | `{"user","impersonating"}` |
| `POST /api/auth/logout` | signed in | | 204; revokes this token only |
| `POST /api/auth/password` | signed in | `{"current","new"}` | 204; 403 on a wrong current password; signs out every other session |
| `POST /api/auth/impersonate` | super admin | `{"user"}` | a token for that user, flagged `impersonating`, valid 1 hour; logged in `impersonation_logs`, and entries created with it record the super admin (`impersonator_id`, not in the API) |
| `GET /api/companies` · `POST /api/companies` | super admin | `{"name","admin":{"name","email","password"}}` | creates the company and its first admin together |
| `POST /api/companies/:id/deactivate` · `/activate` | super admin | | deactivating signs out everyone in it |
| `GET /api/users` | signed in | | the users the caller may see (deactivated ones included, `"active":false`), with `teams`; super admin: everyone |
| `POST /api/users` | admin, manager | `{"name","email","password","role","teams"}` | managers: only `employee`s, in their own teams; 409 if the email exists |
| `PATCH /api/users/:id` | admin, manager | any of `{"name","role","password","teams"}` | managers: only `teams`, only their own teams of an employee (others are kept); admins can't change their own role; a new password signs the user out |
| `POST /api/users/:id/deactivate` · `/activate` | admin, manager | | entries are kept; deactivating signs them out; nobody deactivates themselves; managers only employees who are in no other team |
| `GET /api/teams` | company user | | admins: all teams; others: their own |
| `POST /api/teams` · `PATCH /api/teams/:id` · `DELETE /api/teams/:id` | admin | `{"name"}` | create / rename; deleting a team keeps its members |

### Time data (company users)

| Route | Body | Notes |
|---|---|---|
| `GET /api/projects` | | ordered by id |
| `POST /api/projects` | `{"name","client","billable","color"}` | 201 with `id`; 409 if name+client exists (case-insensitive); 400 on empty name or non-hex color |
| `GET /api/tags` | | ordered by name |
| `POST /api/tags` | `{"name"}` | leading `#` stripped, no spaces; 409 if it exists (case-insensitive) |
| `GET /api/entries` | | entries of every user the caller may see, newest first; `member` is the user id; `tags` as `[{"id","name"}]` |
| `POST /api/entries` | `{"project","task","desc","tags","billable","start","end"}` | always recorded for the caller; `desc` required; `tags` as `[{"name"}]` (existing tags only); times in Unix ms, `end > start`, at most 24 h long, ending no later than now + 5 min; 400 on unknown project/tag |
| `DELETE /api/entries/:id` | | own entries (admins: anyone's in the company); 204; 404 otherwise |
