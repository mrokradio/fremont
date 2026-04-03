# Fremont API

Nest-style backend for the Fremont workspace, backed by Prisma + MySQL.

## Run

```bash
pnpm --filter @fremont/api dev
```

Default port: `4000` (override with `PORT`).

## Database workflow

```bash
pnpm db:generate
pnpm db:migrate
pnpm db:migrate:deploy
pnpm db:seed
```

## Endpoints

- `GET /health`
- `GET /auth/google/url?redirectUri=...`
- `POST /auth/google/exchange`
- `GET /auth/microsoft/url?redirectUri=...`
- `POST /auth/microsoft/exchange`
- `GET /portfolio/snapshot`
- `GET /portfolio/positions`
- `GET /portfolio/transactions`
- `GET /portfolio/dashboard`
