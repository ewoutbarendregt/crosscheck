# CrossCheck Monorepo

CrossCheck is a monorepo containing the web UI, API, worker services, infrastructure templates, and documentation.

## Prerequisites

- Node.js 20+
- npm 10+

## Local Development

Install dependencies at the repo root:

```bash
npm install
```

Run each service in its own terminal:

```bash
npm run dev:web
npm run dev:api
npm run dev:worker
```

### Service ports

- Web: http://localhost:3000
- API: http://localhost:4000

## Repository layout

- `web/` – Next.js application (TypeScript)
- `api/` – Fastify API (TypeScript)
- `worker/` – Node.js async workers (TypeScript)
- `infra/` – Bicep infrastructure templates
- `docs/` – Architecture, security, compliance, and operational runbooks
