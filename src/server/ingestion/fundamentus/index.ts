import { FundamentusClient } from "@/server/ingestion/fundamentus/client";
import { getFundamentusConfig } from "@/server/ingestion/fundamentus/config";
import { FundamentusCollectorRunner } from "@/server/ingestion/fundamentus/runner";

export function createFundamentusRunner(): FundamentusCollectorRunner {
  const config = getFundamentusConfig();
  const client = new FundamentusClient(config);

  return new FundamentusCollectorRunner({
    config,
    client,
  });
}

export { renewFundamentusSession } from "@/server/ingestion/fundamentus/auth";
export { getFundamentusConfig } from "@/server/ingestion/fundamentus/config";
export { FundamentusCollectorRunner } from "@/server/ingestion/fundamentus/runner";
