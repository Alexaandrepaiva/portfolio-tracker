import { getDbClient } from "@/lib/db";

export async function checkDatabaseConnection(): Promise<"up" | "down"> {
  try {
    await getDbClient().$queryRaw`SELECT 1`;
    return "up";
  } catch {
    return "down";
  }
}
