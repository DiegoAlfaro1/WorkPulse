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
docker compose up --build   # http://localhost:8080 (nginx serves the app and proxies /api to the backend)
docker compose up --watch   # same, plus rebuilds a service when its folder changes (tests run on each rebuild)
```

### Structure (hexagonal + atomic design)

```
frontend/src/
  domain/          pure business logic — no React, no browser APIs (time math, grouping, reports)
  application/     ports (ports.js), DI context + use-case hooks (useTimeTracker, useInsights)
  infrastructure/  adapters implementing the ports (localStorage, static task/tag catalog)
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

Config (env vars): `PORT` (default `8080`), `DB_PATH` (default `workpulse.db`), `GIN_MODE` (`release` in Docker).

SQLite through GORM with `github.com/glebarez/sqlite` (pure Go, no CGO), opened in WAL mode with foreign keys on.
The schema comes from the models in `models.go` via `AutoMigrate` at startup (adds tables/columns/indexes only).
In Docker the database lives in the `data` volume at `/data/workpulse.db`. The backend isn't published
to the host; the browser reaches it only through nginx at `/api`, so no CORS is needed.

Flat `package main`: `main.go` (config, server, graceful shutdown), `db.go` (connection + migration), `models.go` (GORM models, also the JSON shapes), `router.go` (routes under `/api`), `catalog.go` (projects, tags), `entries.go` (time entries).
`GET /api/health` pings the DB and returns `{"status":"ok"}` (503 if the DB is unavailable).

| Route | Body | Notes |
|---|---|---|
| `GET /api/projects` | | ordered by id |
| `POST /api/projects` | `{"name","client","billable"}` | 201 with `id`; 409 if name+client exists (case-insensitive); 400 on empty name |
| `GET /api/tags` | | ordered by name |
| `POST /api/tags` | `{"name"}` | leading `#` stripped, no spaces; 409 if it exists (case-insensitive) |
| `GET /api/entries` | | newest first; `tags` as `[{"id","name"}]` |
| `POST /api/entries` | `{"member","project","task","desc","tags","billable","start","end"}` | `tags` as `[{"name"}]` (existing tags only); times in Unix ms, `end > start`; 400 on unknown project/tag |
| `DELETE /api/entries/:id` | | 204; 404 if it doesn't exist; its tag links are removed too |
