import { createFundamentusRunner } from "@/server/ingestion/fundamentus";
import type { CollectorMode } from "@/server/ingestion/fundamentus/types";

function parseMode(): CollectorMode {
  const modeArg = process.argv.find((arg) => arg.startsWith("--mode="));
  const modeValue = modeArg?.split("=")[1];

  if (modeValue === "bootstrap") {
    return "bootstrap";
  }

  return "incremental";
}

async function main() {
  const mode = parseMode();
  const runner = createFundamentusRunner();
  const result = await runner.run({ mode });

  console.log(
    JSON.stringify(
      {
        runId: result.runId,
        mode: result.mode,
        status: result.status,
        stats: result.stats,
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
