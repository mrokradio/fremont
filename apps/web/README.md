# Fremont App

Next.js + React + TypeScript frontend for the Fremont workspace.

## Prerequisites
- Node.js 20 LTS
- pnpm 9+

## Setup

```bash
pnpm install
pnpm --filter @fremont/web dev
```

Then open the printed local URL (default `http://localhost:3000`).

## Scripts
- `pnpm --filter @fremont/web dev`: Start dev server with HMR
- `pnpm --filter @fremont/web build`: Build for production
- `pnpm --filter @fremont/web start`: Run production server
- `pnpm --filter @fremont/web typecheck`: Run TypeScript typecheck

## Notes
- Tailwind is configured in `tailwind.config.ts` with content scanning for `src/app/**/*.{ts,tsx}` and `src/**/*.{ts,tsx}`.
- Shared domain contracts are provided by `@fremont/shared` and re-exported in `src/types/models.ts`.
- `src/lib/api.ts` points to `NEXT_PUBLIC_API_BASE_URL` (default `http://127.0.0.1:4000`).
