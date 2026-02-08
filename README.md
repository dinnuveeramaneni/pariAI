# Insight Workspace (MVP)

Web-only multi-tenant analytics workspace inspired by Adobe CJA interaction patterns:

- Projects -> Panels -> Freeform Table + Visualizations
- Left components rail (Dimensions, Metrics, Segments, Date Ranges)
- Drag-and-drop Dimensions/Metrics into table rows/columns with immediate query updates

## Stack

- Next.js (App Router) + React + TypeScript
- Tailwind CSS
- Prisma + PostgreSQL
- Auth.js (NextAuth Credentials, optional Google OAuth)
- Zustand (workspace state)
- dnd-kit (drag/drop)
- TanStack Table + virtualization
- Vega-Lite charts (via `react-vega`)

## Why Vega-Lite

Vega-Lite is declarative and data-oriented, which is a good fit for analytics surfaces where charts are tightly coupled to query output and need consistent JSON configuration.

## Getting started

1. Copy `.env.example` to `.env`
2. Run dependencies:
   - `npm install`
3. Generate Prisma client + run migrations:
   - `npm run db:migrate`
4. Seed data:
   - `npm run db:seed`
5. Start:
   - `npm run dev`

### Optional local auth bypass

For fast local UI development without login:

- `AUTH_BYPASS=1`
- `NEXT_PUBLIC_AUTH_BYPASS=1`
- `E2E_TEST_MODE=1` (uses in-memory data adapter, no Postgres required)

## Scripts

- `npm run lint`
- `npm run format`
- `npm run typecheck`
- `npm run test`
- `npm run test:e2e`
- `npm run db:migrate`
- `npm run db:seed`

## Required routes

- `/projects`
- `/workspace/[projectId]`
- `/settings/api-keys`
- `/org`

## CI

GitHub Actions workflow is in `.github/workflows/ci.yml` and runs lint, typecheck, and unit tests on PRs.
