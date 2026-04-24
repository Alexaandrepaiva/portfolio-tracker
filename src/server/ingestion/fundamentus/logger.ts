export function logFundamentus(event: string, payload: Record<string, unknown>) {
  const message = {
    component: "fundamentus_ingestion",
    event,
    ...payload,
  };

  console.log(JSON.stringify(message));
}
