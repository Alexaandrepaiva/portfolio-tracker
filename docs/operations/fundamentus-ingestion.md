# Fundamentus Ingestion Runbook (v1)

## Scope

- Source: `https://www.fundamentus.com.br/fr.php` and ticker facts pages.
- Persists only metadata in `RelevantDocument` (no PDF download in v1).
- Modes:
  - `bootstrap`: last `FUNDAMENTUS_BOOTSTRAP_DAYS` days + hard cap `FUNDAMENTUS_BOOTSTRAP_DOC_LIMIT`.
  - `incremental`: uses per-ticker checkpoints and only ingests new rows.

## Environment

Required for ingestion flows:

- `INGESTION_JOB_SECRET`
- `FUNDAMENTUS_BASE_URL`
- `FUNDAMENTUS_STORAGE_STATE_PATH`
- `FUNDAMENTUS_REQUEST_TIMEOUT_MS`
- `FUNDAMENTUS_RATE_LIMIT_MS`
- `FUNDAMENTUS_BOOTSTRAP_DAYS`
- `FUNDAMENTUS_BOOTSTRAP_DOC_LIMIT`
- `FUNDAMENTUS_ACTIONS_SUFFIX11_EXCEPTIONS`

## 1) Renew Anti-bot Session

```bash
npm run ingest:fundamentus:auth
```

Steps:

1. A headed browser opens in Fundamentus.
2. Complete challenge manually if requested.
3. Press Enter in terminal.
4. Storage state is saved to `FUNDAMENTUS_STORAGE_STATE_PATH`.

If missing/invalid storage state, jobs fail with `FUNDAMENTUS_SESSION_INVALID`.

## 2) Manual Bootstrap

```bash
npm run ingest:fundamentus -- --mode=bootstrap
```

Expected outcome:

- Stops at 30-day window (default) and 100 inserted docs (default).
- Creates placeholder `Asset` (`name=ticker`, `exchange=B3`, inferred `type`) when missing.
- Creates `RelevantDocument` with deterministic `externalSourceId`.

## 3) Manual Incremental

```bash
npm run ingest:fundamentus -- --mode=incremental
```

Expected outcome:

- Uses per-ticker checkpoint (`fundamentus:ticker:<TICKER>`).
- Inserts only new rows, skipping duplicates.

## 4) Administrative Endpoint

### POST

```bash
curl -X POST "http://localhost:3000/api/admin/ingestion/fundamentus/run" \
  -H "Content-Type: application/json" \
  -H "x-ingestion-key: $INGESTION_JOB_SECRET" \
  -d '{"mode":"bootstrap"}'
```

### GET (cron-friendly)

```bash
curl "http://localhost:3000/api/admin/ingestion/fundamentus/run?mode=incremental" \
  -H "x-ingestion-key: $INGESTION_JOB_SECRET"
```

The endpoint also accepts `Authorization: Bearer <INGESTION_JOB_SECRET>` for cron integrations.

## 5) Daily Schedule

- Configured in `vercel.json`:
  - `0 10 * * *` (UTC)
  - Calls `/api/admin/ingestion/fundamentus/run?mode=incremental`.

## 6) Structured Logs and Diagnostics

Logs include:

- `runId`, `mode`, `ticker`, `page`
- `documents_found`, `documents_inserted`, `documents_skipped`, `errors`

Common errors:

- `FUNDAMENTUS_SESSION_INVALID`: renew storage state (`ingest:fundamentus:auth`).
- `FUNDAMENTUS_PARSE_ERROR`: HTML changed or unsupported page shape.
- timeouts/network issues: increase `FUNDAMENTUS_REQUEST_TIMEOUT_MS` and retry.
