import { getFundamentusConfig, renewFundamentusSession } from "@/server/ingestion/fundamentus";

async function main() {
  const config = getFundamentusConfig();
  const output = await renewFundamentusSession(config);

  console.log(
    JSON.stringify(
      {
        status: "session_saved",
        storageStatePath: output.storageStatePath,
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
