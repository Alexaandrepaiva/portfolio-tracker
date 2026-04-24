# Portfolio Tracker

Base architecture for the MVP focused on Brazilian stocks (`Acoes`) and FIIs.

## MVP surfaces

- `Home`: quotes, ceiling price, margin of safety, daily change, and asset management.
- `Fatos Relevantes`: filtered feed of AI-processed documents per asset.

## Tech stack

- Next.js (App Router) + TypeScript
- Tailwind CSS
- Prisma + PostgreSQL (Neon)

## Initial routes

- `GET /api/health`
- `POST /api/admin/ingestion/fundamentus/run`
- `/`
- `/fatos-relevantes`

## Environment

Copy `.env.example` to `.env` and set credentials/secrets:

- `DATABASE_URL`
- `DIRECT_DATABASE_URL`
- `INGESTION_JOB_SECRET`

## Scripts

- `npm run dev`
- `npm run build`
- `npm run start`
- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run db:generate`
- `npm run db:migrate`
- `npm run db:seed`
- `npm run ingest:fundamentus -- --mode=bootstrap|incremental`
- `npm run ingest:fundamentus:auth`

## Architecture docs

- `docs/architecture/bootstrap.md`
- `docs/operations/fundamentus-ingestion.md`
