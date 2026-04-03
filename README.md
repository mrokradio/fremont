# Fremont System v2 (Workspace)

Monorepo scaffold aligned to the `codex-test` architecture:

- `apps/web`: Fremont frontend (Next.js + React + TypeScript)
- `apps/api`: Fremont backend (Nest-style service with Prisma)
- `packages/shared`: shared contracts/types used by web + api

## Financial Core Blueprint

Architecture and migration plan for centralized data capture, planning, and reporting:

- `docs/financial-core-architecture.md`

## Prerequisites

- Node 20 LTS (`.nvmrc`)
- pnpm 9+

## Setup

```bash
cp .env.example .env
docker compose -f infra/docker-compose.yml up -d
pnpm install
pnpm db:migrate
pnpm db:generate
pnpm db:seed
```

## Run

```bash
pnpm dev
```

- Web: `http://localhost:3000`
- API: `http://localhost:4000`

## Production Notes

- Use `pnpm db:migrate:deploy` for hosted environments (for example Azure), not `pnpm db:migrate`.
- Set `CORS_ALLOWED_ORIGINS` to your deployed web origins (comma-separated, origin only).

## Auth and Roles

- Auth endpoint: `POST /auth/login`
- Google OAuth URL endpoint: `GET /auth/google/url?redirectUri=https://your-app/callback`
- Google OAuth exchange endpoint: `POST /auth/google/exchange`
- Microsoft OAuth URL endpoint: `GET /auth/microsoft/url?redirectUri=https://your-app/callback`
- Microsoft OAuth exchange endpoint: `POST /auth/microsoft/exchange`
- Current user endpoint: `GET /auth/me`
- Seeded users (from `.env`):
  - `admin@fremont.local` / `ChangeMe123!` (`ADMIN`)
  - `analyst@fremont.local` / `ChangeMe123!` (`ANALYST`)
  - `viewer@fremont.local` / `ChangeMe123!` (`VIEWER`)
- Protected endpoints use `Authorization: Bearer <token>`.
- Google OAuth env configuration:
  - `NEXT_PUBLIC_OAUTH_REDIRECT_URI` (recommended shared redirect URI for OAuth providers, e.g. `http://localhost:3000/`)
  - `NEXT_PUBLIC_GOOGLE_REDIRECT_URI` (must exactly match a Google OAuth Authorized redirect URI, e.g. `http://localhost:3000/`)
  - `OAUTH_GOOGLE_CLIENT_ID`
  - `OAUTH_GOOGLE_CLIENT_SECRET`
  - `OAUTH_GOOGLE_ALLOWED_REDIRECT_ORIGINS` (comma-separated origins, e.g. `http://localhost:3000`)
  - `OAUTH_GOOGLE_DEFAULT_ROLE` (`VIEWER` by default for first-time Google users)
  - `OAUTH_STATE_SECRET` (optional; falls back to `JWT_SECRET`)
- Microsoft/Entra OAuth env configuration:
  - `OAUTH_MICROSOFT_CLIENT_ID`
  - `OAUTH_MICROSOFT_CLIENT_SECRET`
  - `OAUTH_MICROSOFT_TENANT_ID` (`common`, `organizations`, `consumers`, or a tenant GUID)
  - `OAUTH_MICROSOFT_ALLOWED_REDIRECT_ORIGINS` (comma-separated origins, e.g. `http://localhost:3000`)
  - `OAUTH_MICROSOFT_DEFAULT_ROLE` (`VIEWER` by default for first-time Microsoft users)
- API runtime env configuration:
  - `CORS_ALLOWED_ORIGINS` (comma-separated allowed browser origins; required in production)
- OAuth network troubleshooting (`fetch failed` during code exchange):
  - Ensure API host can reach `https://oauth2.googleapis.com` and `https://login.microsoftonline.com`.
  - In corporate networks, set `NODE_USE_ENV_PROXY=1` and `HTTPS_PROXY=http://proxy-host:proxy-port` for the API process.
  - Keep `NO_PROXY=localhost,127.0.0.1` so local API/web traffic is not routed through the proxy.

## API Endpoints

Public read endpoints:

- `GET /health`
- `GET /portfolio/snapshot`
- `GET /portfolio/positions`
- `GET /portfolio/transactions`
- `GET /portfolio/dashboard`

Protected portfolio write endpoints (`ADMIN`, `ANALYST`):

- `POST /portfolio/positions`
- `PUT /portfolio/positions/:id`
- `DELETE /portfolio/positions/:id`
- `POST /portfolio/transactions`
- `PUT /portfolio/transactions/:id`
- `DELETE /portfolio/transactions/:id`

Protected planning scenario endpoints:

- `GET /planning/scenarios` (`ADMIN`, `ANALYST`, `VIEWER`)
- `POST /planning/scenarios` (`ADMIN`, `ANALYST`)
- `PUT /planning/scenarios/:id` (`ADMIN`, `ANALYST`)
- `DELETE /planning/scenarios/:id` (`ADMIN`, `ANALYST`)

Protected projection endpoint:

- `GET /projection/scenarios/:id` (`ADMIN`, `ANALYST`, `VIEWER`)

Integrated workspace/reporting endpoints:

- `GET /financial/workspace?year=YYYY` (`ADMIN`, `ANALYST`, `VIEWER`) - canonical model snapshot for capture/plan/report
- `GET /reporting/facts?year=YYYY` (`ADMIN`, `ANALYST`, `VIEWER`) - year-level plan vs actual facts and data quality warnings
- `GET /reporting/scenarios/compare?baselineId=:id&comparisonId=:id` (`ADMIN`, `ANALYST`, `VIEWER`) - baseline vs scenario deltas

Protected strategy reporting endpoints:

- `GET /reporting/strategies` (`ADMIN`, `ANALYST`, `VIEWER`)
- `PUT /reporting/strategies` (`ADMIN`, `ANALYST`) - updates Fremont strategy capital in position rows
- `GET /reporting/strategies/benchmarks` (`ADMIN`, `ANALYST`, `VIEWER`) - global strategy percentage assumptions
- `PUT /reporting/strategies/benchmarks` (`ADMIN`) - updates global strategy percentage assumptions

Protected financial profile endpoints:

- `GET /financial/profile` (`ADMIN`, `ANALYST`, `VIEWER`)
- `PUT /financial/profile` (`ADMIN`, `ANALYST`)

Protected planning cashflow endpoints:

- `GET /cashflows` (`ADMIN`, `ANALYST`, `VIEWER`)
- `PUT /cashflows` (`ADMIN`, `ANALYST`)

Protected user management endpoints (`ADMIN`):

- `GET /users`
- `POST /users`
- `PATCH /users/:id/role`
- `PATCH /users/:id/password`

Authenticated profile endpoints (`ADMIN`, `ANALYST`, `VIEWER`):

- `GET /users/me/profile` - returns contact info + linked account associations
- `PATCH /users/me/profile/contact` - updates contact information
- `POST /users/me/profile/associations` - links a Google or Microsoft account association
- `DELETE /users/me/profile/associations/:id` - removes an account association (password association is protected)

Protected ingestion endpoints (`ADMIN`, `ANALYST`):

- `POST /ingest/positions`
- `POST /ingest/transactions`

Each ingest endpoint accepts:

```json
{
  "csv": "name,assetClass,value,liquid\nExample,Public Equity,1000000,true",
  "dryRun": true,
  "mode": "append"
}
```

- `dryRun=true` validates and previews import rows without writing data.
- `mode` can be `append` or `replace`.
