# Arquitetura Base - Issue #3

## Stack travada

- Next.js 16 (App Router) + TypeScript
- Tailwind CSS
- Prisma ORM + PostgreSQL
- Neon como provedor de banco via integração da Vercel
- Autenticação fora de escopo neste bootstrap

## Estrutura de pastas

- `src/app`: rotas web e handlers de API
- `src/components`: componentes de apresentação compartilhados
- `src/lib`: infraestrutura comum (`env`, `db`)
- `src/server`: camada server-side (serviços e repositórios)
- `prisma`: schema, migrations e seed inicial
- `docs/architecture`: documentação técnica inicial

## Contratos técnicos iniciais

- `GET /api/health`
  - `200`: `{ status: "ok", db: "up" | "down" }`
- Contrato de erro API
  - `{ error: { code: string, message: string } }`

## Banco e runtime

- `src/lib/db.ts` expõe singleton de Prisma Client para evitar múltiplas conexões em dev/hot reload.
- `scripts/check-env.mjs` valida variáveis críticas no startup (`DATABASE_URL`, `DIRECT_DATABASE_URL`).
- `prisma/schema.prisma` contém os modelos base:
  - `Asset`
  - `PortfolioAsset`
  - `CeilingPrice`
  - `MarketSnapshot`
  - `RelevantDocument`
  - `AiSummary`
  - `IngestionCheckpoint`

## Execução local

1. `cp .env.example .env` e preencher credenciais Neon.
2. `npm install`
3. `npm run db:generate`
4. `npm run db:migrate`
5. `npm run db:seed`
6. `npm run dev`

## CI mínima

Workflow em `.github/workflows/ci.yml` com:

- `npm run lint`
- `npm run typecheck`
- `npm run build`

## Deploy Vercel + Neon

1. Provisionar Neon no projeto via Vercel Marketplace.
2. Confirmar `DATABASE_URL` e `DIRECT_DATABASE_URL` em Production e Preview.
3. Deploy da branch principal na Vercel.
4. Validar `GET /api/health` após deploy.
