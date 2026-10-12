# WorkPulse

Time tracking + insights. Monolith repo: each tier lives in its own top-level folder.

```
frontend/   React (Vite) web app
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
docker compose up --build   # http://localhost:8080
```

### Structure (hexagonal + atomic design)

```
frontend/src/
  domain/          pure business logic — no React, no browser APIs (time math, grouping, reports)
  application/     ports (ports.js), DI context + use-case hooks (useTimeTracker, useInsights)
  infrastructure/  adapters implementing the ports (localStorage, seeded demo catalog)
  ui/              primary adapter
    atoms/ molecules/ organisms/ templates/ pages/
    styles/        modernist.css (design system) + app.css (WorkPulse theme/layout)
  main.jsx         composition root — the only file that picks adapters
```

Dependencies point inward: `ui → application → domain`; `infrastructure` implements `application/ports.js`.
To back the app with a real API, write a new adapter for `CatalogPort` / `StoragePort` and swap it in `main.jsx`.
