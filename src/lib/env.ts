const requiredEnvironmentVariables = ["DATABASE_URL", "DIRECT_DATABASE_URL"] as const;

export type RequiredEnvKey = (typeof requiredEnvironmentVariables)[number];

export function getRequiredEnv(name: RequiredEnvKey): string {
  const value = process.env[name];

  if (!value || value.trim().length === 0) {
    throw new Error(
      `Missing required environment variable: ${name}. Copy .env.example and set the value.`,
    );
  }

  return value;
}

export function assertCriticalEnvVariables(): void {
  requiredEnvironmentVariables.forEach((name) => {
    getRequiredEnv(name);
  });
}
