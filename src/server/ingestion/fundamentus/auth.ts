import fs from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { chromium } from "playwright";
import type { FundamentusConfig } from "@/server/ingestion/fundamentus/config";

export async function renewFundamentusSession(config: FundamentusConfig): Promise<{ storageStatePath: string }> {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(`${config.baseUrl}/fr.php`, {
    timeout: config.requestTimeoutMs,
    waitUntil: "domcontentloaded",
  });

  const prompt = createInterface({ input: stdin, output: stdout });
  try {
    await prompt.question(
      "Complete any anti-bot challenge in the opened browser and press Enter to persist storageState...",
    );
  } finally {
    prompt.close();
  }

  await fs.promises.mkdir(path.dirname(config.storageStatePath), { recursive: true });
  await context.storageState({ path: config.storageStatePath });

  await browser.close();

  return { storageStatePath: config.storageStatePath };
}
