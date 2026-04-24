import fs from "node:fs";
import path from "node:path";

const requiredVariables = ["DATABASE_URL", "DIRECT_DATABASE_URL"];

const envFilePath = path.resolve(process.cwd(), ".env");
if (fs.existsSync(envFilePath)) {
  const envLines = fs.readFileSync(envFilePath, "utf8").split(/\r?\n/);
  for (const line of envLines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const equalIndex = trimmed.indexOf("=");
    if (equalIndex <= 0) {
      continue;
    }
    const key = trimmed.slice(0, equalIndex).trim();
    let value = trimmed.slice(equalIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

const missing = requiredVariables.filter((key) => {
  const value = process.env[key];
  return !value || value.trim().length === 0;
});

if (missing.length > 0) {
  console.error(
    `Missing required environment variables: ${missing.join(", ")}. Copy .env.example and fill values.`,
  );
  process.exit(1);
}
