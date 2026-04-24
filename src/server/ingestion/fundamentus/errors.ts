export class FundamentusSessionError extends Error {
  readonly code = "FUNDAMENTUS_SESSION_INVALID";

  constructor(message = "Fundamentus session is missing or invalid. Renew storageState first.") {
    super(message);
    this.name = "FundamentusSessionError";
  }
}

export class FundamentusParseError extends Error {
  readonly code = "FUNDAMENTUS_PARSE_ERROR";

  constructor(message: string) {
    super(message);
    this.name = "FundamentusParseError";
  }
}
